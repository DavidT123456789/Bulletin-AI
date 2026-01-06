import { appState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';
import { DOM } from '../utils/DOM.js';
import { DOMHelper } from '../utils/DOMHelper.js';

export const ThemeManager = {
    init() {
        this.applyTheme();
        this.updateDarkModeButtonIcon();
    },

    applyTheme() {
        document.documentElement.dataset.theme = appState.theme === 'light' ? '' : 'dark';
        this.updateDarkModeButtonIcon();
    },

    toggleDarkMode() {
        appState.theme = (appState.theme === 'dark') ? 'light' : 'dark';
        this.applyTheme();
        StorageManager.saveAppState();
    },

    updateDarkModeButtonIcon() {
        if (DOM.darkModeToggle) {
            const isDark = appState.theme === 'dark';
            DOMHelper.clear(DOM.darkModeToggle);
            DOM.darkModeToggle.appendChild(DOMHelper.createElement('i', { className: isDark ? 'fas fa-sun' : 'fas fa-moon' }));
            DOM.darkModeToggle.setAttribute('data-tooltip', isDark ? 'Mode clair' : 'Mode sombre');
        }
    }
};
