import { appState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';

export const ThemeManager = {
    // Current resolved theme (actual visual state: 'light' or 'dark')
    currentResolvedTheme: 'light',

    // Media query match for system preference
    systemMediaQuery: null,

    // Curated preset accent keys matching variables.css [data-accent]
    VALID_ACCENTS: ['blue', 'purple', 'pink', 'orange', 'green', 'teal'],

    init() {
        // Hydrate theme and accent from localStorage before initial applyTheme()
        // so we don't reset pre-rendered dark mode or accent before StorageManager finishes loading
        this.hydrateFromLocalStorage();

        // Initialize system media query listener
        this.systemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.systemMediaQuery.addEventListener('change', () => {
            if (appState.theme === 'system') {
                this.applyTheme();
            }
        });

        // Initialize UI listeners (Segmented Control + Accent Swatches)
        this.initSegmentedControl();
        this.initAccentControl();

        // Initial application
        this.applyTheme();
    },

    /**
     * Hydrate theme and accentColor from localStorage early at startup
     */
    hydrateFromLocalStorage() {
        try {
            let storedTheme = localStorage.getItem('bulletin_theme') || '';
            let storedAccent = '';

            const rawState = localStorage.getItem('appreciationGeneratorState_v6.2') ||
                             localStorage.getItem('bulletin_app_state') ||
                             localStorage.getItem('appreciationGeneratorState');
            if (rawState) {
                const state = JSON.parse(rawState);
                if (!storedTheme) {
                    storedTheme = state?.settings?.theme || state?.theme || state?.ui?.theme || '';
                }
                storedAccent = state?.settings?.accentColor || state?.accentColor || state?.ui?.accentColor || '';
            }

            if (['light', 'dark', 'system'].includes(storedTheme)) {
                appState.theme = storedTheme;
            }
            if (this.VALID_ACCENTS.includes(storedAccent)) {
                appState.accentColor = storedAccent;
            }
        } catch (e) {}
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
     * Set up event listeners for the 6 accent color swatches in Settings
     */
    initAccentControl() {
        const selector = document.getElementById('accentColorSelector');
        if (!selector || selector._accentBound) return;
        selector._accentBound = true;

        selector.addEventListener('click', (e) => {
            const swatch = e.target.closest('.accent-color-swatch');
            if (!swatch) return;
            const color = swatch.getAttribute('data-color');
            if (color) {
                this.setAccentColor(color);
            }
        });
    },

    /**
     * Set the desired theme mode
     * @param {string} themeName - 'light', 'dark', or 'system'
     */
    setTheme(themeName) {
        if (!['light', 'dark', 'system'].includes(themeName)) return;

        appState.theme = themeName;
        try {
            localStorage.setItem('bulletin_theme', themeName);
        } catch (e) {}
        this.applyTheme();
        StorageManager.saveAppState();
    },

    /**
     * Set and persist the primary accent color preset
     * @param {string} colorName - One of VALID_ACCENTS ('blue', 'purple', 'pink', 'orange', 'green', 'teal')
     */
    setAccentColor(colorName) {
        const validColor = this.VALID_ACCENTS.includes(colorName) ? colorName : 'blue';
        appState.accentColor = validColor;
        this.applyAccentColor(validColor);
        StorageManager.saveAppState();
    },

    /**
     * Apply the data-accent attribute on <html> and sync swatch active state
     * @param {string} [colorName]
     */
    applyAccentColor(colorName = appState.accentColor) {
        const validColor = this.VALID_ACCENTS.includes(colorName) ? colorName : 'blue';
        if (validColor === 'blue') {
            delete document.documentElement.dataset.accent;
        } else {
            document.documentElement.dataset.accent = validColor;
        }

        const selector = document.getElementById('accentColorSelector');
        if (selector) {
            selector.querySelectorAll('.accent-color-swatch').forEach(swatch => {
                const isActive = swatch.getAttribute('data-color') === validColor;
                swatch.classList.toggle('active', isActive);
                swatch.setAttribute('aria-checked', String(isActive));
            });
        }
    },

    /**
     * Calculate and apply the theme based on settings and system preference
     */
    applyTheme() {
        let effectiveTheme = 'light';

        if (appState.theme === 'system') {
            effectiveTheme = this.systemMediaQuery && this.systemMediaQuery.matches ? 'dark' : 'light';
        } else if (appState.theme === 'dark') {
            effectiveTheme = 'dark';
        }

        const bgColor = effectiveTheme === 'dark' ? '#09090b' : '#f7f7f8';

        document.documentElement.dataset.theme = effectiveTheme;
        document.documentElement.style.backgroundColor = bgColor;
        document.documentElement.style.colorScheme = effectiveTheme;
        if (document.body) {
            document.body.style.backgroundColor = bgColor;
        }

        const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
        if (colorSchemeMeta) {
            colorSchemeMeta.setAttribute('content', effectiveTheme);
        }

        const themeColorMetas = document.querySelectorAll('meta[name="theme-color"]');
        themeColorMetas.forEach(meta => {
            meta.setAttribute('content', bgColor);
        });

        try {
            if (appState.theme) localStorage.setItem('bulletin_theme', appState.theme);
        } catch (e) {}

        this.currentResolvedTheme = effectiveTheme;

        this.applyAccentColor();
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

