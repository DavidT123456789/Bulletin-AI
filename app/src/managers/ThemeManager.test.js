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
        `;
        document.documentElement.removeAttribute('data-theme');
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
        it('should hydrate dark theme and accentColor from standalone localStorage keys before initial applyTheme', () => {
            localStorage.setItem('bulletin_theme', 'dark');
            localStorage.setItem('bulletin_accent_color', 'rose');

            ThemeManager.init();

            expect(appState.theme).toBe('dark');
            expect(appState.accentColor).toBe('rose');
            expect(document.documentElement.dataset.theme).toBe('dark');
            expect(document.documentElement.style.backgroundColor).toBe('rgb(9, 9, 11)');
            expect(document.documentElement.style.colorScheme).toBe('dark');
            expect(localStorage.getItem('bulletin_theme')).toBe('dark');
        });

        it('should fallback to appreciationGeneratorState_v6.2 when standalone keys are absent', () => {
            localStorage.setItem('appreciationGeneratorState_v6.2', JSON.stringify({
                settings: { theme: 'dark', accentColor: '#8b5cf6' }
            }));

            ThemeManager.hydrateFromLocalStorage();

            expect(appState.theme).toBe('dark');
            expect(appState.accentColor).toBe('#8b5cf6');
        });

        it('should ignore invalid or empty values in localStorage and keep current appState defaults', () => {
            localStorage.setItem('bulletin_theme', 'invalid-theme');
            localStorage.setItem('bulletin_accent_color', 'invalid-accent');

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
});
