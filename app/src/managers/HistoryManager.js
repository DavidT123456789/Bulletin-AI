/**
 * @fileoverview Gestionnaire centralisé de l'historique de navigation pour l'UI.
 * Permet de gérer le bouton "Retour" (Back) sur mobile pour fermer les modales, menus et dropdowns.
 * Supporte les états empilés (ex: Modale Aide par dessus Modale Paramètres).
 * 
 * @module managers/HistoryManager
 */

export const HistoryManager = {
    /** @type {Array<{id: string, closeCallback: Function}>} Pile des éléments UI ouverts */
    _stack: [],
    _listenerAttached: false,
    _ignoreNextPopState: false,

    /**
     * Initialise l'écouteur d'événements popstate (une seule fois).
     */
    init() {
        if (this._listenerAttached) return;

        window.addEventListener('popstate', (e) => {
            if (this._ignoreNextPopState) {
                this._ignoreNextPopState = false;
                return;
            }

            if (this._stack.length > 0) {
                // Le bouton retour a été pressé par l'utilisateur
                // On dépile le dernier élément ouvert
                const top = this._stack.pop();

                console.log('[HistoryManager] Back detected, closing:', top.id);
                // On ferme l'UI (le callback doit gérer la fermeture visuelle)
                if (top && typeof top.closeCallback === 'function') {
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

        const state = { uiOpen: true, uiId: id, timestamp: Date.now() };
        history.pushState(state, '', '');

        this._stack.push({ id, closeCallback });
        console.log('[HistoryManager] Pushed state for:', id, '(Stack size:', this._stack.length, ')');
    },

    /**
     * Signale la fermeture manuelle d'un élément (bouton X, backdrop click).
     * Fait reculer l'historique pour nettoyer l'état poussé.
     * À appeler LORS de la fermeture manuelle.
     * 
     * @param {string} id - Identifiant de l'élément qui se ferme
     */
    handleManualClose(id) {
        if (this._stack.length === 0) return;

        // On vérifie si l'élément qu'on ferme est bien le dernier empilé
        // (Pour éviter des incohérences si on ferme un élément qui n'est pas au sommet)
        const top = this._stack[this._stack.length - 1];

        if (top.id === id) {
            console.log('[HistoryManager] Manual close for:', id);

            // On le retire de notre pile locale
            this._stack.pop();

            // On signale qu'on va déclencher un popstate nous-mêmes, qu'il faut ignorer
            this._ignoreNextPopState = true;
            history.back();
        } else {
            console.warn('[HistoryManager] Manual close requested for', id, 'but top of stack is', top.id);
            // Cas rare: fermeture désordonnée. On nettoie quand même si présent
            const index = this._stack.findIndex(req => req.id === id);
            if (index !== -1) {
                this._stack.splice(index, 1);
                // On ne fait pas history.back() ici car on casserait la navigation pour les éléments au dessus.
                // C'est un cas limite (ex: fermer programmatiquement une modale "en dessous").
                // Idéalement, on ne devrait fermer que le sommet.
            }
        }
    }
};
