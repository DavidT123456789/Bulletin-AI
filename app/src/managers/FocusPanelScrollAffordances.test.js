import { describe, it, expect, beforeEach } from 'vitest';
import { FocusPanelManager } from './FocusPanelManager.js';

describe('FocusPanelManager - Scroll Affordances (Edge Scrims)', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="focusPanel" class="focus-panel">
                <div class="focus-header"></div>
                <div class="focus-main-page" id="focusMainPage">
                    <div class="focus-content"></div>
                </div>
            </div>
        `;
    });

    it('safely handles missing DOM elements without error', () => {
        document.body.innerHTML = '';
        expect(() => FocusPanelManager.updateScrollAffordances()).not.toThrow();
    });

    it('does not show top scrim when at rest (scrollTop = 0)', () => {
        const focusMainPage = document.getElementById('focusMainPage');
        const focusContent = focusMainPage.querySelector('.focus-content');

        focusContent.scrollTop = 0;
        Object.defineProperty(focusContent, 'scrollHeight', { value: 800, configurable: true });
        Object.defineProperty(focusContent, 'clientHeight', { value: 400, configurable: true });

        FocusPanelManager.updateScrollAffordances();

        expect(focusMainPage.classList.contains('can-scroll-top')).toBe(false);
    });

    it('shows top scrim when scrolled down (scrollTop > 4)', () => {
        const focusMainPage = document.getElementById('focusMainPage');
        const focusContent = focusMainPage.querySelector('.focus-content');

        focusContent.scrollTop = 50;
        Object.defineProperty(focusContent, 'scrollHeight', { value: 800, configurable: true });
        Object.defineProperty(focusContent, 'clientHeight', { value: 400, configurable: true });

        FocusPanelManager.updateScrollAffordances();

        expect(focusMainPage.classList.contains('can-scroll-top')).toBe(true);
    });

    it('does not show bottom scrim when content does not overflow (scrollHeight <= clientHeight)', () => {
        const focusMainPage = document.getElementById('focusMainPage');
        const focusContent = focusMainPage.querySelector('.focus-content');

        focusContent.scrollTop = 0;
        Object.defineProperty(focusContent, 'scrollHeight', { value: 400, configurable: true });
        Object.defineProperty(focusContent, 'clientHeight', { value: 400, configurable: true });

        FocusPanelManager.updateScrollAffordances();

        expect(focusMainPage.classList.contains('can-scroll-bottom')).toBe(false);
        expect(focusMainPage.classList.contains('can-scroll-top')).toBe(false);
    });

    it('shows bottom scrim when content overflows and not at bottom', () => {
        const focusMainPage = document.getElementById('focusMainPage');
        const focusContent = focusMainPage.querySelector('.focus-content');

        focusContent.scrollTop = 0;
        Object.defineProperty(focusContent, 'scrollHeight', { value: 1000, configurable: true });
        Object.defineProperty(focusContent, 'clientHeight', { value: 500, configurable: true });

        FocusPanelManager.updateScrollAffordances();

        expect(focusMainPage.classList.contains('can-scroll-bottom')).toBe(true);
    });

    it('hides bottom scrim when user reaches the bottom (remaining scroll <= 4)', () => {
        const focusMainPage = document.getElementById('focusMainPage');
        const focusContent = focusMainPage.querySelector('.focus-content');

        Object.defineProperty(focusContent, 'scrollHeight', { value: 1000, configurable: true });
        Object.defineProperty(focusContent, 'clientHeight', { value: 500, configurable: true });
        focusContent.scrollTop = 500; // maxScroll = 1000 - 500 = 500

        FocusPanelManager.updateScrollAffordances();

        expect(focusMainPage.classList.contains('can-scroll-bottom')).toBe(false);
        expect(focusMainPage.classList.contains('can-scroll-top')).toBe(true);
    });

    it('restores bottom scrim when user scrolls back up from the bottom', () => {
        const focusMainPage = document.getElementById('focusMainPage');
        const focusContent = focusMainPage.querySelector('.focus-content');

        Object.defineProperty(focusContent, 'scrollHeight', { value: 1000, configurable: true });
        Object.defineProperty(focusContent, 'clientHeight', { value: 500, configurable: true });
        focusContent.scrollTop = 450; // remaining = 500 - 450 = 50 > 4

        FocusPanelManager.updateScrollAffordances();

        expect(focusMainPage.classList.contains('can-scroll-bottom')).toBe(true);
        expect(focusMainPage.classList.contains('can-scroll-top')).toBe(true);
    });
});
