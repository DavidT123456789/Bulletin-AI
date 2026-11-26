/**
 * @fileoverview Rate Limiter RÉACTIF pour les requêtes API.
 * 
 * Stratégie : pas de délai par défaut, on réagit uniquement aux erreurs 429.
 * L'API elle-même indique le temps d'attente optimal (retry-after).
 * 
 * Avantages :
 * - Utilisateurs payants : vitesse maximale (0 délai)
 * - Utilisateurs gratuits : 1-2 erreurs 429 puis auto-calibrage
 * - Code simplifié : ~50 lignes au lieu de ~400
 * 
 * @module utils/RateLimiter
 */

/**
 * Délais de backoff par modèle (après erreur 429)
 * @type {Map<string, number>}
 */
const backoffDelays = new Map();

/**
 * Timestamp de la dernière requête par modèle
 * @type {Map<string, number>}
 */
const lastRequestTime = new Map();

/**
 * Module de gestion du rate limiting réactif.
 * @namespace RateLimiter
 */
export const RateLimiter = {
    /**
     * Délai minimum entre requêtes (évite le spam même sans 429)
     */
    MIN_DELAY_MS: 200,

    /**
     * Réduction du backoff après chaque succès (ms)
     */
    SUCCESS_REDUCTION_MS: 1000,

    /**
     * Calcule le temps d'attente nécessaire.
     * @param {string} model - Nom du modèle
     * @returns {number} Temps d'attente en ms (0 si aucune attente)
     */
    getWaitTime(model) {
        const backoff = backoffDelays.get(model) || 0;
        const lastTime = lastRequestTime.get(model) || 0;
        const elapsed = Date.now() - lastTime;

        // Si backoff actif (après erreur 429), l'appliquer entièrement
        if (backoff > 0) {
            return backoff;
        }

        // Sinon, délai minimum entre requêtes consécutives
        if (lastTime > 0) {
            return Math.max(0, this.MIN_DELAY_MS - elapsed);
        }

        return 0;
    },

    /**
     * Attend si nécessaire avant une requête.
     * @param {string} model - Nom du modèle
     * @param {Function} [onWait] - Callback avec le temps d'attente (pour UI)
     * @param {AbortSignal} [signal] - Signal pour annulation
     * @returns {Promise<void>}
     */
    async waitIfNeeded(model, onWait = null, signal = null) {
        const waitTime = this.getWaitTime(model);

        if (waitTime > 0) {
            if (onWait) {
                onWait(waitTime);
            }
            await this.sleep(waitTime, signal);
        }

        // Enregistrer le timestamp
        lastRequestTime.set(model, Date.now());
    },

    /**
     * Signale un succès et réduit progressivement le backoff.
     * @param {string} model - Nom du modèle
     */
    markSuccess(model) {
        lastRequestTime.set(model, Date.now());

        // Réduire le backoff après chaque succès
        const currentBackoff = backoffDelays.get(model) || 0;
        if (currentBackoff > 0) {
            const newBackoff = Math.max(0, currentBackoff - this.SUCCESS_REDUCTION_MS);
            if (newBackoff > 0) {
                backoffDelays.set(model, newBackoff);
            } else {
                backoffDelays.delete(model);
            }
        }
    },

    /**
     * Gère une erreur 429 et configure le backoff.
     * @param {string} model - Nom du modèle
     * @param {string} [errorMessage] - Message d'erreur (pour extraire retry-after)
     * @returns {number} Temps de backoff configuré (ms)
     */
    markError429(model, errorMessage = '') {
        // Extraire le temps suggéré par l'API
        const suggestedWait = this.extractRetryAfter(errorMessage);

        // Utiliser le temps suggéré ou un défaut raisonnable
        const backoff = suggestedWait || 5000;

        backoffDelays.set(model, backoff);
        return backoff;
    },

    /**
     * Extrait le temps "retry-after" d'un message d'erreur 429.
     * @param {string} errorMessage - Message d'erreur
     * @returns {number|null} Temps en ms, ou null si non trouvé
     */
    extractRetryAfter(errorMessage) {
        // Pattern: "Please retry in 3.045s" ou "retry in 5.5s"
        const match = errorMessage.match(/retry in ([\d.]+)s/i);
        if (match) {
            const seconds = parseFloat(match[1]);
            // Ajouter 500ms de marge de sécurité
            return Math.ceil((seconds + 0.5) * 1000);
        }
        return null;
    },

    /**
     * Attend le temps suggéré par l'API en cas d'erreur 429.
     * @param {string} errorMessage - Message d'erreur
     * @param {Function} [onWait] - Callback avec le temps d'attente
     * @param {AbortSignal} [signal] - Signal pour annulation
     * @returns {Promise<boolean>} true si on a attendu
     */
    async waitForRetryAfter(errorMessage, onWait = null, signal = null) {
        const waitTime = this.extractRetryAfter(errorMessage);

        if (waitTime && waitTime < 120000) { // Max 2 minutes
            if (onWait) {
                onWait(waitTime);
            }
            await this.sleep(waitTime, signal);
            return true;
        }

        return false;
    },

    /**
     * Estime le temps pour N requêtes (basé sur le backoff actuel).
     * @param {number} count - Nombre de requêtes
     * @param {string} [model] - Modèle cible
     * @returns {Object} {totalMs, totalMinutes, perItemMs, hasBackoff}
     */
    estimateTime(count, model = null) {
        const backoff = model ? (backoffDelays.get(model) || 0) : 0;
        const generationTime = 2000; // ~2s par génération

        // Si pas de backoff, estimation optimiste
        const perItemMs = Math.max(this.MIN_DELAY_MS, backoff) + generationTime;
        const totalMs = count * perItemMs;

        return {
            totalMs,
            totalMinutes: Math.ceil((totalMs / 60000) * 10) / 10,
            perItemMs,
            hasBackoff: backoff > 0
        };
    },

    /**
     * Formate un temps en format lisible.
     * @param {number} ms - Temps en millisecondes
     * @returns {string} Format "X min Y sec" ou "X sec"
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
     * Réinitialise le backoff d'un modèle ou de tous.
     * @param {string} [model] - Modèle spécifique, ou tous si omis
     */
    reset(model = null) {
        if (model) {
            backoffDelays.delete(model);
            lastRequestTime.delete(model);
        } else {
            backoffDelays.clear();
            lastRequestTime.clear();
        }
    },

    /**
     * Retourne les stats actuelles (pour debug/UI).
     * @param {string} [model] - Modèle cible
     * @returns {Object} {model, backoff, hasBackoff}
     */
    getStats(model) {
        const backoff = backoffDelays.get(model) || 0;
        return {
            model,
            backoff,
            hasBackoff: backoff > 0,
            backoffFormatted: backoff > 0 ? this.formatTime(backoff) : 'aucun'
        };
    },

    /**
     * Pause interruptible.
     * @param {number} ms - Durée en ms
     * @param {AbortSignal} [signal] - Signal d'annulation
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
    }
};
