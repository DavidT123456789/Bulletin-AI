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
     * Sauvegarde les modifications des paramètres de la matière courante.
     * @private
     */
    _saveCurrentSettingsSubjectChanges() {
        const currentSubject = appState.currentSettingsSubject;
        const subjectData = appState.subjects[currentSubject];
        if (!subjectData) return;

        subjectData.iaConfig.length = parseInt(DOM.iaLengthSlider.value, 10);
        subjectData.iaConfig.tone = parseInt(DOM.iaToneSlider.value, 10);
        subjectData.iaConfig.styleInstructions = DOM.iaStyleInstructions.value;
        const selectedVoice = document.querySelector('input[name="iaVoiceRadio"]:checked');
        if (selectedVoice) subjectData.iaConfig.voice = selectedVoice.value;


    },

    /**
     * Sauvegarde tous les paramètres de l'application.
     */
    saveSettings() {
        this._saveCurrentSettingsSubjectChanges();

        if (DOM.openaiApiKey) appState.openaiApiKey = DOM.openaiApiKey.value.trim();
        if (DOM.googleApiKey) appState.googleApiKey = DOM.googleApiKey.value.trim();
        if (DOM.openrouterApiKey) appState.openrouterApiKey = DOM.openrouterApiKey.value.trim();
        if (DOM.aiModelSelect) appState.currentAIModel = DOM.aiModelSelect.value;
        // Ollama
        if (DOM.ollamaEnabledToggle) appState.ollamaEnabled = DOM.ollamaEnabledToggle.checked;
        if (DOM.ollamaBaseUrl) appState.ollamaBaseUrl = DOM.ollamaBaseUrl.value.trim();

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
            UI.showNotification('Paramètres enregistrés.', 'success');

            // Synchroniser la matière active avec celle des paramètres
            if (appState.useSubjectPersonalization) {
                appState.currentSubject = appState.currentSettingsSubject;
            }
            AppreciationsManager.renderResults();
        }, 260);
    },

    /**
     * Annule les modifications des paramètres.
     */
    cancelSettings() {
        // Fermer la modale d'abord pour une animation fluide
        UI.closeModal(DOM.settingsModal);

        // Restaurer l'état après l'animation de fermeture (250ms)
        // pour éviter les mises à jour DOM qui interfèrent avec l'animation
        setTimeout(() => {
            if (Object.keys(UIState.settingsBeforeEdit).length > 0) {
                appState.useSubjectPersonalization = UIState.settingsBeforeEdit.useSubjectPersonalization;
                appState.subjects = UIState.settingsBeforeEdit.subjects;
                appState.currentSettingsSubject = UIState.settingsBeforeEdit.currentSettingsSubject;
                appState.currentSubject = UIState.settingsBeforeEdit.currentSubject;
            }
            this.updatePersonalizationState();
            UI.updateSettingsFields();
        }, 260);
    },

    /**
     * Ajoute une nouvelle matière.
     */
    addSubject() {
        const name = DOM.newSubjectInput.value.trim();
        if (!name) return;
        if (appState.subjects[name]) {
            UI.showNotification('Cette matière existe déjà.', 'warning');
            return;
        }

        appState.subjects[name] = JSON.parse(JSON.stringify(DEFAULT_PROMPT_TEMPLATES['Français']));
        appState.subjects[name].iaConfig = JSON.parse(JSON.stringify(DEFAULT_IA_CONFIG));


        appState.currentSettingsSubject = name;
        DOM.newSubjectInput.value = '';

        this.renderSubjectManagementList();
        UI.updateSettingsPromptFields();
        UI.showNotification(`Matière "${name}" ajoutée.`, 'success');
    },

    /**
     * Supprime une matière.
     * @param {string} name - Nom de la matière à supprimer
     */
    deleteSubject(name) {
        if (Object.keys(appState.subjects).length <= 1) {
            UI.showNotification("Impossible de supprimer la dernière matière.", "error");
            return;
        }
        if (DEFAULT_PROMPT_TEMPLATES[name]) {
            UI.showNotification("Les matières par défaut ne peuvent pas être supprimées.", "warning");
            return;
        }

        UI.showCustomConfirm(`Supprimer définitivement la matière "${name}" ?`, () => {
            delete appState.subjects[name];
            const remaining = Object.keys(appState.subjects);
            appState.currentSettingsSubject = remaining[0];
            if (appState.currentSubject === name) appState.currentSubject = remaining[0];

            this.renderSubjectManagementList();
            UI.updateSettingsPromptFields();
            UI.showNotification(`Matière "${name}" supprimée.`, 'success');
        }, null, { compact: true });
    },

    /**
     * Met à jour la liste des matières dans les paramètres.
     */
    renderSubjectManagementList() {
        const list = DOM.subjectManagementList;
        if (!list) return;

        const subjects = Object.keys(appState.subjects).sort().filter(s => s !== 'Générique');
        DOM.settingsSubjectSelect.innerHTML = subjects.map(s =>
            `<option value="${s}" ${s === appState.currentSettingsSubject ? 'selected' : ''}>${s}</option>`
        ).join('');

        // Refresh the custom dropdown to reflect the new options
        DropdownManager.refresh('settingsSubjectSelect');

        // Clear the redundant list - subjects are managed via the dropdown + delete button in header controls
        list.innerHTML = '';
    },

    /**
     * Réinitialise les paramètres de la matière courante.
     */
    resetCurrentSubject() {
        UI.showCustomConfirm("Réinitialiser les réglages de CETTE matière par défaut ?", () => {
            const subject = appState.currentSettingsSubject;
            if (DEFAULT_PROMPT_TEMPLATES[subject]) {
                appState.subjects[subject] = JSON.parse(JSON.stringify(DEFAULT_PROMPT_TEMPLATES[subject]));
            } else {
                appState.subjects[subject].iaConfig = JSON.parse(JSON.stringify(DEFAULT_IA_CONFIG));
            }
            UI.updateSettingsPromptFields();
            UI.showNotification("Réglages de la matière réinitialisés.", "success");
        }, null, { compact: true });
    },

    /**
     * Met à jour l'état de personnalisation par matière.
     */
    updatePersonalizationState() {
        const enabled = appState.useSubjectPersonalization;
        DOM.personalizationToggle.checked = enabled;

        const subjectHeaderControls = document.querySelector('.subject-header-controls');
        if (subjectHeaderControls) {
            subjectHeaderControls.style.display = enabled ? 'flex' : 'none';
        }

        // Afficher le message d'info "Générique" uniquement si la personnalisation est désactivée
        if (DOM.genericSubjectInfo) {
            DOM.genericSubjectInfo.style.display = enabled ? 'none' : 'flex';
            if (!enabled) {
                DOM.genericSubjectInfo.innerHTML = `<i class="fas fa-info-circle"></i> Personnalisation désactivée : paramètres par défaut appliqués.`;
            }
        }

        UI.updateSettingsFields();
    },

    // Note: Les fonctions addVocabItem, saveVocabItemEdit et handleVocabItemKeydown
    // ont été supprimées avec la bibliothèque de mots-clés.

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
        }

        // Check values from DOM if available (live typing) or fall back to state
        const providers = [
            { id: 'google', key: DOM.googleApiKey ? DOM.googleApiKey.value.trim() : appState.googleApiKey },
            { id: 'openai', key: DOM.openaiApiKey ? DOM.openaiApiKey.value.trim() : appState.openaiApiKey },
            { id: 'openrouter', key: DOM.openrouterApiKey ? DOM.openrouterApiKey.value.trim() : appState.openrouterApiKey },
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
                tooltipText = '⏳ Non vérifiée (cliquez pour tester)';
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
            } else {
                // OpenRouter / Mistral / DeepSeek
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
        if (!DOM.headerAiModelName) return;

        // Mapping des noms courts pour le header
        const modelShortNames = {
            'gemini-2.5-flash': 'Gemini 2.5 Flash',
            'gemini-2.5-pro': 'Gemini 2.5 Pro',
            'gemini-2.0-flash': 'Gemini 2.0 Flash',
            'gemini-2.0-flash-lite': 'Gemini 2.0 Flash Lite',
            'openai-gpt-4o-mini': 'GPT-4o Mini',
            'openai-gpt-4o': 'GPT-4o',
            'openai-gpt-3.5-turbo': 'GPT-3.5',
            'mistral-small': 'Mistral Small',
            'mistral-large': 'Mistral Large',
            'deepseek-r1-free': 'DeepSeek R1',
            'openrouter': 'DeepSeek V3',
        };

        const model = appState.currentAIModel;
        DOM.headerAiModelName.textContent = modelShortNames[model] || model;

        // Mettre à jour le coût de session si visible
        if (DOM.headerSessionCost) {
            const cost = appState.sessionCost || 0;

            // Vérifier si le modèle actuel est gratuit
            const isFreeModel = model.endsWith('-free') ||
                model.startsWith('gemini') ||
                model.startsWith('ollama');

            // Ne pas afficher le coût si :
            // - Le coût est négligeable (< 0.001$)
            // - Le modèle actuel est gratuit (même si un coût antérieur existe)
            if (cost >= 0.001 && !isFreeModel) {
                DOM.headerSessionCost.textContent = `${cost.toFixed(3)}$`;
                DOM.headerSessionCost.style.display = 'inline-block';
                DOM.headerSessionCost.classList.add('has-cost');
            } else {
                DOM.headerSessionCost.style.display = 'none';
                DOM.headerSessionCost.classList.remove('has-cost');
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
        const displayQueue = queue.slice(0, 2).map(m => MODEL_SHORT_NAMES[m] || m);
        fallbackOrderText.textContent = displayQueue.join(' → ');

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
