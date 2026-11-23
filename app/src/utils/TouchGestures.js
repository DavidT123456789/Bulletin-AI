/**
 * @fileoverview Shared touch gesture primitives for mobile navigation and sheet/panel dismissal.
 * @module utils/TouchGestures
 */

const IGNORED_SCROLL_WRAPPER_IDS = new Set([
    'focusPagesContainer',
    'focusPanel',
    'focusMainPage',
    'focusAnalysisPage'
]);

const IGNORED_SCROLL_WRAPPER_CLASSES = [
    'focus-content',
    'focus-analysis-content-area',
    'main-content',
    'output-section'
];

/**
 * Determines whether a horizontal swipe starting on `target` should be ignored
 * so native interactions (typing in a focused field, dragging a slider, selecting text,
 * or scrolling a genuinely horizontally-overflowing strip) take precedence.
 *
 * Unfocused inputs/textareas/contenteditable regions and resting buttons DO allow
 * horizontal swipes so full-width card gestures never hit dead zones.
 *
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
export function shouldIgnoreHorizontalSwipeTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;

    if (target.closest('select, input[type="range"], .journal-threshold-popover, .history-popover')) {
        return true;
    }

    const editable = target.closest('input, textarea, [contenteditable="true"]');
    if (editable) {
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        if (active && (editable === active || editable.contains(active))) {
            return true;
        }
        const selection = typeof window !== 'undefined' ? window.getSelection?.() : null;
        if (selection && selection.isCollapsed === false) {
            return true;
        }
    }

    let el = target.nodeType === 1 ? target : target.parentElement;
    const rootBody = typeof document !== 'undefined' ? document.body : null;
    const rootHtml = typeof document !== 'undefined' ? document.documentElement : null;

    while (el && el !== rootBody && el !== rootHtml) {
        const isWrapper = IGNORED_SCROLL_WRAPPER_IDS.has(el.id) ||
            IGNORED_SCROLL_WRAPPER_CLASSES.some(cls => el.classList?.contains(cls));

        if (!isWrapper && (el.scrollWidth || 0) > (el.clientWidth || 0) + 4) {
            const overflowX = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
                ? window.getComputedStyle(el).overflowX
                : '';
            if (!overflowX || overflowX === 'auto' || overflowX === 'scroll') {
                return true;
            }
        }
        el = el.parentElement;
    }

    return false;
}

const isFocusedInputTarget = (target) => {
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (!active || !target) return false;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) && (active === target || active.contains(target))) {
        return true;
    }
    const editable = target.closest?.('[contenteditable="true"]');
    return Boolean(editable && (editable === active || editable.contains(active)));
};

/**
 * Shared directional drag-to-dismiss state machine for vertical bottom-sheets (`direction: 'y'`)
 * and horizontal left-edge panel dismiss (`direction: 'x'`).
 *
 * @private
 * @param {HTMLElement|null} targetEl
 * @param {Object} config
 * @returns {{ destroy: Function, reset: Function, isEdgeCandidate: Function }}
 */
