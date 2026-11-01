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

    it('updates horizontal scroll affordances (can-scroll-left and can-scroll-right)', () => {
        const focusMainPage = document.getElementById('focusMainPage');
        const focusContent = focusMainPage.querySelector('.focus-content');

        Object.defineProperty(focusContent, 'scrollWidth', { value: 900, configurable: true });
        Object.defineProperty(focusContent, 'clientWidth', { value: 600, configurable: true });

        // At rest (scrollLeft = 0): only right scrim active
        focusContent.scrollLeft = 0;
        FocusPanelManager.updateScrollAffordances(focusContent);
        expect(focusContent.classList.contains('can-scroll-left')).toBe(false);
        expect(focusContent.classList.contains('can-scroll-right')).toBe(true);

        // Mid-scroll (scrollLeft = 120): both scrims active
        focusContent.scrollLeft = 120;
        FocusPanelManager.updateScrollAffordances(focusContent);
        expect(focusContent.classList.contains('can-scroll-left')).toBe(true);
        expect(focusContent.classList.contains('can-scroll-right')).toBe(true);

        // At right end (scrollLeft = 300): only left scrim active
        focusContent.scrollLeft = 300;
        FocusPanelManager.updateScrollAffordances(focusContent);
        expect(focusContent.classList.contains('can-scroll-left')).toBe(true);
        expect(focusContent.classList.contains('can-scroll-right')).toBe(false);
    });

    it('bindScrollAffordances binds scroll listener idempotently and invokes latest callback', () => {
        const scrollEl = document.createElement('div');
        Object.defineProperty(scrollEl, 'scrollWidth', { value: 800, configurable: true });
        Object.defineProperty(scrollEl, 'clientWidth', { value: 400, configurable: true });
        scrollEl.scrollLeft = 0;

        let callbackCount = 0;
        FocusPanelManager.bindScrollAffordances(scrollEl, () => { callbackCount += 1; });
        expect(scrollEl.classList.contains('can-scroll-right')).toBe(true);
        expect(scrollEl.classList.contains('can-scroll-left')).toBe(false);

        // Re-binding updates callback without duplicating the scroll listener
        FocusPanelManager.bindScrollAffordances(scrollEl, () => { callbackCount += 10; });

        scrollEl.scrollLeft = 100;
        scrollEl.dispatchEvent(new Event('scroll'));

        expect(scrollEl.classList.contains('can-scroll-left')).toBe(true);
        expect(scrollEl.classList.contains('can-scroll-right')).toBe(true);
        expect(callbackCount).toBe(10);
    });

    it('clears top/left scrims if content does not overflow even with stale scrollTop/scrollLeft > 4', () => {
        const scrollEl = document.createElement('div');
        Object.defineProperty(scrollEl, 'scrollHeight', { value: 300, configurable: true });
        Object.defineProperty(scrollEl, 'clientHeight', { value: 300, configurable: true });
        Object.defineProperty(scrollEl, 'scrollWidth', { value: 400, configurable: true });
        Object.defineProperty(scrollEl, 'clientWidth', { value: 400, configurable: true });
        scrollEl.scrollTop = 40;
        scrollEl.scrollLeft = 40;

        FocusPanelManager.updateScrollAffordances(scrollEl);
        expect(scrollEl.classList.contains('can-scroll-top')).toBe(false);
        expect(scrollEl.classList.contains('can-scroll-bottom')).toBe(false);
        expect(scrollEl.classList.contains('can-scroll-left')).toBe(false);
        expect(scrollEl.classList.contains('can-scroll-right')).toBe(false);
    });

    it('updates scroll affordances when a nested <details> accordion dispatches toggle', () => {
        const scrollEl = document.createElement('div');
        const detailsEl = document.createElement('details');
        scrollEl.appendChild(detailsEl);

        Object.defineProperty(scrollEl, 'scrollHeight', { value: 300, configurable: true });
        Object.defineProperty(scrollEl, 'clientHeight', { value: 300, configurable: true });
        scrollEl.scrollTop = 0;

        FocusPanelManager.bindScrollAffordances(scrollEl);
        expect(scrollEl.classList.contains('can-scroll-bottom')).toBe(false);

        // Expanding the accordion increases scrollHeight
        Object.defineProperty(scrollEl, 'scrollHeight', { value: 650, configurable: true });
        detailsEl.dispatchEvent(new Event('toggle', { bubbles: false }));
        expect(scrollEl.classList.contains('can-scroll-bottom')).toBe(true);
    });

    it('observes container and direct children via ResizeObserver to refresh scrims when dynamic content grows', () => {
        const observed = [];
        let roCallback = null;
        const OriginalRO = globalThis.ResizeObserver;
        globalThis.ResizeObserver = class {
            constructor(cb) { roCallback = cb; }
            observe(el) { observed.push(el); }
        };

        try {
            const scrollEl = document.createElement('div');
            const tabChild = document.createElement('div');
            scrollEl.appendChild(tabChild);

            Object.defineProperty(scrollEl, 'scrollHeight', { value: 300, configurable: true });
            Object.defineProperty(scrollEl, 'clientHeight', { value: 300, configurable: true });
            scrollEl.scrollTop = 0;

            FocusPanelManager.bindScrollAffordances(scrollEl);
            expect(observed).toContain(scrollEl);
            expect(observed).toContain(tabChild);
            expect(scrollEl.classList.contains('can-scroll-bottom')).toBe(false);

            Object.defineProperty(scrollEl, 'scrollHeight', { value: 700, configurable: true });
            roCallback?.();
            expect(scrollEl.classList.contains('can-scroll-bottom')).toBe(true);
        } finally {
            globalThis.ResizeObserver = OriginalRO;
        }
    });
});
