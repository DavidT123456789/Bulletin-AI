// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThemeManager } from './ThemeManager.js';
import { appState } from '../state/State.js';
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
            </div>
        `;
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-accent');
        document.documentElement.style.backgroundColor = '';
        document.documentElement.style.colorScheme = '';
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

        it('should fallback to appreciationGeneratorState_v6.2 when standalone key is absent and hydrate accentColor', () => {
            localStorage.setItem('appreciationGeneratorState_v6.2', JSON.stringify({
                settings: { theme: 'dark', accentColor: 'purple' }
            }));

            ThemeManager.hydrateFromLocalStorage();

            expect(appState.theme).toBe('dark');
            expect(appState.accentColor).toBe('purple');
        });

        it('should ignore invalid or empty values in localStorage and keep current appState defaults', () => {
            localStorage.setItem('bulletin_theme', 'invalid-theme');
            localStorage.setItem('appreciationGeneratorState_v6.2', JSON.stringify({
                settings: { accentColor: '#ff0055' }
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

    describe('Accent Color Presets (data-accent)', () => {
        it('should set data-accent on documentElement, update active swatch, and save state for non-default presets', () => {
            ThemeManager.setAccentColor('purple');

            expect(appState.accentColor).toBe('purple');
            expect(document.documentElement.dataset.accent).toBe('purple');
            expect(document.querySelector('[data-color="purple"]').classList.contains('active')).toBe(true);
            expect(document.querySelector('[data-color="blue"]').classList.contains('active')).toBe(false);
            expect(StorageManager.saveAppState).toHaveBeenCalledTimes(1);
        });

        it('should remove data-accent attribute when resetting to blue or given an invalid legacy value', () => {
            ThemeManager.setAccentColor('teal');
            expect(document.documentElement.dataset.accent).toBe('teal');

            ThemeManager.setAccentColor('#123456');
            expect(appState.accentColor).toBe('blue');
            expect(document.documentElement.dataset.accent).toBeUndefined();
            expect(document.querySelector('[data-color="blue"]').classList.contains('active')).toBe(true);
        });

        it('should update accent color when clicking a swatch in #accentColorSelector', () => {
            ThemeManager.initAccentControl();
            const tealSwatch = document.querySelector('[data-color="teal"]');
            tealSwatch.click();

            expect(appState.accentColor).toBe('teal');
            expect(document.documentElement.dataset.accent).toBe('teal');
            expect(tealSwatch.getAttribute('aria-checked')).toBe('true');
        });
    });
});
