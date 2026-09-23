import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from './SyncService.js';
import { GoogleDriveProvider } from './providers/GoogleDriveProvider.js';

vi.mock('../managers/StorageManager.js', () => ({
    StorageManager: {
        savePreRestoreSnapshot: vi.fn(),
        mergeRemoteData: vi.fn(() => Promise.resolve({ success: true, stats: { addedStudents: 1 } })),
        getPreRestoreSnapshot: vi.fn(),
        clearPreRestoreSnapshot: vi.fn()
    }
}));

describe('SyncService & GoogleDriveProvider Authentication & Connection State', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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

        it('should return cached user from localStorage', async () => {
            const userProfile = { displayName: 'Professeur Test', email: 'prof@ac-paris.fr', photo: 'https://photo.jpg' };
            localStorage.setItem('bulletin_google_user', JSON.stringify(userProfile));

            const res = await SyncService.getUserInfo();
            expect(res).toEqual(userProfile);
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
});
