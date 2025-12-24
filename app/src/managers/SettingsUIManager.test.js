/**
 * @fileoverview Tests unitaires pour SettingsUIManager.js
 * @module managers/SettingsUIManager.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock des dépendances
vi.mock('../state/State.js', () => ({
    appState: {
        currentSettingsSubject: 'Français',
        subjects: {
            'Français': {
                iaConfig: { length: 50, tone: 3, styleInstructions: '', voice: 'neutral' }
            }
        },
        useSubjectPersonalization: false,
        currentSubject: 'Français',
        openaiApiKey: '',
        googleApiKey: '',
        openrouterApiKey: '',
        currentAIModel: 'gpt-4',
        evolutionThresholds: { positive: 1, veryPositive: 2, negative: -1, veryNegative: -2 },
        instructionHistory: []
    },
    UIState: {
        settingsBeforeEdit: {}
    }
}));

vi.mock('../config/Config.js', () => ({
    DEFAULT_PROMPT_TEMPLATES: {
        'Français': {
            iaConfig: { length: 50, tone: 3, styleInstructions: '', voice: 'neutral' }
        }
    },
    DEFAULT_IA_CONFIG: { length: 50, tone: 3, styleInstructions: '', voice: 'neutral' }
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {
        iaLengthSlider: { value: '50' },
        iaToneSlider: { value: '3' },
        iaStyleInstructions: { value: '' },
        openaiApiKey: { value: '' },
        googleApiKey: { value: '' },
        openrouterApiKey: { value: '' },
        aiModelSelect: { value: 'gpt-4' },
        settingsEvolutionThresholdPositive: { value: '1' },
        settingsEvolutionThresholdVeryPositive: { value: '2' },
        settingsEvolutionThresholdNegative: { value: '-1' },
        settingsEvolutionThresholdVeryNegative: { value: '-2' },
        settingsModal: {},
        newSubjectInput: { value: '' },
        subjectManagementList: { innerHTML: '' },
        settingsSubjectSelect: { innerHTML: '' },
        personalizationToggle: { checked: false },
        genericSubjectInfo: { style: { display: 'none' }, innerHTML: '' }
    }
}));

vi.mock('./UIManager.js', () => ({
    UI: {
        closeModal: vi.fn(),
        showNotification: vi.fn(),
        showCustomConfirm: vi.fn((msg, cb) => cb()),
        updateSettingsFields: vi.fn(),
        updateSettingsPromptFields: vi.fn(),
        renderSettingsLists: vi.fn()
    }
}));

vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
}));

vi.mock('./AppreciationsManager.js', () => ({
    AppreciationsManager: {
        renderResults: vi.fn()
    }
}));

import { SettingsUIManager } from './SettingsUIManager.js';
import { appState, UIState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { DEFAULT_PROMPT_TEMPLATES, DEFAULT_IA_CONFIG } from '../config/Config.js';

describe('SettingsUIManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Reset état
        appState.currentSettingsSubject = 'Français';
        appState.subjects = {
            'Français': {
                iaConfig: { length: 50, tone: 3, styleInstructions: '', voice: 'neutral' }
            }
        };
        appState.useSubjectPersonalization = false;
        appState.currentSubject = 'Français';
        appState.instructionHistory = [];
        UIState.settingsBeforeEdit = {};
    });

    describe('_saveCurrentSettingsSubjectChanges()', () => {
        it('should update subject iaConfig from DOM values', () => {
            DOM.iaLengthSlider.value = '75';
            DOM.iaToneSlider.value = '4';
            DOM.iaStyleInstructions.value = 'Test style';

            // Mock radio button
            const mockRadio = document.createElement('input');
            mockRadio.type = 'radio';
            mockRadio.name = 'iaVoiceRadio';
            mockRadio.value = 'formal';
            mockRadio.checked = true;
            document.body.appendChild(mockRadio);

            SettingsUIManager._saveCurrentSettingsSubjectChanges();

            expect(appState.subjects['Français'].iaConfig.length).toBe(75);
            expect(appState.subjects['Français'].iaConfig.tone).toBe(4);
            expect(appState.subjects['Français'].iaConfig.styleInstructions).toBe('Test style');

            document.body.removeChild(mockRadio);
        });

        it('should not throw if subject does not exist', () => {
            appState.currentSettingsSubject = 'NonExistent';

            expect(() => {
                SettingsUIManager._saveCurrentSettingsSubjectChanges();
            }).not.toThrow();
        });
    });

    describe('saveSettings()', () => {
        it('should save API keys from DOM', () => {
            DOM.openaiApiKey.value = ' test-key-123 ';
            DOM.googleApiKey.value = ' google-key ';

            SettingsUIManager.saveSettings();

            expect(appState.openaiApiKey).toBe('test-key-123');
            expect(appState.googleApiKey).toBe('google-key');
        });

        it('should save evolution thresholds', () => {
            DOM.settingsEvolutionThresholdPositive.value = '1.5';
            DOM.settingsEvolutionThresholdVeryPositive.value = '3';

            SettingsUIManager.saveSettings();

            expect(appState.evolutionThresholds.positive).toBe(1.5);
            expect(appState.evolutionThresholds.veryPositive).toBe(3);
        });

        it('should call StorageManager.saveAppState', () => {
            SettingsUIManager.saveSettings();

            expect(StorageManager.saveAppState).toHaveBeenCalled();
        });

        it('should close modal and show notification', () => {
            SettingsUIManager.saveSettings();

            expect(UI.closeModal).toHaveBeenCalledWith(DOM.settingsModal);
            expect(UI.showNotification).toHaveBeenCalledWith('Paramètres enregistrés.', 'success');
        });

        it('should sync current subject when personalization is enabled', () => {
            appState.useSubjectPersonalization = true;
            appState.currentSettingsSubject = 'Maths';
            appState.subjects['Maths'] = { iaConfig: {}, vocabulaire: {} };

            SettingsUIManager.saveSettings();

            expect(appState.currentSubject).toBe('Maths');
        });

        it('should call renderResults', () => {
            SettingsUIManager.saveSettings();

            expect(AppreciationsManager.renderResults).toHaveBeenCalled();
        });
    });

    describe('cancelSettings()', () => {
        it('should restore previous settings from UIState', () => {
            UIState.settingsBeforeEdit = {
                useSubjectPersonalization: true,
                subjects: { 'Test': {} },
                currentSettingsSubject: 'Test',
                currentSubject: 'Test'
            };

            SettingsUIManager.cancelSettings();

            expect(appState.useSubjectPersonalization).toBe(true);
            expect(appState.currentSettingsSubject).toBe('Test');
        });

        it('should call updatePersonalizationState', () => {
            const spy = vi.spyOn(SettingsUIManager, 'updatePersonalizationState');

            SettingsUIManager.cancelSettings();

            expect(spy).toHaveBeenCalled();
        });

        it('should close modal', () => {
            SettingsUIManager.cancelSettings();

            expect(UI.closeModal).toHaveBeenCalledWith(DOM.settingsModal);
        });
    });

    describe('addSubject()', () => {
        it('should not add subject if name is empty', () => {
            DOM.newSubjectInput.value = '   ';

            SettingsUIManager.addSubject();

            expect(UI.showNotification).not.toHaveBeenCalled();
        });

        it('should show warning if subject already exists', () => {
            DOM.newSubjectInput.value = 'Français';

            SettingsUIManager.addSubject();

            expect(UI.showNotification).toHaveBeenCalledWith('Cette matière existe déjà.', 'warning');
        });

        it('should add new subject with default config', () => {
            DOM.newSubjectInput.value = 'Histoire';

            SettingsUIManager.addSubject();

            expect(appState.subjects['Histoire']).toBeDefined();
            expect(appState.subjects['Histoire'].iaConfig).toBeDefined();
        });

        it('should set new subject as current settings subject', () => {
            DOM.newSubjectInput.value = 'Géographie';

            SettingsUIManager.addSubject();

            expect(appState.currentSettingsSubject).toBe('Géographie');
        });

        it('should clear input after adding', () => {
            DOM.newSubjectInput.value = 'Physique';

            SettingsUIManager.addSubject();

            expect(DOM.newSubjectInput.value).toBe('');
        });

        it('should show success notification', () => {
            DOM.newSubjectInput.value = 'Chimie';

            SettingsUIManager.addSubject();

            expect(UI.showNotification).toHaveBeenCalledWith(expect.stringContaining('Chimie'), 'success');
        });
    });

    describe('deleteSubject()', () => {
        it('should show error if trying to delete last subject', () => {
            appState.subjects = { 'Français': {} };

            SettingsUIManager.deleteSubject('Français');

            expect(UI.showNotification).toHaveBeenCalledWith(expect.stringContaining('dernière matière'), 'error');
        });

        it('should show warning for default subjects', () => {
            appState.subjects = { 'Français': {}, 'Maths': {} };

            SettingsUIManager.deleteSubject('Français');

            expect(UI.showNotification).toHaveBeenCalledWith(expect.stringContaining('par défaut'), 'warning');
        });

        it('should delete custom subject after confirmation', () => {
            appState.subjects = { 'Français': {}, 'CustomSubject': {} };

            SettingsUIManager.deleteSubject('CustomSubject');

            expect(appState.subjects['CustomSubject']).toBeUndefined();
        });

        it('should update currentSettingsSubject after deletion', () => {
            appState.subjects = { 'Français': {}, 'CustomSubject': {} };
            appState.currentSettingsSubject = 'CustomSubject';

            SettingsUIManager.deleteSubject('CustomSubject');

            expect(appState.currentSettingsSubject).toBe('Français');
        });
    });

    describe('renderSubjectManagementList()', () => {
        it('should not throw if list element is null', () => {
            DOM.subjectManagementList = null;

            expect(() => {
                SettingsUIManager.renderSubjectManagementList();
            }).not.toThrow();
        });

        it('should update settingsSubjectSelect options', () => {
            DOM.subjectManagementList = { innerHTML: '' };
            appState.subjects = { 'Français': {}, 'Maths': {} };

            SettingsUIManager.renderSubjectManagementList();

            expect(DOM.settingsSubjectSelect.innerHTML).toContain('Français');
            expect(DOM.settingsSubjectSelect.innerHTML).toContain('Maths');
        });
    });

    describe('updatePersonalizationState()', () => {
        it('should update toggle checkbox state', () => {
            appState.useSubjectPersonalization = true;

            SettingsUIManager.updatePersonalizationState();

            expect(DOM.personalizationToggle.checked).toBe(true);
        });

        it('should show generic info when personalization is disabled', () => {
            appState.useSubjectPersonalization = false;

            SettingsUIManager.updatePersonalizationState();

            expect(DOM.genericSubjectInfo.style.display).toBe('block');
        });

        it('should hide generic info when personalization is enabled', () => {
            appState.useSubjectPersonalization = true;

            SettingsUIManager.updatePersonalizationState();

            expect(DOM.genericSubjectInfo.style.display).toBe('none');
        });
    });

    // Tests addVocabItem et handleVocabItemKeydown supprimés - fonctionnalité vocabulaire dépréciée
});
