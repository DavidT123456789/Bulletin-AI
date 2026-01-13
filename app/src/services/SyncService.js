/**
 * @fileoverview Service de synchronisation cloud pour Bulletin AI.
 * Architecture provider-agnostic permettant Google Drive, Dropbox, etc.
 * 
 * @module services/SyncService
 */

import { userSettings, runtimeState } from '../state/State.js';
import { StorageManager } from '../managers/StorageManager.js';

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

    /** @type {number|null} Last successful sync timestamp */
    lastSyncTime: null,

    /** @type {boolean} Whether auto-sync is enabled */
    autoSyncEnabled: false,

    /** @type {number|null} Debounce timer for auto-sync */
    _syncDebounceTimer: null,

    /** @type {Function[]} Listeners for status changes */
    _statusListeners: [],

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    /**
     * Initialize sync service from saved settings.
     */
    async init() {
        // Load saved provider preference
        const savedProvider = localStorage.getItem('bulletin_sync_provider');
        this.autoSyncEnabled = localStorage.getItem('bulletin_sync_auto') === 'true';
        this.lastSyncTime = parseInt(localStorage.getItem('bulletin_last_sync')) || null;

        if (savedProvider && PROVIDERS[savedProvider]) {
            try {
                const connected = await this.connect(savedProvider, { silent: true });

                // If connected, perform initial sync to get cloud data
                if (connected) {
                    await this.sync();
                    // Update UI to show connected status
                    this._updateUIConnected(savedProvider);
                } else if (this._provider?.needsReconnect?.()) {
                    // Token expired but user had a valid connection before
                    // Show notification to prompt reconnection
                    this._showReconnectNotification();
                }
            } catch (e) {
                console.warn('[SyncService] Could not restore provider:', e.message);
            }
        }
    },

    /**
     * Show a notification prompting user to reconnect to cloud sync.
     * @private
     */
    _showReconnectNotification() {
        // Delay to ensure UI is ready
        setTimeout(() => {
            const UI = window.UI;
            if (UI?.showNotification) {
                UI.showNotification(
                    'Session Google Drive expirée. <a href="#" onclick="window.SyncService?.reconnect(); return false;">Reconnecter</a>',
                    'warning',
                    8000
                );
            }
        }, 2000);
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
                const card = connectBtn?.closest('.sync-provider-card');

                if (statusEl) {
                    statusEl.textContent = 'Connecté';
                    statusEl.classList.add('connected');
                }
                if (connectBtn) {
                    connectBtn.innerHTML = '<i class="fas fa-check"></i> Connecté';
                    connectBtn.classList.add('btn-success');
                    connectBtn.disabled = true;
                }
                if (card) {
                    card.classList.add('connected');
                }
            }
            // Add similar handling for dropbox if needed
        }, 500);
    },

    /**
     * Attempt to reconnect with user interaction (shows popup).
     */
    async reconnect() {
        if (!this.currentProviderName) return false;

        try {
            this._setStatus('syncing');
            const authorized = await this._provider?.authorize?.({ silent: false });
            if (authorized) {
                await this.sync();
                window.UI?.showNotification('Reconnecté à Google Drive', 'success');
                this._setStatus('idle');
                return true;
            }
        } catch (e) {
            console.error('[SyncService] Reconnection failed:', e);
        }
        this._setStatus('error');
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
            this._setStatus('syncing');

            // Dynamically load provider
            const ProviderClass = await PROVIDERS[providerName]();
            this._provider = ProviderClass;
            this.currentProviderName = providerName;

            // Authorize with provider
            const authorized = await this._provider.authorize({ silent: options.silent });
            if (!authorized) {
                this._provider = null;
                this.currentProviderName = null;
                this._setStatus('idle');
                return false;
            }

            // Save preference
            localStorage.setItem('bulletin_sync_provider', providerName);
            this._setStatus('idle');
            return true;

        } catch (error) {
            console.error('[SyncService] Connection error:', error);
            this._setStatus('error');
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
        localStorage.removeItem('bulletin_sync_provider');
        this._setStatus('idle');
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

    /**
     * Perform a full sync (bidirectional).
     * @returns {Promise<{success: boolean, stats: Object}>}
     */
    async sync() {
        if (!this._provider) {
            throw new Error('Aucun provider connecté');
        }

        try {
            this._setStatus('syncing');

            // 1. Get local data with timestamp
            const localData = await this._getLocalData();

            // 2. Get remote data
            const remoteData = await this._provider.read();

            // 3. Merge data (last-write-wins)
            const { merged, stats } = this._mergeData(localData, remoteData);

            // 4. Save merged data locally
            if (stats.updated > 0 || stats.imported > 0 || stats.classesImported > 0) {
                // Restore generated results
                runtimeState.data.generatedResults = merged.generatedResults;

                // Sync classes bidirectionally with deletion support
                if (remoteData?.classes !== undefined) {
                    const remoteTimestamp = remoteData._meta?.lastSyncTimestamp || 0;
                    const localTimestamp = localData._meta?.lastSyncTimestamp || 0;

                    // If remote is newer, replace local classes with remote
                    if (remoteTimestamp > localTimestamp && remoteData.classes) {
                        userSettings.academic.classes = [...remoteData.classes];
                        stats.classesImported = remoteData.classes.length;
                        stats.classesSynced = true;
                    } else if (remoteData.classes?.length > 0) {
                        // Remote is older or same, just add new classes (additive for safety)
                        const existingIds = new Set((userSettings.academic.classes || []).map(c => c.id));
                        remoteData.classes.forEach(remoteClass => {
                            if (!existingIds.has(remoteClass.id)) {
                                userSettings.academic.classes.push(remoteClass);
                                stats.classesImported = (stats.classesImported || 0) + 1;
                            }
                        });
                    }

                    // Sync currentClassId - prefer remote if local class no longer exists
                    if (remoteData.currentClassId) {
                        const localClassIds = new Set((userSettings.academic.classes || []).map(c => c.id));
                        if (!userSettings.academic.currentClassId || !localClassIds.has(userSettings.academic.currentClassId)) {
                            userSettings.academic.currentClassId = remoteData.currentClassId;
                        }
                    }
                }

                // Restore settings if present in remote and not set locally
                if (remoteData?.settings) {
                    if (!userSettings.ui.theme && remoteData.settings.theme) {
                        userSettings.ui.theme = remoteData.settings.theme;
                    }
                    if (!userSettings.academic.periodSystem && remoteData.settings.periodSystem) {
                        userSettings.academic.periodSystem = remoteData.settings.periodSystem;
                    }
                    if (!userSettings.academic.subjects?.length && remoteData.settings.subjects?.length) {
                        userSettings.academic.subjects = remoteData.settings.subjects;
                    }
                }

                await StorageManager.saveAppState();

                // Refresh UI if classes were imported
                if (stats.classesImported > 0 && window.App?.updateUIOnLoad) {
                    window.App.updateUIOnLoad();
                }
            }

            // 5. Push merged data to cloud
            merged._meta = {
                ...merged._meta,
                lastSyncAt: new Date().toISOString(),
                lastSyncTimestamp: Date.now(),
                deviceId: StorageManager.getDeviceId()
            };
            await this._provider.write(merged);

            // 6. Update sync time
            this.lastSyncTime = Date.now();
            localStorage.setItem('bulletin_last_sync', this.lastSyncTime.toString());

            this._setStatus('idle');
            return { success: true, stats };

        } catch (error) {
            console.error('[SyncService] Sync error:', error);
            this._setStatus('error');
            return { success: false, stats: {}, error: error.message };
        }
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
    // AUTO-SYNC
    // =========================================================================

    /**
     * Enable or disable auto-sync.
     * @param {boolean} enabled
     */
    setAutoSync(enabled) {
        this.autoSyncEnabled = enabled;
        localStorage.setItem('bulletin_sync_auto', enabled.toString());
    },

    /**
     * Trigger auto-sync with debounce (called after data changes).
     * @param {number} delayMs - Debounce delay (default 5000ms)
     */
    triggerAutoSync(delayMs = 5000) {
        if (!this.autoSyncEnabled || !this.isConnected()) return;

        // Clear existing timer
        if (this._syncDebounceTimer) {
            clearTimeout(this._syncDebounceTimer);
        }

        // Set new timer
        this._syncDebounceTimer = setTimeout(async () => {
            try {
                await this.sync();
            } catch (e) {
                console.warn('[SyncService] Auto-sync failed:', e.message);
            }
        }, delayMs);
    },

    // =========================================================================
    // CONFLICT RESOLUTION
    // =========================================================================

    /**
     * Merge local and remote data using last-write-wins strategy.
     * @private
     */
    _mergeData(local, remote) {
        const stats = { imported: 0, updated: 0, skipped: 0, conflicts: 0 };

        if (!remote || !remote.generatedResults) {
            return { merged: local, stats };
        }

        const localResults = local.generatedResults || [];
        const remoteResults = remote.generatedResults || [];

        // Create map of local results by ID
        const localMap = new Map(localResults.map(r => [r.id, r]));
        const mergedResults = [...localResults];

        // Process remote results
        remoteResults.forEach(remoteItem => {
            const localItem = localMap.get(remoteItem.id);

            if (!localItem) {
                // New item from remote
                mergedResults.push(remoteItem);
                stats.imported++;
            } else {
                // Existing item - compare timestamps
                const remoteTime = remoteItem._lastModified || 0;
                const localTime = localItem._lastModified || 0;

                if (remoteTime > localTime) {
                    // Remote is newer - update local
                    Object.assign(localItem, remoteItem);
                    stats.updated++;
                    stats.conflicts++;
                } else if (remoteTime < localTime) {
                    // Local is newer - keep local
                    stats.skipped++;
                    stats.conflicts++;
                }
                // If equal, no action needed
            }
        });

        return {
            merged: { ...local, generatedResults: mergedResults },
            stats
        };
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
