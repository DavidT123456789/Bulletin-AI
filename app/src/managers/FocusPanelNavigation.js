/**
 * @fileoverview Focus Panel Navigation Manager
 * Handles navigation between students (Next/Prev) and transition animations
 * Extracted from FocusPanelManager
 * @module managers/FocusPanelNavigation
 */

import { appState } from '../state/State.js';
import { UI } from './UIManager.js';
import { FocusPanelHeader } from './FocusPanelHeader.js';
import { FocusPanelHistory } from './FocusPanelHistory.js';
import { FocusPanelJournal } from './FocusPanelJournal.js';
import { FocusPanelAnalysis } from './FocusPanelAnalysis.js';
import { SpeechRecognitionManager } from './SpeechRecognitionManager.js';
import { shouldIgnoreHorizontalSwipeTarget } from '../utils/TouchGestures.js';

export const FocusPanelNavigation = {
    /**
     * Callbacks provided by parent manager
     */
    callbacks: {
        getCurrentStudentId: () => null,
        setCurrentStudentId: () => {},
        getCurrentIndex: () => -1,
        setCurrentIndex: () => {},
        saveContext: () => {},
        renderContent: () => {},
        updateAppreciationStatus: () => {},
        onUpdateActiveRow: () => {},
        updateScrollAffordances: () => {},
        isLeftEdgeCloseCandidate: () => false
    },

    /**
     * Initialize navigation module
     * @param {Object} callbacks - Functions to interact with parent state
     */
    init(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
        this._initSwipeNavigation();
    },

    /**
     * Initialize touch events for swipe navigation (iOS Gallery Style 2026)
     * @private
     */
    _initSwipeNavigation() {
        const targetArea = document.getElementById('focusPanel') || document.getElementById('focusPagesContainer');
        if (!targetArea || targetArea.dataset.swipeBound === 'true') return;
        targetArea.dataset.swipeBound = 'true';

        let touchStartX = null;
        let touchStartY = null;
        let lastMoveX = 0;
        let lastMoveTime = 0;
        let velocityX = 0;
        let isSwiping = false;
        let swipeContent = null;
        let currentIndex = -1;
        let totalItems = -1;
        let currentTranslateX = 0;
        let snapBackTimer = null;
        let snapBackRafId = null;
        let suppressNextClickUntil = 0;
        let startedOnCloseEdge = false;

        const clearSwipeStyles = (el) => {
            if (!el) return;
            el.style.transition = '';
            el.style.transform = '';
            el.style.opacity = '';
            el.style.willChange = '';
        };

        const cancelSnapBack = () => {
            const hadActiveSnap = Boolean(snapBackTimer || snapBackRafId);
            if (snapBackTimer) {
                clearTimeout(snapBackTimer);
                snapBackTimer = null;
            }
            if (snapBackRafId) {
                cancelAnimationFrame(snapBackRafId);
                snapBackRafId = null;
            }
            if (hadActiveSnap && swipeContent) {
                clearSwipeStyles(swipeContent);
            }
        };

        const snapBack = (el) => {
            if (!el) return;
            cancelSnapBack();
            if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
                clearSwipeStyles(el);
                return;
            }
            el.style.transition = 'transform 0.36s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease';
            el.style.transform = 'translate3d(0, 0, 0) scale(1)';
            el.style.opacity = '1';

            snapBackTimer = setTimeout(() => {
                snapBackTimer = null;
                snapBackRafId = window.requestAnimationFrame(() => {
                    snapBackRafId = null;
                    clearSwipeStyles(el);
                });
            }, 380);
        };

        const resetGestureVars = () => {
            touchStartX = null;
            touchStartY = null;
            velocityX = 0;
            isSwiping = false;
            startedOnCloseEdge = false;
        };

        targetArea.addEventListener('click', (e) => {
            if (Date.now() < suppressNextClickUntil) {
                e.preventDefault();
                e.stopPropagation();
                suppressNextClickUntil = 0;
            }
        }, true);

        targetArea.addEventListener('touchstart', e => {
            suppressNextClickUntil = 0;
            if (e.touches.length > 1) return; // Ignore multi-touch

            this._clearBoundaryBounce();
            cancelSnapBack();
            resetGestureVars();
            currentTranslateX = 0;

            const header = document.querySelector('.focus-header');
            if (header && header.classList.contains('editing')) {
                return;
            }

            if (shouldIgnoreHorizontalSwipeTarget(e.target)) {
                return;
            }

            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            startedOnCloseEdge = Boolean(this.callbacks?.isLeftEdgeCloseCandidate?.(touchStartX));
            lastMoveX = touchStartX;
            lastMoveTime = Date.now();

            // Determine active content cleanly
            const isAnalysisMode = FocusPanelAnalysis.isVisible && FocusPanelAnalysis.isVisible();
            swipeContent = isAnalysisMode
                ? document.querySelector('.focus-analysis-content-area')
                : document.querySelector('.focus-main-page .focus-content');

            currentIndex = this.callbacks?.getCurrentIndex?.() ?? -1;
            totalItems = appState.filteredResults?.length ?? 0;
        }, { passive: true });

        targetArea.addEventListener('touchmove', e => {
            if (touchStartX === null || touchStartY === null || !swipeContent) return;

            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const diffX = currentX - touchStartX;
            const diffY = currentY - touchStartY;

            if (!isSwiping) {
                // Determine swipe intent: horizontal vs vertical
                if (Math.abs(diffX) > 10 && Math.abs(diffX) > Math.abs(diffY)) {
                    if (startedOnCloseEdge && diffX > 0 && this.callbacks?.isLeftEdgeCloseCandidate?.(touchStartX)) {
                        clearSwipeStyles(swipeContent);
                        resetGestureVars(); // Yield cleanly to left-edge panel dismiss
                        return;
                    }
                    isSwiping = true;
                    swipeContent.style.transition = 'none'; // Instant follow
                    swipeContent.style.willChange = 'transform, opacity';

                    const active = document.activeElement;
                    if (active && targetArea.contains(active) && active.matches?.('input, textarea, [contenteditable="true"]')) {
                        active.blur?.();
                    }
                } else if (Math.abs(diffY) > 10) {
                    clearSwipeStyles(swipeContent);
                    resetGestureVars(); // Vertical scroll, abort swipe
                    return;
                }
            }

            if (isSwiping) {
                if (e.cancelable) e.preventDefault(); // Prevent vertical scroll bouncing

                const now = Date.now();
                const dt = now - lastMoveTime;
                if (dt >= 4) {
                    const instVx = (currentX - lastMoveX) / dt;
                    velocityX = velocityX === 0 ? instVx : (velocityX * 0.4 + instVx * 0.6);
                    lastMoveX = currentX;
                    lastMoveTime = now;
                }

                let translateX = diffX;
                const resistance = 0.25;

                // Resistance past edges
                if ((currentIndex <= 0 && diffX > 0) || (currentIndex >= totalItems - 1 && diffX < 0)) {
                    translateX = diffX * resistance;
                }

                currentTranslateX = translateX;

                // iOS 2026 Premium Effect: slight scale down and fade proportional to panel width
                const panelWidth = targetArea.clientWidth || swipeContent.clientWidth || window.innerWidth || 400;
                const progress = Math.min(Math.abs(translateX) / panelWidth, 1);
                const scale = 1 - (progress * 0.04);
                const opacity = 1 - (progress * 0.4);

                swipeContent.style.transform = `translate3d(${translateX}px, 0, 0) scale(${scale})`;
                swipeContent.style.opacity = opacity.toString();
            }
        }, { passive: false }); // false so preventDefault works

        const finishSwipe = (shouldEvaluateNavigation) => {
            if (touchStartX === null || !swipeContent) return;

            if (isSwiping) {
                suppressNextClickUntil = Date.now() + 350;
            }

            if (isSwiping && shouldEvaluateNavigation) {
                const panelWidth = targetArea.clientWidth || swipeContent.clientWidth || Math.min(window.innerWidth || 400, 480);
                const distanceThreshold = Math.min(56, Math.max(40, Math.round(panelWidth * 0.14)));
                const isFreshFlick = (Date.now() - lastMoveTime) <= 100 &&
                    Math.abs(velocityX) >= 0.35 &&
                    Math.sign(velocityX) === Math.sign(currentTranslateX) &&
                    Math.abs(currentTranslateX) >= 24;

                const canTriggerPrev = (currentTranslateX > distanceThreshold || (isFreshFlick && currentTranslateX > 0)) && currentIndex > 0;
                const canTriggerNext = (currentTranslateX < -distanceThreshold || (isFreshFlick && currentTranslateX < 0)) && currentIndex < totalItems - 1;

                if (canTriggerPrev) {
                    this._navigateWithAnimation('prev', currentTranslateX);
                } else if (canTriggerNext) {
                    this._navigateWithAnimation('next', currentTranslateX);
                } else {
                    snapBack(swipeContent);
                }
            } else if (isSwiping) {
                snapBack(swipeContent);
            } else {
                clearSwipeStyles(swipeContent);
            }

            resetGestureVars();
        };

        targetArea.addEventListener('touchend', (e) => {
            if (isSwiping && e.cancelable) e.preventDefault();
            finishSwipe(true);
        }, { passive: false });
        targetArea.addEventListener('touchcancel', () => finishSwipe(false), { passive: true });
    },

    _prefersReducedMotion() {
        return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    },

    _getActiveNavigationTargets() {
        const isAnalysisVisible = Boolean(FocusPanelAnalysis.isVisible && FocusPanelAnalysis.isVisible());
        if (isAnalysisVisible) {
            return {
                isAnalysisVisible: true,
                content: document.querySelector('.focus-analysis-content-area'),
                headerIdentity: document.querySelector('.focus-analysis-header-left')
            };
        }
        const header = document.querySelector('.focus-header');
        const isEditingHeader = Boolean(header?.classList.contains('editing'));
        return {
            isAnalysisVisible: false,
            content: document.querySelector('.focus-main-page .focus-content'),
            headerIdentity: (!isEditingHeader && header) ? header.querySelector('.focus-header-identity') : null
        };
    },

    _clearBoundaryBounce() {
        if (this._boundaryBounceTimer) {
            clearTimeout(this._boundaryBounceTimer);
            this._boundaryBounceTimer = null;
        }
        if (this._boundaryBouncePrimaryEl && this._boundaryBounceEndHandler) {
            this._boundaryBouncePrimaryEl.removeEventListener('animationend', this._boundaryBounceEndHandler);
        }
        this._boundaryBouncePrimaryEl = null;
        this._boundaryBounceEndHandler = null;
        const tracked = this._boundaryBounceTargets || [];
        this._boundaryBounceTargets = null;
        const els = new Set(tracked);
        document.querySelectorAll('#focusPanel .nav-boundary-bounce').forEach(el => els.add(el));
        els.forEach(el => {
            el.classList.remove('nav-boundary-bounce');
            el.style.removeProperty('--nav-bounce-x');
            el.style.removeProperty('--nav-bounce-y');
        });
    },

    /**
     * Joue un rebond directionnel en bout de liste (mutualise `.nav-boundary-bounce` de layout.css).
     * @param {'prev'|'next'} direction - Direction tentée
     * @private
     */
    _animateBoundaryBounce(direction) {
        if (this._prefersReducedMotion() || this._activeClone) return;
        const { content, headerIdentity, isAnalysisVisible } = this._getActiveNavigationTargets();
        if (!content) return;
        if (!isAnalysisVisible && document.querySelector('.focus-header')?.classList.contains('editing')) return;

        // Prev (début de liste) -> rebond vers la droite (+10px), Next (fin de liste) -> vers la gauche (-10px)
        const x = direction === 'prev' ? 10 : -10;
        const targets = [{ el: content, x }];
        if (headerIdentity) {
            targets.push({ el: headerIdentity, x: Math.round(x * 0.6) });
        }

        const wasAlreadyBouncing = targets.some(({ el }) => el.classList.contains('nav-boundary-bounce'));
        this._clearBoundaryBounce();
        if (wasAlreadyBouncing) {
            void content.offsetWidth;
        }

        this._boundaryBounceTargets = targets.map(({ el }) => el);
        targets.forEach(({ el, x: offsetX }) => {
            el.style.setProperty('--nav-bounce-x', `${offsetX}px`);
            el.style.setProperty('--nav-bounce-y', '0px');
            el.classList.add('nav-boundary-bounce');
        });

        const onAnimEnd = (e) => {
            if (e && e.target !== content) return;
            this._clearBoundaryBounce();
        };
        this._boundaryBouncePrimaryEl = content;
        this._boundaryBounceEndHandler = onAnimEnd;
        content.addEventListener('animationend', onAnimEnd);
        this._boundaryBounceTimer = setTimeout(() => {
            this._clearBoundaryBounce();
        }, 260);
    },

    /**
     * Navigue vers l'élève précédent avec animation
     * @param {Object} [options={}]
     * @param {boolean} [options.bounce=true] - Joue un rebond en début de liste
     * @param {boolean} [options.instant=false] - Coupe l'animation (ex: touche maintenue)
     */
    navigatePrev({ bounce = true, instant = false } = {}) {
        const currentIndex = this.callbacks?.getCurrentIndex?.() ?? -1;
        const total = appState.filteredResults?.length ?? 0;
        if (currentIndex <= 0) {
            if (bounce && currentIndex === 0 && total > 0) {
                this._animateBoundaryBounce('prev');
            }
            return;
        }
        this._navigateWithAnimation('prev', null, { instant });
    },

    /**
     * Navigue vers l'élève suivant avec animation
     * @param {Object} [options={}]
     * @param {boolean} [options.bounce=true] - Joue un rebond en fin de liste
     * @param {boolean} [options.instant=false] - Coupe l'animation (ex: touche maintenue)
     */
    navigateNext({ bounce = true, instant = false } = {}) {
        const currentIndex = this.callbacks?.getCurrentIndex?.() ?? -1;
        const filteredResults = appState.filteredResults || [];
        if (currentIndex < 0 || currentIndex >= filteredResults.length - 1) {
            if (bounce && currentIndex >= 0 && filteredResults.length > 0) {
                this._animateBoundaryBounce('next');
            }
            return;
        }
        this._navigateWithAnimation('next', null, { instant });
    },

    /**
     * Met à jour les boutons de navigation et l'indicateur de position
     */
    updateControls() {
        const prevBtn = document.getElementById('focusPrevBtn');
        const nextBtn = document.getElementById('focusNextBtn');
        const positionEl = document.getElementById('focusPosition');

        const analysisPrevBtn = document.getElementById('focusAnalysisPrevBtn');
        const analysisNextBtn = document.getElementById('focusAnalysisNextBtn');
        const analysisPositionEl = document.getElementById('focusAnalysisPosition');

        const currentIndex = this.callbacks?.getCurrentIndex?.() ?? -1;
        const total = appState.filteredResults?.length ?? 0;

        if (prevBtn) prevBtn.disabled = currentIndex <= 0;
        if (nextBtn) nextBtn.disabled = currentIndex < 0 || currentIndex >= total - 1;
        if (positionEl) positionEl.textContent = currentIndex >= 0 ? `${currentIndex + 1}/${total}` : `-/${total}`;

        if (analysisPrevBtn) analysisPrevBtn.disabled = currentIndex <= 0;
        if (analysisNextBtn) analysisNextBtn.disabled = currentIndex < 0 || currentIndex >= total - 1;
        if (analysisPositionEl) analysisPositionEl.textContent = currentIndex >= 0 ? `${currentIndex + 1}/${total}` : `-/${total}`;
    },

    /**
     * Annule immédiatement toute transition en cours (clone, timeout, rebond et styles inline).
     */
    cancelActiveTransition() {
        this._clearBoundaryBounce();
        if (this._animTimeout) {
            clearTimeout(this._animTimeout);
            this._animTimeout = null;
        }
        if (this._activeClone) {
            this._activeClone.remove();
            this._activeClone = null;
        }
        if (this._animContentEl) {
            this._animContentEl.style.transition = '';
            this._animContentEl.style.transform = '';
            this._animContentEl.style.opacity = '';
            this._animContentEl.style.willChange = '';
            this._animContentEl = null;
        }
    },

    /**
     * Navigation avec animation carrousel (iOS Gallery Physics)
     * Démarre dès la 1ère frame (sans attente rAF) et calibre la course sur la largeur réelle du volet.
     * @param {'prev'|'next'} direction - Direction de navigation
     * @param {number|null} swipeStartX - Position X de départ si c'est un swipe
     * @param {Object} [options={}]
     * @param {boolean} [options.instant=false] - Bascule instantanée sans animation (ex: touche maintenue)
     * @private
     */
    _navigateWithAnimation(direction, swipeStartX = null, { instant = false } = {}) {
        // Blur active element to clear any focus rings (e.g. copy button) and trigger text saving
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }

        // Commit header edit mode before navigating so edits are preserved
        FocusPanelHeader.settleEditMode();

        // Abort voice dictation immediately so recording does not spill over
        SpeechRecognitionManager.abort?.();

        const { content, isAnalysisVisible } = this._getActiveNavigationTargets();

        const currentIndex = this.callbacks?.getCurrentIndex?.() ?? -1;
        if (currentIndex < 0) return;

        // Clean up any ongoing animations before starting a new transition or instant switch
        this.cancelActiveTransition();

        const targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
        const filteredResult = appState.filteredResults?.[targetIndex];
        if (!filteredResult) return;

        const targetResult = appState.generatedResults?.find(r => r.id === filteredResult.id) || filteredResult;
        const prefersReducedMotion = this._prefersReducedMotion();

        if (!content || prefersReducedMotion || instant) {
            // Fallback sans animation (prefers-reduced-motion ou touche maintenue)
            this.callbacks?.saveContext?.();
            if (content) {
                content.style.transition = '';
                content.style.transform = '';
                content.style.opacity = '';
                content.style.willChange = '';
                content.scrollTop = 0;
            }
            FocusPanelHeader.resetScrollState();
            this._switchToStudent(targetResult, targetIndex);
            if (isAnalysisVisible && FocusPanelAnalysis.show) {
                FocusPanelAnalysis.show();
            }
            FocusPanelHeader.resetScrollState({ syncOffset: true });
            this.callbacks?.updateScrollAffordances?.();
            return;
        }

        // 1. Clone outgoing content (preserves drag transform if coming from touch swipe)
        const clone = content.cloneNode(true);
        // Isolate outgoing clone from assistive tech, focus trap and duplicate non-styled IDs
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('inert', '');
        const CSS_STYLED_CLONE_IDS = new Set([
            'focusAppreciationTitle',
            'focusWordCount',
            'focusAiDataBtn',
            'focusCopyBtn',
            'focusGenerateBtn',
            'focusAppreciationText',
            'focusAppreciationSpeakBtn',
            'focusAppreciationMicBtn',
            'focusJournalNoteBtn'
        ]);
        if (clone.id && !CSS_STYLED_CLONE_IDS.has(clone.id)) {
            clone.removeAttribute('id');
        }
        clone.querySelectorAll('[id]').forEach(el => {
            if (!CSS_STYLED_CLONE_IDS.has(el.id)) {
                el.removeAttribute('id');
            }
        });
        clone.querySelectorAll('label[for]').forEach(el => el.removeAttribute('for'));
        clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));

        this._activeClone = clone;
        this._animContentEl = content;
        const parent = content.offsetParent || document.body;
        const travelDistance = content.clientWidth || content.offsetWidth || Math.min(window.innerWidth || 400, 610);
        const exitX = direction === 'next' ? -travelDistance : travelDistance;
        const enterX = direction === 'next' ? travelDistance : -travelDistance;

        clone.style.position = 'absolute';
        clone.style.top = `${content.offsetTop}px`;
        clone.style.left = `${content.offsetLeft}px`;
        clone.style.width = `${content.offsetWidth}px`;
        clone.style.height = `${content.offsetHeight}px`;
        clone.style.margin = '0';
        clone.style.zIndex = '10';
        clone.style.pointerEvents = 'none';
        clone.style.overflow = 'hidden';
        clone.style.willChange = 'transform, opacity';
        clone.style.transition = 'none';
        clone.scrollTop = content.scrollTop;

        if (swipeStartX === null) {
            clone.style.transform = 'translate3d(0, 0, 0) scale(1)';
            clone.style.opacity = '1';
        }

        // Ensure parent is positioned relative
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.position === 'static') {
            parent.style.position = 'relative';
        }

        parent.appendChild(clone);

        // 2. Update state & render incoming student immediately at its entry edge (flush with panel border)
        this.callbacks?.saveContext?.();

        content.style.transition = 'none';
        content.style.transform = `translate3d(${enterX}px, 0, 0) scale(0.92)`;
        content.style.opacity = '0';
        content.style.willChange = 'transform, opacity';
        content.scrollTop = 0;

        FocusPanelHeader.resetScrollState();
        this._switchToStudent(targetResult, targetIndex);

        if (isAnalysisVisible && FocusPanelAnalysis.show) {
            FocusPanelAnalysis.show();
        }

        FocusPanelHeader.resetScrollState({ syncOffset: true });
        this.callbacks?.updateScrollAffordances?.();

        // 3. Commit before-change styles once and start carousel immediately on Frame 0 (zero rAF lag)
        void content.offsetWidth;

        const carouselTransition = 'transform 0.34s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.28s ease';
        clone.style.transition = carouselTransition;
        clone.style.transform = `translate3d(${exitX}px, 0, 0) scale(0.92)`;
        clone.style.opacity = '0';

        content.style.transition = carouselTransition;
        content.style.transform = 'translate3d(0, 0, 0) scale(1)';
        content.style.opacity = '1';

        // 4. Cleanup
        this._animTimeout = setTimeout(() => {
            if (this._activeClone === clone) {
                this._activeClone.remove();
                this._activeClone = null;
            } else {
                clone.remove();
            }
            content.style.transition = '';
            content.style.transform = '';
            content.style.opacity = '';
            content.style.willChange = '';
            if (this._animContentEl === content) {
                this._animContentEl = null;
            }
            this._animTimeout = null;
        }, 370);
    },

    /**
     * Internal helper to switch state and render new student
     */
    _switchToStudent(targetResult, targetIndex) {
        SpeechRecognitionManager.abort?.();
        FocusPanelJournal.closeThresholdPopover?.();
        FocusPanelJournal.resetEditingState?.();
        this.callbacks?.setCurrentStudentId?.(targetResult?.id);
        this.callbacks?.setCurrentIndex?.(targetIndex);

        // Update active row highlight in list view
        if (this.callbacks?.onUpdateActiveRow) {
            this.callbacks.onUpdateActiveRow(targetResult?.id);
        }

        // Load unified persistent history for the new student
        if (targetResult?.id) {
            FocusPanelHistory.load(targetResult.id);
        }

        // Hide spinner if it was stuck
        const generateBtn = document.getElementById('focusGenerateBtn');
        if (generateBtn) UI.hideInlineSpinner(generateBtn);

        this.callbacks?.updateAppreciationStatus?.(null, { state: 'none' });

        this.callbacks?.renderContent?.(targetResult);
        this.updateControls();
    }
};
