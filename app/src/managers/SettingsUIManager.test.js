/**
 * @fileoverview Tests unitaires pour SettingsUIManager.js
 * @module managers/SettingsUIManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bus, EVENTS } from '../core/EventBus.js';

// Mock des dépendances
vi.mock('../state/State.js', () => ({
    appState: {
        currentSettingsSubject: 'Français',
        subjects: {
            'MonStyle': {
                iaConfig: { length: 50, tone: 3, styleInstructions: '', voice: 'neutral', enableStyleInstructions: true }
            },
            'Français': {
                iaConfig: { length: 50, styleInstructions: '', voice: 'default' }
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
            iaConfig: { length: 50, styleInstructions: '', voice: 'default' }
        }
    },
    DEFAULT_IA_CONFIG: { length: 50, styleInstructions: '', voice: 'default' },
    DEFAULT_SEATING_STATUS_DOTS: { movements: true, devices: false, delegates: false }
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {
        iaLengthSlider: { value: '50', disabled: false },
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
        previewStatus: { hidden: true },
        refreshPreviewBtn: { classList: { add: vi.fn(), remove: vi.fn() } }
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
                iaConfig: { length: 50, styleInstructions: '', voice: 'default' }
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
        appState.apiKeyStatus = {};
        appState.validatedApiKeys = {};
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
        it('should update MonStyle iaConfig from DOM values and activate personalization on savePersonalStyle()', () => {
            DOM.iaLengthSlider.value = '75';
            DOM.iaStyleInstructions.value = 'Test style';

            const mockRadio = document.createElement('input');
            mockRadio.type = 'radio';
            mockRadio.name = 'iaVoiceRadio';
            mockRadio.value = 'neutre';
            mockRadio.checked = true;
            document.body.appendChild(mockRadio);

            appState.useSubjectPersonalization = false;
            SettingsUIManager.savePersonalStyle();

            expect(appState.subjects['MonStyle'].iaConfig.length).toBe(75);
            expect(appState.subjects['MonStyle'].iaConfig.voice).toBe('neutre');
            expect(appState.subjects['MonStyle'].iaConfig.styleInstructions).toBe('Test style');
            expect(appState.useSubjectPersonalization).toBe(true);

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

        it('should save positive and negative evolution thresholds with 4x multipliers and 0.1 rounding', () => {
            DOM.settingsEvolutionThresholdPositive.value = '0.3';
            DOM.settingsEvolutionThresholdNegative.value = '-0.3';

            SettingsUIManager.saveSettings();

            expect(appState.evolutionThresholds.positive).toBe(0.3);
            expect(appState.evolutionThresholds.veryPositive).toBe(1.2);
            expect(appState.evolutionThresholds.negative).toBe(-0.3);
            expect(appState.evolutionThresholds.veryNegative).toBe(-1.2);
        });

        it('should clamp out-of-bounds evolution thresholds and fallback on invalid inputs', () => {
            appState.evolutionThresholds = { positive: 0.5, veryPositive: 2, negative: -0.5, veryNegative: -2 };
            DOM.settingsEvolutionThresholdPositive.value = '-1.2';
            DOM.settingsEvolutionThresholdNegative.value = '0.8';

            SettingsUIManager.syncEvolutionThresholdsFromDOM();

            expect(appState.evolutionThresholds.positive).toBe(0);
            expect(appState.evolutionThresholds.veryPositive).toBe(0);
            expect(DOM.settingsEvolutionThresholdPositive.value).toBe(0);
            expect(appState.evolutionThresholds.negative).toBe(0);
            expect(appState.evolutionThresholds.veryNegative).toBe(0);
            expect(DOM.settingsEvolutionThresholdNegative.value).toBe(0);

            appState.evolutionThresholds = { positive: 0.6, veryPositive: 2.4, negative: -0.4, veryNegative: -1.6 };
            DOM.settingsEvolutionThresholdPositive.value = '';
            DOM.settingsEvolutionThresholdNegative.value = 'abc';

            SettingsUIManager.syncEvolutionThresholdsFromDOM();

            expect(appState.evolutionThresholds.positive).toBe(0.6);
            expect(appState.evolutionThresholds.veryPositive).toBe(2.4);
            expect(appState.evolutionThresholds.negative).toBe(-0.4);
            expect(appState.evolutionThresholds.veryNegative).toBe(-1.6);
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

        it('should persist settings silently without toast notification when showNotification is false (auto-save close)', () => {
            vi.useFakeTimers();
            DOM.settingsPrivacyAnonymizeToggle = { checked: false };

            SettingsUIManager.saveSettings(false);

            expect(appState.anonymizeData).toBe(false);
            expect(StorageManager.saveAppState).toHaveBeenCalled();
            expect(UI.closeModal).toHaveBeenCalledWith(DOM.settingsModal);

            vi.advanceTimersByTime(260);
            expect(UI.showNotification).not.toHaveBeenCalled();
            expect(AppreciationsManager.renderResults).toHaveBeenCalled();
        });
    });

    describe('createSnapshot() & restoreSnapshot()', () => {
        it('should create a snapshot and restore state when cancelled', () => {
            appState.useSubjectPersonalization = true;
            appState.subjects = { MonStyle: { iaConfig: { length: 60 } } };

            SettingsUIManager.createSnapshot();

            appState.useSubjectPersonalization = false;
            appState.subjects = { MonStyle: { iaConfig: { length: 90 } } };

            const restored = SettingsUIManager.restoreSnapshot();

            expect(restored).toBe(true);
            expect(appState.useSubjectPersonalization).toBe(true);
            expect(appState.subjects.MonStyle.iaConfig.length).toBe(60);
            expect(UIState.settingsBeforeEdit).toEqual({});
        });

        it('should return false when no snapshot exists', () => {
            UIState.settingsBeforeEdit = {};

            expect(SettingsUIManager.restoreSnapshot()).toBe(false);
        });
    });

    describe('getPersonalStyleConfig() & preview refresh hint', () => {
        it('should return existing MonStyle iaConfig', () => {
            appState.subjects['MonStyle'] = { iaConfig: { length: 65, tone: 2 } };

            const cfg = SettingsUIManager.getPersonalStyleConfig();

            expect(cfg).toBe(appState.subjects['MonStyle'].iaConfig);
            expect(cfg.length).toBe(65);
        });

        it('should initialize MonStyle iaConfig from DEFAULT_IA_CONFIG when missing', () => {
            delete appState.subjects['MonStyle'];

            const cfg = SettingsUIManager.getPersonalStyleConfig();

            expect(appState.subjects['MonStyle']).toBeDefined();
            expect(cfg).toEqual({ length: 50, styleInstructions: '', voice: 'default' });
        });

        it('should toggle previewStatus.hidden', () => {
            SettingsUIManager.showPreviewRefreshHint();
            expect(DOM.previewStatus.hidden).toBe(false);

            SettingsUIManager.hidePreviewRefreshHint();
            expect(DOM.previewStatus.hidden).toBe(true);
        });

        it('savePersonalStyle() should persist MonStyle changes and clear snapshot without closing settingsModal', () => {
            UIState.settingsBeforeEdit = { subjects: {} };
            DOM.iaLengthSlider.value = '65';
            DOM.iaStyleInstructions.value = '  Consigne concise  ';

            SettingsUIManager.savePersonalStyle();

            expect(appState.subjects['MonStyle'].iaConfig.length).toBe(65);
            expect(appState.subjects['MonStyle'].iaConfig.styleInstructions).toBe('Consigne concise');
            expect(StorageManager.saveAppState).toHaveBeenCalled();
            expect(AppreciationsManager.renderResults).toHaveBeenCalled();
            expect(UIState.settingsBeforeEdit).toEqual({});
            expect(UI.closeModal).not.toHaveBeenCalled();
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
            expect(tooltip).toContain('Gemini 3.8 Flash');
            expect(tooltip).toContain('Gemini 3.6 Flash');
            expect(tooltip).toContain('Gemini 4 Hydrogen');
            // Ne doit PAS contenir les modèles fantômes ou retirés
            expect(tooltip).not.toContain('Gemini 4 Argon');
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

    describe('updateApiStatusDisplay() - cohérence du modèle actif sans clé', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div id="missingApiKeyWarning" style="display: flex;">
                    <span id="missingKeyText"></span>
                </div>
                <div id="fallbackOrderText"></div>
                <div id="fallbackOrderMore" style="display: none;"></div>
            `;
        });

        it('devrait réinitialiser currentAIModel vers albert-openweight-medium et masquer le bandeau d\'erreur si aucune clé n\'est configurée', () => {
            appState.currentAIModel = 'mistral-direct-small-latest';
            appState.mistralApiKey = '';
            appState.albertApiKey = '';
            appState.googleApiKey = '';
            appState.groqApiKey = '';

            SettingsUIManager.updateApiStatusDisplay();

            expect(appState.currentAIModel).toBe('albert-openweight-medium');
            expect(DOM.aiModelSelect.value).toBe('albert-openweight-medium');
            expect(document.getElementById('missingApiKeyWarning').style.display).toBe('none');
        });

        it('devrait basculer automatiquement vers le premier modèle disponible si la clé du modèle actif est absente mais qu\'un autre fournisseur est configuré', () => {
            appState.currentAIModel = 'mistral-direct-small-latest';
            appState.mistralApiKey = '';
            appState.googleApiKey = 'AIzaSyValidGoogleKey123';

            SettingsUIManager.updateApiStatusDisplay();

            expect(appState.currentAIModel).toBe('gemini-4-hydrogen');
            expect(DOM.aiModelSelect.value).toBe('gemini-4-hydrogen');
            expect(document.getElementById('missingApiKeyWarning').style.display).toBe('none');
        });

        it('devrait afficher le bandeau d\'alerte uniquement si le fournisseur du modèle actif a un souci de quota ou d\'invalidation', () => {
            appState.currentAIModel = 'gemini-4-hydrogen';
            appState.googleApiKey = 'AIzaSyValidGoogleKey123';
            appState.apiKeyStatus.google = 'quota-warning';

            SettingsUIManager.updateApiStatusDisplay();

            const banner = document.getElementById('missingApiKeyWarning');
            expect(banner.style.display).toBe('flex');
            expect(banner.classList.contains('banner-warning')).toBe(true);
            expect(document.getElementById('missingKeyText').textContent).toContain('quota temporairement atteint');
        });
    });

    describe('T-08 — Effacement d\'une consigne de style existante (Bug C-02)', () => {
        it('T-08 (Bug C-02) : vider DOM.iaStyleInstructions.value = "" et appeler savePersonalStyle() écrase l\'ancienne consigne avec ""', () => {
            appState.subjects['MonStyle'].iaConfig.styleInstructions = 'Ancienne consigne personnalisée à effacer';
            DOM.iaStyleInstructions.value = '';

            SettingsUIManager.savePersonalStyle();

            expect(appState.subjects['MonStyle'].iaConfig.styleInstructions).toBe('');
        });

        it('saveSettings() ne modifie pas MonStyle (modale Paramètres découplée de Personnalisation)', () => {
            appState.subjects['MonStyle'].iaConfig.styleInstructions = 'Consigne préservée';
            DOM.iaStyleInstructions.value = 'Brouillon non sauvegardé';

            SettingsUIManager.saveSettings(false, { skipCloseModal: true });

            expect(appState.subjects['MonStyle'].iaConfig.styleInstructions).toBe('Consigne préservée');
        });
    });

    describe('Sécurité Ollama (URL loopback & XSS /api/tags)', () => {
        it('rejette une URL Ollama non autorisée dans saveSettings() et validateOllamaConnection() sans appel réseau', async () => {
            appState.ollamaBaseUrl = 'http://localhost:11434';
            DOM.ollamaBaseUrl.value = 'https://attacker.example/api#';

            SettingsUIManager.saveSettings(false, { skipCloseModal: true });
            expect(appState.ollamaBaseUrl).toBe('http://localhost:11434');
            expect(DOM.ollamaBaseUrl.value).toBe('http://localhost:11434');

            DOM.ollamaBaseUrl.value = 'http://localhost:9222';
            const fetchSpy = vi.fn();
            const origFetch = globalThis.fetch;
            globalThis.fetch = fetchSpy;
            try {
                const ok = await SettingsUIManager.validateOllamaConnection();
                expect(ok).toBe(false);
                expect(fetchSpy).not.toHaveBeenCalled();
            } finally {
                globalThis.fetch = origFetch;
            }
        });

        it('échappe les noms de modèles retournés par Ollama (/api/tags) dans updateOllamaStatus()', () => {
            const modelsInfo = document.createElement('div');
            const modelsText = document.createElement('span');
            const errorEl = document.createElement('div');
            const origInfo = DOM.ollamaModelsInfo;
            const origText = DOM.ollamaModelsText;
            const origErr = DOM.ollamaError;
            DOM.ollamaModelsInfo = modelsInfo;
            DOM.ollamaModelsText = modelsText;
            DOM.ollamaError = errorEl;

            try {
                SettingsUIManager.updateOllamaStatus('valid', ['<img src=x onerror=alert(1)>:latest']);
                expect(modelsText.querySelector('img')).toBeNull();
                expect(modelsText.textContent).toContain('<img src=x onerror=alert(1)>:latest');
            } finally {
                DOM.ollamaModelsInfo = origInfo;
                DOM.ollamaModelsText = origText;
                DOM.ollamaError = origErr;
            }
        });
    });

    describe('Accordéon moteurs avancés & garde-fou souveraineté du Relais automatique', () => {
        it('garde les moteurs avancés repliés si aucun n\'est configuré et les déplie automatiquement dès qu\'un moteur avancé ou Ollama est actif', () => {
            document.body.innerHTML = `
                <div class="advanced-providers-accordion" id="advancedProvidersAccordion">
                    <button type="button" id="advancedProvidersToggleBtn" aria-expanded="false"></button>
                    <span id="advancedProvidersCountBadge" hidden></span>
                    <div id="advancedProvidersBody" hidden></div>
                </div>
            `;
            SettingsUIManager._advancedProvidersManuallyToggled = false;
            appState.anthropicApiKey = '';
            appState.mistralApiKey = '';
            appState.openaiApiKey = '';
            appState.openrouterApiKey = '';
            appState.ollamaEnabled = false;
            DOM.openaiApiKey.value = '';
            DOM.openrouterApiKey.value = '';
            DOM.anthropicApiKey.value = '';
            DOM.mistralApiKey.value = '';

            SettingsUIManager.syncAdvancedProvidersAccordion({ autoExpandIfConfigured: true });
            expect(document.getElementById('advancedProvidersBody').hidden).toBe(true);
            expect(document.getElementById('advancedProvidersCountBadge').hidden).toBe(true);

            // Activation d'Ollama -> badge "1 configuré" et dépliage auto
            appState.ollamaEnabled = true;
            SettingsUIManager.syncAdvancedProvidersAccordion({ autoExpandIfConfigured: true });
            expect(document.getElementById('advancedProvidersBody').hidden).toBe(false);
            expect(document.getElementById('advancedProvidersToggleBtn').getAttribute('aria-expanded')).toBe('true');
            expect(document.getElementById('advancedProvidersCountBadge').hidden).toBe(false);
            expect(document.getElementById('advancedProvidersCountBadge').textContent).toBe('1 configuré');
            document.body.innerHTML = '';
        });

        it('affiche le garde-fou souveraineté uniquement quand Albert/Ollama est actif, Relais activé et un cloud hors UE est disponible en secours', () => {
            document.body.innerHTML = `
                <span id="fallbackOrderText"></span>
                <span id="fallbackOrderMore" style="display:none;"></span>
                <small id="fallbackSovereigntyHint" hidden></small>
            `;
            appState.currentAIModel = 'albert-small';
            appState.albertApiKey = 'sk-albert-valid-key-123456';
            appState.googleApiKey = 'AIzaSyValidGoogleApiKey1234567890';
            appState.enableApiFallback = true;

            SettingsUIManager.updateFallbackOrderHint();
            expect(document.getElementById('fallbackSovereigntyHint').hidden).toBe(false);
            expect(document.getElementById('fallbackSovereigntyHint').textContent).toContain('cloud hors UE');

            // Si Relais désactivé -> hint masqué
            appState.enableApiFallback = false;
            SettingsUIManager.updateFallbackOrderHint();
            expect(document.getElementById('fallbackSovereigntyHint').hidden).toBe(true);

            // Si modèle actif déjà cloud hors UE (Google) -> hint masqué même si Relais actif
            appState.enableApiFallback = true;
            appState.currentAIModel = 'gemini-3.8-flash';
            SettingsUIManager.updateFallbackOrderHint();
            expect(document.getElementById('fallbackSovereigntyHint').hidden).toBe(true);
            document.body.innerHTML = '';
        });
    });
});
