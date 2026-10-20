// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThemeManager, ColorUtils } from './ThemeManager.js';
import { appState, UIState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';

vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
}));

describe('ThemeManager', () => {
    let mediaChangeHandler = null;
    let mockMatches = false;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();

        appState.theme = 'light';
        appState.accentColor = 'blue';
        ThemeManager.currentResolvedTheme = 'light';
        ThemeManager._lastCustomHex = '';

        document.head.innerHTML = `
            <meta name="color-scheme" content="light dark">
            <meta name="theme-color" id="theme-color-light" media="(prefers-color-scheme: light)" content="#f7f7f8">
            <meta name="theme-color" id="theme-color-dark" media="(prefers-color-scheme: dark)" content="#09090b">
        `;
        document.body.innerHTML = `
            <div id="themeSegmentedControl">
                <button class="ui-segment" data-value="light"></button>
                <button class="ui-segment" data-value="dark"></button>
                <button class="ui-segment" data-value="system"></button>
            </div>
            <div id="accentColorSelector">
                <button class="accent-color-swatch active" data-color="blue"></button>
                <button class="accent-color-swatch" data-color="purple"></button>
                <button class="accent-color-swatch" data-color="teal"></button>
                <button class="accent-color-swatch custom-picker" id="customAccentBtn" data-color="custom"></button>
            </div>
            <div class="custom-picker-panel" id="customPickerPanel">
                <input type="range" id="pickerHueSlider" min="0" max="360" value="217">
                <input type="range" id="pickerSatSlider" min="0" max="100" value="91">
                <input type="range" id="pickerLigSlider" min="20" max="85" value="60">
                <input type="text" id="pickerHexInput" value="3B82F6">
                <button type="button" id="pickerEyedropperBtn"></button>
                <button type="button" id="pickerConfirmBtn"></button>
                <div id="pickerLivePreview"></div>
            </div>
        `;
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-accent');
        document.documentElement.style.cssText = '';
        document.body.style.backgroundColor = '';

        mockMatches = false;
        mediaChangeHandler = null;
        window.matchMedia = vi.fn().mockImplementation(() => ({
            get matches() {
                return mockMatches;
            },
            addEventListener: vi.fn((event, cb) => {
                if (event === 'change') mediaChangeHandler = cb;
            })
        }));
    });

    describe('hydrateFromLocalStorage & init', () => {
        it('should hydrate dark theme from standalone localStorage key before initial applyTheme', () => {
            localStorage.setItem('bulletin_theme', 'dark');

            ThemeManager.init();

            expect(appState.theme).toBe('dark');
            expect(document.documentElement.dataset.theme).toBe('dark');
            expect(document.documentElement.style.backgroundColor).toBe('rgb(9, 9, 11)');
            expect(document.documentElement.style.colorScheme).toBe('dark');
            expect(localStorage.getItem('bulletin_theme')).toBe('dark');
        });

        it('should fallback to appreciationGeneratorState_v6.2 when standalone key is absent and hydrate accentColor (preset or custom hex)', () => {
            localStorage.setItem('appreciationGeneratorState_v6.2', JSON.stringify({
                settings: { theme: 'dark', accentColor: '#ff0055' }
            }));

            ThemeManager.hydrateFromLocalStorage();

            expect(appState.theme).toBe('dark');
            expect(appState.accentColor).toBe('#ff0055');
        });

        it('should ignore invalid or empty values in localStorage and keep current appState defaults', () => {
            localStorage.setItem('bulletin_theme', 'invalid-theme');
            localStorage.setItem('appreciationGeneratorState_v6.2', JSON.stringify({
                settings: { accentColor: 'not-a-color' }
            }));

            ThemeManager.hydrateFromLocalStorage();

            expect(appState.theme).toBe('light');
            expect(appState.accentColor).toBe('blue');
        });

        it('should safely handle corrupted JSON or localStorage exceptions (fallback)', () => {
            localStorage.setItem('appreciationGeneratorState_v6.2', '{corrupted-json');

            expect(() => ThemeManager.hydrateFromLocalStorage()).not.toThrow();
            expect(appState.theme).toBe('light');
        });
    });

    describe('applyTheme & Android system bar synchronization', () => {
        it('should synchronize dataset.theme, root/body background, color-scheme, and all theme-color meta tags in dark mode', () => {
            appState.theme = 'dark';

            ThemeManager.applyTheme();

            expect(document.documentElement.dataset.theme).toBe('dark');
            expect(document.documentElement.style.backgroundColor).toBe('rgb(9, 9, 11)');
            expect(document.documentElement.style.colorScheme).toBe('dark');
            expect(document.body.style.backgroundColor).toBe('rgb(9, 9, 11)');
            expect(document.querySelector('meta[name="color-scheme"]').getAttribute('content')).toBe('dark');

            const themeMetas = document.querySelectorAll('meta[name="theme-color"]');
            themeMetas.forEach(meta => {
                expect(meta.getAttribute('content')).toBe('#09090b');
            });
        });

        it('should synchronize dataset.theme, root/body background, color-scheme, and all theme-color meta tags in light mode', () => {
            appState.theme = 'light';

            ThemeManager.applyTheme();

            expect(document.documentElement.dataset.theme).toBe('light');
            expect(document.documentElement.style.backgroundColor).toBe('rgb(247, 247, 248)');
            expect(document.documentElement.style.colorScheme).toBe('light');
            expect(document.body.style.backgroundColor).toBe('rgb(247, 247, 248)');
            expect(document.querySelector('meta[name="color-scheme"]').getAttribute('content')).toBe('light');

            const themeMetas = document.querySelectorAll('meta[name="theme-color"]');
            themeMetas.forEach(meta => {
                expect(meta.getAttribute('content')).toBe('#f7f7f8');
            });
        });

        it('should resolve system theme dynamically based on prefers-color-scheme and update on OS change', () => {
            mockMatches = true;
            localStorage.setItem('bulletin_theme', 'system');

            ThemeManager.init();

            expect(ThemeManager.currentResolvedTheme).toBe('dark');
            expect(document.documentElement.dataset.theme).toBe('dark');
            expect(document.querySelector('#theme-color-light').getAttribute('content')).toBe('#09090b');

            mockMatches = false;
            if (mediaChangeHandler) mediaChangeHandler();

            expect(ThemeManager.currentResolvedTheme).toBe('light');
            expect(document.documentElement.dataset.theme).toBe('light');
            expect(document.querySelector('#theme-color-dark').getAttribute('content')).toBe('#f7f7f8');
        });

        it('should default to light when appState.theme has an unexpected value', () => {
            appState.theme = null;
            document.head.innerHTML = '';

            expect(() => ThemeManager.applyTheme()).not.toThrow();
            expect(document.documentElement.dataset.theme).toBe('light');
            expect(document.documentElement.style.colorScheme).toBe('light');
        });
    });

    describe('setTheme', () => {
        it('should persist theme to localStorage, apply theme, and save app state', () => {
            ThemeManager.setTheme('dark');

            expect(appState.theme).toBe('dark');
            expect(localStorage.getItem('bulletin_theme')).toBe('dark');
            expect(document.documentElement.dataset.theme).toBe('dark');
            expect(StorageManager.saveAppState).toHaveBeenCalledTimes(1);
        });

        it('should ignore unsupported theme names', () => {
            ThemeManager.setTheme('neon');

            expect(appState.theme).toBe('light');
            expect(StorageManager.saveAppState).not.toHaveBeenCalled();
        });
    });

    describe('Accent Color Presets & Custom Hex Picker', () => {
        it('should set data-accent on documentElement, update active swatch, and save state for non-default presets', () => {
            ThemeManager.setAccentColor('purple');

            expect(appState.accentColor).toBe('purple');
            expect(document.documentElement.dataset.accent).toBe('purple');
            expect(document.querySelector('[data-color="purple"]').classList.contains('active')).toBe(true);
            expect(document.querySelector('[data-color="blue"]').classList.contains('active')).toBe(false);
            expect(StorageManager.saveAppState).toHaveBeenCalledTimes(1);
        });

        it('should apply custom hex color with data-accent="custom" and clean up inline variables when switching back to a preset', () => {
            ThemeManager.setAccentColor('#e11d48');

            expect(appState.accentColor).toBe('#e11d48');
            expect(document.documentElement.dataset.accent).toBe('custom');
            expect(document.documentElement.style.getPropertyValue('--primary-color')).toBe('#e11d48');
            expect(document.documentElement.style.getPropertyValue('--primary-color-rgb')).toBe('225, 29, 72');
            expect(document.documentElement.style.getPropertyValue('--primary-bright')).toMatch(/^#[0-9a-f]{6}$/);
            expect(document.querySelector('[data-color="custom"]').classList.contains('active')).toBe(true);

            ThemeManager.setAccentColor('blue');
            expect(appState.accentColor).toBe('blue');
            expect(document.documentElement.dataset.accent).toBeUndefined();
            expect(document.documentElement.style.getPropertyValue('--primary-color')).toBe('');
            expect(document.querySelector('[data-color="blue"]').classList.contains('active')).toBe(true);
        });

        it('should toggle custom picker panel when clicking custom swatch and support EyeDropper selection', async () => {
            window.EyeDropper = class {
                async open() {
                    return { sRGBHex: '#0EA5E9' };
                }
            };
            ThemeManager.initAccentControl();

            const customSwatch = document.getElementById('customAccentBtn');
            const panel = document.getElementById('customPickerPanel');
            customSwatch.click();
            expect(panel.classList.contains('open')).toBe(true);

            const eyedropperBtn = document.getElementById('pickerEyedropperBtn');
            await eyedropperBtn.click();

            expect(appState.accentColor).toBe('#0ea5e9');
            expect(document.documentElement.dataset.accent).toBe('custom');
            expect(document.documentElement.style.getPropertyValue('--primary-color')).toBe('#0ea5e9');

            delete window.EyeDropper;
        });

        it('should remember the last custom hex color when switching to a preset and clicking the custom swatch again', () => {
            ThemeManager.initAccentControl();

            const customSwatch = document.getElementById('customAccentBtn');
            const tealSwatch = document.querySelector('[data-color="teal"]');
            const hexInput = document.getElementById('pickerHexInput');

            ThemeManager.setAccentColor('#d946ef');
            expect(appState.accentColor).toBe('#d946ef');
            expect(localStorage.getItem('bulletin_custom_accent')).toBe('#d946ef');

            tealSwatch.click();
            expect(appState.accentColor).toBe('teal');
            expect(document.documentElement.dataset.accent).toBe('teal');

            customSwatch.click();
            expect(appState.accentColor).toBe('#d946ef');
            expect(document.documentElement.dataset.accent).toBe('custom');
            expect(hexInput.value).toBe('D946EF');
        });

        it('should synchronize UIState.settingsBeforeEdit when accent color or theme changes so closing settings modal via X does not revert it', () => {
            UIState.settingsBeforeEdit = { theme: 'light', accentColor: 'blue' };

            ThemeManager.setTheme('dark');
            ThemeManager.setAccentColor('#ec4899');

            expect(UIState.settingsBeforeEdit.theme).toBe('dark');
            expect(UIState.settingsBeforeEdit.accentColor).toBe('#ec4899');
        });

        it('should convert between Hex, RGB, and HSL accurately via ColorUtils', () => {
            const rgb = ColorUtils.hexToRgb('#3b82f6');
            expect(rgb).toEqual({ r: 59, g: 130, b: 246 });
            const hsl = ColorUtils.rgbToHsl(rgb.r, rgb.g, rgb.b);
            expect(hsl.h).toBeGreaterThan(210);
            expect(hsl.h).toBeLessThan(225);
            const backRgb = ColorUtils.hslToRgb(hsl.h, hsl.s, hsl.l);
            expect(ColorUtils.rgbToHex(backRgb.r, backRgb.g, backRgb.b)).toMatch(/^#[0-9a-f]{6}$/);
        });
    });
});
