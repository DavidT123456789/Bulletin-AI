/**
 * @fileoverview Gestionnaire centralisé de l'historique de navigation pour l'UI.
 * Permet de gérer le bouton "Retour" (Back) sur mobile pour fermer les modales, menus et dropdowns.
 * Supporte les états empilés (ex: Modale Aide par dessus Modale Paramètres).
 * 
 * CRITICAL: This module protects against navigating back to the landing page when users
 * close modals or use browser back button. It replaces the initial history entry with
 * an "app base" state and monitors all popstate events.
 * 
 * @module managers/HistoryManager
 */

export const HistoryManager = {
    /** @type {Array<{id: string, closeCallback: Function}>} Pile des éléments UI ouverts */
    _stack: [],

    /** @type {boolean} Listener déjà attaché */
    _listenerAttached: false,

    /** @type {number} Nombre de popstate à ignorer (gère les appels multiples de history.back()) */
    _popStatesToIgnore: 0,

    /** @type {boolean} État de base initialisé */
    _baseStateInitialized: false,

    /** @type {number} Initial history length when app started (used to detect if we can go back) */
    _initialHistoryLength: 0,

    /** @type {number} Count of states we've pushed */
    _pushedStatesCount: 0,

    /**
     * Initialise l'écouteur d'événements popstate (une seule fois).
     * Crée également un état de base pour éviter de retourner à la landing page.
     * 
     * MUST be called early in app initialization (before any UI interactions).
     */
    init() {
        if (this._listenerAttached) return;

        // Track initial history length - we should never go below this
        this._initialHistoryLength = history.length;

        // CRITICAL FIX: Replace current history entry with our app's base state
        // This prevents the browser's back button from returning to landing page
        if (!this._baseStateInitialized) {
            history.replaceState({ appBase: true, timestamp: Date.now() }, '', '');
            this._baseStateInitialized = true;
        }

        window.addEventListener('popstate', (event) => {
            // CRITICAL PROTECTION: Check if we're about to leave the app
            // If the state doesn't have our markers, we've navigated to an external page
            // (like the landing page). We MUST immediately push a state to return to the app.
            const isOurState = event.state?.appBase || event.state?.uiOpen ||
                event.state?.focusPanel || event.state?.inlineSearch;

            if (!isOurState) {
                // EMERGENCY: We've navigated outside our app's history!
                // Push a new state immediately to go "forward" and stay in the app
                history.pushState({ appBase: true, recovered: true, timestamp: Date.now() }, '', '');

                // Reset our counter since we're now at base state
                this._pushedStatesCount = 0;
                this._stack = [];
                return;
            }

            // If this popstate should be ignored (triggered by our own safeBack call)
            if (this._popStatesToIgnore > 0) {
                this._popStatesToIgnore--;
                return;
            }

            // Decrement our pushed states count when going back
            if (this._pushedStatesCount > 0) {
                this._pushedStatesCount--;
            }

            // Close the topmost UI element if any
            if (this._stack.length > 0) {
                const top = this._stack.pop();
                if (top?.closeCallback) {
                    top.closeCallback({ causedByHistory: true });
                }
            }
        });

        this._listenerAttached = true;
    },

    /**
     * Enregistre un élément UI dans l'historique (pousse un état).
     * À appeler LORS de l'ouverture de l'élément.
     * 
     * @param {string} id - Identifiant unique de l'élément (ex: 'headerMenu', 'myModal')
     * @param {Function} closeCallback - Fonction à exécuter pour fermer l'élément
     */
    pushState(id, closeCallback) {
        this.init();
        history.pushState({ uiOpen: true, uiId: id, timestamp: Date.now() }, '', '');
        this._pushedStatesCount++;
        this._stack.push({ id, closeCallback });
    },

    /**
     * Signale la fermeture manuelle d'un élément (bouton X, backdrop click).
     * Fait reculer l'historique pour nettoyer l'état poussé.
     * 
     * @param {string} id - Identifiant de l'élément qui se ferme
     */
    handleManualClose(id) {
        if (this._stack.length === 0) return;

        const top = this._stack[this._stack.length - 1];

        if (top.id === id) {
            this._stack.pop();
            this._popStatesToIgnore++;
            // Use safeBack to prevent landing page navigation
            this.safeBack();
        } else {
            // Fermeture désordonnée: on nettoie la pile sans toucher à l'historique
            const index = this._stack.findIndex(item => item.id === id);
            if (index !== -1) {
                this._stack.splice(index, 1);
            }
        }
    },

    /**
     * SAFE BACK: Go back in history ONLY if we have pushed states to go back to.
     * This prevents navigating to landing page or other external pages.
     * 
     * Other components (FocusPanelManager, ListViewManager) should use this
     * instead of calling history.back() directly.
     * 
     * @returns {boolean} True if back was executed, false if blocked
     */
    safeBack() {
        // Initialize if not already done
        this.init();

        // Only go back if we have pushed states to consume
        if (this._pushedStatesCount > 0) {
            this._pushedStatesCount--;
            history.back();
            return true;
        }

        // Cannot go back - would leave the app
        return false;
    },

    /**
     * Push a custom state (for components that manage their own history like FocusPanel).
     * This allows them to participate in the safe-back system.
     * 
     * @param {Object} state - The state object to push
     */
    pushCustomState(state) {
        this.init();
        const enrichedState = { ...state, timestamp: Date.now() };
        history.pushState(enrichedState, '', '');
        this._pushedStatesCount++;
    },

    /**
     * Replace current state (for components that want to update without adding history).
     * 
     * @param {Object} state - The state object to set
     */
    replaceCurrentState(state) {
        this.init();
        const enrichedState = { ...state, timestamp: Date.now() };
        history.replaceState(enrichedState, '', '');
    },

    /**
     * Check if it's safe to go back (without leaving the app).
     * 
     * @returns {boolean} True if we have pushed states that can be consumed
     */
    canGoBack() {
        return this._pushedStatesCount > 0;
    }
};
