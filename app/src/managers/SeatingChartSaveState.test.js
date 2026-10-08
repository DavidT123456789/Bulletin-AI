import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appState, runtimeState, userSettings } from '../state/State.js';
import { StorageManager } from './StorageManager.js';
import { SyncService } from '../services/SyncService.js';
import { ClassManager } from './ClassManager.js';
import { SeatingChartManager } from './SeatingChartManager.js';
import { ResultsUIManager } from './ResultsUIManager.js';

vi.mock('../services/DBService.js', () => ({
    DBService: {
        putAll: vi.fn().mockResolvedValue(true)
    }
}));

describe('SeatingChartManager and Save State integrity', () => {
    let testClass;

    beforeEach(() => {
        localStorage.clear();

        document.body.innerHTML = `
            <div class="main-content-wrapper" data-view="plan">
                <div class="header-center"></div>
                <div class="main-content">
                    <div class="output-section"></div>
                </div>
            <button id="cloudSaveMenuBtn"><iconify-icon></iconify-icon><span class="cloud-save-label"></span></button>
            <button id="cloudLoadMenuBtn"></button>
            <span id="cloudSaveHint"></span>
            <span id="cloudLoadHint"></span>
        `;

        const mockUI = new Proxy({}, { get: () => vi.fn() });
        window.UI = mockUI;
        ResultsUIManager.init({}, mockUI);

        userSettings.academic.classes = [];
        userSettings.academic.currentClassId = null;
        userSettings.academic.seatingGrid = {
            rows: 5,
            cols: 6,
            locked: true,
            specialLayout: {}
        };
        appState.classes = userSettings.academic.classes;
        appState.seatingGrid = userSettings.academic.seatingGrid;

        testClass = ClassManager.createClass('3ème A');
        testClass.seatingLocked = true;
        testClass.seatingValidatedAt = 10000;
        testClass.seatingUpdatedAt = 10000;
        appState.currentClassId = testClass.id;
        userSettings.academic.currentClassId = testClass.id;

        const students = [
            {
                id: 'student-1',
                nom: 'Dupont',
                prenom: 'Jean',
                classId: testClass.id,
                seatingPosition: { row: 0, col: 0, pinned: false }
            },
            {
                id: 'student-2',
                nom: 'Martin',
                prenom: 'Sophie',
                classId: testClass.id,
                seatingPosition: { row: 0, col: 1, pinned: false }
            }
        ];
        runtimeState.data.generatedResults = students;
        appState.generatedResults = students;

        SeatingChartManager.init();
    });

    it('does not alter sync state or mutate data on unlocking and immediately re-locking without changes', () => {
        const initialHash = StorageManager.computeCurrentDataHash();
        const syncTime = 10000;
        SyncService.lastSyncTime = syncTime;
        localStorage.setItem('bulletin_last_sync', syncTime.toString());
        localStorage.setItem('bulletin_last_modified', syncTime.toString());
        localStorage.setItem('bulletin_last_sync_hash', initialHash);

        expect(SyncService._computeSyncState()).toBe('in-sync');

        // Switch to plan view
        SeatingChartManager.switchToView('plan', { immediate: true });
        expect(SeatingChartManager._isLocked).toBe(true);
        expect(SyncService._computeSyncState()).toBe('in-sync');

        // Unlock (Mode Édition)
        SeatingChartManager._toggleLock();
        expect(SeatingChartManager._isLocked).toBe(false);

        // Re-lock without any modification
        SeatingChartManager._toggleLock();
        expect(SeatingChartManager._isLocked).toBe(true);

        // Validation timestamp must NOT be overwritten
        expect(testClass.seatingValidatedAt).toBe(10000);
        expect(testClass.seatingLocked).toBe(true);

        // Sync state must remain strictly in-sync
        expect(StorageManager.computeCurrentDataHash()).toBe(initialHash);
        expect(SyncService._computeSyncState()).toBe('in-sync');
        expect(localStorage.getItem('bulletin_last_modified')).toBe(syncTime.toString());
    });

    it('does not alter sync state when switching to list view from edit mode if nothing was modified', () => {
        const initialHash = StorageManager.computeCurrentDataHash();
        const syncTime = 10000;
        SyncService.lastSyncTime = syncTime;
        localStorage.setItem('bulletin_last_sync', syncTime.toString());
        localStorage.setItem('bulletin_last_modified', syncTime.toString());
        localStorage.setItem('bulletin_last_sync_hash', initialHash);

        expect(SyncService._computeSyncState()).toBe('in-sync');

        // Switch to plan view
        SeatingChartManager.switchToView('plan', { immediate: true });
        expect(SeatingChartManager._isLocked).toBe(true);

        // Unlock (Mode Édition)
        SeatingChartManager._toggleLock();
        expect(SeatingChartManager._isLocked).toBe(false);

        // Switch back to list view without making any change
        SeatingChartManager.switchToView('list', { immediate: true });

        // Must restore locked state and maintain in-sync
        expect(testClass.seatingLocked).toBe(true);
        expect(StorageManager.computeCurrentDataHash()).toBe(initialHash);
        expect(SyncService._computeSyncState()).toBe('in-sync');
    });

    it('correctly flags local-changes when a student position is actually modified and re-locked', () => {
        const initialHash = StorageManager.computeCurrentDataHash();
        const syncTime = 10000;
        SyncService.lastSyncTime = syncTime;
        localStorage.setItem('bulletin_last_sync', syncTime.toString());
        localStorage.setItem('bulletin_last_modified', syncTime.toString());
        localStorage.setItem('bulletin_last_sync_hash', initialHash);

        SeatingChartManager.switchToView('plan', { immediate: true });
        SeatingChartManager._toggleLock(); // unlock

        // Move student-1 from (0,0) to (1,1)
        SeatingChartManager._gridState[0][0] = null;
        SeatingChartManager._gridState[1][1] = 'student-1';
        SeatingChartManager._savePositionsToState();

        // Re-lock
        SeatingChartManager._toggleLock();

        // Must update seatingValidatedAt because changes actually occurred
        expect(testClass.seatingValidatedAt).toBeGreaterThan(syncTime);
        expect(StorageManager.computeCurrentDataHash()).not.toBe(initialHash);
        expect(SyncService._computeSyncState()).toBe('local-changes');
    });

    it('does not alter sync state when switching classes from edit mode if nothing was modified', async () => {
        const classB = ClassManager.createClass('4ème B');
        classB.seatingLocked = true;
        classB.seatingValidatedAt = 10000;
        classB.seatingUpdatedAt = 10000;

        const initialHash = StorageManager.computeCurrentDataHash();
        const syncTime = 10000;
        SyncService.lastSyncTime = syncTime;
        localStorage.setItem('bulletin_last_sync', syncTime.toString());
        localStorage.setItem('bulletin_last_modified', syncTime.toString());
        localStorage.setItem('bulletin_last_sync_hash', initialHash);

        SeatingChartManager.switchToView('plan', { immediate: true });
        SeatingChartManager._toggleLock(); // unlock testClass

        const { ClassUIManager } = await import('./ClassUIManager.js');
        await ClassUIManager.handleClassSwitch(classB.id);

        expect(testClass.seatingLocked).toBe(true);
        expect(StorageManager.computeCurrentDataHash()).toBe(initialHash);
        expect(SyncService._computeSyncState()).toBe('in-sync');
    });

    it('remains strictly in-sync even WHILE edit mode is active if nothing has been modified yet', () => {
        const initialHash = StorageManager.computeCurrentDataHash();
        const syncTime = 10000;
        SyncService.lastSyncTime = syncTime;
        localStorage.setItem('bulletin_last_sync', syncTime.toString());
        localStorage.setItem('bulletin_last_modified', syncTime.toString());
        localStorage.setItem('bulletin_last_sync_hash', initialHash);

        SeatingChartManager.switchToView('plan', { immediate: true });
        SeatingChartManager._toggleLock(); // unlock into edit mode

        expect(SeatingChartManager._isLocked).toBe(false);
        expect(testClass.seatingLocked).toBe(true); // persistent state remains validated
        expect(StorageManager.computeCurrentDataHash()).toBe(initialHash);
        expect(SyncService._computeSyncState()).toBe('in-sync');
    });

    it('restores clean in-sync state when changes are undone back to the initial snapshot', () => {
        const initialHash = StorageManager.computeCurrentDataHash();
        const syncTime = 10000;
        SyncService.lastSyncTime = syncTime;
        localStorage.setItem('bulletin_last_sync', syncTime.toString());
        localStorage.setItem('bulletin_last_modified', syncTime.toString());
        localStorage.setItem('bulletin_last_sync_hash', initialHash);

        SeatingChartManager.switchToView('plan', { immediate: true });
        SeatingChartManager._toggleLock(); // unlock

        // Take snapshot & move student
        SeatingChartManager._snapshotGrid();
        SeatingChartManager._gridState[0][0] = null;
        SeatingChartManager._gridState[1][1] = 'student-1';
        SeatingChartManager._savePositionsToState();

        expect(SyncService._computeSyncState()).toBe('local-changes');

        // Undo all actions
        SeatingChartManager._undo();

        expect(SeatingChartManager._undoStack.length).toBe(0);
        expect(testClass.seatingLocked).toBe(true);
        expect(StorageManager.computeCurrentDataHash()).toBe(initialHash);
        expect(SyncService._computeSyncState()).toBe('in-sync');
    });
});