function attachDirectionalDismiss(targetEl, config) {
    if (!targetEl || typeof targetEl.addEventListener !== 'function') {
        return { destroy() {}, reset() {}, isEdgeCandidate: () => false };
    }

    const {
        direction,
        backdropEl = null,
        scaleTargetEl = null,
        scrollContainer = null,
        edgeWidth = 20,
        dismissThreshold = 130,
        dismissRatio = 0.28,
        velocityThreshold = 0.5,
        exitDurationMs = 250,
        snapDurationMs = 300,
        isEnabled = () => true,
        onDismiss = () => {}
    } = config;

    const isHorizontal = direction === 'x';

    let startX = null;
    let startY = null;
    let lastPos = 0;
    let lastMoveTime = 0;
    let velocity = 0;
    let currentDelta = 0;
    let axis = null;
    let aborted = false;
    let activeScrollEl = null;
    let animTimer = null;
    let isDismissing = false;
    let suppressNextClickUntil = 0;

    const clearAnimTimer = () => {
        if (animTimer !== null) {
            clearTimeout(animTimer);
            animTimer = null;
        }
        isDismissing = false;
    };

    const clearInlineStyles = () => {
        targetEl.style.transition = '';
        targetEl.style.transform = '';
        targetEl.style.willChange = '';
        if (backdropEl) {
            backdropEl.style.transition = '';
            backdropEl.style.opacity = '';
        }
        if (scaleTargetEl) {
            scaleTargetEl.style.transition = '';
            scaleTargetEl.style.transform = '';
            scaleTargetEl.style.opacity = '';
        }
    };

    const resetVars = () => {
        startX = null;
        startY = null;
        lastPos = 0;
        lastMoveTime = 0;
        velocity = 0;
        currentDelta = 0;
        axis = null;
        aborted = false;
        activeScrollEl = null;
    };

    const reset = () => {
        clearAnimTimer();
        resetVars();
        clearInlineStyles();
    };

    const settlePendingSnapBack = () => {
        if (animTimer !== null && !isDismissing) {
            clearAnimTimer();
            clearInlineStyles();
        }
    };

    const isEdgeCandidate = (clientX) => {
        if (!isHorizontal || typeof clientX !== 'number' || !isEnabled() || isDismissing || aborted) {
            return false;
        }
        settlePendingSnapBack();
        const left = targetEl.getBoundingClientRect?.().left ?? 0;
        const relX = clientX - left;
        return relX >= -4 && relX <= edgeWidth;
    };

    const resolveScrollContainer = () => {
        if (!scrollContainer) return null;
        return typeof scrollContainer === 'string'
            ? targetEl.querySelector(scrollContainer)
            : scrollContainer;
    };

    const onClickCapture = (e) => {
        if (Date.now() < suppressNextClickUntil) {
            e.preventDefault();
            e.stopPropagation();
            suppressNextClickUntil = 0;
        }
    };

    const onTouchStart = (e) => {
        suppressNextClickUntil = 0;
        resetVars();

        if (!e.touches || e.touches.length !== 1 || !isEnabled() || isDismissing) {
            return;
        }

        settlePendingSnapBack();

        const touch = e.touches[0];
        if (isHorizontal) {
            if (!isEdgeCandidate(touch.clientX) || shouldIgnoreHorizontalSwipeTarget(e.target)) {
                return;
            }
        } else {
            if (e.target?.closest?.('select, input[type="range"]') || isFocusedInputTarget(e.target)) {
                return;
            }
            const scrollEl = resolveScrollContainer();
            const startedInScroll = Boolean(scrollEl && (scrollEl === e.target || scrollEl.contains(e.target)));
            if (startedInScroll && (scrollEl.scrollTop || 0) > 1) {
                return;
            }
            activeScrollEl = startedInScroll ? scrollEl : null;
        }

        startX = touch.clientX;
        startY = touch.clientY;
        lastPos = isHorizontal ? startX : startY;
        lastMoveTime = e.timeStamp || Date.now();
    };

    const onTouchMove = (e) => {
        if (startX === null || startY === null || aborted) return;
        if (!e.touches || e.touches.length !== 1 || !isEnabled()) {
            reset();
            return;
        }

        const touch = e.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        const primaryDelta = isHorizontal ? dx : dy;
        const crossDelta = isHorizontal ? dy : dx;

        if (!axis) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;

            const invalidDirection = primaryDelta <= 0 ||
                Math.abs(crossDelta) >= Math.abs(primaryDelta) ||
                (!isHorizontal && activeScrollEl && (activeScrollEl.scrollTop || 0) > 1);

            if (invalidDirection) {
                aborted = true;
                startX = null;
                startY = null;
                return;
            }

            axis = direction;
            targetEl.style.transition = 'none';
            targetEl.style.willChange = 'transform';
            if (backdropEl) backdropEl.style.transition = 'none';
            if (scaleTargetEl) scaleTargetEl.style.transition = 'none';

            if (isHorizontal) {
                const active = typeof document !== 'undefined' ? document.activeElement : null;
                if (active && targetEl.contains(active) && active.matches?.('input, textarea, [contenteditable="true"]')) {
                    active.blur?.();
                }
            }
        }

        if (e.cancelable) e.preventDefault();

        const clampedDelta = Math.max(0, primaryDelta);
        const currentPos = isHorizontal ? touch.clientX : touch.clientY;
        const now = e.timeStamp || Date.now();
        const dt = now - lastMoveTime;
        if (dt >= 4) {
            const instV = (currentPos - lastPos) / dt;
            velocity = velocity === 0 ? instV : (velocity * 0.4 + instV * 0.6);
            lastPos = currentPos;
            lastMoveTime = now;
        }

        currentDelta = clampedDelta;
        targetEl.style.transform = isHorizontal
            ? `translate3d(${clampedDelta}px, 0, 0)`
            : `translate3d(0, ${clampedDelta}px, 0)`;

        const span = (isHorizontal ? targetEl.offsetWidth : targetEl.offsetHeight) ||
            (typeof window !== 'undefined' ? (isHorizontal ? window.innerWidth : window.innerHeight) : 450) || 450;
        const progress = Math.min(1, clampedDelta / span);

        if (backdropEl) {
            backdropEl.style.opacity = String(Math.max(0, 1 - progress));
        }
        if (scaleTargetEl) {
            const scale = 0.92 + (0.08 * progress);
            const opacity = 0.6 + (0.4 * progress);
            scaleTargetEl.style.transform = `scale(${scale.toFixed(4)})`;
            scaleTargetEl.style.opacity = opacity.toFixed(4);
        }
    };

    const finalizeGesture = (shouldEvaluateDismiss, e) => {
        const wasDragging = axis === direction;
        const delta = currentDelta;
        const v = velocity;
        const lastMove = lastMoveTime;
        const eventTimeStamp = e?.timeStamp || Date.now();
        resetVars();

        if (!wasDragging) {
            return;
        }

        suppressNextClickUntil = Date.now() + 350;
        if (shouldEvaluateDismiss && e?.cancelable) e.preventDefault();

        const span = (isHorizontal ? targetEl.offsetWidth : targetEl.offsetHeight) ||
            (typeof window !== 'undefined' ? (isHorizontal ? window.innerWidth : window.innerHeight) : 450) || 450;
        const effectiveThreshold = Math.min(dismissThreshold, Math.max(72, Math.round(span * dismissRatio)));
        const isFastFlick = (eventTimeStamp - lastMove) <= 100 && delta >= 32 && v >= velocityThreshold;
        const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

        if (shouldEvaluateDismiss && (delta >= effectiveThreshold || isFastFlick)) {
            if (reducedMotion) {
                onDismiss();
                clearInlineStyles();
                return;
            }

            const exitSec = (exitDurationMs / 1000).toFixed(2);
            const fadeSec = (Math.max(180, exitDurationMs - 20) / 1000).toFixed(2);
            targetEl.style.transition = `transform ${exitSec}s cubic-bezier(0.32, 0.72, 0, 1)`;
            targetEl.style.transform = isHorizontal ? 'translate3d(100%, 0, 0)' : 'translate3d(0, 100%, 0)';
            if (backdropEl) {
                backdropEl.style.transition = `opacity ${fadeSec}s ease`;
                backdropEl.style.opacity = '0';
            }
            if (scaleTargetEl) {
                scaleTargetEl.style.transition = `transform ${exitSec}s cubic-bezier(0.32, 0.72, 0, 1), opacity ${fadeSec}s ease`;
                scaleTargetEl.style.transform = 'scale(1)';
                scaleTargetEl.style.opacity = '1';
            }

            clearAnimTimer();
            isDismissing = true;
            animTimer = setTimeout(() => {
                animTimer = null;
                isDismissing = false;
                if (!isEnabled()) {
                    clearInlineStyles();
                    return;
                }
                targetEl.style.transition = 'none';
                if (scaleTargetEl) scaleTargetEl.style.transition = 'none';
                onDismiss();
                if (targetEl.isConnected) {
                    targetEl.style.transform = '';
                    targetEl.style.willChange = '';
                    if (scaleTargetEl) {
                        scaleTargetEl.style.transform = '';
                        scaleTargetEl.style.opacity = '';
                    }
                    void targetEl.offsetWidth;
                    targetEl.style.transition = '';
                    if (scaleTargetEl) scaleTargetEl.style.transition = '';
                }
                if (backdropEl?.isConnected) {
                    backdropEl.style.transition = '';
                    backdropEl.style.opacity = '';
                }
            }, exitDurationMs);
            return;
        }

        if (reducedMotion) {
            clearInlineStyles();
            return;
        }

        const snapSec = (snapDurationMs / 1000).toFixed(2);
        const snapFadeSec = (Math.max(200, snapDurationMs - 40) / 1000).toFixed(2);
        targetEl.style.transition = `transform ${snapSec}s cubic-bezier(0.32, 0.72, 0, 1)`;
        targetEl.style.transform = 'translate3d(0, 0, 0)';
        if (backdropEl) {
            backdropEl.style.transition = `opacity ${snapFadeSec}s ease`;
            backdropEl.style.opacity = '1';
        }
        if (scaleTargetEl) {
            scaleTargetEl.style.transition = `transform ${snapSec}s cubic-bezier(0.32, 0.72, 0, 1), opacity ${snapFadeSec}s ease`;
            scaleTargetEl.style.transform = '';
            scaleTargetEl.style.opacity = '';
        }

        clearAnimTimer();
        animTimer = setTimeout(() => {
            animTimer = null;
            clearInlineStyles();
        }, snapDurationMs + 10);
    };

    const onTouchEnd = (e) => finalizeGesture(true, e);
    const onTouchCancel = (e) => finalizeGesture(false, e);

    targetEl.addEventListener('click', onClickCapture, true);
    targetEl.addEventListener('touchstart', onTouchStart, { passive: true });
    targetEl.addEventListener('touchmove', onTouchMove, { passive: false });
    targetEl.addEventListener('touchend', onTouchEnd, { passive: false });
    targetEl.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return {
        reset,
        isEdgeCandidate,
        destroy() {
            reset();
            suppressNextClickUntil = 0;
            targetEl.removeEventListener('click', onClickCapture, true);
            targetEl.removeEventListener('touchstart', onTouchStart);
            targetEl.removeEventListener('touchmove', onTouchMove);
            targetEl.removeEventListener('touchend', onTouchEnd);
            targetEl.removeEventListener('touchcancel', onTouchCancel);
        }
    };
}

