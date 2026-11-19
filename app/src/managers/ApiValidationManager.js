/**
 * @fileoverview Gestionnaire de la validation des clés API
 * @module managers/ApiValidationManager
 * 
 * Responsabilités :
 * - Validation des clés API (Google, OpenAI, OpenRouter, Anthropic, Mistral)
 * - Auto-correction des modèles non trouvés
 */

import { appState, UIState } from '../state/State.js';
import { FALLBACK_CONFIG, PROVIDER_DEFAULT_MODELS, getModelMeta, getApiModelName } from '../config/models.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';
import { AIService } from '../services/AIService.js';
import { SettingsUIManager } from './SettingsUIManager.js';
import { DropdownManager } from './DropdownManager.js';

export const ApiValidationManager = {
    /**
     * Synchronise le snapshot de la modale des paramètres lorsqu'une clé est explicitement
     * validée et sauvegardée, afin qu'une fermeture par "X" / "Échap" n'annule pas la clé validée.
     * @param {string} provider
     * @private
     */
    _syncSettingsSnapshotAfterValidation(provider) {
        if (!UIState?.settingsBeforeEdit || Object.keys(UIState.settingsBeforeEdit).length === 0) return;
        const keyProp = `${provider}ApiKey`;
        UIState.settingsBeforeEdit[keyProp] = appState[keyProp];
        UIState.settingsBeforeEdit.currentAIModel = appState.currentAIModel;
        if (UIState.settingsBeforeEdit.validatedApiKeys && appState.validatedApiKeys) {
            UIState.settingsBeforeEdit.validatedApiKeys[provider] = appState.validatedApiKeys[provider];
        }
        if (UIState.settingsBeforeEdit.apiKeyStatus && appState.apiKeyStatus) {
            UIState.settingsBeforeEdit.apiKeyStatus[provider] = appState.apiKeyStatus[provider];
        }
    },

    /**
     * Détermine si une erreur de validation est transitoire (timeout, surcharge 5xx, perte réseau)
     * et ne prouve donc pas que la clé API est invalide.
     * @param {Error|any} error
     * @returns {boolean}
     * @private
     */
    _isTransientValidationError(error) {
        if (!error) return false;
        if (error.name === 'TimeoutError') return true;
        if (typeof error.status === 'number' && error.status >= 500) return true;
        if (error instanceof TypeError) return true;
        const msg = String(error.message || '').toLowerCase();
        return /timeout|expir[ée]|failed to fetch|networkerror|load failed|unavailable|overloaded|capacity|\b50[0234]\b/.test(msg);
    },

    /**
     * Sélectionne le modèle Google le plus rapide et léger (sans raisonnement) disponible
     * pour le test de quota de l'étape 2, afin d'éviter la latence des modèles thinking.
     * @param {Array<{name?: string}>} [availableModels=[]]
     * @returns {string}
     * @private
     */
    _pickGoogleValidationModel(availableModels = []) {
        const candidates = FALLBACK_CONFIG.google || [PROVIDER_DEFAULT_MODELS.google];
        const availableIds = new Set(
            (Array.isArray(availableModels) ? availableModels : [])
                .map(m => (typeof m?.name === 'string' ? m.name.replace(/^models\//, '') : ''))
                .filter(Boolean)
        );
        const isAvailable = (id) => availableIds.size === 0 || availableIds.has(getApiModelName(id));

        const fastModel = candidates.find(id => !getModelMeta(id)?.isReasoning && isAvailable(id));
        if (fastModel) return fastModel;

        return candidates.find(isAvailable) || PROVIDER_DEFAULT_MODELS.google;
    },

    /**
     * Bascule automatiquement vers le modèle recommandé du fournisseur si le modèle actif
     * ne dispose pas de clé API configurée.
     * @param {string} provider
     * @private
     */
    async _autoSelectModelIfNeeded(provider) {
        if (AIService._hasApiKeyForModel(appState.currentAIModel)) return;
        const recommendedModel = PROVIDER_DEFAULT_MODELS[provider];
        if (!recommendedModel) return;

        appState.currentAIModel = recommendedModel;
        await StorageManager.saveAppState();
        this._syncSettingsSnapshotAfterValidation(provider);

        if (DOM.aiModelSelect) {
            DOM.aiModelSelect.value = recommendedModel;
            DropdownManager.refresh('aiModelSelect');
        }
        SettingsUIManager.updateHeaderAiModelDisplay();
        UI.showNotification(`Modèle basculé vers ${recommendedModel}`, 'info');
    },

    /**
     * Valide une clé API avec UI feedback
     * @param {string} provider - Le provider ('openai', 'google', 'openrouter')
     * @param {HTMLInputElement} inputEl - L'élément input contenant la clé
     * @param {HTMLElement} errorEl - L'élément pour afficher les erreurs
     * @param {HTMLButtonElement} btnEl - Le bouton de validation
     * @param {Function} [onSuccess] - Callback en cas de succès
     */
    async validateApiKeyUI(provider, inputEl, errorEl, btnEl, onSuccess) {
        const key = inputEl.value.trim();
        if (!key) {
            if (errorEl.dataset) delete errorEl.dataset.missingKeyError;
            errorEl.textContent = "Veuillez entrer une clé.";
            errorEl.style.display = 'block';
            return;
        }

        const previousKey = appState[`${provider}ApiKey`] || '';
        const previousValidated = Boolean(appState.validatedApiKeys?.[provider]);
        const previousStatus = appState.apiKeyStatus?.[provider] ?? null;

        UI.showInlineSpinner(btnEl);
        if (errorEl.dataset) delete errorEl.dataset.missingKeyError;
        errorEl.style.display = 'none';

        try {
            appState[`${provider}ApiKey`] = key;

            // Pour Google & Albert: validation en deux étapes
            if (provider === 'google' || provider === 'albert') {
                // Étape 1: Vérifier que la clé est valide (endpoint /models ne consomme pas de quota)
                let availableModels = [];
                try {
                    availableModels = await AIService.getAvailableModels(provider);
                } catch (modelsError) {
                    if (this._isTransientValidationError(modelsError)) {
                        throw modelsError;
                    }
                    // Si /models échoue avec une erreur d'authentification, la clé est invalide
                    throw new Error(`Clé invalide : ${modelsError.message}`);
                }

                // Étape 2: Tester le quota avec un modèle rapide sans raisonnement
                try {
                    const modelOverride = provider === 'google'
                        ? this._pickGoogleValidationModel(availableModels)
                        : (PROVIDER_DEFAULT_MODELS.albert || 'albert-openweight-medium');
                    await AIService.callAI("Validation", { isValidation: true, validationProvider: provider, modelOverride });
                    // Succès complet
                    appState.apiKeyStatus[provider] = 'valid';
                } catch (quotaError) {
                    const msg = (quotaError.message || '').toLowerCase();
                    if (msg.includes('429') || msg.includes('quota') || msg.includes('rate')) {
                        appState.apiKeyStatus[provider] = 'quota-warning';
                        appState.validatedApiKeys[provider] = true;
                        if (appState.apiKeyErrorDetails) delete appState.apiKeyErrorDetails[provider];

                        UI.hideInlineSpinner(btnEl);
                        btnEl.classList.remove('btn-needs-validation', 'btn-validated');
                        btnEl.innerHTML = 'Vérifier';
                        inputEl.classList.remove('input-error', 'input-warning', 'input-success');

                        errorEl.innerHTML = `<iconify-icon icon="solar:clock-circle-linear" style="vertical-align: -2px;"></iconify-icon> <span>Clé authentifiée — limite temporaire atteinte, patientez 1 à 2 min.</span>`;
                        errorEl.style.display = 'block';
                        errorEl.style.color = 'var(--warning-color)';

                        await StorageManager.saveAppState();
                        this._syncSettingsSnapshotAfterValidation(provider);
                        SettingsUIManager.updateApiStatusDisplay();
                        await this._autoSelectModelIfNeeded(provider);
                        if (onSuccess) onSuccess();
                        return;
                    }
                    if (this._isTransientValidationError(quotaError)) {
                        // L'étape 1 (/models) a déjà prouvé que la clé est valide :
                        // un timeout ou 503 sur generateContent ne doit pas invalider ni effacer la clé.
                        appState.apiKeyStatus[provider] = 'valid';
                        appState.validatedApiKeys[provider] = true;
                        if (appState.apiKeyErrorDetails) delete appState.apiKeyErrorDetails[provider];

                        UI.hideInlineSpinner(btnEl);
                        btnEl.classList.remove('btn-needs-validation', 'btn-validated');
                        btnEl.innerHTML = 'Vérifier';
                        inputEl.classList.remove('input-error', 'input-warning', 'input-success');

                        errorEl.innerHTML = `<iconify-icon icon="solar:check-circle-linear" style="vertical-align: -2px;"></iconify-icon> <span>Clé enregistrée et prête — serveur actuellement lent (test rapide ignoré).</span>`;
                        errorEl.style.display = 'block';
                        errorEl.style.color = 'var(--text-secondary)';

                        await StorageManager.saveAppState();
                        this._syncSettingsSnapshotAfterValidation(provider);
                        SettingsUIManager.updateApiStatusDisplay();
                        UI.showNotification(`Clé ${provider} authentifiée et sauvegardée !`, 'success');
                        await this._autoSelectModelIfNeeded(provider);
                        if (onSuccess) onSuccess();
                        return;
                    }
                    throw quotaError;
                }
            } else {
                // Pour OpenAI, OpenRouter, Anthropic, Mistral, Groq: validation via modèles légers et rapides
                const testModels = {
                    ...PROVIDER_DEFAULT_MODELS,
                    groq: 'groq-gpt-oss-20b',
                    anthropic: 'anthropic-claude-haiku-5-5',
                    openrouter: 'deepseek/deepseek-chat'
                };
                const modelOverride = testModels[provider] || PROVIDER_DEFAULT_MODELS[provider] || PROVIDER_DEFAULT_MODELS.google;
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
            } else if (provider === 'albert') {
                const accountInfo = await AIService.getAlbertAccountInfo(key).catch(() => null);
                if (accountInfo && (accountInfo.rpmLimit || accountInfo.rpdLimit)) {
                    const parts = [];
                    if (accountInfo.rpmLimit) parts.push(`<strong style="color:var(--text-primary);">${accountInfo.rpmLimit} req/min</strong>`);
                    if (accountInfo.rpdLimit) parts.push(`${accountInfo.rpdLimit} req/jour`);
                    errorEl.innerHTML = `<iconify-icon icon="solar:shield-check-linear" style="vertical-align: -2px;"></iconify-icon> <span>Accès souverain actif · Quota : ${parts.join(' · ')}</span>`;
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
            this._syncSettingsSnapshotAfterValidation(provider);
            SettingsUIManager.updateApiStatusDisplay();
            UI.showNotification(`Clé ${provider} validée et sauvegardée !`, 'success');

            // ✅ Auto-sélection du modèle si le modèle actuel n'a pas de clé configurée
            // Évite la confusion UX où l'utilisateur valide Mistral mais le modèle reste sur Gemini
            await this._autoSelectModelIfNeeded(provider);

            if (onSuccess) onSuccess();


        } catch (e) {
            UI.hideInlineSpinner(btnEl);
            btnEl.innerHTML = 'Vérifier';
            btnEl.classList.remove('btn-validated', 'btn-needs-validation');
            console.error("Validation failed:", e);

            // Distinguer les erreurs de quota des vraies erreurs de clé
            const rawMsg = String(e?.message || '');
            const rawMsgLower = rawMsg.toLowerCase();
            const isQuotaError = rawMsg.includes('429') || rawMsgLower.includes('quota');
            const isRateLimitError = rawMsgLower.includes('rate limit') || rawMsgLower.includes('rate_limit');
            const isModelNotFoundError = provider === 'google' && (rawMsg.includes('404') || rawMsgLower.includes('not found'));

            if (isQuotaError || isRateLimitError) {
                appState.apiKeyStatus[provider] = 'quota-warning';
                appState.validatedApiKeys[provider] = true;
                if (appState.apiKeyErrorDetails) delete appState.apiKeyErrorDetails[provider];
                SettingsUIManager.updateApiStatusDisplay();

                inputEl.classList.remove('input-error', 'input-warning', 'input-success');

                errorEl.innerHTML = `<iconify-icon icon="solar:clock-circle-linear" style="vertical-align: -2px;"></iconify-icon> <span>Clé authentifiée — limite temporaire atteinte, patientez 1 à 2 min.</span>`;
                errorEl.style.display = 'block';
                errorEl.style.color = 'var(--warning-color)';

                await StorageManager.saveAppState();
                this._syncSettingsSnapshotAfterValidation(provider);
                await this._autoSelectModelIfNeeded(provider);
                if (onSuccess) onSuccess();
            } else if (isModelNotFoundError) {
                appState.apiKeyStatus[provider] = 'valid';
                appState.validatedApiKeys[provider] = true;
                if (appState.apiKeyErrorDetails) delete appState.apiKeyErrorDetails[provider];
                SettingsUIManager.updateApiStatusDisplay();

                btnEl.classList.remove('btn-needs-validation', 'btn-validated');
                btnEl.innerHTML = 'Vérifier';
                inputEl.classList.remove('input-error', 'input-warning', 'input-success');

                errorEl.innerHTML = `<iconify-icon icon="solar:info-circle-linear" style="vertical-align: -2px;"></iconify-icon> <span>Modèle indisponible — sélectionnez un autre modèle Gemini.</span>`;
                errorEl.style.display = 'block';
                errorEl.style.color = 'var(--warning-color)';

                await StorageManager.saveAppState();
                this._syncSettingsSnapshotAfterValidation(provider);
                await this._autoSelectModelIfNeeded(provider);
                if (onSuccess) onSuccess();
            } else if (this._isTransientValidationError(e)) {
                // Erreur réseau / timeout / surcharge 5xx : ne pas accuser faussement la clé d'être invalide
                appState[`${provider}ApiKey`] = previousKey;
                if (appState.validatedApiKeys) appState.validatedApiKeys[provider] = previousValidated;
                if (appState.apiKeyStatus) appState.apiKeyStatus[provider] = previousStatus;
                if (appState.apiKeyErrorDetails) delete appState.apiKeyErrorDetails[provider];

                inputEl.classList.remove('input-error', 'input-warning', 'input-success');

                errorEl.innerHTML = `<iconify-icon icon="solar:clock-circle-linear" style="vertical-align: -2px;"></iconify-icon> <span>Serveur momentanément indisponible ou délai dépassé — réessayez dans un instant.</span>`;
                errorEl.style.display = 'block';
                errorEl.style.color = 'var(--warning-color)';

                SettingsUIManager.updateApiStatusDisplay();
            } else {
                // Vraie erreur de clé invalide - effacer la clé de appState
                appState.validatedApiKeys[provider] = false;
                appState.apiKeyStatus[provider] = 'invalid';
                appState[`${provider}ApiKey`] = '';
                await StorageManager.saveAppState();

                // Extraire le diagnostic technique sans répéter "Clé invalide" (déjà affiché sur le badge d'en-tête)
                const codeMatch = rawMsg.match(/\((\d{3})\)|status:\s*(\d{3})|HTTP\s*(\d{3})/i);
                const errorCode = codeMatch ? (codeMatch[1] || codeMatch[2] || codeMatch[3]) : null;

                let cleanDetail = '';
                const jsonMatch = rawMsg.match(/:\s*(\{.*\})/);
                if (jsonMatch) {
                    try {
                        const jsonError = JSON.parse(jsonMatch[1]);
                        const rawDetail = jsonError.detail || jsonError.message || jsonError.error?.message || jsonError.error || '';
                        cleanDetail = typeof rawDetail === 'string' ? rawDetail : '';
                    } catch {
                        cleanDetail = '';
                    }
                } else {
                    cleanDetail = rawMsg
                        .replace(/^Clé invalide\s*(?:\(\d+\))?\s*:\s*/i, '')
                        .replace(/^Erreur\s+(?:API|HTTP)\s*\d+\s*:\s*/i, '')
                        .replace(/^HTTP error!\s*status:\s*\d+\s*(?:-\s*)?/i, '')
                        .trim();
                }

                const codePrefix = errorCode ? `Code ${errorCode}` : 'Refus API';
                const diagnosticText = cleanDetail ? `${codePrefix} · ${cleanDetail}` : `${codePrefix} · Authentification refusée par le fournisseur`;

                appState.apiKeyErrorDetails = appState.apiKeyErrorDetails || {};
                appState.apiKeyErrorDetails[provider] = diagnosticText;

                errorEl.innerHTML = `<iconify-icon icon="solar:info-circle-linear" style="vertical-align: -2px;"></iconify-icon> <span>${Utils.escapeHtml(diagnosticText)}</span>`;
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
            'albert': DOM.albertApiKey,
            'groq': DOM.groqApiKey,
            'openrouter': DOM.openrouterApiKey,
            'anthropic': DOM.anthropicApiKey,
            'mistral': DOM.mistralApiKey
        };
        const errorMap = {
            'openai': DOM.openaiApiKeyError,
            'google': DOM.googleApiKeyError,
            'albert': DOM.albertApiKeyError,
            'groq': DOM.groqApiKeyError,
            'openrouter': DOM.openrouterApiKeyError,
            'anthropic': DOM.anthropicApiKeyError,
            'mistral': DOM.mistralApiKeyError
        };
        const btnMap = {
            'openai': DOM.validateOpenaiApiKeyBtn,
            'google': DOM.validateGoogleApiKeyBtn,
            'albert': DOM.validateAlbertApiKeyBtn,
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

        // Ajouter l'état d'attention au bouton correspondant si une clé est saisie
        const inputId = input.id;
        let btnEl = null;
        let errorEl = null;
        let provider = null;
        if (inputId === 'googleApiKey') { btnEl = DOM.validateGoogleApiKeyBtn; errorEl = DOM.googleApiKeyError; provider = 'google'; }
        else if (inputId === 'albertApiKey') { btnEl = DOM.validateAlbertApiKeyBtn; errorEl = DOM.albertApiKeyError; provider = 'albert'; }
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
            if (!input.value.trim()) {
                appState[`${provider}ApiKey`] = '';
            }
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
