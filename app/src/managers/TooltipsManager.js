/**
 * @fileoverview Gestionnaire des tooltips (Tippy.js) de l'interface utilisateur.
 * 
 * Ce module centralise la configuration et la gestion des tooltips :
 * - Initialisation de Tippy.js avec thème personnalisé
 * - Destruction et recréation des instances
 * - Gestion du focus accessible
 * 
 * @module managers/TooltipsManager
 */

/**
 * Stockage des instances Tippy.js actives.
 * @type {Array}
 */
let _tippyInstances = [];

/**
 * Flag pour ignorer temporairement les tooltips (pendant les modales par ex.)
 * @type {boolean}
 */
let _isIgnoringTooltips = false;

// Tracking global pour filtrer les "sticky hovers" sur mobile
let _lastTouchTime = 0;
document.addEventListener('touchstart', () => {
    _lastTouchTime = Date.now();
}, { passive: true });

/**
 * Génère la configuration commune pour Tippy
 * pour assurer la cohérence et gérer le tactile.
 * @returns {Object} Configuration Tippy
 */
const getCommonTippyConfig = () => {
    return {
        appendTo: () => document.body,
        theme: 'custom-theme',
        animation: 'shift-away',
        arrow: false,
        delay: [400, 0],
        duration: [300, 200],
        allowHTML: true,
        interactive: false,
        hideOnClick: true,

        // Sur mobile : le sticky hover est le fléau.
        // On utilise 'mouseenter' par défaut pour desktop/hybrid.
        // On gère l'annulation du sticky hover via onShow et le timestamp tactile.
        trigger: 'mouseenter',

        // Active le "Long Press" pour afficher le tooltip sur tactile
        touch: ['hold', 500],

        onShow(instance) {
            if (_isIgnoringTooltips) return false;

            // Accessibilité : pas de tooltip si focus invisible
            if (instance.state.isFocused && !instance.reference.matches(':focus-visible')) return false;

            // PROTECTION TACTILE :
            // Si une touche a eu lieu il y a moins de 500ms, c'est un TAP rapide.
            // Sur un tap rapide, le navigateur émet souvent 'mouseenter' (sticky hover).
            // On bloque l'affichage dans ce cas.
            // Le "Long Press" (géré par Tippy via l'option 'touch') se déclenchera après 500ms,
            // donc à ce moment-là, le delta sera > 500ms, et ça passera.
            const now = Date.now();
            if (now - _lastTouchTime < 500) {
                return false;
            }

            return true;
        }
    };
};

/**
 * Module de gestion des tooltips.
 * @namespace TooltipsUI
 */
export const TooltipsUI = {
    /**
     * Getter pour le flag d'ignorance des tooltips.
     * @returns {boolean}
     */
    get isIgnoringTooltips() {
        return _isIgnoringTooltips;
    },

    /**
     * Setter pour le flag d'ignorance des tooltips.
     * @param {boolean} value
     */
    set isIgnoringTooltips(value) {
        _isIgnoringTooltips = value;
    },

    /**
     * Initialise ou réinitialise tous les tooltips de la page.
     * Détruit les instances existantes avant de créer les nouvelles.
     */

    initTooltips() {
        // Détruire les instances existantes
        this.destroyTooltips();

        // Créer les nouvelles instances si Tippy.js est disponible
        if (window.tippy) {
            const commonConfig = getCommonTippyConfig();

            _tippyInstances = window.tippy('[data-tooltip]', {
                ...commonConfig,
                content(reference) {
                    return reference.getAttribute('data-tooltip');
                }
            });
        }
    },

    /**
     * Détruit tous les tooltips actifs.
     */
    destroyTooltips() {
        if (_tippyInstances && _tippyInstances.length > 0) {
            _tippyInstances.forEach(instance => {
                if (instance && typeof instance.destroy === 'function') {
                    instance.destroy();
                }
            });
            _tippyInstances = [];
        }
    },

    /**
     * Retourne le nombre d'instances de tooltips actives.
     * @returns {number}
     */
    getInstanceCount() {
        return _tippyInstances ? _tippyInstances.length : 0;
    },

    /**
     * Met à jour le contenu d'un tooltip existant sans réinitialiser tous les tooltips.
     * @param {HTMLElement} element - L'élément dont le tooltip doit être mis à jour
     * @param {string} content - Le nouveau contenu du tooltip
     */
    updateTooltip(element, content) {
        if (!element || !window.tippy) return;

        // Mettre à jour l'attribut data-tooltip
        element.dataset.tooltip = content;

        // Mettre à jour l'instance Tippy si elle existe
        if (element._tippy) {
            element._tippy.setContent(content);
        } else {
            // Créer une nouvelle instance si elle n'existe pas
            const commonConfig = getCommonTippyConfig();

            const instance = window.tippy(element, {
                ...commonConfig,
                content: content,
                animation: 'fade', // Spécifique pour update ? Gardons 'fade' comme dans l'original ou harmonisons ? L'original avait 'fade', init avait 'shift-away'. Je garde 'fade' pour minimiser changement visuel inattendu, ou je peux harmoniser. L'original avait 'fade' ici.
                duration: 200
            });
            _tippyInstances.push(instance);
        }
    },

    /**
     * Génère la configuration commune pour Tippy
     * pour assurer la cohérence et gérer le tactile.
     * @returns {Object} Configuration Tippy
     */


    /**
     * Nettoie (détruit) les tooltips attachés aux éléments à l'intérieur d'un conteneur spécifique.
     * Utile avant de remplacer le innerHTML d'un conteneur.
     * @param {HTMLElement} container - Le conteneur à nettoyer
     */
    cleanupTooltipsIn(container) {
        if (!container) return;

        // 1. Trouver les éléments avec propriété _tippy (instances directes)
        const elementsWithTippy = container.querySelectorAll('*');
        elementsWithTippy.forEach(el => {
            if (el._tippy) {
                // Retirer de la liste globale si présent
                const idx = _tippyInstances.indexOf(el._tippy);
                if (idx > -1) {
                    _tippyInstances.splice(idx, 1);
                }
                // Détruire l'instance
                el._tippy.destroy();
            }
        });
    }
};
