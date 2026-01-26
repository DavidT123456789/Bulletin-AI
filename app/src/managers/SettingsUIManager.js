/**
 * @fileoverview Gestionnaire de l'interface des paramètres pour Bulletin AI.
 * 
 * Ce module centralise la logique liée à la gestion des paramètres,
 * incluant les matières, le vocabulaire, et la personnalisation.
 * 
 * @module managers/SettingsUIManager
 */

import { appState, UIState } from '../state/State.js';
import { DEFAULT_PROMPT_TEMPLATES, DEFAULT_IA_CONFIG } from '../config/Config.js';
import { MODEL_SHORT_NAMES, FALLBACK_CONFIG } from '../config/models.js';
import { DOM } from '../utils/DOM.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { DropdownManager } from './DropdownManager.js';

/**
 * Module de gestion de l'interface des paramètres.
 * @namespace SettingsUIManager
 */
export const SettingsUIManager = {
    /**
     * Sauvegarde les modifications du style personnalisé.
     * @private
     */
    _savePersonalStyleChanges() {
        // S'assurer que MonStyle existe avec structure correcte
        if (!appState.subjects['MonStyle']) {
            appState.subjects['MonStyle'] = { iaConfig: { ...DEFAULT_IA_CONFIG } };
        }
        if (!appState.subjects['MonStyle'].iaConfig) {
            appState.subjects['MonStyle'].iaConfig = { ...DEFAULT_IA_CONFIG };
        }

        const styleData = appState.subjects['MonStyle'];

        styleData.iaConfig.length = parseInt(DOM.iaLengthSlider.value, 10);
        styleData.iaConfig.tone = parseInt(DOM.iaToneSlider.value, 10);

        // [FIX] Preserve existing styleInstructions if DOM field is empty but state has value
        // This prevents data loss when field wasn't properly populated due to loading issues
        const domValue = DOM.iaStyleInstructions.value;
        const existingValue = styleData.iaConfig.styleInstructions || '';
        if (domValue || !existingValue) {
            // Only update if user typed something OR if there was no existing value
            styleData.iaConfig.styleInstructions = domValue;
        }
        // else: keep the existing value to prevent accidental data loss
        const selectedVoice = document.querySelector('input[name="iaVoiceRadio"]:checked');
        if (selectedVoice) styleData.iaConfig.voice = selectedVoice.value;

        if (DOM.iaStyleInstructionsToggle) {
            styleData.iaConfig.enableStyleInstructions = DOM.iaStyleInstructionsToggle.checked;
        }
    },

    /**
     * Sauvegarde tous les paramètres de l'application.
     */
    saveSettings(showNotification = true) {
        this._savePersonalStyleChanges();

        if (DOM.openaiApiKey) appState.openaiApiKey = DOM.openaiApiKey.value.trim();
        if (DOM.googleApiKey) appState.googleApiKey = DOM.googleApiKey.value.trim();
        if (DOM.openrouterApiKey) appState.openrouterApiKey = DOM.openrouterApiKey.value.trim();
        if (DOM.anthropicApiKey) appState.anthropicApiKey = DOM.anthropicApiKey.value.trim();
        if (DOM.mistralApiKey) appState.mistralApiKey = DOM.mistralApiKey.value.trim();
        if (DOM.aiModelSelect) appState.currentAIModel = DOM.aiModelSelect.value;
        // Ollama
        if (DOM.ollamaEnabledToggle) appState.ollamaEnabled = DOM.ollamaEnabledToggle.checked;
        if (DOM.ollamaBaseUrl) appState.ollamaBaseUrl = DOM.ollamaBaseUrl.value.trim();

        // Confidentialité
        if (DOM.settingsPrivacyAnonymizeToggle) {
            appState.anonymizeData = DOM.settingsPrivacyAnonymizeToggle.checked;
        }

        const journalThresholdInput = document.getElementById('journalThresholdInput');
        if (journalThresholdInput) {
            appState.journalThreshold = parseInt(journalThresholdInput.value, 10) || 2;
        }

        // Dispatch event for responsive updates (e.g., FocusPanel badge)
        document.dispatchEvent(new CustomEvent('app-settings-changed', {
            detail: { settings: appState }
        }));

        appState.evolutionThresholds.positive = parseFloat(DOM.settingsEvolutionThresholdPositive.value);
        appState.evolutionThresholds.veryPositive = appState.evolutionThresholds.positive * 4;
        appState.evolutionThresholds.negative = parseFloat(DOM.settingsEvolutionThresholdNegative.value);
        appState.evolutionThresholds.veryNegative = appState.evolutionThresholds.negative * 4;

        StorageManager.saveAppState();

        // Fermer la modale d'abord pour une animation fluide
        UI.closeModal(DOM.settingsModal);

        // Effectuer les mises à jour UI après l'animation de fermeture (260ms)
        setTimeout(() => {
            this.updateApiStatusDisplay();
            if (showNotification !== false) {
                UI.showNotification('Paramètres enregistrés.', 'success');
            }
            AppreciationsManager.renderResults();
        }, 260);
    },

    /**
     * Crée un point de sauvegarde des paramètres actuels.
     * Utilisé avant l'ouverture des modales d'édition pour permettre l'annulation.
     */
    createSnapshot() {
        UIState.settingsBeforeEdit = {
            useSubjectPersonalization: appState.useSubjectPersonalization,
            subjects: JSON.parse(JSON.stringify(appState.subjects))
        };
    },

    /**
     * Restaure les paramètres depuis le dernier point de sauvegarde.
     * @returns {boolean} true si une restauration a été effectuée
     */
    restoreSnapshot() {
        if (Object.keys(UIState.settingsBeforeEdit).length > 0) {
            appState.useSubjectPersonalization = UIState.settingsBeforeEdit.useSubjectPersonalization;
            appState.subjects = UIState.settingsBeforeEdit.subjects;

            // Persister immédiatement la restauration pour annuler les sauvegardes auto
            StorageManager.saveAppState();

            // Nettoyer le snapshot après restauration
            UIState.settingsBeforeEdit = {};
            return true;
        }
        return false;
    },

    /**
     * Annule les modifications des paramètres.
     */
    cancelSettings() {
        // Fermer la modale d'abord pour une animation fluide
        UI.closeModal(DOM.settingsModal);

        // Restaurer l'état après l'animation de fermeture (250ms)
        setTimeout(() => {
            const restored = this.restoreSnapshot();

            if (restored) {
                this.updatePersonalizationState();
                UI.updateSettingsFields();
            }
        }, 260);
    },

    /**
     * Réinitialise le style personnalisé aux valeurs par défaut.
     */
    resetPersonalStyle() {
        UI.showCustomConfirm("Réinitialiser votre style personnalisé ?", () => {
            appState.subjects['MonStyle'] = { iaConfig: JSON.parse(JSON.stringify(DEFAULT_IA_CONFIG)) };
            UI.updateSettingsPromptFields();
            UI.showNotification("Style réinitialisé.", "success");
        }, null, { compact: true });
    },

    /**
     * Met à jour l'état de personnalisation.
     */
    updatePersonalizationState() {
        // Renamed from useSubjectPersonalization to be generic
        const enabled = appState.useSubjectPersonalization;
        if (DOM.personalizationToggle) {
            DOM.personalizationToggle.checked = enabled;
        }

        // Get current config for specific toggle
        const styleData = appState.subjects['MonStyle']?.iaConfig || DEFAULT_IA_CONFIG;
        const styleInstructionsEnabled = styleData.enableStyleInstructions !== false; // Default true

        if (DOM.iaStyleInstructionsToggle) {
            DOM.iaStyleInstructionsToggle.checked = styleInstructionsEnabled;
            DOM.iaStyleInstructionsToggle.disabled = !enabled;
        }

        // Toggle visibility of the info message
        if (DOM.genericSubjectInfo) {
            // Use CSS class for smooth transition instead of display: none
            if (enabled) {
                DOM.genericSubjectInfo.classList.add('collapsed');
            } else {
                DOM.genericSubjectInfo.classList.remove('collapsed');
            }
        }

        // Disable/Enable inputs
        const inputsToToggle = [
            DOM.iaLengthSlider,
            DOM.iaToneSlider,
            // DOM.iaStyleInstructions, // Handled separately below
            ...document.querySelectorAll('input[name="iaVoiceRadio"]')
        ];

        inputsToToggle.forEach(input => {
            if (input) input.disabled = !enabled;
        });

        // Specific logic for Style Instructions: Disabled if global OFF OR specific OFF
        if (DOM.iaStyleInstructions) {
            DOM.iaStyleInstructions.disabled = !enabled || !styleInstructionsEnabled;
            // Visual feedback
            if (DOM.iaStyleInstructions.disabled) {
                DOM.iaStyleInstructions.classList.add('disabled-look');
                DOM.iaStyleInstructions.parentElement.classList.add('opacity-reduced');
            } else {
                DOM.iaStyleInstructions.classList.remove('disabled-look');
                DOM.iaStyleInstructions.parentElement.classList.remove('opacity-reduced');
            }
        }

        // Add visual class to disabled container
        const controlsPanel = document.getElementById('settings-controls-panel');
        if (controlsPanel) {
            if (!enabled) controlsPanel.classList.add('disabled');
            else controlsPanel.classList.remove('disabled');
        }

        // Keep header simple - no lock icon needed as the toggle is right there
        const iaStyleHeader = document.getElementById('iaStyleHeader');
        if (iaStyleHeader) {
            iaStyleHeader.innerHTML = `<i class="fas fa-sliders-h"></i> Style de Rédaction`;
        }
    },

    /**
     * Met à jour l'affichage du récapitulatif des APIs configurées.
     * Utilise les pills visuels et le bandeau intelligent pour les alertes.
     */
    updateApiStatusDisplay() {
        const model = appState.currentAIModel || '';

        // Déterminer le provider du modèle actif
        // IMPORTANT: Les modèles -free passent par OpenRouter, même gemini-*-free !
        let activeProvider = 'openrouter';
        if (model.endsWith('-free')) {
            activeProvider = 'openrouter'; // Priorité aux modèles gratuits OpenRouter
        } else if (model.startsWith('gemini')) {
            activeProvider = 'google';
        } else if (model.startsWith('openai')) {
            activeProvider = 'openai';
        } else if (model.startsWith('ollama')) {
            activeProvider = 'ollama';
        } else if (model.startsWith('anthropic')) {
            activeProvider = 'anthropic';
        } else if (model.startsWith('mistral-direct')) {
            activeProvider = 'mistral';
        }

        // Check values from DOM if available (live typing) or fall back to state
        const providers = [
            { id: 'google', key: DOM.googleApiKey ? DOM.googleApiKey.value.trim() : appState.googleApiKey },
            { id: 'openai', key: DOM.openaiApiKey ? DOM.openaiApiKey.value.trim() : appState.openaiApiKey },
            { id: 'openrouter', key: DOM.openrouterApiKey ? DOM.openrouterApiKey.value.trim() : appState.openrouterApiKey },
            { id: 'anthropic', key: DOM.anthropicApiKey ? DOM.anthropicApiKey.value.trim() : appState.anthropicApiKey },
            { id: 'mistral', key: DOM.mistralApiKey ? DOM.mistralApiKey.value.trim() : appState.mistralApiKey },
        ];

        let activeProviderIssue = null; // Pour le bandeau intelligent

        providers.forEach(({ id, key }) => {
            const el = document.getElementById(`${id}ApiStatus`);
            if (!el) return;

            const hasKey = !!key && key.length > 5;
            const status = appState.apiKeyStatus?.[id] || 'not-configured';

            // Reset all state classes (now using pill classes)
            el.classList.remove('active', 'inactive', 'warning', 'invalid', 'pending');

            // Déterminer le texte du tooltip
            let tooltipText = '';

            if (!hasKey) {
                el.classList.add('inactive');
                tooltipText = 'Non configurée';
            } else if (status === 'valid') {
                el.classList.add('active');
                tooltipText = '✓ Clé valide et fonctionnelle';
            } else if (status === 'quota-warning') {
                el.classList.add('warning');
                tooltipText = '✓ Clé valide • ⏳ Quota temporairement atteint';
                // Si c'est le provider actif, on note le problème
                if (id === activeProvider) {
                    activeProviderIssue = {
                        type: 'quota',
                        message: 'Clé valide, mais quota temporairement atteint. Patientez quelques minutes ou changez de modèle.'
                    };
                }
            } else if (status === 'invalid') {
                el.classList.add('invalid');
                tooltipText = '✗ Clé invalide';
                // Si c'est le provider actif, c'est un problème critique
                if (id === activeProvider) {
                    activeProviderIssue = {
                        type: 'invalid',
                        message: 'Clé API invalide. Veuillez la vérifier dans la configuration.'
                    };
                }
            } else {
                // Clé présente mais non testée
                el.classList.add('pending');
                tooltipText = '⏳ Non vérifiée<br><span class="kbd-hint">Tester</span>';
            }

            // Appliquer le tooltip
            el.setAttribute('data-tooltip', tooltipText);
            el.setAttribute('title', tooltipText);
        });

        // Gérer le cas Ollama séparément - mettre à jour le pill
        const ollamaStatus = appState.apiKeyStatus?.ollama;
        const ollamaValidated = appState.validatedApiKeys?.ollama;
        const ollamaEnabled = appState.ollamaEnabled;

        const ollamaPill = document.getElementById('ollamaApiStatus');
        if (ollamaPill) {
            ollamaPill.classList.remove('active', 'inactive', 'warning', 'invalid', 'pending');

            let ollamaTooltip = '';
            if (ollamaStatus === 'valid' || ollamaValidated) {
                ollamaPill.classList.add('active');
                ollamaTooltip = '✓ Ollama connecté';
            } else if (ollamaEnabled) {
                ollamaPill.classList.add('pending');
                ollamaTooltip = '⏳ Activé mais non vérifié';
            } else {
                ollamaPill.classList.add('inactive');
                ollamaTooltip = 'Non activé';
            }

            ollamaPill.setAttribute('data-tooltip', ollamaTooltip);
            ollamaPill.setAttribute('title', ollamaTooltip);

            // Si Ollama est valide et qu'on a des modèles en mémoire, mettre à jour l'intérieur de l'accordéon aussi
            if (ollamaStatus === 'valid' || ollamaValidated) {
                this.updateOllamaStatus('valid', appState.ollamaInstalledModels || []);
            }
        }

        // Si Ollama est le provider actif et n'est pas validé/activé
        if (activeProvider === 'ollama' && ollamaStatus !== 'valid' && !ollamaValidated && !ollamaEnabled) {
            activeProviderIssue = {
                type: 'not-configured',
                message: 'Ollama n\'est pas connecté. Activez-le et vérifiez qu\'il est lancé.'
            };
        }

        // Gestion du cas "clé manquante pour le modèle actif"
        if (activeProvider !== 'ollama') {
            const activeKey = providers.find(p => p.id === activeProvider)?.key;
            if (!activeKey || activeKey.length <= 5) {
                activeProviderIssue = {
                    type: 'missing',
                    message: `Ce modèle requiert une clé ${this._getProviderName(activeProvider)}.`
                };
            }
        }

        // === BANDEAU INTELLIGENT ===
        const warningBanner = document.getElementById('missingApiKeyWarning');
        const warningText = document.getElementById('missingKeyText');

        if (warningBanner && warningText) {
            if (activeProviderIssue) {
                // Afficher le bandeau avec le message approprié
                warningText.textContent = activeProviderIssue.message;
                warningBanner.style.display = 'flex';

                // Adapter le style selon le type de problème
                warningBanner.classList.remove('banner-warning', 'banner-error');
                if (activeProviderIssue.type === 'quota') {
                    warningBanner.classList.add('banner-warning');
                } else {
                    warningBanner.classList.add('banner-error');
                }
            } else {
                // Tout va bien pour le modèle actif : on masque le bandeau
                warningBanner.style.display = 'none';
                warningText.textContent = ''; // Clean text
            }
        }

        // Synchroniser le toggle de fallback avec l'état
        if (DOM.enableApiFallbackToggle) {
            DOM.enableApiFallbackToggle.checked = appState.enableApiFallback;
        }

        // Mettre à jour l'indicateur dans le header principal
        this.updateHeaderAiModelDisplay();

        // Mettre à jour la disponibilité des options dans le menu déroulant
        this.updateModelSelectorAvailability();
    },

    /**
     * Met à jour l'état (activé/désactivé) des options du sélecteur de modèle
     * en fonction des clés API et installations disponibles.
     * Les modèles disponibles affichent ✅, les indisponibles sont grisés.
     */
    updateModelSelectorAvailability() {
        const select = DOM.aiModelSelect;
        if (!select) return;

        const options = select.querySelectorAll('option');
        options.forEach(opt => {
            const model = opt.value;
            let isAvailable = false;
            let requiredProvider = '';

            if (model.endsWith('-free')) {
                // Modèles gratuits OpenRouter (ex: gemini-2.0-flash-exp-free, llama-3.3-70b-free)
                isAvailable = !!appState.openrouterApiKey && appState.openrouterApiKey.length > 5;
                requiredProvider = 'OpenRouter';
            } else if (model.startsWith('gemini')) {
                isAvailable = !!appState.googleApiKey && appState.googleApiKey.length > 5;
                requiredProvider = 'Google Gemini';
            } else if (model.startsWith('openai')) {
                isAvailable = !!appState.openaiApiKey && appState.openaiApiKey.length > 5;
                requiredProvider = 'OpenAI';
            } else if (model.startsWith('ollama')) {
                requiredProvider = 'Ollama';
                if (!appState.ollamaEnabled) {
                    isAvailable = false;
                } else {
                    // Si on a la liste des modèles installés, on vérifie
                    const installed = appState.ollamaInstalledModels || [];
                    if (installed.length > 0) {
                        const modelName = model.replace('ollama-', '');
                        // Vérification flexible pour gérer les variations de nommage Ollama
                        // Ex: "qwen3:4b" doit matcher "qwen3:4b", "qwen3:4b-q4_0", etc.
                        isAvailable = installed.some(installedModel => {
                            // Match exact
                            if (installedModel === modelName) return true;
                            // Le modèle installé commence par le nom recherché (ex: qwen3:4b vs qwen3:4b-q4_0)
                            if (installedModel.startsWith(modelName)) return true;
                            // Le nom recherché correspond au préfixe du modèle installé (sans le tag secondaire)
                            // Ex: "qwen3:4b" match "qwen3:4b" dans "qwen3:4b-something"
                            const [baseName, tag] = modelName.split(':');
                            const [installedBase, installedTag] = installedModel.split(':');
                            if (baseName === installedBase && installedTag && installedTag.startsWith(tag || '')) return true;
                            return false;
                        });
                    } else {
                        // Si liste non chargée mais Ollama activé, on suppose dispo (bénéfice du doute)
                        isAvailable = true;
                    }
                }
            } else if (model.startsWith('anthropic')) {
                // Claude (Anthropic) - nécessite clé API directe
                isAvailable = !!appState.anthropicApiKey && appState.anthropicApiKey.length > 5;
                requiredProvider = 'Claude (Anthropic)';
            } else if (model.startsWith('mistral-direct')) {
                // Mistral API directe - nécessite clé Mistral
                isAvailable = !!appState.mistralApiKey && appState.mistralApiKey.length > 5;
                requiredProvider = 'Mistral';
            } else {
                // OpenRouter / DeepSeek
                isAvailable = !!appState.openrouterApiKey && appState.openrouterApiKey.length > 5;
                requiredProvider = 'OpenRouter';
            }

            // Appliquer l'état disabled - les options désactivées seront naturellement grisées par le navigateur
            opt.disabled = !isAvailable;

            // Ajouter une raison pour le tooltip des options désactivées
            if (!isAvailable) {
                if (model.startsWith('ollama')) {
                    if (!appState.ollamaEnabled) {
                        opt.dataset.disabledReason = 'Activez Ollama dans les paramètres';
                    } else {
                        opt.dataset.disabledReason = 'Modèle non installé sur Ollama';
                    }
                } else {
                    opt.dataset.disabledReason = `Clé ${requiredProvider} requise`;
                }
            } else {
                delete opt.dataset.disabledReason;
            }

            // Clean up any existing visual indicators from model names
            let text = opt.textContent;
            text = text.replace(' 🔒', '').replace(' ✅', '');
            opt.textContent = text;
            // Note: Availability is shown via disabled state (grayed out)
            // Selected state uses the fa-check icon from DropdownManager
        });

        // Rafraîchir le dropdown custom pour appliquer les changements visuels
        if (select.id) {
            DropdownManager.refresh(select.id);
        }
    },

    /**
     * Retourne le nom lisible d'un provider
     * @private
     */
    _getProviderName(providerId) {
        const names = {
            'google': 'Google Gemini',
            'openai': 'OpenAI',
            'openrouter': 'OpenRouter',
            'anthropic': 'Claude (Anthropic)',
            'mistral': 'Mistral AI',
            'ollama': 'Ollama'
        };
        return names[providerId] || providerId;
    },

    /**
     * Teste toutes les connexions API configurées.
     * Appelé par le bouton "Tester tout"
     */
    async testAllConnections() {
        const { ApiValidationManager } = await import('./ApiValidationManager.js');

        const providers = [
            { id: 'google', key: appState.googleApiKey, inputEl: DOM.googleApiKey, errorEl: DOM.googleApiKeyError, btnEl: DOM.validateGoogleApiKeyBtn },
            { id: 'openrouter', key: appState.openrouterApiKey, inputEl: DOM.openrouterApiKey, errorEl: DOM.openrouterApiKeyError, btnEl: DOM.validateOpenrouterApiKeyBtn },
            { id: 'openai', key: appState.openaiApiKey, inputEl: DOM.openaiApiKey, errorEl: DOM.openaiApiKeyError, btnEl: DOM.validateOpenaiApiKeyBtn },
        ];

        // Filtrer seulement les clés configurées
        const configuredProviders = providers.filter(p => p.key && p.key.length > 5);

        if (configuredProviders.length === 0) {
            UI.showNotification("Aucune clé API configurée à tester.", "warning");
            return;
        }

        UI.showNotification(`Test de ${configuredProviders.length} connexion(s)...`, "info");

        for (const provider of configuredProviders) {
            // Valider chaque clé séquentiellement
            await ApiValidationManager.validateApiKeyUI(
                provider.id,
                provider.inputEl,
                provider.errorEl,
                provider.btnEl
            );
            // Petit délai entre chaque test pour éviter le rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        UI.showNotification("Test des connexions terminé.", "success");
    },

    /**
     * Affiche un indicateur visuel pour inviter à rafraîchir l'aperçu du Laboratoire.
     * Ajoute une animation pulsing sur le bouton Rafraîchir et affiche un message.
     */
    showPreviewRefreshHint() {
        const previewStatus = document.getElementById('previewStatus');
        const refreshBtn = document.getElementById('refreshPreviewBtn');

        if (previewStatus) {
            previewStatus.innerHTML = `<i class="fas fa-sync-alt" style="margin-right: 6px;"></i> Réglages modifiés. Cliquez sur <strong>Générer</strong> pour voir l'aperçu.`;
            previewStatus.style.display = 'block';
        }

        if (refreshBtn) {
            refreshBtn.classList.add('pulsing');
        }
    },

    /**
     * Masque l'indicateur de rafraîchissement de l'aperçu du Laboratoire.
     */
    hidePreviewRefreshHint() {
        const previewStatus = document.getElementById('previewStatus');
        const refreshBtn = document.getElementById('refreshPreviewBtn');

        if (previewStatus) {
            previewStatus.style.display = 'none';
        }

        if (refreshBtn) {
            refreshBtn.classList.remove('pulsing');
        }
    },

    /**
     * Met à jour l'affichage du modèle IA dans le header principal.
     * Affiche un nom court du modèle et le coût de session si > 0.
     */
    updateHeaderAiModelDisplay() {
        const model = appState.currentAIModel;

        if (DOM.headerAiModelName) {
            // 1. Affiche le nom court depuis la config centralisée
            DOM.headerAiModelName.textContent = MODEL_SHORT_NAMES[model] || model.split('-')[0] || model;

            // 2. Met à jour le tooltip avec le nom COMPLET et l'ID technique
            if (DOM.headerAiChip) {
                // Simplification : on n'affiche que l'ID technique car le nom est déjà sur le bouton
                // Utilisation de HTML pour le style (supporté par Tippy.js via allowHTML: true)
                const tooltipContent = `Modèle ID : <span style="font-family: monospace;">${model}</span><br><span class="kbd-hint">Changer de modèle</span>`;
                DOM.headerAiChip.setAttribute('data-tooltip', tooltipContent);

                // Re-init tooltip content if needed
                if (DOM.headerAiChip._tippy) {
                    DOM.headerAiChip._tippy.setContent(tooltipContent);
                }
            }
        }

        // Mettre à jour l'ordre de secours dynamique
        this.updateFallbackOrderHint();
    },

    /**
     * Met à jour dynamiquement l'affichage de l'ordre de secours basé sur le modèle actuel.
     * N'affiche que les modèles réellement disponibles (clé API configurée ou modèle Ollama installé).
     * Affiche 2 éléments + "+X" avec tooltip complet.
     */
    updateFallbackOrderHint() {
        const fallbackOrderText = document.getElementById('fallbackOrderText');
        if (!fallbackOrderText) return;

        const model = appState.currentAIModel;

        // Déterminer le provider du modèle actuel
        let currentProvider = 'openrouter';
        if (model.startsWith('gemini')) currentProvider = 'google';
        else if (model.startsWith('openai')) currentProvider = 'openai';

        // Construire la liste complète de fallback en commençant par le modèle actuel
        const rawQueue = [model];

        // Ajouter les autres modèles du même provider
        const sameProviderModels = FALLBACK_CONFIG[currentProvider] || [];
        sameProviderModels.forEach(m => {
            if (m !== model && !rawQueue.includes(m)) rawQueue.push(m);
        });

        // Ajouter les modèles des providers suivants
        FALLBACK_CONFIG.providerOrder.forEach(provider => {
            if (provider !== currentProvider) {
                const providerModels = FALLBACK_CONFIG[provider] || [];
                providerModels.forEach(m => {
                    if (!rawQueue.includes(m)) rawQueue.push(m);
                });
            }
        });

        // === NOUVEAU : Filtrer pour ne garder que les modèles DISPONIBLES ===
        const queue = rawQueue.filter(m => this._isModelAvailable(m));

        // Affichage court : 2 premiers, badge séparé pour les autres
        // Affichage court : 2 premiers, badge séparé pour les autres
        const displayQueue = queue.slice(0, 2).map((m, index) => {
            const name = MODEL_SHORT_NAMES[m] || m;
            // Premier modèle en gras (primary), les suivants en normal/gris
            if (index === 0) return `<span style="font-weight:600; color:var(--text-primary)">${name}</span>`;
            return `<span style="opacity:0.8">${name}</span>`;
        });

        fallbackOrderText.innerHTML = displayQueue.join(' <i class="fas fa-chevron-right" style="opacity:0.4; font-size:0.8em; margin:0 4px;"></i> ');

        // Badge "+X" avec tooltip pour voir le reste
        const moreBadge = document.getElementById('fallbackOrderMore');
        const remaining = queue.length - 2;

        if (moreBadge) {
            if (remaining > 0) {
                const fullOrder = queue.map(m => MODEL_SHORT_NAMES[m] || m).join(' → ');
                moreBadge.textContent = `+${remaining}`;
                moreBadge.setAttribute('data-tooltip', `Ordre complet : ${fullOrder}`);
                moreBadge.style.display = 'inline-flex';
                // Réinitialiser Tippy.js pour reconnaître le nouveau tooltip
                UI.initTooltips();
            } else {
                moreBadge.style.display = 'none';
            }
        }
    },

    /**
     * Vérifie si un modèle est disponible (clé API configurée ou modèle Ollama installé).
     * @param {string} model - Identifiant du modèle
     * @returns {boolean} true si le modèle est utilisable
     * @private
     */
    _isModelAvailable(model) {
        // Les modèles gratuits OpenRouter (suffixe -free) utilisent la clé OpenRouter
        if (model.endsWith('-free')) {
            return !!appState.openrouterApiKey && appState.openrouterApiKey.length > 5;
        } else if (model.startsWith('gemini')) {
            return !!appState.googleApiKey && appState.googleApiKey.length > 5;
        } else if (model.startsWith('openai')) {
            return !!appState.openaiApiKey && appState.openaiApiKey.length > 5;
        } else if (model.startsWith('ollama')) {
            if (!appState.ollamaEnabled) return false;
            const installed = appState.ollamaInstalledModels || [];
            if (installed.length === 0) return false; // Ollama activé mais aucun modèle détecté
            const modelName = model.replace('ollama-', '');
            return installed.some(installedModel => {
                if (installedModel === modelName) return true;
                if (installedModel.startsWith(modelName)) return true;
                const [baseName, tag] = modelName.split(':');
                const [installedBase, installedTag] = installedModel.split(':');
                if (baseName === installedBase && installedTag && installedTag.startsWith(tag || '')) return true;
                return false;
            });
        } else {
            // OpenRouter (DeepSeek, Mistral, Qwen, etc.)
            return !!appState.openrouterApiKey && appState.openrouterApiKey.length > 5;
        }
    },

    /**
     * Valide la connexion à Ollama et met à jour l'UI.
     * @returns {Promise<boolean>} true si Ollama est disponible
     */
    async validateOllamaConnection() {
        const { AIService } = await import('../services/AIService.js');

        // Afficher le spinner
        if (DOM.validateOllamaBtn) {
            DOM.validateOllamaBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            DOM.validateOllamaBtn.disabled = true;
        }
        if (DOM.ollamaValidationIcon) {
            DOM.ollamaValidationIcon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        try {
            // Mettre à jour l'URL depuis le champ
            if (DOM.ollamaBaseUrl) {
                appState.ollamaBaseUrl = DOM.ollamaBaseUrl.value.trim();
            }

            const isAvailable = await AIService.checkOllamaAvailability();

            if (isAvailable) {
                const models = await AIService.getOllamaModels();
                // Stocker les modèles installés pour le fallback
                appState.ollamaInstalledModels = models;
                this.updateOllamaStatus('valid', models);
                appState.ollamaEnabled = true;
                appState.validatedApiKeys.ollama = true;
                if (DOM.ollamaEnabledToggle) {
                    DOM.ollamaEnabledToggle.checked = true;
                }

                // Bouton reste en état validé
                if (DOM.validateOllamaBtn) {
                    DOM.validateOllamaBtn.classList.add('btn-validated');
                    DOM.validateOllamaBtn.innerHTML = '<i class="fas fa-check"></i> OK';
                    DOM.validateOllamaBtn.disabled = false;
                }

                // Sauvegarder immédiatement l'état
                StorageManager.saveAppState();

                UI.showNotification(`Ollama connecté ! ${models.length} modèle(s) disponible(s).`, 'success');
                return true;
            } else {
                this.updateOllamaStatus('error');
                if (DOM.ollamaError) {
                    DOM.ollamaError.textContent = 'Ollama n\'est pas en cours d\'exécution. Lancez "ollama serve" dans un terminal.';
                    DOM.ollamaError.style.display = 'block';
                }
                // Restaurer le bouton en cas d'échec
                if (DOM.validateOllamaBtn) {
                    DOM.validateOllamaBtn.classList.remove('btn-validated');
                    DOM.validateOllamaBtn.innerHTML = 'Vérifier';
                    DOM.validateOllamaBtn.disabled = false;
                }
                UI.showNotification('Ollama non détecté. Vérifiez qu\'il est lancé.', 'error');
                return false;
            }
        } catch (e) {
            console.error('[Ollama] Erreur de validation:', e);
            this.updateOllamaStatus('error');
            if (DOM.ollamaError) {
                DOM.ollamaError.textContent = `Erreur : ${e.message}`;
                DOM.ollamaError.style.display = 'block';
            }
            // Restaurer le bouton en cas d'erreur
            if (DOM.validateOllamaBtn) {
                DOM.validateOllamaBtn.classList.remove('btn-validated');
                DOM.validateOllamaBtn.innerHTML = 'Vérifier';
                DOM.validateOllamaBtn.disabled = false;
            }
            return false;
        }
    },

    /**
     * Met à jour le statut Ollama dans l'UI.
     * @param {'valid'|'error'|'not-configured'} status - Statut à afficher
     * @param {string[]} [models] - Liste des modèles installés (optionnel)
     */
    updateOllamaStatus(status, models = []) {
        const statusCard = DOM.ollamaApiStatus;
        const validationIcon = DOM.ollamaValidationIcon;
        const modelsInfo = DOM.ollamaModelsInfo;
        const modelsText = DOM.ollamaModelsText;
        const errorEl = DOM.ollamaError;

        // Réinitialiser
        if (errorEl) errorEl.style.display = 'none';
        if (modelsInfo) modelsInfo.style.display = 'none';

        // Mettre à jour l'icône de validation
        if (validationIcon) {
            if (status === 'valid') {
                // Pour Ollama, on n'affiche pas l'icône dans l'input car on a déjà le bouton OK et les badges
                validationIcon.innerHTML = '';
            } else if (status === 'error') {
                validationIcon.innerHTML = '<i class="fas fa-times-circle" style="color: var(--error-color);"></i>';
            } else {
                validationIcon.innerHTML = '';
            }
        }

        // Mettre à jour la carte de statut
        if (statusCard) {
            statusCard.classList.remove('active', 'inactive', 'error', 'valid');
            const badge = statusCard.querySelector('.api-status-badge');

            if (status === 'valid') {
                statusCard.classList.add('active', 'valid');
                if (badge) badge.textContent = `${models.length} modèle${models.length > 1 ? 's' : ''}`;
            } else if (status === 'error') {
                statusCard.classList.add('inactive', 'error');
                if (badge) badge.textContent = 'Non connecté';
            } else {
                statusCard.classList.add('inactive');
                if (badge) badge.textContent = 'Non configuré';
            }
        }

        // Afficher les modèles installés avec détail des modèles supportés
        if (status === 'valid' && modelsInfo && modelsText) {
            modelsInfo.style.display = 'block';

            // Masquer l'icône statique (fa-check-circle) car redondante avec les badges
            const staticIcon = modelsInfo.querySelector('i');
            if (staticIcon) staticIcon.style.display = 'none';

            // Liste des modèles supportés officiellement par l'app
            const supportedModels = FALLBACK_CONFIG.ollama || [];

            let html = '<div class="ollama-models-list" style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">';

            // Pour chaque modèle supporté, afficher son statut
            supportedModels.forEach(modelKey => {
                const modelName = modelKey.replace('ollama-', '');
                // Vérification flexible pour gérer les variations de nommage Ollama
                const isInstalled = models.some(installedModel => {
                    if (installedModel === modelName) return true;
                    if (installedModel.startsWith(modelName)) return true;
                    const [baseName, tag] = modelName.split(':');
                    const [installedBase, installedTag] = installedModel.split(':');
                    if (baseName === installedBase && installedTag && installedTag.startsWith(tag || '')) return true;
                    return false;
                });
                const shortName = MODEL_SHORT_NAMES[modelKey]?.replace('🏠 ', '') || modelName;

                const color = isInstalled ? 'var(--success-color)' : 'var(--text-tertiary)';
                const icon = isInstalled ? 'check' : 'times';
                const opacity = isInstalled ? '1' : '0.6';
                const decoration = isInstalled ? 'none' : 'line-through';

                html += `
                    <span class="model-badge" style="
                        display:inline-flex; align-items:center; gap:4px; 
                        padding:2px 8px; border-radius:12px; 
                        background:rgba(var(--background-rgb), 0.5); 
                        border:1px solid ${color}; color:${isInstalled ? 'var(--text-primary)' : 'var(--text-secondary)'};
                        font-size:0.85em; opacity:${opacity};">
                        <i class="fas fa-${icon}" style="color:${color}; font-size:0.9em;"></i>
                        ${shortName}
                    </span>
                `;
            });

            html += '</div>';

            // Ajouter la liste des autres modèles installés (non supportés officiellement)
            const otherModels = models.filter(m => {
                // Vérifier si ce modèle correspond à l'un des modèles supportés
                return !supportedModels.some(supported => {
                    const sName = supported.replace('ollama-', '');
                    return m === sName || m.startsWith(sName.split(':')[0]);
                });
            });

            if (otherModels.length > 0) {
                html += `<div style="margin-top:6px; font-size:0.8em; color:var(--text-secondary);">
                    + ${otherModels.length} autre(s) modèle(s) installé(s): ${otherModels.slice(0, 3).join(', ')}${otherModels.length > 3 ? '...' : ''}
                </div>`;
            }

            modelsText.innerHTML = html;
        }

        // Mettre à jour le statut dans appState
        appState.apiKeyStatus = appState.apiKeyStatus || {};
        appState.apiKeyStatus.ollama = status;
    }
};
