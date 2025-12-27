/**
 * @fileoverview Gestionnaire de la validation des clés API
 * @module managers/ApiValidationManager
 * 
 * Responsabilités :
 * - Validation des clés API (Google, OpenAI, OpenRouter)
 * - Auto-correction des modèles non trouvés
 */

import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';
import { AIService } from '../services/AIService.js';
import { SettingsUIManager } from './SettingsUIManager.js';

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
                    const modelOverride = appState.currentAIModel.startsWith('gemini') ? appState.currentAIModel : 'gemini-2.5-flash';
                    await AIService.callAI("Validation", { isValidation: true, validationProvider: provider, modelOverride });
                    // Succès complet
                    appState.apiKeyStatus[provider] = 'valid';
                } catch (quotaError) {
                    const msg = quotaError.message.toLowerCase();
                    if (msg.includes('429') || msg.includes('quota') || msg.includes('rate')) {
                        // Clé valide mais quota épuisé - la clé elle-même est valide → affichage vert
                        appState.apiKeyStatus[provider] = 'quota-warning';
                        appState.validatedApiKeys[provider] = true;

                        UI.hideInlineSpinner(btnEl);
                        btnEl.classList.remove('btn-needs-validation');
                        btnEl.classList.add('btn-validated');
                        btnEl.innerHTML = '<i class="fas fa-check"></i> OK';
                        // Bouton reste validé - pas de contour sur l'input, le bouton OK suffit
                        inputEl.classList.remove('input-error', 'input-warning', 'input-success');

                        // Message bref - le bandeau intelligent affiche déjà le détail
                        errorEl.innerHTML = `✓ <strong>Clé valide</strong> <span style="color:var(--warning-color);">• Quota limité</span>`;
                        errorEl.style.display = 'block';
                        errorEl.style.color = 'var(--success-color)';

                        StorageManager.saveAppState();
                        SettingsUIManager.updateApiStatusDisplay();
                        if (onSuccess) onSuccess();
                        return;
                    }
                    throw quotaError;
                }
            } else {
                // Pour OpenAI et OpenRouter: validation simple
                let modelOverride = 'openai-gpt-3.5-turbo';
                if (provider === 'openrouter') {
                    modelOverride = 'deepseek/deepseek-chat';
                    await AIService.callAI("Validation", { isValidation: true, validationProvider: provider, modelOverride });

                    // Si la validation réussit, on vérifie les crédits
                    const credits = await AIService.getOpenRouterCredits();
                    if (credits !== null) {
                        errorEl.innerHTML = `✓ <strong>Clé valide</strong> • Solde : <strong style="color:var(--text-color);">${credits.toFixed(3)}$</strong>`;
                        errorEl.style.display = 'block';
                        errorEl.style.color = 'var(--success-color)';
                    }
                } else {
                    await AIService.callAI("Validation", { isValidation: true, validationProvider: provider, modelOverride });
                }
                appState.apiKeyStatus[provider] = 'valid';
            }

            // Marquer la clé comme validée
            appState.validatedApiKeys[provider] = true;

            UI.hideInlineSpinner(btnEl);

            // Bouton reste en état "validé" tant que la clé n'est pas modifiée
            btnEl.classList.remove('btn-needs-validation');
            btnEl.classList.add('btn-validated');
            btnEl.innerHTML = '<i class="fas fa-check"></i> OK';
            // Note: handleApiKeyInput() réinitialisera le bouton si la clé est modifiée
            // Pas de contour sur l'input, le bouton OK suffit
            inputEl.classList.remove('input-error', 'input-warning', 'input-success');
            errorEl.style.display = 'none';
            errorEl.style.color = ''; // Reset color

            StorageManager.saveAppState();
            SettingsUIManager.updateApiStatusDisplay();
            UI.showNotification(`Clé ${provider} validée et sauvegardée !`, 'success');
            if (onSuccess) onSuccess();


        } catch (e) {
            // Auto-Healing for Google 404
            if (provider === 'google' && e.message.includes('404') && (e.message.includes('models/') || e.message.includes('not found'))) {
                try {
                    const models = await AIService.getAvailableModels('google');
                    const modelIds = models.map(m => m.name.replace('models/', ''));

                    // Check if we can fallback to a known working model
                    const fallbackModel = 'gemini-2.0-flash';
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
            btnEl.innerHTML = originalBtnContent;
            btnEl.classList.remove('btn-validated', 'btn-needs-validation');
            console.error("Validation failed:", e);

            // Distinguer les erreurs de quota des vraies erreurs de clé
            const isQuotaError = e.message.includes('429') || e.message.toLowerCase().includes('quota');
            const isRateLimitError = e.message.toLowerCase().includes('rate') || e.message.toLowerCase().includes('limit');

            if (isQuotaError || isRateLimitError) {
                // Vérifier si le modèle est réellement disponible
                if (provider === 'google') {
                    try {
                        const models = await AIService.getAvailableModels('google');
                        const modelIds = models.map(m => m.name.replace('models/', ''));
                        const currentModel = appState.currentAIModel;

                        if (!modelIds.includes(currentModel)) {
                            // Le modèle n'est pas disponible - ce n'est pas un problème de quota
                            appState.apiKeyStatus[provider] = 'invalid';
                            SettingsUIManager.updateApiStatusDisplay();
                            errorEl.innerHTML = `❌ <strong>Modèle "${currentModel}" non disponible</strong><br>Ce modèle n'est pas accessible avec votre clé API.<br>Essayez "gemini-2.5-flash" ou "gemini-2.0-flash".`;
                            errorEl.style.display = 'block';
                            errorEl.style.color = 'var(--error-color)';
                            inputEl.classList.add('input-error');
                            return;
                        }
                    } catch (listError) {
                        console.warn("Impossible de vérifier les modèles disponibles:", listError);
                    }
                }

                // Erreur de quota temporaire - la clé est valide → affichage vert pour la clé
                appState.apiKeyStatus[provider] = 'quota-warning';
                appState.validatedApiKeys[provider] = true;
                SettingsUIManager.updateApiStatusDisplay();

                const retryMatch = e.message.match(/retry in ([\d.]+)s/i);
                const retryTime = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 60;

                // Pas de contour sur l'input, le bouton OK suffit
                inputEl.classList.remove('input-error', 'input-warning', 'input-success');

                // Message bref - le bandeau intelligent affiche déjà le détail
                errorEl.innerHTML = `✓ <strong>Clé valide</strong> <span style="color:var(--warning-color);">• Quota limité</span>`;
                errorEl.style.display = 'block';
                errorEl.style.color = 'var(--success-color)';
            } else {
                // Vraie erreur de clé invalide - effacer la clé de appState
                appState.validatedApiKeys[provider] = false;
                appState[`${provider}ApiKey`] = '';
                errorEl.textContent = `Clé invalide : ${e.message}`;
                errorEl.style.display = 'block';
                errorEl.style.color = ''; // Reset to default error color
                inputEl.classList.add('input-error');
                // Mettre à jour l'affichage du statut
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
            'openrouter': DOM.openrouterApiKey
        };
        const errorMap = {
            'openai': DOM.openaiApiKeyError,
            'google': DOM.googleApiKeyError,
            'openrouter': DOM.openrouterApiKeyError
        };
        const btnMap = {
            'openai': DOM.validateOpenaiApiKeyBtn,
            'google': DOM.validateGoogleApiKeyBtn,
            'openrouter': DOM.validateOpenrouterApiKeyBtn
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
        let provider = null;
        if (inputId === 'googleApiKey') { btnEl = DOM.validateGoogleApiKeyBtn; provider = 'google'; }
        else if (inputId === 'openaiApiKey') { btnEl = DOM.validateOpenaiApiKeyBtn; provider = 'openai'; }
        else if (inputId === 'openrouterApiKey') { btnEl = DOM.validateOpenrouterApiKeyBtn; provider = 'openrouter'; }

        // Réinitialiser le statut de validation quand la clé change
        if (provider && appState.validatedApiKeys) {
            appState.validatedApiKeys[provider] = false;
            SettingsUIManager.updateApiStatusDisplay();
        }

        if (btnEl) {
            btnEl.classList.remove('btn-validated');
            if (input.value.trim()) {
                btnEl.classList.add('btn-needs-validation');
            } else {
                btnEl.classList.remove('btn-needs-validation');
            }
        }
    }
};
