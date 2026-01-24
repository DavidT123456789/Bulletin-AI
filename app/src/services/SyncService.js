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

    /** @type {number|null} Token check interval ID */
    _tokenCheckInterval: null,

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
     * Start monitoring network connectivity and token validity.
     * @private
     */
    _startMonitoring() {
        // Listen for online/offline events
        window.addEventListener('online', () => this._handleNetworkChange(true));
        window.addEventListener('offline', () => this._handleNetworkChange(false));

        // Check token validity every 5 minutes
        this._tokenCheckInterval = setInterval(() => this._checkTokenValidity(), 5 * 60 * 1000);
    },

    /**
     * Handle network connectivity changes.
     * @param {boolean} isOnline - Whether the browser is online
     * @private
     */
    _handleNetworkChange(isOnline) {
        const wasOnline = this._isOnline;
        this._isOnline = isOnline;

        if (DEBUG) console.log(`[SyncService] Network ${isOnline ? 'restored' : 'lost'}`);

        if (!isOnline) {
            if (this._wasConfigured || this.currentProviderName) {
                this._updateCloudIndicator('local');
            }
        } else if (!wasOnline && isOnline) {
            // Came back online - verify token but DO NOT SYNC
            if (this.currentProviderName && this._provider) {
                this._checkTokenValidity();
            } else if (this._wasConfigured) {
                const savedProvider = localStorage.getItem('bulletin_sync_provider');
                if (savedProvider) {
                    this.connect(savedProvider, { silent: true }).then(connected => {
                        this._updateCloudIndicator(connected ? 'connected' : 'expired');
                    }).catch(() => {
                        this._updateCloudIndicator('expired');
                    });
                }
            }
        }
    },

    /**
     * Check if the current token is still valid.
     * @private
     */
    async _checkTokenValidity() {
        if (!this._provider || !this._isOnline) return;
        if (typeof this._provider.isConnected !== 'function') return;

        const isValid = this._provider.isConnected();

        if (!isValid) {
            if (DEBUG) console.log('[SyncService] Token expired, attempting silent refresh...');
            const refreshed = await this._trySilentRefresh();
            if (!refreshed) {
                this._updateCloudIndicator('expired');
            }
        } else if (typeof this._provider.isExpiringSoon === 'function' && this._provider.isExpiringSoon()) {
            if (DEBUG) console.log('[SyncService] Token expiring soon, proactive silent refresh...');
            await this._trySilentRefresh();
        }
    },

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
     * Attempt silent token refresh.
     * @returns {Promise<boolean>} True if refresh succeeded
     * @private
     */
    async _trySilentRefresh() {
        if (!this._provider || typeof this._provider.silentRefresh !== 'function') {
            return false;
        }

        try {
            const refreshed = await this._provider.silentRefresh();
            if (refreshed) {
                if (DEBUG) console.log('[SyncService] Silent refresh successful');
                this._updateCloudIndicator('connected');
                return true;
            }
        } catch (e) {
            console.warn('[SyncService] Silent refresh failed:', e.message);
        }
        return false;
    },

    /**
     * Update the cloud sync indicator in the menu.
     * @param {'connected'|'expired'|'syncing'|'local'|'disconnected'} state
     * @private
     */
    _updateCloudIndicator(state) {
        // Delay to ensure DOM is ready
        setTimeout(() => {
            // Target both menu items
            const saveBtn = document.getElementById('cloudSaveMenuBtn');
            const loadBtn = document.getElementById('cloudLoadMenuBtn');

            if (!saveBtn) return;

            // Remove previous state classes
            saveBtn.classList.remove('status-connected', 'status-expired', 'status-syncing');

            // Labels and icons map
            const config = {
                connected: {
                    icon: 'fa-cloud-arrow-up',
                    label: 'Enregistrer (Cloud)',
                    class: 'status-connected',
                    color: '' // Default text color
                },
                expired: {
                    icon: 'fa-exclamation-triangle',
                    label: 'Session expirée (Reconnecter)',
                    class: 'status-expired',
                    color: 'var(--warning-color)'
                },
                syncing: {
                    icon: 'fa-spinner fa-spin',
                    label: 'Enregistrement...',
                    class: 'status-syncing',
                    color: ''
                },
                local: {
                    icon: 'fa-cloud-arrow-up',
                    label: 'Enregistrer (Cloud)',
                    class: '',
                    color: ''
                }
            };

            const currentConfig = config[state] || config.local;

            if (state === 'disconnected' && !this._wasConfigured) {
                saveBtn.style.display = 'none';
                if (loadBtn) loadBtn.style.display = 'none';
                return;
            }

            saveBtn.style.display = 'grid'; // Maintain grid layout defined in CSS
            if (loadBtn) loadBtn.style.display = 'grid';

            // Update Icon
            const iconEl = saveBtn.querySelector('i');
            if (iconEl) {
                iconEl.className = `fas ${currentConfig.icon}`;
                if (currentConfig.color) iconEl.style.color = currentConfig.color;
                else iconEl.style.color = '';
            }

            // Update Label
            const labelEl = saveBtn.querySelector('.cloud-save-label');
            if (labelEl) {
                labelEl.textContent = currentConfig.label;
                if (currentConfig.color) labelEl.style.color = currentConfig.color;
                else labelEl.style.color = '';
            }

            // Update Time Hint (only if connected/syncing)
            const timeHint = saveBtn.querySelector('#cloudSaveTimeHint');
            if (timeHint) {
                if (state === 'connected' && this.lastSyncTime) {
                    timeHint.textContent = this._formatLastSyncTime(this.lastSyncTime).replace('Dernière sync : ', '');
                    timeHint.style.display = 'block';
                } else if (state === 'expired') {
                    timeHint.style.display = 'none'; // Clean look for warning
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
        if (DEBUG) console.log('[SyncService] Opening sync settings...');
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
     * Update UI to show connected status after successful auto-reconnection.
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
     */
    async reconnect() {
        if (!this.currentProviderName) return false;

        try {
            this._updateCloudIndicator('syncing');
            const authorized = await this._provider?.authorize?.({ silent: false });
            if (authorized) {
                // Just connect, DO NOT SYNC
                window.UI?.showNotification('Reconnecté à Google Drive', 'success');
                this._updateCloudIndicator('connected');
                this._updateUIConnected(this.currentProviderName);
                return true;
            }
        } catch (e) {
            console.error('[SyncService] Reconnection failed:', e);
        }
        this._updateCloudIndicator('expired');
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
