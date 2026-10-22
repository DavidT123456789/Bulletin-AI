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

    /** @type {boolean} Indique qu'une fermeture manuelle attend d'être remplacée par un prochain pushState */
    _pendingReplace: false,

    /** @type { ReturnType<typeof setTimeout>|null } Timer de repli si aucun pushState ne suit une fermeture différée */
    _pendingReplaceTimer: null,

    /** @type {EventTarget|null} Cible du geste tactile en cours (pour ignorer le scroll-chaining issu d'un menu) */
    _activeTouchTarget: null,
    _touchStartHandler: null,
    _touchEndHandler: null,

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

            this._touchStartHandler = (e) => {
                this._activeTouchTarget = e.target || null;
            };
            this._touchEndHandler = () => {
                this._activeTouchTarget = null;
            };

            window.addEventListener('popstate', this._popstateHandler);
            window.addEventListener('touchstart', this._touchStartHandler, { capture: true, passive: true });
            window.addEventListener('touchend', this._touchEndHandler, { capture: true, passive: true });
            window.addEventListener('touchcancel', this._touchEndHandler, { capture: true, passive: true });
            this._listenerAttached = true;
        }
    },

    /**
     * Indique si un événement de défilement (ou le geste tactile qui l'a initié) provient de l'intérieur d'un conteneur.
     * Empêche la fermeture accidentelle d'un menu lorsque le défilement atteint sa butée sur mobile.
     * 
     * @param {Event} e - Événement scroll
     * @param {Element|string|null} containerOrSelector - Élément DOM ou sélecteur CSS du menu
     * @returns {boolean}
     */
    isScrollInside(e, containerOrSelector) {
        if (!containerOrSelector) return false;
        const target = e?.target;
        const touchTarget = this._activeTouchTarget;
        if (typeof containerOrSelector === 'string') {
            return Boolean(target?.closest?.(containerOrSelector) || touchTarget?.closest?.(containerOrSelector));
        }
        return Boolean(
            (target instanceof Node && containerOrSelector.contains(target)) ||
            (touchTarget instanceof Node && containerOrSelector.contains(touchTarget))
        );
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
            this._stack[this._stack.length - 1].closeCallback = closeCallback;
            return;
        }

        if (this._pendingReplace) {
            this._pendingReplace = false;
            if (this._pendingReplaceTimer) {
                clearTimeout(this._pendingReplaceTimer);
                this._pendingReplaceTimer = null;
            }
            try {
                if (typeof history !== 'undefined' && history.replaceState) {
                    history.replaceState({ uiOpen: true, uiId: id, timestamp: Date.now() }, '', '');
                }
            } catch (_) {}
        } else {
            try {
                if (typeof history !== 'undefined' && history.pushState) {
                    history.pushState({ uiOpen: true, uiId: id, timestamp: Date.now() }, '', '');
                }
            } catch (_) {}
        }

        this._stack.push({ id, closeCallback });
    },

    /**
     * Signale la fermeture manuelle d'un élément (bouton X, backdrop click, validation).
     * Synchronise physiquement l'historique du navigateur sans déclencher le closeCallback.
     * 
     * @param {string} id - Identifiant de l'élément qui se ferme
     * @param {Object} [options={}]
     * @param {boolean} [options.deferBack=false] - Diffère history.back() pour permettre à un pushState immédiat (ex: menu -> modale) de faire un replaceState sans collision
     */
    handleManualClose(id, options = {}) {
        if (!id || this._stack.length === 0) return;

        const topIndex = this._stack.length - 1;
        const top = this._stack[topIndex];
        let removed = false;

        if (top.id === id) {
            this._stack.pop();
            removed = true;
        } else {
            // Fermeture désordonnée (ex: parent fermé emportant un enfant)
            const index = this._stack.findIndex(item => item.id === id);
            if (index !== -1) {
                this._stack.splice(index, 1);
                removed = true;
            }
        }

        if (!removed) return;

        if (options.deferBack) {
            this._pendingReplace = true;
            if (this._pendingReplaceTimer) {
                clearTimeout(this._pendingReplaceTimer);
            }
            this._pendingReplaceTimer = setTimeout(() => {
                this._pendingReplaceTimer = null;
                if (this._pendingReplace) {
                    this._pendingReplace = false;
                    this._triggerProgrammaticBack();
                }
            }, 60);
        } else {
            this._triggerProgrammaticBack();
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
        this._pendingReplace = false;
        this._activeTouchTarget = null;
        if (this._pendingReplaceTimer) {
            clearTimeout(this._pendingReplaceTimer);
            this._pendingReplaceTimer = null;
        }
    },

    /**
     * Détache l'écouteur et réinitialise (pour tests unitaires)
     */
    destroy() {
        if (this._listenerAttached && typeof window !== 'undefined') {
            if (this._popstateHandler) {
                window.removeEventListener('popstate', this._popstateHandler);
            }
            if (this._touchStartHandler) {
                window.removeEventListener('touchstart', this._touchStartHandler, { capture: true });
            }
            if (this._touchEndHandler) {
                window.removeEventListener('touchend', this._touchEndHandler, { capture: true });
                window.removeEventListener('touchcancel', this._touchEndHandler, { capture: true });
            }
            this._listenerAttached = false;
            this._popstateHandler = null;
            this._touchStartHandler = null;
            this._touchEndHandler = null;
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
