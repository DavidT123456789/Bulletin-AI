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
     * Check remote file status (modification date).
     */
    async checkRemoteStatus() {
        if (!this._provider || !this._isOnline) return;

        try {
            const meta = await this._provider.getMetadata();
            if (meta && meta.lastModified) {
                this.remoteSyncTime = new Date(meta.lastModified).getTime();
                this._updateCloudIndicator('connected'); // Refresh UI
            }
        } catch (e) {
            console.warn('[SyncService] Failed to check remote status:', e);
        }
    },

    /**
     * Update the cloud sync indicator in the menu.
     * @param {'connected'|'expired'|'syncing'|'local'|'disconnected'} state
     * @private
     */
    _updateCloudIndicator(state) {
        setTimeout(() => {
            const saveBtn = document.getElementById('cloudSaveMenuBtn');
            const loadBtn = document.getElementById('cloudLoadMenuBtn');
            const reconnectBtn = document.getElementById('cloudReconnectBtn');
            const connectBtn = document.getElementById('cloudConnectBtn');
            const separator = document.getElementById('cloudSeparator');

            if (!saveBtn) return;

            // Reset all sync state classes
            const syncClasses = ['disabled', 'cloud-action-recommended', 'cloud-conflict'];
            syncClasses.forEach(c => saveBtn.classList.remove(c));
            if (loadBtn) syncClasses.forEach(c => loadBtn.classList.remove(c));

            const config = {
                connected: {
                    icon: 'solar:cloud-check-linear',
                    label: 'Sauvegarder'
                },
                expired: {
                    icon: 'solar:cloud-warning-linear',
                    label: 'Sauvegarder'
                },
                syncing: {
                    icon: 'solar:spinner-bold-duotone',
                    label: 'Envoi...',
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
                return;
            }

            // --- Configured user: hide Connect, show Save/Load ---
            if (connectBtn) connectBtn.style.display = 'none';
            if (separator) separator.style.display = 'block';

            saveBtn.style.display = 'grid';
            if (loadBtn) loadBtn.style.display = 'grid';

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
            if (state !== 'connected') {
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
            const timeHint = saveBtn.querySelector('#cloudSaveTimeHint');
            const loadTimeHint = document.getElementById('cloudLoadTimeHint');
            const hintClasses = ['cloud-in-sync', 'cloud-action-recommended', 'cloud-conflict'];

            if (state === 'connected') {
                const syncState = this._computeSyncState();
                this._lastSyncState = syncState;

                // Reset hint classes
                if (timeHint) hintClasses.forEach(c => timeHint.classList.remove(c));
                if (loadTimeHint) hintClasses.forEach(c => loadTimeHint.classList.remove(c));

                this._applySyncStateUI(syncState, saveBtn, loadBtn, timeHint, loadTimeHint);
            } else {
                if (timeHint) {
                    timeHint.style.display = 'none';
                    hintClasses.forEach(c => timeHint.classList.remove(c));
                }
                if (loadTimeHint) {
                    loadTimeHint.style.display = 'none';
                    hintClasses.forEach(c => loadTimeHint.classList.remove(c));
                }
            }
        }, 100);
    },

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
        const lMod = parseInt(localStorage.getItem('bulletin_last_modified') || '0');
        const lSync = this.lastSyncTime || parseInt(localStorage.getItem('bulletin_last_sync') || '0');
        const rMod = this.remoteSyncTime || 0;

        const hasLocalChanges = lMod > lSync;
        const hasCloudChanges = rMod > 0 && rMod > (lSync + this._DRIFT_TOLERANCE_MS);

        if (hasLocalChanges && hasCloudChanges) return 'conflict';
        if (hasLocalChanges) return 'local-changes';
        if (hasCloudChanges) return 'cloud-changes';
        return 'in-sync';
    },

    /**
     * Apply sync state to UI elements (hints + button classes).
     * @private
     */
    _applySyncStateUI(syncState, saveBtn, loadBtn, timeHint, loadTimeHint) {
        const lMod = parseInt(localStorage.getItem('bulletin_last_modified') || '0');

        switch (syncState) {
            case 'in-sync':
                if (timeHint) {
                    timeHint.textContent = 'À jour';
                    timeHint.classList.add('cloud-in-sync');
                    timeHint.style.display = 'block';
                }
                if (loadTimeHint) {
                    loadTimeHint.textContent = 'Cloud : identique';
                    loadTimeHint.classList.add('cloud-in-sync');
                    loadTimeHint.style.display = 'block';
                }
                break;

            case 'local-changes':
                if (timeHint) {
                    timeHint.textContent = lMod ? this._formatRelativeTime(lMod) : 'Modifié';
                    timeHint.classList.add('cloud-action-recommended');
                    timeHint.style.display = 'block';
                }
                saveBtn.classList.add('cloud-action-recommended');

                if (loadTimeHint) {
                    loadTimeHint.textContent = 'Cloud : plus ancien';
                    loadTimeHint.style.display = 'block';
                }
                break;

            case 'cloud-changes':
                if (timeHint) {
                    timeHint.textContent = 'À jour';
                    timeHint.classList.add('cloud-in-sync');
                    timeHint.style.display = 'block';
                }

                if (loadTimeHint) {
                    loadTimeHint.textContent = 'Cloud : plus récent';
                    loadTimeHint.classList.add('cloud-action-recommended');
                    loadTimeHint.style.display = 'block';
                }
                if (loadBtn) loadBtn.classList.add('cloud-action-recommended');
                break;

            case 'conflict':
                if (timeHint) {
                    timeHint.textContent = lMod ? this._formatRelativeTime(lMod) : 'Modifié';
                    timeHint.classList.add('cloud-conflict');
                    timeHint.style.display = 'block';
                }
                saveBtn.classList.add('cloud-conflict');

                if (loadTimeHint) {
                    loadTimeHint.textContent = 'Cloud : plus récent';
                    loadTimeHint.classList.add('cloud-conflict');
                    loadTimeHint.style.display = 'block';
                }
                if (loadBtn) loadBtn.classList.add('cloud-conflict');
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
     * Update UI to show connected status after successful reconnection.
     * @private
     * @param {string} providerName - 'google' or 'dropbox'
     */
    _updateUIConnected(providerName) {
        // Delay to ensure DOM is ready
        setTimeout(() => {
            if (providerName === 'google') {
                const statusEl = document.getElementById('googleSyncStatus');
                const connectBtn = document.getElementById('connectGoogleBtn');
                const disconnectBtn = document.getElementById('disconnectGoogleBtn');
                const card = connectBtn?.closest('.sync-provider-card');

                if (statusEl) {
                    statusEl.textContent = 'Connecté';
                    statusEl.classList.add('connected');
                }
                if (connectBtn) {
                    connectBtn.innerHTML = '<iconify-icon icon="ph:check-bold"></iconify-icon> Connecté';
                    connectBtn.classList.add('btn-success');
                    connectBtn.style.display = 'none';
                }
                if (disconnectBtn) {
                    disconnectBtn.style.display = 'inline-flex';
                }
                if (card) {
                    card.classList.add('connected');
                }
            }
        }, 500);
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
     * Check if currently connected to a provider.
     * @returns {boolean}
     */
    isConnected() {
        return this._provider !== null && this.currentProviderName !== null;
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

        // Update remote time since we just wrote the file
        this.remoteSyncTime = this.lastSyncTime;

        // Save data hash at sync time and align modified timestamp
        const syncHash = StorageManager.computeCurrentDataHash();
        localStorage.setItem('bulletin_last_sync_hash', syncHash);
        localStorage.setItem('bulletin_last_modified', this.lastSyncTime.toString());
        StorageManager._lastDataHash = syncHash;

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

        if (remoteData && (remoteData.generatedResults || remoteData.classes || remoteData.settings)) {
            await StorageManager.importBackup(JSON.stringify(remoteData), { mergeData: false });

            if (window.App?.updateUIOnLoad) {
                window.App.updateUIOnLoad();
            }
        }

        this.lastSyncTime = Date.now();
        localStorage.setItem('bulletin_last_sync', this.lastSyncTime.toString());

        // Save data hash at sync time and align modified timestamp
        const syncHash = StorageManager.computeCurrentDataHash();
        localStorage.setItem('bulletin_last_sync_hash', syncHash);
        localStorage.setItem('bulletin_last_modified', this.lastSyncTime.toString());
        StorageManager._lastDataHash = syncHash;

        this._updateCloudIndicator('connected');
        this._setStatus('idle');
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
     * Load data from cloud to local (explicit user action).
     * @returns {Promise<{success: boolean}>}
     */
    async loadFromCloud() {
        if (!this._provider) throw new Error('Aucun provider connecté');

        const remoteData = await this._provider.read();
        if (!remoteData || (!remoteData.generatedResults && !remoteData.classes && !remoteData.settings)) {
            return { success: false };
        }

        await this.forceDownload(remoteData);
        return { success: true };
    },

    // =========================================================================
    // HELPERS
    // =========================================================================

    /**
     * Get local data in sync format.
     * @private
     */
    async _getLocalData() {
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
            generatedResults: (runtimeState.data.generatedResults || []).map(r => ({
                ...r,
                _lastModified: r._lastModified || Date.now()
            }))
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
