/**
 * @fileoverview Service de synchronisation cloud pour Bulletin AI.
 * Architecture provider-agnostic permettant Google Drive, Dropbox, etc.
 * 
 * @module services/SyncService
 */

import { userSettings, runtimeState } from '../state/State.js';
import { StorageManager } from '../managers/StorageManager.js';
import { APP_VERSION } from '../config/Config.js';

/** @type {boolean} Enable debug logs (set to false for production) */
const DEBUG = false;

/**
 * Providers disponibles (seront chargés dynamiquement)
 */
const PROVIDERS = {
    google: () => import('./providers/GoogleDriveProvider.js').then(m => m.GoogleDriveProvider),
    dropbox: () => import('./providers/DropboxProvider.js').then(m => m.DropboxProvider),
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
        this._wasConfigured = !!savedProvider;

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

                // If connected, just update UI status - DO NOT SYNC AUTOMATICALLY
                if (connected) {
                    this._updateCloudIndicator('connected');
                    this._updateUIConnected(savedProvider);
                } else if (this._provider?.needsReconnect?.()) {
                    this._updateCloudIndicator('expired');
                } else {
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
            // Came back online - update status
            if (this.currentProviderName && this._provider) {
                // Do not auto-refresh. State remains as is until user action.
                // We could check expiry locally to update UI, but no network calls.
                if (!this._provider.isConnected()) {
                    this._updateCloudIndicator('expired');
                } else {
                    this._updateCloudIndicator('connected');
                }
            } else if (this._wasConfigured) {
                // Do not auto-connect
                this._updateCloudIndicator('expired');
            }
        }
    },

    // _checkTokenValidity and _trySilentRefresh removed to prevent interruptions.
    // Connection is now fully manual or checked only on explicit user action.

    /**
     * Refresh the full sync status (local hash comparison + remote metadata fetch).
     * @param {Object} [options]
     * @param {boolean} [options.showChecking=false] - Whether to display a checking spinner in the menu
     * @returns {Promise<string>} Current sync state
     */
    async refreshStatus(options = {}) {
        const { showChecking = false } = options;
        const savedProvider = this.currentProviderName || localStorage.getItem('bulletin_sync_provider');
        if (!savedProvider) {
            this._updateCloudIndicator('local');
            return 'local';
        }

        if (this._isChecking) return this._lastSyncState || 'local';
        this._isChecking = true;

        try {
            // Always re-read lastSyncTime from localStorage
            this.lastSyncTime = parseInt(localStorage.getItem('bulletin_last_sync') || '0') || null;

            // Show subtle checking spinner if requested
            const saveHint = document.getElementById('cloudSaveHint');
            const loadHint = document.getElementById('cloudLoadHint');
            if (showChecking && saveHint) {
                saveHint.style.display = 'inline-flex';
                saveHint.style.alignItems = 'center';
                saveHint.style.gap = '4px';
                saveHint.className = 'cloud-btn-hint hint-syncing';
                saveHint.innerHTML = '<span class="cloud-hint-spinner"></span><span>Vérification…</span>';
                if (loadHint) {
                    loadHint.style.display = 'none';
                    loadHint.textContent = '';
                }
            }

            // Auto-reconnect silently if not connected but configured and online
            if (!this.isConnected() && this._isOnline) {
                try {
                    await this.connect(savedProvider, { silent: true });
                } catch {
                    /* Silent connect failure */
                }
            }

            if (!this.isConnected()) {
                this._updateCloudIndicator(this._isOnline ? 'expired' : 'local');
                return this._isOnline ? 'expired' : 'local';
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
        } finally {
            this._isChecking = false;
        }
    },

    /**
     * Check remote file status (delegates to refreshStatus).
     */
    async checkRemoteStatus() {
        return this.refreshStatus();
    },

    /**
     * Update the cloud sync indicator in the menu.
     * @param {'connected'|'expired'|'syncing'|'local'|'disconnected'} state
     * @private
     */
    _updateCloudIndicator(state) {
        const saveBtn = document.getElementById('cloudSaveMenuBtn');
        const loadBtn = document.getElementById('cloudLoadMenuBtn');
        const reconnectBtn = document.getElementById('cloudReconnectBtn');
        const connectBtn = document.getElementById('cloudConnectBtn');
        const separator = document.getElementById('cloudSeparator');
        if (!saveBtn) return;

        // Reset all sync state classes
        const syncClasses = ['disabled', 'cloud-action-recommended'];
        syncClasses.forEach(c => saveBtn.classList.remove(c));
        if (loadBtn) syncClasses.forEach(c => loadBtn.classList.remove(c));

        const saveHint = document.getElementById('cloudSaveHint');
        const loadHint = document.getElementById('cloudLoadHint');
        if (saveHint) { saveHint.style.display = 'none'; saveHint.textContent = ''; }
        if (loadHint) { loadHint.style.display = 'none'; loadHint.textContent = ''; }

        const config = {
            connected: {
                icon: 'solar:cloud-upload-linear',
                label: 'Sauvegarder'
            },
            expired: {
                icon: 'solar:cloud-warning-linear',
                label: 'Sauvegarder'
            },
            syncing: {
                icon: 'ph:spinner-gap-bold',
                label: 'Sauvegarder',
                spin: true
            },
            local: {
                icon: 'solar:cloud-upload-linear',
                label: 'Sauvegarder'
            }
        };

        const currentConfig = config[state] || config.local;

        // --- First-time user: show only the Connect button ---
        if (!this._wasConfigured && (state === 'disconnected' || state === 'local')) {
            saveBtn.style.display = 'none';
            if (loadBtn) loadBtn.style.display = 'none';
            if (reconnectBtn) reconnectBtn.style.display = 'none';
            if (separator) separator.style.display = 'block';
            if (connectBtn) connectBtn.style.display = 'flex';
            const menuBtn = document.getElementById('headerMenuBtn') || window.DOM?.headerMenuBtn;
            menuBtn?.classList.remove('has-cloud-warning', 'has-cloud-reminder', 'has-cloud-conflict');
            return;
        }

        // --- Configured user: hide Connect, show Save/Load ---
        if (connectBtn) connectBtn.style.display = 'none';
        if (separator) separator.style.display = 'block';

        saveBtn.style.display = 'flex';
        if (loadBtn) loadBtn.style.display = 'flex';

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

        // Disable Save/Load when not actively connected
        if (state !== 'connected' && state !== 'syncing') {
            saveBtn.classList.add('disabled');
            if (loadBtn) loadBtn.classList.add('disabled');
        }

        // Reconnect button (not connected states)
        if (reconnectBtn) {
            if (state === 'expired' || (state === 'local' && this._wasConfigured)) {
                reconnectBtn.style.display = 'flex';
                const providerName = this.currentProviderName || localStorage.getItem('bulletin_sync_provider');
                const label = { google: 'Google Drive', dropbox: 'Dropbox' }[providerName] || 'Cloud';
                const spanEl = reconnectBtn.querySelector('span');
                if (spanEl) spanEl.textContent = `Reconnecter ${label}`;
            } else {
                reconnectBtn.style.display = 'none';
            }
        }

        // --- Sync state computation (connected only) ---
        if (state === 'connected') {
            const syncState = this._computeSyncState();
            this._lastSyncState = syncState;
            this._applySyncStateUI(syncState, saveBtn, loadBtn);
        } else if (state === 'syncing') {
            const saveHint = document.getElementById('cloudSaveHint');
            if (saveHint) {
                saveHint.style.display = 'block';
                saveHint.textContent = 'Envoi en cours...';
                saveHint.className = 'cloud-btn-hint hint-syncing';
            }
        } else {
            const saveHint = document.getElementById('cloudSaveHint');
            const loadHint = document.getElementById('cloudLoadHint');
            if (saveHint) { saveHint.style.display = 'none'; saveHint.textContent = ''; }
            if (loadHint) { loadHint.style.display = 'none'; loadHint.textContent = ''; }
        }

        // Update menu reminder dot based on syncState
        const menuBtn = document.getElementById('headerMenuBtn') || window.DOM?.headerMenuBtn;
        if (menuBtn) {
            const isWarning = state === 'expired' || (state === 'local' && this._wasConfigured);
            const needsReminder = state === 'connected' &&
                (this._lastSyncState === 'local-changes' || this._lastSyncState === 'cloud-changes' || this._lastSyncState === 'conflict');
            const isConflict = state === 'connected' && this._lastSyncState === 'conflict';

            menuBtn.classList.toggle('has-cloud-warning', isWarning);
            menuBtn.classList.toggle('has-cloud-reminder', !isWarning && !!needsReminder);
            menuBtn.classList.toggle('has-cloud-conflict', isConflict);
        }
    },

    /** @type {boolean} Guard against concurrent refreshStatus calls */
    _isChecking: false,

    /** @type {string|null} Last computed sync state for use in confirmation dialogs */
    _lastSyncState: null,

    /** @private Network clock drift tolerance (ms) */
    _DRIFT_TOLERANCE_MS: 5000,

    /**
     * Compute sync state from 3 timestamps.
     * @returns {'in-sync'|'local-changes'|'cloud-changes'|'conflict'}
     * @private
     */
    _computeSyncState() {
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
        } else if (!syncHash && lSync > 0 && lMod <= lSync) {
            localStorage.setItem('bulletin_last_sync_hash', currentHash);
        }

        const hasLocalChanges = lMod > lSync;
        const hasCloudChanges = rMod > 0 && rMod > (lSync + this._DRIFT_TOLERANCE_MS);

        if (hasLocalChanges && hasCloudChanges) return 'conflict';
        if (hasLocalChanges) return 'local-changes';
        if (hasCloudChanges) return 'cloud-changes';
        return 'in-sync';
    },

    /**
     * Apply sync state to UI elements (unified header status + button classes).
     * @private
     */
    _applySyncStateUI(syncState, saveBtn, loadBtn) {
        const saveHint = document.getElementById('cloudSaveHint');
        const loadHint = document.getElementById('cloudLoadHint');

        saveBtn?.classList.remove('cloud-action-recommended');
        loadBtn?.classList.remove('cloud-action-recommended');

        if (saveHint) { saveHint.style.display = 'none'; saveHint.textContent = ''; saveHint.className = 'cloud-btn-hint'; }
        if (loadHint) { loadHint.style.display = 'none'; loadHint.textContent = ''; loadHint.className = 'cloud-btn-hint'; }

        if (loadBtn) loadBtn.setAttribute('data-tooltip', 'Récupérer vos données depuis le Cloud');

        switch (syncState) {
            case 'in-sync':
                if (saveHint) {
                    saveHint.style.display = 'block';
                    saveHint.textContent = '✓ À jour';
                    saveHint.classList.add('hint-in-sync');
                }
                break;

            case 'local-changes':
                if (saveHint) {
                    saveHint.style.display = 'block';
                    saveHint.textContent = 'Modifications locales';
                }
                saveBtn?.classList.add('cloud-action-recommended');
                break;

            case 'cloud-changes':
                if (loadHint) {
                    loadHint.style.display = 'block';
                    loadHint.textContent = 'Version Cloud plus récente';
                }
                loadBtn?.classList.add('cloud-action-recommended');
                break;

            case 'conflict':
                if (saveHint) {
                    saveHint.style.display = 'block';
                    saveHint.textContent = 'Modifications locales';
                    saveHint.classList.add('hint-conflict');
                }
                if (loadHint) {
                    loadHint.style.display = 'block';
                    loadHint.textContent = 'Version distante';
                    loadHint.classList.add('hint-conflict');
                }
                break;
        }
    },

    /**
     * Format a timestamp as a short relative string for hints.
     * @param {number} timestamp - Unix timestamp in ms
     * @returns {string}
     * @private
     */
    _formatRelativeTime(timestamp) {
        const diffMs = Date.now() - timestamp;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHour = Math.floor(diffMin / 60);

        if (diffMin < 1) return 'Modifié à l\'instant';
        if (diffMin < 60) return `Modifié il y a ${diffMin} min`;
        if (diffHour < 24) return `Modifié il y a ${diffHour}h`;
        return `Modifié le ${new Date(timestamp).toLocaleDateString('fr-FR')}`;
    },


    /**
     * Open settings modal on the sync tab.
     * @private
     */
    _openSyncSettings() {

        const settingsModal = document.getElementById('appSettingsModal') || window.DOM?.settingsModal;
        const uiManager = window.UI;

        if (settingsModal && uiManager) {
            uiManager.openModal(settingsModal);
            setTimeout(() => {
                if (uiManager.showSettingsTab) {
                    uiManager.showSettingsTab('advanced');
                }
                setTimeout(() => {
                    const syncSection = document.getElementById('cloudSyncSection');
                    if (syncSection) {
                        syncSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 400);
            }, 100);
        }
    },

    /**
     * Get user info (display name, email, photo) from active provider.
     * @returns {Promise<Object|null>}
     */
    async getUserInfo() {
        if (this._provider?.getUserInfo) {
            return await this._provider.getUserInfo();
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
        setTimeout(async () => {
            if (providerName === 'google') {
                try {
                    const { SettingsModalListeners } = await import('../managers/listeners/SettingsModalListeners.js');
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

    /**
     * Attempt to reconnect with user interaction (shows popup).
     * @param {Object} options
     * @param {boolean} [options.skipIndicator=false] - If true, don't update cloud indicator (caller handles UI)
     */
    async reconnect(options = {}) {
        const { skipIndicator = false } = options;

        let providerName = this.currentProviderName;
        if (!providerName) {
            providerName = localStorage.getItem('bulletin_sync_provider');
        }

        if (!providerName) {
            window.UI?.showNotification('Aucun fournisseur Cloud configuré', 'warning');
            return false;
        }

        const displayLabel = { google: 'Google Drive', dropbox: 'Dropbox' }[providerName] || 'Cloud';

        try {
            if (!this._provider) {
                const connected = await this.connect(providerName, { silent: false });
                if (connected) {
                    window.UI?.showNotification(`Reconnecté à ${displayLabel}`, 'success');
                    return true;
                }
                if (!skipIndicator) this._updateCloudIndicator('expired');
                return false;
            }

            const authorized = await this._provider.authorize({ silent: false });
            if (authorized) {
                window.UI?.showNotification(`Reconnecté à ${displayLabel}`, 'success');
                this._updateCloudIndicator('connected');
                this._updateUIConnected(this.currentProviderName);
                await this.refreshStatus({ showChecking: true });
                return true;
            }
        } catch (e) {
            console.error('[SyncService] Reconnection failed:', e);
            window.UI?.showNotification('Erreur de reconnexion', 'error');
        }
        if (!skipIndicator) this._updateCloudIndicator('expired');
        return false;
    },


    // =========================================================================
    // PROVIDER MANAGEMENT
    // =========================================================================

    /**
     * Connect to a cloud provider.
     * @param {string} providerName - 'google' or 'dropbox'
     * @param {Object} options - { silent: boolean }
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

            // Check remote status immediately
            this.checkRemoteStatus();

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
        const studentCount = Array.isArray(localData.generatedResults) ? localData.generatedResults.length : 0;
        localStorage.setItem('bulletin_last_sync_students', studentCount.toString());

        // Update remote time since we just wrote the file
        this.remoteSyncTime = this.lastSyncTime;

        // Save data hash at sync time and align modified timestamp
        const syncHash = StorageManager.computeCurrentDataHash();
        localStorage.setItem('bulletin_last_sync_hash', syncHash);
        localStorage.setItem('bulletin_last_modified', this.lastSyncTime.toString());
        StorageManager._lastDataHash = syncHash;
        StorageManager._lastSaveHash = null;

        this._updateCloudIndicator('connected');
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
            const importRes = await StorageManager.importBackup(JSON.stringify(remoteData), { mergeData: false, silent: true });
            importedCount = importRes?.stats?.imported ?? (remoteData.generatedResults?.length || 0);

            if (window.App?.updateUIOnLoad) {
                window.App.updateUIOnLoad();
            }
        }

        this.lastSyncTime = Date.now();
        localStorage.setItem('bulletin_last_sync', this.lastSyncTime.toString());
        const downloadedStudents = Array.isArray(remoteData?.generatedResults) ? remoteData.generatedResults.length : importedCount;
        localStorage.setItem('bulletin_last_sync_students', downloadedStudents.toString());

        // Update remote time to match since local is now strictly aligned with remote
        this.remoteSyncTime = this.lastSyncTime;

        // Save data hash at sync time and align ALL internal hashes to prevent
        // subsequent saveAppState calls from re-setting bulletin_last_modified
        const syncHash = StorageManager.computeCurrentDataHash();
        localStorage.setItem('bulletin_last_sync_hash', syncHash);
        localStorage.setItem('bulletin_last_modified', this.lastSyncTime.toString());
        StorageManager._lastDataHash = syncHash;
        StorageManager._lastSaveHash = null;

        this._updateCloudIndicator('connected');
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
     * @returns {Promise<{success: boolean, remoteData?: Object, studentCount?: number, classCount?: number, timestamp?: number|null, providerLabel?: string}>}
     */
    async getRemoteBackupSummary() {
        if (!this._provider) throw new Error('Aucun provider connecté');

        const remoteData = await this._provider.read();
        if (!remoteData || (!remoteData.generatedResults && !remoteData.classes && !remoteData.settings)) {
            return { success: false };
        }

        const studentCount = Array.isArray(remoteData.generatedResults) ? remoteData.generatedResults.length : 0;
        const classCount = Array.isArray(remoteData.classes) ? remoteData.classes.length : 0;

        let timestamp = null;
        if (remoteData._meta?.exportedAt) {
            timestamp = new Date(remoteData._meta.exportedAt).getTime();
        } else if (remoteData._meta?.lastSyncTimestamp) {
            timestamp = Number(remoteData._meta.lastSyncTimestamp);
        } else if (this.remoteSyncTime) {
            timestamp = this.remoteSyncTime;
        }

        const providerLabel = this.currentProviderName === 'dropbox' ? 'Dropbox' : 'Google Drive';

        if (typeof studentCount === 'number' && studentCount > 0) {
            localStorage.setItem('bulletin_last_sync_students', studentCount.toString());
        }

        return {
            success: true,
            remoteData,
            studentCount,
            classCount,
            timestamp,
            providerLabel
        };
    },

    /**
     * Retourne le nombre d'élèves connu lors de la dernière synchronisation Cloud.
     * @returns {number|null}
     */
    getLastSyncStudentCount() {
        const val = localStorage.getItem('bulletin_last_sync_students');
        return val ? parseInt(val, 10) : null;
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
                return { success: true, stats: { addedStudents: 0, updatedStudents: 0, addedJournalEntries: 0, addedClasses: 0 } };
            }

            const mergeResult = await StorageManager.mergeRemoteData(remoteData);
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
            settings: StorageManager.getExportableSettings(),
            classes: userSettings.academic.classes || [],
            currentClassId: userSettings.academic.currentClassId,
            generatedResults: results
        };
    },


    /**
     * Update status and notify listeners.
     * @private
     */
    _setStatus(status) {
        this.status = status;
        this._statusListeners.forEach(fn => fn(status));
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
