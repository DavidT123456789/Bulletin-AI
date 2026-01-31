/**
 * @fileoverview Service de synchronisation cloud pour Bulletin AI.
 * Architecture provider-agnostic permettant Google Drive, Dropbox, etc.
 * 
 * @module services/SyncService
 */

import { userSettings, runtimeState } from '../state/State.js';
import { StorageManager } from '../managers/StorageManager.js';

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
        // this.autoSyncEnabled = localStorage.getItem('bulletin_sync_auto') === 'true'; // Removed by request
        this.lastSyncTime = parseInt(localStorage.getItem('bulletin_last_sync')) || null;
        this._isOnline = navigator.onLine;
        this._wasConfigured = !!savedProvider;

        // Start network and token monitoring
        this._startMonitoring();

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
        // Delay to ensure DOM is ready
        setTimeout(() => {
            // Target menu items
            const saveBtn = document.getElementById('cloudSaveMenuBtn');
            const loadBtn = document.getElementById('cloudLoadMenuBtn');
            const reconnectBtn = document.getElementById('cloudReconnectBtn');

            if (!saveBtn) return;

            // Remove previous state classes
            saveBtn.classList.remove('status-connected', 'status-expired', 'status-syncing', 'disabled');
            if (loadBtn) loadBtn.classList.remove('disabled');

            // Labels and icons map
            const config = {
                connected: {
                    icon: 'fa-cloud-arrow-up',
                    label: 'Enregistrer (Cloud)',
                    class: 'status-connected',
                    disabled: false
                },
                expired: {
                    icon: 'fa-cloud-arrow-up',
                    label: 'Enregistrer (Cloud)',
                    class: 'status-expired',
                    disabled: true
                },
                syncing: {
                    icon: 'fa-spinner fa-spin',
                    label: 'Enregistrement...',
                    class: 'status-syncing',
                    disabled: false
                },
                local: {
                    icon: 'fa-cloud-arrow-up',
                    label: 'Enregistrer (Cloud)',
                    class: '',
                    disabled: false
                }
            };

            const currentConfig = config[state] || config.local;

            if (state === 'disconnected' && !this._wasConfigured) {
                saveBtn.style.display = 'none';
                if (loadBtn) loadBtn.style.display = 'none';
                if (reconnectBtn) reconnectBtn.style.display = 'none';
                return;
            }

            saveBtn.style.display = 'grid'; // Maintain grid layout defined in CSS
            if (loadBtn) loadBtn.style.display = 'grid';

            // Update Icon
            const iconEl = saveBtn.querySelector('i');
            if (iconEl) {
                iconEl.className = `fas ${currentConfig.icon}`;
                iconEl.style.color = '';
            }

            // Update Label
            const labelEl = saveBtn.querySelector('.cloud-save-label');
            if (labelEl) {
                labelEl.textContent = currentConfig.label;
                labelEl.style.color = '';
            }

            // Handle disabled state for expired session
            if (currentConfig.disabled) {
                saveBtn.classList.add('disabled');
                if (loadBtn) loadBtn.classList.add('disabled');
            }

            // Show/hide reconnect button with dynamic provider name
            if (reconnectBtn) {
                if (state === 'expired') {
                    reconnectBtn.style.display = 'flex';
                    // Update label with provider name
                    const providerName = this.currentProviderName || localStorage.getItem('bulletin_sync_provider');
                    const providerLabels = {
                        'google': 'Google Drive',
                        'dropbox': 'Dropbox'
                    };
                    const label = providerLabels[providerName] || 'Cloud';
                    const labelEl = reconnectBtn.querySelector('span');
                    if (labelEl) labelEl.textContent = `Reconnecter ${label}`;
                } else {
                    reconnectBtn.style.display = 'none';
                }
            }

            // Update Time Hint (only if connected/syncing)
            const timeHint = saveBtn.querySelector('#cloudSaveTimeHint');
            if (timeHint) {
                if (state === 'connected' && this.lastSyncTime) {
                    timeHint.textContent = this._formatLastSyncTime(this.lastSyncTime).replace('Dernière sync : ', '');
                    timeHint.style.display = 'block';
                } else {
                    timeHint.style.display = 'none';
                }
            }

            // Update Recover Button Time Hint
            const loadTimeHint = document.getElementById('cloudLoadTimeHint');
            if (loadTimeHint) {
                if (state === 'connected' && this.remoteSyncTime) {
                    loadTimeHint.textContent = this._formatLastSyncTime(this.remoteSyncTime).replace('Dernière sync : ', 'Cloud : ');
                    loadTimeHint.style.display = 'block';
                } else {
                    loadTimeHint.style.display = 'none';
                }
            }

            // Add status class for potential CSS styling
            if (currentConfig.class) {
                saveBtn.classList.add(currentConfig.class);
            }

        }, 100);
    },

    /**
     * Format last sync time as a human-readable relative string.
     * @param {number} timestamp - Unix timestamp in ms
     * @returns {string} Relative time string
     * @private
     */
    _formatLastSyncTime(timestamp) {
        const now = Date.now();
        const diffMs = now - timestamp;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);

        if (diffSec < 60) {
            return 'Dernière sync : à l\'instant';
        } else if (diffMin < 60) {
            return `Dernière sync : il y a ${diffMin} min`;
        } else if (diffHour < 24) {
            return `Dernière sync : il y a ${diffHour}h`;
        } else {
            const date = new Date(timestamp);
            return `Dernière sync : ${date.toLocaleDateString('fr-FR')}`;
        }
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
                    connectBtn.innerHTML = '<i class="fas fa-check"></i> Connecté';
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

        // Try to get provider name from current state or localStorage
        let providerName = this.currentProviderName;
        if (!providerName) {
            providerName = localStorage.getItem('bulletin_sync_provider');
        }

        if (!providerName) {
            window.UI?.showNotification('Aucun fournisseur Cloud configuré', 'warning');
            return false;
        }

        try {
            // If provider not loaded yet, connect first (which loads and authorizes)
            if (!this._provider) {
                const connected = await this.connect(providerName, { silent: false });
                if (connected) {
                    window.UI?.showNotification('Reconnecté à Google Drive', 'success');
                    return true;
                }
                if (!skipIndicator) this._updateCloudIndicator('expired');
                return false;
            }

            // Provider already loaded, just reauthorize
            const authorized = await this._provider.authorize({ silent: false });
            if (authorized) {
                // Just connect, DO NOT SYNC
                window.UI?.showNotification('Reconnecté à Google Drive', 'success');
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

            // Save preference
            localStorage.setItem('bulletin_sync_provider', providerName);
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
        this._updateCloudIndicator('connected');

        this._setStatus('idle');
    },

    /**
     * Force pull remote data to local (overwrites local).
     */
    async forceDownload() {
        if (!this._provider) throw new Error('Aucun provider connecté');

        this._setStatus('syncing');
        const remoteData = await this._provider.read();

        // Import remote data if it exists (even without generatedResults - new device may have classes only)
        if (remoteData && (remoteData.generatedResults || remoteData.classes || remoteData.settings)) {
            await StorageManager.importBackup(JSON.stringify(remoteData), { mergeData: false });

            // Refresh UI after download
            if (window.App?.updateUIOnLoad) {
                window.App.updateUIOnLoad();
            }
        }

        this.lastSyncTime = Date.now();
        localStorage.setItem('bulletin_last_sync', this.lastSyncTime.toString());
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

        await this.forceDownload();
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
                appVersion: '0.1.0', // Will be replaced with actual version
                exportedAt: new Date().toISOString(),
                lastSyncTimestamp: this.lastSyncTime || 0,
                deviceId: StorageManager.getDeviceId()
            },
            settings: {
                theme: userSettings.ui.theme,
                periodSystem: userSettings.academic.periodSystem,
                subjects: userSettings.academic.subjects,
            },
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
