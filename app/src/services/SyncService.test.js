import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from './SyncService.js';
import { GoogleDriveProvider } from './providers/GoogleDriveProvider.js';

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
});
