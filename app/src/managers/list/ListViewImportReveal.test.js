/**
 * @fileoverview Unit tests for the progressive import reveal and filter transitions of the List View
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListViewManager } from '../ListViewManager.js';
import { ClassManager } from '../ClassManager.js';
import { appState } from '../../state/State.js';

vi.mock('../../state/State.js', () => ({
    appState: {
        isAppreciationFullView: false,
        currentPeriod: 'S1',
        currentClassId: 'c1',
        sortState: { field: null, direction: 'asc', param: null },
        generatedResults: []
    },
    userSettings: {
        academic: {
            classes: [{ id: 'c1', name: '6A' }],
            currentClassId: 'c1'
        }
    }
}));

vi.mock('../TooltipsManager.js', () => ({
    TooltipsUI: {
        updateTooltip: vi.fn()
    }
}));

vi.mock('../StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
}));

const buildResults = () => [
    {
        id: 's1',
        nom: 'BERNARD',
        prenom: 'Lucas',
        studentPhoto: { data: 'data:image/jpeg;base64,abc' },
        studentData: { periods: { S1: { grade: 14 } } }
    },
    {
        id: 's2',
        nom: 'PETIT',
        prenom: 'Emma',
        studentPhoto: { data: 'data:image/jpeg;base64,def' },
        studentData: { periods: { S1: { grade: 16 } } }
    }
];

describe('ListView - Progressive import reveal', () => {
    let container;

    beforeEach(() => {
        vi.clearAllMocks();
        appState.currentPeriod = 'S1';
        appState.currentClassId = 'c1';
        ListViewManager._lastRenderedClassId = 'c1';
        ListViewManager._lastRenderedPeriod = 'S1';
        ListViewManager._pendingImportReveal = null;
        ListViewManager._activeImportRenderGuard = false;
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    it('should stagger rows after the start delay and pop avatars of imported photos', () => {
        ListViewManager.prepareImportReveal({ newIds: ['s1', 's2'], photoIds: ['s1', 's2'] });
        ListViewManager.render(buildResults(), container);

        const rows = container.querySelectorAll('.student-row');
        expect(rows).toHaveLength(2);
        rows.forEach(row => expect(row.classList.contains('row-animate-in')).toBe(true));

        const delay0 = parseInt(rows[0].style.getPropertyValue('--row-delay'), 10);
        const delay1 = parseInt(rows[1].style.getPropertyValue('--row-delay'), 10);
        expect(delay0).toBeGreaterThanOrEqual(40);
        expect(delay1).toBeGreaterThan(delay0);

        container.querySelectorAll('.student-avatar').forEach(avatar => {
            expect(avatar.classList.contains('avatar-import-pop')).toBe(true);
        });
    });

    it('should not add the skeleton table fade, whose nth-child rules override the row stagger', () => {
        ListViewManager.prepareImportReveal({ newIds: ['s1', 's2'] });
        ListViewManager.render(buildResults(), container);

        expect(container.querySelector('.student-list-view').classList.contains('table-fade-in')).toBe(false);
    });

    it('should ignore a synchronous duplicate render so the cascade is not cancelled', () => {
        ListViewManager.prepareImportReveal({ newIds: ['s1', 's2'] });
        ListViewManager.render(buildResults(), container);
        const firstRow = container.querySelector('.student-row');

        ListViewManager.render(buildResults(), container);

        expect(container.querySelector('.student-row')).toBe(firstRow);
        expect(firstRow.classList.contains('row-animate-in')).toBe(true);
    });

    it('should not animate a plain render when no import was announced', () => {
        ListViewManager.render(buildResults(), container);

        expect(container.querySelectorAll('.row-animate-in')).toHaveLength(0);
        expect(container.querySelector('.student-list-view').classList.contains('table-fade-in')).toBe(false);
    });

    it('should expire an unconsumed request at the end of the tick instead of animating a later render', async () => {
        ListViewManager.prepareImportReveal({ newIds: ['s1'] });
        expect(ListViewManager.getPendingImportReveal()).not.toBeNull();

        await Promise.resolve();

        expect(ListViewManager.getPendingImportReveal()).toBeNull();
        ListViewManager.render(buildResults(), container);
        expect(container.querySelectorAll('.row-animate-in')).toHaveLength(0);
    });

    it('should remove table-fade-in after the initial skeleton fade completes so later row staggers are not blocked', () => {
        vi.useFakeTimers();
        container.innerHTML = '<div id="initialTableSkeleton"></div>';

        ListViewManager.render(buildResults(), container);
        const listView = container.querySelector('.student-list-view');
        expect(listView.classList.contains('table-fade-in')).toBe(true);

        vi.advanceTimersByTime(350);
        expect(listView.classList.contains('table-fade-in')).toBe(false);
        vi.useRealTimers();
    });
});

describe('ListView - Empty filter state transitions (1 <-> 0)', () => {
    let container;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        appState.currentPeriod = 'S1';
        appState.currentClassId = 'c1';
        ListViewManager._lastRenderedClassId = 'c1';
        ListViewManager._lastRenderedPeriod = 'S1';
        ListViewManager._pendingImportReveal = null;
        ListViewManager._activeImportRenderGuard = false;
        vi.spyOn(ClassManager, 'getStudentsForClass').mockReturnValue(buildResults());
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    it('should smoothly animate container height and empty-state row entrance when going from 1 student to 0', () => {
        const singleStudent = [buildResults()[0]];
        ListViewManager.render(singleStudent, container);

        const listView = container.querySelector('.student-list-view');
        const tbody = container.querySelector('tbody');

        // Mock offsetHeight: 115px when 1 student row is present, 185px when empty-state-row is present
        Object.defineProperty(listView, 'offsetHeight', {
            configurable: true,
            get() {
                return tbody.querySelector('.empty-state-row') ? 185 : 115;
            }
        });

        ListViewManager.render([], container);

        // Exiting row gets .row-exit immediately
        const exitingRow = tbody.querySelector('.student-row');
        expect(exitingRow).not.toBeNull();
        expect(exitingRow.classList.contains('row-exit')).toBe(true);

        // After 250ms exit duration, empty state row enters with smooth height transition
        vi.advanceTimersByTime(250);

        const emptyRow = tbody.querySelector('.empty-state-row');
        expect(emptyRow).not.toBeNull();
        expect(emptyRow.classList.contains('row-filter-enter')).toBe(true);
        expect(listView.style.transition).toBe('height 0.45s cubic-bezier(0.32, 0.72, 0, 1)');
        expect(listView.style.height).toBe('185px');

        vi.useRealTimers();
    });

    it('should preserve empty-state height until initialHeight is locked when going from 0 students back to 1', () => {
        const singleStudent = [buildResults()[0]];
        ListViewManager.render(singleStudent, container);
        ListViewManager.render([], container);
        vi.advanceTimersByTime(250);
        vi.advanceTimersByTime(600); // Finish previous height cleanup

        const listView = container.querySelector('.student-list-view');
        const tbody = container.querySelector('tbody');

        const recordedHeights = [];
        Object.defineProperty(listView, 'offsetHeight', {
            configurable: true,
            get() {
                const h = tbody.querySelector('.empty-state-row')
                    ? 185
                    : (tbody.querySelector('.student-row') ? 115 : 48);
                recordedHeights.push(h);
                return h;
            }
        });

        // Transition 0 -> 1 student
        ListViewManager.render(singleStudent, container);

        // Before the 0ms timeout fires, .empty-state-row is NOT prematurely removed (avoiding a 48px collapse)
        expect(tbody.querySelector('.empty-state-row')).not.toBeNull();

        vi.advanceTimersByTime(0);

        // First height read was 185px (with .empty-state-row), second was 115px (with .student-row), never 48px
        expect(recordedHeights).toEqual([185, 115]);
        expect(tbody.querySelector('.empty-state-row')).toBeNull();
        expect(tbody.querySelectorAll('.student-row')).toHaveLength(1);
        expect(listView.style.transition).toBe('height 0.45s cubic-bezier(0.32, 0.72, 0, 1)');
        expect(listView.style.height).toBe('115px');
        expect(listView.style.overflowY).toBe('clip');
        expect(listView.style.overflow).toBe('');

        // After height transition completes, overflowY and height are reset
        vi.advanceTimersByTime(550);
        expect(listView.style.overflowY).toBe('');
        expect(listView.style.height).toBe('');

        vi.useRealTimers();
    });

    it('should invert moved rows synchronously during FLIP and ignore bubbled child transitionend events', () => {
        const allStudents = buildResults();
        ListViewManager.render(allStudents, container);

        const rows = Array.from(container.querySelectorAll('.student-row'));
        const row1 = rows[0];
        const row2 = rows[1];

        // Initial positions before filtering out row1: row1 at top=0, row2 at top=80
        let row2Top = 80;
        vi.spyOn(row1, 'getBoundingClientRect').mockImplementation(() => ({
            top: 0, left: 0, width: 360, height: 70
        }));
        vi.spyOn(row2, 'getBoundingClientRect').mockImplementation(() => ({
            top: row2Top, left: 0, width: 360, height: 70
        }));

        const rafCallbacks = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            rafCallbacks.push(cb);
            return rafCallbacks.length;
        });

        // Filter out s1: FIRST captures row2 at top=80, then after DOM removal row2 moves to top=0
        ListViewManager.render([allStudents[1]], container);
        row2Top = 0;

        // Advance past the 250ms exit phase
        vi.advanceTimersByTime(250);

        // Synchronous INVERT: row2 already has .row-moving and translateY(80px) BEFORE requestAnimationFrame runs
        expect(row2.classList.contains('row-moving')).toBe(true);
        expect(row2.classList.contains('row-move')).toBe(false);
        expect(row2.style.transform).toBe('translateY(80px)');
        expect(row2.style.transition).toBe('none');

        // Run PLAY frame
        expect(rafCallbacks.length).toBeGreaterThan(0);
        rafCallbacks.shift()();

        expect(row2.classList.contains('row-move')).toBe(true);
        expect(row2.style.transform).toBe('');

        // A bubbled transform transitionend from a child element (e.g. avatar or action button) must NOT strip .row-moving early
        const child = row2.querySelector('.student-avatar') || row2.firstElementChild;
        const bubbledEvent = new Event('transitionend', { bubbles: true });
        Object.defineProperty(bubbledEvent, 'propertyName', { value: 'transform' });
        child.dispatchEvent(bubbledEvent);

        expect(row2.classList.contains('row-moving')).toBe(true);
        expect(row2.classList.contains('row-move')).toBe(true);

        // Direct transform transitionend on the row itself cleans up .row-moving and .row-move
        const rowEvent = new Event('transitionend', { bubbles: true });
        Object.defineProperty(rowEvent, 'propertyName', { value: 'transform' });
        row2.dispatchEvent(rowEvent);

        expect(row2.classList.contains('row-moving')).toBe(false);
        expect(row2.classList.contains('row-move')).toBe(false);
        expect(row2.style.transition).toBe('');

        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('should cancel pending filter exit timeout if the user toggles the filter back off within 250ms', () => {
        const allStudents = buildResults();
        ListViewManager.render(allStudents, container);

        // 1. Filter down to 1 student -> s2 gets .row-exit and a 250ms removal timer is scheduled
        ListViewManager.render([allStudents[0]], container);
        expect(container.querySelector('.student-row[data-student-id="s2"]').classList.contains('row-exit')).toBe(true);

        // 2. 100ms later (before the 250ms exit timer fires), user unfilters back to all 2 students
        vi.advanceTimersByTime(100);
        ListViewManager.render(allStudents, container);

        // Advance past the original 250ms mark -> s2 must NOT be removed by a stale timer
        vi.advanceTimersByTime(300);
        const remainingRows = container.querySelectorAll('.student-row');
        expect(remainingRows).toHaveLength(2);
        expect(container.querySelector('.student-row[data-student-id="s2"]').classList.contains('row-exit')).toBe(false);

        vi.useRealTimers();
    });
});