/**
 * Attaches iOS-style vertical pull-to-dismiss behavior to a bottom-sheet or upward-sliding page.
 *
 * @param {HTMLElement|null} sheetEl
 * @param {Object} [options={}]
 * @returns {{ destroy: Function, reset: Function }}
 */
export function attachSheetPullToDismiss(sheetEl, options = {}) {
    const ctrl = attachDirectionalDismiss(sheetEl, {
        direction: 'y',
        dismissThreshold: 110,
        dismissRatio: 0.28,
        velocityThreshold: 0.55,
        exitDurationMs: 260,
        snapDurationMs: 320,
        ...options
    });
    return { reset: ctrl.reset, destroy: ctrl.destroy };
}

/**
 * Attaches iOS-style interactive left-edge swipe-to-dismiss to a right-anchored panel.
 * Activates ONLY when touch starts within `edgeWidth` px of the panel's left edge
 * AND moves horizontally to the right (`dx > 0`), yielding immediately on leftward
 * or vertical drags so full-width sibling gestures stay conflict-free.
 *
 * @param {HTMLElement|null} panelEl
 * @param {Object} [options={}]
 * @returns {{ destroy: Function, reset: Function, isEdgeCandidate: Function }}
 */
export function attachLeftEdgeDismiss(panelEl, options = {}) {
    return attachDirectionalDismiss(panelEl, {
        direction: 'x',
        edgeWidth: 20,
        dismissThreshold: 130,
        dismissRatio: 0.28,
        velocityThreshold: 0.45,
        exitDurationMs: 240,
        snapDurationMs: 280,
        ...options
    });
}
