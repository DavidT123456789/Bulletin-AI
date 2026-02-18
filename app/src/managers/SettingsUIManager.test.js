/**
 * @fileoverview Tests unitaires pour SettingsUIManager.js
 * @module managers/SettingsUIManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock des dépendances
vi.mock('../state/State.js', () => ({
    appState: {
        currentSettingsSubject: 'Français',
        subjects: {
            'MonStyle': {
                iaConfig: { length: 50, tone: 3, styleInstructions: '', voice: 'neutral', enableStyleInstructions: true }
            },
            'Français': {
                iaConfig: { length: 50, tone: 3, styleInstructions: '', voice: 'neutral' }
            }
        },
        useSubjectPersonalization: false,
        currentSubject: 'Français',
        openaiApiKey: '',
        googleApiKey: '',
        openrouterApiKey: '',
        anthropicApiKey: '',
        mistralApiKey: '',
        currentAIModel: 'gpt-4',
        evolutionThresholds: { positive: 1, veryPositive: 2, negative: -1, veryNegative: -2 },
        instructionHistory: [],
        anonymizeData: false,
        ollamaEnabled: false,
        ollamaBaseUrl: '',
        journalThreshold: 2
    },
    UIState: {
        settingsBeforeEdit: {}
    },
    userSettings: {
        academic: {}
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
        iaLengthSlider: { value: '50', disabled: false },
        iaToneSlider: { value: '3', disabled: false },
        iaStyleInstructions: { value: '', disabled: false, classList: { add: vi.fn(), remove: vi.fn() }, parentElement: { classList: { add: vi.fn(), remove: vi.fn() } } },
        iaStyleInstructionsToggle: { checked: true, disabled: false },
        openaiApiKey: { value: '' },
        googleApiKey: { value: '' },
        openrouterApiKey: { value: '' },
        anthropicApiKey: { value: '' },
        mistralApiKey: { value: '' },
        aiModelSelect: { value: 'gpt-4', querySelectorAll: vi.fn(() => []) },
        ollamaEnabledToggle: { checked: false },
        ollamaBaseUrl: { value: '' },
        settingsEvolutionThresholdPositive: { value: '1' },
        settingsEvolutionThresholdVeryPositive: { value: '2' },
        settingsEvolutionThresholdNegative: { value: '-1' },
        settingsEvolutionThresholdVeryNegative: { value: '-2' },
        settingsPrivacyAnonymizeToggle: { checked: false },
        settingsModal: {},
        personalizationToggle: { checked: false },
        genericSubjectInfo: { style: { display: 'none' }, innerHTML: '', classList: { add: vi.fn(), remove: vi.fn() } }
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

vi.mock('./DropdownManager.js', () => ({
    DropdownManager: {}
}));

vi.mock('../config/providers.js', () => ({
    PROVIDER_CONFIG: {}
}));

import { SettingsUIManager } from './SettingsUIManager.js';
import { appState, UIState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';

describe('SettingsUIManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        appState.currentSettingsSubject = 'Français';
        appState.subjects = {
            'MonStyle': {
                iaConfig: { length: 50, tone: 3, styleInstructions: '', voice: 'neutral', enableStyleInstructions: true }
            },
            'Français': {
                iaConfig: { length: 50, tone: 3, styleInstructions: '', voice: 'neutral' }
            }
        };
        appState.useSubjectPersonalization = false;
        appState.currentSubject = 'Français';
        appState.instructionHistory = [];
        UIState.settingsBeforeEdit = {};
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('_savePersonalStyleChanges()', () => {
        it('should update MonStyle iaConfig from DOM values', () => {
            DOM.iaLengthSlider.value = '75';
            DOM.iaToneSlider.value = '4';
            DOM.iaStyleInstructions.value = 'Test style';

            const mockRadio = document.createElement('input');
            mockRadio.type = 'radio';
            mockRadio.name = 'iaVoiceRadio';
            mockRadio.value = 'formal';
            mockRadio.checked = true;
            document.body.appendChild(mockRadio);

            SettingsUIManager._savePersonalStyleChanges();

            expect(appState.subjects['MonStyle'].iaConfig.length).toBe(75);
            expect(appState.subjects['MonStyle'].iaConfig.tone).toBe(4);

            document.body.removeChild(mockRadio);
        });

        it('should create MonStyle if it does not exist', () => {
            delete appState.subjects['MonStyle'];

            expect(() => {
                SettingsUIManager._savePersonalStyleChanges();
            }).not.toThrow();

            expect(appState.subjects['MonStyle']).toBeDefined();
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

        it('should save evolution thresholds with veryPositive as 4x positive', () => {
            DOM.settingsEvolutionThresholdPositive.value = '1.5';
            DOM.settingsEvolutionThresholdNegative.value = '-1';

            SettingsUIManager.saveSettings();

            expect(appState.evolutionThresholds.positive).toBe(1.5);
            expect(appState.evolutionThresholds.veryPositive).toBe(6);
        });

        it('should call StorageManager.saveAppState', () => {
            SettingsUIManager.saveSettings();

            expect(StorageManager.saveAppState).toHaveBeenCalled();
        });

        it('should close modal and show notification after timeout', () => {
            vi.useFakeTimers();

            SettingsUIManager.saveSettings();

            expect(UI.closeModal).toHaveBeenCalledWith(DOM.settingsModal);

            vi.advanceTimersByTime(260);
            expect(UI.showNotification).toHaveBeenCalledWith('Paramètres enregistrés.', 'success');
        });

        it('should call renderResults after timeout', () => {
            vi.useFakeTimers();

            SettingsUIManager.saveSettings();

            vi.advanceTimersByTime(260);
            expect(AppreciationsManager.renderResults).toHaveBeenCalled();
        });
    });

    describe('cancelSettings()', () => {
        it('should close modal immediately', () => {
            SettingsUIManager.cancelSettings();

            expect(UI.closeModal).toHaveBeenCalledWith(DOM.settingsModal);
        });

        it('should restore from snapshot after timeout', () => {
            vi.useFakeTimers();
            UIState.settingsBeforeEdit = {
                useSubjectPersonalization: true,
                subjects: { 'Test': {} },
                currentSettingsSubject: 'Test',
                currentSubject: 'Test'
            };

            SettingsUIManager.cancelSettings();

            vi.advanceTimersByTime(260);
            expect(appState.useSubjectPersonalization).toBe(true);
        });
    });

    describe('updatePersonalizationState()', () => {
        it('should update toggle checkbox state', () => {
            appState.useSubjectPersonalization = true;

            SettingsUIManager.updatePersonalizationState();

            expect(DOM.personalizationToggle.checked).toBe(true);
        });

        it('should remove collapsed class when personalization is disabled', () => {
            appState.useSubjectPersonalization = false;

            SettingsUIManager.updatePersonalizationState();

            expect(DOM.genericSubjectInfo.classList.remove).toHaveBeenCalledWith('collapsed');
        });

        it('should add collapsed class when personalization is enabled', () => {
            appState.useSubjectPersonalization = true;

            SettingsUIManager.updatePersonalizationState();

            expect(DOM.genericSubjectInfo.classList.add).toHaveBeenCalledWith('collapsed');
        });
    });
});
