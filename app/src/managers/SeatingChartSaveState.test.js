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

    it('does not alter sync state when visiting Activity mode and returning to Course mode without modifications', () => {
        userSettings.academic.seatingActivityGrid = null;
        appState.seatingActivityGrid = null;
        SeatingChartManager._planMode = 'course';

        const initialHash = StorageManager.computeCurrentDataHash();
        const syncTime = 10000;
        SyncService.lastSyncTime = syncTime;
        localStorage.setItem('bulletin_last_sync', syncTime.toString());
        localStorage.setItem('bulletin_last_modified', syncTime.toString());
        localStorage.setItem('bulletin_last_sync_hash', initialHash);

        SeatingChartManager.switchToView('plan', { immediate: true });
        SeatingChartManager._toggleLock(); // unlock to see mode switcher

        // Visit Activity mode without making any change
        SeatingChartManager.switchPlanMode('activity', { animate: false });
        expect(SeatingChartManager._planMode).toBe('activity');
        expect(SeatingChartManager._getRows()).toBe(3);
        expect(SeatingChartManager._getCols()).toBe(5);

        // Return to Course mode and re-lock
        SeatingChartManager.switchPlanMode('course', { animate: false });
        expect(SeatingChartManager._planMode).toBe('course');
        expect(SeatingChartManager._isLocked).toBe(true);

        // Sync state must remain strictly in-sync and seatingActivityGrid must stay null
        expect(appState.seatingActivityGrid).toBeNull();
        expect(StorageManager.computeCurrentDataHash()).toBe(initialHash);
        expect(SyncService._computeSyncState()).toBe('in-sync');
    });

    it('flags local-changes when forming a binôme in Activity mode and preserves seatingActivityPosition across export/import', () => {
        userSettings.academic.seatingActivityGrid = null;
        appState.seatingActivityGrid = null;
        SeatingChartManager._planMode = 'course';

        const initialHash = StorageManager.computeCurrentDataHash();
        const syncTime = 10000;
        SyncService.lastSyncTime = syncTime;
        localStorage.setItem('bulletin_last_sync', syncTime.toString());
        localStorage.setItem('bulletin_last_modified', syncTime.toString());
        localStorage.setItem('bulletin_last_sync_hash', initialHash);

        SeatingChartManager.switchToView('plan', { immediate: true });
        SeatingChartManager._toggleLock();
        SeatingChartManager.switchPlanMode('activity', { animate: false });

        // Select 2 students and form a binôme in 1 click
        SeatingChartManager._toggleChipSelection('student-1');
        SeatingChartManager._toggleChipSelection('student-2');
        SeatingChartManager._placeSelectedAsGroupInFirstFreeStation();

        // Both students are now grouped as a binôme on station (0,0) in Activity mode, while Course positions remain intact
        const s1 = appState.generatedResults.find(s => s.id === 'student-1');
        const s2 = appState.generatedResults.find(s => s.id === 'student-2');
        expect(s1.seatingActivityPosition).toEqual({ row: 0, col: 0, pinned: false, order: 0 });
        expect(s2.seatingActivityPosition).toEqual({ row: 0, col: 0, pinned: false, order: 1 });
        expect(s1.seatingPosition).toEqual({ row: 0, col: 0, pinned: false });
        expect(s2.seatingPosition).toEqual({ row: 0, col: 1, pinned: false });

        // Sync state must now reflect local-changes
        expect(StorageManager.computeCurrentDataHash()).not.toBe(initialHash);
        expect(SyncService._computeSyncState()).toBe('local-changes');
    });

    it('protects a 4-student group when attempting to drop a 5th student and supports single-member avatar extraction', () => {
        appState.generatedResults.push(
            { id: 'student-3', classId: testClass.id, nom: 'Petit', prenom: 'Chloé', seatingPosition: null, _lastModified: 1000 },
            { id: 'student-4', classId: testClass.id, nom: 'Robert', prenom: 'Hugo', seatingPosition: null, _lastModified: 1000 },
            { id: 'student-5', classId: testClass.id, nom: 'Moreau', prenom: 'Léa', seatingPosition: null, _lastModified: 1000 }
        );

        SeatingChartManager.switchToView('plan', { immediate: true });
        SeatingChartManager._toggleLock();
        SeatingChartManager.switchPlanMode('activity', { animate: false });

        // Form a 4-student group on station (0, 0)
        SeatingChartManager._setCellStudentIds(0, 0, ['student-1', 'student-2', 'student-3', 'student-4']);
        SeatingChartManager._savePositionsToState();
        SeatingChartManager._render();

        const cell00 = document.querySelector('#scGridContainer .sc-cell[data-row="0"][data-col="0"]');
        expect(cell00.dataset.groupSize).toBe('4');

        // Verify custom data-tooltip is used on avatars and no native title attribute exists
        const firstAvatar = cell00.querySelector('.sc-stacked-avatar');
        const firstName = cell00.querySelector('.sc-stacked-name');
        expect(firstAvatar.getAttribute('data-tooltip')).toBeTruthy();
        expect(firstAvatar.getAttribute('title')).toBeNull();
        expect(firstName.getAttribute('title')).toBeNull();

        // Attempt to drop a 5th student from the sidebar onto the full group at (0, 0)
        SeatingChartManager._dragSource = { type: 'sidebar', resultId: 'student-5' };
        expect(SeatingChartManager._willDropOverflowGroup(0, 0)).toBe(true);
        SeatingChartManager._handleDrop(0, 0);

        // The 4-student group at (0, 0) must remain completely intact!
        expect(SeatingChartManager._getCellStudentIds(0, 0)).toEqual(['student-1', 'student-2', 'student-3', 'student-4']);
        expect(SeatingChartManager._getPlacedIds().has('student-5')).toBe(false);

        // Now extract 'student-2' by dragging their avatar (type: 'group-member') onto empty station (0, 1)
        SeatingChartManager._dragSource = { type: 'group-member', resultId: 'student-2', row: 0, col: 0 };
        SeatingChartManager._handleDrop(0, 1);

        expect(SeatingChartManager._getCellStudentIds(0, 0)).toEqual(['student-1', 'student-3', 'student-4']);
        expect(SeatingChartManager._getCellStudentIds(0, 1)).toEqual(['student-2']);
    });
});

