import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from './SyncService.js';
import { GoogleDriveProvider } from './providers/GoogleDriveProvider.js';

vi.mock('../managers/StorageManager.js', () => ({
    StorageManager: {
        savePreRestoreSnapshot: vi.fn(),
        mergeRemoteData: vi.fn(() => Promise.resolve({ success: true, stats: { addedStudents: 1 } })),
        getPreRestoreSnapshot: vi.fn(),
        clearPreRestoreSnapshot: vi.fn(),
        computeCurrentDataHash: vi.fn(() => 'mock-hash'),
        getExportableSettings: vi.fn(() => ({ googleApiKey: 'synced-key', theme: 'dark' })),
        getDeviceId: vi.fn(() => 'device_test')
    }
}));

describe('SyncService & GoogleDriveProvider Authentication & Connection State', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        SyncService._provider = null;
        SyncService.currentProviderName = null;
        GoogleDriveProvider._token = null;
        GoogleDriveProvider._needsReconnect = false;
    });

    describe('SyncService.isConnected()', () => {
        it('should return false if no provider is set', () => {
            expect(SyncService.isConnected()).toBe(false);
        });

        it('should return false if provider is set but provider.isConnected() returns false', () => {
            SyncService.currentProviderName = 'google';
            SyncService._provider = {
                isConnected: vi.fn(() => false)
            };
            expect(SyncService.isConnected()).toBe(false);
            expect(SyncService._provider.isConnected).toHaveBeenCalled();
        });

        it('should return true if provider is set and provider.isConnected() returns true', () => {
            SyncService.currentProviderName = 'google';
            SyncService._provider = {
                isConnected: vi.fn(() => true)
            };
            expect(SyncService.isConnected()).toBe(true);
        });
    });

    describe('GoogleDriveProvider.isConnected()', () => {
        it('should return false when no token exists', () => {
            expect(GoogleDriveProvider.isConnected()).toBe(false);
        });

        it('should return false when token expiry is in the past', () => {
            GoogleDriveProvider._token = {
                access_token: 'fake-token',
                expiry: Date.now() - 5000 // Expired 5 seconds ago
            };
            expect(GoogleDriveProvider.isConnected()).toBe(false);
        });

        it('should return false when token expires within 60-second safety buffer', () => {
            GoogleDriveProvider._token = {
                access_token: 'fake-token',
                expiry: Date.now() + 30000 // Expires in 30 seconds
            };
            expect(GoogleDriveProvider.isConnected()).toBe(false);
        });

        it('should return true when token is valid well beyond buffer', () => {
            GoogleDriveProvider._token = {
                access_token: 'fake-token',
                expiry: Date.now() + 3600000 // Valid for 1 hour
            };
            expect(GoogleDriveProvider.isConnected()).toBe(true);
        });

        it('should restore token from localStorage and check its expiry', () => {
            const validToken = {
                access_token: 'stored-token',
                expiry: Date.now() + 1800000
            };
            localStorage.setItem('bulletin_google_token', JSON.stringify(validToken));
            expect(GoogleDriveProvider.isConnected()).toBe(true);
            expect(GoogleDriveProvider._token).toEqual(validToken);
        });

        it('authorize({ silent: true }) should immediately return false without loading external Google scripts when token is expired', async () => {
            const gapiSpy = vi.spyOn(GoogleDriveProvider, '_ensureGapiLoaded');
            localStorage.setItem('bulletin_google_token', JSON.stringify({
                access_token: 'expired-token',
                expiry: Date.now() - 10000
            }));

            const result = await GoogleDriveProvider.authorize({ silent: true });

            expect(result).toBe(false);
            expect(GoogleDriveProvider.needsReconnect()).toBe(true);
            expect(gapiSpy).not.toHaveBeenCalled();
        });
    });

    describe('GoogleDriveProvider._handleApiError()', () => {
        it('should detect 401 error, mark needsReconnect, remove token, and return Error with message', () => {
            GoogleDriveProvider._token = { access_token: 'old-token' };
            localStorage.setItem('bulletin_google_token', 'old-token');

            const gapiError = {
                status: 401,
                result: {
                    error: {
                        code: 401,
                        message: 'Request had invalid authentication credentials.',
                        status: 'UNAUTHENTICATED'
                    }
                }
            };

            const err = GoogleDriveProvider._handleApiError(gapiError);
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('Request had invalid authentication credentials.');
            expect(err.isAuthError).toBe(true);
            expect(GoogleDriveProvider._needsReconnect).toBe(true);
            expect(GoogleDriveProvider._token).toBeNull();
            expect(localStorage.getItem('bulletin_google_token')).toBeNull();
        });

        it('should provide default session expired message if raw error has no message', () => {
            const gapiError = { status: 401 };
            const err = GoogleDriveProvider._handleApiError(gapiError);
            expect(err.message).toBe('Session Google Drive expirée. Veuillez vous reconnecter.');
            expect(err.isAuthError).toBe(true);
        });
    });

    describe('SyncService.mergeAndSync()', () => {
        it('should throw an error if no provider is connected', async () => {
            await expect(SyncService.mergeAndSync()).rejects.toThrow('Aucun provider connecté');
        });

        it('should take a pre-restore snapshot, merge remote data, and forceUpload', async () => {
            const { StorageManager } = await import('../managers/StorageManager.js');
            const mockRemoteData = { generatedResults: [{ id: 's1' }] };

            SyncService._provider = {
                read: vi.fn().mockResolvedValue(mockRemoteData),
                write: vi.fn().mockResolvedValue({ success: true })
            };
            vi.spyOn(SyncService, 'forceUpload').mockResolvedValue({ success: true });
            vi.spyOn(SyncService, '_updateCloudIndicator').mockImplementation(() => {});

            const res = await SyncService.mergeAndSync();

            expect(StorageManager.savePreRestoreSnapshot).toHaveBeenCalled();
            expect(StorageManager.mergeRemoteData).toHaveBeenCalledWith(mockRemoteData);
            expect(SyncService.forceUpload).toHaveBeenCalled();
            expect(res.success).toBe(true);
            expect(res.stats.addedStudents).toBe(1);
        });
    });

    describe('SyncService.getUserInfo() & GoogleDriveProvider.getUserInfo()', () => {
        it('should return null when not connected', async () => {
            expect(await SyncService.getUserInfo()).toBeNull();
            expect(await GoogleDriveProvider.getUserInfo()).toBeNull();
        });

        it('should return cached user from localStorage even when provider is instantiated with an expired session', async () => {
            const userProfile = { displayName: 'Professeur Test', email: 'prof@ac-paris.fr', photo: 'https://photo.jpg' };
            localStorage.setItem('bulletin_google_user', JSON.stringify(userProfile));
            SyncService._provider = GoogleDriveProvider;
            GoogleDriveProvider._token = null;

            expect(await GoogleDriveProvider.getUserInfo()).toEqual(userProfile);
            expect(await SyncService.getUserInfo()).toEqual(userProfile);
        });

        it('getConnectionState() should distinguish connected, expired, local (offline) and disconnected', () => {
            expect(SyncService.getConnectionState()).toBe('disconnected');

            SyncService._wasConfigured = true;
            SyncService._isOnline = true;
            expect(SyncService.getConnectionState()).toBe('expired');

            SyncService._isOnline = false;
            expect(SyncService.getConnectionState()).toBe('local');
        });

        it('GoogleDriveProvider.disconnect() should clear bulletin_google_user from localStorage', async () => {
            localStorage.setItem('bulletin_google_token', JSON.stringify({ access_token: 'abc' }));
            localStorage.setItem('bulletin_google_user', JSON.stringify({ displayName: 'Test' }));

            await GoogleDriveProvider.disconnect();

            expect(localStorage.getItem('bulletin_google_token')).toBeNull();
            expect(localStorage.getItem('bulletin_google_user')).toBeNull();
        });
    });

    describe('SyncService.getRemoteBackupSummary() and loadFromCloud()', () => {
        it('should return backup summary without applying it', async () => {
            const mockRemote = {
                _meta: { exportedAt: '2026-09-23T14:30:00.000Z' },
                generatedResults: [{ id: 1 }, { id: 2 }],
                classes: [{ id: 'c1' }]
            };
            SyncService.currentProviderName = 'google';
            SyncService._provider = {
                read: vi.fn().mockResolvedValue(mockRemote)
            };

            const summary = await SyncService.getRemoteBackupSummary();
            expect(summary.success).toBe(true);
            expect(summary.studentCount).toBe(2);
            expect(summary.classCount).toBe(1);
            expect(summary.providerLabel).toBe('Google Drive');
            expect(summary.remoteData).toBe(mockRemote);
        });

        it('should return success false if remote has no valid data', async () => {
            SyncService.currentProviderName = 'google';
            SyncService._provider = {
                read: vi.fn().mockResolvedValue(null)
            };

            const summary = await SyncService.getRemoteBackupSummary();
            expect(summary.success).toBe(false);
        });

        it('loadFromCloud should use prefetchedRemoteData without calling read()', async () => {
            const prefetched = {
                generatedResults: [{ id: 1 }],
                classes: []
            };
            const readSpy = vi.fn();
            SyncService._provider = { read: readSpy };
            vi.spyOn(SyncService, 'forceDownload').mockResolvedValue({ count: 1 });

            const res = await SyncService.loadFromCloud(prefetched);
            expect(readSpy).not.toHaveBeenCalled();
            expect(SyncService.forceDownload).toHaveBeenCalledWith(prefetched);
            expect(res.success).toBe(true);
        });
    });

    describe('SyncService._updateCloudIndicator() & Header Menu Button State', () => {
        let menuBtn, saveBtn, loadBtn;

        beforeEach(() => {
            document.body.innerHTML = `
                <button id="headerMenuBtn"></button>
                <button id="cloudSaveMenuBtn"><iconify-icon></iconify-icon><span class="cloud-save-label"></span><span id="cloudSaveHint"></span></button>
                <button id="cloudLoadMenuBtn"><span id="cloudLoadHint"></span></button>
                <button id="cloudConnectBtn"></button>
                <div id="cloudSeparator"></div>
            `;
            menuBtn = document.getElementById('headerMenuBtn');
            saveBtn = document.getElementById('cloudSaveMenuBtn');
            loadBtn = document.getElementById('cloudLoadMenuBtn');
            SyncService.remoteSyncTime = null;
        });

        it('should show single "Reconnecter" item (hiding Restore) with "Session expirée" hint when session is expired and data is in-sync', () => {
            SyncService._wasConfigured = true;
            SyncService.currentProviderName = 'google';
            SyncService.lastSyncTime = 1000;
            localStorage.setItem('bulletin_last_sync', '1000');
            localStorage.setItem('bulletin_last_modified', '1000');
            localStorage.setItem('bulletin_last_sync_hash', 'mock-hash');

            SyncService._updateCloudIndicator('expired');

            const saveHint = document.getElementById('cloudSaveHint');
            expect(menuBtn.classList.contains('has-cloud-warning')).toBe(false);
            expect(menuBtn.classList.contains('has-cloud-reminder')).toBe(false);
            expect(saveBtn.classList.contains('disabled')).toBe(false);
            expect(saveBtn.dataset.cloudMode).toBe('reconnect');
            expect(saveBtn.querySelector('iconify-icon').getAttribute('icon')).toBe('logos:google-drive');
            expect(saveBtn.querySelector('.cloud-save-label').textContent).toBe('Reconnecter');
            expect(loadBtn.style.display).toBe('none');
            expect(saveHint.style.display).toBe('block');
            expect(saveHint.textContent).toBe('Session expirée');
            expect(saveHint.classList.contains('hint-warning')).toBe(true);
        });

        it('should apply has-cloud-warning and keep logos:google-drive icon when session is expired and local changes exist', () => {
            SyncService._wasConfigured = true;
            SyncService.currentProviderName = 'google';
            SyncService.lastSyncTime = 1000;
            localStorage.setItem('bulletin_last_sync', '1000');
            localStorage.setItem('bulletin_last_modified', '2000');
            localStorage.setItem('bulletin_last_sync_hash', 'old-synced-hash');

            SyncService._updateCloudIndicator('expired');

            const saveHint = document.getElementById('cloudSaveHint');
            expect(menuBtn.classList.contains('has-cloud-warning')).toBe(true);
            expect(menuBtn.classList.contains('has-cloud-reminder')).toBe(false);
            expect(saveBtn.classList.contains('cloud-action-recommended')).toBe(false);
            expect(saveBtn.querySelector('iconify-icon').getAttribute('icon')).toBe('logos:google-drive');
            expect(saveHint.textContent).toBe('Non sauvegardé');
            expect(saveHint.classList.contains('hint-warning')).toBe(true);
        });

        it('should dynamically toggle has-cloud-warning via refreshLocalIndicator when data changes or reverts while expired', () => {
            SyncService._wasConfigured = true;
            SyncService._isOnline = true;
            SyncService.currentProviderName = 'google';
            SyncService.lastSyncTime = 1000;
            localStorage.setItem('bulletin_last_sync', '1000');
            localStorage.setItem('bulletin_last_modified', '1000');
            localStorage.setItem('bulletin_last_sync_hash', 'mock-hash');

            SyncService._updateCloudIndicator('expired');
            expect(menuBtn.classList.contains('has-cloud-warning')).toBe(false);

            // Simulate a local data change (hash differs from sync hash)
            localStorage.setItem('bulletin_last_sync_hash', 'old-hash');
            localStorage.setItem('bulletin_last_modified', '2000');
            SyncService.refreshLocalIndicator();
            expect(menuBtn.classList.contains('has-cloud-warning')).toBe(true);

            // Simulate reverting local data back to synced state
            localStorage.setItem('bulletin_last_sync_hash', 'mock-hash');
            SyncService.refreshLocalIndicator();
            expect(menuBtn.classList.contains('has-cloud-warning')).toBe(false);
        });

        it('should disable Save/Restore (with aria-disabled) only when offline with a configured provider', () => {
            SyncService._wasConfigured = true;
            SyncService.currentProviderName = 'google';

            SyncService._updateCloudIndicator('local');

            const saveHint = document.getElementById('cloudSaveHint');
            expect(menuBtn.classList.contains('has-cloud-warning')).toBe(false);
            expect(saveBtn.classList.contains('disabled')).toBe(true);
            expect(loadBtn.classList.contains('disabled')).toBe(true);
            expect(saveBtn.getAttribute('aria-disabled')).toBe('true');
            expect(saveHint.style.display).toBe('block');
            expect(saveHint.textContent).toBe('Mode hors-ligne');
        });

        it('should show actionable "Non sauvegardé" hint and accent Save when connected with local changes', () => {
            SyncService._wasConfigured = true;
            SyncService.currentProviderName = 'google';
            SyncService.lastSyncTime = 1000;
            localStorage.setItem('bulletin_last_sync', '1000');
            localStorage.setItem('bulletin_last_modified', '2000');

            SyncService._updateCloudIndicator('connected');

            expect(document.getElementById('cloudSaveHint').textContent).toBe('Non sauvegardé');
            expect(saveBtn.classList.contains('cloud-action-recommended')).toBe(true);
            expect(document.getElementById('cloudLoadHint').style.display).toBe('none');
        });

        it('should show amber hints on both items when connected in conflict', () => {
            SyncService._wasConfigured = true;
            SyncService.currentProviderName = 'google';
            SyncService.lastSyncTime = 1000;
            SyncService.remoteSyncTime = 100000;
            localStorage.setItem('bulletin_last_sync', '1000');
            localStorage.setItem('bulletin_last_modified', '2000');

            SyncService._updateCloudIndicator('connected');

            const saveHint = document.getElementById('cloudSaveHint');
            const loadHint = document.getElementById('cloudLoadHint');
            expect(saveHint.textContent).toBe('Non sauvegardé');
            expect(loadHint.textContent).toBe('Cloud plus récent');
            expect(saveHint.classList.contains('hint-warning')).toBe(true);
            expect(loadHint.classList.contains('hint-warning')).toBe(true);
            expect(menuBtn.classList.contains('has-cloud-conflict')).toBe(true);
        });

        it('should return local immediately in refreshStatus when offline', async () => {
            SyncService._isOnline = false;
            SyncService._wasConfigured = true;
            localStorage.setItem('bulletin_sync_provider', 'google');
            const connectSpy = vi.spyOn(SyncService, 'connect');

            const res = await SyncService.refreshStatus({ showChecking: true });

            expect(res).toBe('local');
            expect(connectSpy).not.toHaveBeenCalled();
            expect(document.getElementById('cloudSaveHint').textContent).toBe('Mode hors-ligne');
        });

        it('should share a single in-flight remote check between concurrent refreshStatus callers', async () => {
            SyncService._wasConfigured = true;
            SyncService._isOnline = true;
            SyncService.currentProviderName = 'google';
            let resolveMeta;
            const getMetadata = vi.fn(() => new Promise((resolve) => { resolveMeta = resolve; }));
            SyncService._provider = { isConnected: () => true, getMetadata };

            const first = SyncService.refreshStatus({ showChecking: true });
            const second = SyncService.refreshStatus();
            expect(second).toBe(first);

            resolveMeta({ lastModified: new Date(5000).toISOString() });
            await Promise.all([first, second]);

            expect(getMetadata).toHaveBeenCalledTimes(1);
            expect(SyncService._statusCheck).toBeNull();
        });

        it('should display the "Vérification…" spinner in refreshStatus when showChecking is true (including on concurrent calls)', async () => {
            SyncService._wasConfigured = true;
            SyncService._isOnline = true;
            SyncService.currentProviderName = 'google';
            SyncService.lastSyncTime = 1000;
            let resolveMeta;
            SyncService._provider = { isConnected: () => true, getMetadata: () => new Promise((resolve) => { resolveMeta = resolve; }) };
            const saveHint = document.getElementById('cloudSaveHint');
            saveHint.textContent = 'Non sauvegardé';

            // 1. Background refresh without showChecking, followed by menu open with showChecking: true
            const bgPending = SyncService.refreshStatus();
            await Promise.resolve();
            expect(saveHint.textContent).toBe('Non sauvegardé');

            const menuPending = SyncService.refreshStatus({ showChecking: true });
            expect(saveHint.textContent).toBe('Vérification…');
            expect(saveHint.querySelector('.cloud-hint-spinner')).not.toBeNull();
            resolveMeta(null);
            await Promise.all([bgPending, menuPending]);
            expect(saveHint.textContent).toBe('✓ À jour');
        });

        it('should trigger refreshStatus when coming back online if provider was not initialized while offline', () => {
            SyncService._isOnline = false;
            SyncService._wasConfigured = true;
            SyncService._provider = null;
            const refreshSpy = vi.spyOn(SyncService, 'refreshStatus').mockResolvedValue('in-sync');

            SyncService._handleNetworkChange(true);

            expect(SyncService._isOnline).toBe(true);
            expect(refreshSpy).toHaveBeenCalled();
        });

        it('should remove has-cloud-warning and apply has-cloud-reminder when connected with local changes', () => {
            SyncService._wasConfigured = true;
            SyncService.currentProviderName = 'google';
            SyncService.lastSyncTime = 1000;
            localStorage.setItem('bulletin_last_sync', '1000');
            localStorage.setItem('bulletin_last_modified', '2000');

            SyncService._updateCloudIndicator('connected');

            expect(menuBtn.classList.contains('has-cloud-warning')).toBe(false);
            expect(menuBtn.classList.contains('has-cloud-reminder')).toBe(true);
        });

        it('should detect local changes when data hash differs from sync hash even if lMod <= lSync', () => {
            SyncService._wasConfigured = true;
            SyncService.currentProviderName = 'google';
            SyncService.lastSyncTime = 2000;
            localStorage.setItem('bulletin_last_sync', '2000');
            localStorage.setItem('bulletin_last_modified', '2000'); // same as sync time
            localStorage.setItem('bulletin_last_sync_hash', 'old-synced-hash');

            // StorageManager.computeCurrentDataHash returns 'mock-hash' (different from 'old-synced-hash')
            const state = SyncService._computeSyncState();
            expect(state).toBe('local-changes');
        });

        it('should clear all cloud indicators on disconnected or unconfigured local', () => {
            SyncService._wasConfigured = false;
            menuBtn.classList.add('has-cloud-warning', 'has-cloud-reminder');

            SyncService._updateCloudIndicator('local');

            expect(menuBtn.classList.contains('has-cloud-warning')).toBe(false);
            expect(menuBtn.classList.contains('has-cloud-reminder')).toBe(false);
        });

        it('should return cloud-changes instead of in-sync when local students are 0 but bulletin_last_sync_students > 0', async () => {
            const { runtimeState } = await import('../state/State.js');
            runtimeState.data.generatedResults = [];
            runtimeState._dataPurgeDetected = false;

            SyncService.lastSyncTime = 2000;
            localStorage.setItem('bulletin_last_sync', '2000');
            localStorage.setItem('bulletin_last_modified', '2000');
            localStorage.setItem('bulletin_last_sync_hash', 'mock-hash');
            localStorage.setItem('bulletin_last_sync_students', '307');

            expect(SyncService._computeSyncState()).toBe('cloud-changes');
        });

        it('_getLocalData should request exportable settings without includeApiKeys for Cloud sync and exclude currentClassId', async () => {
            const { StorageManager } = await import('../managers/StorageManager.js');
            const { userSettings } = await import('../state/State.js');
            userSettings.academic.currentClassId = 'class-3a';
            StorageManager.getExportableSettings.mockReturnValue({ theme: 'dark' });
            const payload = await SyncService._getLocalData();

            expect(StorageManager.getExportableSettings).toHaveBeenCalledWith();
            expect(payload.settings).toEqual({ theme: 'dark' });
            expect(payload.currentClassId).toBeUndefined();
        });
    });
});
