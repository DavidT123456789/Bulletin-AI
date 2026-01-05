/**
 * @fileoverview Gestionnaire d'événements pour l'application Bulletin AI.
 * 
 * Ce module orchestre l'attachement de tous les event listeners de l'application,
 * en déléguant à des modules spécialisés par section.
 * 
 * @module managers/EventListenersManager
 */

import { EventHandlersManager } from './EventHandlersManager.js';
import { GeneralListeners } from './listeners/GeneralListeners.js';
import { InputListeners } from './listeners/InputListeners.js';
import { OutputListeners } from './listeners/OutputListeners.js';
import { SettingsModalListeners } from './listeners/SettingsModalListeners.js';
import { OtherModalsListeners } from './listeners/OtherModalsListeners.js';
import { GlobalListeners } from './listeners/GlobalListeners.js';

/** @type {import('./AppManager.js').App|null} */
let App = null;

/**
 * Module de gestion des event listeners.
 * @namespace EventListenersManager
 */
export const EventListenersManager = {
    /**
     * Initialise le module avec une référence à l'application principale.
     * @param {Object} appInstance - Instance de l'application principale
     */
    init(appInstance) {
        App = appInstance;
        EventHandlersManager.init(appInstance);

        // Initialiser les sous-modules qui en ont besoin
        GeneralListeners.init(appInstance);
        InputListeners.init(appInstance);
        SettingsModalListeners.init(appInstance);
        OtherModalsListeners.init(appInstance);
    },

    /**
     * Configure tous les event listeners de l'application.
     * Appelé une fois au démarrage.
     */
    setupEventListeners() {
        const addClickListener = (element, handler) => {
            if (element) {
                element.addEventListener('click', handler.bind ? handler.bind(App) : handler);
            }
        };

        // Déléguer à chaque module spécialisé
        GeneralListeners.setup(addClickListener);
        InputListeners.setup(addClickListener);
        OutputListeners.setup(addClickListener);
        SettingsModalListeners.setup(addClickListener);
        OtherModalsListeners.setup(addClickListener);
        GlobalListeners.setup();
    }
};
