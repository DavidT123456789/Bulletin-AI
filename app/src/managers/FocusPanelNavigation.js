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

        const currentIndex = this.callbacks.getCurrentIndex();
        const total = appState.filteredResults.length;

        if (prevBtn) prevBtn.disabled = currentIndex <= 0;
        if (nextBtn) nextBtn.disabled = currentIndex >= total - 1;
        if (positionEl) positionEl.textContent = `${currentIndex + 1}/${total}`;
    },

    /**
     * Navigation avec animation de transition
     * @param {'prev'|'next'} direction - Direction de navigation
     * @private
     */
    _navigateWithAnimation(direction) {
        // Cancel edit mode before navigating (don't save, just discard)
        const header = document.querySelector('.focus-header');
        if (header && header.classList.contains('editing')) {
            FocusPanelHeader.toggleEditMode(false, true); // Cancel without saving
        }

        const isAnalysisVisible = FocusPanelAnalysis.isVisible();
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
                // We don't have a direct 'open' callback usually, but we can set state and render
                this._switchToStudent(targetResult, targetIndex);
            }
            return;
        }

        // 1. Prepare Target Data
        const targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
        const filteredResult = appState.filteredResults[targetIndex];
        if (!filteredResult) return;

        const targetResult = appState.generatedResults.find(r => r.id === filteredResult.id) || filteredResult;

        // 2. Clone Current Content (Eliminates the "Empty Void")
        const clone = content.cloneNode(true);
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

        // Ensure parent is positioned relative so absolute positioning works
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.position === 'static') {
            parent.style.position = 'relative';
        }

        parent.appendChild(clone);

        // 3. Animation Classes
        const outClass = direction === 'next' ? 'slide-out-left' : 'slide-out-right';
        const inClass = direction === 'next' ? 'slide-in-right' : 'slide-in-left';

        // 4. Update State & Content IMMEDIATELY
        this.callbacks.saveContext();

        // Switch Logic
        this._switchToStudent(targetResult, targetIndex);

        // Analysis Refresh if needed
        if (isAnalysisVisible) {
            FocusPanelAnalysis.show(); // Refreshes for the new currentStudentId
        }

        content.scrollTop = 0;

        // 5. Trigger Animations
        requestAnimationFrame(() => {
            clone.classList.add(outClass);

            content.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right');
            // Force reflow
            void content.offsetWidth;
            content.classList.add(inClass);
        });

        // 6. Cleanup
        setTimeout(() => {
            clone.remove();
            content.classList.remove(inClass);
            // Clean up parent style if we modified it? Better safe than sorry to leave it if it doesn't break anything.
        }, 400);
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
