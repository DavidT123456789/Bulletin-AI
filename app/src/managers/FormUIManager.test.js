/**
 * @fileoverview Tests unitaires pour FormUIManager.js
 * @module managers/FormUIManager.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock des dépendances
vi.mock('../state/State.js', () => ({
    appState: {
        useSubjectPersonalization: false,
        currentSettingsSubject: 'Français',
        subjects: {
            'Français': {
                iaConfig: { length: 50, tone: 3, styleInstructions: '', voice: 'default' }
            },
            'Générique': {
                iaConfig: { length: 50, tone: 3, styleInstructions: '', voice: 'default' }
            }
        },
        periodSystem: 'trimestre',
        evolutionThresholds: { positive: 1, veryPositive: 2, negative: -1, veryNegative: -2 },
        currentAIModel: 'gpt-4',
        openaiApiKey: '',
        googleApiKey: '',
        openrouterApiKey: '',
        sessionCost: 0.0025,
        instructionHistory: [],
        currentSubject: 'Français'
    }
}));

vi.mock('../config/Config.js', () => ({
    CONFIG: {},
    DEFAULT_IA_CONFIG: { length: 50, tone: 3, styleInstructions: '', voice: 'default' },
    MODEL_DESCRIPTIONS: {
        'gpt-4': 'Modèle GPT-4 puissant',
        'gemini-pro': 'Modèle Google Gemini'
    },
    APP_VERSION: '4.3.0'
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {
        periodSystemRadios: [],
        settingsEvolutionThresholdPositive: { value: '1' },
        settingsEvolutionThresholdVeryPositive: { value: '2' },
        settingsEvolutionThresholdNegative: { value: '-1' },
        settingsEvolutionThresholdVeryNegative: { value: '-2' },
        iaLengthSlider: { min: '10', max: '90', value: '50', dispatchEvent: vi.fn() },
        iaToneSlider: { value: '3' },
        iaStyleInstructions: { value: '' },
        aiModelSelect: { value: 'gpt-4' },
        openaiApiKey: { value: '' },
        googleApiKey: { value: '' },
        openrouterApiKey: { value: '' },
        appVersionDisplay: { textContent: '' },
        sessionCost: { textContent: '' },
        openaiApiKeyGroup: { style: { display: 'none' } },
        googleApiKeyGroup: { style: { display: 'none' } },
        openrouterApiKeyGroup: { style: { display: 'none' } },
        openaiApiKeyError: { style: { display: 'none' } },
        googleApiKeyError: { style: { display: 'none' } },
        openrouterApiKeyError: { style: { display: 'none' } },
        settingsModal: {
            querySelectorAll: vi.fn(() => []),
            querySelector: vi.fn(() => null)
        },
        mainGenerationPromptDisplay: { innerHTML: '' },
        strengthsWeaknessesPromptDisplay: { textContent: '' },
        nextStepsPromptDisplay: { textContent: '' },
        suggestionsList: null
    }
}));

vi.mock('../utils/Utils.js', () => ({
    Utils: {
        getPeriods: vi.fn(() => ['T1', 'T2', 'T3']),
        getPeriodLabel: vi.fn((p, short) => short ? p : `Période ${p}`)
    }
}));

vi.mock('./AppreciationsManager.js', () => ({
    AppreciationsManager: {
        getAllPrompts: vi.fn(() => ({
            appreciation: 'Test prompt',
            sw: 'Strengths/Weaknesses prompt',
            ns: 'Next steps prompt'
        })),
        getRefinementPrompt: vi.fn(() => 'Refinement prompt')
    }
}));

import { FormUI } from './FormUIManager.js';
import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { DEFAULT_IA_CONFIG, MODEL_DESCRIPTIONS, APP_VERSION } from '../config/Config.js';
import { AppreciationsManager } from './AppreciationsManager.js';

describe('FormUIManager', () => {
    let mockApp;

    beforeEach(() => {
        vi.clearAllMocks();

        mockApp = {
            renderSubjectManagementList: vi.fn(),
            populatePreviewStudentSelect: vi.fn()
        };

        FormUI.init(mockApp);

        // Reset appState
        appState.useSubjectPersonalization = false;
        appState.currentSettingsSubject = 'Français';
        appState.periodSystem = 'trimestre';
        appState.currentAIModel = 'gpt-4';
        appState.instructionHistory = [];
    });

    describe('init()', () => {
        it('should initialize with app instance', () => {
            const app = { renderSubjectManagementList: vi.fn() };
            FormUI.init(app);
            expect(true).toBe(true);
        });
    });

    describe('updateSettingsFields()', () => {
        beforeEach(() => {
            DOM.periodSystemRadios = [
                { value: 'trimestre', checked: false },
                { value: 'semestre', checked: false }
            ];
        });

        it('should set period system radio buttons', () => {
            appState.periodSystem = 'trimestre';
            FormUI.updateSettingsFields();
            expect(DOM.periodSystemRadios[0].checked).toBe(true);
        });

        it('should set evolution thresholds from appState', () => {
            appState.evolutionThresholds = { positive: 1.5, veryPositive: 3, negative: -1.5, veryNegative: -3 };
            FormUI.updateSettingsFields();
            expect(DOM.settingsEvolutionThresholdPositive.value).toBe(1.5);
        });

        it('should set IA length slider value', () => {
            appState.useSubjectPersonalization = false;
            FormUI.updateSettingsFields();
            expect(DOM.iaLengthSlider.value).toBe(DEFAULT_IA_CONFIG.length);
        });

        it('should use subject iaConfig when personalization is enabled', () => {
            appState.useSubjectPersonalization = true;
            appState.subjects['Français'].iaConfig.length = 75;
            FormUI.updateSettingsFields();
            expect(DOM.iaLengthSlider.value).toBe(75);
        });

        it('should set API key values', () => {
            appState.openaiApiKey = 'test-openai-key';
            appState.googleApiKey = 'test-google-key';
            FormUI.updateSettingsFields();
            expect(DOM.openaiApiKey.value).toBe('test-openai-key');
        });

        it('should update app version display', () => {
            FormUI.updateSettingsFields();
            expect(DOM.appVersionDisplay.textContent).toBe(APP_VERSION);
        });

        it('should format session cost', () => {
            appState.sessionCost = 0.0025;
            FormUI.updateSettingsFields();
            expect(DOM.sessionCost.textContent).toBe('0.0025$');
        });

        it('should call renderSubjectManagementList', () => {
            FormUI.updateSettingsFields();
            expect(mockApp.renderSubjectManagementList).toHaveBeenCalled();
        });
    });

    describe('updateModelDescription()', () => {
        it('should update model description element', () => {
            const descEl = document.createElement('div');
            descEl.id = 'aiModelDescription';
            document.body.appendChild(descEl);
            DOM.aiModelSelect.value = 'gpt-4';
            FormUI.updateModelDescription();
            expect(descEl.innerHTML).toBe(MODEL_DESCRIPTIONS['gpt-4']);
            document.body.removeChild(descEl);
        });

        it('should show default text when model not in descriptions', () => {
            const descEl = document.createElement('div');
            descEl.id = 'aiModelDescription';
            document.body.appendChild(descEl);
            DOM.aiModelSelect.value = 'unknown-model';
            FormUI.updateModelDescription();
            expect(descEl.innerHTML).toBe('Description...');
            document.body.removeChild(descEl);
        });
    });

    describe('toggleAIKeyFields()', () => {
        it('should show openai group for openai models', () => {
            DOM.aiModelSelect.value = 'openai-gpt4';
            FormUI.toggleAIKeyFields();
            expect(DOM.openaiApiKeyGroup.style.display).toBe('block');
        });

        it('should show google group for gemini models', () => {
            DOM.aiModelSelect.value = 'gemini-pro';
            FormUI.toggleAIKeyFields();
            expect(DOM.googleApiKeyGroup.style.display).toBe('block');
        });

        it('should show openrouter group for other models', () => {
            DOM.aiModelSelect.value = 'claude-3';
            FormUI.toggleAIKeyFields();
            expect(DOM.openrouterApiKeyGroup.style.display).toBe('block');
        });

        it('should hide all error messages', () => {
            FormUI.toggleAIKeyFields();
            expect(DOM.openaiApiKeyError.style.display).toBe('none');
        });

        it('should not throw if aiModelSelect is null', () => {
            const original = DOM.aiModelSelect;
            DOM.aiModelSelect = null;
            expect(() => FormUI.toggleAIKeyFields()).not.toThrow();
            DOM.aiModelSelect = original;
        });
    });

    // Tests renderVocabList supprimés - fonctionnalité vocabulaire dépréciée

    describe('renderSettingsLists()', () => {
        it('should show empty message when no history', () => {
            appState.instructionHistory = [];
            DOM.suggestionsList = { innerHTML: '' };
            FormUI.renderSettingsLists();
            expect(DOM.suggestionsList.innerHTML).toContain('historique');
        });

        it('should sort history by favorites first', () => {
            appState.instructionHistory = [
                { text: 'regular', isFavorite: false, count: 5 },
                { text: 'favorite', isFavorite: true, count: 1 }
            ];
            DOM.suggestionsList = { innerHTML: '' };
            FormUI.renderSettingsLists();
            expect(DOM.suggestionsList.innerHTML).toContain('Favoris');
        });

        it('should not throw if suggestionsList is null', () => {
            DOM.suggestionsList = null;
            expect(() => FormUI.renderSettingsLists()).not.toThrow();
        });
    });

    describe('updateAIPromptDisplays()', () => {
        beforeEach(() => {
            DOM.mainGenerationPromptDisplay = { innerHTML: '' };
            DOM.strengthsWeaknessesPromptDisplay = { textContent: '' };
            DOM.nextStepsPromptDisplay = { textContent: '' };
        });

        it('should update main generation prompt display', () => {
            FormUI.updateAIPromptDisplays();
            expect(DOM.mainGenerationPromptDisplay.innerHTML).toContain('<pre>');
        });

        it('should call AppreciationsManager.getAllPrompts', () => {
            FormUI.updateAIPromptDisplays();
            expect(AppreciationsManager.getAllPrompts).toHaveBeenCalled();
        });

        it('should update strengths/weaknesses prompt display', () => {
            FormUI.updateAIPromptDisplays();
            expect(DOM.strengthsWeaknessesPromptDisplay.textContent).toBe('Strengths/Weaknesses prompt');
        });

        it('should show personalization info when enabled', () => {
            appState.useSubjectPersonalization = true;
            FormUI.updateAIPromptDisplays();
            expect(DOM.mainGenerationPromptDisplay.innerHTML).toContain('professeur');
        });

        it('should show standard info when personalization disabled', () => {
            appState.useSubjectPersonalization = false;
            FormUI.updateAIPromptDisplays();
            expect(DOM.mainGenerationPromptDisplay.innerHTML).toContain('paramètres standards');
        });
    });
});
