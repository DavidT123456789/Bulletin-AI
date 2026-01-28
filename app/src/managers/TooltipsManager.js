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
        if (_tippyInstances && _tippyInstances.length > 0) {
            _tippyInstances.forEach(instance => {
                if (instance && typeof instance.destroy === 'function') {
                    instance.destroy();
                }
            });
            _tippyInstances = [];
        }

        // Créer les nouvelles instances si Tippy.js est disponible
        if (window.tippy) {
            _tippyInstances = window.tippy('[data-tooltip]', {
                content(reference) {
                    return reference.getAttribute('data-tooltip');
                },
                appendTo: () => document.body,
                theme: 'custom-theme',
                animation: 'shift-away',
                arrow: false,
                /* Pas de flèche (design épuré) */
                delay: [400, 0],
                /* Délai de 400ms avant apparition */
                duration: [300, 200],
                allowHTML: true,
                interactive: false,
                hideOnClick: true,

                trigger: (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ? 'manual' : 'mouseenter', // 'manual' for touch to avoid "sticky hover", 'mouseenter' for mouse
                touch: ['hold', 500], // Show on long press (500ms)

                onShow(instance) {
                    // Ne pas afficher si les tooltips sont temporairement ignorés
                    if (_isIgnoringTooltips) {
                        return false;
                    }

                    // Éviter l'affichage pour focus non-visible (accessibilité)
                    if (instance.state.isFocused && !instance.reference.matches(':focus-visible')) {
                        return false;
                    }
                    return true;
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
            const instance = window.tippy(element, {
                content: content,
                appendTo: () => document.body,
                theme: 'custom-theme',
                animation: 'fade',
                duration: 200,
                allowHTML: true,
                interactive: false,
                hideOnClick: true,
                trigger: (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ? 'manual' : 'mouseenter',
                touch: ['hold', 500],
                onShow(inst) {
                    if (_isIgnoringTooltips) return false;
                    if (inst.state.isFocused && !inst.reference.matches(':focus-visible')) return false;
                    return true;
                }
            });
            _tippyInstances.push(instance);
        }
    },

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
