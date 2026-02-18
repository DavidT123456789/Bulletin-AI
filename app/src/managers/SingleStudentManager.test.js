/**
 * @fileoverview Tests unitaires pour SingleStudentManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SingleStudentManager } from './SingleStudentManager.js';

// Mock des dépendances
vi.mock('../state/State.js', () => ({
    appState: {
        generatedResults: [],
        filteredResults: [],
        currentPeriod: 'T1',
        currentEditingId: null,
        useSubjectPersonalization: true,
        currentSubject: 'Français'
    },
    userSettings: {
        academic: {
            currentClassId: null
        }
    },
    runtimeState: {
        data: {
            deletedItems: { students: [], classes: [] }
        }
    }
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {
        nomInput: { value: '', focus: vi.fn() },
        prenomInput: { value: '' },
        negativeInstructions: { value: '' },
        currentPeriodGrade: { value: '' },
        generateAndNextBtn: {},
        generateAppreciationBtn: {},
        actualSingleStudentForm: { reset: vi.fn() },
        loadStudentSelect: { value: '' },
        appLayout: { classList: { contains: vi.fn(() => false) } },
        searchInput: { value: '' }
    }
}));

vi.mock('../utils/Utils.js', () => ({
    Utils: {
        validateInput: vi.fn(() => true),
        validateGrade: vi.fn(() => true),
        getPeriods: vi.fn(() => ['T1', 'T2', 'T3']),
        normalizeName: vi.fn((nom, prenom) => `${nom}_${prenom}`.toLowerCase()),
        translateErrorMessage: vi.fn(msg => msg)
    }
}));

vi.mock('./UIManager.js', () => ({
    UI: {
        showNotification: vi.fn(),
        showInlineSpinner: vi.fn(),
        hideInlineSpinner: vi.fn(),
        showCustomConfirm: vi.fn((msg, callback) => callback()),
        switchToCreationModeUI: vi.fn(),
        switchToEditModeUI: vi.fn(),
        updateStats: vi.fn(),
        updateResultsHeaderVisibility: vi.fn(),
        updateResultCard: vi.fn(),
        renderResultCard: vi.fn(),
        toggleSidebar: vi.fn(),
        showHeaderProgress: vi.fn(),
        hideHeaderProgress: vi.fn(),
        updateGenerateButtonState: vi.fn()
    }
}));

vi.mock('./AppreciationsManager.js', () => ({
    AppreciationsManager: {
        renderResults: vi.fn()
    }
}));

vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
}));

import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';

describe('SingleStudentManager', () => {
    let mockApp;
    let mockAppreciationsManager;

    beforeEach(() => {
        mockApp = {
            _updateInstructionHistory: vi.fn()
        };
        mockAppreciationsManager = {
            generateAppreciation: vi.fn(() => Promise.resolve({
                id: 'new-id-1',
                appreciation: 'Test appreciation',
                studentData: {
                    periods: { T1: { grade: 12 } },
                    currentPeriod: 'T1',
                    subject: 'Français',
                    statuses: [],
                    prompts: {}
                },
                timestamp: Date.now(),
                evolutions: {},
                tokenUsage: {}
            })),
            renderResults: vi.fn()
        };
        SingleStudentManager.init(mockApp, mockAppreciationsManager);

        // Reset mocks
        vi.clearAllMocks();

        // Reset appState
        appState.generatedResults = [];
        appState.filteredResults = [];
        appState.currentEditingId = null;
        appState.currentPeriod = 'T1';

        // Mock document.getElementById and querySelectorAll
        document.getElementById = vi.fn((id) => {
            // Provide a valid grade for current period by default
            if (id === 'moyT1') return { value: '12', classList: { add: vi.fn() }, id: 'moyT1' };
            if (id.startsWith('moy')) return { value: '', classList: { add: vi.fn() } };
            if (id.startsWith('app')) return { value: '' };
            if (id.endsWith('Error')) return { textContent: '', style: { display: 'none' } };
            return null;
        });
        document.querySelectorAll = vi.fn(() => []);
        document.querySelector = vi.fn(() => null);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('init', () => {
        it('should initialize with app instance', () => {
            const appInstance = { test: true };
            SingleStudentManager.init(appInstance);
            expect(true).toBe(true);
        });
    });

    describe('validateForm', () => {
        it('should return true when form is valid', () => {
            const result = SingleStudentManager.validateForm();
            expect(result).toBe(true);
        });

        it('should return false when nom is invalid', () => {
            Utils.validateInput.mockReturnValueOnce(false);

            const result = SingleStudentManager.validateForm();

            expect(result).toBe(false);
        });

        it('should return false when current period grade is empty', () => {
            document.getElementById = vi.fn((id) => {
                if (id === 'moyT1') return {
                    value: '',
                    classList: { add: vi.fn() },
                    id: 'moyT1'
                };
                if (id === 'moyT1Error') return {
                    textContent: '',
                    style: { display: 'none' }
                };
                return { value: '12' };
            });

            const result = SingleStudentManager.validateForm();

            expect(result).toBe(false);
        });
    });

    describe('getFormData', () => {
        it('should return form data object', () => {
            DOM.nomInput.value = 'MARTIN';
            DOM.prenomInput.value = 'Lucas';
            DOM.negativeInstructions.value = 'Test instructions';

            const data = SingleStudentManager.getFormData();

            expect(data.nom).toBe('MARTIN');
            expect(data.prenom).toBe('Lucas');
            expect(data.periods.T1.context).toBe('Test instructions');
            expect(data.currentPeriod).toBe('T1');
        });

        it('should parse numeric grades correctly', () => {
            DOM.currentPeriodGrade.value = '12,5';
            document.getElementById = vi.fn((id) => {
                if (id === 'appT1') return { value: 'Bon travail' };
                return { value: '' };
            });

            const data = SingleStudentManager.getFormData();

            expect(data.periods.T1.grade).toBe(12.5);
            expect(data.periods.T1.appreciation).toBe('Bon travail');
        });
    });

    describe('generateAppreciation', () => {
        beforeEach(() => {
            DOM.nomInput.value = 'MARTIN';
            DOM.prenomInput.value = 'Lucas';
        });

        it('should show error if form is invalid', async () => {
            Utils.validateInput.mockReturnValueOnce(false);

            await SingleStudentManager.generateAppreciation();

            expect(UI.showNotification).toHaveBeenCalledWith(
                'Corrigez les erreurs dans le formulaire.',
                'error'
            );
        });

        it('should call generateAppreciation on AppreciationsManager', async () => {
            await SingleStudentManager.generateAppreciation();

            expect(mockAppreciationsManager.generateAppreciation).toHaveBeenCalled();
        });

        it('should show success notification', async () => {
            await SingleStudentManager.generateAppreciation();

            expect(UI.showNotification).toHaveBeenCalledWith('Appréciation générée !', 'success');
        });

        it('should handle errors gracefully', async () => {
            mockAppreciationsManager.generateAppreciation.mockRejectedValueOnce(new Error('API Error'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await SingleStudentManager.generateAppreciation();

            expect(UI.showNotification).toHaveBeenCalledWith(expect.stringContaining('Erreur'), 'error');

            consoleSpy.mockRestore();
        });
    });

    describe('updateAppreciation', () => {
        beforeEach(() => {
            appState.currentEditingId = 'existing-id';
            appState.generatedResults = [{
                id: 'existing-id',
                nom: 'MARTIN',
                prenom: 'Lucas',
                appreciation: 'Old appreciation',
                studentData: { periods: {}, prompts: {} }
            }];
        });

        it('should show error if no editing id', async () => {
            appState.currentEditingId = null;

            await SingleStudentManager.updateAppreciation();

            expect(UI.showNotification).toHaveBeenCalledWith(
                expect.stringContaining('Formulaire invalide'),
                'error'
            );
        });

        it('should update existing result', async () => {
            await SingleStudentManager.updateAppreciation();

            expect(mockAppreciationsManager.generateAppreciation).toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalledWith('Appréciation mise à jour !', 'success');
        });
    });

    describe('switchToCreationMode', () => {
        it('should reset currentEditingId', () => {
            appState.currentEditingId = 'some-id';

            SingleStudentManager.switchToCreationMode();

            expect(appState.currentEditingId).toBeNull();
        });

        it('should call switchToCreationModeUI', () => {
            SingleStudentManager.switchToCreationMode();

            expect(UI.switchToCreationModeUI).toHaveBeenCalled();
        });
    });

    describe('resetForm', () => {
        it('should reset form values', () => {
            DOM.nomInput.value = 'TEST';

            SingleStudentManager.resetForm();

            expect(DOM.nomInput.value).toBe('');
        });

        it('should focus nom input when forNext is true', () => {
            SingleStudentManager.resetForm(true);

            expect(DOM.nomInput.focus).toHaveBeenCalled();
        });
    });

    describe('loadIntoForm', () => {
        const mockResult = {
            id: 'test-id',
            nom: 'MARTIN',
            prenom: 'Lucas',
            studentData: {
                statuses: ['Félicitations'],
                periods: {
                    T1: { grade: 15, appreciation: 'Excellent', context: 'Test' }
                }
            }
        };

        beforeEach(() => {
            appState.generatedResults = [mockResult];
            // loadIntoForm accesses getElementById for grade/appreciation inputs
            document.getElementById = vi.fn((id) => {
                if (id === 'searchInput') return { value: '' };
                if (id.startsWith('moy')) return { value: '' };
                if (id.startsWith('app')) return { value: '' };
                return null;
            });
        });

        it('should reset form if no id provided', () => {
            SingleStudentManager.loadIntoForm(null);

            expect(appState.currentEditingId).toBeNull();
        });

        it('should load student data into form', () => {
            SingleStudentManager.loadIntoForm('test-id');

            expect(DOM.nomInput.value).toBe('MARTIN');
            expect(DOM.prenomInput.value).toBe('Lucas');
            expect(appState.currentEditingId).toBe('test-id');
        });

        it('should show notification', () => {
            SingleStudentManager.loadIntoForm('test-id');

            expect(UI.showNotification).toHaveBeenCalledWith(
                'Modification de Lucas MARTIN.',
                'info'
            );
        });
    });

    describe('edit', () => {
        it('should call loadIntoForm and focus', async () => {
            appState.generatedResults = [{
                id: 'test-id',
                nom: 'MARTIN',
                prenom: 'Lucas',
                studentData: { statuses: [], periods: {} }
            }];

            SingleStudentManager.edit('test-id');

            expect(appState.currentEditingId).toBe('test-id');
        });
    });

    describe('delete', () => {
        beforeEach(() => {
            appState.generatedResults = [{
                id: 'test-id',
                nom: 'MARTIN',
                prenom: 'Lucas'
            }];
            appState.filteredResults = [{ id: 'test-id' }];
        });

        it('should remove result from generatedResults', async () => {
            SingleStudentManager.delete('test-id');
            // showCustomConfirm callback is async, give it time to complete
            await vi.dynamicImportSettled();
            await new Promise(r => setTimeout(r, 0));

            expect(appState.generatedResults).toHaveLength(0);
        });

        it('should save app state', async () => {
            SingleStudentManager.delete('test-id');
            await vi.dynamicImportSettled();
            await new Promise(r => setTimeout(r, 0));

            expect(StorageManager.saveAppState).toHaveBeenCalled();
        });

        it('should show success notification', async () => {
            SingleStudentManager.delete('test-id');
            await vi.dynamicImportSettled();
            await new Promise(r => setTimeout(r, 0));

            expect(UI.showNotification).toHaveBeenCalledWith('Supprimée.', 'success');
        });
    });
});
