/**
 * @fileoverview Rate Limiter adaptatif pour les requêtes API.
 * 
 * Ce module gère le délai entre les requêtes pour éviter de saturer
 * les quotas par minute des différents modèles IA.
 * 
 * Fonctionnalité auto-tuning : le délai s'adapte automatiquement
 * - Après succès : réduit le délai (jusqu'au minimum configuré)
 * - Après erreur 429 : augmente le délai (backoff)
 * 
 * @module utils/RateLimiter
 */

import { RATE_LIMITS } from '../config/models.js';
import { appState } from '../state/State.js';

/**
 * Timestamp de la dernière requête par modèle
 * @type {Map<string, number>}
 */
const lastRequestTime = new Map();

/**
 * Délais adaptatifs par modèle (peuvent être ajustés dynamiquement)
 * @type {Map<string, number>}
 */
const adaptiveDelays = new Map();

/**
 * Compteur de succès consécutifs par modèle (pour réduire le délai)
 * @type {Map<string, number>}
 */
const successStreak = new Map();

/**
 * Clé localStorage pour persister les délais adaptés
 */
const STORAGE_KEY = 'bulletinAI_adaptiveRateLimits';

/**
 * Module de gestion du rate limiting adaptatif.
 * @namespace RateLimiter
 */
export const RateLimiter = {
    /**
     * Facteur de réduction du délai après succès (10% plus rapide)
     */
    SUCCESS_REDUCTION_FACTOR: 0.9,

    /**
     * Facteur d'augmentation après erreur 429 (double le délai)
     */
    ERROR_INCREASE_FACTOR: 2.0,

    /**
     * Nombre de succès consécutifs avant de réduire le délai
     */
    SUCCESS_THRESHOLD: 3,

    /**
     * Délai minimum absolu (500ms) pour éviter de spammer l'API
     */
    MIN_DELAY_MS: 500,

    /**
     * Initialise le rate limiter et charge les délais persistés.
     */
    init() {
        this._loadAdaptiveDelays();
    },

    /**
     * Obtient le délai effectif pour un modèle (adaptatif si disponible).
     * @param {string} model - Nom du modèle
     * @returns {number} Délai en millisecondes
     */
    getDelayForModel(model) {
        // Priorité : délai adaptatif > délai configuré > délai par défaut
        if (adaptiveDelays.has(model)) {
            return adaptiveDelays.get(model);
        }
        const config = RATE_LIMITS[model] || RATE_LIMITS['default'];
        return config.delayMs;
    },

    /**
     * Obtient le délai de base configuré (non adapté).
     * @param {string} model - Nom du modèle
     * @returns {number} Délai en millisecondes
     */
    getBaseDelayForModel(model) {
        const config = RATE_LIMITS[model] || RATE_LIMITS['default'];
        return config.delayMs;
    },

    /**
     * Calcule le temps d'attente nécessaire avant la prochaine requête.
     * @param {string} model - Nom du modèle
     * @returns {number} Temps d'attente en millisecondes (0 si aucune attente nécessaire)
     */
    getWaitTime(model) {
        const lastTime = lastRequestTime.get(model) || 0;
        const delay = this.getDelayForModel(model);
        const elapsed = Date.now() - lastTime;
        const waitTime = Math.max(0, delay - elapsed);
        return waitTime;
    },

    /**
     * Attend le temps nécessaire avant d'autoriser une requête.
     * Met à jour le timestamp après l'attente.
     * @param {string} [model] - Nom du modèle (utilise le modèle actuel si non spécifié)
     * @param {Function} [onWait] - Callback appelé avec le temps d'attente restant (pour UI)
     * @param {AbortSignal} [signal] - Signal pour interrompre l'attente
     * @returns {Promise<void>}
     */
    async waitIfNeeded(model, onWait = null, signal = null) {
        const targetModel = model || appState.currentAIModel;
        const waitTime = this.getWaitTime(targetModel);

        if (waitTime > 0) {
            // Notifier l'UI du temps d'attente si callback fourni
            if (onWait) {
                onWait(waitTime);
            }

            await this.sleep(waitTime, signal);
        }

        // Enregistrer le timestamp de cette requête
        lastRequestTime.set(targetModel, Date.now());
    },

    /**
     * Enregistre un succès et adapte le délai si nécessaire.
     * @param {string} model - Nom du modèle
     */
    markSuccess(model) {
        lastRequestTime.set(model, Date.now());

        // Incrémenter le compteur de succès
        const streak = (successStreak.get(model) || 0) + 1;
        successStreak.set(model, streak);

        // Après N succès consécutifs, réduire le délai
        if (streak >= this.SUCCESS_THRESHOLD) {
            const currentDelay = this.getDelayForModel(model);
            const baseDelay = this.getBaseDelayForModel(model);
            const minDelay = Math.max(this.MIN_DELAY_MS, baseDelay * 0.3); // Minimum 30% du délai de base

            const newDelay = Math.max(minDelay, Math.round(currentDelay * this.SUCCESS_REDUCTION_FACTOR));

            if (newDelay < currentDelay) {
                adaptiveDelays.set(model, newDelay);
                this._saveAdaptiveDelays();
            }

            // Reset le compteur après adaptation
            successStreak.set(model, 0);
        }
    },

    /**
     * Enregistre une erreur 429 et augmente le délai.
     * @param {string} model - Nom du modèle
     * @param {string} [errorMessage] - Message d'erreur pour extraire retry-after
     */
    markError429(model, errorMessage = '') {
        // Reset le compteur de succès
        successStreak.set(model, 0);

        // Extraire le temps suggéré par l'API si disponible
        const suggestedWait = this.extractRetryAfter(errorMessage);

        const currentDelay = this.getDelayForModel(model);
        const baseDelay = this.getBaseDelayForModel(model);
        const maxDelay = baseDelay * 5; // Maximum 5x le délai de base

        let newDelay;
        if (suggestedWait && suggestedWait > currentDelay) {
            // Utiliser le temps suggéré + marge
            newDelay = Math.min(maxDelay, suggestedWait + 1000);
        } else {
            // Doubler le délai
            newDelay = Math.min(maxDelay, Math.round(currentDelay * this.ERROR_INCREASE_FACTOR));
        }

        adaptiveDelays.set(model, newDelay);
        this._saveAdaptiveDelays();
    },

    /**
     * Alias pour markSuccess (compatibilité)
     * @param {string} model - Nom du modèle
     */
    markRequest(model) {
        this.markSuccess(model);
    },

    /**
     * Réinitialise le timestamp d'un modèle ou de tous les modèles.
     * @param {string} [model] - Nom du modèle (tous si non spécifié)
     */
    reset(model = null) {
        if (model) {
            lastRequestTime.delete(model);
            successStreak.delete(model);
        } else {
            lastRequestTime.clear();
            successStreak.clear();
        }
    },

    /**
     * Réinitialise les délais adaptatifs aux valeurs par défaut.
     * @param {string} [model] - Nom du modèle (tous si non spécifié)
     */
    resetAdaptiveDelays(model = null) {
        if (model) {
            adaptiveDelays.delete(model);
        } else {
            adaptiveDelays.clear();
        }
        successStreak.clear();
        this._saveAdaptiveDelays();
    },

    /**
     * Extrait le temps d'attente suggéré d'un message d'erreur 429.
     * @param {string} errorMessage - Message d'erreur de l'API
     * @returns {number|null} Temps en millisecondes, ou null si non trouvé
     */
    extractRetryAfter(errorMessage) {
        // Pattern: "Please retry in 3.045887509s"
        const match = errorMessage.match(/retry in (\d+\.?\d*)s/i);
        if (match) {
            const seconds = parseFloat(match[1]);
            // Ajouter 500ms de marge de sécurité
            return Math.ceil((seconds + 0.5) * 1000);
        }
        return null;
    },

    /**
     * Attend le temps suggéré par l'API en cas d'erreur 429.
     * @param {string} errorMessage - Message d'erreur de l'API
     * @param {Function} [onWait] - Callback appelé avec le temps d'attente
     * @returns {Promise<boolean>} true si on a attendu, false sinon
     */
    async waitForRetryAfter(errorMessage, onWait = null) {
        const waitTime = this.extractRetryAfter(errorMessage);

        if (waitTime && waitTime < 120000) { // Max 2 minutes

            if (onWait) {
                onWait(waitTime);
            }

            await this.sleep(waitTime);
            return true;
        }

        return false;
    },

    /**
     * Estime le temps total pour générer N appréciations.
     * @param {number} count - Nombre d'appréciations à générer
     * @param {string} [model] - Modèle à utiliser
     * @returns {Object} Estimation {totalMs, totalMinutes, perItemMs}
     */
    estimateTime(count, model = null) {
        const targetModel = model || appState.currentAIModel;
        const delay = this.getDelayForModel(targetModel);
        const generationTime = 2000; // ~2s de génération par requête

        const perItemMs = delay + generationTime;
        const totalMs = count * perItemMs;
        const totalMinutes = totalMs / 60000;

        return {
            totalMs,
            totalMinutes: Math.ceil(totalMinutes * 10) / 10,
            perItemMs,
            delayMs: delay
        };
    },

    /**
     * Retourne les statistiques actuelles du rate limiter.
     * @returns {Object} Stats {model, currentDelay, baseDelay, successStreak, isAdapted}
     */
    getStats(model = null) {
        const targetModel = model || appState.currentAIModel;
        const currentDelay = this.getDelayForModel(targetModel);
        const baseDelay = this.getBaseDelayForModel(targetModel);

        return {
            model: targetModel,
            currentDelay,
            baseDelay,
            successStreak: successStreak.get(targetModel) || 0,
            isAdapted: adaptiveDelays.has(targetModel),
            adaptationRatio: (currentDelay / baseDelay * 100).toFixed(0) + '%'
        };
    },

    /**
     * Formate le temps restant pour affichage.
     * @param {number} ms - Temps en millisecondes
     * @returns {string} Format lisible (ex: "2 min 30 sec" ou "45 sec")
     */
    formatTime(ms) {
        const totalSeconds = Math.ceil(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        if (minutes > 0) {
            return `${minutes} min ${seconds > 0 ? seconds + ' sec' : ''}`.trim();
        }
        return `${seconds} sec`;
    },

    /**
     * Utilitaire de pause interruptible.
     * @param {number} ms - Durée en millisecondes
     * @param {AbortSignal} [signal] - Signal pour interrompre la pause
     * @returns {Promise<void>}
     */
    sleep(ms, signal = null) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                return reject(new DOMException('Aborted', 'AbortError'));
            }

            const timeoutId = setTimeout(resolve, ms);

            if (signal) {
                const abortHandler = () => {
                    clearTimeout(timeoutId);
                    reject(new DOMException('Aborted', 'AbortError'));
                };
                signal.addEventListener('abort', abortHandler, { once: true });
            }
        });
    },

    /**
     * Sauvegarde les délais adaptatifs en localStorage.
     * @private
     */
    _saveAdaptiveDelays() {
        try {
            const data = Object.fromEntries(adaptiveDelays);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('[RateLimiter] Impossible de sauvegarder les délais adaptatifs:', e);
        }
    },

    /**
     * Charge les délais adaptatifs depuis localStorage.
     * @private
     */
    _loadAdaptiveDelays() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                Object.entries(data).forEach(([model, delay]) => {
                    adaptiveDelays.set(model, delay);
                });
            }
        } catch (e) {
            console.warn('[RateLimiter] Impossible de charger les délais adaptatifs:', e);
        }
    }
};

// Auto-initialisation
RateLimiter.init();
