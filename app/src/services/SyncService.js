/**
 * @fileoverview Service de synchronisation cloud pour Bulletin AI.
 * Architecture provider-agnostic permettant Google Drive, Dropbox, etc.
 * 
 * @module services/SyncService
 */

import { userSettings, runtimeState } from '../state/State.js';
import { StorageManager } from '../managers/StorageManager.js';
import { SettingsModalListeners } from '../managers/listeners/SettingsModalListeners.js';
import { APP_VERSION } from '../config/Config.js';
import { bus, EVENTS } from '../core/EventBus.js';
import { Utils } from '../utils/Utils.js';

/** @type {boolean} Enable debug logs (set to false for production) */
const DEBUG = false;

/**
 * Providers disponibles (seront chargés dynamiquement)
 */
const PROVIDERS = {
    google: () => import('./providers/GoogleDriveProvider.js').then(m => m.GoogleDriveProvider),
};

/**
 * Service central de synchronisation.
 * Gère l'état de sync, les providers, et la résolution de conflits.
 */
export const SyncService = {
    // =========================================================================
    // STATE
    // =========================================================================

    /** @type {'idle'|'syncing'|'error'} */
    status: 'idle',

    /** @type {string|null} Current provider name */
    currentProviderName: null,

    /** @type {Object|null} Current provider instance */
    _provider: null,

    /** @type {number|null} Last successful sync timestamp (Local) */
    lastSyncTime: null,

    /** @type {number|null} Last remote modification timestamp (Cloud) */
    remoteSyncTime: null,

    // Auto-sync variables removed to enforce Manual-Only paradigm

    /** @type {Function[]} Listeners for status changes */
    _statusListeners: [],

    /** @type {boolean} Current network connectivity state */
    _isOnline: true,

    /** @type {boolean} Whether a cloud provider was previously configured */
    _wasConfigured: false,

    /** @type {'connected'|'expired'|'syncing'|'local'|'disconnected'} Last UI indicator state */
    _indicatorState: 'local',

    /** @type {Function|null} Unsubscribe handler for EventBus tab sync */
    _tabSyncUnsubscribe: null,



    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    /**
     * Initialize sync service from saved settings.
     */
    async init() {
        // Load saved provider preference
        const savedProvider = localStorage.getItem('bulletin_sync_provider');
        this.lastSyncTime = parseInt(localStorage.getItem('bulletin_last_sync')) || null;
        this._isOnline = navigator.onLine;
        this._wasConfigured = Boolean(savedProvider && PROVIDERS[savedProvider]);

        // Start network and token monitoring
        this._startMonitoring();

        // OFFLINE GUARD: Skip connect() entirely when offline.
        // Loading Google API scripts from CDN would hang indefinitely.
        if (!this._isOnline) {
            this._updateCloudIndicator('local');
            return;
        }

        if (savedProvider && PROVIDERS[savedProvider]) {
            try {
                const connected = await this.connect(savedProvider, { silent: true });
                if (!connected) {
                    this._updateCloudIndicator(this._isOnline ? 'expired' : 'local');
                }
            } catch (e) {
                console.warn('[SyncService] Could not restore provider:', e.message);
                this._updateCloudIndicator('expired');
            }
        } else {
            this._updateCloudIndicator('local');
        }
    },

    /**
     * Start monitoring network connectivity.
     * @private
     */
    _startMonitoring() {
        // Listen for online/offline events
        window.addEventListener('online', () => this._handleNetworkChange(true));
        window.addEventListener('offline', () => this._handleNetworkChange(false));

        // Listen for multi-tab state sync events via EventBus to refresh cloud indicator
        if (!this._tabSyncUnsubscribe) {
            this._tabSyncUnsubscribe = bus.on(EVENTS.TAB_SYNC_RECEIVED, () => {
                this.refreshLocalIndicator();
            });
        }

        // Background token check removed to prevent "popups" and interruptions
        // The user will be prompted to reconnect only when they interact (Save/Load).
    },

    /**
     * Handle network connectivity changes.
     * @param {boolean} isOnline - Whether the browser is online
     * @private
     */
    _handleNetworkChange(isOnline) {
        const wasOnline = this._isOnline;
        this._isOnline = isOnline;

        if (!isOnline) {
            if (this._wasConfigured || this.currentProviderName) {
                this._updateCloudIndicator('local');
            }
        } else if (!wasOnline && isOnline) {
            // Came back online - restore status silently
            if (this.currentProviderName && this._provider && this._provider.isConnected()) {
                this._updateCloudIndicator('connected');
            } else if (this._wasConfigured || this.currentProviderName) {
                this.refreshStatus();
            }
        }
    },

    // _checkTokenValidity and _trySilentRefresh removed to prevent interruptions.
    // Connection is now fully manual or checked only on explicit user action.

    /**
     * Refresh the full sync status (local hash comparison + remote metadata fetch).
     * Concurrent callers share the in-flight check so that none acts on a stale state.
     * @param {Object} [options]
     * @param {boolean} [options.showChecking=false] - Display a checking spinner in the menu when no state is known yet
     * @returns {Promise<string>} Current sync state
     */
    refreshStatus(options = {}) {
        if (!this._statusCheck) {
            this._statusCheck = this._refreshStatus(options).finally(() => {
                this._statusCheck = null;
            });
        } else if (options.showChecking && this.isConnected()) {
            this._showCheckingHint();
        }
        return this._statusCheck;
    },

    /**
     * @param {Object} options - See refreshStatus()
     * @returns {Promise<string>}
     * @private
     */
    async _refreshStatus(options) {
        const { showChecking = false } = options;
        const savedProvider = this.currentProviderName || localStorage.getItem('bulletin_sync_provider');
        if (!savedProvider || !this._isOnline) {
            this._updateCloudIndicator('local');
            return 'local';
        }

        // Always re-read lastSyncTime from localStorage
        this.lastSyncTime = parseInt(localStorage.getItem('bulletin_last_sync') || '0') || null;

        // Auto-reconnect silently if not connected but configured and online
        if (!this.isConnected() && this._isOnline) {
            try {
                await this.connect(savedProvider, { silent: true, skipStatusCheck: true });
            } catch {
                /* Silent connect failure */
            }
        }

        if (!this.isConnected()) {
            this._updateCloudIndicator(this._isOnline ? 'expired' : 'local');
            return this._isOnline ? 'expired' : 'local';
        }

        if (showChecking) {
            this._showCheckingHint();
        }

        // Check remote with timeout protection (4s)
        try {
            const metaPromise = this._provider?.getMetadata?.() || Promise.resolve(null);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
            const meta = await Promise.race([metaPromise, timeoutPromise]);

            if (meta && meta.lastModified) {
                this.remoteSyncTime = new Date(meta.lastModified).getTime();
            }
            this._updateCloudIndicator('connected');
        } catch (e) {
            console.warn('[SyncService] Failed to check remote status:', e);
            if (this._provider?.needsReconnect?.() || e?.isAuthError || !this.isConnected()) {
                this._updateCloudIndicator('expired');
                return 'expired';
            } else {
                this._updateCloudIndicator('connected');
            }
        }

        return this._lastSyncState || 'in-sync';
    },

    /**
     * Check remote file status (delegates to refreshStatus).
     */
    async checkRemoteStatus() {
        return this.refreshStatus();
    },

    /**
     * Re-evaluates local sync state and updates the header/menu cloud indicators
     * without making network requests. Called when local data changes.
     */
    refreshLocalIndicator() {
        if (!this._wasConfigured || !this._isOnline) return;
        const state = this.isConnected() ? 'connected' : (this._indicatorState === 'syncing' ? 'syncing' : 'expired');
        this._updateCloudIndicator(state);
    },

    /**
     * Update the cloud sync indicator in the menu.
     * @param {'connected'|'expired'|'syncing'|'local'|'disconnected'} state
     * @private
     */
    _updateCloudIndicator(state) {
        this._indicatorState = state;
        const saveBtn = document.getElementById('cloudSaveMenuBtn');
        const loadBtn = document.getElementById('cloudLoadMenuBtn');
        const connectBtn = document.getElementById('cloudConnectBtn');
        const separator = document.getElementById('cloudSeparator');
        if (!saveBtn) return;

        const saveHint = document.getElementById('cloudSaveHint');
        const loadHint = document.getElementById('cloudLoadHint');
        const menuBtn = document.getElementById('headerMenuBtn') || window.DOM?.headerMenuBtn;

        // Reset sync state classes and hints
        saveBtn.classList.remove('cloud-action-recommended');
        loadBtn?.classList.remove('cloud-action-recommended');
        this._setHint(saveHint, null);
        this._setHint(loadHint, null);

        // --- First-time user: show only the Connect button ---
        if (!this._wasConfigured && (state === 'disconnected' || state === 'local')) {
            saveBtn.style.display = 'none';
            if (loadBtn) loadBtn.style.display = 'none';
            if (separator) separator.style.display = 'block';
            if (connectBtn) connectBtn.style.display = 'flex';
            menuBtn?.classList.remove('has-cloud-warning', 'has-cloud-reminder', 'has-cloud-conflict');
            return;
        }

        const isConnectedOrExpired = state === 'connected' || state === 'expired';
        const syncState = isConnectedOrExpired ? this._computeSyncState() : null;
        if (isConnectedOrExpired) {
            this._lastSyncState = syncState;
        }
        const needsSync = syncState === 'local-changes' || syncState === 'cloud-changes' || syncState === 'conflict';

        const config = {
            connected: {
                icon: 'solar:cloud-upload-linear',
                label: 'Sauvegarder',
                tooltip: 'Envoyer vos données vers le Cloud'
            },
            expired: {
                icon: 'logos:google-drive',
                label: 'Reconnecter',
                tooltip: 'Session expirée : cliquez pour actualiser l\'état Cloud'
            },
            syncing: {
                icon: 'ph:spinner-gap-bold',
                label: 'Sauvegarder',
                spin: true,
                tooltip: 'Synchronisation en cours…'
            },
            local: {
                icon: 'solar:cloud-upload-linear',
                label: 'Sauvegarder',
                tooltip: 'Mode hors-ligne'
            }
        };

        const currentConfig = config[state] || config.local;

        // --- Configured user: hide Connect, show Save/Load (or single Reconnect item when expired) ---
        if (connectBtn) connectBtn.style.display = 'none';
        if (separator) separator.style.display = 'block';

        saveBtn.style.display = 'flex';
        saveBtn.dataset.cloudMode = state === 'expired' ? 'reconnect' : 'save';
        saveBtn.setAttribute('data-tooltip', currentConfig.tooltip);
        if (loadBtn) loadBtn.style.display = state === 'expired' ? 'none' : 'flex';

        // Update icon
        const iconEl = saveBtn.querySelector('iconify-icon');
        if (iconEl) {
            iconEl.setAttribute('icon', currentConfig.icon);
            iconEl.classList.toggle('rotate-icon', !!currentConfig.spin);
            iconEl.style.color = '';
        }

        // Update label
        const labelEl = saveBtn.querySelector('.cloud-save-label');
        if (labelEl) {
            labelEl.textContent = currentConfig.label;
            labelEl.style.color = '';
        }

        // Only offline disables Save/Load: an expired session reconnects on click
        const isOffline = state === 'local';
        if (loadBtn) {
            loadBtn.setAttribute('data-tooltip', isOffline ? 'Mode hors-ligne' : 'Récupérer vos données depuis le Cloud');
        }
        [saveBtn, loadBtn].forEach(btn => {
            if (!btn) return;
            btn.classList.toggle('disabled', isOffline);
            btn.setAttribute('aria-disabled', String(isOffline));
        });

        // --- Sync state hints ---
        if (isConnectedOrExpired) {
            this._applySyncStateUI(syncState, saveBtn, loadBtn, saveHint, loadHint, state === 'expired');
        } else if (state === 'syncing') {
            this._setHint(saveHint, 'Envoi en cours…', 'hint-syncing');
        } else if (state === 'local') {
            this._setHint(saveHint, 'Mode hors-ligne');
        }

        // Update menu reminder dot based on syncState (animate only when an action is needed)
        if (menuBtn) {
            const isWarning = state === 'expired' && needsSync;
            const needsReminder = state === 'connected' && needsSync;
            const isConflict = state === 'connected' && syncState === 'conflict';

            menuBtn.classList.toggle('has-cloud-warning', isWarning);
            menuBtn.classList.toggle('has-cloud-reminder', !isWarning && needsReminder);
            menuBtn.classList.toggle('has-cloud-conflict', isConflict);
        }
    },

    /**
     * Show (or hide when text is null) a cloud menu hint with an optional state variant.
     * @param {HTMLElement|null} hintEl
     * @param {string|null} text
     * @param {'hint-in-sync'|'hint-syncing'|'hint-warning'|null} [variant=null]
     * @private
     */
    _setHint(hintEl, text, variant = null) {
        if (!hintEl) return;
        hintEl.textContent = text || '';
        hintEl.style.display = text ? 'block' : 'none';
        hintEl.className = variant ? `cloud-btn-hint ${variant}` : 'cloud-btn-hint';
    },

    /**
     * Display the transient checking spinner in the menu while querying remote metadata.
     * @private
     */
    _showCheckingHint() {
        const saveHint = document.getElementById('cloudSaveHint');
        const loadHint = document.getElementById('cloudLoadHint');
        if (!saveHint) return;
        document.getElementById('cloudSaveMenuBtn')?.classList.remove('cloud-action-recommended');
        document.getElementById('cloudLoadMenuBtn')?.classList.remove('cloud-action-recommended');
        saveHint.style.display = 'inline-flex';
        saveHint.className = 'cloud-btn-hint hint-syncing';
        saveHint.innerHTML = '<span class="cloud-hint-spinner"></span><span>Vérification…</span>';
        this._setHint(loadHint, null);
    },

    /** @type {Promise<string>|null} In-flight refreshStatus check shared by concurrent callers */
    _statusCheck: null,

    /** @type {string|null} Last computed sync state for use in confirmation dialogs */
    _lastSyncState: null,

    /** @private Network clock drift tolerance (ms) */
    _DRIFT_TOLERANCE_MS: 5000,

    /**
     * Construit une empreinte compacte des affectations élèves/classes pour différencier
     * un nouvel élève d'une simple inscription à un groupe ou d'un déplacement.
     * @param {Array<Object>} [results=[]]
     * @param {Array<Object>} [classes=[]]
     * @returns {{ v: number, classes: Object<string, { name: string, isGroup: boolean, isDemo: boolean }>, entries: Array<[string, string]> }}
     */
    buildRosterSnapshot(results = [], classes = []) {
        const safeResults = Array.isArray(results) ? results : [];
        const safeClasses = Array.isArray(classes) ? classes : [];

        const classesMeta = {};
        const demoClassIds = new Set();

        for (const cls of safeClasses) {
            if (!cls?.id || String(cls.id).startsWith('virtual_')) continue;
            const isDemo = cls.isDemo === true || cls.name?.toLowerCase() === 'classe exemple';
            if (isDemo) demoClassIds.add(cls.id);
            classesMeta[cls.id] = {
                name: cls.name || '',
                isGroup: Boolean(cls.isGroup || cls.type === 'group' || Utils.isGroupClassName(cls.name)),
                isDemo
            };
        }

        const entries = [];
        const seen = new Set();

        for (let i = 0; i < safeResults.length; i++) {
            const r = safeResults[i];
            if (!r) continue;
            const classId = r.classId || '';
            const identityKey = Utils.getStudentIdentityKey(r.nom, r.prenom);
            let studentKey;
            if (identityKey) {
                const scope = (classId && demoClassIds.has(classId)) ? 'demo' : 'real';
                studentKey = `${scope}:${identityKey}`;
            } else {
                studentKey = `anon:${r.id ?? i}`;
            }
            const pairKey = `${classId}\0${studentKey}`;
            if (!seen.has(pairKey)) {
                seen.add(pairKey);
                entries.push([classId, studentKey]);
            }
        }

        return { v: 1, classes: classesMeta, entries };
    },

    /**
     * Compte le nombre d'élèves uniques dans un snapshot d'effectif.
     * @param {Object|null} roster
     * @returns {number}
     */
    countRosterUniqueStudents(roster) {
        if (!roster || !Array.isArray(roster.entries)) return 0;
        const keys = new Set();
        for (const entry of roster.entries) {
            if (Array.isArray(entry) && entry[1]) keys.add(entry[1]);
        }
        return keys.size;
    },

    /**
     * Compare deux snapshots d'effectif (`baseRoster` -> `targetRoster`) et distingue :
     * - les nouveaux élèves / élèves définitivement supprimés (personnes uniques),
     * - les ajouts / retraits d'affectation à une classe ou un groupe (élèves déjà existants),
     * - les déplacements d'une classe vers une autre,
     * - les classes ou groupes créés / supprimés.
     * @param {Object|null} baseRoster
     * @param {Object|null} targetRoster
     * @returns {Object|null}
     */
    diffRoster(baseRoster, targetRoster) {
        if (!baseRoster || !targetRoster || !Array.isArray(baseRoster.entries) || !Array.isArray(targetRoster.entries)) {
            return null;
        }

        const baseClasses = baseRoster.classes || {};
        const targetClasses = targetRoster.classes || {};
        const resolveClassInfo = (id) => targetClasses[id] || baseClasses[id] || { name: id || 'Sans classe', isGroup: false, isDemo: false };

        const addedClasses = [];
        const removedClasses = [];
        const removedClassIds = new Set();

        for (const [id, info] of Object.entries(targetClasses)) {
            if (!baseClasses[id] && !info?.isDemo) {
                addedClasses.push({ id, name: info?.name || id, isGroup: Boolean(info?.isGroup) });
            }
        }
        for (const [id, info] of Object.entries(baseClasses)) {
            if (!targetClasses[id] && !info?.isDemo) {
                removedClasses.push({ id, name: info?.name || id, isGroup: Boolean(info?.isGroup) });
                removedClassIds.add(id);
            }
        }

        const baseByStudent = new Map();
        for (const entry of baseRoster.entries) {
            if (!Array.isArray(entry) || !entry[1]) continue;
            const [classId, studentKey] = entry;
            if (!baseByStudent.has(studentKey)) baseByStudent.set(studentKey, new Set());
            if (classId) baseByStudent.get(studentKey).add(classId);
        }

        const targetByStudent = new Map();
        for (const entry of targetRoster.entries) {
            if (!Array.isArray(entry) || !entry[1]) continue;
            const [classId, studentKey] = entry;
            if (!targetByStudent.has(studentKey)) targetByStudent.set(studentKey, new Set());
            if (classId) targetByStudent.get(studentKey).add(classId);
        }

        const hasRealTargetStudents = Array.from(targetByStudent.keys()).some(k => !k.startsWith('demo:'));

        let newStudents = 0;
        let removedStudents = 0;

        for (const key of targetByStudent.keys()) {
            if (!baseByStudent.has(key) && !key.startsWith('demo:')) {
                newStudents++;
            }
        }
        for (const key of baseByStudent.keys()) {
            if (!targetByStudent.has(key)) {
                if (!(key.startsWith('demo:') && hasRealTargetStudents)) {
                    removedStudents++;
                }
            }
        }

        const addedByClass = new Map();
        const removedByClass = new Map();
        const movedByTarget = new Map();

        for (const [studentKey, targetSet] of targetByStudent.entries()) {
            const baseSet = baseByStudent.get(studentKey);
            if (!baseSet || studentKey.startsWith('demo:')) continue;

            const gained = [];
            const lost = [];
            for (const cId of targetSet) {
                if (!baseSet.has(cId)) gained.push(cId);
            }
            for (const cId of baseSet) {
                if (!targetSet.has(cId)) lost.push(cId);
            }

            if (gained.length === 1 && lost.length === 1) {
                const toId = gained[0];
                movedByTarget.set(toId, (movedByTarget.get(toId) || 0) + 1);
            } else {
                for (const cId of gained) {
                    addedByClass.set(cId, (addedByClass.get(cId) || 0) + 1);
                }
                for (const cId of lost) {
                    if (!removedClassIds.has(cId)) {
                        removedByClass.set(cId, (removedByClass.get(cId) || 0) + 1);
                    }
                }
            }
        }

        const addedEnrollments = Array.from(addedByClass.entries()).map(([classId, count]) => {
            const info = resolveClassInfo(classId);
            return { classId, className: info.name || classId, isGroup: Boolean(info.isGroup), count };
        });

        const removedEnrollments = Array.from(removedByClass.entries()).map(([classId, count]) => {
            const info = resolveClassInfo(classId);
            return { classId, className: info.name || classId, isGroup: Boolean(info.isGroup), count };
        });

        const movedEnrollments = Array.from(movedByTarget.entries()).map(([toClassId, count]) => {
            const info = resolveClassInfo(toClassId);
            return { toClassId, toClassName: info.name || toClassId, isGroup: Boolean(info.isGroup), count };
        });

        const hasAnyChange = newStudents > 0 ||
            removedStudents > 0 ||
            addedEnrollments.length > 0 ||
            removedEnrollments.length > 0 ||
            movedEnrollments.length > 0 ||
            addedClasses.length > 0 ||
            removedClasses.length > 0;

        return {
            newStudents,
            removedStudents,
            addedEnrollments,
            removedEnrollments,
            movedEnrollments,
            addedClasses,
            removedClasses,
            hasAnyChange
        };
    },

    /**
     * Persiste le compteur d'élèves uniques, le nombre de classes et le snapshot d'affectations
     * de la dernière synchronisation Cloud.
     * @param {Array<Object>} [results=[]]
     * @param {Array<Object>} [classes=[]]
     * @private
     */
    _saveSyncRosterSnapshot(results = [], classes = []) {
        const safeResults = Array.isArray(results) ? results : [];
        const safeClasses = Array.isArray(classes)
            ? classes.filter(c => c?.id && !String(c.id).startsWith('virtual_'))
            : [];
        const uniqueStudents = Utils.countUniqueStudents(safeResults, safeClasses);
        const snapshot = this.buildRosterSnapshot(safeResults, safeClasses);

        localStorage.setItem('bulletin_last_sync_students', uniqueStudents.toString());
        localStorage.setItem('bulletin_last_sync_classes', safeClasses.length.toString());
        try {
            localStorage.setItem('bulletin_last_sync_roster', JSON.stringify(snapshot));
        } catch (e) {
            console.warn('[SyncService] Could not persist sync roster snapshot:', e);
        }
    },

    /**
     * Compute sync state from 3 timestamps.
     * @returns {'in-sync'|'local-changes'|'cloud-changes'|'conflict'}
     * @private
     */
    _computeSyncState() {
        const localResults = runtimeState.data?.generatedResults || [];
        const localClasses = userSettings.academic?.classes || [];
        const localStudentCount = Utils.countUniqueStudents(localResults, localClasses);
        const lastSyncStudents = this.getLastSyncStudentCount() || 0;
        if (runtimeState._dataPurgeDetected || (localStudentCount === 0 && lastSyncStudents > 0)) {
            return 'cloud-changes';
        }

        const currentHash = StorageManager.computeCurrentDataHash();
        const syncHash = localStorage.getItem('bulletin_last_sync_hash');

        let lMod = parseInt(localStorage.getItem('bulletin_last_modified') || '0');
        const lSync = this.lastSyncTime || parseInt(localStorage.getItem('bulletin_last_sync') || '0');
        const rMod = this.remoteSyncTime || 0;

        // If data hash matches the cloud sync hash, local data is strictly identical
        if (syncHash && currentHash === syncHash) {
            if (lMod > lSync) {
                lMod = lSync;
                localStorage.setItem('bulletin_last_modified', lSync.toString());
            }
            if (!localStorage.getItem('bulletin_last_sync_roster') && localResults.length > 0) {
                this._saveSyncRosterSnapshot(localResults, localClasses);
            }
        } else if (!syncHash && lSync > 0 && lMod <= lSync) {
            localStorage.setItem('bulletin_last_sync_hash', currentHash);
            if (!localStorage.getItem('bulletin_last_sync_roster') && localResults.length > 0) {
                this._saveSyncRosterSnapshot(localResults, localClasses);
            }
        }

        const isHashChanged = Boolean(syncHash) && currentHash !== syncHash;
        const hasLocalChanges = isHashChanged || (lMod > lSync);
        const hasCloudChanges = rMod > 0 && rMod > (lSync + this._DRIFT_TOLERANCE_MS);

        if (hasLocalChanges && hasCloudChanges) return 'conflict';
        if (hasLocalChanges) return 'local-changes';
        if (hasCloudChanges) return 'cloud-changes';
        return 'in-sync';
    },

    /**
     * Apply sync state hints and recommended-action accents to the Save/Load menu items.
     * Expects hints and accents to have been reset by the caller.
     * @param {'in-sync'|'local-changes'|'cloud-changes'|'conflict'} syncState
     * @param {HTMLElement|null} saveBtn
     * @param {HTMLElement|null} loadBtn
     * @param {HTMLElement|null} saveHint
     * @param {HTMLElement|null} loadHint
     * @param {boolean} [isExpired=false] - Whether the OAuth session is currently expired
     * @private
     */
    _applySyncStateUI(syncState, saveBtn, loadBtn, saveHint, loadHint, isExpired = false) {
        switch (syncState) {
            case 'in-sync':
                if (isExpired) {
                    this._setHint(saveHint, 'Session expirée', 'hint-warning');
                } else {
                    this._setHint(saveHint, '✓ À jour', 'hint-in-sync');
                }
                break;

            case 'local-changes':
                this._setHint(saveHint, 'Non sauvegardé', isExpired ? 'hint-warning' : null);
                if (!isExpired) saveBtn?.classList.add('cloud-action-recommended');
                break;

            case 'cloud-changes':
                if (isExpired) this._setHint(saveHint, 'Session expirée', 'hint-warning');
                this._setHint(loadHint, 'Cloud plus récent', isExpired ? 'hint-warning' : null);
                if (!isExpired) loadBtn?.classList.add('cloud-action-recommended');
                break;

            case 'conflict':
                this._setHint(saveHint, 'Non sauvegardé', 'hint-warning');
                this._setHint(loadHint, 'Cloud plus récent', 'hint-warning');
                break;
        }
    },

    /**
     * Get user info (display name, email, photo) from active provider or local cache.
     * @returns {Promise<Object|null>}
     */
    async getUserInfo() {
        if (this._provider?.getUserInfo) {
            const info = await this._provider.getUserInfo();
            if (info) return info;
        }
        const cached = localStorage.getItem('bulletin_google_user');
        if (cached) {
            try { return JSON.parse(cached); } catch { return null; }
        }
        return null;
    },

    /**
     * Update UI to show connected status after successful reconnection.
     * @private
     * @param {string} providerName - 'google' or 'dropbox'
     */
    _updateUIConnected(providerName) {
        document.dispatchEvent(new CustomEvent('sync-status-changed', { detail: { providerName, connected: true } }));
        bus.emit(EVENTS.SYNC_CONNECTED, { providerName, connected: true });
        setTimeout(async () => {
            if (providerName === 'google') {
                try {
                    if (SettingsModalListeners?.updateCloudSyncUI) {
                        await SettingsModalListeners.updateCloudSyncUI();
                    }
                } catch {
                    // Fallback DOM manipulation if listeners module not ready
                    const statusEl = document.getElementById('googleSyncStatus');
                    const connectBtn = document.getElementById('connectGoogleBtn');
                    const disconnectBtn = document.getElementById('disconnectGoogleBtn');
                    if (statusEl) {
                        statusEl.textContent = 'Connecté';
                        statusEl.classList.add('connected');
                    }
                    if (connectBtn) connectBtn.style.display = 'none';
                    if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
                    const actionsBar = document.getElementById('cloudActionsBar');
                    if (actionsBar) actionsBar.style.display = 'flex';
                }
            }
        }, 100);
    },


    // =========================================================================
    // PROVIDER MANAGEMENT
    // =========================================================================

    /**
     * Connect to a cloud provider.
     * @param {string} providerName - 'google' or 'dropbox'
     * @param {Object} [options] - { silent: boolean, skipStatusCheck: boolean }
     * @returns {Promise<boolean>} Success status
     */
    async connect(providerName, options = {}) {
        if (!PROVIDERS[providerName]) {
            throw new Error(`Provider inconnu: ${providerName}`);
        }

        try {
            // Dynamically load provider
            const ProviderClass = await PROVIDERS[providerName]();
            this._provider = ProviderClass;
            this.currentProviderName = providerName;

            // Authorize with provider
            const authorized = await this._provider.authorize({ silent: options.silent });
            if (!authorized) {
                this._provider = null;
                this.currentProviderName = null;
                return false;
            }

            // Save preference and mark as configured
            localStorage.setItem('bulletin_sync_provider', providerName);
            this._wasConfigured = true;
            this._updateCloudIndicator('connected');
            this._updateUIConnected(providerName);

            // Check remote status immediately unless caller is already inside refreshStatus
            if (!options.skipStatusCheck) {
                this.checkRemoteStatus();
            }

            return true;

        } catch (error) {
            console.error('[SyncService] Connection error:', error);
            throw error;
        }
    },

    /**
     * Disconnect from current provider.
     */
    async disconnect() {
        if (this._provider) {
            await this._provider.disconnect?.();
        }
        this._provider = null;
        this.currentProviderName = null;
        this.remoteSyncTime = null;
        this._wasConfigured = false;
        localStorage.removeItem('bulletin_sync_provider');
        this._updateCloudIndicator('disconnected');
        bus.emit(EVENTS.SYNC_DISCONNECTED, {});
    },

    /**
     * Check if currently connected to a provider with a valid session/token.
     * @returns {boolean}
     */
    isConnected() {
        if (!this._provider || !this.currentProviderName) return false;
        if (typeof this._provider.isConnected === 'function') {
            return this._provider.isConnected();
        }
        return true;
    },

    /**
     * Return the high-level connection state for UI consumers.
     * @returns {'connected'|'expired'|'local'|'disconnected'}
     */
    getConnectionState() {
        if (this.isConnected()) return 'connected';
        const isConfigured = Boolean(this._wasConfigured || this.currentProviderName || localStorage.getItem('bulletin_sync_provider'));
        if (!isConfigured) return 'disconnected';
        return (this._isOnline && navigator.onLine !== false) ? 'expired' : 'local';
    },

    /**
     * Get display info for current provider.
     * @returns {Object|null} { name, displayName, icon }
     */
    getProviderInfo() {
        if (!this._provider) return null;
        return {
            name: this.currentProviderName,
            displayName: this._provider.displayName,
            icon: this._provider.icon
        };
    },

    // =========================================================================
    // SYNC OPERATIONS
    // =========================================================================

    // NOTE: Bidirectional sync() removed to enforce Strict Manual Push/Pull paradigm.
    // Use forceUpload() or forceDownload() instead.

    /**
     * Aligne l'empreinte de données locale (`bulletin_last_sync_hash`), l'horodatage de modification
     * (`bulletin_last_modified`) et les caches de `StorageManager` sur l'état synchronisé courant,
     * puis rafraîchit l'indicateur Cloud.
     */
    alignLocalSyncBaseline() {
        const syncTime = this.lastSyncTime || parseInt(localStorage.getItem('bulletin_last_sync') || '0', 10) || Date.now();
        this.lastSyncTime = syncTime;
        const syncHash = StorageManager.computeCurrentDataHash();
        localStorage.setItem('bulletin_last_sync', syncTime.toString());
        localStorage.setItem('bulletin_last_sync_hash', syncHash);
        localStorage.setItem('bulletin_last_modified', syncTime.toString());
        StorageManager._lastDataHash = syncHash;
        StorageManager._lastSaveHash = null;
        this._updateCloudIndicator('connected');
    },

    /**
     * Force push local data to cloud (overwrites remote).
     */
    async forceUpload() {
        if (!this._provider) throw new Error('Aucun provider connecté');

        this._setStatus('syncing');
        const localData = await this._getLocalData();
        localData._meta = {
            ...localData._meta,
            lastSyncAt: new Date().toISOString(),
            lastSyncTimestamp: Date.now(),
            deviceId: StorageManager.getDeviceId(),
            forceUpload: true
        };
        await this._provider.write(localData);
        this.lastSyncTime = Date.now();
        localStorage.setItem('bulletin_last_sync', this.lastSyncTime.toString());
        this._saveSyncRosterSnapshot(localData.generatedResults, localData.classes);

        // Update remote time since we just wrote the file
        this.remoteSyncTime = this.lastSyncTime;

        // Save data hash at sync time and align modified timestamp
        this.alignLocalSyncBaseline();
        this._setStatus('idle');
    },

    /**
     * Force pull remote data to local (overwrites local).
     * @param {Object} [prefetchedData] - Optional pre-fetched remote data to avoid a second read
     */
    async forceDownload(prefetchedData) {
        if (!this._provider) throw new Error('Aucun provider connecté');

        this._setStatus('syncing');
        const remoteData = prefetchedData || await this._provider.read();

        let importedCount = 0;
        if (remoteData && (remoteData.generatedResults || remoteData.classes || remoteData.settings)) {
            const importRes = await StorageManager.importBackup(remoteData, {
                mergeData: false,
                includeApiKeys: true,
                silent: true,
                skipSnapshot: true
            });
            importedCount = importRes?.stats?.imported ?? Utils.countUniqueStudents(remoteData?.generatedResults, remoteData?.classes);
        }

        this.lastSyncTime = Date.now();
        localStorage.setItem('bulletin_last_sync', this.lastSyncTime.toString());
        if (Array.isArray(remoteData?.generatedResults)) {
            this._saveSyncRosterSnapshot(remoteData.generatedResults, remoteData.classes);
        } else {
            localStorage.setItem('bulletin_last_sync_students', importedCount.toString());
        }

        // Update remote time to match since local is now strictly aligned with remote
        this.remoteSyncTime = this.lastSyncTime;

        // Save data hash at sync time and align ALL internal hashes to prevent
        // subsequent saveAppState calls from re-setting bulletin_last_modified
        this.alignLocalSyncBaseline();
        this._setStatus('idle');
        return { success: true, count: importedCount };
    },

    // =========================================================================
    // SAVE/LOAD (User-friendly wrappers for explicit Save/Load paradigm)
    // =========================================================================

    /**
     * Save local data to cloud (explicit user action).
     * @returns {Promise<{success: boolean}>}
     */
    async saveToCloud() {
        await this.forceUpload();
        this._updateCloudIndicator('connected');
        return { success: true };
    },

    /**
     * Récupère un résumé de la sauvegarde Cloud distante sans l'appliquer.
     * Permet à l'interface d'afficher un comparatif avant confirmation.
     * @returns {Promise<{success: boolean, remoteData?: Object, remoteRoster?: Object, studentCount?: number, classCount?: number, timestamp?: number|null, providerLabel?: string}>}
     */
    async getRemoteBackupSummary() {
        if (!this._provider) throw new Error('Aucun provider connecté');

        const remoteData = await this._provider.read();
        if (!remoteData || (!remoteData.generatedResults && !remoteData.classes && !remoteData.settings)) {
            return { success: false };
        }

        const remoteResults = Array.isArray(remoteData.generatedResults) ? remoteData.generatedResults : [];
        const remoteClasses = Array.isArray(remoteData.classes)
            ? remoteData.classes.filter(c => c?.id && !String(c.id).startsWith('virtual_'))
            : [];
        const studentCount = Utils.countUniqueStudents(remoteResults, remoteClasses);
        const classCount = remoteClasses.length;
        const remoteRoster = this.buildRosterSnapshot(remoteResults, remoteClasses);

        let timestamp = null;
        if (remoteData._meta?.exportedAt) {
            timestamp = new Date(remoteData._meta.exportedAt).getTime();
        } else if (remoteData._meta?.lastSyncTimestamp) {
            timestamp = Number(remoteData._meta.lastSyncTimestamp);
        } else if (this.remoteSyncTime) {
            timestamp = this.remoteSyncTime;
        }

        const providerLabel = this.currentProviderName === 'google' ? 'Google Drive' : 'Cloud';

        if (typeof studentCount === 'number' && studentCount > 0 && !localStorage.getItem('bulletin_last_sync_roster')) {
            localStorage.setItem('bulletin_last_sync_students', studentCount.toString());
        }

        return {
            success: true,
            remoteData,
            remoteRoster,
            studentCount,
            classCount,
            timestamp,
            providerLabel
        };
    },

    /**
     * Retourne le nombre d'élèves uniques connu lors de la dernière synchronisation Cloud.
     * @returns {number|null}
     */
    getLastSyncStudentCount() {
        const val = localStorage.getItem('bulletin_last_sync_students');
        return val ? parseInt(val, 10) : null;
    },

    /**
     * Retourne le nombre de classes connu lors de la dernière synchronisation Cloud.
     * @returns {number|null}
     */
    getLastSyncClassCount() {
        const val = localStorage.getItem('bulletin_last_sync_classes');
        if (val === null) return null;
        const parsed = parseInt(val, 10);
        return Number.isNaN(parsed) ? null : parsed;
    },

    /**
     * Retourne le snapshot d'affectations de la dernière synchronisation Cloud.
     * @returns {Object|null}
     */
    getLastSyncRoster() {
        const raw = localStorage.getItem('bulletin_last_sync_roster');
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            return (parsed && Array.isArray(parsed.entries)) ? parsed : null;
        } catch {
            return null;
        }
    },

    /**
     * Load data from cloud to local (explicit user action).
     * @param {Object} [prefetchedRemoteData=null] - Données distantes déjà pré-chargées
     * @returns {Promise<{success: boolean, count?: number}>}
     */
    async loadFromCloud(prefetchedRemoteData = null) {
        if (!this._provider) throw new Error('Aucun provider connecté');

        const remoteData = prefetchedRemoteData || await this._provider.read();
        if (!remoteData || (!remoteData.generatedResults && !remoteData.classes && !remoteData.settings)) {
            return { success: false };
        }

        const res = await this.forceDownload(remoteData);
        return { success: true, count: res?.count };
    },

    /**
     * Fusionne les données locales et distantes sans perte, puis envoie le résultat au Cloud.
     * @param {Object} [prefetchedRemoteData=null] - Données distantes pré-chargées optionnelles
     * @returns {Promise<{success: boolean, stats: Object}>}
     */
    async mergeAndSync(prefetchedRemoteData = null) {
        if (!this._provider) throw new Error('Aucun provider connecté');

        this._setStatus('syncing');

        try {
            // Snapshot de sécurité local avant fusion
            await StorageManager.savePreRestoreSnapshot();

            const remoteData = prefetchedRemoteData || await this._provider.read();
            if (!remoteData || (!remoteData.generatedResults && !remoteData.classes && !remoteData.settings)) {
                await this.forceUpload();
                this._setStatus('idle');
                return { success: true, stats: { addedStudents: 0, addedEnrollments: 0, updatedStudents: 0, addedJournalEntries: 0, addedClasses: 0 } };
            }

            const mergeResult = await StorageManager.mergeRemoteData(remoteData, { skipSnapshot: true });
            await this.forceUpload();

            this._updateCloudIndicator('connected');
            this._setStatus('idle');
            return mergeResult;
        } catch (error) {
            this._setStatus('idle');
            throw error;
        }
    },

    // =========================================================================
    // HELPERS
    // =========================================================================

    /**
     * Get local data in sync format.
     * @private
     */
    async _getLocalData() {
        const results = runtimeState.data.generatedResults || [];
        results.forEach(r => {
            if (!r._lastModified) r._lastModified = Date.now();
        });

        return {
            _meta: {
                appVersion: APP_VERSION,
                exportedAt: new Date().toISOString(),
                lastSyncTimestamp: this.lastSyncTime || 0,
                deviceId: StorageManager.getDeviceId()
            },
            settings: StorageManager.getExportableSettings({ includeApiKeys: true }),
            classes: userSettings.academic.classes || [],
            generatedResults: results,
            deletedItems: runtimeState.data?.deletedItems || { students: [], classes: [] }
        };
    },


    /**
     * Update status and notify listeners.
     * @private
     */
    _setStatus(status) {
        this.status = status;
        this._statusListeners.forEach(fn => fn(status));
        bus.emit(EVENTS.SYNC_STATUS_CHANGED, { status, providerName: this.currentProviderName });
    },

    /**
     * Subscribe to status changes.
     * @param {Function} callback - Called with new status
     * @returns {Function} Unsubscribe function
     */
    onStatusChange(callback) {
        this._statusListeners.push(callback);
        return () => {
            this._statusListeners = this._statusListeners.filter(fn => fn !== callback);
        };
    }
};
