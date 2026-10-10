/**
 * @fileoverview Gestionnaire centralisé de l'historique de navigation pour l'UI.
 * Permet de gérer le bouton "Retour" (Back gesture / hardware button) sur mobile
 * pour fermer les modales, tiroirs, bottom sheets, menus et modes contextuels (LIFO stack).
 * Intègre une protection racine "Double Back to Exit" pour éviter de quitter l'app accidentellement.
 * 
 * @module managers/HistoryManager
 */

export const HistoryManager = {
    /** @type {Array<{id: string, closeCallback: Function}>} Pile des éléments UI ouverts (LIFO) */
    _stack: [],

    /** @type {boolean} Listener déjà attaché */
    _listenerAttached: false,

    /** @type {Function|null} Écouteur popstate stocké pour nettoyage */
    _popstateHandler: null,

    /** @type {boolean} État de base initialisé */
    _baseStateInitialized: false,

    /** @type {number} Compteur de retours programmatiques pour ignorer les popstates correspondants */
    _programmaticBackCount: 0,

    /** @type {number} Timestamp du dernier appui retour à la racine */
    _lastRootBackTime: 0,

    /**
     * Initialise l'écouteur d'événements popstate (une seule fois).
     * Crée également un état de base pour éviter de quitter l'application intempestivement.
     */
    init() {
        if (this._listenerAttached) return;

        // Remplacer l'entrée d'historique actuelle par notre état de base
        if (!this._baseStateInitialized && typeof history !== 'undefined' && history.replaceState) {
            try {
                history.replaceState({ appBase: true, timestamp: Date.now() }, '', '');
            } catch (_) {}
            this._baseStateInitialized = true;
        }

        if (typeof window !== 'undefined' && window.addEventListener) {
            this._popstateHandler = (event) => {
                // 1. Si ce popstate résulte d'une fermeture manuelle interne (handleManualClose) -> ignorer
                if (this._programmaticBackCount > 0) {
                    this._programmaticBackCount--;
                    return;
                }

                // 2. Si un élément UI est dans la pile -> dépiler et fermer le plus récent (LIFO)
                if (this._stack.length > 0) {
                    const top = this._stack.pop();
                    try {
                        top?.closeCallback?.({ causedByHistory: true });
                    } catch (err) {
                        console.error('[HistoryManager] Erreur lors de la fermeture UI:', err);
                    }
                    return;
                }

                // 3. Pile vide : l'utilisateur est à la racine de l'application
                // Double tap pour quitter sur mobile (délai de 2.5 secondes)
                const now = Date.now();
                if (now - this._lastRootBackTime < 2500) {
                    // Deuxième appui rapide -> autoriser la sortie naturelle
                    this._lastRootBackTime = 0;
                    return;
                }

                // Premier appui à la racine -> piéger et informer avec un toast non intrusif
                this._lastRootBackTime = now;
                try {
                    if (typeof history !== 'undefined' && history.pushState) {
                        history.pushState({ appBase: true, timestamp: now }, '', '');
                    }
                } catch (_) {}

                if (window.UI?.showNotification) {
                    window.UI.showNotification("Appuyez à nouveau pour quitter l'application", 'info', 2500, {
                        group: 'app-exit-warning',
                        bypassCoalescing: true
                    });
                }
            };

            window.addEventListener('popstate', this._popstateHandler);
            this._listenerAttached = true;
        }
    },

    /**
     * Enregistre un élément UI dans l'historique (pousse un état).
     * À appeler lors de l'ouverture d'un panneau, modal, popover ou mode.
     * 
     * @param {string} id - Identifiant unique de l'élément (ex: 'seatingChartEdit', 'focusPanel')
     * @param {Function} closeCallback - Fonction à exécuter pour fermer l'élément
     */
    pushState(id, closeCallback) {
        this.init();
        if (!id) return;

        // Éviter de pousser deux fois de suite le même ID au sommet
        if (this._stack.length > 0 && this._stack[this._stack.length - 1].id === id) {
            return;
        }

        try {
            if (typeof history !== 'undefined' && history.pushState) {
                history.pushState({ uiOpen: true, uiId: id, timestamp: Date.now() }, '', '');
            }
        } catch (_) {}

        this._stack.push({ id, closeCallback });
    },

    /**
     * Signale la fermeture manuelle d'un élément (bouton X, backdrop click, validation).
     * Synchronise physiquement l'historique du navigateur sans déclencher le closeCallback.
     * 
     * @param {string} id - Identifiant de l'élément qui se ferme
     */
    handleManualClose(id) {
        if (!id || this._stack.length === 0) return;

        const topIndex = this._stack.length - 1;
        const top = this._stack[topIndex];

        if (top.id === id) {
            this._stack.pop();
            this._triggerProgrammaticBack();
        } else {
            // Fermeture désordonnée (ex: parent fermé emportant un enfant)
            const index = this._stack.findIndex(item => item.id === id);
            if (index !== -1) {
                this._stack.splice(index, 1);
                this._triggerProgrammaticBack();
            }
        }
    },

    /**
     * Déclenche un history.back() protégé par compteur pour nettoyer l'historique physique
     * @private
     */
    _triggerProgrammaticBack() {
        if (typeof history === 'undefined' || !history.back) return;

        // Protection anti-sortie : ne jamais appeler history.back() si l'état actif n'est pas un état UI ouvert.
        // Si history.state a appBase: true ou n'a pas uiOpen: true, appeler back() quitterait
        // physiquement app.html pour ramener l'utilisateur vers la landing page !
        if (typeof window !== 'undefined' && !window.history?.state?.uiOpen) {
            return;
        }

        this._programmaticBackCount++;
        try {
            history.back();
        } catch (_) {
            this._programmaticBackCount = Math.max(0, this._programmaticBackCount - 1);
        }

        // Sécurité en cas d'environnement sans dispatch popstate (tests ou browsers anciens)
        setTimeout(() => {
            if (this._programmaticBackCount > 0) {
                this._programmaticBackCount--;
            }
        }, 500);
    },

    /**
     * Vérifie si un identifiant est actuellement présent dans la pile d'historique
     * @param {string} id
     * @returns {boolean}
     */
    isOpen(id) {
        return this._stack.some(item => item.id === id);
    },

    /**
     * Récupère une copie de la pile actuelle
     * @returns {Array<{id: string, closeCallback: Function}>}
     */
    getStack() {
        return [...this._stack];
    },

    /**
     * Réinitialise la pile (utile pour les tests unitaires)
     */
    clearStack() {
        this._stack = [];
        this._programmaticBackCount = 0;
        this._lastRootBackTime = 0;
    },

    /**
     * Détache l'écouteur et réinitialise (pour tests unitaires)
     */
    destroy() {
        if (this._listenerAttached && this._popstateHandler && typeof window !== 'undefined') {
            window.removeEventListener('popstate', this._popstateHandler);
            this._listenerAttached = false;
            this._popstateHandler = null;
        }
        this.clearStack();
        this._baseStateInitialized = false;
        if (typeof history !== 'undefined' && history.replaceState) {
            try {
                history.replaceState(null, '', '');
            } catch (_) {}
        }
    },

    /**
     * Pousse un état personnalisé (compatibilité)
     * @param {Object} state
     */
    pushCustomState(state) {
        this.init();
        try {
            if (typeof history !== 'undefined' && history.pushState) {
                history.pushState({ ...state, timestamp: Date.now() }, '', '');
            }
        } catch (_) {}
    },

    /**
     * Remplace l'état actuel (compatibilité)
     * @param {Object} state
     */
    replaceCurrentState(state) {
        this.init();
        try {
            if (typeof history !== 'undefined' && history.replaceState) {
                history.replaceState({ ...state, timestamp: Date.now() }, '', '');
            }
        } catch (_) {}
    }
};
