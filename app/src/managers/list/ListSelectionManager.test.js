/**
 * @fileoverview Unit tests for ListSelectionManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ListSelectionManager } from './ListSelectionManager.js';
import { appState } from '../../state/State.js';

// Mock dependencies
vi.mock('../../state/State.js', () => ({
    appState: {
        generatedResults: [
            { id: 'student-1', nom: 'DUPONT', prenom: 'Jean', studentData: {} },
            { id: 'student-2', nom: 'MARTIN', prenom: 'Claire', studentData: {} },
            { id: 'student-3', nom: 'BERNARD', prenom: 'Lucas', studentData: {} }
        ],
        filteredResults: [],
        currentPeriod: 'T1'
    }
}));

vi.mock('../FocusPanelManager.js', () => ({
    FocusPanelManager: {
        handleExternalGenerationStart: vi.fn(),
        handleExternalGenerationComplete: vi.fn()
    }
}));

vi.mock('../UIManager.js', () => ({
    UI: {
        showNotification: vi.fn(),
        showHeaderProgress: vi.fn(),
        hideHeaderProgress: vi.fn(),
        updateStats: vi.fn(),
        showUndoNotification: vi.fn()
    }
}));

vi.mock('../TooltipsManager.js', () => ({
    TooltipsUI: {
        initTooltips: vi.fn()
    }
}));

vi.mock('../MassImportManager.js', () => ({
    MassImportManager: {}
}));

vi.mock('../AppreciationsManager.js', () => ({
    AppreciationsManager: {}
}));

vi.mock('../ExportManager.js', () => ({
    ExportManager: {}
}));

vi.mock('../StudentDataManager.js', () => ({
    StudentDataManager: {}
}));

vi.mock('../StorageManager.js', () => ({
    StorageManager: {}
}));

vi.mock('../ModalUIManager.js', () => ({
    ModalUI: {
        showCustomConfirm: vi.fn(),
        showChoicesModal: vi.fn()
    }
}));

describe('ListSelectionManager', () => {
    let mockCallbacks;

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = `
            <table class="student-list-table">
                <tbody>
                    <tr class="student-row" data-student-id="student-1">
                        <td class="student-name-cell">
                            <div class="student-identity-wrapper">
                                <div class="student-avatar" data-student-id="student-1">
                                    <span class="student-avatar__initials">JD</span>
                                    <div class="avatar-selection-overlay"></div>
                                </div>
                                <span class="student-nom-prenom">Jean DUPONT</span>
                            </div>
                        </td>
                    </tr>
                    <tr class="student-row" data-student-id="student-2">
                        <td class="student-name-cell">
                            <div class="student-identity-wrapper">
                                <div class="student-avatar" data-student-id="student-2">
                                    <span class="student-avatar__initials">CM</span>
                                    <div class="avatar-selection-overlay"></div>
                                </div>
                                <span class="student-nom-prenom">Claire MARTIN</span>
                            </div>
                        </td>
                    </tr>
                    <tr class="student-row" data-student-id="student-3">
                        <td class="student-name-cell">
                            <div class="student-identity-wrapper">
                                <div class="student-avatar" data-student-id="student-3">
                                    <span class="student-avatar__initials">LB</span>
                                    <div class="avatar-selection-overlay"></div>
                                </div>
                                <span class="student-nom-prenom">Lucas BERNARD</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        `;

        mockCallbacks = {
            updateStudentRow: vi.fn(),
            setRowStatus: vi.fn(),
            renderList: vi.fn(),
            clearSelections: vi.fn()
        };

        ListSelectionManager.init(mockCallbacks);
        ListSelectionManager.clearSelections();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        const toolbar = document.getElementById('selectionToolbar');
        if (toolbar) toolbar.remove();
    });

    it('should toggle selection of a student and update classes', () => {
        ListSelectionManager.toggleSelection('student-1');

        expect(ListSelectionManager.selectedIds.has('student-1')).toBe(true);

        const row = document.querySelector('.student-row[data-student-id="student-1"]');
        const wrapper = row.querySelector('.student-identity-wrapper');
        const avatar = row.querySelector('.student-avatar');

        expect(row.classList.contains('selected')).toBe(true);
        expect(wrapper.classList.contains('selected')).toBe(true);
        expect(avatar.classList.contains('is-selected')).toBe(true);

        const toolbar = document.getElementById('selectionToolbar');
        expect(toolbar).not.toBeNull();
        expect(toolbar.querySelector('#selectionCount').textContent).toBe('1 élève sélectionné');
    });

    it('should handle rapid deselect and reselect without destroying the toolbar', () => {
        // 1. Select student-1
        ListSelectionManager.toggleSelection('student-1');
        const toolbar = document.getElementById('selectionToolbar');
        expect(toolbar).not.toBeNull();

        // 2. Deselect student-1 (toolbar begins exit timeout)
        ListSelectionManager.toggleSelection('student-1');
        expect(ListSelectionManager.selectedIds.size).toBe(0);
        expect(ListSelectionManager._removeTimeout).not.toBeNull();
        expect(toolbar.classList.contains('active')).toBe(false);

        // 3. Fast-forward partially (e.g., 100ms out of 400ms)
        vi.advanceTimersByTime(100);

        // 4. Rapid reselection of student-1 before timeout expires
        ListSelectionManager.toggleSelection('student-1');
        expect(ListSelectionManager.selectedIds.has('student-1')).toBe(true);
        expect(ListSelectionManager.selectedIds.size).toBe(1);

        // 5. Verify removal timeout was cancelled and active class restored
        expect(ListSelectionManager._removeTimeout).toBeNull();
        expect(toolbar.classList.contains('active')).toBe(true);
        expect(toolbar.querySelector('#selectionCount').textContent).toBe('1 élève sélectionné');

        // 6. Fast-forward past original 400ms timeout to verify toolbar is NOT removed
        vi.advanceTimersByTime(500);
        expect(document.getElementById('selectionToolbar')).not.toBeNull();
    });

    it('should remove toolbar after exit transition when count reaches 0', () => {
        ListSelectionManager.toggleSelection('student-1');
        expect(document.getElementById('selectionToolbar')).not.toBeNull();

        ListSelectionManager.toggleSelection('student-1');
        expect(ListSelectionManager._removeTimeout).not.toBeNull();

        // Advance timers past 400ms
        vi.advanceTimersByTime(450);
        expect(document.getElementById('selectionToolbar')).toBeNull();
        expect(ListSelectionManager._removeTimeout).toBeNull();
    });

    it('should select a range of students with selectRange', () => {
        ListSelectionManager.toggleSelection('student-1');
        ListSelectionManager.selectRange('student-1', 'student-3');

        expect(ListSelectionManager.selectedIds.has('student-1')).toBe(true);
        expect(ListSelectionManager.selectedIds.has('student-2')).toBe(true);
        expect(ListSelectionManager.selectedIds.has('student-3')).toBe(true);
        expect(ListSelectionManager.selectedIds.size).toBe(3);

        const toolbar = document.getElementById('selectionToolbar');
        expect(toolbar.querySelector('#selectionCount').textContent).toBe('3 élèves sélectionnés');
    });

    it('should select all and deselect all visible rows with toggleSelectVisible', () => {
        ListSelectionManager.toggleSelectVisible(true);
        expect(ListSelectionManager.selectedIds.size).toBe(3);

        ListSelectionManager.toggleSelectVisible(false);
        expect(ListSelectionManager.selectedIds.size).toBe(0);
    });

    it('should clear all selections with clearSelections', () => {
        ListSelectionManager.toggleSelection('student-1');
        ListSelectionManager.toggleSelection('student-2');
        expect(ListSelectionManager.selectedIds.size).toBe(2);

        ListSelectionManager.clearSelections();
        expect(ListSelectionManager.selectedIds.size).toBe(0);
        expect(ListSelectionManager.lastSelectedId).toBeNull();

        const selectedRows = document.querySelectorAll('.student-row.selected');
        expect(selectedRows.length).toBe(0);
    });
});
