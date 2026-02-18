/**
 * @fileoverview Tests unitaires pour FormUIManager.js
 * @module managers/FormUIManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        useSubjectPersonalization: false,
        subjects: {
            'MonStyle': {
                iaConfig: { length: 50, tone: 3, styleInstructions: '', voice: 'default', discipline: '' }
            },
            'Générique': {
                iaConfig: { length: 50, tone: 3, styleInstructions: '', voice: 'default', discipline: '' }
            }
        },
        periodSystem: 'trimestre',
        evolutionThresholds: { positive: 1, negative: -1 },
        currentAIModel: 'gpt-4',
        openaiApiKey: '',
        googleApiKey: '',
        openrouterApiKey: '',
        anthropicApiKey: '',
        mistralApiKey: '',
        sessionTokens: 0,
        settingsPrivacyAnonymize: false
    }
}));

vi.mock('../config/Config.js', () => ({
    CONFIG: {},
    DEFAULT_IA_CONFIG: { length: 50, tone: 3, styleInstructions: '', voice: 'default', discipline: '' },
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
        settingsEvolutionThresholdNegative: { value: '-1' },
        iaLengthSlider: { min: '10', max: '90', value: '50', dispatchEvent: vi.fn() },
        iaToneSlider: { value: '3' },
        iaStyleInstructions: { value: '' },
        iaDiscipline: { value: '' },
        aiModelSelect: { value: 'gpt-4' },
        openaiApiKey: { value: '' },
        googleApiKey: { value: '' },
        openrouterApiKey: { value: '' },
        anthropicApiKey: { value: '' },
        mistralApiKey: { value: '' },
        appVersionDisplay: { textContent: '' },
        sessionTokens: { textContent: '' },
        settingsPrivacyAnonymizeToggle: { checked: false },
        settingsModal: {
            querySelectorAll: vi.fn(() => []),
            querySelector: vi.fn(() => null)
        }
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

describe('FormUIManager', () => {
    let mockApp;

    beforeEach(() => {
        vi.clearAllMocks();

        mockApp = {};
        FormUI.init(mockApp);

        // Reset appState
        appState.useSubjectPersonalization = false;
        appState.periodSystem = 'trimestre';
        appState.currentAIModel = 'gpt-4';

        // Mock getElementById for dynamic elements
        document.getElementById = vi.fn((id) => {
            if (id === 'aiModelDescription') return { innerHTML: '' };
            if (id === 'iaStyleHeader') return { innerHTML: '' };
            if (id === 'settings-controls-panel') return { classList: { toggle: vi.fn() } };
            if (id === 'iaLengthSliderValue') return { textContent: '' };
            if (id === 'iaToneSliderValue') return { textContent: '' };
            if (id === 'missingApiKeyWarning') return { style: { display: '' } };
            if (id === 'missingKeyText') return { textContent: '' };
            return null;
        });

        // Mock querySelectorAll for voice radios and disabled controls
        document.querySelectorAll = vi.fn(() => []);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('init()', () => {
        it('should initialize with app instance', () => {
            const app = {};
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
            appState.evolutionThresholds = { positive: 1.5, negative: -1.5 };
            FormUI.updateSettingsFields();
            expect(DOM.settingsEvolutionThresholdPositive.value).toBe(1.5);
        });

        it('should set IA length slider to default in generic mode', () => {
            appState.useSubjectPersonalization = false;
            FormUI.updateSettingsFields();
            expect(DOM.iaLengthSlider.value).toBe(DEFAULT_IA_CONFIG.length);
        });

        it('should use MonStyle iaConfig when personalization is enabled', () => {
            appState.useSubjectPersonalization = true;
            appState.subjects['MonStyle'].iaConfig.length = 75;
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

        it('should set AI model select value', () => {
            appState.currentAIModel = 'gemini-pro';
            FormUI.updateSettingsFields();
            expect(DOM.aiModelSelect.value).toBe('gemini-pro');
        });

        it('should set style instructions from MonStyle when personalization enabled', () => {
            appState.useSubjectPersonalization = true;
            appState.subjects['MonStyle'].iaConfig.styleInstructions = 'Custom instructions';
            FormUI.updateSettingsFields();
            expect(DOM.iaStyleInstructions.value).toBe('Custom instructions');
        });

        it('should clear style instructions when personalization disabled', () => {
            appState.useSubjectPersonalization = false;
            FormUI.updateSettingsFields();
            expect(DOM.iaStyleInstructions.value).toBe('');
        });
    });

    describe('updateModelDescription()', () => {
        it('should update model description element', () => {
            const descEl = { innerHTML: '' };
            document.getElementById = vi.fn((id) => {
                if (id === 'aiModelDescription') return descEl;
                return null;
            });
            DOM.aiModelSelect.value = 'gpt-4';
            FormUI.updateModelDescription();
            expect(descEl.innerHTML).toBe(MODEL_DESCRIPTIONS['gpt-4']);
        });

        it('should show default text when model not in descriptions', () => {
            const descEl = { innerHTML: '' };
            document.getElementById = vi.fn((id) => {
                if (id === 'aiModelDescription') return descEl;
                return null;
            });
            DOM.aiModelSelect.value = 'unknown-model';
            FormUI.updateModelDescription();
            expect(descEl.innerHTML).toBe('Description...');
        });
    });

    describe('toggleAIKeyFields()', () => {
        let warningEl;
        let warningTextEl;

        beforeEach(() => {
            warningEl = { style: { display: '' } };
            warningTextEl = { textContent: '' };

            document.getElementById = vi.fn((id) => {
                if (id === 'missingApiKeyWarning') return warningEl;
                if (id === 'missingKeyText') return warningTextEl;
                return null;
            });
        });

        it('should show warning for openai model without key', () => {
            DOM.aiModelSelect.value = 'openai-gpt4';
            appState.openaiApiKey = '';
            FormUI.toggleAIKeyFields();
            expect(warningEl.style.display).toBe('flex');
            expect(warningTextEl.textContent).toContain('OpenAI');
        });

        it('should show warning for gemini model without key', () => {
            DOM.aiModelSelect.value = 'gemini-pro';
            appState.googleApiKey = '';
            FormUI.toggleAIKeyFields();
            expect(warningEl.style.display).toBe('flex');
            expect(warningTextEl.textContent).toContain('Google Gemini');
        });

        it('should hide warning when key is present', () => {
            DOM.aiModelSelect.value = 'gemini-pro';
            appState.googleApiKey = 'valid-key-123456';
            FormUI.toggleAIKeyFields();
            expect(warningEl.style.display).toBe('none');
        });

        it('should show warning for openrouter models without key', () => {
            DOM.aiModelSelect.value = 'claude-3';
            appState.openrouterApiKey = '';
            FormUI.toggleAIKeyFields();
            expect(warningEl.style.display).toBe('flex');
            expect(warningTextEl.textContent).toContain('OpenRouter');
        });

        it('should not throw if aiModelSelect is null', () => {
            const original = DOM.aiModelSelect;
            DOM.aiModelSelect = null;
            expect(() => FormUI.toggleAIKeyFields()).not.toThrow();
            DOM.aiModelSelect = original;
        });
    });

    describe('renderSettingsLists()', () => {
        it('should not throw (no-op function)', () => {
            expect(() => FormUI.renderSettingsLists()).not.toThrow();
        });
    });
});
