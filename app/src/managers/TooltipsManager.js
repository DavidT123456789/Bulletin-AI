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

import { ModalUI } from './ModalUIManager.js';

/**
 * Stockage des instances Tippy.js actives.
 * @type {Array}
 */
let _tippyInstances = [];

/**
 * Génère la configuration commune pour Tippy
 * pour assurer la cohérence et gérer le tactile.
 * @returns {Object} Configuration Tippy
 */
const getCommonTippyConfig = () => {
    return {
        appendTo: () => document.body,
        theme: 'custom-theme',
        animation: 'organic-scale',
        arrow: false,
        delay: [150, 0],
        duration: [250, 150],
        allowHTML: true,
        interactive: false,
        hideOnClick: true,
        trigger: 'mouseenter',
        touch: ['hold', 500],
        zIndex: 10001,
        popperOptions: {
            strategy: 'fixed'
        },
        onTrigger(instance, event) {
            if (ModalUI._isIgnoringTooltips || (event?.touches && event.touches.length > 1)) {
                instance.hide?.();
            }
        },
        onShow(instance) {
            // Use centralized flag from ModalUI for tooltip suppression
            if (ModalUI._isIgnoringTooltips) return false;
            // Accessibilité : pas de tooltip si focus invisible
            if (instance.state.isFocused && !instance.reference.matches(':focus-visible')) return false;
            // Prevent parent tooltip from showing if a child [data-tooltip] is currently hovered
            if (typeof instance.reference?.querySelector === 'function' && instance.reference.querySelector('[data-tooltip]:hover')) {
                return false;
            }
            // Hide any other visible tooltip so two tooltips never overlap
            if (_tippyInstances && _tippyInstances.length > 0) {
                _tippyInstances.forEach(other => {
                    if (other && other !== instance && other.state?.isVisible && typeof other.hide === 'function') {
                        other.hide();
                    }
                });
            }
            if (typeof instance.setProps === 'function' && typeof instance.reference?.getBoundingClientRect === 'function') {
                instance.setProps({
                    getReferenceClientRect: () => instance.reference.getBoundingClientRect()
                });
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
        return ModalUI._isIgnoringTooltips;
    },

    /**
     * Setter pour le flag d'ignorance des tooltips.
     * @param {boolean} value
     */
    set isIgnoringTooltips(value) {
        ModalUI._isIgnoringTooltips = value;
    },

    /**
     * Initialise ou réinitialise les tooltips de la page ou d'un conteneur spécifique.
     * - Sans argument : détruit et recrée toutes les instances de la page.
     * - Avec `container` : nettoie uniquement les tooltips du conteneur (et les instances détachées)
     *   puis initialise uniquement les éléments `[data-tooltip]` de ce conteneur.
     * @param {HTMLElement|null} [container=null] - Conteneur optionnel pour limiter la portée DOM
     */
    initTooltips(container = null) {
        if (container && typeof container.querySelectorAll === 'function') {
            this.cleanupTooltipsIn(container);

            if (window.tippy) {
                const commonConfig = getCommonTippyConfig();
                const targets = Array.from(container.querySelectorAll('[data-tooltip]'));
                if (typeof container.hasAttribute === 'function' && container.hasAttribute('data-tooltip')) {
                    targets.unshift(container);
                }
                if (targets.length > 0) {
                    const created = window.tippy(targets, {
                        ...commonConfig,
                        content(reference) {
                            return reference.getAttribute('data-tooltip');
                        }
                    });
                    const createdArr = Array.isArray(created) ? created : (created ? [created] : []);
                    _tippyInstances.push(...createdArr);
                }
            }
            return;
        }

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
     * Masque immédiatement tous les tooltips actuellement affichés.
     */
    hideAll() {
        if (typeof window.tippy?.hideAll === 'function') {
            window.tippy.hideAll({ duration: 0 });
            return;
        }
        if (_tippyInstances && _tippyInstances.length > 0) {
            _tippyInstances.forEach(instance => {
                if (instance?.state?.isVisible && typeof instance.hide === 'function') {
                    instance.hide();
                }
            });
        }
    },

    /**
     * Met à jour le contenu d'un tooltip existant sans réinitialiser tous les tooltips.
     * @param {HTMLElement} element - L'élément dont le tooltip doit être mis à jour
     * @param {string} content - Le nouveau contenu du tooltip
     */
    updateTooltip(element, content) {
        if (!element) return;

        // Mettre à jour l'attribut data-tooltip
        element.dataset.tooltip = content;
        element.setAttribute?.('data-tooltip', content);

        if (!window.tippy) return;

        // Mettre à jour l'instance Tippy si elle existe
        if (element._tippy) {
            element._tippy.setContent(content);
        } else {
            // Créer une nouvelle instance si elle n'existe pas
            const commonConfig = getCommonTippyConfig();

            const instance = window.tippy(element, {
                ...commonConfig,
                content: content
            });
            _tippyInstances.push(instance);
        }
    },

    /**
     * Nettoie (détruit) les tooltips attachés aux éléments à l'intérieur d'un conteneur spécifique,
     * ainsi que les instances orphelines détachées du DOM.
     * @param {HTMLElement} container - Le conteneur à nettoyer
     */
    cleanupTooltipsIn(container) {
        if (!container || typeof container.querySelectorAll !== 'function') return;

        const destroyElementTippy = (el) => {
            if (el && el._tippy) {
                const idx = _tippyInstances.indexOf(el._tippy);
                if (idx > -1) {
                    _tippyInstances.splice(idx, 1);
                }
                el._tippy.destroy?.();
            }
        };

        destroyElementTippy(container);
        container.querySelectorAll('[data-tooltip]').forEach(destroyElementTippy);

        if (_tippyInstances && _tippyInstances.length > 0) {
            _tippyInstances = _tippyInstances.filter(inst => {
                if (!inst) return false;
                const ref = inst.reference;
                if (ref && (ref === container || container.contains?.(ref) || ref.isConnected === false)) {
                    inst.destroy?.();
                    return false;
                }
                return true;
            });
        }
    }
};
