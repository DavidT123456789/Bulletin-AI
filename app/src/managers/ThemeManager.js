import { appState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';

export const ThemeManager = {
    // Current resolved theme (actual visual state: 'light' or 'dark')
    currentResolvedTheme: 'light',

    // Media query match for system preference
    systemMediaQuery: null,

    init() {
        // Initialize system media query listener
        this.systemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.systemMediaQuery.addEventListener('change', () => {
            if (appState.theme === 'system') {
                this.applyTheme();
            }
        });

        // Initialize UI listeners (Segmented Control)
        this.initSegmentedControl();

        // Initial application
        this.applyTheme();
    },

    /**
     * Set up event listeners for the segmented control
     */
    initSegmentedControl() {
        const control = document.getElementById('themeSegmentedControl');
        if (!control) return;

        const segments = control.querySelectorAll('.ui-segment');
        segments.forEach(segment => {
            segment.addEventListener('click', () => {
                const selectedTheme = segment.getAttribute('data-value');
                if (selectedTheme) {
                    this.setTheme(selectedTheme);
                }
            });
        });
    },

    /**
     * Set the desired theme mode
     * @param {string} themeName - 'light', 'dark', or 'system'
     */
    setTheme(themeName) {
        if (!['light', 'dark', 'system'].includes(themeName)) return;

        appState.theme = themeName;
        this.applyTheme();
        StorageManager.saveAppState();
    },

    /**
     * Calculate and apply the theme based on settings and system preference
     */
    applyTheme() {
        let effectiveTheme = 'light';

        // Determine effective theme
        if (appState.theme === 'system') {
            effectiveTheme = this.systemMediaQuery && this.systemMediaQuery.matches ? 'dark' : 'light';
        } else {
            effectiveTheme = appState.theme;
        }

        // Apply to DOM
        // If effectiveTheme is dark, set dataset.theme = 'dark'. Else remove it.
        // (Assuming existing CSS logic uses [data-theme="dark"] for dark mode and default for light)
        if (effectiveTheme === 'dark') {
            document.documentElement.dataset.theme = 'dark';
        } else {
            delete document.documentElement.dataset.theme;
        }

        this.currentResolvedTheme = effectiveTheme;

        // Update UI state
        this.updateUI();
    },

    /**
     * Update the visual state of the segmented control
     */
    updateUI() {
        const control = document.getElementById('themeSegmentedControl');
        if (!control) return;

        const currentMode = appState.theme || 'light';

        // Update active state on container (mostly for glider positioning)
        control.setAttribute('data-active', currentMode);

        // Update active class on buttons
        const segments = control.querySelectorAll('.ui-segment');
        segments.forEach(segment => {
            const val = segment.getAttribute('data-value');
            if (val === currentMode) {
                segment.classList.add('active');
                segment.setAttribute('aria-pressed', 'true');
            } else {
                segment.classList.remove('active');
                segment.setAttribute('aria-pressed', 'false');
            }
        });
    }
};
