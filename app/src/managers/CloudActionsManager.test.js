import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SyncServiceMock = vi.hoisted(() => ({
    isConnected: vi.fn(() => true),
    connect: vi.fn(() => Promise.resolve(true)),
    refreshStatus: vi.fn(() => Promise.resolve('local-changes')),
    getLastSyncStudentCount: vi.fn(() => null),
    saveToCloud: vi.fn(() => Promise.resolve({ success: true })),
    mergeAndSync: vi.fn(() => Promise.resolve({ success: true, stats: { addedStudents: 2 } })),
    getRemoteBackupSummary: vi.fn(),
    loadFromCloud: vi.fn(() => Promise.resolve({ success: true, count: 3 })),
    _computeSyncState: vi.fn(() => 'in-sync'),
    _lastSyncState: 'local-changes',
    currentProviderName: 'google',
    lastSyncTime: 1000,
    remoteSyncTime: 2000
}));

vi.mock('../services/SyncService.js', () => ({ SyncService: SyncServiceMock }));

vi.mock('./UIManager.js', () => ({
    UI: {
        showNotification: vi.fn(() => ({ dismiss: vi.fn() })),
        showUndoNotification: vi.fn(),
        showCustomConfirm: vi.fn(() => Promise.resolve(false)),
        showConflictResolutionModal: vi.fn(() => Promise.resolve('cancel')),
        showSaveConfirmationModal: vi.fn(() => Promise.resolve(true)),
        showRestoreConfirmationModal: vi.fn(() => Promise.resolve(true))
    }
}));

vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        savePreRestoreSnapshot: vi.fn(() => Promise.resolve(true)),
        restorePreRestoreSnapshot: vi.fn(() => Promise.resolve(true))
    }
}));

vi.mock('./RestoreTransitionManager.js', () => ({
    RestoreTransitionManager: { rehydrateAndTransition: vi.fn(() => Promise.resolve(true)) }
}));

vi.mock('../utils/DOM.js', () => ({ DOM: { headerMenuBtn: null } }));

vi.mock('../state/State.js', () => ({
    runtimeState: { data: { generatedResults: [] }, _dataPurgeDetected: false },
    userSettings: { academic: { classes: [] } }
}));

import { CloudActionsManager } from './CloudActionsManager.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';
import { runtimeState, userSettings } from '../state/State.js';

const summary = (overrides = {}) => ({
    success: true,
    remoteData: { generatedResults: [{}, {}, {}] },
    studentCount: 3,
    classCount: 1,
    timestamp: 5000,
    providerLabel: 'Google Drive',
    ...overrides
});

