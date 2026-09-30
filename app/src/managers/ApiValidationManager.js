/**
 * @fileoverview Gestionnaire de la validation des clés API
 * @module managers/ApiValidationManager
 * 
 * Responsabilités :
 * - Validation des clés API (Google, OpenAI, OpenRouter, Anthropic, Mistral)
 * - Auto-correction des modèles non trouvés
 */

import { appState } from '../state/State.js';
import { PROVIDER_DEFAULT_MODELS } from '../config/models.js';
import { DOM } from '../utils/DOM.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';
import { AIService } from '../services/AIService.js';
import { SettingsUIManager } from './SettingsUIManager.js';
import { DropdownManager } from './DropdownManager.js';

export const ApiValidationManager = {
    /**
     * Valide une clé API avec UI feedback
     * @param {string} provider - Le provider ('openai', 'google', 'openrouter')
     * @param {HTMLInputElement} inputEl - L'élément input contenant la clé
     * @param {HTMLElement} errorEl - L'élément pour afficher les erreurs
     * @param {HTMLButtonElement} btnEl - Le bouton de validation
     * @param {Function} [onSuccess] - Callback en cas de succès
     * @param {boolean} [isRetry=false] - Si c'est une tentative de retry après auto-correction
     */
    async validateApiKeyUI(provider, inputEl, errorEl, btnEl, onSuccess, isRetry = false) {
        const key = inputEl.value.trim();
        if (!key) {
            errorEl.textContent = "Veuillez entrer une clé.";
            errorEl.style.display = 'block';
            return;
        }

        const originalBtnContent = btnEl.innerHTML;
        UI.showInlineSpinner(btnEl);
        errorEl.style.display = 'none';

        // Mode démo : validation simulée
        if (appState.isDemoMode) {
            setTimeout(() => {
                UI.hideInlineSpinner(btnEl);
                btnEl.innerHTML = originalBtnContent;
                appState.apiKeyStatus[provider] = 'valid';
                appState.validatedApiKeys[provider] = true;
                SettingsUIManager.updateApiStatusDisplay();
                UI.showNotification("Clé validée (Mode Démo).", "success");
                if (onSuccess) onSuccess();
            }, 1000);
            return;
        }

        try {
            appState[`${provider}ApiKey`] = key;

            // Pour Google: validation en deux étapes
            if (provider === 'google') {
                // Étape 1: Vérifier que la clé est valide (endpoint /models ne consomme pas de quota)
                try {
                    await AIService.getAvailableModels('google');
                } catch (modelsError) {
                    // Si /models échoue, la clé est invalide
                    throw new Error(`Clé invalide : ${modelsError.message}`);
                }

                // Étape 2: Tester le quota avec generateContent
                try {
                    const modelOverride = appState.currentAIModel.startsWith('gemini') ? appState.currentAIModel : (PROVIDER_DEFAULT_MODELS.google || 'gemini-3.5-flash');
                    await AIService.callAI("Validation", { isValidation: true, validationProvider: provider, modelOverride });
                    // Succès complet
                    appState.apiKeyStatus[provider] = 'valid';
                } catch (quotaError) {
                    const msg = quotaError.message.toLowerCase();
                    if (msg.includes('429') || msg.includes('quota') || msg.includes('rate')) {
                        appState.apiKeyStatus[provider] = 'quota-warning';
                        appState.validatedApiKeys[provider] = true;

                        UI.hideInlineSpinner(btnEl);
                        btnEl.classList.remove('btn-needs-validation', 'btn-validated');
                        btnEl.innerHTML = 'Vérifier';
                        inputEl.classList.remove('input-error', 'input-warning', 'input-success');

                        errorEl.innerHTML = `<iconify-icon icon="solar:clock-circle-linear" style="vertical-align: -2px;"></iconify-icon> <span>Clé authentifiée — limite temporaire atteinte, patientez 1 à 2 min.</span>`;
                        errorEl.style.display = 'block';
                        errorEl.style.color = 'var(--warning-color)';

                        await StorageManager.saveAppState();
                        SettingsUIManager.updateApiStatusDisplay();
                        if (onSuccess) onSuccess();
                        return;
                    }
                    throw quotaError;
                }
            } else {
                // Pour OpenAI, OpenRouter, Anthropic, Mistral, Groq: validation centralisée via PROVIDER_DEFAULT_MODELS
                const testModels = {
                    ...PROVIDER_DEFAULT_MODELS,
                    openrouter: 'deepseek/deepseek-chat',
                    anthropic: 'anthropic-claude-3-7-sonnet-latest'
                };
                const modelOverride = testModels[provider] || PROVIDER_DEFAULT_MODELS[provider] || 'gemini-3.5-flash';
                await AIService.callAI("Validation", { isValidation: true, validationProvider: provider, modelOverride });

                appState.apiKeyStatus[provider] = 'valid';
            }

            // Marquer la clé comme validée
            appState.validatedApiKeys[provider] = true;
            if (appState.apiKeyErrorDetails) {
                delete appState.apiKeyErrorDetails[provider];
            }

            UI.hideInlineSpinner(btnEl);

            // Le badge d'en-tête ("Connecté") porte l'état ; le bouton reprend son rôle d'action neutre
            btnEl.classList.remove('btn-needs-validation', 'btn-validated');
            btnEl.innerHTML = 'Vérifier';
            inputEl.classList.remove('input-error', 'input-warning', 'input-success');

            if (provider === 'openrouter') {
                const credits = await AIService.getOpenRouterCredits();
                if (credits !== null) {
                    let creditsNum = 0;
                    if (typeof credits === 'number') {
                        creditsNum = credits;
                    } else if (credits && typeof credits === 'object') {
                        creditsNum = typeof credits.usage === 'number' ? credits.usage : (typeof credits.credits === 'number' ? credits.credits : 0);
                    } else if (credits && !isNaN(Number(credits))) {
                        creditsNum = Number(credits);
                    }
                    errorEl.innerHTML = `<iconify-icon icon="solar:wallet-money-linear" style="vertical-align: -2px;"></iconify-icon> <span>Solde disponible : <strong style="color:var(--text-primary);">${creditsNum.toFixed(3)}$</strong></span>`;
                    errorEl.style.display = 'block';
                    errorEl.style.color = 'var(--text-secondary)';
                } else {
                    errorEl.style.display = 'none';
                    errorEl.style.color = '';
                }
            } else {
                errorEl.style.display = 'none';
                errorEl.style.color = '';
            }

            await StorageManager.saveAppState();
            SettingsUIManager.updateApiStatusDisplay();
            UI.showNotification(`Clé ${provider} validée et sauvegardée !`, 'success');

            // ✅ Auto-sélection du modèle si le modèle actuel n'a pas de clé configurée
            // Évite la confusion UX où l'utilisateur valide Mistral mais le modèle reste sur Gemini
            if (!AIService._hasApiKeyForModel(appState.currentAIModel)) {
                const recommendedModel = PROVIDER_DEFAULT_MODELS[provider];
                if (recommendedModel) {
                    appState.currentAIModel = recommendedModel;
                    await StorageManager.saveAppState();

                    // Mettre à jour le select du modèle si présent
                    if (DOM.aiModelSelect) {
                        DOM.aiModelSelect.value = recommendedModel;
                        DropdownManager.refresh('aiModelSelect');
                    }
                    SettingsUIManager.updateHeaderAiModelDisplay();

                    UI.showNotification(`Modèle basculé vers ${recommendedModel}`, 'info');
                }
            }

            if (onSuccess) onSuccess();


        } catch (e) {
            // Auto-Healing for Google 404
            if (provider === 'google' && e.message.includes('404') && (e.message.includes('models/') || e.message.includes('not found'))) {
                try {
                    const models = await AIService.getAvailableModels('google');
                    const modelIds = models.map(m => m.name.replace('models/', ''));

                    // Check if we can fallback to a known working model
                    const fallbackModel = 'gemini-2.5-flash';
                    if (modelIds.includes(fallbackModel)) {
                        appState.currentAIModel = fallbackModel;

                        // Update UI
                        if (DOM.aiModelSelect) DOM.aiModelSelect.value = fallbackModel;
                        UI.showNotification(`Modèle corrigé automatiquement vers ${fallbackModel}.`, 'success');

                        // Retry validation recursively (once)
                        if (!isRetry) {
                            await this.validateApiKeyUI(provider, inputEl, errorEl, btnEl, onSuccess, true);
                            return; // Exit this execution as the retry handles it
                        }
                    } else {
                        // If no fallback found, show the list
                        const modelNames = modelIds.join('\n');
                        alert(`Le modèle configuré est introuvable et l'auto-correction a échoué. Voici les modèles disponibles :\n\n${modelNames}\n\nVeuillez sélectionner un modèle compatible.`);
                    }
                } catch (listError) {
                    console.error("Echec de l'auto-correction:", listError);
                }
            }

            UI.hideInlineSpinner(btnEl);
            btnEl.innerHTML = 'Vérifier';
            btnEl.classList.remove('btn-validated', 'btn-needs-validation');
            console.error("Validation failed:", e);

            // Distinguer les erreurs de quota des vraies erreurs de clé
            const isQuotaError = e.message.includes('429') || e.message.toLowerCase().includes('quota');
            const isRateLimitError = e.message.toLowerCase().includes('rate limit') || e.message.toLowerCase().includes('rate_limit');
            const isModelNotFoundError = provider === 'google' && (e.message.includes('404') || e.message.toLowerCase().includes('not found'));

            if (isQuotaError || isRateLimitError) {
                appState.apiKeyStatus[provider] = 'quota-warning';
                appState.validatedApiKeys[provider] = true;
                SettingsUIManager.updateApiStatusDisplay();

                inputEl.classList.remove('input-error', 'input-warning', 'input-success');

                errorEl.innerHTML = `<iconify-icon icon="solar:clock-circle-linear" style="vertical-align: -2px;"></iconify-icon> <span>Clé authentifiée — limite temporaire atteinte, patientez 1 à 2 min.</span>`;
                errorEl.style.display = 'block';
                errorEl.style.color = 'var(--warning-color)';

                await StorageManager.saveAppState();
                if (onSuccess) onSuccess();
            } else if (isModelNotFoundError) {
                appState.apiKeyStatus[provider] = 'valid';
                appState.validatedApiKeys[provider] = true;
                SettingsUIManager.updateApiStatusDisplay();

                btnEl.classList.remove('btn-needs-validation', 'btn-validated');
                btnEl.innerHTML = 'Vérifier';
                inputEl.classList.remove('input-error', 'input-warning', 'input-success');

                errorEl.innerHTML = `<iconify-icon icon="solar:info-circle-linear" style="vertical-align: -2px;"></iconify-icon> <span>Modèle indisponible — sélectionnez un autre modèle Gemini.</span>`;
                errorEl.style.display = 'block';
                errorEl.style.color = 'var(--warning-color)';

                await StorageManager.saveAppState();
                if (onSuccess) onSuccess();
            } else {
                // Vraie erreur de clé invalide - effacer la clé de appState
                appState.validatedApiKeys[provider] = false;
                appState.apiKeyStatus[provider] = 'invalid';
                appState[`${provider}ApiKey`] = '';
                await StorageManager.saveAppState();

                // Extraire le diagnostic technique sans répéter "Clé invalide" (déjà affiché sur le badge d'en-tête)
                const errorMsg = e.message || '';
                const codeMatch = errorMsg.match(/\((\d{3})\)|status:\s*(\d{3})|HTTP\s*(\d{3})/i);
                const errorCode = codeMatch ? (codeMatch[1] || codeMatch[2] || codeMatch[3]) : null;

                let cleanDetail = '';
                const jsonMatch = errorMsg.match(/:\s*(\{.*\})/);
                if (jsonMatch) {
                    try {
                        const jsonError = JSON.parse(jsonMatch[1]);
                        const rawDetail = jsonError.detail || jsonError.message || jsonError.error?.message || jsonError.error || '';
                        cleanDetail = typeof rawDetail === 'string' ? rawDetail : '';
                    } catch {
                        cleanDetail = '';
                    }
                } else {
                    cleanDetail = errorMsg
                        .replace(/^Clé invalide\s*(?:\(\d+\))?\s*:\s*/i, '')
                        .replace(/^Erreur API\s*\d+\s*:\s*/i, '')
                        .replace(/^HTTP error!\s*status:\s*\d+\s*(?:-\s*)?/i, '')
                        .trim();
                }

                const codePrefix = errorCode ? `Code ${errorCode}` : 'Refus API';
                const diagnosticText = cleanDetail ? `${codePrefix} · ${cleanDetail}` : `${codePrefix} · Authentification refusée par le fournisseur`;

                appState.apiKeyErrorDetails = appState.apiKeyErrorDetails || {};
                appState.apiKeyErrorDetails[provider] = diagnosticText;

                errorEl.innerHTML = `<iconify-icon icon="solar:info-circle-linear" style="vertical-align: -2px;"></iconify-icon> <span>${diagnosticText}</span>`;
                errorEl.style.display = 'block';
                errorEl.style.color = '';
                inputEl.classList.add('input-error');

                SettingsUIManager.updateApiStatusDisplay();
            }
        }
    },

    /**
     * Valide une clé API pour un provider donné
     * @param {string} provider - Le provider à valider
     */
    validateApiKey(provider) {
        const inputMap = {
            'openai': DOM.openaiApiKey,
            'google': DOM.googleApiKey,
            'groq': DOM.groqApiKey,
            'openrouter': DOM.openrouterApiKey,
            'anthropic': DOM.anthropicApiKey,
            'mistral': DOM.mistralApiKey
        };
        const errorMap = {
            'openai': DOM.openaiApiKeyError,
            'google': DOM.googleApiKeyError,
            'groq': DOM.groqApiKeyError,
            'openrouter': DOM.openrouterApiKeyError,
            'anthropic': DOM.anthropicApiKeyError,
            'mistral': DOM.mistralApiKeyError
        };
        const btnMap = {
            'openai': DOM.validateOpenaiApiKeyBtn,
            'google': DOM.validateGoogleApiKeyBtn,
            'groq': DOM.validateGroqApiKeyBtn,
            'openrouter': DOM.validateOpenrouterApiKeyBtn,
            'anthropic': DOM.validateAnthropicApiKeyBtn,
            'mistral': DOM.validateMistralApiKeyBtn
        };

        this.validateApiKeyUI(provider, inputMap[provider], errorMap[provider], btnMap[provider], () => {
            UI.updateGenerateButtonState();
            UI.updateHeaderPremiumLook();
            SettingsUIManager.updateApiStatusDisplay();
        });
    },



    /**
     * Gère le changement d'input sur les champs de clé API
     * @param {Event} e - L'événement input
     */
    handleApiKeyInput(e) {
        const input = e.target;
        input.classList.remove('input-error', 'input-success', 'input-warning');
        const icon = input.nextElementSibling;
        if (icon?.classList.contains('api-key-validation-icon')) {
            icon.innerHTML = '';
        }

        // Ajouter l'état d'attention au bouton correspondant si une clé est saisie
        const inputId = input.id;
        let btnEl = null;
        let errorEl = null;
        let provider = null;
        if (inputId === 'googleApiKey') { btnEl = DOM.validateGoogleApiKeyBtn; errorEl = DOM.googleApiKeyError; provider = 'google'; }
        else if (inputId === 'groqApiKey') { btnEl = DOM.validateGroqApiKeyBtn; errorEl = DOM.groqApiKeyError; provider = 'groq'; }
        else if (inputId === 'openaiApiKey') { btnEl = DOM.validateOpenaiApiKeyBtn; errorEl = DOM.openaiApiKeyError; provider = 'openai'; }
        else if (inputId === 'openrouterApiKey') { btnEl = DOM.validateOpenrouterApiKeyBtn; errorEl = DOM.openrouterApiKeyError; provider = 'openrouter'; }
        else if (inputId === 'anthropicApiKey') { btnEl = DOM.validateAnthropicApiKeyBtn; errorEl = DOM.anthropicApiKeyError; provider = 'anthropic'; }
        else if (inputId === 'mistralApiKey') { btnEl = DOM.validateMistralApiKeyBtn; errorEl = DOM.mistralApiKeyError; provider = 'mistral'; }

        if (errorEl) {
            errorEl.style.display = 'none';
            errorEl.textContent = '';
        }

        // Réinitialiser le statut de validation quand la clé change
        if (provider) {
            if (appState.validatedApiKeys) appState.validatedApiKeys[provider] = false;
            if (appState.apiKeyStatus) appState.apiKeyStatus[provider] = null;
            if (appState.apiKeyErrorDetails) delete appState.apiKeyErrorDetails[provider];
            SettingsUIManager.updateApiStatusDisplay();
        }

        if (btnEl) {
            btnEl.classList.remove('btn-validated');
            btnEl.innerHTML = 'Vérifier';
            if (input.value.trim()) {
                btnEl.classList.add('btn-needs-validation');
            } else {
                btnEl.classList.remove('btn-needs-validation');
            }
        }
    }
};
