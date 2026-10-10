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
        iaToneToggle: { checked: false, disabled: false },
        iaToneSliderContainer: { classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() } },
        iaToneSliderValue: { textContent: '' },
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
        renderSettingsLists: vi.fn(),
        initTooltips: vi.fn()
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
    PROVIDER_CONFIG: {
        google: { id: 'google', name: 'Google Gemini', keyProperty: 'googleApiKey', domKey: 'googleApiKey' },
        groq: { id: 'groq', name: 'Groq Cloud', keyProperty: 'groqApiKey', domKey: 'groqApiKey' },
        openai: { id: 'openai', name: 'OpenAI', keyProperty: 'openaiApiKey', domKey: 'openaiApiKey' },
        openrouter: { id: 'openrouter', name: 'OpenRouter', keyProperty: 'openrouterApiKey', domKey: 'openrouterApiKey' },
        anthropic: { id: 'anthropic', name: 'Anthropic Claude', keyProperty: 'anthropicApiKey', domKey: 'anthropicApiKey' },
        mistral: { id: 'mistral', name: 'Mistral AI', keyProperty: 'mistralApiKey', domKey: 'mistralApiKey' },
        ollama: { id: 'ollama', name: 'Ollama' }
    },
    PROVIDER_IDS: ['google', 'groq', 'openrouter', 'mistral', 'openai', 'anthropic', 'ollama'],
    API_KEY_PROVIDER_IDS: ['google', 'groq', 'mistral', 'openrouter', 'openai', 'anthropic'],
    isValidKeyFormat: (k) => typeof k === 'string' && k.trim().length > 5,
    getProviderApiKey: (id, { state, dom } = {}) => {
        if (dom && dom[`${id}ApiKey`]?.value) return dom[`${id}ApiKey`].value.trim();
        return (state && state[`${id}ApiKey`]) ? state[`${id}ApiKey`].trim() : '';
    },
    hasValidApiKey: (id, { state } = {}) => {
        if (id === 'ollama') return state?.ollamaEnabled === true;
        const key = state?.[`${id}ApiKey`];
        return typeof key === 'string' && key.trim().length > 5;
    }
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
        appState.openaiApiKey = '';
        appState.googleApiKey = '';
        appState.openrouterApiKey = '';
        appState.anthropicApiKey = '';
        appState.mistralApiKey = '';
        appState.ollamaEnabled = false;
        if (DOM.googleApiKey) DOM.googleApiKey.value = '';
        if (DOM.openaiApiKey) DOM.openaiApiKey.value = '';
        if (DOM.openrouterApiKey) DOM.openrouterApiKey.value = '';
        if (DOM.anthropicApiKey) DOM.anthropicApiKey.value = '';
        if (DOM.mistralApiKey) DOM.mistralApiKey.value = '';
        UIState.settingsBeforeEdit = {};
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('_savePersonalStyleChanges()', () => {
        it('should update MonStyle iaConfig from DOM values', () => {
            DOM.iaLengthSlider.value = '75';
            DOM.iaToneSlider.value = '4';
            DOM.iaToneToggle.checked = true;
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
            expect(appState.subjects['MonStyle'].iaConfig.enableTone).toBe(true);

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

        it('should sync tone toggle and slider display when tone is enabled', () => {
            appState.subjects['MonStyle'] = { iaConfig: { tone: 3, enableTone: true } };
            DOM.iaToneSlider.value = '3';

            SettingsUIManager.updatePersonalizationState();

            expect(DOM.iaToneToggle.checked).toBe(true);
            expect(DOM.iaToneSliderContainer.classList.toggle).toHaveBeenCalledWith('opacity-reduced', false);
            expect(DOM.iaToneSliderValue.textContent).toBe('Neutre / Factuel');
        });

        it('should display Adaptatif (libre) and dim container when tone is disabled', () => {
            appState.subjects['MonStyle'] = { iaConfig: { tone: 3, enableTone: false } };
            DOM.iaToneSlider.value = '3';

            SettingsUIManager.updatePersonalizationState();

            expect(DOM.iaToneToggle.checked).toBe(false);
            expect(DOM.iaToneSliderContainer.classList.toggle).toHaveBeenCalledWith('opacity-reduced', true);
            expect(DOM.iaToneSliderValue.textContent).toBe('Adaptatif (libre)');
        });
    });

    describe('updateFallbackOrderHint()', () => {
        let fallbackOrderText;
        let fallbackOrderMore;

        beforeEach(() => {
            document.body.innerHTML = `
                <div id="fallbackOrderText"></div>
                <div id="fallbackOrderMore" style="display: none;"></div>
            `;
            fallbackOrderText = document.getElementById('fallbackOrderText');
            fallbackOrderMore = document.getElementById('fallbackOrderMore');
        });

        it('should update hint text and tooltip badge with only available models', () => {
            // Configurer uniquement une clé Mistral
            appState.mistralApiKey = 'test-mistral-key-12345';
            appState.googleApiKey = '';
            appState.openrouterApiKey = '';
            appState.currentAIModel = 'mistral-direct-small-latest';

            SettingsUIManager.updateFallbackOrderHint();

            expect(fallbackOrderText.innerHTML).toContain('Mistral Small');
            expect(fallbackOrderText.innerHTML).toContain('Mistral Large');
            // Seuls 2 modèles sont disponibles (Mistral Small et Mistral Large), donc pas de badge +X
            expect(fallbackOrderMore.style.display).toBe('none');
        });

        it('should display +N badge and full order tooltip when more than 2 models are available', () => {
            // Configurer Mistral et Google
            appState.mistralApiKey = 'test-mistral-key-12345';
            appState.googleApiKey = 'test-google-key-12345';
            appState.openrouterApiKey = '';
            appState.currentAIModel = 'mistral-direct-small-latest';

            SettingsUIManager.updateFallbackOrderHint();

            expect(fallbackOrderMore.style.display).toBe('inline-flex');
            expect(fallbackOrderMore.textContent).toBe('+3'); // 5 modèles dispos au total (2 mistral + 3 google) -> 5 - 2 = 3
            const tooltip = fallbackOrderMore.getAttribute('data-tooltip');
            expect(tooltip).toContain('Ordre complet :');
            expect(tooltip).toContain('Mistral Small');
            expect(tooltip).toContain('Mistral Large');
            expect(tooltip).toContain('Gemini 3.5 Flash');
            expect(tooltip).toContain('Gemini 3.8 Flash');
            expect(tooltip).toContain('Gemini 3.1 Pro');
            // Ne doit PAS contenir les modèles fantômes
            expect(tooltip).not.toContain('Gemini 3.7 Flash');
            expect(tooltip).not.toContain('Gemini 2.5');
        });

        it('should display friendly message when no models are available', () => {
            appState.mistralApiKey = '';
            appState.googleApiKey = '';
            appState.openrouterApiKey = '';
            appState.openaiApiKey = '';
            appState.anthropicApiKey = '';
            appState.ollamaEnabled = false;

            SettingsUIManager.updateFallbackOrderHint();

            expect(fallbackOrderText.innerHTML).toContain('Aucun modèle disponible');
            expect(fallbackOrderMore.style.display).toBe('none');
        });
    });

    describe('updateProviderStatusBadges', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div id="googleStatusBadge" class="provider-status-badge"></div>
                <div id="groqStatusBadge" class="provider-status-badge"></div>
                <div id="mistralStatusBadge" class="provider-status-badge"></div>
                <div id="openrouterStatusBadge" class="provider-status-badge"></div>
                <div id="openaiStatusBadge" class="provider-status-badge"></div>
                <div id="anthropicStatusBadge" class="provider-status-badge"></div>
                <div id="ollamaStatusBadge" class="provider-status-badge"></div>
            `;
            appState.apiKeyStatus = {};
            appState.validatedApiKeys = {};
            if (DOM.googleApiKey) DOM.googleApiKey.value = '';
        });

        it('devrait afficher "Non configuré" quand le champ est vide', () => {
            appState.googleApiKey = '';
            SettingsUIManager.updateProviderStatusBadges();

            const badge = document.getElementById('googleStatusBadge');
            expect(badge.className).toContain('status-unconfigured');
            expect(badge.textContent).toContain('Non configuré');
        });

        it('devrait afficher "À vérifier" quand une clé est saisie mais non encore testée (pas "Clé invalide")', () => {
            appState.googleApiKey = 'AIzaSyTestUntestedKey123';
            appState.apiKeyStatus.google = null;
            appState.validatedApiKeys.google = false;

            SettingsUIManager.updateProviderStatusBadges();

            const badge = document.getElementById('googleStatusBadge');
            expect(badge.className).toContain('status-untested');
            expect(badge.textContent).toContain('À vérifier');
        });

        it('devrait afficher "Clé invalide" UNIQUEMENT si le statut est explicitement invalid', () => {
            appState.googleApiKey = 'AIzaSyBadKey123';
            appState.apiKeyStatus.google = 'invalid';
            appState.validatedApiKeys.google = false;

            SettingsUIManager.updateProviderStatusBadges();

            const badge = document.getElementById('googleStatusBadge');
            expect(badge.className).toContain('status-error');
            expect(badge.textContent).toContain('Clé invalide');
        });

        it('devrait afficher "Connecté" quand la clé est validée', () => {
            appState.googleApiKey = 'AIzaSyValidKey123';
            appState.apiKeyStatus.google = 'valid';
            appState.validatedApiKeys.google = true;

            SettingsUIManager.updateProviderStatusBadges();

            const badge = document.getElementById('googleStatusBadge');
            expect(badge.className).toContain('status-connected');
            expect(badge.textContent).toContain('Connecté');
        });

        it('devrait afficher "Quota atteint" en cas de quota-warning', () => {
            appState.googleApiKey = 'AIzaSyValidKey123';
            appState.apiKeyStatus.google = 'quota-warning';
            appState.validatedApiKeys.google = true;

            SettingsUIManager.updateProviderStatusBadges();

            const badge = document.getElementById('googleStatusBadge');
            expect(badge.className).toContain('status-warning');
            expect(badge.textContent).toContain('Quota atteint');
        });
    });
});
