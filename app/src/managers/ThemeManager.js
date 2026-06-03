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

    adjustLuminosity(h, s, l, theme) {
        let adjustedL = l;
        if (theme === 'dark') {
            // Ensure minimum brightness for readability in dark mode (65%)
            if (l < 65) adjustedL = 65;
        } else {
            // Ensure maximum brightness for contrast in light mode (50%)
            if (l > 50) adjustedL = 50;
        }
        return adjustedL;
    }
};

export const accentPresets = {
    blue: {
        light: { color: '#3b82f6', rgb: '59, 130, 246', hover: '#2563eb' },
        dark: { color: '#4f7df2', rgb: '79, 125, 242', hover: '#3b66f1' }
    },
    anthracite: {
        light: { color: '#3f3f46', rgb: '63, 63, 70', hover: '#27272a' },
        dark: { color: '#d4d4d8', rgb: '212, 212, 216', hover: '#a1a1aa' }
    },
    rose: {
        light: { color: '#f5627d', rgb: '245, 98, 125', hover: '#e11d48' },
        dark: { color: '#fda4af', rgb: '253, 164, 175', hover: '#fb7185' }
    },
    violet: {
        light: { color: '#8b5cf6', rgb: '139, 92, 246', hover: '#7c3aed' },
        dark: { color: '#a78bfa', rgb: '167, 139, 250', hover: '#8b5cf6' }
    },
    teal: {
        light: { color: '#14b8a6', rgb: '20, 184, 166', hover: '#0d9488' },
        dark: { color: '#2dd4bf', rgb: '45, 212, 191', hover: '#14b8a6' }
    }
};

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

        // Initialize UI listeners (Accent Color Selectors)
        this.initAccentControl();

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
     * Set up event listeners for the accent color swatches
     */
    initAccentControl() {
        const selector = document.getElementById('accentColorSelector');
        if (!selector) return;

        const picker = document.getElementById('customColorPicker');
        const customBtn = document.getElementById('customAccentBtn');

        // Custom inline picker elements
        const customPickerPanel = document.getElementById('customPickerPanel');
        const hueSlider = document.getElementById('pickerHueSlider');
        const satSlider = document.getElementById('pickerSatSlider');
        const ligSlider = document.getElementById('pickerLigSlider');
        const hexInput = document.getElementById('pickerHexInput');
        const eyedropperBtn = document.getElementById('pickerEyedropperBtn');
        const livePreview = document.getElementById('pickerLivePreview');

        // Update the sliders, tracks, and inputs UI to match a given hex color
        const updateCustomPanelUI = (hexColor) => {
            if (!hexColor || !hexColor.startsWith('#')) return;

            // Update text field if not currently typing
            if (hexInput && document.activeElement !== hexInput) {
                hexInput.value = hexColor.slice(1).toUpperCase();
            }

            // Convert Hex to HSL
            const rgb = ColorUtils.hexToRgb(hexColor);
            const hsl = ColorUtils.rgbToHsl(rgb.r, rgb.g, rgb.b);

            // Update range inputs
            if (hueSlider) {
                hueSlider.value = hsl.h;
                hueSlider.style.setProperty('--slider-thumb-color', hexColor);
            }
            if (satSlider) {
                satSlider.value = hsl.s;
                satSlider.style.setProperty('--slider-thumb-color', hexColor);
                
                // Track gradient for Saturation: desaturated grey to saturated HSL
                const satStart = ColorUtils.hslToRgb(hsl.h, 0, hsl.l);
                const satStartHex = ColorUtils.rgbToHex(satStart.r, satStart.g, satStart.b);
                const satEnd = ColorUtils.hslToRgb(hsl.h, 100, hsl.l);
                const satEndHex = ColorUtils.rgbToHex(satEnd.r, satEnd.g, satEnd.b);
                
                satSlider.style.setProperty('--sat-start', satStartHex);
                satSlider.style.setProperty('--sat-end', satEndHex);
            }
            if (ligSlider) {
                ligSlider.value = hsl.l;
                ligSlider.style.setProperty('--slider-thumb-color', hexColor);
                
                // Track gradient for Lightness: black to pure HSL to white
                const ligMid = ColorUtils.hslToRgb(hsl.h, hsl.s, 50);
                const ligMidHex = ColorUtils.rgbToHex(ligMid.r, ligMid.g, ligMid.b);
                
                ligSlider.style.setProperty('--lig-mid', ligMidHex);
            }

            if (livePreview) livePreview.style.background = hexColor;
        };

        // Handle slider inputs
        const handleSliderChange = () => {
            const h = hueSlider ? parseInt(hueSlider.value) : 220;
            const s = satSlider ? parseInt(satSlider.value) : 80;
            const l = ligSlider ? parseInt(ligSlider.value) : 60;

            const rgb = ColorUtils.hslToRgb(h, s, l);
            const hex = ColorUtils.rgbToHex(rgb.r, rgb.g, rgb.b);

            // Apply immediately to preview style on custom button
            if (customBtn) {
                customBtn.style.setProperty('--accent-swatch-color', hex);
                const yiq = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
                const contrast = yiq >= 128 ? '#18181b' : '#ffffff';
                customBtn.style.setProperty('--accent-swatch-contrast-color', contrast);
            }

            // Sync other panel tracks
            updateCustomPanelUI(hex);

            this.setAccentColor(hex);
        };

        if (hueSlider) hueSlider.addEventListener('input', handleSliderChange);
        if (satSlider) satSlider.addEventListener('input', handleSliderChange);
        if (ligSlider) ligSlider.addEventListener('input', handleSliderChange);

        // Handle Hex text entry
        if (hexInput) {
            hexInput.addEventListener('input', (e) => {
                let val = e.target.value.trim();
                if (val.startsWith('#')) {
                    val = val.slice(1);
                }

                // Check if valid hex (3 or 6 characters)
                const reg = /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                if (reg.test(val)) {
                    let hex = val;
                    if (hex.length === 3) {
                        hex = hex.split('').map(char => char + char).join('');
                    }
                    hex = '#' + hex;

                    // Sync and apply color
                    updateCustomPanelUI(hex);
                    this.setAccentColor(hex);
                }
            });

            hexInput.addEventListener('blur', () => {
                if (appState.accentColor && appState.accentColor.startsWith('#')) {
                    hexInput.value = appState.accentColor.slice(1).toUpperCase();
                }
            });
        }

        // Handle Eyedropper API
        if (eyedropperBtn) {
            if (window.EyeDropper) {
                eyedropperBtn.addEventListener('click', async () => {
                    const eyeDropper = new window.EyeDropper();
                    try {
                        const result = await eyeDropper.open();
                        if (result && result.sRGBHex) {
                            this.setAccentColor(result.sRGBHex);
                        }
                    } catch (err) {
                        // Silent catch on user cancellation
                    }
                });
            } else {
                // Fallback to trigger native hidden picker click
                eyedropperBtn.addEventListener('click', () => {
                    if (picker) picker.click();
                });
                eyedropperBtn.setAttribute('data-tooltip', 'Palette de couleurs');
            }
        }

        // Click handler for swatch selectors using event delegation
        selector.addEventListener('click', (e) => {
            const btn = e.target.closest('.accent-color-btn');
            if (!btn) return;

            const val = btn.getAttribute('data-value');
            if (val === 'custom') {
                const isAlreadyCustom = appState.accentColor && appState.accentColor.startsWith('#');
                if (isAlreadyCustom && customPickerPanel) {
                    customPickerPanel.classList.toggle('open');
                } else if (picker) {
                    // Set the accent color to current picker value to activate custom mode
                    this.setAccentColor(picker.value);
                }
            } else if (val) {
                this.setAccentColor(val);
            }
        });

        // Event listener for hidden color picker input (backup/fallback)
        if (picker) {
            picker.addEventListener('input', (e) => {
                const selectedColor = e.target.value;
                if (selectedColor) {
                    if (customBtn) {
                        customBtn.style.setProperty('--accent-swatch-color', selectedColor);
                        const r = parseInt(selectedColor.slice(1, 3), 16);
                        const g = parseInt(selectedColor.slice(3, 5), 16);
                        const b = parseInt(selectedColor.slice(5, 7), 16);
                        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
                        const contrast = yiq >= 128 ? '#18181b' : '#ffffff';
                        customBtn.style.setProperty('--accent-swatch-contrast-color', contrast);
                    }
                    this.setAccentColor(selectedColor);
                }
            });
        }

        // Listen for accent color changes to update button active classes and panel visibility
        document.addEventListener('accent-color-changed', (e) => {
            const currentAccent = e.detail.accentColor;
            const buttons = selector.querySelectorAll('.accent-color-btn');

            const isCustom = currentAccent && currentAccent.startsWith('#');

            // Handle panel toggle
            if (customPickerPanel) {
                if (isCustom) {
                    customPickerPanel.classList.add('open');
                } else {
                    customPickerPanel.classList.remove('open');
                }
            }

            buttons.forEach(btn => {
                const btnVal = btn.getAttribute('data-value');
                if (btnVal === 'custom') {
                    if (isCustom) {
                        btn.classList.add('active');
                        btn.style.setProperty('--accent-swatch-color', currentAccent);
                        if (picker) picker.value = currentAccent;

                        // Calculate contrast color for checkmark
                        const r = parseInt(currentAccent.slice(1, 3), 16);
                        const g = parseInt(currentAccent.slice(3, 5), 16);
                        const b = parseInt(currentAccent.slice(5, 7), 16);
                        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
                        const contrast = yiq >= 128 ? '#18181b' : '#ffffff';
                        btn.style.setProperty('--accent-swatch-contrast-color', contrast);

                        // Update sliders to match
                        updateCustomPanelUI(currentAccent);
                    } else {
                        btn.classList.remove('active');
                        btn.style.setProperty('--accent-swatch-color', 'transparent');

                        // Prime the panel sliders with the active preset color for smooth transition
                        const preset = accentPresets[currentAccent] || accentPresets.blue;
                        const colors = preset[this.currentResolvedTheme] || preset.light;
                        updateCustomPanelUI(colors.color);
                    }
                } else {
                    if (btnVal === currentAccent) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
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
     * Set the desired accent color
     * @param {string} accentColorKey - 'blue', 'anthracite', or hex code like '#ff00ff'
     */
    setAccentColor(accentColorKey) {
        if (!accentPresets[accentColorKey] && (!accentColorKey || !accentColorKey.startsWith('#'))) return;

        appState.accentColor = accentColorKey;
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
        let colors = {};
        const effectiveTheme = this.currentResolvedTheme || 'light';

        if (key.startsWith('#')) {
            // Custom Color Key (Hex)
            const baseRgb = ColorUtils.hexToRgb(key);
            const baseHsl = ColorUtils.rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b);
            
            // Adjust luminosity based on theme resolved state to preserve WCAG contrast
            const adjustedL = ColorUtils.adjustLuminosity(baseHsl.h, baseHsl.s, baseHsl.l, effectiveTheme);
            const adjustedRgb = ColorUtils.hslToRgb(baseHsl.h, baseHsl.s, adjustedL);
            const primaryColor = ColorUtils.rgbToHex(adjustedRgb.r, adjustedRgb.g, adjustedRgb.b);
            const rgbString = `${adjustedRgb.r}, ${adjustedRgb.g}, ${adjustedRgb.b}`;
            
            // Hover color: shift luminosity relative to theme (always darken on hover to match presets)
            const hoverL = Math.max(0, adjustedL - 10);
            const hoverRgb = ColorUtils.hslToRgb(baseHsl.h, baseHsl.s, hoverL);
            const primaryHover = ColorUtils.rgbToHex(hoverRgb.r, hoverRgb.g, hoverRgb.b);

            colors = { color: primaryColor, rgb: rgbString, hover: primaryHover };
        } else {
            // Preset Color Key
            const preset = accentPresets[key] || accentPresets.blue;
            colors = preset[effectiveTheme] || preset.light;
        }

        document.documentElement.style.setProperty('--primary-color', colors.color);
        document.documentElement.style.setProperty('--primary-color-rgb', colors.rgb);
        document.documentElement.style.setProperty('--primary-hover', colors.hover);
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
        if (effectiveTheme === 'dark') {
            document.documentElement.dataset.theme = 'dark';
        } else {
            delete document.documentElement.dataset.theme;
        }

        // Update meta theme-color dynamically to match the header background
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', effectiveTheme === 'dark' ? '#18181b' : '#ffffff');
        }

        this.currentResolvedTheme = effectiveTheme;

        // Apply custom accent color
        this.applyAccentColor(appState.accentColor);

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
