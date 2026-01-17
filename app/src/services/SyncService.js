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

    /** @type {number|null} Token check interval ID */
    _tokenCheckInterval: null,

    /** @type {boolean} Current network connectivity state */
    _isOnline: true,

    /** @type {boolean} Whether a cloud provider was previously configured */
    _wasConfigured: false,

    /** @type {boolean} Prevents duplicate reconnect notifications */
    _reconnectNotificationVisible: false,

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
        this._isOnline = navigator.onLine;
        this._wasConfigured = !!savedProvider;

        // Start network and token monitoring
        this._startMonitoring();

        if (savedProvider && PROVIDERS[savedProvider]) {
            try {
                const connected = await this.connect(savedProvider, { silent: true });

                // If connected, perform initial sync to get cloud data
                if (connected) {
                    this._updateCloudIndicator('syncing');
                    await this.sync();
                    // Update UI to show connected status
                    this._updateUIConnected(savedProvider);
                    this._updateCloudIndicator('connected');
                } else if (this._provider?.needsReconnect?.()) {
                    // Token expired but user had a valid connection before
                    // Show notification AND update indicator to prompt reconnection
                    this._updateCloudIndicator('expired');
                    this._showReconnectNotification();
                } else {
                    // Provider exists but connection failed for other reason
                    // Show local mode if offline, expired if was configured
                    this._updateCloudIndicator(this._isOnline ? 'expired' : 'local');
                }
            } catch (e) {
                console.warn('[SyncService] Could not restore provider:', e.message);
                this._updateCloudIndicator('expired');
            }
        } else {
            // No saved provider - show local mode icon
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

        console.log(`[SyncService] Network ${isOnline ? 'restored' : 'lost'}`);

        if (!isOnline) {
            // Went offline - show local mode if we have a provider configured
            if (this._wasConfigured || this.currentProviderName) {
                this._updateCloudIndicator('local');
            }
        } else if (!wasOnline && isOnline) {
            // Came back online - try to restore connection
            if (this.currentProviderName && this._provider) {
                this._checkTokenValidity();
            } else if (this._wasConfigured) {
                // Try to reconnect silently
                const savedProvider = localStorage.getItem('bulletin_sync_provider');
                if (savedProvider) {
                    this.connect(savedProvider, { silent: true }).then(connected => {
                        if (connected) {
                            this._updateCloudIndicator('connected');
                            this.sync().catch(() => { });
                        } else {
                            this._updateCloudIndicator('expired');
                        }
                    }).catch(() => {
                        this._updateCloudIndicator('expired');
                    });
                }
            }
        }
    },

    /**
     * Check if the current token is still valid and proactively refresh if expiring soon.
     * @private
     */
    async _checkTokenValidity() {
        if (!this._provider || !this._isOnline) return;

        // Check if provider has the required methods
        if (typeof this._provider.isConnected !== 'function') return;

        const isValid = this._provider.isConnected();

        if (!isValid) {
            // Token already expired - try silent refresh
            console.log('[SyncService] Token expired, attempting silent refresh...');
            const refreshed = await this._trySilentRefresh();
            if (!refreshed) {
                this._updateCloudIndicator('expired');
                this._showReconnectNotification();
            }
        } else if (typeof this._provider.isExpiringSoon === 'function' && this._provider.isExpiringSoon()) {
            // Token valid but expiring soon (within 10 min) - proactive refresh
            console.log('[SyncService] Token expiring soon, proactive silent refresh...');
            await this._trySilentRefresh();
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
                console.log('[SyncService] Silent refresh successful');
                this._updateCloudIndicator('connected');
                return true;
            }
        } catch (e) {
            console.warn('[SyncService] Silent refresh failed:', e.message);
        }
        return false;
    },

    /**
     * Show a notification prompting user to reconnect to cloud sync.
     * Includes anti-duplicate mechanism to prevent multiple notifications.
     * @private
     */
    _showReconnectNotification() {
        // Prevent duplicate notifications
        if (this._reconnectNotificationVisible) {
            return;
        }
        this._reconnectNotificationVisible = true;

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
            // Reset flag after notification duration + buffer
            setTimeout(() => {
                this._reconnectNotificationVisible = false;
            }, 10000);
        }, 2000);
    },

    /**
     * Update the cloud sync indicator in the header.
     * @param {'connected'|'expired'|'syncing'|'local'|'disconnected'} state
     * @private
     */
    _updateCloudIndicator(state) {
        // Delay to ensure DOM is ready
        setTimeout(() => {
            const indicator = document.getElementById('cloudSyncIndicator');
            if (!indicator) return;

            // Remove all state classes
            indicator.classList.remove('connected', 'expired', 'syncing', 'local', 'disconnected');

            // Always show indicator - even in local mode
            indicator.style.display = 'flex';
            indicator.classList.add(state);

            // Update main icon based on state
            const mainIcon = indicator.querySelector('i.fa-cloud, i.fa-hard-drive');
            if (mainIcon) {
                if (state === 'local') {
                    mainIcon.classList.remove('fa-cloud');
                    mainIcon.classList.add('fa-hard-drive');
                } else {
                    mainIcon.classList.remove('fa-hard-drive');
                    mainIcon.classList.add('fa-cloud');
                }
            }

            // Update badge icon
            const badge = indicator.querySelector('.cloud-status-badge');
            if (badge) {
                const icons = {
                    connected: '',
                    expired: '',
                    syncing: '',
                    local: ''
                };
                badge.innerHTML = '';
            }

            // Build tooltip with last sync time when connected
            let tooltipText;
            if (state === 'connected' && this.lastSyncTime) {
                const lastSyncLabel = this._formatLastSyncTime(this.lastSyncTime);
                tooltipText = `Google Drive connecté<br>${lastSyncLabel}<br><span class="kbd-hint">Cliquer pour synchroniser</span>`;
            } else {
                const tooltips = {
                    connected: 'Google Drive connecté<br><span class="kbd-hint">Cliquer pour synchroniser</span>',
                    expired: 'Session expirée<br><span class="kbd-hint">Reconnecter</span>',
                    syncing: 'Synchronisation en cours...',
                    local: 'Mode local — Données stockées sur cet appareil<br><span class="kbd-hint">Configurer le cloud</span>'
                };
                tooltipText = tooltips[state] || 'Synchronisation Cloud';
            }

            // Update attribute for CSS/HTML fallback
            indicator.setAttribute('data-tooltip', tooltipText);

            // Update Tippy instance if it exists (critical for dynamic updates)
            if (indicator._tippy) {
                indicator._tippy.setContent(tooltipText);
            }

            // Force update click handler
            indicator.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                console.log('[SyncService] Cloud indicator clicked. State:', state);

                // Don't allow click during sync
                if (indicator.classList.contains('syncing')) return;

                // If connected, trigger a manual sync refresh
                if (state === 'connected') {
                    this.forceRefresh();
                    return;
                }

                // Otherwise open settings to sync tab
                this._openSyncSettings();
            };
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
     * Force a manual sync refresh with visual feedback.
     * Useful for cross-device synchronization.
     */
    async forceRefresh() {
        if (!this._provider || this.status === 'syncing') {
            return;
        }

        try {
            this._updateCloudIndicator('syncing');
            await this.sync();
            window.UI?.showNotification('Synchronisation terminée', 'success', 3000);
        } catch (e) {
            console.error('[SyncService] Force refresh failed:', e);
            window.UI?.showNotification('Erreur de synchronisation', 'error');
            this._updateCloudIndicator('connected');
        }
    },


    /**
     * Open settings modal on the sync tab.
     * @private
     */
    _openSyncSettings() {
        console.log('[SyncService] Opening sync settings...');

        // Try multiple ways to get the modal and UI
        const settingsModal = document.getElementById('appSettingsModal') || window.DOM?.settingsModal;
        const uiManager = window.UI;

        if (!settingsModal) {
            console.error('[SyncService] Settings modal not found (ID: appSettingsModal)');
            return;
        }

        if (!uiManager) {
            console.error('[SyncService] UI Manager not found in window.UI');
            // Try to import dynamically if missing? No, user interactions should happen after init.
            return;
        }

        console.log('[SyncService] Modal and UI found, opening...');
        uiManager.openModal(settingsModal);

        // Wait for modal animation to start/finish before switching tabs and focusing
        setTimeout(() => {
            // Switch to the 'advanced' tab which contains the sync settings
            if (uiManager.showSettingsTab) {
                console.log('[SyncService] Switching to advanced tab (Application)...');
                uiManager.showSettingsTab('advanced');
            }

            // Scroll to the specific section and focus button
            setTimeout(() => {
                // Scroll to sync section
                const syncSection = document.getElementById('cloudSyncSection');
                if (syncSection) {
                    syncSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }

                // Focus the Connect button (or disconnect) for better accessibility
                const connectBtn = document.getElementById('connectGoogleBtn');
                const disconnectBtn = document.getElementById('disconnectGoogleBtn');

                // Focus visible button
                if (disconnectBtn && disconnectBtn.offsetParent !== null) {
                    disconnectBtn.focus();
                } else if (connectBtn && connectBtn.offsetParent !== null) {
                    connectBtn.focus();
                }
            }, 400); // Wait for tab transition (approx 350ms)
        }, 100);
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
            this._updateCloudIndicator('syncing');
            const authorized = await this._provider?.authorize?.({ silent: false });
            if (authorized) {
                await this.sync();
                window.UI?.showNotification('Reconnecté à Google Drive', 'success');
                this._setStatus('idle');
                this._updateCloudIndicator('connected');
                this._updateUIConnected(this.currentProviderName);
                return true;
            }
        } catch (e) {
            console.error('[SyncService] Reconnection failed:', e);
        }
        this._setStatus('error');
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
            // FIX: Ensure UI is updated immediately after connection
            this._updateCloudIndicator('connected');
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

    /**
     * Perform a full sync (bidirectional).
     * Simple approach: compare global timestamp, newest wins entirely.
     * @returns {Promise<{success: boolean, stats: Object}>}
     */
    async sync() {
        if (!this._provider) {
            throw new Error('Aucun provider connecté');
        }

        try {
            this._setStatus('syncing');
            // FIX: Show syncing state in UI
            this._updateCloudIndicator('syncing');

            // 1. Get local and remote data
            const localData = await this._getLocalData();
            const remoteData = await this._provider.read();

            const localTimestamp = this.lastSyncTime || 0;
            const remoteTimestamp = remoteData?._meta?.lastSyncTimestamp || 0;

            const stats = { updated: 0, imported: 0, classesImported: 0, direction: 'none' };

            // 2. Simple last-write-wins: compare global timestamps
            if (remoteData && remoteTimestamp > localTimestamp) {
                // REMOTE IS NEWER - Pull everything from remote
                console.log('[SyncService] Remote is newer, pulling data...');
                stats.direction = 'pull';

                // Replace classes entirely
                if (remoteData.classes) {
                    userSettings.academic.classes = [...remoteData.classes];
                    stats.classesImported = remoteData.classes.length;
                }

                // Replace currentClassId
                if (remoteData.currentClassId !== undefined) {
                    userSettings.academic.currentClassId = remoteData.currentClassId;
                }

                // Merge generated results (keep local changes to avoid data loss)
                if (remoteData.generatedResults?.length > 0) {
                    const localCountBefore = localData.generatedResults?.length || 0;
                    const { merged, stats: mergeStats } = this._mergeData(localData, remoteData);

                    // FIX: Keep ALL students, only warn about orphans instead of deleting
                    // This prevents data loss when classes sync out of order
                    const validClassIds = new Set(
                        (userSettings.academic.classes || []).map(c => c.id)
                    );
                    const orphanStudents = merged.generatedResults.filter(r =>
                        r.classId && !validClassIds.has(r.classId)
                    );

                    if (orphanStudents.length > 0) {
                        console.warn(`[SyncService] Found ${orphanStudents.length} student(s) with unrecognized classId (kept, not deleted):`,
                            orphanStudents.map(s => ({ id: s.id, name: `${s.prenom} ${s.nom}`, classId: s.classId }))
                        );
                    }

                    // Keep ALL students - don't delete orphans
                    runtimeState.data.generatedResults = merged.generatedResults;
                    stats.imported = mergeStats.imported;
                    stats.updated = mergeStats.updated;
                }

                // Merge settings
                if (remoteData.settings) {
                    if (remoteData.settings.theme) userSettings.ui.theme = remoteData.settings.theme;
                    if (remoteData.settings.periodSystem) userSettings.academic.periodSystem = remoteData.settings.periodSystem;
                    if (remoteData.settings.subjects) userSettings.academic.subjects = remoteData.settings.subjects;
                }

                await StorageManager.saveAppState();

                // Refresh UI
                if (window.App?.updateUIOnLoad) {
                    window.App.updateUIOnLoad();
                }
            } else {
                // LOCAL IS NEWER OR SAME - Push to remote
                console.log('[SyncService] Local is newer or same, pushing data...');
                stats.direction = 'push';
            }

            // 3. Always push current state to cloud (ensures both are in sync)
            const dataToUpload = await this._getLocalData();
            dataToUpload._meta = {
                ...dataToUpload._meta,
                lastSyncAt: new Date().toISOString(),
                lastSyncTimestamp: Date.now(),
                deviceId: StorageManager.getDeviceId()
            };
            await this._provider.write(dataToUpload);

            // 4. Update local sync time
            this.lastSyncTime = dataToUpload._meta.lastSyncTimestamp;
            localStorage.setItem('bulletin_last_sync', this.lastSyncTime.toString());

            this._setStatus('idle');
            // FIX: Return to connected state in UI
            this._updateCloudIndicator('connected');

            return { success: true, stats };

        } catch (error) {
            console.error('[SyncService] Sync error:', error);
            this._setStatus('error');
            // Optional: visual feedback for error, but usually we just keep existing state or toast
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
     * Ensures valid token before syncing to avoid false sync indicators.
     * @param {number} delayMs - Debounce delay (default 5000ms)
     */
    triggerAutoSync(delayMs = 5000) {
        // Early exit if auto-sync disabled or no provider configured
        if (!this.autoSyncEnabled) return;

        // Check if we have a provider configured (even if token might be expired)
        const savedProvider = localStorage.getItem('bulletin_sync_provider');
        if (!savedProvider && !this.isConnected()) return;

        // Clear existing timer
        if (this._syncDebounceTimer) {
            clearTimeout(this._syncDebounceTimer);
        }

        // Set new timer
        this._syncDebounceTimer = setTimeout(async () => {
            try {
                // Ensure we have a valid token before syncing
                const tokenValid = await this._ensureValidToken();

                if (tokenValid) {
                    await this.sync();
                } else {
                    // Token invalid and couldn't refresh - user will see expired indicator
                    console.log('[SyncService] Auto-sync skipped: token invalid, user needs to reconnect');
                }
            } catch (e) {
                console.warn('[SyncService] Auto-sync failed:', e.message);
            }
        }, delayMs);
    },

    /**
     * Ensure we have a valid token, attempting silent refresh if needed.
     * @returns {Promise<boolean>} True if token is valid (or was refreshed)
     * @private
     */
    async _ensureValidToken() {
        if (!this._provider) return false;

        // Check if currently valid
        if (typeof this._provider.isConnected === 'function' && this._provider.isConnected()) {
            return true;
        }

        // Try silent refresh
        const refreshed = await this._trySilentRefresh();
        if (refreshed) {
            return true;
        }

        // Silent refresh failed - show notification once
        if (!this._reconnectNotificationShown) {
            this._showReconnectNotification();
            this._reconnectNotificationShown = true;
            // Reset flag after 5 minutes to allow re-showing
            setTimeout(() => { this._reconnectNotificationShown = false; }, 5 * 60 * 1000);
        }

        return false;
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
                    // CRITICAL FIX: Preserve local-only data that remote might not have
                    const localPhoto = localItem.studentPhoto;
                    const localManualEdits = localItem._manualEdits;

                    Object.assign(localItem, remoteItem);

                    // Restore local photo if remote didn't have one or has older photo
                    if (localPhoto?.data) {
                        const remotePhotoTime = remoteItem.studentPhoto?.uploadedAt
                            ? new Date(remoteItem.studentPhoto.uploadedAt).getTime() : 0;
                        const localPhotoTime = localPhoto.uploadedAt
                            ? new Date(localPhoto.uploadedAt).getTime() : 0;

                        if (!remoteItem.studentPhoto || localPhotoTime > remotePhotoTime) {
                            localItem.studentPhoto = localPhoto;
                            console.log(`[SyncService] Preserved local photo for ${localItem.prenom} ${localItem.nom}`);
                        }
                    }

                    // Preserve manual edits if remote doesn't have them
                    if (localManualEdits && !remoteItem._manualEdits) {
                        localItem._manualEdits = localManualEdits;
                    }

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
