import { appState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';

// Color Utility Functions for dynamic accent colors (RGB <-> HSL <-> Hex)
export const ColorUtils = {
    hexToRgb(hex) {
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 59, g: 130, b: 246 };
    },

    rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    },

    hslToRgb(h, s, l) {
        h /= 360;
        s /= 100;
        l /= 100;
        let r, g, b;

        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    },

    rgbToHex(r, g, b) {
        const toHex = x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return '#' + toHex(r) + toHex(g) + toHex(b);
    },

};

export const accentPresets = {
    blue:       { color: '#3b82f6', rgb: '59, 130, 246',  hover: '#2563eb', darkHover: '#60a5fa', bright: '#93c5fd' },
    anthracite: { color: '#52525b', rgb: '82, 82, 91',    hover: '#3f3f46', darkHover: '#e4e4e7', bright: '#e4e4e7' },
    rose:       { color: '#f43f5e', rgb: '244, 63, 94',   hover: '#e11d48', darkHover: '#fb7185', bright: '#fda4af' },
    violet:     { color: '#8b5cf6', rgb: '139, 92, 246',  hover: '#7c3aed', darkHover: '#a78bfa', bright: '#c4b5fd' },
    teal:       { color: '#14b8a6', rgb: '20, 184, 166',  hover: '#0d9488', darkHover: '#2dd4bf', bright: '#5eead4' }
};

