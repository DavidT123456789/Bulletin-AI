/**
 * @fileoverview Unit tests for List View period switch transitions and appreciation toggle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListViewRenderer } from './ListViewRenderer.js';
import { ListSelectionManager } from './ListSelectionManager.js';
import { ListViewEvents } from './ListViewEvents.js';
import { ListViewManager } from '../ListViewManager.js';
import { appState } from '../../state/State.js';

vi.mock('../../state/State.js', () => ({
    appState: {
        isAppreciationFullView: false,
        currentPeriod: 'S1',
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

describe('ListView - Appreciation Toggle & Period Switch Transitions', () => {
    let container;

    beforeEach(() => {
        vi.clearAllMocks();
        appState.isAppreciationFullView = false;
        appState.currentPeriod = 'S1';
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    it('should correctly toggle appreciation full view and update state', () => {
        const view = document.createElement('div');
        view.className = 'student-list-view';
        const table = document.createElement('table');
        table.className = 'student-list-table';
        const header = document.createElement('th');
        header.className = 'appreciation-toggle-header';
        table.appendChild(header);
        view.appendChild(table);
        container.appendChild(view);

        expect(table.classList.contains('appreciation-full-view')).toBe(false);
        expect(appState.isAppreciationFullView).toBe(false);

        // First toggle: expand
        ListViewManager._toggleAppreciationColumn(view);
        expect(table.classList.contains('appreciation-full-view')).toBe(true);
        expect(header.classList.contains('expanded-view')).toBe(true);
        expect(appState.isAppreciationFullView).toBe(true);

        // Second toggle: collapse
        ListViewManager._toggleAppreciationColumn(view);
        expect(table.classList.contains('appreciation-full-view')).toBe(false);
        expect(header.classList.contains('expanded-view')).toBe(false);
        expect(appState.isAppreciationFullView).toBe(false);
    });

    it('should prevent event listener accumulation on container reuse using AbortController', () => {
        const toggleSpy = vi.fn();
        ListViewEvents.init({ toggleAppreciationColumn: toggleSpy });

        const view = document.createElement('div');
        view.className = 'student-list-view';
        view.innerHTML = `
            <table class="student-list-table">
                <thead>
                    <tr><th class="appreciation-toggle-header">Appréciation</th></tr>
                </thead>
            </table>
        `;
        container.appendChild(view);

        // Simulate repeated attaches (such as switching periods multiple times)
        ListViewEvents.attachEventListeners(view);
        ListViewEvents.attachEventListeners(view);
        ListViewEvents.attachEventListeners(view);

        const toggleHeader = view.querySelector('.appreciation-toggle-header');
        toggleHeader.click();

        // Must be called exactly ONCE despite 3 attachEventListeners calls
        expect(toggleSpy).toHaveBeenCalledTimes(1);
    });

    it('should render exiting columns with period-column-exit when isRetreating is true', () => {
        const periods = ['S1', 'S2'];
        const results = [
            {
                id: 's1',
                nom: 'DURAND',
                prenom: 'Paul',
                studentData: {
                    periods: {
                        S1: { grade: 12 },
                        S2: { grade: 14 }
                    }
                }
            }
        ];

        // S2 -> S1 retreat: currentPeriodIndex = 0, previousPeriod = 'S2', isRetreating = true
        ListViewRenderer.renderFresh(container, results, periods, 0, {
            isPeriodSwitch: true,
            isRetreating: true,
            isAdvancing: false,
            previousPeriod: 'S2',
            currentPeriod: 'S1'
        });

        const table = container.querySelector('.student-list-table');
        expect(table).not.toBeNull();

        // Should include both S1 (normal) and S2 (exiting) headers
        const s1Header = table.querySelector('.grade-header[data-period="S1"]');
        const s2Header = table.querySelector('.grade-header[data-period="S2"]');
        const evoHeader = table.querySelector('.evolution-header[data-period="S2"]');

        expect(s1Header).not.toBeNull();
        expect(s1Header.classList.contains('period-column-exit')).toBe(false);

        expect(s2Header).not.toBeNull();
        expect(s2Header.classList.contains('period-column-exit')).toBe(true);

        expect(evoHeader).not.toBeNull();
        expect(evoHeader.classList.contains('period-column-exit')).toBe(true);

        // Cells should also have period-column-exit for S2
        const s2Cell = table.querySelector('.grade-cell[data-period="S2"]');
        const evoCell = table.querySelector('.evolution-cell[data-period="S2"]');
        expect(s2Cell.classList.contains('period-column-exit')).toBe(true);
        expect(evoCell.classList.contains('period-column-exit')).toBe(true);

        // After 290ms, cleanup removes the exiting elements
        vi.useFakeTimers();
        container.querySelector('.student-list-view').classList.add('table-fade-in');
        // Trigger renderFresh again with fake timers to test timer behavior
        ListViewRenderer.renderFresh(container, results, periods, 0, {
            isPeriodSwitch: true,
            isRetreating: true,
            isAdvancing: false,
            previousPeriod: 'S2',
            currentPeriod: 'S1'
        });
        expect(container.querySelector('.student-list-view').classList.contains('table-fade-in')).toBe(false);
        expect(container.querySelectorAll('.period-column-exit').length).toBeGreaterThan(0);
        vi.advanceTimersByTime(290);
        expect(container.querySelectorAll('.period-column-exit').length).toBe(0);
        vi.useRealTimers();
    });

    it('should preserve .selected class on tr across renderFresh, createRowElement, and updateRowContent', () => {
        const periods = ['S1', 'S2'];
        const results = [
            { id: 's1', nom: 'DURAND', prenom: 'Paul', studentData: { periods: { S1: { grade: 12 } } } },
            { id: 's2', nom: 'MARTIN', prenom: 'Claire', studentData: { periods: { S1: { grade: 15 } } } }
        ];

        ListSelectionManager.selectedIds.clear();
        ListSelectionManager.selectedIds.add('s1');

        ListViewRenderer.renderFresh(container, results, periods, 0);

        const row1 = container.querySelector('.student-row[data-student-id="s1"]');
        const row2 = container.querySelector('.student-row[data-student-id="s2"]');
        expect(row1.classList.contains('selected')).toBe(true);
        expect(row2.classList.contains('selected')).toBe(false);

        const createdRow = ListViewRenderer.createRowElement(results[0], periods, 0);
        expect(createdRow.classList.contains('selected')).toBe(true);

        ListSelectionManager.selectedIds.delete('s1');
        ListViewRenderer.updateRowContent(row1, results[0]);
        expect(row1.classList.contains('selected')).toBe(false);
    });

    it('should distinguish past periods from current period in headers and grade cells', () => {
        const periods = ['S1', 'S2'];
        const results = [
            {
                id: 's1',
                nom: 'BERNARD',
                prenom: 'Thomas',
                studentData: {
                    periods: {
                        S1: { grade: 15.0 },
                        S2: { grade: 15.2 }
                    }
                }
            },
            {
                id: 's2',
                nom: 'PETIT',
                prenom: 'Emma',
                studentData: {
                    periods: {}
                }
            }
        ];

        appState.currentPeriod = 'S2';
        ListViewRenderer.renderFresh(container, results, periods, 1);

        const row1 = container.querySelector('.student-row[data-student-id="s1"]');
        const row1S1Val = row1.querySelector('.grade-cell[data-period="S1"] .grade-value');
        const row1S2Val = row1.querySelector('.grade-cell[data-period="S2"] .grade-value');
        expect(row1S1Val.classList.contains('past-period-grade')).toBe(true);
        expect(row1S2Val.classList.contains('current-period-grade')).toBe(true);

        const row2 = container.querySelector('.student-row[data-student-id="s2"]');
        const row2S1Empty = row2.querySelector('.grade-cell[data-period="S1"] .grade-empty');
        const row2S2Empty = row2.querySelector('.grade-cell[data-period="S2"] .grade-empty');
        expect(row2S1Empty.classList.contains('past-period-grade')).toBe(true);
        expect(row2S1Empty.textContent).toBe('NC');
        expect(row2S2Empty.classList.contains('current-period-grade')).toBe(true);
        expect(row2S2Empty.textContent).toBe('--');
    });
});

