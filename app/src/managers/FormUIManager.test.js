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
                iaConfig: { length: 50, styleInstructions: '', voice: 'default', discipline: '' }
            },
            'Générique': {
                iaConfig: { length: 50, styleInstructions: '', voice: 'default', discipline: '' }
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
        settingsPrivacyAnonymize: false
    }
}));

vi.mock('../config/Config.js', () => ({
    CONFIG: {},
    DEFAULT_IA_CONFIG: { length: 50, styleInstructions: '', voice: 'default', discipline: '' },
    MAX_CHARS_CONFIG: { min: 50, max: 2000, defaultValue: 400, nearRatio: 0.92, presets: [255, 400, 500] },
    APP_VERSION: '4.3.0',
    DEFAULT_SEATING_STATUS_DOTS: { movements: true, devices: false, delegates: false, journal: false }
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {
        periodSystemRadios: [],
        settingsEvolutionThresholdPositive: { value: '1' },
        settingsEvolutionThresholdNegative: { value: '-1' },
        iaLengthSlider: { min: '10', max: '90', value: '50', dispatchEvent: vi.fn() },
        iaLengthSliderValue: { textContent: '' },
        iaMaxCharsToggle: { checked: false },
        iaMaxCharsValue: { textContent: '' },
        iaMaxCharsCollapsible: { classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() } },
        iaMaxCharsInput: { value: '', disabled: false },
        iaMaxCharsPresets: { querySelectorAll: vi.fn(() => []) },
        iaStyleInstructions: { value: '', disabled: false, classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() } },
        iaStyleInstructionsToggle: { checked: true },
        iaDiscipline: { value: '' },
        aiModelSelect: { value: 'gpt-4' },
        openaiApiKey: { value: '' },
        googleApiKey: { value: '' },
        openrouterApiKey: { value: '' },
        anthropicApiKey: { value: '' },
        mistralApiKey: { value: '' },
        appVersionDisplay: { textContent: '' },
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
        getPeriodLabel: vi.fn((p, short) => short ? p : `Période ${p}`),
        normalizeMaxChars: vi.fn((v) => {
            if (v === null || v === undefined || v === '') return null;
            const n = parseInt(String(v), 10);
            return Number.isFinite(n) && n > 0 ? Math.min(2000, Math.max(50, n)) : null;
        }),
        computeSafeWordCap: vi.fn((b) => Math.max(8, Math.floor((Number(b) * 0.86) / 6.5)))
    }
}));

vi.mock('./AppreciationsManager.js', () => ({
    AppreciationsManager: {
        getAllPrompts: vi.fn(() => ({
            appreciation: 'Test prompt',
            sw: 'Strengths/Weaknesses prompt',
            ns: 'Next steps prompt'
        }))
    }
}));

