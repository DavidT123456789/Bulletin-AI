/**
 * @fileoverview Unit tests for ListSelectionManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ListSelectionManager } from './ListSelectionManager.js';
import { appState, userSettings } from '../../state/State.js';
import { ModalUI } from '../ModalUIManager.js';
import { AppreciationsManager } from '../AppreciationsManager.js';
import { ClassManager } from '../ClassManager.js';
import { ClassUIManager } from '../ClassUIManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { StudentDataManager } from '../StudentDataManager.js';
import { UI } from '../UIManager.js';

// Mock dependencies
vi.mock('../../state/State.js', () => ({
    appState: {
        generatedResults: [
            { id: 'student-1', nom: 'DUPONT', prenom: 'Jean', studentData: {} },
            { id: 'student-2', nom: 'MARTIN', prenom: 'Claire', studentData: {} },
            { id: 'student-3', nom: 'BERNARD', prenom: 'Lucas', studentData: {} }
        ],
        filteredResults: [],
        classes: [],
        currentClassId: null,
        currentPeriod: 'T1'
    },
    userSettings: {
        academic: {
            classes: [],
            currentClassId: null
        }
    },
    runtimeState: {
        data: {
            deletedItems: { students: [], classes: [] }
        }
    }
}));

vi.mock('../FocusPanelManager.js', () => ({
    FocusPanelManager: {
        isOpen: false,
        currentStudentId: null,
        close: vi.fn(),
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
    AppreciationsManager: {
        renderResults: vi.fn()
    }
}));

vi.mock('../ClassManager.js', () => ({
    ClassManager: {
        getVirtualClasses: vi.fn(() => []),
        getAllClasses: vi.fn(() => []),
        setCurrentClass: vi.fn()
    }
}));

vi.mock('../ClassUIManager.js', () => ({
    ClassUIManager: {
        updateStudentCount: vi.fn(),
        renderClassList: vi.fn(),
        updateHeaderDisplay: vi.fn(),
        handleClassSwitch: vi.fn()
    }
}));

vi.mock('../ResultsUIManager.js', () => ({
    ResultsUIManager: {
        updateGenerateButtonState: vi.fn()
    }
}));

vi.mock('../ExportManager.js', () => ({
    ExportManager: {}
}));

vi.mock('../StudentDataManager.js', async (importOriginal) => ({
    StudentDataManager: {
        ...(await importOriginal()).StudentDataManager,
        deleteStudent: vi.fn()
    }
}));

vi.mock('../StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
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
        const avatar = row.querySelector('.student-avatar');

        expect(row.classList.contains('selected')).toBe(true);
        expect(avatar.classList.contains('is-selected')).toBe(true);

        const toolbar = document.getElementById('selectionToolbar');
        expect(toolbar).not.toBeNull();
        expect(toolbar.querySelector('#selectionCount').textContent).toBe('1');
        expect(toolbar.querySelector('#selectionCount').getAttribute('aria-label')).toBe('1 élève sélectionné');
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
        expect(toolbar.querySelector('#selectionCount').textContent).toBe('1');

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
        expect(toolbar.querySelector('#selectionCount').textContent).toBe('3');
        expect(toolbar.querySelector('#selectionCount').getAttribute('aria-label')).toBe('3 élèves sélectionnés');
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

    describe('bulkDelete', () => {
        it('should call renderList and update global UI when some students remain', async () => {
            ModalUI.showCustomConfirm.mockResolvedValue(true);
            appState.generatedResults = [
                { id: 'student-1', nom: 'DUPONT', prenom: 'Jean' },
                { id: 'student-2', nom: 'MARTIN', prenom: 'Claire' }
            ];
            StudentDataManager.deleteStudent.mockImplementation((id) => {
                appState.generatedResults = appState.generatedResults.filter(r => r.id !== id);
            });

            await ListSelectionManager.bulkDelete(['student-1']);

            expect(ListSelectionManager.selectedIds.size).toBe(0);
            expect(mockCallbacks.renderList).toHaveBeenCalled();
            expect(ClassUIManager.updateStudentCount).toHaveBeenCalled();
            expect(UI.updateStats).toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalled();
        });

        it('should call AppreciationsManager.renderResults when all students of class are deleted', async () => {
            ModalUI.showCustomConfirm.mockResolvedValue(true);
            appState.generatedResults = [
                { id: 'student-1', nom: 'DUPONT', prenom: 'Jean' }
            ];
            StudentDataManager.deleteStudent.mockImplementation((id) => {
                appState.generatedResults = appState.generatedResults.filter(r => r.id !== id);
            });

            await ListSelectionManager.bulkDelete(['student-1']);

            expect(ListSelectionManager.selectedIds.size).toBe(0);
            expect(AppreciationsManager.renderResults).toHaveBeenCalled();
            expect(ClassUIManager.updateStudentCount).toHaveBeenCalled();
            expect(UI.updateStats).toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalled();
        });
    });

    describe('bulkRegenerate', () => {
        it('should process selected students following visual sort order instead of selection order', async () => {
            appState.generatedResults = [
                { id: 'student-1', nom: 'PETIT', prenom: 'Emma', studentData: { periods: { T1: { grade: 10 } } } },
                { id: 'student-2', nom: 'BERNARD', prenom: 'Thomas', studentData: { periods: { T1: { grade: 15 } } } },
                { id: 'student-3', nom: 'DURAND', prenom: 'Sophie', studentData: { periods: { T1: { grade: 12 } } } }
            ];
            appState.sortState = { field: 'name', direction: 'asc' };

            const callOrder = [];
            AppreciationsManager.generateAppreciation = vi.fn().mockImplementation(async (sd) => {
                callOrder.push(sd.id);
                return { id: sd.id, appreciation: 'Nouvelle appréciation', studentData: sd };
            });
            StudentDataManager.updateResult = vi.fn((orig, next) => ({ ...orig, ...next }));

            // Pass IDs in non-alphabetical order (PETIT, DURAND, BERNARD)
            await ListSelectionManager.bulkRegenerate(['student-1', 'student-3', 'student-2']);

            // Expect calls in alphabetical order: BERNARD (student-2), DURAND (student-3), PETIT (student-1)
            expect(callOrder).toEqual(['student-2', 'student-3', 'student-1']);
        });
    });

    describe('confirmAndDeleteStudents & bulkReset (shared students & empty content guard)', () => {
        beforeEach(() => {
            vi.clearAllMocks();
            userSettings.academic.classes = [
                { id: 'cls-31', name: '3°1', isGroup: false },
                { id: 'grp-papd', name: 'PAPD', isGroup: true }
            ];
            userSettings.academic.currentClassId = 'grp-papd';
            appState.classes = userSettings.academic.classes;
            appState.currentClassId = 'grp-papd';
            FocusPanelManager.isOpen = false;
            FocusPanelManager.currentStudentId = null;
        });

        it('should use contextual "Retirer de PAPD" wording and preserve other class enrollments when student is shared', async () => {
            appState.generatedResults = [
                { id: 's-31', nom: 'MIRZAI', prenom: 'Brikhna', classId: 'cls-31', studentData: {} },
                { id: 's-papd', nom: 'MIRZAI', prenom: 'Brikhna', classId: 'grp-papd', studentData: {} },
                { id: 's-other', nom: 'MOLET', prenom: 'Nolan', classId: 'grp-papd', studentData: {} }
            ];
            appState.filteredResults = appState.generatedResults.filter(r => r.classId === 'grp-papd');
            ModalUI.showCustomConfirm.mockResolvedValueOnce(true);
            StudentDataManager.deleteStudent.mockImplementation(async (id) => {
                appState.generatedResults = appState.generatedResults.filter(r => r.id !== id);
                appState.filteredResults = appState.filteredResults.filter(r => r.id !== id);
                return true;
            });

            const confirmed = await ListSelectionManager.confirmAndDeleteStudents(['s-papd']);

            expect(confirmed).toBe(true);
            expect(ModalUI.showCustomConfirm).toHaveBeenCalledWith(
                expect.stringContaining('3ᵉ1'),
                null,
                null,
                expect.objectContaining({
                    title: 'Retirer MIRZAI Brikhna de PAPD ?',
                    confirmText: 'Retirer',
                    isDanger: true
                })
            );
            // Only the PAPD ficha is deleted; 3°1 ficha remains untouched
            expect(StudentDataManager.deleteStudent).toHaveBeenCalledTimes(1);
            expect(StudentDataManager.deleteStudent).toHaveBeenCalledWith('s-papd');
            expect(appState.generatedResults.find(r => r.id === 's-31')).toBeDefined();
            expect(UI.showNotification).toHaveBeenCalledWith('Fiche de MIRZAI Brikhna retirée de « PAPD ».', 'success');
        });

        it('should close FocusPanel if open on deleted student and fall back to real class when virtual class becomes empty', async () => {
            userSettings.academic.currentClassId = 'virtual_31';
            appState.currentClassId = 'virtual_31';
            appState.generatedResults = [
                { id: 's-papd', nom: 'MIRZAI', prenom: 'Brikhna', classId: 'grp-papd', studentData: { classe: '3°1' } }
            ];
            appState.filteredResults = [...appState.generatedResults];
            FocusPanelManager.isOpen = true;
            FocusPanelManager.currentStudentId = 's-papd';
            ClassManager.getAllClasses.mockReturnValue([{ id: 'grp-papd', name: 'PAPD' }]);
            ModalUI.showCustomConfirm.mockResolvedValueOnce(true);
            StudentDataManager.deleteStudent.mockImplementation(async (id) => {
                appState.generatedResults = appState.generatedResults.filter(r => r.id !== id);
                appState.filteredResults = appState.filteredResults.filter(r => r.id !== id);
                return true;
            });

            await ListSelectionManager.confirmAndDeleteStudents(['s-papd']);

            expect(FocusPanelManager.close).toHaveBeenCalledTimes(1);
            expect(ClassUIManager.handleClassSwitch).toHaveBeenCalledWith('grp-papd');
        });

        it('should show an early info toast instead of opening an empty choices modal when student has zero content to erase', async () => {
            appState.generatedResults = [
                { id: 's-empty', nom: 'MIRZAI', prenom: 'Brikhna', classId: 'grp-papd', isPending: true, studentPhoto: null, journal: [], studentData: { periods: {} } }
            ];

            await ListSelectionManager.bulkReset(['s-empty']);

            expect(ModalUI.showChoicesModal).not.toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalledWith('Aucun contenu à effacer sur cette fiche.', 'info');
        });
    });
});
