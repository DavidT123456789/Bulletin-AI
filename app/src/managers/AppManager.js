import { appState, UIState } from '../state/State.js';
import { CONFIG, CONSTS, APP_VERSION } from '../config/Config.js';
import { DOM } from '../utils/DOM.js';
import { UI } from './UIManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { StorageManager } from './StorageManager.js';
import { AIService } from '../services/AIService.js';
import { WelcomeManager } from './WelcomeManager.js';
import { ApiValidationManager } from './ApiValidationManager.js';
import { EventListenersManager } from './EventListenersManager.js';
import { SettingsUIManager } from './SettingsUIManager.js';
import { PreviewManager } from './PreviewManager.js';
import { SpeechRecognitionManager } from './SpeechRecognitionManager.js';
import { SpeechSynthesisManager } from './SpeechSynthesisManager.js';
import { DropdownManager } from './DropdownManager.js';
import { ClassManager } from './ClassManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { ListViewManager } from './ListViewManager.js';
import { PwaInstallManager } from './PwaInstallManager.js';
import { HistoryManager } from './HistoryManager.js';
import { RestoreTransitionManager } from './RestoreTransitionManager.js';
import { ModelSelectionManager } from './ModelSelectionManager.js';
import { ResultsUIManager } from './ResultsUIManager.js';
import { GeneralListeners } from './listeners/GeneralListeners.js';



