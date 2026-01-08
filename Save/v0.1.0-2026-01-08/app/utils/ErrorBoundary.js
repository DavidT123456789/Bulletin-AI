/**
 * @fileoverview Error Boundary global pour l'application Bulletin AI.
 * Capture les erreurs non gérées et les rejets de promesses.
 * @module utils/ErrorBoundary
 */

// Mode développement pour logs détaillés
const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

/**
 * Historique des erreurs pour éviter les doublons
 * @type {Set<string>}
 */
const errorHistory = new Set();

/**
 * Configuration de l'error boundary
 */
const CONFIG = {
    maxErrorHistory: 50,
    showUserNotification: true,
    groupSimilarErrors: true,
    errorCooldownMs: 5000, // Évite les notifications répétées pour la même erreur
};

/**
 * Crée une empreinte unique pour une erreur
 * @param {Error} error
 * @returns {string}
 */
function getErrorFingerprint(error) {
    return `${error.name}:${error.message}:${error.stack?.split('\n')[1] || ''}`;
}

/**
 * Formatte une erreur pour l'affichage
 * @param {Error|string} error
 * @param {string} context
 * @returns {Object}
 */
function formatError(error, context) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    return {
        name: errorObj.name || 'Error',
        message: errorObj.message || 'Erreur inconnue',
        stack: errorObj.stack || '',
        context,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
    };
}

/**
 * Affiche une notification d'erreur à l'utilisateur (si UI disponible)
 * @param {Object} formattedError
 */
function notifyUser(formattedError) {
    // Essayer d'utiliser le système de notification de l'app
    if (window.UI?.showNotification) {
        window.UI.showNotification(
            `Une erreur est survenue. ${IS_DEV ? formattedError.message : 'Veuillez réessayer.'}`,
            'error'
        );
    } else if (IS_DEV) {
        // En dev, afficher l'erreur même si UI pas prête
        console.error('[ErrorBoundary] UI non disponible pour notification');
    }
}

/**
 * Handler central des erreurs
 * @param {Error|string} error
 * @param {string} context
 */
function handleError(error, context) {
    const formattedError = formatError(error, context);
    const fingerprint = getErrorFingerprint(error instanceof Error ? error : new Error(String(error)));

    // Éviter les doublons
    if (CONFIG.groupSimilarErrors && errorHistory.has(fingerprint)) {
        return;
    }

    // Ajouter au historique avec nettoyage automatique
    errorHistory.add(fingerprint);
    if (errorHistory.size > CONFIG.maxErrorHistory) {
        const firstKey = errorHistory.values().next().value;
        errorHistory.delete(firstKey);
    }

    // Supprimer l'empreinte après le cooldown
    setTimeout(() => errorHistory.delete(fingerprint), CONFIG.errorCooldownMs);

    // Log structuré
    console.group(`🚨 [ErrorBoundary] ${context}`);
    console.error('Message:', formattedError.message);
    if (IS_DEV) {
        console.error('Stack:', formattedError.stack);
        console.table({
            Timestamp: formattedError.timestamp,
            URL: formattedError.url,
        });
    }
    console.groupEnd();

    // Notification utilisateur (sauf pour certaines erreurs silencieuses)
    const silentErrors = ['ResizeObserver', 'Script error'];
    const isSilent = silentErrors.some(s => formattedError.message.includes(s));

    if (CONFIG.showUserNotification && !isSilent) {
        notifyUser(formattedError);
    }

    // Hook pour analytics/monitoring externe (Sentry, LogRocket, etc.)
    if (window.__errorReporter && typeof window.__errorReporter === 'function') {
        try {
            window.__errorReporter(formattedError);
        } catch (e) {
            console.error('[ErrorBoundary] Échec du report externe:', e);
        }
    }
}

/**
 * Initialise les handlers d'erreurs globaux
 */
export function initErrorBoundary() {
    // Handler pour erreurs JavaScript globales
    window.onerror = function (message, source, lineno, colno, error) {
        handleError(
            error || message,
            `Global Error at ${source}:${lineno}:${colno}`
        );
        // Retourner true empêche l'affichage de l'erreur dans la console (optionnel)
        return false;
    };

    // Handler pour les rejets de promesses non gérés
    window.onunhandledrejection = function (event) {
        handleError(
            event.reason || 'Promise rejection sans raison',
            'Unhandled Promise Rejection'
        );
    };

    // Log d'initialisation en dev

}

/**
 * Wrapper pour exécuter du code avec capture d'erreur
 * @param {Function} fn - Fonction à exécuter
 * @param {string} context - Contexte pour le log
 * @returns {*} Résultat de la fonction ou undefined en cas d'erreur
 */
export function safeExecute(fn, context = 'safeExecute') {
    try {
        return fn();
    } catch (error) {
        handleError(error, context);
        return undefined;
    }
}

/**
 * Wrapper async pour exécuter du code avec capture d'erreur
 * @param {Function} fn - Fonction async à exécuter
 * @param {string} context - Contexte pour le log
 * @returns {Promise<*>} Résultat de la fonction ou undefined en cas d'erreur
 */
export async function safeExecuteAsync(fn, context = 'safeExecuteAsync') {
    try {
        return await fn();
    } catch (error) {
        handleError(error, context);
        return undefined;
    }
}
