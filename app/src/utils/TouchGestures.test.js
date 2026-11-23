/**
 * @fileoverview Unit tests for shared mobile touch gesture primitives
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldIgnoreHorizontalSwipeTarget, attachSheetPullToDismiss, attachLeftEdgeDismiss } from './TouchGestures.js';

const dispatchTouch = (el, type, x, y, extra = {}) => {
    const evt = new Event(type, { cancelable: true, bubbles: true });
    if (type === 'touchend' || type === 'touchcancel') {
        evt.touches = [];
        evt.changedTouches = [{ clientX: x, clientY: y }];
    } else {
        evt.touches = [{ clientX: x, clientY: y }];
    }
    if (typeof extra.timeStamp === 'number') {
        Object.defineProperty(evt, 'timeStamp', { value: extra.timeStamp, configurable: true });
    }
    el.dispatchEvent(evt);
    return evt;
};

describe('TouchGestures', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('shouldIgnoreHorizontalSwipeTarget', () => {
        it('allows swipe on unfocused textarea, input, contenteditable, and resting buttons', () => {
            document.body.innerHTML = `
                <div id="focusPanel">
                    <div class="focus-content">
                        <textarea id="ctx"></textarea>
                        <input id="grade" type="text" />
                        <div id="appreciation" contenteditable="true">Texte</div>
                        <button id="genBtn" type="button">Générer</button>
                    </div>
                </div>
            `;

            expect(shouldIgnoreHorizontalSwipeTarget(document.getElementById('ctx'))).toBe(false);
            expect(shouldIgnoreHorizontalSwipeTarget(document.getElementById('grade'))).toBe(false);
            expect(shouldIgnoreHorizontalSwipeTarget(document.getElementById('appreciation'))).toBe(false);
            expect(shouldIgnoreHorizontalSwipeTarget(document.getElementById('genBtn'))).toBe(false);
            expect(shouldIgnoreHorizontalSwipeTarget(null)).toBe(false);
        });

        it('blocks swipe when textarea or contenteditable is focused or has active selection', () => {
            document.body.innerHTML = `
                <textarea id="ctx"></textarea>
                <div id="appreciation" contenteditable="true">Texte élève</div>
            `;
            const ctx = document.getElementById('ctx');
            const editable = document.getElementById('appreciation');

            ctx.focus();
            expect(shouldIgnoreHorizontalSwipeTarget(ctx)).toBe(true);
            ctx.blur();

            editable.focus();
            expect(shouldIgnoreHorizontalSwipeTarget(editable)).toBe(true);
            editable.blur();

            vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false });
            expect(shouldIgnoreHorizontalSwipeTarget(editable)).toBe(true);
        });

        it('blocks swipe on sliders, selects, popovers, and horizontally overflowing containers', () => {
            document.body.innerHTML = `
                <select id="sel"><option>A</option></select>
                <input id="rng" type="range" />
                <div class="journal-threshold-popover"><button id="popBtn" type="button">Dès 2</button></div>
                <div id="overflowStrip" style="overflow-x: auto;">
                    <button id="chipBtn" type="button">Chip</button>
                </div>
                <div class="focus-refinement-options" id="wrappedStrip">
                    <button id="wrapBtn" type="button">Concise</button>
                </div>
            `;

            expect(shouldIgnoreHorizontalSwipeTarget(document.getElementById('sel'))).toBe(true);
            expect(shouldIgnoreHorizontalSwipeTarget(document.getElementById('rng'))).toBe(true);
            expect(shouldIgnoreHorizontalSwipeTarget(document.getElementById('popBtn'))).toBe(true);

            const overflowStrip = document.getElementById('overflowStrip');
            Object.defineProperty(overflowStrip, 'scrollWidth', { value: 500, configurable: true });
            Object.defineProperty(overflowStrip, 'clientWidth', { value: 250, configurable: true });
            expect(shouldIgnoreHorizontalSwipeTarget(document.getElementById('chipBtn'))).toBe(true);

            const wrappedStrip = document.getElementById('wrappedStrip');
            Object.defineProperty(wrappedStrip, 'scrollWidth', { value: 300, configurable: true });
            Object.defineProperty(wrappedStrip, 'clientWidth', { value: 300, configurable: true });
            expect(shouldIgnoreHorizontalSwipeTarget(document.getElementById('wrapBtn'))).toBe(false);
        });
    });

    describe('attachSheetPullToDismiss', () => {
        const setupSheet = () => {
            document.body.innerHTML = `
                <div id="backdrop"></div>
                <div id="mainPage"></div>
                <div id="sheet">
                    <div class="sheet-handle" id="handle"></div>
                    <div class="sheet-scroll" id="scrollArea"></div>
                </div>
            `;
            const sheet = document.getElementById('sheet');
            const backdrop = document.getElementById('backdrop');
            const mainPage = document.getElementById('mainPage');
            const scrollArea = document.getElementById('scrollArea');
            const handle = document.getElementById('handle');
            Object.defineProperty(sheet, 'offsetHeight', { value: 500, configurable: true });
            return { sheet, backdrop, mainPage, scrollArea, handle };
        };

        it('dismisses when dragged down past threshold and syncs backdrop/scale', () => {
            vi.useFakeTimers();
            const { sheet, backdrop, mainPage, handle } = setupSheet();
            const onDismiss = vi.fn();
            const origMatchMedia = window.matchMedia;
            window.matchMedia = vi.fn().mockReturnValue({ matches: false });

            const ctrl = attachSheetPullToDismiss(sheet, {
                backdropEl: backdrop,
                scrollContainer: '.sheet-scroll',
                scaleTargetEl: mainPage,
                onDismiss
            });

            dispatchTouch(handle, 'touchstart', 150, 100, { timeStamp: 1000 });
            dispatchTouch(handle, 'touchmove', 150, 260, { timeStamp: 1200 });

            expect(sheet.style.transform).toBe('translate3d(0, 160px, 0)');
            expect(Number(backdrop.style.opacity)).toBeLessThan(1);
            expect(mainPage.style.transform).toContain('scale(');

            dispatchTouch(handle, 'touchend', 150, 260, { timeStamp: 1300 });
            expect(onDismiss).not.toHaveBeenCalled();

            vi.advanceTimersByTime(260);
            expect(onDismiss).toHaveBeenCalledTimes(1);

            ctrl.destroy();
            window.matchMedia = origMatchMedia;
        });

        it('skips stale onDismiss if isEnabled() turns false during the 260ms exit animation', () => {
            vi.useFakeTimers();
            const { sheet, backdrop, handle } = setupSheet();
            const onDismiss = vi.fn();
            let enabled = true;
            const origMatchMedia = window.matchMedia;
            window.matchMedia = vi.fn().mockReturnValue({ matches: false });

            const ctrl = attachSheetPullToDismiss(sheet, {
                backdropEl: backdrop,
                scrollContainer: '.sheet-scroll',
                isEnabled: () => enabled,
                onDismiss
            });

            dispatchTouch(handle, 'touchstart', 150, 100, { timeStamp: 1000 });
            dispatchTouch(handle, 'touchmove', 150, 260, { timeStamp: 1150 });
            dispatchTouch(handle, 'touchend', 150, 260, { timeStamp: 1200 });

            // Concurrent close via system Back before the 260ms timer completes
            enabled = false;
            vi.advanceTimersByTime(260);

            expect(onDismiss).not.toHaveBeenCalled();
            expect(sheet.style.transform).toBe('');
            expect(backdrop.style.opacity).toBe('');

            ctrl.destroy();
            window.matchMedia = origMatchMedia;
        });

        it('dismisses on a fast downward flick and snaps back on small slow drags or touchcancel', () => {
            vi.useFakeTimers();
            const { sheet, handle } = setupSheet();
            const actionBtn = document.createElement('button');
            actionBtn.type = 'button';
            const btnClickSpy = vi.fn();
            actionBtn.addEventListener('click', btnClickSpy);
            sheet.appendChild(actionBtn);
            const onDismiss = vi.fn();
            const origMatchMedia = window.matchMedia;
            window.matchMedia = vi.fn().mockReturnValue({ matches: false });

            const ctrl = attachSheetPullToDismiss(sheet, {
                scrollContainer: '.sheet-scroll',
                onDismiss
            });

            // 1. Small slow drag started on a button -> snaps back AND absorbs synthetic click
            dispatchTouch(actionBtn, 'touchstart', 150, 100, { timeStamp: 1000 });
            dispatchTouch(actionBtn, 'touchmove', 150, 130, { timeStamp: 1300 });
            dispatchTouch(actionBtn, 'touchend', 150, 130, { timeStamp: 1350 });
            actionBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(btnClickSpy).not.toHaveBeenCalled();
            vi.advanceTimersByTime(350);
            expect(onDismiss).not.toHaveBeenCalled();
            expect(sheet.style.transform).toBe('');

            // 2. touchcancel during big drag -> resets without dismissing
            dispatchTouch(handle, 'touchstart', 150, 100, { timeStamp: 2000 });
            dispatchTouch(handle, 'touchmove', 150, 300, { timeStamp: 2100 });
            dispatchTouch(handle, 'touchcancel', 150, 300, { timeStamp: 2150 });
            vi.advanceTimersByTime(350);
            expect(onDismiss).not.toHaveBeenCalled();

            // 3. Fast flick (>= 32px with vy >= 0.55 px/ms) -> dismisses
            dispatchTouch(handle, 'touchstart', 150, 100, { timeStamp: 3000 });
            dispatchTouch(handle, 'touchmove', 150, 148, { timeStamp: 3040 });
            dispatchTouch(handle, 'touchend', 150, 148, { timeStamp: 3060 });
            vi.advanceTimersByTime(260);
            expect(onDismiss).toHaveBeenCalledTimes(1);

            ctrl.destroy();
            window.matchMedia = origMatchMedia;
        });

        it('respects horizontal swipe, scrolled content (scrollTop > 1), prefers-reduced-motion, and destroy()', () => {
            const { sheet, scrollArea, handle } = setupSheet();
            const onDismiss = vi.fn();
            const origMatchMedia = window.matchMedia;
            window.matchMedia = vi.fn().mockReturnValue({ matches: true });

            const ctrl = attachSheetPullToDismiss(sheet, {
                scrollContainer: scrollArea,
                onDismiss
            });

            // 1. Horizontal swipe aborts pull-to-dismiss cleanly
            dispatchTouch(sheet, 'touchstart', 150, 100, { timeStamp: 100 });
            dispatchTouch(sheet, 'touchmove', 220, 105, { timeStamp: 150 });
            expect(sheet.style.transform).toBe('');
            dispatchTouch(sheet, 'touchend', 220, 105, { timeStamp: 180 });
            expect(onDismiss).not.toHaveBeenCalled();

            // 2. Scrolled inner list ignores pull-down
            scrollArea.scrollTop = 45;
            dispatchTouch(scrollArea, 'touchstart', 150, 100, { timeStamp: 200 });
            dispatchTouch(scrollArea, 'touchmove', 150, 280, { timeStamp: 250 });
            dispatchTouch(scrollArea, 'touchend', 150, 280, { timeStamp: 280 });
            expect(onDismiss).not.toHaveBeenCalled();

            // 3. Scroll at top with reduced motion dismisses immediately
            scrollArea.scrollTop = 0;
            dispatchTouch(handle, 'touchstart', 150, 100, { timeStamp: 300 });
            dispatchTouch(handle, 'touchmove', 150, 260, { timeStamp: 400 });
            dispatchTouch(handle, 'touchend', 150, 260, { timeStamp: 450 });
            expect(onDismiss).toHaveBeenCalledTimes(1);

            // 4. destroy() detaches listeners
            ctrl.destroy();
            dispatchTouch(handle, 'touchstart', 150, 100, { timeStamp: 500 });
            dispatchTouch(handle, 'touchmove', 150, 260, { timeStamp: 600 });
            dispatchTouch(handle, 'touchend', 150, 260, { timeStamp: 650 });
            expect(onDismiss).toHaveBeenCalledTimes(1);

            window.matchMedia = origMatchMedia;
        });
    });

    describe('attachLeftEdgeDismiss', () => {
        const setupPanel = (panelLeft = 0) => {
            document.body.innerHTML = `
                <div id="backdrop"></div>
                <div id="panel">
                    <button id="edgeBtn" type="button">Action</button>
                </div>
            `;
            const panel = document.getElementById('panel');
            const backdrop = document.getElementById('backdrop');
            const edgeBtn = document.getElementById('edgeBtn');
            Object.defineProperty(panel, 'offsetWidth', { value: 400, configurable: true });
            vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
                left: panelLeft,
                top: 0,
                right: panelLeft + 400,
                bottom: 800,
                width: 400,
                height: 800
            });
            return { panel, backdrop, edgeBtn };
        };

        it('dismisses on rightward drag from left edge (<= 20px) and syncs backdrop opacity', () => {
            vi.useFakeTimers();
            const { panel, backdrop } = setupPanel(0);
            const onDismiss = vi.fn();
            const origMatchMedia = window.matchMedia;
            window.matchMedia = vi.fn().mockReturnValue({ matches: false });

            const ctrl = attachLeftEdgeDismiss(panel, {
                backdropEl: backdrop,
                edgeWidth: 20,
                onDismiss
            });

            expect(ctrl.isEdgeCandidate(12)).toBe(true);
            expect(ctrl.isEdgeCandidate(25)).toBe(false);

            dispatchTouch(panel, 'touchstart', 12, 200, { timeStamp: 1000 });
            dispatchTouch(panel, 'touchmove', 152, 204, { timeStamp: 1150 });
            expect(panel.style.transform).toBe('translate3d(140px, 0, 0)');
            expect(Number(backdrop.style.opacity)).toBeLessThan(1);

            const te = dispatchTouch(panel, 'touchend', 152, 204, { timeStamp: 1200 });
            expect(te.defaultPrevented).toBe(true);
            expect(onDismiss).not.toHaveBeenCalled();

            vi.advanceTimersByTime(240);
            expect(onDismiss).toHaveBeenCalledTimes(1);

            ctrl.destroy();
            window.matchMedia = origMatchMedia;
        });

        it('ignores starts beyond 20px, leftward/vertical drags from left edge, and stale timer if closed concurrently', () => {
            vi.useFakeTimers();
            const { panel, backdrop, edgeBtn } = setupPanel(40);
            const onDismiss = vi.fn();
            const btnClickSpy = vi.fn();
            edgeBtn.addEventListener('click', btnClickSpy);
            let enabled = true;
            const origMatchMedia = window.matchMedia;
            window.matchMedia = vi.fn().mockReturnValue({ matches: false });

            const ctrl = attachLeftEdgeDismiss(panel, {
                backdropEl: backdrop,
                edgeWidth: 20,
                isEnabled: () => enabled,
                onDismiss
            });

            // 1. Touch at relX = 28 (> 20) -> ignored
            dispatchTouch(panel, 'touchstart', 68, 200, { timeStamp: 100 });
            dispatchTouch(panel, 'touchmove', 220, 200, { timeStamp: 200 });
            expect(panel.style.transform).toBe('');
            dispatchTouch(panel, 'touchend', 220, 200, { timeStamp: 250 });
            expect(onDismiss).not.toHaveBeenCalled();

            // 2. Touch at relX = 10 moving LEFT -> yields cleanly without transforming panel
            dispatchTouch(panel, 'touchstart', 50, 200, { timeStamp: 300 });
            dispatchTouch(panel, 'touchmove', 20, 200, { timeStamp: 360 });
            expect(panel.style.transform).toBe('');
            dispatchTouch(panel, 'touchend', 20, 200, { timeStamp: 400 });

            // 3. Touch at relX = 10 moving VERTICALLY -> yields cleanly and marks isEdgeCandidate false until touchend
            dispatchTouch(panel, 'touchstart', 50, 200, { timeStamp: 500 });
            dispatchTouch(panel, 'touchmove', 54, 280, { timeStamp: 560 });
            expect(panel.style.transform).toBe('');
            expect(ctrl.isEdgeCandidate(50)).toBe(false);
            dispatchTouch(panel, 'touchend', 54, 280, { timeStamp: 600 });
            expect(ctrl.isEdgeCandidate(50)).toBe(true);

            // 3b. Multi-touch during active drag -> resets transform immediately
            dispatchTouch(panel, 'touchstart', 50, 200, { timeStamp: 700 });
            dispatchTouch(panel, 'touchmove', 90, 200, { timeStamp: 740 });
            expect(panel.style.transform).toBe('translate3d(40px, 0, 0)');
            const multiTouchMove = new Event('touchmove', { bubbles: true, cancelable: true });
            multiTouchMove.touches = [{ clientX: 90, clientY: 200 }, { clientX: 120, clientY: 220 }];
            panel.dispatchEvent(multiTouchMove);
            expect(panel.style.transform).toBe('');

            // 4. Small slow rightward drag -> snaps back AND absorbs trailing click
            dispatchTouch(edgeBtn, 'touchstart', 50, 200, { timeStamp: 1000 });
            dispatchTouch(edgeBtn, 'touchmove', 80, 200, { timeStamp: 1300 });
            dispatchTouch(edgeBtn, 'touchend', 80, 200, { timeStamp: 1350 });
            edgeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(btnClickSpy).not.toHaveBeenCalled();
            // Interrupting snap-back mid-animation via isEdgeCandidate settles styles immediately
            expect(panel.style.transform).toBe('translate3d(0, 0, 0)');
            expect(ctrl.isEdgeCandidate(50)).toBe(true);
            expect(panel.style.transform).toBe('');
            vi.advanceTimersByTime(300);
            expect(onDismiss).not.toHaveBeenCalled();
            expect(panel.style.transform).toBe('');

            // 5. Fast rightward flick, but isEnabled() turns false mid-animation -> no stale onDismiss
            dispatchTouch(panel, 'touchstart', 50, 200, { timeStamp: 2000 });
            dispatchTouch(panel, 'touchmove', 98, 200, { timeStamp: 2040 });
            dispatchTouch(panel, 'touchend', 98, 200, { timeStamp: 2060 });
            enabled = false;
            vi.advanceTimersByTime(240);
            expect(onDismiss).not.toHaveBeenCalled();
            expect(panel.style.transform).toBe('');

            ctrl.destroy();
            window.matchMedia = origMatchMedia;
        });
    });
});
