/**
 * @fileoverview Shared touch gesture primitives for mobile navigation and sheet dismissal.
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

/**
 * Attaches iOS-style vertical pull-to-dismiss behavior to a bottom-sheet or upward-sliding page.
 * Enforces strict vertical downward axis lock (`>= 8px` with `dy > 0` and `|dy| > |dx|`),
 * respects internal scroll position (`scrollTop <= 1`), syncs backdrop/background scale,
 * and cleans up cleanly on cancel or destroy.
 *
 * @param {HTMLElement|null} sheetEl
 * @param {Object} [options={}]
 * @param {HTMLElement|null} [options.backdropEl=null]
 * @param {HTMLElement|string|null} [options.scrollContainer=null]
 * @param {Function} [options.isEnabled]
 * @param {Function} [options.onDismiss]
 * @param {HTMLElement|null} [options.scaleTargetEl=null]
 * @param {number} [options.dismissThreshold=110]
 * @param {number} [options.velocityThreshold=0.55]
 * @returns {{ destroy: Function, reset: Function }}
 */
export function attachSheetPullToDismiss(sheetEl, options = {}) {
    if (!sheetEl || typeof sheetEl.addEventListener !== 'function') {
        return { destroy() {}, reset() {} };
    }

    const {
        backdropEl = null,
        scrollContainer = null,
        isEnabled = () => true,
        onDismiss = () => {},
        scaleTargetEl = null,
        dismissThreshold = 110,
        velocityThreshold = 0.55
    } = options;

    let startX = null;
    let startY = null;
    let lastY = 0;
    let lastMoveTime = 0;
    let velocityY = 0;
    let currentDy = 0;
    let axis = null;
    let aborted = false;
    let activeScrollEl = null;
    let animTimer = null;
    let suppressNextClickUntil = 0;

    const clearAnimTimer = () => {
        if (animTimer !== null) {
            clearTimeout(animTimer);
            animTimer = null;
        }
    };

    const clearInlineStyles = () => {
        sheetEl.style.transition = '';
        sheetEl.style.transform = '';
        sheetEl.style.willChange = '';
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
        lastY = 0;
        lastMoveTime = 0;
        velocityY = 0;
        currentDy = 0;
        axis = null;
        aborted = false;
        activeScrollEl = null;
    };

    const reset = () => {
        clearAnimTimer();
        resetVars();
        clearInlineStyles();
    };

    const resolveScrollContainer = () => {
        if (!scrollContainer) return null;
        return typeof scrollContainer === 'string'
            ? sheetEl.querySelector(scrollContainer)
            : scrollContainer;
    };

    const isFocusedInputTarget = (target) => {
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        if (!active || !target) return false;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) && (active === target || active.contains(target))) {
            return true;
        }
        const editable = target.closest?.('[contenteditable="true"]');
        return Boolean(editable && (editable === active || editable.contains(active)));
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
        if (e.touches.length !== 1 || !isEnabled()) return;
        if (e.target?.closest?.('select, input[type="range"]')) return;
        if (isFocusedInputTarget(e.target)) return;

        const scrollEl = resolveScrollContainer();
        const startedInScroll = Boolean(scrollEl && (scrollEl === e.target || scrollEl.contains(e.target)));
        if (startedInScroll && (scrollEl.scrollTop || 0) > 1) {
            return;
        }

        const hadPendingAnim = animTimer !== null;
        clearAnimTimer();
        resetVars();
        if (hadPendingAnim) {
            clearInlineStyles();
        }

        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        lastY = startY;
        lastMoveTime = e.timeStamp || Date.now();
        activeScrollEl = startedInScroll ? scrollEl : null;
    };

    const onTouchMove = (e) => {
        if (startY === null || aborted) return;
        if ((e.touches && e.touches.length > 1) || !isEnabled()) {
            reset();
            return;
        }

        const touch = e.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;

        if (!axis) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;

            if (dy <= 0 || Math.abs(dx) >= Math.abs(dy) || (activeScrollEl && (activeScrollEl.scrollTop || 0) > 1)) {
                aborted = true;
                resetVars();
                clearInlineStyles();
                return;
            }

            axis = 'y';
            sheetEl.style.transition = 'none';
            sheetEl.style.willChange = 'transform';
            if (backdropEl) backdropEl.style.transition = 'none';
            if (scaleTargetEl) scaleTargetEl.style.transition = 'none';
        }

        if (e.cancelable) e.preventDefault();

        const clampedDy = Math.max(0, dy);
        const now = e.timeStamp || Date.now();
        const dt = now - lastMoveTime;
        if (dt >= 4) {
            const instVy = (touch.clientY - lastY) / dt;
            velocityY = velocityY === 0 ? instVy : (velocityY * 0.4 + instVy * 0.6);
            lastY = touch.clientY;
            lastMoveTime = now;
        }

        currentDy = clampedDy;
        sheetEl.style.transform = `translate3d(0, ${clampedDy}px, 0)`;

        const sheetHeight = sheetEl.offsetHeight || window.innerHeight || 500;
        const progress = Math.min(1, clampedDy / sheetHeight);
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

    const finalizeGesture = (shouldEvaluateDismiss, eventTimeStamp) => {
        if (startY === null) return;

        const wasDragging = axis === 'y';
        const dy = currentDy;
        const vy = velocityY;
        const lastMove = lastMoveTime;
        resetVars();

        if (!wasDragging) {
            clearInlineStyles();
            return;
        }

        suppressNextClickUntil = Date.now() + 350;

        const sheetHeight = sheetEl.offsetHeight || window.innerHeight || 500;
        const effectiveThreshold = Math.min(dismissThreshold, Math.max(72, Math.round(sheetHeight * 0.28)));
        const isFastFlick = (eventTimeStamp - lastMove) <= 100 && dy >= 32 && vy >= velocityThreshold;
        const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

        if (shouldEvaluateDismiss && (dy >= effectiveThreshold || isFastFlick)) {
            if (reducedMotion) {
                onDismiss();
                clearInlineStyles();
                return;
            }

            sheetEl.style.transition = 'transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)';
            sheetEl.style.transform = 'translate3d(0, 100%, 0)';
            if (backdropEl) {
                backdropEl.style.transition = 'opacity 0.24s ease';
                backdropEl.style.opacity = '0';
            }
            if (scaleTargetEl) {
                scaleTargetEl.style.transition = 'transform 0.26s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.24s ease';
                scaleTargetEl.style.transform = 'scale(1)';
                scaleTargetEl.style.opacity = '1';
            }

            clearAnimTimer();
            animTimer = setTimeout(() => {
                animTimer = null;
                if (!isEnabled()) {
                    clearInlineStyles();
                    return;
                }
                sheetEl.style.transition = 'none';
                if (scaleTargetEl) scaleTargetEl.style.transition = 'none';
                onDismiss();
                if (sheetEl.isConnected) {
                    sheetEl.style.transform = '';
                    sheetEl.style.willChange = '';
                    if (scaleTargetEl) {
                        scaleTargetEl.style.transform = '';
                        scaleTargetEl.style.opacity = '';
                    }
                    void sheetEl.offsetWidth;
                    sheetEl.style.transition = '';
                    if (scaleTargetEl) scaleTargetEl.style.transition = '';
                }
                if (backdropEl?.isConnected) {
                    backdropEl.style.transition = '';
                    backdropEl.style.opacity = '';
                }
            }, 260);
            return;
        }

        if (reducedMotion) {
            clearInlineStyles();
            return;
        }

        sheetEl.style.transition = 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)';
        sheetEl.style.transform = 'translate3d(0, 0, 0)';
        if (backdropEl) {
            backdropEl.style.transition = 'opacity 0.28s ease';
            backdropEl.style.opacity = '1';
        }
        if (scaleTargetEl) {
            scaleTargetEl.style.transition = 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.28s ease';
            scaleTargetEl.style.transform = '';
            scaleTargetEl.style.opacity = '';
        }

        clearAnimTimer();
        animTimer = setTimeout(() => {
            animTimer = null;
            clearInlineStyles();
        }, 330);
    };

    const onTouchEnd = (e) => finalizeGesture(true, e?.timeStamp || Date.now());
    const onTouchCancel = (e) => finalizeGesture(false, e?.timeStamp || Date.now());

    sheetEl.addEventListener('click', onClickCapture, true);
    sheetEl.addEventListener('touchstart', onTouchStart, { passive: true });
    sheetEl.addEventListener('touchmove', onTouchMove, { passive: false });
    sheetEl.addEventListener('touchend', onTouchEnd, { passive: true });
    sheetEl.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return {
        reset,
        destroy() {
            reset();
            suppressNextClickUntil = 0;
            sheetEl.removeEventListener('click', onClickCapture, true);
            sheetEl.removeEventListener('touchstart', onTouchStart);
            sheetEl.removeEventListener('touchmove', onTouchMove);
            sheetEl.removeEventListener('touchend', onTouchEnd);
            sheetEl.removeEventListener('touchcancel', onTouchCancel);
        }
    };
}
