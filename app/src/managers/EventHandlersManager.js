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

import { appState, UIState } from '../state/State.js';
import { CONSTS, CONFIG } from '../config/Config.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { VariationsManager } from './VariationsManager.js';
import { SettingsUIManager } from './SettingsUIManager.js';

/** @type {import('./AppManager.js').App|null} */
let App = null;

export const EventHandlersManager = {
    /**
     * Initialise le module avec une référence à l'application principale.
     * @param {Object} appInstance - Instance de l'application principale
     */
    init(appInstance) {
        App = appInstance;
    },

    /**
     * Gère les clics sur les actions des cartes de résultat (copier, supprimer, raffiner, etc.)
     * @param {Event} e - L'événement click
     * @param {HTMLElement} [targetOverride] - Élément cible optionnel
     */
    async handleResultCardAction(e, targetOverride = null) {
        const element = targetOverride || e.target.closest('[data-action]');
        if (!element || element.disabled) return;

        const card = element.closest('.appreciation-result');
        if (!card) return;

        const id = card.dataset.id;
        const action = element.dataset.action;
        UI.lastFocusedElement = element;

        switch (action) {
            case 'copy':
                AppreciationsManager.copyAppreciation(id, element);
                break;
            case 'delete':
                AppreciationsManager.deleteAppreciation(id);
                break;
            case 'details':
                AppreciationsManager.showAppreciationDetails(id);
                break;
            case 'refine':
                AppreciationsManager.refineAppreciation(id);
                break;
            case 'edit':
                if (appState.currentInputMode !== CONSTS.INPUT_MODE.SINGLE) {
                    UI.setInputMode(CONSTS.INPUT_MODE.SINGLE);
                }
                AppreciationsManager.editAppreciation(id);
                break;
            case 'regenerate':
                await AppreciationsManager.regenerateFailedAppreciation(id, element);
                break;
            case 'toggle-version':
                AppreciationsManager.toggleVersion(id);
                break;
            case 'variations':
                await VariationsManager.generateVariation(id, element);
                break;
            case 'undo-variation':
                await VariationsManager.undoVariation(id, element);
                break;
        }
    },

    /**
     * Gère le piège à focus dans les modales pour l'accessibilité.
     * @param {KeyboardEvent} e - L'événement keydown
     * @param {HTMLElement} container - Le conteneur de la modale active
     */
    handleFocusTrap(e, container) {
        const focusable = Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter(el => el.offsetParent !== null && !el.disabled);

        if (focusable.length === 0) {
            e.preventDefault();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === first) {
                last.focus();
                e.preventDefault();
            }
        } else {
            if (document.activeElement === last) {
                first.focus();
                e.preventDefault();
            }
        }
    },

    /**
     * Gère la navigation au clavier dans la liste des résultats (Haut/Bas).
     * @param {KeyboardEvent} e - L'événement keydown
     */
    handleResultListKeyboardNav(e) {
        if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;

        const cards = Array.from(document.querySelectorAll('.appreciation-result'));
        if (cards.length === 0) return;

        const currentFocus = document.activeElement.closest('.appreciation-result');
        let index = -1;

        if (currentFocus) {
            index = cards.indexOf(currentFocus);
            if (e.key === 'ArrowDown') index++;
            else index--;
        } else {
            if (e.key === 'ArrowDown') index = 0;
            else index = cards.length - 1;
        }

        if (index >= 0 && index < cards.length) {
            e.preventDefault();
            cards[index].focus();
            cards[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    },

    /**
     * Gère l'input de recherche avec debounce.
     * @param {Event} e - L'événement input
     */
    handleSearchInput(e) {
        // La valeur est lue directement depuis DOM.searchInput.value dans renderResults
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
     * Gère l'ouverture/fermeture du menu d'actions.
     * @param {Event} e - L'événement click
     */
    handleActionsBtnToggle(e) {
        e.stopPropagation();
        // Fermer les custom dropdowns avant d'ouvrir le menu actions
        import('./DropdownManager.js').then(({ DropdownManager }) => {
            DropdownManager.closeAll();
        }).catch(() => { });
        DOM.actionsDropdown.classList.toggle('show');
    },

    /**
     * Gère le clic sur les onglets des paramètres.
     * @param {Event} e - L'événement click
     */
    handleSettingsTabClick(e) {
        // Use closest() to handle clicks on icons inside the tab button
        const tab = e.target.closest('.settings-tab');
        const tabName = tab?.dataset.tab;
        if (tabName) UI.showSettingsTab(tabName);
    },

    /**
     * Gère le changement de système de période (Trimestre/Semestre).
     * @param {Event} e - L'événement change
     */
    handlePeriodSystemChange(e) {
        appState.periodSystem = e.target.value;
        appState.currentPeriod = UI.getPeriods()[0];

        UI.updatePeriodSystemUI();
        UI.updateSettingsPromptFields();

        // MàJ des sliders si on change de système (bien que config globale pour l'instant)
        UI.updateSettingsFields();
        AppreciationsManager.renderResults();
    },

    /**
     * Gère le clic sur une carte de statistique pour filtrer.
     * @param {HTMLElement|null} element - L'élément cliqué ou null pour reset
     */
    handleStatFilterClick(element) {
        if (!element) {
            appState.activeStatFilter = null;
            document.querySelectorAll('.stat-card.active-filter, .legend-item.active-filter, .detail-item.active-filter, .hist-bar-group.active-filter').forEach(c => c.classList.remove('active-filter'));
            UI.updateActiveFilterInfo();
            // FLIP animation is handled in ListViewManager
            AppreciationsManager.renderResults();
            return;
        }

        const statId = element.dataset.filterId || element.dataset.statId;
        const isCurrentlyActive = element.classList.contains('active-filter');

        // Reset visual state
        document.querySelectorAll('.stat-card.active-filter, .legend-item.active-filter, .detail-item.active-filter, .hist-bar-group.active-filter').forEach(c => c.classList.remove('active-filter'));

        if (isCurrentlyActive) {
            // DE-ACTIVATE
            appState.activeStatFilter = null;
        } else {
            // ACTIVATE
            appState.activeStatFilter = statId;
            element.classList.add('active-filter');
        }

        UI.updateActiveFilterInfo();

        // FLIP animation is handled in ListViewManager
        AppreciationsManager.renderResults();
    },

    /**
     * Gère le clic sur le bouton "Tout Régénérer".
     */
    async handleRegenerateAllClick() {
        if (appState.generatedResults.length === 0) return;

        // Note: Le menu d'actions est maintenant fermé par le ListViewManager
        // DOM.actionsDropdown n'existe plus dans le HTML statique

        // On délègue à AppreciationsManager.regenerateVisible qui gère déjà la confirmation
        await AppreciationsManager.regenerateVisible(false);
    },

    /**
     * Gère le clic sur le bouton "Régénérer les erreurs".
     */
    async handleRegenerateErrorsClick() {
        // Simplifié : on prend toutes les cartes avec une erreur
        const errorIds = appState.generatedResults.filter(r => r.errorMessage).map(r => r.id);

        if (errorIds.length === 0) {
            UI.showNotification("Aucune erreur détectée à régénérer.", "info");
            return;
        }

        // Note: Le menu d'actions est maintenant fermé par le ListViewManager

        // Régénérer uniquement les erreurs
        await AppreciationsManager.regenerateVisible(true);
    },

    /**
     * Gère le clic sur le bouton "Infos filtre actif".
     */
    handleActiveFilterInfoClick() {
        this.handleStatFilterClick(null);
    }
};
