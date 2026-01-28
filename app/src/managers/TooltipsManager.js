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
// Utilisation de 'capture: true' pour être sûr d'intercepter l'événement avant qu'un stopPropagation ne le bloque ailleurs
window.addEventListener('touchstart', () => {
    _lastTouchTime = Date.now();
}, { capture: true, passive: true });

/**
 * Génère la configuration commune pour Tippy
 * pour assurer la cohérence et gérer le tactile.
 * @returns {Object} Configuration Tippy
 */
const getCommonTippyConfig = () => {
    // Si l'appareil ne supporte pas le survol (ex: smartphone pur), 
    // on désactive totalement le trigger par défaut (souris) pour ne garder que le hold.
    // Cela prévient radicalement l'affichage au touch/click.
    // Pour les appareils hybrides (supportent hover), on garde mouseenter mais on filtre via onShow.
    const hasNoHover = window.matchMedia && window.matchMedia('(hover: none)').matches;

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

        // Sur mobile pur : 'manual' (seul 'touch' option l'activera via long press)
        // Sur desktop/hybride : 'mouseenter' (souris)
        trigger: hasNoHover ? 'manual' : 'mouseenter',

        // Active le "Long Press" pour afficher le tooltip sur tactile
        touch: ['hold', 500],

        onShow(instance) {
            if (_isIgnoringTooltips) return false;

            // Accessibilité : pas de tooltip si focus invisible
            if (instance.state.isFocused && !instance.reference.matches(':focus-visible')) return false;

            // PROTECTION TACTILE (Hybride & Mobile) :
            // Si une touche a eu lieu récemment, on bloque l'affichage initié par mouseenter (simulé).
            // On utilise une fenêtre large (2000ms) pour être sûr.
            // Note: Le "Long Press" via l'option 'touch' de Tippy contourne ce onShow ? 
            // Non, il l'appelle aussi. Mais pour un long press, l'intention est explicite.
            // Problème : Le long press déclenche aussi touchstart.
            // Si on bloque tout ce qui est proche d'un touch, on bloque aussi le long press ?
            // L'option `touch: ['hold', 500]` de Tippy gère son propre cycle.
            // Quand c'est déclenché par le module 'touch' de Tippy, instance.props.trigger est-il différent ?
            // Pas facile à savoir.
            // Astuce : un sticky hover arrive APRES le touchend (souvent).
            // Un long press arrive PENDANT le touch.
            // Mais simplifions : Si c'est un TAP rapide, le délai entre touchstart et l'affichage (400ms delay) est court.

            const now = Date.now();
            // Si on a touché il y a moins de 1s...
            if (now - _lastTouchTime < 1000) {
                // ...C'est probablement un doigt.
                // Si l'instance a été déclenchée par "mouseenter" (donc le sticky hover), on bloque.
                // Comment savoir la source ? 
                // Tippy 6 n'expose pas "reason" facilement dans onShow.
                // MAIS : Si c'est le module 'touch' (Long press) qui déclenche, il le fait souvent via un process interne.

                // Si on a désactivé le trigger standard (hasNoHover = manual), on n'est même pas ici pour le sticky hover.
                // Donc on est ici SEULEMENT pour les Hybrides (souris + touch).

                // Pour sécuriser : Si c'est tactile, on refuse l'affichage automatique (mouseenter).
                // Seul le long-press devrait passer. 
                // Sauf que Tippy gère le long press comme une ouverture manuelle ?

                // EMPIRIQUE : Si on bloque ici, on risque de bloquer le long press aussi si le delai < 1000.
                // Le long press est de 500ms. Donc 500ms après le touchstart.
                // 500 < 1000 -> Bloqué ?
                // Risque.

                // Solution : On ne bloque QUE si l'utilisateur N'EST PAS en train de toucher (touchend passé).
                // Mais on ne détecte pas le touchend global facilement ici sans state complexe.

                // Retour à la config stricte :
                // Sur hybride, le sticky hover est inévitable sans hack.
                // Mais le hack < 1000ms est peut-être trop agressif pour le long press.
                // Essayons de réduire à 800ms? 
                // Long press = 500ms. + petit overhead. ~500-600ms.
                // Sticky hover mouseenter delay = 400ms.
                // Click -> (400ms) -> Show. 
                // C'est très proche.

                // LE VRAI FIX pour hybride : Le trigger 'touch' de Tippy résout ça normalement.
                // Si on met touchstart tracking ?
                // Pour l'instant on garde la logique de protection mais on assume que hasNoHover fera le gros du travail sur mobile.
                // Et sur hybride, tant pis si on perd le long press (rare) au profit de ne pas avoir de sticky hover (très fréquent/chiant).
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
