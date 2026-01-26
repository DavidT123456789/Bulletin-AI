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
import { ClassAnalysisManager } from './ClassAnalysisManager.js';
import { VariationsManager } from './VariationsManager.js';
import { EventListenersManager } from './EventListenersManager.js';
import { SettingsUIManager } from './SettingsUIManager.js';
import { PreviewManager } from './PreviewManager.js';
import { SpeechRecognitionManager } from './SpeechRecognitionManager.js';
import { EventHandlersManager } from './EventHandlersManager.js';
import { FormUI } from './FormUIManager.js';
import { DropdownManager } from './DropdownManager.js';
import { ClassManager } from './ClassManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { ListViewManager } from './ListViewManager.js';



export const App = {
    async init() {
        UI.init(this);
        AppreciationsManager.init(this, UI);
        EventListenersManager.init(this);
        StorageManager.init(UI, this);
        await StorageManager.loadAppState();

        // Initialize cloud sync service (reconnects to saved provider)
        try {
            const { SyncService } = await import('../services/SyncService.js');
            SyncService.init();
            // Expose for reconnection from notification link
            window.SyncService = SyncService;
        } catch (e) {
            console.warn('[App] Cloud sync init failed:', e.message);
        }

        UI.applyTheme();
        UI.updateSettingsPromptFields();
        EventListenersManager.setupEventListeners();
        this.setupInteractiveSliders();
        this.updateUIOnLoad();
        this.setupAutoSave();
        this.setupPWA();

        // Delegate speech recognition to SpeechRecognitionManager
        SpeechRecognitionManager.init();

        // Initialize custom dropdowns
        DropdownManager.init();
        // Enhance main selects with custom dropdowns
        if (DOM.aiModelSelect) DropdownManager.enhance(DOM.aiModelSelect);
        if (DOM.sortSelect) DropdownManager.enhance(DOM.sortSelect);
        // Enhance student selects (sidebar and preview)
        if (DOM.loadStudentSelect) DropdownManager.enhance(DOM.loadStudentSelect);
        if (DOM.previewStudentSelect) DropdownManager.enhance(DOM.previewStudentSelect);
        // Enhance settings modal selects
        if (DOM.settingsSubjectSelect) DropdownManager.enhance(DOM.settingsSubjectSelect);

        // Set callback for welcome modal API validation
        WelcomeManager.setValidateApiKeyCallback((provider, input, error, btn, onSuccess) =>
            ApiValidationManager.validateApiKeyUI(provider, input, error, btn, onSuccess)
        );

        if (DOM.appVersionDisplay) DOM.appVersionDisplay.textContent = APP_VERSION;
        WelcomeManager.handleFirstVisit();
        document.querySelectorAll('#actions-irreversibles-container details').forEach(d => d.removeAttribute('open'));

        // Initialize Class Management
        ClassManager.init(UI, StorageManager);
        ClassUIManager.init(UI, StorageManager);
        await ClassUIManager.checkAndOfferMigration();

        // Liste + Focus UX: Initialize Focus Panel
        // Liste + Focus UX: Initialize Focus Panel
        FocusPanelManager.init(AppreciationsManager, ListViewManager);

        // Slide-Over Import Panel: Initialize
        const { ImportWizardManager } = await import('./ImportWizardManager.js');
        ImportWizardManager.init();

        // Trombinoscope Photo Import: Initialize
        const { TrombinoscopeManager } = await import('./TrombinoscopeManager.js');
        TrombinoscopeManager.init();
    },

    // --- Initialisation et Setup ---

    updateUIOnLoad() {
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
            openai: DOM.validateOpenaiApiKeyBtn,
            openrouter: DOM.validateOpenrouterApiKeyBtn,
            ollama: DOM.validateOllamaBtn,
        };

        for (const [provider, isValidated] of Object.entries(validatedKeys)) {
            if (isValidated && buttonMap[provider]) {
                // Pour Ollama, vérifier si le serveur est toujours accessible
                if (provider === 'ollama') {
                    // Vérification silencieuse en arrière-plan
                    this._verifyOllamaStatusAsync();
                    continue; // Ne pas restaurer l'état tant que non vérifié
                }

                buttonMap[provider].classList.add('btn-validated');
                buttonMap[provider].innerHTML = '<i class="fas fa-check"></i> OK';
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
                // Ollama est accessible, restaurer l'état "validé"
                if (DOM.validateOllamaBtn) {
                    DOM.validateOllamaBtn.classList.add('btn-validated');
                    DOM.validateOllamaBtn.innerHTML = '<i class="fas fa-check"></i> OK';
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
        // PWA Install Prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            if (DOM.installPwaBtn) {
                DOM.installPwaBtn.style.display = 'block';
                DOM.installPwaBtn.addEventListener('click', () => {
                    e.prompt();
                    e.userChoice.then((choiceResult) => { DOM.installPwaBtn.style.display = 'none'; });
                });
            }
        });

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

    // Class Analysis
    analyzeClass() { return ClassAnalysisManager.analyzeClass(); },
    copyClassAnalysis() { return ClassAnalysisManager.copyClassAnalysis(); },
    handleClassAnalysisActions(btn) { return ClassAnalysisManager.handleClassAnalysisActions(btn); },

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