export const ThemeManager = {
    // Current resolved theme (actual visual state: 'light' or 'dark')
    currentResolvedTheme: 'light',

    // Media query match for system preference
    systemMediaQuery: null,

    init() {
        // Hydrate theme and accent color from localStorage before initial applyTheme()
        // so we don't reset pre-rendered dark mode back to default 'light' before StorageManager finishes loading
        this.hydrateFromLocalStorage();

        // Initialize system media query listener
        this.systemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.systemMediaQuery.addEventListener('change', () => {
            if (appState.theme === 'system') {
                this.applyTheme();
            }
        });

        // Initialize UI listeners (Segmented Control)
        this.initSegmentedControl();

        // Initialize UI listeners (Accent Color Selectors)
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
            let storedAccent = localStorage.getItem('bulletin_accent_color') || '';

            if (!storedTheme || !storedAccent) {
                const rawState = localStorage.getItem('appreciationGeneratorState_v6.2') ||
                                 localStorage.getItem('bulletin_app_state') ||
                                 localStorage.getItem('appreciationGeneratorState');
                if (rawState) {
                    const state = JSON.parse(rawState);
                    if (!storedTheme) {
                        storedTheme = state?.settings?.theme || state?.theme || state?.ui?.theme || '';
                    }
                    if (!storedAccent) {
                        storedAccent = state?.settings?.accentColor || state?.accentColor || '';
                    }
                }
            }

            if (['light', 'dark', 'system'].includes(storedTheme)) {
                appState.theme = storedTheme;
            }
            if (storedAccent && (accentPresets[storedAccent] || storedAccent.startsWith('#'))) {
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

    // Flag to prevent feedback loops and lossy conversions during user drags
    isDraggingSliders: false,

    /**
     * Set up event listeners for the accent color swatches and custom color accordion
     */
    initAccentControl() {
        const selector = document.getElementById('accentColorSelector');
        if (!selector) return;

        // Dynamically assign preset colors to swatches (Single Source of Truth)
        selector.querySelectorAll('.accent-color-btn').forEach(btn => {
            const val = btn.getAttribute('data-value');
            if (val && accentPresets[val]) {
                btn.style.setProperty('--accent-swatch-color', accentPresets[val].color);
            }
        });

        const picker = document.getElementById('customColorPicker');
        const customBtn = document.getElementById('customAccentBtn');
        const customPickerPanel = document.getElementById('customPickerPanel');
        const hueSlider = document.getElementById('pickerHueSlider');
        const satSlider = document.getElementById('pickerSatSlider');
        const ligSlider = document.getElementById('pickerLigSlider');
        const hexInput = document.getElementById('pickerHexInput');
        const eyedropperBtn = document.getElementById('pickerEyedropperBtn');
        const confirmBtn = document.getElementById('pickerConfirmBtn');
        const livePreview = document.getElementById('pickerLivePreview');
        const closeCustomPanel = () => {
            if (customPickerPanel) customPickerPanel.classList.remove('open');
        };

        const handleSliderChange = () => {
            const h = hueSlider ? parseInt(hueSlider.value, 10) : 220;
            const s = satSlider ? parseInt(satSlider.value, 10) : 80;
            const l = ligSlider ? parseInt(ligSlider.value, 10) : 60;

            const rgb = ColorUtils.hslToRgb(h, s, l);
            const hex = ColorUtils.rgbToHex(rgb.r, rgb.g, rgb.b);

            if (customBtn) {
                customBtn.style.setProperty('--accent-swatch-color', hex);
                const yiq = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
                const contrast = yiq >= 128 ? '#18181b' : '#ffffff';
                customBtn.style.setProperty('--accent-swatch-contrast-color', contrast);
            }

            this.isDraggingSliders = true;
            this.updateCustomPanelUI(hex, h, s, l);
            this.setAccentColor(hex);
            this.isDraggingSliders = false;
        };

        if (hueSlider) hueSlider.addEventListener('input', handleSliderChange);
        if (satSlider) satSlider.addEventListener('input', handleSliderChange);
        if (ligSlider) ligSlider.addEventListener('input', handleSliderChange);

        if (hexInput) {
            hexInput.addEventListener('input', (e) => {
                let val = e.target.value.trim();
                if (val.startsWith('#')) val = val.slice(1);
                if (/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(val)) {
                    const hex = '#' + (val.length === 3 ? val.split('').map(c => c + c).join('') : val);
                    this.updateCustomPanelUI(hex);
                    this.setAccentColor(hex);
                }
            });

            hexInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault();
                    hexInput.blur();
                    closeCustomPanel();
                }
            });

            hexInput.addEventListener('blur', () => {
                if (appState.accentColor && appState.accentColor.startsWith('#')) {
                    hexInput.value = appState.accentColor.slice(1).toUpperCase();
                }
            });
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', closeCustomPanel);
        }

        if (livePreview) {
            livePreview.addEventListener('click', closeCustomPanel);
            livePreview.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    closeCustomPanel();
                }
            });
        }

        if (eyedropperBtn) {
            if (window.EyeDropper) {
                eyedropperBtn.addEventListener('click', async () => {
                    const eyeDropper = new window.EyeDropper();
                    try {
                        const result = await eyeDropper.open();
                        if (result && result.sRGBHex) {
                            this.setAccentColor(result.sRGBHex);
                            closeCustomPanel();
                        }
                    } catch (err) {}
                });
            } else {
                eyedropperBtn.addEventListener('click', () => {
                    if (picker) picker.click();
                });
                eyedropperBtn.setAttribute('data-tooltip', 'Palette de couleurs');
                const eyedropperIcon = eyedropperBtn.querySelector('iconify-icon');
                if (eyedropperIcon) eyedropperIcon.setAttribute('icon', 'ph:palette-bold');
            }
        }

        if (picker) {
            picker.addEventListener('input', (e) => {
                const selectedColor = e.target.value;
                if (selectedColor) {
                    this.setAccentColor(selectedColor);
                }
            });
            picker.addEventListener('change', closeCustomPanel);
        }

        // Click handler for swatch selectors using event delegation
        selector.addEventListener('click', (e) => {
            const btn = e.target.closest('.accent-color-btn');
            if (!btn) return;

            const val = btn.getAttribute('data-value');
            if (val === 'custom') {
                const isAlreadyCustom = appState.accentColor && appState.accentColor.startsWith('#');
                if (isAlreadyCustom) {
                    if (customPickerPanel) customPickerPanel.classList.toggle('open');
                } else {
                    if (customPickerPanel) customPickerPanel.classList.add('open');
                    if (picker) this.setAccentColor(picker.value || '#3b82f6');
                }
            } else if (val && accentPresets[val]) {
                closeCustomPanel();
                this.setAccentColor(val);
            }
        });

        // Auto-collapse custom picker panel when clicking outside the accent card
        document.addEventListener('pointerdown', (e) => {
            if (!customPickerPanel || !customPickerPanel.classList.contains('open')) return;
            const accentCard = customPickerPanel.closest('.help-step-card') || customPickerPanel.parentElement;
            if (accentCard && !accentCard.contains(e.target)) {
                closeCustomPanel();
            }
        });

        // Listen for accent color changes to update button active classes (without forcing accordion open)
        document.addEventListener('accent-color-changed', (e) => {
            const currentAccent = e.detail.accentColor;
            const isCustom = Boolean(currentAccent && currentAccent.startsWith('#'));

            if (!isCustom && customPickerPanel) {
                customPickerPanel.classList.remove('open');
            }

            selector.querySelectorAll('.accent-color-btn').forEach(btn => {
                const btnVal = btn.getAttribute('data-value');
                if (btnVal === 'custom') {
                    if (isCustom) {
                        btn.classList.add('active');
                        const rgb = ColorUtils.hexToRgb(currentAccent);
                        btn.style.setProperty('--accent-swatch-color', currentAccent);
                        if (picker) picker.value = currentAccent;
                        const yiq = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
                        const contrast = yiq >= 128 ? '#18181b' : '#ffffff';
                        btn.style.setProperty('--accent-swatch-contrast-color', contrast);
                        if (!this.isDraggingSliders) {
                            this.updateCustomPanelUI(currentAccent);
                        }
                    } else {
                        btn.classList.remove('active');
                        btn.style.setProperty('--accent-swatch-color', 'transparent');
                        const preset = accentPresets[currentAccent] || accentPresets.blue;
                        this.updateCustomPanelUI(preset.color);
                    }
                } else {
                    btn.classList.toggle('active', btnVal === currentAccent);
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
        try {
            localStorage.setItem('bulletin_theme', themeName);
        } catch (e) {}
        this.applyTheme();
        StorageManager.saveAppState();
    },

    /**
     * Set the desired accent color
     * @param {string} accentColorKey - 'blue', 'anthracite', or hex code like '#ff00ff'
     */
    setAccentColor(accentColorKey) {
        if (!accentPresets[accentColorKey] && (!accentColorKey || !accentColorKey.startsWith('#'))) return;

        appState.accentColor = accentColorKey;
        try {
            localStorage.setItem('bulletin_accent_color', accentColorKey);
        } catch (e) {}
        this.applyAccentColor(accentColorKey);
        StorageManager.saveAppState();

        // Dispatch custom event to notify UIs (e.g. FormUIManager to update pastilles state)
        document.dispatchEvent(new CustomEvent('accent-color-changed', {
            detail: { accentColor: accentColorKey }
        }));
    },

    /**
     * Apply the custom accent color theme variables
     * @param {string} accentColorKey - 'blue', 'anthracite', or hex code like '#ff00ff'
     */
    applyAccentColor(accentColorKey) {
        const key = accentColorKey || 'blue';
        const isDark = (this.currentResolvedTheme === 'dark') || (document.documentElement?.dataset?.theme === 'dark');
        let colors;

        if (key.startsWith('#')) {
            const rgb = ColorUtils.hexToRgb(key);
            const hsl = ColorUtils.rgbToHsl(rgb.r, rgb.g, rgb.b);
            const rgbString = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

            const hoverL = isDark ? Math.min(100, hsl.l + 12) : Math.max(0, hsl.l - 10);
            const hoverRgb = ColorUtils.hslToRgb(hsl.h, hsl.s, hoverL);
            const primaryHover = ColorUtils.rgbToHex(hoverRgb.r, hoverRgb.g, hoverRgb.b);

            const brightL = isDark ? Math.max(72, Math.min(85, hsl.l + 25)) : Math.max(0, hsl.l - 10);
            const brightRgb = ColorUtils.hslToRgb(hsl.h, Math.min(hsl.s, 85), brightL);
            const primaryBright = isDark ? ColorUtils.rgbToHex(brightRgb.r, brightRgb.g, brightRgb.b) : key;

            colors = { color: key, rgb: rgbString, hover: primaryHover, bright: primaryBright };
        } else {
            const preset = accentPresets[key] || accentPresets.blue;
            colors = {
                color: preset.color,
                rgb: preset.rgb,
                hover: (isDark && preset.darkHover) ? preset.darkHover : preset.hover,
                bright: isDark ? (preset.bright || preset.darkHover) : preset.color
            };
        }

        document.documentElement.style.setProperty('--primary-color', colors.color);
        document.documentElement.style.setProperty('--primary-color-rgb', colors.rgb);
        document.documentElement.style.setProperty('--primary-hover', colors.hover);
        document.documentElement.style.setProperty('--primary-bright', colors.bright);
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
            if (appState.accentColor) localStorage.setItem('bulletin_accent_color', appState.accentColor);
        } catch (e) {}

        this.currentResolvedTheme = effectiveTheme;

        this.applyAccentColor(appState.accentColor);
        this.updateUI();

        // Dispatch event to update the accent color swatches active state
        document.dispatchEvent(new CustomEvent('accent-color-changed', {
            detail: { accentColor: appState.accentColor }
        }));
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
    },

    /**
     * Update the sliders, tracks, and inputs UI to match a given hex color.
     * @param {string} hexColor - Hex color code (e.g. '#3b82f6')
     */
    updateCustomPanelUI(hexColor, h = null, s = null, l = null) {
        if (!hexColor || !hexColor.startsWith('#')) return;

        const hexInput = document.getElementById('pickerHexInput');
        const hueSlider = document.getElementById('pickerHueSlider');
        const satSlider = document.getElementById('pickerSatSlider');
        const ligSlider = document.getElementById('pickerLigSlider');
        const livePreview = document.getElementById('pickerLivePreview');

        if (hexInput && document.activeElement !== hexInput) {
            hexInput.value = hexColor.slice(1).toUpperCase();
        }

        let hsl;
        if (h !== null && s !== null && l !== null) {
            hsl = { h, s, l };
        } else {
            const rgb = ColorUtils.hexToRgb(hexColor);
            hsl = ColorUtils.rgbToHsl(rgb.r, rgb.g, rgb.b);
        }

        let activeHue = hsl.h;
        if (hsl.s === 0 && hueSlider) {
            activeHue = parseInt(hueSlider.value, 10) || 0;
        }

        const displayRgb = ColorUtils.hslToRgb(activeHue, hsl.s, hsl.l);
        const displayHex = ColorUtils.rgbToHex(displayRgb.r, displayRgb.g, displayRgb.b);

        if (hueSlider) {
            if (hsl.s > 0 && h === null) {
                hueSlider.value = hsl.h;
            }
            hueSlider.style.setProperty('--slider-thumb-color', displayHex);
        }
        if (satSlider) {
            if (s === null) {
                satSlider.value = hsl.s;
            }
            satSlider.style.setProperty('--slider-thumb-color', displayHex);

            const satStart = ColorUtils.hslToRgb(activeHue, 0, hsl.l);
            const satStartHex = ColorUtils.rgbToHex(satStart.r, satStart.g, satStart.b);
            const satEnd = ColorUtils.hslToRgb(activeHue, 100, hsl.l);
            const satEndHex = ColorUtils.rgbToHex(satEnd.r, satEnd.g, satEnd.b);

            satSlider.style.setProperty('--sat-start', satStartHex);
            satSlider.style.setProperty('--sat-end', satEndHex);
        }
        if (ligSlider) {
            const minL = parseInt(ligSlider.min, 10) || 20;
            const maxL = parseInt(ligSlider.max, 10) || 85;

            let lVal = hsl.l;
            if (lVal < minL) lVal = minL;
            else if (lVal > maxL) lVal = maxL;

            if (l === null) {
                ligSlider.value = lVal;
            }
            ligSlider.style.setProperty('--slider-thumb-color', displayHex);

            const startRgb = ColorUtils.hslToRgb(activeHue, hsl.s, minL);
            const startHex = ColorUtils.rgbToHex(startRgb.r, startRgb.g, startRgb.b);
            const endRgb = ColorUtils.hslToRgb(activeHue, hsl.s, maxL);
            const endHex = ColorUtils.rgbToHex(endRgb.r, endRgb.g, endRgb.b);

            ligSlider.style.setProperty('--lig-start', startHex);
            ligSlider.style.setProperty('--lig-end', endHex);
        }

        if (livePreview) livePreview.style.background = displayHex;
    }
};