describe('CloudActionsManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        runtimeState.data.generatedResults = [{ id: 's1' }, { id: 's2' }];
        runtimeState._dataPurgeDetected = false;
        userSettings.academic.classes = [{ id: 'c1' }];
        SyncServiceMock._lastSyncState = 'local-changes';
        SyncServiceMock.isConnected.mockReturnValue(true);
        SyncServiceMock.getLastSyncStudentCount.mockReturnValue(null);
        SyncServiceMock.getRemoteBackupSummary.mockResolvedValue(summary());
        document.body.className = '';
        document.body.innerHTML = '<div class="main-content-wrapper"></div>';
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('save()', () => {
        it('should show the save confirmation modal and save when confirmed in the nominal local-changes case', async () => {
            const onProgress = vi.fn();
            const onBeforePrompt = vi.fn();

            const result = await CloudActionsManager.save({ onProgress, onBeforePrompt });

            expect(result).toBe(true);
            expect(UI.showSaveConfirmationModal).toHaveBeenCalledWith(expect.objectContaining({
                localStudentCount: 2,
                localClassCount: 1,
                isInSync: false
            }));
            expect(UI.showConflictResolutionModal).not.toHaveBeenCalled();
            expect(SyncServiceMock.saveToCloud).toHaveBeenCalledTimes(1);
            expect(onBeforePrompt).toHaveBeenCalled();
            expect(onProgress).toHaveBeenLastCalledWith(null);
            expect(UI.showNotification).toHaveBeenCalledWith('Vos données sont sécurisées sur le Cloud.', 'success', 4000, { title: 'Sauvegarde réussie' });
        });

        it('should release the visual sync lock after saving', async () => {
            await CloudActionsManager.save();
            expect(document.body.classList.contains('is-cloud-syncing')).toBe(false);
            expect(document.querySelector('.main-content-wrapper').classList.contains('is-cloud-syncing')).toBe(false);
        });

        it('should refuse to save offline without touching the Cloud', async () => {
            vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

            expect(await CloudActionsManager.save()).toBe(false);
            expect(SyncServiceMock.refreshStatus).not.toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalledWith(expect.stringContaining('Mode hors-ligne'), 'info');
        });

        it('should ignore a second trigger while an action is already running (double click / two entry points)', async () => {
            let releaseRefresh;
            SyncServiceMock.refreshStatus.mockImplementationOnce(() => new Promise((resolve) => { releaseRefresh = resolve; }));

            const first = CloudActionsManager.save();
            await vi.waitFor(() => expect(releaseRefresh).toBeTypeOf('function'));
            const second = await CloudActionsManager.save();
            expect(second).toBe(false);
            expect(CloudActionsManager.isBusy()).toBe(true);

            releaseRefresh('local-changes');
            expect(await first).toBe(true);
            expect(SyncServiceMock.saveToCloud).toHaveBeenCalledTimes(1);
            expect(CloudActionsManager.isBusy()).toBe(false);
        });

        it('should ask for confirmation when saving would shrink the Cloud backup or when already in-sync', async () => {
            SyncServiceMock.getLastSyncStudentCount.mockReturnValue(300);
            UI.showSaveConfirmationModal.mockResolvedValueOnce(false);

            expect(await CloudActionsManager.save()).toBe(false);
            expect(UI.showSaveConfirmationModal).toHaveBeenCalledWith(expect.objectContaining({
                localStudentCount: 2,
                remoteStudentCount: 300
            }));
            expect(SyncServiceMock.saveToCloud).not.toHaveBeenCalled();

            SyncServiceMock.getLastSyncStudentCount.mockReturnValue(null);
            SyncServiceMock._lastSyncState = 'in-sync';
            UI.showSaveConfirmationModal.mockResolvedValueOnce(false);

            expect(await CloudActionsManager.save()).toBe(false);
            expect(UI.showSaveConfirmationModal).toHaveBeenLastCalledWith(expect.objectContaining({
                isInSync: true
            }));
            expect(SyncServiceMock.saveToCloud).not.toHaveBeenCalled();
        });

        it('should never upload empty local data and propose a restore instead', async () => {
            runtimeState.data.generatedResults = [];
            UI.showCustomConfirm.mockResolvedValueOnce(true);
            const restoreSpy = vi.spyOn(CloudActionsManager, 'restore').mockResolvedValue(true);

            expect(await CloudActionsManager.save()).toBe(true);
            expect(SyncServiceMock.saveToCloud).not.toHaveBeenCalled();
            expect(restoreSpy).toHaveBeenCalledTimes(1);
        });

        it('should pass the real sync state to the resolution modal when only the Cloud is newer', async () => {
            SyncServiceMock._lastSyncState = 'cloud-changes';
            UI.showConflictResolutionModal.mockResolvedValueOnce('restore');
            const restoreSpy = vi.spyOn(CloudActionsManager, 'restore').mockResolvedValue(true);

            await CloudActionsManager.save();

            expect(UI.showConflictResolutionModal).toHaveBeenCalledWith({ remoteDate: 2000, syncState: 'cloud-changes' });
            expect(SyncServiceMock.saveToCloud).not.toHaveBeenCalled();
            expect(restoreSpy).toHaveBeenCalled();
        });

        it('should merge then report merge stats when the user picks merge on a conflict', async () => {
            SyncServiceMock._lastSyncState = 'conflict';
            UI.showConflictResolutionModal.mockResolvedValueOnce('merge');

            expect(await CloudActionsManager.save()).toBe(true);
            expect(SyncServiceMock.mergeAndSync).toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalledWith('+2 élèves', 'success', 4000, { title: 'Sauvegarde réussie' });
        });

        it('should reconnect once and retry when the upload fails with an auth error', async () => {
            SyncServiceMock.saveToCloud
                .mockRejectedValueOnce(Object.assign(new Error('expired'), { isAuthError: true }))
                .mockResolvedValueOnce({ success: true });

            expect(await CloudActionsManager.save()).toBe(true);
            expect(SyncServiceMock.connect).toHaveBeenCalledWith('google');
            expect(SyncServiceMock.saveToCloud).toHaveBeenCalledTimes(2);
        });

        it('should reconnect on click when the session expired, and stop quietly if the user cancels', async () => {
            SyncServiceMock.isConnected.mockReturnValue(false);
            SyncServiceMock.connect.mockResolvedValueOnce(false);

            expect(await CloudActionsManager.save()).toBe(false);
            expect(SyncServiceMock.refreshStatus).not.toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalledWith('Connexion annulée.', 'warning');
        });

        it('should reconnect and re-check status when refreshStatus detects a server-side expired token', async () => {
            SyncServiceMock.refreshStatus
                .mockImplementationOnce(() => {
                    SyncServiceMock.isConnected.mockReturnValue(false);
                    return Promise.resolve('expired');
                })
                .mockResolvedValueOnce('local-changes');

            expect(await CloudActionsManager.save()).toBe(true);
            expect(SyncServiceMock.connect).toHaveBeenCalledWith('google');
            expect(SyncServiceMock.refreshStatus).toHaveBeenCalledTimes(2);
            expect(SyncServiceMock.saveToCloud).toHaveBeenCalledTimes(1);
        });

        it('should report upload errors and still release the lock', async () => {
            SyncServiceMock.saveToCloud.mockRejectedValueOnce(new Error('quota'));

            expect(await CloudActionsManager.save()).toBe(false);
            expect(UI.showNotification).toHaveBeenCalledWith('Erreur de sauvegarde : quota', 'error');
            expect(CloudActionsManager.isBusy()).toBe(false);
            expect(document.body.classList.contains('is-cloud-syncing')).toBe(false);
        });
    });

    describe('restore()', () => {
        it('should restore and offer an Undo backed by the safety snapshot', async () => {
            expect(await CloudActionsManager.restore()).toBe(true);

            expect(StorageManager.savePreRestoreSnapshot).toHaveBeenCalled();
            expect(SyncServiceMock.loadFromCloud).toHaveBeenCalledWith(summary().remoteData);
            expect(UI.showUndoNotification).toHaveBeenCalledWith(
                'Votre espace de travail a été restauré.',
                expect.any(Function),
                expect.objectContaining({ title: 'Restauration réussie', type: 'success' })
            );

            const undo = UI.showUndoNotification.mock.calls[0][1];
            await undo();
            expect(StorageManager.restorePreRestoreSnapshot).toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalledWith('État précédent restauré.', 'success');
        });

        it('should not offer Undo when no safety snapshot could be created (empty local data)', async () => {
            runtimeState.data.generatedResults = [];
            StorageManager.savePreRestoreSnapshot.mockResolvedValueOnce(false);

            expect(await CloudActionsManager.restore()).toBe(true);
            expect(UI.showUndoNotification).not.toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalledWith('3 élèves récupérés depuis Google Drive.', 'success', 5000, { title: 'Restauration réussie' });
        });

        it('should warn and stop when no valid Cloud backup exists', async () => {
            SyncServiceMock.getRemoteBackupSummary.mockResolvedValueOnce({ success: false });

            expect(await CloudActionsManager.restore()).toBe(false);
            expect(UI.showRestoreConfirmationModal).not.toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalledWith('Aucune sauvegarde valide trouvée sur le Cloud.', 'warning');
        });

        it('should leave local data untouched when the user cancels the comparison modal', async () => {
            UI.showRestoreConfirmationModal.mockResolvedValueOnce(false);

            expect(await CloudActionsManager.restore()).toBe(false);
            expect(StorageManager.savePreRestoreSnapshot).not.toHaveBeenCalled();
            expect(SyncServiceMock.loadFromCloud).not.toHaveBeenCalled();
        });

        it('should reconnect and retry getRemoteBackupSummary when the token expired server-side', async () => {
            SyncServiceMock.getRemoteBackupSummary
                .mockRejectedValueOnce(Object.assign(new Error('expired'), { isAuthError: true }))
                .mockResolvedValueOnce(summary());

            expect(await CloudActionsManager.restore()).toBe(true);
            expect(SyncServiceMock.connect).toHaveBeenCalledWith('google');
            expect(SyncServiceMock.getRemoteBackupSummary).toHaveBeenCalledTimes(2);
        });
    });

    describe('undoRestore() & reconnect()', () => {
        it('should warn when the safety snapshot is no longer available', async () => {
            StorageManager.restorePreRestoreSnapshot.mockResolvedValueOnce(false);

            expect(await CloudActionsManager.undoRestore()).toBe(false);
            expect(UI.showNotification).toHaveBeenCalledWith('Aucune copie de sécurité disponible.', 'warning');
        });

        it('should reconnect in-place and immediately refresh status with checking spinner without triggering save or restore', async () => {
            SyncServiceMock._updateCloudIndicator = vi.fn();

            expect(await CloudActionsManager.reconnect()).toBe(true);
            expect(SyncServiceMock.connect).toHaveBeenCalledWith('google', { skipStatusCheck: true });
            expect(SyncServiceMock._updateCloudIndicator).toHaveBeenCalledWith('connected');
            expect(SyncServiceMock.refreshStatus).toHaveBeenCalledWith({ showChecking: true });
            expect(SyncServiceMock.saveToCloud).not.toHaveBeenCalled();
            expect(SyncServiceMock.loadFromCloud).not.toHaveBeenCalled();
        });
    });
});
