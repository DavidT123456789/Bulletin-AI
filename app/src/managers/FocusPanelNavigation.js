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
import { FocusPanelAnalysis } from './FocusPanelAnalysis.js';

export const FocusPanelNavigation = {
    /**
     * Callbacks provided by parent manager
     */
    callbacks: {
        getCurrentStudentId: null,
        setCurrentStudentId: null,
        getCurrentIndex: null,
        setCurrentIndex: null,
        saveContext: null,
        renderContent: null,
        updateAppreciationStatus: null,
        onUpdateActiveRow: null
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
        const targetArea = document.getElementById('focusPagesContainer') || document.getElementById('focusPanel');
        if (!targetArea) return;

        let touchStartX = null;
        let touchStartY = null;
        let isSwiping = false;
        let swipeContent = null;
        let currentIndex = -1;
        let totalItems = -1;
        let currentTranslateX = 0;

        targetArea.addEventListener('touchstart', e => {
            if (e.touches.length > 1) return; // Ignore multi-touch

            touchStartX = null;
            touchStartY = null;
            isSwiping = false;
            currentTranslateX = 0;

            // Ignore if touching an input, textarea, slider, horizontal scroll area, or interactive elements
            if (e.target.closest('input') ||
                e.target.closest('textarea') ||
                e.target.closest('.focus-refinement-options') ||
                e.target.closest('.history-navigation-group') ||
                e.target.closest('select') ||
                e.target.closest('button')) {
                return;
            }

            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;

            // Determine active content cleanly
            const isAnalysisMode = FocusPanelAnalysis.isVisible && FocusPanelAnalysis.isVisible();
            swipeContent = isAnalysisMode
                ? document.querySelector('.focus-analysis-content-area')
                : document.querySelector('.focus-main-page .focus-content');

            if (swipeContent) {
                swipeContent.style.transition = 'none'; // Instant follow
                swipeContent.style.willChange = 'transform, opacity';
            }

            currentIndex = this.callbacks.getCurrentIndex();
            totalItems = appState.filteredResults.length;
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
                    isSwiping = true;
                } else if (Math.abs(diffY) > 10) {
                    touchStartX = null; // Vertical scroll, abort swipe
                    return;
                }
            }

            if (isSwiping) {
                if (e.cancelable) e.preventDefault(); // Prevent vertical scroll bouncing

                let translateX = diffX;
                const resistance = 0.25;

                // Resistance past edges
                if ((currentIndex <= 0 && diffX > 0) || (currentIndex >= totalItems - 1 && diffX < 0)) {
                    translateX = diffX * resistance;
                }

                currentTranslateX = translateX;

                // iOS 2026 Premium Effect: slight scale down and fade
                const progress = Math.min(Math.abs(translateX) / window.innerWidth, 1);
                const scale = 1 - (progress * 0.04);
                const opacity = 1 - (progress * 0.4);

                swipeContent.style.transform = `translateX(${translateX}px) scale(${scale})`;
                swipeContent.style.opacity = opacity.toString();
            }
        }, { passive: false }); // false so preventDefault works

        targetArea.addEventListener('touchend', e => {
            if (touchStartX === null || !swipeContent) return;

            if (isSwiping) {
                const threshold = window.innerWidth * 0.25; // 25% screen width threshold

                if (currentTranslateX > threshold && currentIndex > 0) {
                    this._navigateWithAnimation('prev', currentTranslateX);
                } else if (currentTranslateX < -threshold && currentIndex < totalItems - 1) {
                    this._navigateWithAnimation('next', currentTranslateX);
                } else {
                    // Snap back (Elastic spring)
                    swipeContent.style.transition = 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.4s ease';
                    swipeContent.style.transform = 'translateX(0) scale(1)';
                    swipeContent.style.opacity = '1';

                    setTimeout(() => {
                        window.requestAnimationFrame(() => {
                            if (swipeContent) {
                                swipeContent.style.transition = '';
                                swipeContent.style.transform = '';
                                swipeContent.style.opacity = '';
                                swipeContent.style.willChange = '';
                            }
                        });
                    }, 450);
                }
            } else {
                // Clean reset
                swipeContent.style.transition = '';
                swipeContent.style.transform = '';
                swipeContent.style.opacity = '';
                swipeContent.style.willChange = '';
            }

            touchStartX = null;
            touchStartY = null;
            isSwiping = false;
        }, { passive: true });
    },

    /**
     * Navigue vers l'élève précédent avec animation
     */
    navigatePrev() {
        const currentIndex = this.callbacks.getCurrentIndex();
        if (currentIndex <= 0) return;
        this._navigateWithAnimation('prev');
    },

    /**
     * Navigue vers l'élève suivant avec animation
     */
    navigateNext() {
        const currentIndex = this.callbacks.getCurrentIndex();
        const filteredResults = appState.filteredResults;
        if (currentIndex >= filteredResults.length - 1) return;
        this._navigateWithAnimation('next');
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

        const currentIndex = this.callbacks.getCurrentIndex();
        const total = appState.filteredResults.length;

        if (prevBtn) prevBtn.disabled = currentIndex <= 0;
        if (nextBtn) nextBtn.disabled = currentIndex >= total - 1;
        if (positionEl) positionEl.textContent = `${currentIndex + 1}/${total}`;

        if (analysisPrevBtn) analysisPrevBtn.disabled = currentIndex <= 0;
        if (analysisNextBtn) analysisNextBtn.disabled = currentIndex >= total - 1;
        if (analysisPositionEl) analysisPositionEl.textContent = `${currentIndex + 1}/${total}`;
    },

    /**
     * Navigation avec animation de transition
     * @param {'prev'|'next'} direction - Direction de navigation
     * @param {number|null} swipeStartX - Position X de départ si c'est un swipe
     * @private
     */
    _navigateWithAnimation(direction, swipeStartX = null) {
        // Cancel edit mode before navigating (don't save, just discard)
        const header = document.querySelector('.focus-header');
        if (header && header.classList.contains('editing')) {
            FocusPanelHeader.toggleEditMode(false, true); // Cancel without saving
        }

        const isAnalysisVisible = FocusPanelAnalysis.isVisible && FocusPanelAnalysis.isVisible();
        const content = isAnalysisVisible
            ? document.querySelector('.focus-analysis-content-area')
            : document.querySelector('.focus-main-page .focus-content');

        const currentIndex = this.callbacks.getCurrentIndex();

        if (!content) {
            // Fallback sans animation
            this.callbacks.saveContext();
            const targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
            const filteredResult = appState.filteredResults[targetIndex];
            if (filteredResult) {
                const targetResult = appState.generatedResults.find(r => r.id === filteredResult.id) || filteredResult;
                this._switchToStudent(targetResult, targetIndex);
            }
            return;
        }

        // Clean up any ongoing animations
        if (this._animTimeout) {
            clearTimeout(this._animTimeout);
            this._animTimeout = null;
        }
        if (this._activeClone) {
            this._activeClone.remove();
            this._activeClone = null;
        }

        // 1. Prepare Target Data
        const targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
        const filteredResult = appState.filteredResults[targetIndex];
        if (!filteredResult) return;

        const targetResult = appState.generatedResults.find(r => r.id === filteredResult.id) || filteredResult;

        // 2. Clone Current Content (Retains the swipe-induced inline styles)
        const clone = content.cloneNode(true);
        this._activeClone = clone;
        const parent = content.offsetParent || document.body;

        clone.style.position = 'absolute';
        clone.style.top = `${content.offsetTop}px`;
        clone.style.left = `${content.offsetLeft}px`;
        clone.style.width = `${content.offsetWidth}px`;
        clone.style.height = `${content.offsetHeight}px`;
        clone.style.margin = '0';
        clone.style.zIndex = '10';
        clone.style.pointerEvents = 'none';
        clone.style.overflow = 'hidden';
        clone.scrollTop = content.scrollTop;

        if (swipeStartX === null) {
            clone.style.transform = 'translateX(0) scale(1)';
            clone.style.opacity = '1';
        }

        // Ensure parent is positioned relative
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.position === 'static') {
            parent.style.position = 'relative';
        }

        parent.appendChild(clone);

        // 3. Update State & Content IMMEDIATELY
        this.callbacks.saveContext();

        // Prepare new content for animation
        content.style.transition = 'none';
        content.style.opacity = '0';
        content.style.willChange = 'transform, opacity';

        // Switch Logic
        this._switchToStudent(targetResult, targetIndex);

        // Analysis Refresh if needed
        if (isAnalysisVisible && FocusPanelAnalysis.show) {
            FocusPanelAnalysis.show();
        }

        content.scrollTop = 0;

        // 4. Trigger Inline Animations (iOS Gallery Physics)
        requestAnimationFrame(() => {
            const viewportMultiplier = window.innerWidth > 600 ? 0.6 : 1.0;
            const exitX = direction === 'next' ? -window.innerWidth * viewportMultiplier : window.innerWidth * viewportMultiplier;
            const enterX = direction === 'next' ? window.innerWidth * viewportMultiplier : -window.innerWidth * viewportMultiplier;

            // Animate Clone Out
            clone.style.transition = 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.4s ease';
            clone.style.transform = `translateX(${exitX}px) scale(0.92)`;
            clone.style.opacity = '0';

            // Position Content for Enter
            content.style.transition = 'none';
            content.style.transform = `translateX(${enterX}px) scale(0.92)`;
            content.style.opacity = '0';

            // Force reflow
            void content.offsetWidth;

            // Animate Content In
            content.style.transition = 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.4s ease';
            content.style.transform = 'translateX(0) scale(1)';
            content.style.opacity = '1';
        });

        // 5. Cleanup
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
            this._animTimeout = null;
        }, 480);
    },

    /**
     * Internal helper to switch state and render new student
     */
    _switchToStudent(targetResult, targetIndex) {
        this.callbacks.setCurrentStudentId(targetResult.id);
        this.callbacks.setCurrentIndex(targetIndex);

        // Update active row highlight in list view
        if (this.callbacks.onUpdateActiveRow) {
            this.callbacks.onUpdateActiveRow(targetResult.id);
        }

        // Load unified persistent history for the new student
        FocusPanelHistory.load(targetResult.id);

        // Hide spinner if it was stuck
        const generateBtn = document.getElementById('focusGenerateBtn');
        if (generateBtn) UI.hideInlineSpinner(generateBtn);

        this.callbacks.updateAppreciationStatus(null, { state: 'none' });

        this.callbacks.renderContent(targetResult);
        this.updateControls();
    }
};
