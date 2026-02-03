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

    /** @type {boolean} Listener déjà attaché */
    _listenerAttached: false,

    /** @type {number} Nombre de popstate à ignorer (gère les appels multiples de history.back()) */
    _popStatesToIgnore: 0,

    /**
     * Initialise l'écouteur d'événements popstate (une seule fois).
     */
    init() {
        if (this._listenerAttached) return;

        window.addEventListener('popstate', () => {
            if (this._popStatesToIgnore > 0) {
                this._popStatesToIgnore--;
                return;
            }

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
            history.back();
        } else {
            // Fermeture désordonnée: on nettoie la pile sans toucher à l'historique
            const index = this._stack.findIndex(item => item.id === id);
            if (index !== -1) {
                this._stack.splice(index, 1);
            }
        }
    }
};
