/**
 * @fileoverview Gestionnaire centralisé de l'historique de navigation pour l'UI.
 * Permet de gérer le bouton "Retour" (Back) sur mobile pour fermer les modales, menus et dropdowns.
 * Supporte les états empilés (ex: Modale Aide par dessus Modale Paramètres).
 * 
 * PROTECTION CRITIQUE: Ce module empêche la navigation vers la landing page quand
 * l'utilisateur ferme des modales ou utilise le bouton retour. Il remplace l'entrée
 * d'historique initiale par un état "appBase" et surveille tous les événements popstate.
 * 
 * @module managers/HistoryManager
 */

export const HistoryManager = {
    /** @type {Array<{id: string, closeCallback: Function}>} Pile des éléments UI ouverts */
    _stack: [],

    /** @type {boolean} Listener déjà attaché */
    _listenerAttached: false,

    /** @type {boolean} État de base initialisé */
    _baseStateInitialized: false,

    /** @type {number} Compteur d'états poussés */
    _pushedStatesCount: 0,

    /**
     * Initialise l'écouteur d'événements popstate (une seule fois).
     * Crée également un état de base pour éviter de retourner à la landing page.
     * 
     * DOIT être appelé tôt dans l'initialisation de l'app (avant toute interaction UI).
     */
    init() {
        if (this._listenerAttached) return;

        // Remplacer l'entrée d'historique actuelle par notre état de base
        // Cela empêche le bouton retour du navigateur de retourner à la landing page
        if (!this._baseStateInitialized) {
            history.replaceState({ appBase: true, timestamp: Date.now() }, '', '');
            this._baseStateInitialized = true;
        }

        window.addEventListener('popstate', (event) => {
            // PROTECTION CRITIQUE: Vérifier si on quitte l'app
            // Si l'état n'a pas nos marqueurs, on a navigué vers une page externe
            const isOurState = event.state?.appBase || event.state?.uiOpen ||
                event.state?.focusPanel || event.state?.inlineSearch;

            if (!isOurState) {
                // URGENCE: On a quitté l'historique de l'app!
                // Pousser un nouvel état immédiatement pour revenir dans l'app
                history.pushState({ appBase: true, recovered: true, timestamp: Date.now() }, '', '');

                // Réinitialiser le compteur et la pile
                this._pushedStatesCount = 0;
                this._stack = [];
                return;
            }

            // Décrémenter le compteur d'états poussés
            if (this._pushedStatesCount > 0) {
                this._pushedStatesCount--;
            }

            // Fermer l'élément UI au sommet de la pile
            if (this._stack.length > 0) {
                const top = this._stack.pop();
                top?.closeCallback?.({ causedByHistory: true });
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
     * 
     * NOTE: On n'appelle PAS history.back() ici pour éviter de naviguer vers
     * la landing page. On utilise replaceState pour "neutraliser" l'entrée
     * d'historique actuelle sans naviguer.
     * 
     * @param {string} id - Identifiant de l'élément qui se ferme
     */
    handleManualClose(id) {
        if (this._stack.length === 0) return;

        const top = this._stack[this._stack.length - 1];

        if (top.id === id) {
            this._stack.pop();

            if (this._pushedStatesCount > 0) {
                this._pushedStatesCount--;
            }

            // Remplacer l'état actuel au lieu de naviguer en arrière
            history.replaceState({ appBase: true, consumed: true, timestamp: Date.now() }, '', '');
        } else {
            // Fermeture désordonnée: nettoyer la pile sans toucher à l'historique
            const index = this._stack.findIndex(item => item.id === id);
            if (index !== -1) {
                this._stack.splice(index, 1);
                if (this._pushedStatesCount > 0) {
                    this._pushedStatesCount--;
                }
            }
        }
    },

    /**
     * Pousse un état personnalisé (pour les composants qui gèrent leur propre historique).
     * 
     * @param {Object} state - L'objet état à pousser
     */
    pushCustomState(state) {
        this.init();
        history.pushState({ ...state, timestamp: Date.now() }, '', '');
        this._pushedStatesCount++;
    },

    /**
     * Remplace l'état actuel (pour les composants qui veulent mettre à jour sans ajouter d'historique).
     * 
     * @param {Object} state - L'objet état à définir
     */
    replaceCurrentState(state) {
        this.init();
        history.replaceState({ ...state, timestamp: Date.now() }, '', '');
    }
};

