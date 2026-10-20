import { appState, UIState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';

export const ColorUtils = {
    hexToRgb(hex) {
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        const fullHex = String(hex || '').replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
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
        let h, s;
        const l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
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
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    },

    rgbToHex(r, g, b) {
        const toHex = x => {
            const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return '#' + toHex(r) + toHex(g) + toHex(b);
    }
};

export const PRESET_HEX_MAP = {
    blue: '#3b82f6',
    purple: '#8b5cf6',
    pink: '#ec4899',
    teal: '#06b6d4',
    green: '#10b981',
    orange: '#f97316'
};

export const ThemeManager = {
    currentResolvedTheme: 'light',
    systemMediaQuery: null,
    VALID_ACCENTS: ['blue', 'purple', 'pink', 'orange', 'green', 'teal'],
    _lastCustomHex: '',
    _CUSTOM_CSS_VARS: [
        '--primary-color',
        '--primary-color-rgb',
        '--primary-hover',
        '--primary-bright',
        '--primary-bright-rgb'
    ],

    isValidHex(val) {
        return typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val.trim());
    },

    getSavedCustomHex() {
        if (this.isValidHex(this._lastCustomHex)) return this._lastCustomHex;
        try {
            const stored = localStorage.getItem('bulletin_custom_accent');
            if (this.isValidHex(stored)) {
                this._lastCustomHex = stored.trim().toLowerCase();
                return this._lastCustomHex;
            }
        } catch (e) {}
        return '';
    },

    normalizeAccent(val) {
        if (this.VALID_ACCENTS.includes(val)) return val;
        if (this.isValidHex(val)) return val.trim().toLowerCase();
        return 'blue';
    },

    init() {
        this.hydrateFromLocalStorage();

        this.systemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.systemMediaQuery.addEventListener('change', () => {
            if (appState.theme === 'system') {
                this.applyTheme();
            }
        });

        this.initSegmentedControl();
        this.initAccentControl();
        this.applyTheme();
    },

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
            const storedCustom = localStorage.getItem('bulletin_custom_accent') || '';
            if (this.isValidHex(storedCustom)) {
                this._lastCustomHex = storedCustom.trim().toLowerCase();
            }
            if (this.VALID_ACCENTS.includes(storedAccent) || this.isValidHex(storedAccent)) {
                appState.accentColor = this.normalizeAccent(storedAccent);
                if (this.isValidHex(appState.accentColor)) {
                    this._lastCustomHex = appState.accentColor;
                }
            }
        } catch (e) {}
    },

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

    initAccentControl() {
        const selector = document.getElementById('accentColorSelector');
        if (!selector || selector._accentBound) return;
        selector._accentBound = true;

        const panel = document.getElementById('customPickerPanel');
        const hueSlider = document.getElementById('pickerHueSlider');
        const satSlider = document.getElementById('pickerSatSlider');
        const ligSlider = document.getElementById('pickerLigSlider');
        const hexInput = document.getElementById('pickerHexInput');
        const eyedropperBtn = document.getElementById('pickerEyedropperBtn');
        const confirmBtn = document.getElementById('pickerConfirmBtn');
        const livePreview = document.getElementById('pickerLivePreview');
        const fallbackColorInput = document.getElementById('customColorPicker');

        selector.addEventListener('click', (e) => {
            const swatch = e.target.closest('.accent-color-swatch');
            if (!swatch) return;
            const color = swatch.getAttribute('data-color');
            if (!color) return;

            if (color === 'custom') {
                const alreadyCustom = this.isValidHex(appState.accentColor);
                const seedHex = alreadyCustom
                    ? appState.accentColor
                    : (this.getSavedCustomHex() || PRESET_HEX_MAP[appState.accentColor] || '#3b82f6');

                if (panel) {
                    const willOpen = alreadyCustom ? !panel.classList.contains('open') : true;
                    panel.classList.toggle('open', willOpen);
                }
                this._syncPickerControlsFromHex(seedHex);
                if (!alreadyCustom) {
                    this.setAccentColor(seedHex);
                }
                return;
            }

            if (panel) panel.classList.remove('open');
            this.setAccentColor(color);
        });

        const onSliderInput = () => {
            if (!hueSlider || !satSlider || !ligSlider) return;
            const h = parseInt(hueSlider.value, 10) || 0;
            const s = parseInt(satSlider.value, 10) || 0;
            const l = parseInt(ligSlider.value, 10) || 50;
            const rgb = ColorUtils.hslToRgb(h, s, l);
            const hex = ColorUtils.rgbToHex(rgb.r, rgb.g, rgb.b);
            this._updateSliderGradients(h, s, l, hex);
            if (hexInput && document.activeElement !== hexInput) {
                hexInput.value = hex.slice(1).toUpperCase();
            }
            this.setAccentColor(hex, false, false);
        };

        const onSliderCommit = () => {
            StorageManager.saveAppState();
        };

        [hueSlider, satSlider, ligSlider].forEach(slider => {
            if (!slider) return;
            slider.addEventListener('input', onSliderInput);
            slider.addEventListener('change', onSliderCommit);
        });

        if (hexInput) {
            hexInput.addEventListener('input', () => {
                const raw = hexInput.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                if (hexInput.value !== raw) hexInput.value = raw;
                if (raw.length === 6) {
                    const hex = '#' + raw.toLowerCase();
                    this._syncPickerControlsFromHex(hex, false);
                    this.setAccentColor(hex);
                }
            });
        }

        if (eyedropperBtn) {
            eyedropperBtn.addEventListener('click', async () => {
                if (window.EyeDropper) {
                    try {
                        const eyeDropper = new window.EyeDropper();
                        const result = await eyeDropper.open();
                        if (result?.sRGBHex && this.isValidHex(result.sRGBHex)) {
                            const hex = result.sRGBHex.toLowerCase();
                            this._syncPickerControlsFromHex(hex);
                            this.setAccentColor(hex);
                        }
                    } catch (e) {}
                } else if (fallbackColorInput) {
                    fallbackColorInput.click();
                }
            });
        }

        if (fallbackColorInput) {
            fallbackColorInput.addEventListener('input', (e) => {
                const hex = e.target.value;
                if (this.isValidHex(hex)) {
                    this._syncPickerControlsFromHex(hex);
                    this.setAccentColor(hex);
                }
            });
        }

        const closePanel = () => {
            if (panel) panel.classList.remove('open');
        };
        if (confirmBtn) confirmBtn.addEventListener('click', closePanel);
        if (livePreview) livePreview.addEventListener('click', closePanel);
    },

    _syncPickerControlsFromHex(hex, updateHexInput = true) {
        const rgb = ColorUtils.hexToRgb(hex);
        const hsl = ColorUtils.rgbToHsl(rgb.r, rgb.g, rgb.b);
        const clampedL = Math.max(20, Math.min(85, hsl.l));

        const hueSlider = document.getElementById('pickerHueSlider');
        const satSlider = document.getElementById('pickerSatSlider');
        const ligSlider = document.getElementById('pickerLigSlider');
        const hexInput = document.getElementById('pickerHexInput');

        if (hueSlider) hueSlider.value = String(hsl.h);
        if (satSlider) satSlider.value = String(hsl.s);
        if (ligSlider) ligSlider.value = String(clampedL);
        if (updateHexInput && hexInput) {
            hexInput.value = hex.slice(1).toUpperCase();
        }
        this._updateSliderGradients(hsl.h, hsl.s, clampedL, hex);
    },

    _updateSliderGradients(h, s, l, hex) {
        const panel = document.getElementById('customPickerPanel');
        if (!panel) return;
        const satEndRgb = ColorUtils.hslToRgb(h, 100, l);
        const satStartRgb = ColorUtils.hslToRgb(h, 0, l);
        const ligMidRgb = ColorUtils.hslToRgb(h, s, 50);

        panel.style.setProperty('--sat-start', ColorUtils.rgbToHex(satStartRgb.r, satStartRgb.g, satStartRgb.b));
        panel.style.setProperty('--sat-end', ColorUtils.rgbToHex(satEndRgb.r, satEndRgb.g, satEndRgb.b));
        panel.style.setProperty('--lig-start', ColorUtils.rgbToHex(
            Math.round(ligMidRgb.r * 0.25),
            Math.round(ligMidRgb.g * 0.25),
            Math.round(ligMidRgb.b * 0.25)
        ));
        panel.style.setProperty('--lig-end', ColorUtils.rgbToHex(
            Math.min(255, Math.round(ligMidRgb.r + (255 - ligMidRgb.r) * 0.7)),
            Math.min(255, Math.round(ligMidRgb.g + (255 - ligMidRgb.g) * 0.7)),
            Math.min(255, Math.round(ligMidRgb.b + (255 - ligMidRgb.b) * 0.7))
        ));
        panel.style.setProperty('--slider-thumb-color', hex);
    },

    setTheme(themeName) {
        if (!['light', 'dark', 'system'].includes(themeName)) return;

        appState.theme = themeName;
        if (UIState?.settingsBeforeEdit && UIState.settingsBeforeEdit.theme !== undefined) {
            UIState.settingsBeforeEdit.theme = themeName;
        }
        try {
            localStorage.setItem('bulletin_theme', themeName);
        } catch (e) {}
        this.applyTheme();
        StorageManager.saveAppState();
    },

    setAccentColor(colorName, persist = true, syncControls = true) {
        const validColor = this.normalizeAccent(colorName);
        appState.accentColor = validColor;
        if (UIState?.settingsBeforeEdit && UIState.settingsBeforeEdit.accentColor !== undefined) {
            UIState.settingsBeforeEdit.accentColor = validColor;
        }
        this.applyAccentColor(validColor, syncControls);
        if (persist) {
            StorageManager.saveAppState();
        }
    },

    applyAccentColor(colorName = appState.accentColor, syncControls = true) {
        const validColor = this.normalizeAccent(colorName);
        const isCustom = this.isValidHex(validColor);
        const rootStyle = document.documentElement.style;

        if (!isCustom) {
            this._CUSTOM_CSS_VARS.forEach(prop => rootStyle.removeProperty(prop));
            if (validColor === 'blue') {
                delete document.documentElement.dataset.accent;
            } else {
                document.documentElement.dataset.accent = validColor;
            }
        } else {
            document.documentElement.dataset.accent = 'custom';
            this._lastCustomHex = validColor;
            try {
                localStorage.setItem('bulletin_custom_accent', validColor);
            } catch (e) {}
            const isDark = (document.documentElement.dataset.theme || this.currentResolvedTheme) === 'dark';
            const rgb = ColorUtils.hexToRgb(validColor);
            const hsl = ColorUtils.rgbToHsl(rgb.r, rgb.g, rgb.b);

            const hoverL = isDark ? Math.min(85, hsl.l + 8) : Math.max(15, hsl.l - 8);
            const hoverRgb = ColorUtils.hslToRgb(hsl.h, hsl.s, hoverL);
            const hoverHex = ColorUtils.rgbToHex(hoverRgb.r, hoverRgb.g, hoverRgb.b);

            const brightL = isDark ? Math.max(70, Math.min(84, hsl.l + 18)) : Math.min(hsl.l, 50);
            const brightRgb = (!isDark && hsl.l <= 50) ? rgb : ColorUtils.hslToRgb(hsl.h, hsl.s, brightL);
            const brightHex = (!isDark && hsl.l <= 50) ? validColor : ColorUtils.rgbToHex(brightRgb.r, brightRgb.g, brightRgb.b);

            rootStyle.setProperty('--primary-color', validColor);
            rootStyle.setProperty('--primary-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
            rootStyle.setProperty('--primary-hover', hoverHex);
            rootStyle.setProperty('--primary-bright', brightHex);
            rootStyle.setProperty('--primary-bright-rgb', `${brightRgb.r}, ${brightRgb.g}, ${brightRgb.b}`);
        }

        const savedCustom = this.getSavedCustomHex();
        const selector = document.getElementById('accentColorSelector');
        if (selector) {
            selector.querySelectorAll('.accent-color-swatch').forEach(swatch => {
                const swatchColor = swatch.getAttribute('data-color');
                const isActive = isCustom ? swatchColor === 'custom' : swatchColor === validColor;
                swatch.classList.toggle('active', isActive);
                swatch.setAttribute('aria-checked', String(isActive));
                if (swatchColor === 'custom' && (isCustom || savedCustom)) {
                    swatch.style.setProperty('--swatch-color', isCustom ? validColor : savedCustom);
                }
            });
        }

        if (isCustom && syncControls) {
            this._syncPickerControlsFromHex(validColor);
        }
    },

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

    updateUI() {
        const control = document.getElementById('themeSegmentedControl');
        if (!control) return;

        const currentMode = appState.theme || 'light';
        control.setAttribute('data-active', currentMode);

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