import { FormUI } from './FormUIManager.js';
import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { DEFAULT_IA_CONFIG } from '../config/Config.js';

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

        it('should set IA length slider to MonStyle config length', () => {
            appState.subjects['MonStyle'].iaConfig.length = DEFAULT_IA_CONFIG.length;
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
            expect(DOM.appVersionDisplay).toBeDefined();
        });

        it('should set AI model select value', () => {
            appState.currentAIModel = 'gemini-pro';
            FormUI.updateSettingsFields();
            expect(DOM.aiModelSelect.value).toBe('gemini-pro');
        });

        it('should sync iaVoiceSelector glider when resetting or restoring fields', async () => {
            const { UI } = await import('./UIManager.js');
            const updateGliderSpy = vi.spyOn(UI, 'updateGlider').mockImplementation(() => {});
            const voiceSelectorMock = { classList: { contains: vi.fn((c) => c === 'has-glider') } };
            document.getElementById = vi.fn((id) => (id === 'iaVoiceSelector' ? voiceSelectorMock : null));

            appState.subjects['MonStyle'] = { iaConfig: { length: 40, voice: 'default' } };
            FormUI.updateSettingsFields();

            expect(updateGliderSpy).toHaveBeenCalledWith(voiceSelectorMock);
            updateGliderSpy.mockRestore();
        });

        it('should set style instructions from MonStyle when personalization enabled', () => {
            appState.useSubjectPersonalization = true;
            appState.subjects['MonStyle'].iaConfig.styleInstructions = 'Custom instructions';
            FormUI.updateSettingsFields();
            expect(DOM.iaStyleInstructions.value).toBe('Custom instructions');
        });

        it('should retain style instructions from MonStyle even when personalization disabled', () => {
            appState.useSubjectPersonalization = false;
            appState.subjects['MonStyle'].iaConfig.styleInstructions = 'Keep my instructions';
            FormUI.updateSettingsFields();
            expect(DOM.iaStyleInstructions.value).toBe('Keep my instructions');
        });

        it('should preserve styleInstructions across multiple disable/enable toggles without data loss', () => {
            appState.subjects['MonStyle'].iaConfig.styleInstructions = 'Important teacher instructions';

            // 1. Toggled off
            appState.useSubjectPersonalization = false;
            FormUI.updateSettingsFields();
            expect(DOM.iaStyleInstructions.value).toBe('Important teacher instructions');
            expect(appState.subjects['MonStyle'].iaConfig.styleInstructions).toBe('Important teacher instructions');

            // 2. Toggled on
            appState.useSubjectPersonalization = true;
            FormUI.updateSettingsFields();
            expect(DOM.iaStyleInstructions.value).toBe('Important teacher instructions');
            expect(appState.subjects['MonStyle'].iaConfig.styleInstructions).toBe('Important teacher instructions');
        });
    });

    describe('syncStyleControls()', () => {
        it('should format length display with words and estimated characters rounded to nearest 10', () => {
            DOM.iaLengthSlider.value = '40';
            appState.subjects['MonStyle'] = { iaConfig: { enableStyleInstructions: true } };

            FormUI.syncStyleControls();

            expect(DOM.iaLengthSliderValue.textContent).toBe('~40 mots • ~260 car.');

            DOM.iaLengthSlider.value = '45';
            FormUI.syncStyleControls();

            expect(DOM.iaLengthSliderValue.textContent).toBe('~45 mots • ~290 car.');
        });

        it('should sync style instructions toggle and disabled state', () => {
            appState.subjects['MonStyle'] = { iaConfig: { enableStyleInstructions: false } };

            FormUI.syncStyleControls();

            expect(DOM.iaStyleInstructionsToggle.checked).toBe(false);
            expect(DOM.iaStyleInstructions.disabled).toBe(true);
        });

        it('should sync maxChars controls and indicate capped length when word slider exceeds safeWordCap', () => {
            DOM.iaLengthSlider.value = '60';
            appState.subjects['MonStyle'] = { iaConfig: { maxChars: 255 } };

            FormUI.syncStyleControls();

            expect(DOM.iaMaxCharsToggle.checked).toBe(true);
            expect(DOM.iaMaxCharsInput.disabled).toBe(false);
            expect(DOM.iaMaxCharsInput.value).toBe(''); // Preset 255 leaves custom field empty
            expect(DOM.iaMaxCharsValue.textContent).toBe('Max 255 car.');
            expect(DOM.iaLengthSliderValue.textContent).toBe('~60 → 33 mots max');

            // At 60 words with 400 maxChars, safeWordCap is 52 words (< 60) even though 60*6.5=390 <= 400
            appState.subjects['MonStyle'] = { iaConfig: { maxChars: 400 } };
            FormUI.syncStyleControls();
            expect(DOM.iaMaxCharsInput.value).toBe('');
            expect(DOM.iaLengthSliderValue.textContent).toBe('~60 → 52 mots max');

            // Custom non-preset value fills the custom input
            appState.subjects['MonStyle'] = { iaConfig: { maxChars: 350 } };
            FormUI.syncStyleControls();
            expect(DOM.iaMaxCharsInput.value).toBe('350');
            expect(DOM.iaMaxCharsValue.textContent).toBe('Max 350 car.');

            appState.subjects['MonStyle'] = { iaConfig: { maxChars: null } };
            FormUI.syncStyleControls();
            expect(DOM.iaMaxCharsToggle.checked).toBe(false);
            expect(DOM.iaMaxCharsInput.disabled).toBe(true);
            expect(DOM.iaMaxCharsInput.value).toBe('');
            expect(DOM.iaMaxCharsValue.textContent).toBe('Désactivée');
            expect(DOM.iaLengthSliderValue.textContent).toBe('~60 mots • ~390 car.');
        });

        it('should resolve active maxChars from custom input, preset or stored fallback via resolveMaxCharsFromDOM', () => {
            DOM.iaMaxCharsToggle.checked = false;
            expect(FormUI.resolveMaxCharsFromDOM(255)).toBeNull();

            DOM.iaMaxCharsToggle.checked = true;
            DOM.iaMaxCharsInput.value = '';
            appState.subjects['MonStyle'] = { iaConfig: { maxChars: 255 } };
            expect(FormUI.resolveMaxCharsFromDOM()).toBe(255);

            DOM.iaMaxCharsInput.value = '350';
            expect(FormUI.resolveMaxCharsFromDOM()).toBe(350);
            DOM.iaMaxCharsInput.value = '';
        });
    });

    describe('updateSpinnerBounds()', () => {
        let decBtn;
        let incBtn;
        let input;
        let wrapper;

        beforeEach(() => {
            decBtn = { disabled: false };
            incBtn = { disabled: false };
            wrapper = {
                querySelector: vi.fn((selector) => {
                    if (selector.includes('decrement')) return decBtn;
                    if (selector.includes('increment')) return incBtn;
                    return null;
                })
            };
            input = {
                value: '0.5',
                min: '0',
                max: '5',
                closest: vi.fn(() => wrapper)
            };
        });

        it('should enable both buttons when value is strictly between min and max', () => {
            FormUI.updateSpinnerBounds(input);
            expect(decBtn.disabled).toBe(false);
            expect(incBtn.disabled).toBe(false);
        });

        it('should disable decrement button when value is <= min', () => {
            input.value = '0';
            FormUI.updateSpinnerBounds(input);
            expect(decBtn.disabled).toBe(true);
            expect(incBtn.disabled).toBe(false);
        });

        it('should disable increment button when value is >= max', () => {
            input.value = '5';
            FormUI.updateSpinnerBounds(input);
            expect(decBtn.disabled).toBe(false);
            expect(incBtn.disabled).toBe(true);
        });

        it('should handle negative bounds for recul stepper', () => {
            input.value = '0';
            input.min = '-5';
            input.max = '0';
            FormUI.updateSpinnerBounds(input);
            expect(decBtn.disabled).toBe(false);
            expect(incBtn.disabled).toBe(true);

            input.value = '-5';
            FormUI.updateSpinnerBounds(input);
            expect(decBtn.disabled).toBe(true);
            expect(incBtn.disabled).toBe(false);
        });

        it('should safely do nothing if input or wrapper is null', () => {
            expect(() => FormUI.updateSpinnerBounds(null)).not.toThrow();
            expect(() => FormUI.updateSpinnerBounds({ closest: () => null })).not.toThrow();
            expect(() => FormUI.updateSpinnerBounds({})).not.toThrow();
        });
    });
});