export const App = {
    /**
     * Exécute une étape d'initialisation de manière isolée pour éviter les pannes en cascade.
     * @param {string} label - Nom du module ou du bloc
     * @param {Function} stepFn - Fonction d'initialisation synchrone ou asynchrone
     * @private
     */
    async _safeInit(label, stepFn) {
        try {
            await stepFn();
        } catch (error) {
            console.error(`[App] Échec lors de l'initialisation de ${label}:`, error);
        }
    },

    async init() {
        // 1. Protection de l'historique et fondations essentielles
        HistoryManager.init();
        UI.init(this);
        AppreciationsManager.init(this, UI);
        EventListenersManager.init(this);
        StorageManager.init(UI, this);

        // Démarrer le chargement de l'état (la lecture localStorage s'exécute de façon synchrone avant l'attente IndexedDB)
        const loadStatePromise = this._safeInit('StorageManager.loadAppState', () => StorageManager.loadAppState());

        // Ouvrir immédiatement la modale de bienvenue dès la première frame (0ms) sans attendre IndexedDB
        await this._safeInit('Welcome & API Validation', () => {
            WelcomeManager.setValidateApiKeyCallback((provider, input, error, btn, onSuccess) =>
                ApiValidationManager.validateApiKeyUI(provider, input, error, btn, onSuccess)
            );
            if (DOM.appVersionDisplay) DOM.appVersionDisplay.textContent = APP_VERSION;
            WelcomeManager.handleFirstVisit();
            document.querySelectorAll('#actions-irreversibles-container details').forEach(d => d.removeAttribute('open'));
        });

        await loadStatePromise;

        // 2. Rendu UI critique immédiat (affiche le tableau sans attendre les services secondaires)
        this.updateUIOnLoad();
        document.documentElement.classList.remove('is-first-visit');

        // 3. Service Cloud Sync en tâche de fond (non bloquant pour l'affichage du tableau)
        this._safeInit('SyncService', async () => {
            const { SyncService } = await import('../services/SyncService.js');
            SyncService.init();
            window.SyncService = SyncService;
        });

        // 4. Rappel Cloud & Thème / Écouteurs de base
        await this._safeInit('UI & Listeners Setup', () => {
            GeneralListeners.initCloudReminder();
            UI.updateSettingsPromptFields();
            EventListenersManager.setupEventListeners();
            this.setupInteractiveSliders();
            this.setupAutoSave();
            this.setupPWA();
        });

        // 5. Services audio & reconnaissance vocale
        await this._safeInit('SpeechRecognitionManager', () => SpeechRecognitionManager.init());
        await this._safeInit('SpeechSynthesisManager', () => SpeechSynthesisManager.init());

        // 6. Menus déroulants personnalisés et sélecteur de modèle IA
        await this._safeInit('Dropdowns & Model Selection', () => {
            DropdownManager.init();
            ModelSelectionManager.init();
            SettingsUIManager.populateModelSelector();
            if (DOM.aiModelSelect && DOM.aiModelSelect.style.display !== 'none') DropdownManager.enhance(DOM.aiModelSelect);
            SettingsUIManager.updateApiStatusDisplay();
            if (DOM.sortSelect) DropdownManager.enhance(DOM.sortSelect);
            if (DOM.loadStudentSelect) DropdownManager.enhance(DOM.loadStudentSelect);
            if (DOM.previewStudentSelect) DropdownManager.enhance(DOM.previewStudentSelect);
            if (DOM.settingsSubjectSelect) DropdownManager.enhance(DOM.settingsSubjectSelect);
        });

        // 7. Gestion des classes
        await this._safeInit('Class Management', async () => {
            ClassManager.init(UI, StorageManager);
            ClassUIManager.init(UI, StorageManager);
            await ClassUIManager.checkAndOfferMigration();
        });

        // 8. Focus Panel UX
        await this._safeInit('FocusPanelManager', () => {
            FocusPanelManager.init(AppreciationsManager, ListViewManager);
        });

        // 9. Modules secondaires (Import, Trombinoscope, Plan de classe, Dashboard) chargés dynamiquement
        await this._safeInit('ImportWizardManager', async () => {
            const { ImportWizardManager } = await import('./ImportWizardManager.js');
            window.ImportWizardManager = ImportWizardManager;
            ImportWizardManager.init();
        });
        await this._safeInit('TrombinoscopeManager', async () => {
            const { TrombinoscopeManager } = await import('./TrombinoscopeManager.js');
            window.TrombinoscopeManager = TrombinoscopeManager;
            TrombinoscopeManager.init();
        });
        await this._safeInit('SeatingChartManager', async () => {
            const { SeatingChartManager } = await import('./SeatingChartManager.js');
            window.SeatingChartManager = SeatingChartManager;
            SeatingChartManager.init();
            SeatingChartManager.restoreActiveView();
        });
        await this._safeInit('ClassDashboardManager', async () => {
            const { ClassDashboardManager } = await import('./ClassDashboardManager.js');
            window.ClassDashboardManager = ClassDashboardManager;
            ClassDashboardManager.init();
        });

        // 10. Transitions de restauration iOS / post-rechargement
        await this._safeInit('RestoreTransitionManager', () => {
            RestoreTransitionManager.checkPendingReloadTransition();
        });
    },

    // --- Initialisation et Setup ---

    /**
     * Rehydrates all app state in-memory without tearing down the browser DOM.
     * Prevents screen flash and reloads all views gracefully.
     */
    async rehydrateAll() {
        await StorageManager.loadAppState({ checkPendingRestore: false });

        const allClasses = ClassManager?.getAllClasses?.() || [];
        const currentClassId = appState.currentClassId;
        const currentClassExists = allClasses.some(c => c.id === currentClassId);
        if ((!currentClassId || !currentClassExists) && allClasses.length > 0) {
            await ClassManager.switchClass(allClasses[0].id);
        } else if (currentClassId) {
            await ClassManager._filterResultsByClass(currentClassId);
        }

        this.updateUIOnLoad();
        ClassUIManager.updateHeaderDisplay();
        const { SeatingChartManager } = await import('./SeatingChartManager.js');
        if (SeatingChartManager) {
            SeatingChartManager.restoreActiveView?.();
        }
        if (FocusPanelManager?.closePanel) {
            FocusPanelManager.closePanel();
        }
        const { ClassDashboardManager } = await import('./ClassDashboardManager.js');
        if (ClassDashboardManager?.restoreOrResetAISection) {
            try {
                ClassDashboardManager.restoreOrResetAISection();
            } catch {
                // Ignore silent error
            }
        }
    },

    updateUIOnLoad() {
        UI.applyTheme();
        UI.updateDarkModeButtonIcon();
        UI.setPeriod(appState.currentPeriod || UI.getPeriods()[0]);
        UI.updatePeriodSystemUI();
        UI.setInputMode(appState.currentInputMode || CONSTS.INPUT_MODE.SINGLE, true);
        SettingsUIManager.updatePersonalizationState();
        UI.updateGenerateButtonState();
        AppreciationsManager.renderResults();
        AppreciationsManager.resetForm(false);
        UI.updateHeaderPremiumLook();
        UI.updateStatsTooltips();

        // Restaurer les champs des paramètres (clés API, modèle, curseurs) avant le calcul du statut
        UI.updateSettingsFields?.();

        // Restaurer l'état des API au chargement
        SettingsUIManager.updateApiStatusDisplay();

        // Restaurer l'état du toggle Ollama
        if (DOM.ollamaEnabledToggle) {
            DOM.ollamaEnabledToggle.checked = appState.ollamaEnabled || false;
        }
        if (DOM.ollamaBaseUrl) {
            DOM.ollamaBaseUrl.value = appState.ollamaBaseUrl || 'http://localhost:11434';
        }

        // Si des clés sont validées, restaurer l'état des boutons
        this._restoreValidatedButtonStates();

        // Si la modale des paramètres est ouverte (ex: restauration Cloud, import JSON ou réinitialisation),
        // rafraîchir son snapshot pour qu'une fermeture par "✕" / "Échap" n'annule pas l'état restauré
        if (UIState?.settingsBeforeEdit && Object.keys(UIState.settingsBeforeEdit).length > 0) {
            SettingsUIManager.createSnapshot?.();
        }

        if (DOM.appVersionDisplay) DOM.appVersionDisplay.textContent = APP_VERSION;
    },

    /**
     * Restaure l'état visuel des boutons de validation si les clés sont déjà validées.
     * Pour Ollama, vérifie d'abord si le serveur est toujours accessible.
     * @private
     */
    async _restoreValidatedButtonStates() {
        const validatedKeys = appState.validatedApiKeys || {};

        const buttonMap = {
            google: DOM.validateGoogleApiKeyBtn,
            groq: DOM.validateGroqApiKeyBtn,
            openai: DOM.validateOpenaiApiKeyBtn,
            openrouter: DOM.validateOpenrouterApiKeyBtn,
            anthropic: DOM.validateAnthropicApiKeyBtn,
            mistral: DOM.validateMistralApiKeyBtn,
            ollama: DOM.validateOllamaBtn,
        };

        for (const [provider, isValidated] of Object.entries(validatedKeys)) {
            if (isValidated && buttonMap[provider]) {
                if (provider === 'ollama') {
                    this._verifyOllamaStatusAsync();
                    continue;
                }

                buttonMap[provider].classList.remove('btn-validated', 'btn-needs-validation');
                buttonMap[provider].innerHTML = 'Vérifier';
            }
        }
    },

    /**
     * Vérifie de façon asynchrone si Ollama est toujours accessible.
     * Si non accessible, invalide l'état de validation sauvegardé.
     * @private
     */
    async _verifyOllamaStatusAsync() {
        try {
            const isAvailable = await AIService.checkOllamaAvailability();

            if (isAvailable && appState.ollamaEnabled) {
                if (DOM.validateOllamaBtn) {
                    DOM.validateOllamaBtn.classList.remove('btn-validated', 'btn-needs-validation');
                    DOM.validateOllamaBtn.innerHTML = 'Vérifier';
                }
                SettingsUIManager.updateOllamaStatus('valid', appState.ollamaInstalledModels || []);
            } else {
                // Ollama n'est plus accessible, invalider l'état
                if (appState.validatedApiKeys) {
                    appState.validatedApiKeys.ollama = false;
                }
                if (DOM.validateOllamaBtn) {
                    DOM.validateOllamaBtn.classList.remove('btn-validated');
                    DOM.validateOllamaBtn.innerHTML = 'Vérifier';
                }
                SettingsUIManager.updateOllamaStatus('not-configured');
            }
        } catch (e) {
            // En cas d'erreur, invalider silencieusement
            if (appState.validatedApiKeys) {
                appState.validatedApiKeys.ollama = false;
            }
        }
    },

    setupAutoSave() { setInterval(() => StorageManager.saveAppState(), CONFIG.AUTO_SAVE_INTERVAL_MS); },

    setupPWA() {
        // Initialize PWA Install Manager (handles banner + menu button)
        PwaInstallManager.init();

        // Offline Detection - Contextual state update (Cloud menu & AI button tooltips)
        const updateOnlineStatus = () => {
            UI.updateGenerateButtonState();
            ResultsUIManager.updateGenerateButtonState();
        };

        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
    },

    setupInteractiveSliders() {
        const sliders = document.querySelectorAll('.range-slider');
        sliders.forEach(slider => {
            const input = slider.querySelector('input[type="range"]');
            const valueDisplay = slider.querySelector('.range-value');
            if (input && valueDisplay) {
                input.addEventListener('input', () => {
                    valueDisplay.textContent = input.value;
                    const percent = ((input.value - input.min) / (input.max - input.min)) * 100;
                    input.style.setProperty('--percent', `${percent}%`);
                });
                input.dispatchEvent(new Event('input'));
            }
        });
    },

    // --- Core Logic Delegations ---

    // Handlers conservés car ils ont une logique spécifique liée à l'UI principale ou sont appelés dynamiquement

    handleGenerateClick() {
        const mode = appState.currentInputMode;
        if (mode === CONSTS.INPUT_MODE.SINGLE) AppreciationsManager.generateSingleAppreciation();
    },

    handleSingleStudentTabClick() {
        UI.setInputMode(CONSTS.INPUT_MODE.SINGLE);
    },

    handleMassImportTabClick() {
        UI.setInputMode(CONSTS.INPUT_MODE.MASS);
    },

    handleClearClick() {
        if (confirm('Voulez-vous vraiment effacer tous les champs du formulaire ?')) {
            AppreciationsManager.resetForm(true);
        }
    },

    handleHelpButtonClick() {
        UI.openModal(DOM.helpModal, { isStacked: true });
        // Peupler les exemples de format d'import
        UI.updateHelpImportFormat();
    },

    // Gestion des événements d'input (reste ici pour l'instant car très lié au DOM spécifique)
    handleInputFieldChange(e) {
        if (appState.currentInputMode === CONSTS.INPUT_MODE.SINGLE) {
            UI.updateGenerateButtonState();

            // Auto-sauvegarde de l'état du formulaire si nécessaire
            // (Implémentation future possible)
        }
    },

    handleInputEnterKey(e) {
        if (appState.currentInputMode === CONSTS.INPUT_MODE.SINGLE) {
            // Focus next input or generate
        }
    },

    handleAiModelSelectChange() {
        const model = DOM.aiModelSelect.value;
        appState.currentAIModel = model;
        // Si c'est un modèle Google et qu'on n'a pas de clé, on peut suggérer
        if (model.startsWith('gemini') && !appState.googleApiKey) {
            UI.showNotification("Une clé API Google Gemini est requise pour ce modèle.", "info");
        }
        StorageManager.saveAppState();
        SettingsUIManager.updateHeaderAiModelDisplay();
        UI.updateHeaderPremiumLook();
        SettingsUIManager.updatePersonalizationState();
    },

    // --- Méthodes de délégation simples ---

    populatePreviewStudentSelect() { PreviewManager.populatePreviewStudentSelect(); },
    handleImportSettingsBtnClick() { document.getElementById('importSettingsInput')?.click(); },
};
