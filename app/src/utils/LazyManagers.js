/**
 * @fileoverview Chargeur paresseux (code-splitting) des gestionnaires de vues secondaires.
 * Centralise la déduplication des promesses en vol, l'initialisation idempotente
 * et l'exposition globale optionnelle pour les ponts legacy.
 * @module utils/LazyManagers
 */

const _loadedManagers = new Map();
const _pendingLoads = new Map();

/**
 * Crée un chargeur asynchrone dédupliqué et idempotent pour un manager donné.
 * @param {string} globalKey - Nom de propriété sur `window` (ex. 'ImportWizardManager')
 * @param {Function} importFn - Fonction retournant Promise<Object> (module manager)
 * @returns {Function} () => Promise<Object>
 */
export function createLazyManagerLoader(globalKey, importFn) {
    return () => {
        if (_loadedManagers.has(globalKey)) {
            return Promise.resolve(_loadedManagers.get(globalKey));
        }
        if (_pendingLoads.has(globalKey)) {
            return _pendingLoads.get(globalKey);
        }

        const promise = importFn()
            .then((manager) => {
                if (!manager) {
                    throw new Error(`[LazyManagers] Module introuvable pour ${globalKey}`);
                }
                if (typeof window !== 'undefined') {
                    window[globalKey] = manager;
                }
                if (typeof manager.init === 'function' && !manager._lazyInitialized) {
                    manager._lazyInitialized = true;
                    manager.init();
                }
                _loadedManagers.set(globalKey, manager);
                _pendingLoads.delete(globalKey);
                return manager;
            })
            .catch((error) => {
                _pendingLoads.delete(globalKey);
                throw error;
            });

        _pendingLoads.set(globalKey, promise);
        return promise;
    };
}

/**
 * Réinitialise le cache interne (usage tests unitaires uniquement).
 * @param {string} [globalKey]
 */
export function _resetLazyManagersForTests(globalKey) {
    if (globalKey) {
        _loadedManagers.delete(globalKey);
        _pendingLoads.delete(globalKey);
        return;
    }
    _loadedManagers.clear();
    _pendingLoads.clear();
}

export const loadImportWizard = createLazyManagerLoader(
    'ImportWizardManager',
    () => import('../managers/ImportWizardManager.js').then((m) => m.ImportWizardManager)
);

export const loadTrombinoscope = createLazyManagerLoader(
    'TrombinoscopeManager',
    () => import('../managers/TrombinoscopeManager.js').then((m) => m.TrombinoscopeManager)
);

export const loadClassDashboard = createLazyManagerLoader(
    'ClassDashboardManager',
    () => import('../managers/ClassDashboardManager.js').then((m) => m.ClassDashboardManager)
);

const DEFAULT_LOAD_ERROR_MESSAGE =
    'Impossible de charger ce module. Vérifiez votre connexion ou rechargez la page.';

/**
 * Charge un manager paresseusement puis exécute une action avec retour utilisateur
 * en cas d'échec réseau/chunk, sans masquer d'éventuelles erreurs applicatives dans l'action.
 * @param {Function} loaderFn - Fonction de chargement retournant Promise<Object>
 * @param {Function} [onLoaded] - Callback exécuté avec l'instance chargée
 * @param {Object} [options]
 * @param {boolean} [options.silent=false] - Supprime la notification UI en cas d'échec
 * @param {string} [options.errorMessage] - Message d'erreur utilisateur personnalisé
 * @returns {Promise<*>} Résultat de `onLoaded`, ou `null` si le chargement échoue
 */
export async function withLazyManager(loaderFn, onLoaded, options = {}) {
    const {
        silent = false,
        errorMessage = DEFAULT_LOAD_ERROR_MESSAGE
    } = options;

    let manager;
    try {
        manager = await loaderFn();
    } catch (error) {
        console.error('[LazyManagers] Échec de chargement :', error);
        if (!silent && typeof window !== 'undefined') {
            window.UI?.showNotification?.(errorMessage, 'error');
        }
        return null;
    }

    if (!manager) return null;
    if (typeof onLoaded === 'function') {
        return await onLoaded(manager);
    }
    return manager;
}

/**
 * Précharge silencieusement un manager au survol ou au focus clavier d'un déclencheur,
 * sans bloquer ni pénaliser la fenêtre de boot initial.
 * @param {HTMLElement|null|undefined} element
 * @param {Function} loaderFn
 */
export function prefetchOnHover(element, loaderFn) {
    if (!element || typeof element.addEventListener !== 'function' || typeof loaderFn !== 'function') {
        return;
    }
    if (element.dataset?.lazyPrefetchBound) return;
    if (element.dataset) {
        element.dataset.lazyPrefetchBound = '1';
    }

    const trigger = () => {
        Promise.resolve(loaderFn()).catch(() => {});
    };

    element.addEventListener('pointerenter', trigger, { once: true, passive: true });
    element.addEventListener('focus', trigger, { once: true, passive: true });
}
