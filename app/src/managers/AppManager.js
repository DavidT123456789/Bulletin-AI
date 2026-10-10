import { appState, massImportMappingState, currentImportPreviewData, setMassImportMappingState, setCurrentImportPreviewData, UIState } from '../state/State.js';
import { CONFIG, CONSTS, APP_VERSION, DEFAULT_PROMPT_TEMPLATES, DEFAULT_IA_CONFIG, MODEL_DESCRIPTIONS, DEFAULT_EVOLUTION_THRESHOLDS } from '../config/Config.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { StorageManager } from './StorageManager.js';
import { AIService } from '../services/AIService.js';
// New extracted managers
import { FileImportManager } from './FileImportManager.js';
import { WelcomeManager } from './WelcomeManager.js';
import { ApiValidationManager } from './ApiValidationManager.js';

import { VariationsManager } from './VariationsManager.js';
import { EventListenersManager } from './EventListenersManager.js';
import { SettingsUIManager } from './SettingsUIManager.js';
import { PreviewManager } from './PreviewManager.js';
import { SpeechRecognitionManager } from './SpeechRecognitionManager.js';
import { SpeechSynthesisManager } from './SpeechSynthesisManager.js';
import { EventHandlersManager } from './EventHandlersManager.js';
import { FormUI } from './FormUIManager.js';
import { DropdownManager } from './DropdownManager.js';
import { ClassManager } from './ClassManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { ListViewManager } from './ListViewManager.js';
import { PwaInstallManager } from './PwaInstallManager.js';
import { HistoryManager } from './HistoryManager.js';
import { ImportWizardManager } from './ImportWizardManager.js';
import { TrombinoscopeManager } from './TrombinoscopeManager.js';
import { SeatingChartManager } from './SeatingChartManager.js';
import { ClassDashboardManager } from './ClassDashboardManager.js';
import { RestoreTransitionManager } from './RestoreTransitionManager.js';
import { ModelSelectionManager } from './ModelSelectionManager.js';
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

        await this._safeInit('StorageManager.loadAppState', () => StorageManager.loadAppState());

        // 2. Rendu UI critique immédiat (affiche le tableau sans attendre les services secondaires)
        this.updateUIOnLoad();

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

        // 4. Services audio & reconnaissance vocale
        await this._safeInit('SpeechRecognitionManager', () => SpeechRecognitionManager.init());
        await this._safeInit('SpeechSynthesisManager', () => SpeechSynthesisManager.init());

        // 5. Menus déroulants personnalisés et sélecteur de modèle IA
        await this._safeInit('Dropdowns & Model Selection', () => {
            DropdownManager.init();
            ModelSelectionManager.init();
            SettingsUIManager.populateModelSelector();
            if (DOM.aiModelSelect && DOM.aiModelSelect.style.display !== 'none') DropdownManager.enhance(DOM.aiModelSelect);
            if (DOM.sortSelect) DropdownManager.enhance(DOM.sortSelect);
            if (DOM.loadStudentSelect) DropdownManager.enhance(DOM.loadStudentSelect);
            if (DOM.previewStudentSelect) DropdownManager.enhance(DOM.previewStudentSelect);
            if (DOM.settingsSubjectSelect) DropdownManager.enhance(DOM.settingsSubjectSelect);
        });

        // 6. Accueil et validation de clés API
        await this._safeInit('Welcome & API Validation', () => {
            WelcomeManager.setValidateApiKeyCallback((provider, input, error, btn, onSuccess) =>
                ApiValidationManager.validateApiKeyUI(provider, input, error, btn, onSuccess)
            );
            if (DOM.appVersionDisplay) DOM.appVersionDisplay.textContent = APP_VERSION;
            WelcomeManager.handleFirstVisit();
            document.querySelectorAll('#actions-irreversibles-container details').forEach(d => d.removeAttribute('open'));
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

        // 9. Modules secondaires (Import, Trombinoscope, Plan de classe, Dashboard)
        await this._safeInit('ImportWizardManager', () => ImportWizardManager.init());
        await this._safeInit('TrombinoscopeManager', () => TrombinoscopeManager.init());
        await this._safeInit('SeatingChartManager', () => {
            SeatingChartManager.init();
            SeatingChartManager.restoreActiveView();
        });
        await this._safeInit('ClassDashboardManager', () => ClassDashboardManager.init());

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
        if (SeatingChartManager) {
            SeatingChartManager.restoreActiveView?.();
        }
        if (FocusPanelManager?.closePanel) {
            FocusPanelManager.closePanel();
        }
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

        // Offline Detection - Silent state update (visual feedback via .is-offline class and disabled buttons is sufficient)
        const updateOnlineStatus = () => {
            const isOffline = !navigator.onLine;
            document.body.classList.toggle('is-offline', isOffline);
            // Update generate button state (buttons show tooltip explaining why they're disabled)
            UI.updateGenerateButtonState();
        };

        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);

        // Set initial state
        if (!navigator.onLine) {
            document.body.classList.add('is-offline');
        }
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

    // --- Refinement Logic (partiellement ici car partage d'état refinementEdits) ---

    // --- Refinement Logic (partiellement ici car partage d'état refinementEdits) ---
    // Legacy Refinement logic removed


    // --- Navigation Modales ---

    _navigateModalView(direction, mode) {
        const visibleResults = appState.filteredResults;
        if (visibleResults.length === 0) return;

        let currentId;
        let modalBody;
        if (mode === 'details') {
            const content = DOM.studentDetailsModal.querySelector('.modal-content');
            currentId = content.dataset.currentId;
            modalBody = DOM.studentDetailsModal.querySelector('.modal-body');
        } else {
            const content = DOM.refinementModal.querySelector('.modal-content');
            currentId = content.dataset.currentId;
            modalBody = DOM.refinementModal.querySelector('.modal-body');
        }

        const currentIndex = visibleResults.findIndex(r => r.id === currentId);
        if (currentIndex === -1) return;

        let newIndex = currentIndex + direction;
        if (newIndex < 0) newIndex = visibleResults.length - 1;
        if (newIndex >= visibleResults.length) newIndex = 0;

        const nextResult = visibleResults[newIndex];

        // iOS 2025 Premium Slide Animation with smooth height transition
        if (modalBody) {
            const outClass = direction > 0 ? 'content-slide-out-left' : 'content-slide-out-right';
            const inClass = direction > 0 ? 'content-slide-in-right' : 'content-slide-in-left';

            // Lock current height for smooth transition
            const currentHeight = modalBody.offsetHeight;
            modalBody.style.height = `${currentHeight}px`;

            modalBody.classList.add(outClass);

            setTimeout(() => {
                modalBody.classList.remove(outClass);

                // Update content
                if (mode === 'details') AppreciationsManager.showAppreciationDetails(nextResult.id, true);
                else AppreciationsManager.refineAppreciation(nextResult.id, true);

                // Calculate new height and animate
                requestAnimationFrame(() => {
                    modalBody.style.height = 'auto';
                    const newHeight = modalBody.offsetHeight;
                    modalBody.style.height = `${currentHeight}px`;

                    requestAnimationFrame(() => {
                        modalBody.style.height = `${newHeight}px`;

                        // Clear explicit height after transition
                        setTimeout(() => {
                            modalBody.style.height = '';
                        }, 450);
                    });
                });

                // Animate in
                modalBody.classList.add(inClass);
                setTimeout(() => modalBody.classList.remove(inClass), 400);
            }, 350);
        } else {
            // Fallback without animation
            if (mode === 'details') AppreciationsManager.showAppreciationDetails(nextResult.id, true);
            else AppreciationsManager.refineAppreciation(nextResult.id, true);
        }
    },

    // --- Méthodes de délégation simples (pour compatibilité si appelées ailleurs) ---



    // Preview
    getPreviewStudentData() { return PreviewManager.getPreviewStudentData(); },
    displayPreviewStudentData(r) { PreviewManager.displayPreviewStudentData(r); },
    resetSettingsPreview() { PreviewManager.resetSettingsPreview(); },
    populatePreviewStudentSelect() { PreviewManager.populatePreviewStudentSelect(); },

    // Settings
    saveSettings() { SettingsUIManager.saveSettings(); },
    cancelSettings() { SettingsUIManager.cancelSettings(); },
    resetPersonalStyle() { SettingsUIManager.resetPersonalStyle(); },
    handlePersonalizationToggleChange(e) {
        appState.useSubjectPersonalization = e.target.checked;
        SettingsUIManager.updatePersonalizationState();
    },
    // handleUseVocabLibraryToggleChange supprimé - fonctionnalité vocabulaire dépréciée

    // Event Handlers (Legacy delegation) - REMOVED

    // Others
    validateApiKey(p) { ApiValidationManager.validateApiKey(p); },
    handleImportSettingsBtnClick() { document.getElementById('importSettingsInput')?.click(); },
    handleImportFileBtnClick() { FileImportManager.handleImportFileBtnClick(); },
    updateImportPreview() { FileImportManager.updateImportPreview(); },

    // Appreciations (Legacy) - REMOVED
};
