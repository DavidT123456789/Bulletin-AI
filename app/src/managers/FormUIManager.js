/**
 * @fileoverview Gestionnaire des champs de formulaire des paramètres.
 * 
 * Ce module gère la mise à jour des champs de formulaire dans la modale
 * des paramètres, y compris les sliders IA, les listes de vocabulaire,
 * et l'affichage des prompts.
 * 
 * @module managers/FormUIManager
 */

import { appState } from '../state/State.js';
import { CONFIG, DEFAULT_IA_CONFIG, MODEL_DESCRIPTIONS, APP_VERSION } from '../config/Config.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { AppreciationsManager } from './AppreciationsManager.js';

/** @type {import('./AppManager.js').App|null} */
let App;

/**
 * Module de gestion des formulaires dans les paramètres.
 * @namespace FormUI
 */
export const FormUI = {
    /**
     * Initialise le module avec une référence à l'application.
     * @param {Object} appInstance - Instance de l'application principale
     */
    init(appInstance) {
        App = appInstance;
    },

    /**
     * Met à jour tous les champs des paramètres.
     */
    updateSettingsFields() {
        const isGenericMode = !appState.useSubjectPersonalization;
        let iaConfig;
        let subjectName;

        if (isGenericMode) {
            subjectName = "Paramètres par défaut";
            iaConfig = DEFAULT_IA_CONFIG;
        } else {
            // Mode personnalisé - utiliser MonStyle
            subjectName = "Mon Style";
            const subjectData = appState.subjects['MonStyle'] || appState.subjects['Générique'];
            iaConfig = subjectData?.iaConfig || DEFAULT_IA_CONFIG;
        }

        DOM.periodSystemRadios.forEach(r => r.checked = r.value === appState.periodSystem);
        DOM.settingsEvolutionThresholdPositive.value = appState.evolutionThresholds.positive;
        DOM.settingsEvolutionThresholdNegative.value = appState.evolutionThresholds.negative;

        if (DOM.iaLengthSlider) {
            DOM.iaLengthSlider.min = "10";
            DOM.iaLengthSlider.max = "90";
            DOM.iaLengthSlider.value = iaConfig.length;
        }
        DOM.iaToneSlider.value = iaConfig.tone;

        // [FIX] Always try to get styleInstructions from MonStyle first to prevent data loss
        // even if iaConfig fallback was triggered due to corrupted structure
        let styleInstructionsValue = '';
        if (!isGenericMode) {
            // Try direct access to MonStyle first
            styleInstructionsValue = appState.subjects['MonStyle']?.iaConfig?.styleInstructions
                || iaConfig.styleInstructions
                || '';
        }
        DOM.iaStyleInstructions.value = styleInstructionsValue;

        // Load discipline field (optional, for subject-specific vocabulary)
        let disciplineValue = '';
        if (!isGenericMode) {
            disciplineValue = appState.subjects['MonStyle']?.iaConfig?.discipline
                || iaConfig.discipline
                || '';
        }
        if (DOM.iaDiscipline) {
            DOM.iaDiscipline.value = disciplineValue;
        }

        document.querySelectorAll('input[name="iaVoiceRadio"]').forEach(radio => {
            radio.checked = radio.value === (iaConfig.voice || 'default');
        });

        const iaStyleHeader = document.getElementById('iaStyleHeader');
        if (iaStyleHeader) {
            let headerText = `<i class="fas fa-sliders-h" aria-hidden="true"></i> Style de Rédaction`;
            if (isGenericMode) {
                headerText += ` <span class="generic-lock-icon tooltip" data-tooltip="Les réglages sont verrouillés sur les valeurs par défaut lorsque la personnalisation est désactivée."><i class="fas fa-lock"></i></span>`;
            }
            iaStyleHeader.innerHTML = headerText;
        }

        const controlsToDisable = [
            DOM.iaLengthSlider, DOM.iaToneSlider, DOM.iaStyleInstructions, DOM.iaDiscipline,
            ...document.querySelectorAll('#iaVoiceSelector input'),
            ...document.querySelectorAll('#iaVoiceSelector label')
        ];
        controlsToDisable.forEach(el => { if (el) el.disabled = isGenericMode; });

        // Ajouter/retirer la classe disabled sur la carte pour le style visuel
        const controlsPanel = document.getElementById('settings-controls-panel');
        if (controlsPanel) {
            controlsPanel.classList.toggle('disabled', isGenericMode);
        }

        // Update slider display labels directly (dispatchEvent may fire before SettingsModal listeners are attached)
        if (DOM.iaLengthSlider) {
            const lengthVal = parseInt(DOM.iaLengthSlider.value);
            const approxChars = Math.round(lengthVal * 6.5);
            const lengthDisplay = document.getElementById('iaLengthSliderValue');
            if (lengthDisplay) lengthDisplay.textContent = `~ ${lengthVal} mots (≈ ${approxChars} car.)`;
        }

        if (DOM.iaToneSlider) {
            const toneVal = parseInt(DOM.iaToneSlider.value);
            const toneLabels = {
                1: 'Très encourageant',
                2: 'Bienveillant',
                3: 'Libre (par défaut)',
                4: 'Exigeant',
                5: 'Strict'
            };
            const toneDisplay = document.getElementById('iaToneSliderValue');
            if (toneDisplay) toneDisplay.textContent = toneLabels[toneVal] || 'Libre (par défaut)';
        }


        if (DOM.aiModelSelect) DOM.aiModelSelect.value = appState.currentAIModel;
        if (DOM.openaiApiKey) DOM.openaiApiKey.value = appState.openaiApiKey;
        if (DOM.googleApiKey) DOM.googleApiKey.value = appState.googleApiKey;
        if (DOM.openrouterApiKey) DOM.openrouterApiKey.value = appState.openrouterApiKey;
        if (DOM.anthropicApiKey) DOM.anthropicApiKey.value = appState.anthropicApiKey;
        if (DOM.mistralApiKey) DOM.mistralApiKey.value = appState.mistralApiKey;
        if (DOM.appVersionDisplay) DOM.appVersionDisplay.textContent = APP_VERSION;
        if (DOM.sessionTokens) DOM.sessionTokens.textContent = (appState.sessionTokens || 0).toLocaleString('fr-FR');

        // Confidentialité
        if (DOM.settingsPrivacyAnonymizeToggle) {
            DOM.settingsPrivacyAnonymizeToggle.checked = appState.anonymizeData;
        }

        this.toggleAIKeyFields();
        this.renderSettingsLists();
        this.updateModelDescription();
        this._updateApiStatusDisplay();
    },

    /**
     * Met à jour l'affichage du récapitulatif des APIs.
     * Distingue : pas de clé, clé non vérifiée, quota épuisé, validée.
     * @private
     */
    _updateApiStatusDisplay() {
        const providers = [
            { id: 'google', key: appState.googleApiKey, inputId: 'googleApiKey', btnId: 'validateGoogleApiKeyBtn' },
            { id: 'openai', key: appState.openaiApiKey, inputId: 'openaiApiKey', btnId: 'validateOpenaiApiKeyBtn' },
            { id: 'openrouter', key: appState.openrouterApiKey, inputId: 'openrouterApiKey', btnId: 'validateOpenrouterApiKeyBtn' },
            { id: 'anthropic', key: appState.anthropicApiKey, inputId: 'anthropicApiKey', btnId: 'validateAnthropicApiKeyBtn' },
            { id: 'mistral', key: appState.mistralApiKey, inputId: 'mistralApiKey', btnId: 'validateMistralApiKeyBtn' },
        ];

        providers.forEach(({ id, key, inputId, btnId }) => {
            const el = document.getElementById(`${id}ApiStatus`);
            const btn = document.getElementById(btnId);

            if (!el) return;

            const hasKey = !!key && key.length > 5;
            const inputEl = document.getElementById(inputId);

            // Vérifier l'état de validation via les classes CSS de l'input
            let status = 'none'; // none, pending, quota, valid

            // Check persisted validation state first
            if (appState.validatedApiKeys && appState.validatedApiKeys[id]) {
                status = 'valid';
                if (appState.apiKeyStatus && appState.apiKeyStatus[id] === 'quota-warning') {
                    status = 'quota';
                }
            } else if (hasKey) {
                if (inputEl?.classList.contains('input-success')) {
                    status = 'valid';
                } else if (inputEl?.classList.contains('input-warning')) {
                    status = 'quota';
                } else {
                    status = 'pending';
                }
            }

            // Mettre à jour les classes du pill
            el.classList.remove('active', 'inactive', 'warning');
            const badge = el.querySelector('.api-status-badge');

            if (status === 'valid') {
                el.classList.add('active');
                if (badge) badge.textContent = '✓ Validée';
            } else if (status === 'quota') {
                el.classList.add('warning');
                if (badge) badge.textContent = '⚠️ Quota épuisé';
            } else if (status === 'pending') {
                el.classList.add('inactive');
                if (badge) badge.textContent = '⏳ Non vérifiée';
            } else {
                el.classList.add('inactive');
                if (badge) badge.textContent = 'Non configurée';
            }

            // Mettre à jour l'état du bouton
            if (btn) {
                if (status === 'valid' || status === 'quota') {
                    btn.classList.add('btn-validated');
                    btn.classList.remove('btn-needs-validation');
                    btn.innerHTML = '<i class="fas fa-check"></i> OK';
                } else {
                    btn.classList.remove('btn-validated');
                    // btn-needs-validation is handled by input listener, 
                    // but we can ensure it's clean here
                    if (hasKey && status === 'pending') {
                        btn.innerHTML = 'Vérifier';
                    } else {
                        btn.innerHTML = 'Vérifier';
                    }
                }
            }
        });
    },

    /**
     * Met à jour la description du modèle IA sélectionné.
     */
    updateModelDescription() {
        const descEl = document.getElementById('aiModelDescription');
        if (DOM.aiModelSelect && descEl) {
            descEl.innerHTML = MODEL_DESCRIPTIONS[DOM.aiModelSelect.value] || "Description...";
        }
    },

    /**
     * Met à jour l'affichage des prompts IA dans les paramètres.
     */


    // État pour les transitions d'onglets des paramètres
    _currentSettingsTab: 'templates',
    _isSettingsTabAnimating: false,

    /**
     * Affiche un onglet spécifique dans la modale des paramètres avec animation iOS.
     * Utilise les mêmes transitions slide que la modale Bienvenue pour la cohérence.
     * @param {string} tabName - Nom de l'onglet à afficher ('templates', 'advanced', 'about')
     */
    showSettingsTab(tabName) {
        const tabOrder = ['templates', 'advanced', 'about'];

        if (this._isSettingsTabAnimating) return;

        // Synchroniser l'état avec le DOM
        const activeTabBtn = DOM.settingsModal.querySelector('.settings-tab.active');
        if (activeTabBtn?.dataset.tab) {
            this._currentSettingsTab = activeTabBtn.dataset.tab;
        }

        if (tabName === this._currentSettingsTab) return;

        const oldContent = document.getElementById(`${this._currentSettingsTab}TabContent`);
        const newContent = document.getElementById(`${tabName}TabContent`);
        if (!newContent) return;

        const currentIndex = tabOrder.indexOf(this._currentSettingsTab);
        const targetIndex = tabOrder.indexOf(tabName);
        const direction = targetIndex > currentIndex ? 'next' : 'prev';

        // Helper pour mettre à jour les états des boutons
        const updateTabButtons = () => {
            DOM.settingsModal.querySelectorAll('.settings-tab').forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            const btn = DOM.settingsModal.querySelector(`.settings-tab[data-tab="${tabName}"]`);
            if (btn) {
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
            }
        };

        // Helper pour les actions post-transition
        const onTransitionComplete = () => {
            if (tabName === 'templates' && App?.populatePreviewStudentSelect) {
                App.populatePreviewStudentSelect();
            }
            import('./UIManager.js').then(({ UI }) => {
                UI.initGliders();
                newContent.querySelectorAll('.generation-mode-selector, .input-mode-tabs').forEach(container => {
                    if (container.classList.contains('has-glider')) {
                        UI.updateGlider(container, true);
                    }
                });
            });
        };

        // Vérifier si oldContent est visible
        const isOldContentVisible = oldContent && (
            oldContent.classList.contains('active') ||
            window.getComputedStyle(oldContent).display !== 'none'
        );

        // Premier affichage : instantané sans animation
        if (!isOldContentVisible) {
            DOM.settingsModal.querySelectorAll('.tab-content').forEach(c => {
                c.style.display = 'none';
                c.classList.remove('active');
            });
            updateTabButtons();
            newContent.style.display = 'block';
            newContent.classList.add('active');
            this._currentSettingsTab = tabName;
            setTimeout(onTransitionComplete, 50);
            return;
        }

        // Transition animée
        this._isSettingsTabAnimating = true;
        const outClass = direction === 'next' ? 'content-slide-out-left' : 'content-slide-out-right';
        const inClass = direction === 'next' ? 'content-slide-in-right' : 'content-slide-in-left';
        const animClasses = ['content-slide-out-left', 'content-slide-out-right', 'content-slide-in-left', 'content-slide-in-right'];

        updateTabButtons();

        // Lancer les deux animations simultanément - le CSS gère la superposition
        oldContent.classList.add(outClass);
        newContent.style.display = 'block';
        newContent.classList.add('active', inClass);

        // Nettoyer l'ancien contenu après sa sortie (350ms = durée animation sortie)
        setTimeout(() => {
            oldContent.style.display = 'none';
            oldContent.classList.remove('active', ...animClasses);
        }, 350);

        // Finaliser après l'animation d'entrée (400ms = durée animation entrée)
        setTimeout(() => {
            newContent.classList.remove(...animClasses);
            this._isSettingsTabAnimating = false;
            this._currentSettingsTab = tabName;
            onTransitionComplete();
        }, 400);
    },

    /**
     * Affiche un avertissement si la clé API requise pour le modèle sélectionné est manquante.
     */
    toggleAIKeyFields() {
        if (!DOM.aiModelSelect) return;
        const model = DOM.aiModelSelect.value;
        const warningEl = document.getElementById('missingApiKeyWarning');
        const warningTextEl = document.getElementById('missingKeyText');

        if (!warningEl) return;

        // Détermine quel provider est requis et s'il a une clé
        let requiredProvider = '';
        let hasKey = false;
        const providerNames = {
            google: 'Google Gemini',
            openai: 'OpenAI',
            openrouter: 'OpenRouter',
            anthropic: 'Claude (Anthropic)',
            mistral: 'Mistral',
            ollama: 'Ollama (local)'
        };

        if (model.startsWith('ollama')) {
            // Ollama est local, pas besoin de clé API
            requiredProvider = 'ollama';
            hasKey = appState.ollamaEnabled === true;
        } else if (model.startsWith('openai')) {
            requiredProvider = 'openai';
            hasKey = !!appState.openaiApiKey && appState.openaiApiKey.length > 5;
        } else if (model.startsWith('gemini')) {
            requiredProvider = 'google';
            hasKey = !!appState.googleApiKey && appState.googleApiKey.length > 5;
        } else if (model.startsWith('anthropic')) {
            requiredProvider = 'anthropic';
            hasKey = !!appState.anthropicApiKey && appState.anthropicApiKey.length > 5;
        } else if (model.startsWith('mistral-direct')) {
            requiredProvider = 'mistral';
            hasKey = !!appState.mistralApiKey && appState.mistralApiKey.length > 5;
        } else {
            // Mistral, DeepSeek via OpenRouter, etc.
            requiredProvider = 'openrouter';
            hasKey = !!appState.openrouterApiKey && appState.openrouterApiKey.length > 5;
        }

        if (hasKey) {
            warningEl.style.display = 'none';
        } else {
            if (requiredProvider === 'ollama') {
                warningTextEl.textContent = `Ce modèle nécessite qu'Ollama soit activé et en cours d'exécution.`;
            } else {
                warningTextEl.textContent = `Ce modèle requiert une clé ${providerNames[requiredProvider]}.`;
            }
            warningEl.style.display = 'flex';
        }
    },

    /**
     * Met à jour les listes dans les paramètres.
     * Note: Cette fonction est conservée pour compatibilité mais ne fait plus rien
     * après la suppression de la bibliothèque de mots-clés.
     */
    renderSettingsLists() {
        // La bibliothèque de mots-clés a été supprimée.
        // Cette fonction est conservée pour éviter les erreurs d'appel.
    }
};
