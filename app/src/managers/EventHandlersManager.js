/**
 * @fileoverview Gestionnaire des interactions UI et événements divers.
 * 
 * Ce module regroupe la logique de gestion des événements utilisateur qui ne 
 * relèvent pas spécifiquement d'un autre manager métier (comme l'import ou les paramètres).
 * Il allège AppManager.js en prenant en charge les clics sur les cartes, 
 * la navigation clavier, et les filtres.
 * 
 * @module managers/EventHandlersManager
 */

import { appState } from '../state/State.js';
import { UI } from './UIManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';

/** @type {import('./AppManager.js').App|null} */
let App = null;

export const STAT_FILTER_BUTTON_SELECTOR = '.stat-card[role="button"], .legend-item[role="button"], .detail-item[role="button"], .hist-bar-group[role="button"]';
export const ACTIVE_STAT_FILTER_SELECTOR = '.stat-card.active-filter, .legend-item.active-filter, .detail-item.active-filter, .hist-bar-group.active-filter';

export const EventHandlersManager = {
    STAT_FILTER_BUTTON_SELECTOR,
    ACTIVE_STAT_FILTER_SELECTOR,

    /**
     * Initialise le module avec une référence à l'application principale.
     * @param {Object} appInstance - Instance de l'application principale
     */
    init(appInstance) {
        App = appInstance;
    },

    /**
     * Gère l'input de recherche avec debounce.
     * @param {Event} e - L'événement input
     */
    handleSearchInput(e) {
        // La valeur est lue directement depuis appState.searchQuery dans renderResults
        // FLIP animation is handled in ListViewManager
        AppreciationsManager.renderResults();
    },

    /**
     * Gère le changement de tri.
     * @param {Event} e - L'événement change
     */
    handleSortSelectChange(e) {
        // FLIP animation is handled in ListViewManager
        AppreciationsManager.renderResults();
    },

    /**
     * Gère le clic sur le header du tableau pour trier.
     * @param {HTMLElement} header - Le header cliqué
     */
    handleHeaderSortClick(header) {
        const field = header.dataset.sortField;
        const param = header.dataset.sortParam;
        if (!field) return;

        let direction = 'asc';

        // Toggle direction if same field AND same param
        const isSameSort = appState.sortState.field === field && appState.sortState.param === param;

        if (isSameSort) {
            direction = appState.sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // Default direction for grades/evolution is usually desc (highest first)
            if (['grade', 'evolution', 'status'].includes(field)) direction = 'desc';
        }


        appState.sortState = { field, direction, param };

        // FLIP animation is now handled in ListViewManager
        AppreciationsManager.renderResults();
    },

    /**
     * Gère le changement de système de période (Trimestre/Semestre).
     * @param {Event} e - L'événement change
     */
    handlePeriodSystemChange(e) {
        appState.periodSystem = e.target.value;
        appState.currentPeriod = UI.getPeriods()[0];
        appState.activeStatFilter = null;

        if (appState.sortState?.field === 'grade') {
            appState.sortState.param = appState.currentPeriod;
        }

        UI.updatePeriodSystemUI();
        UI.updateSettingsPromptFields();

        // MàJ des sliders si on change de système (bien que config globale pour l'instant)
        UI.updateSettingsFields();
        document.dispatchEvent(new CustomEvent('periodChanged', {
            detail: { period: appState.currentPeriod }
        }));
        AppreciationsManager.renderResults();
    },

    /**
     * Gère le clic sur une carte de statistique pour filtrer.
     * @param {HTMLElement|null} element - L'élément cliqué ou null pour reset
     * @param {Object} [options={}] - Options d'origine (ex: { causedByHistory: true })
     */
    handleStatFilterClick(element, options = {}) {
        const statId = element ? (element.dataset.filterId || element.dataset.statId) : null;
        const isCurrentlyActive = Boolean(
            element && (element.classList.contains('active-filter') || (statId && appState.activeStatFilter === statId))
        );

        if (element && !isCurrentlyActive && (!statId || element.closest('#evolutionCard.is-empty') || element.dataset.count === '0' || element.getAttribute('aria-disabled') === 'true')) {
            return;
        }

        if (!element || isCurrentlyActive) {
            appState.activeStatFilter = null;
            if (document.activeElement?.closest?.('.stats-container')) {
                document.activeElement.blur?.();
            }
        } else {
            appState.activeStatFilter = statId;
        }

        UI.updateActiveFilterInfo(options);

        // FLIP animation is handled in ListViewManager
        AppreciationsManager.renderResults();
    }
};
