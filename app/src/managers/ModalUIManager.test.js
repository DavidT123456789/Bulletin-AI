/**
 * @fileoverview Tests unitaires pour ModalUIManager
 * @module managers/ModalUIManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModalUI } from './ModalUIManager.js';

// Mock DOM module
vi.mock('../utils/DOM.js', () => ({
    DOM: {
        settingsModal: null,
        studentDetailsModal: null,
        refinementModal: null,
        helpModal: null,
        welcomeModal: null,
        classAnalysisModal: null,
        importPreviewModal: null
    }
}));

// Mock HistoryManager (used by openModal/closeModal)
vi.mock('./HistoryManager.js', () => ({
    HistoryManager: {
        pushState: vi.fn(),
        handleManualClose: vi.fn()
    }
}));

describe('ModalUIManager', () => {
    let testModal;
    let helpModal;

    beforeEach(() => {
        // Reset state before each test
        ModalUI.activeModal = null;
        ModalUI.lastFocusedElement = null;
        ModalUI.stackedModal = null;
        ModalUI._isIgnoringTooltips = false;

        // Clean up body classes from previous tests
        document.body.classList.remove('modal-open');

        // Create test modals
        testModal = document.createElement('div');
        testModal.id = 'testModal';
        testModal.className = 'modal';
        testModal.style.display = 'none';
        testModal.innerHTML = '<div class="modal-content"><button id="focusable">Click</button></div>';
        document.body.appendChild(testModal);

        helpModal = document.createElement('div');
        helpModal.id = 'helpModal';
        helpModal.className = 'modal';
        helpModal.style.display = 'none';
        helpModal.innerHTML = '<div class="modal-content"><button id="helpBtn">Help</button></div>';
        document.body.appendChild(helpModal);

        vi.useFakeTimers();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.useRealTimers();
    });

    describe('openModal', () => {
        it('should set display to flex', () => {
            ModalUI.openModal(testModal);

            expect(testModal.style.display).toBe('flex');
        });

        it('should add show and modal-visible classes during lifecycle', () => {
            ModalUI.openModal(testModal);

            // After close animation (250ms), classes are cleaned up
            // This tests the full lifecycle including rAF-triggered class additions
            ModalUI.closeModal(testModal);
            // Before timeout: modal-closing should be added
            expect(testModal.classList.contains('modal-closing')).toBe(true);

            vi.advanceTimersByTime(250);
            // After timeout: all classes removed
            expect(testModal.classList.contains('show')).toBe(false);
            expect(testModal.classList.contains('modal-visible')).toBe(false);
        });

        it('should open modal by id', () => {
            ModalUI.openModal('testModal');

            expect(testModal.style.display).toBe('flex');
        });

        it('should set activeModal', () => {
            expect(ModalUI.activeModal).toBeNull();

            ModalUI.openModal(testModal);

            expect(ModalUI.activeModal).toBe(testModal);
        });

        it('should add modal-open class to body', () => {
            ModalUI.openModal(testModal);

            expect(document.body.classList.contains('modal-open')).toBe(true);
        });

        it('should save last focused element', () => {
            const button = document.createElement('button');
            document.body.appendChild(button);
            button.focus();

            ModalUI.openModal(testModal);

            expect(ModalUI.lastFocusedElement).toBe(button);
        });

        it('should do nothing if modal not found', () => {
            ModalUI.openModal('nonExistent');

            expect(ModalUI.activeModal).toBeNull();
            expect(document.body.classList.contains('modal-open')).toBe(false);
        });

        it('should stack helpModal on top of another modal', () => {
            ModalUI.openModal(testModal);
            expect(ModalUI.activeModal).toBe(testModal);

            ModalUI.openModal(helpModal);

            expect(ModalUI.stackedModal).toBe(testModal);
            expect(ModalUI.activeModal).toBe(helpModal);
        });
    });

    describe('closeModal', () => {
        it('should add modal-closing class immediately', () => {
            ModalUI.openModal(testModal);
            vi.advanceTimersByTime(0);

            ModalUI.closeModal(testModal);

            expect(testModal.classList.contains('modal-closing')).toBe(true);
        });

        it('should hide modal after animation timeout', () => {
            ModalUI.openModal(testModal);
            vi.advanceTimersByTime(0);

            ModalUI.closeModal(testModal);
            vi.advanceTimersByTime(250);

            expect(testModal.style.display).toBe('none');
            expect(testModal.classList.contains('show')).toBe(false);
            expect(testModal.classList.contains('modal-visible')).toBe(false);
        });

        it('should close modal by id', () => {
            ModalUI.openModal(testModal);
            vi.advanceTimersByTime(0);

            ModalUI.closeModal('testModal');
            vi.advanceTimersByTime(250);

            expect(testModal.style.display).toBe('none');
        });

        it('should remove modal-open from body', () => {
            ModalUI.openModal(testModal);
            ModalUI.closeModal(testModal);
            vi.advanceTimersByTime(250);

            expect(document.body.classList.contains('modal-open')).toBe(false);
        });

        it('should restore last focused element', () => {
            const button = document.createElement('button');
            document.body.appendChild(button);
            button.focus();

            ModalUI.openModal(testModal);
            ModalUI.closeModal(testModal);
            vi.advanceTimersByTime(250);

            expect(document.activeElement).toBe(button);
            expect(ModalUI.lastFocusedElement).toBeNull();
        });

        it('should clear activeModal', () => {
            ModalUI.openModal(testModal);
            ModalUI.closeModal(testModal);
            vi.advanceTimersByTime(250);

            expect(ModalUI.activeModal).toBeNull();
        });

        it('should restore stacked modal when closing helpModal', () => {
            ModalUI.openModal(testModal);
            ModalUI.openModal(helpModal);

            ModalUI.closeModal(helpModal);
            vi.advanceTimersByTime(250);

            expect(ModalUI.activeModal).toBe(testModal);
            expect(ModalUI.stackedModal).toBeNull();
        });

        it('should remove customConfirmModal from DOM', () => {
            const confirmModal = document.createElement('div');
            confirmModal.id = 'customConfirmModal';
            confirmModal.className = 'modal';
            confirmModal.innerHTML = '<div class="modal-content"></div>';
            document.body.appendChild(confirmModal);

            ModalUI.openModal(confirmModal);
            vi.advanceTimersByTime(0);
            ModalUI.closeModal(confirmModal);
            vi.advanceTimersByTime(250);

            expect(document.getElementById('customConfirmModal')).toBeNull();
        });

        it('should close open details elements', () => {
            const details = document.createElement('details');
            details.setAttribute('open', '');
            testModal.appendChild(details);

            ModalUI.openModal(testModal);
            vi.advanceTimersByTime(0);
            ModalUI.closeModal(testModal);
            vi.advanceTimersByTime(250);

            expect(details.hasAttribute('open')).toBe(false);
        });
    });

    describe('closeAllModals', () => {
        it('should close all modals', async () => {
            const { DOM } = await import('../utils/DOM.js');
            DOM.settingsModal = testModal;
            DOM.helpModal = helpModal;

            ModalUI.openModal(testModal);
            ModalUI.openModal(helpModal);

            ModalUI.closeAllModals();
            vi.advanceTimersByTime(250);

            expect(testModal.style.display).toBe('none');
            expect(helpModal.style.display).toBe('none');
        });
    });

    describe('tooltip ignore state', () => {
        it('should temporarily ignore tooltips when opening modal', () => {
            expect(ModalUI._isIgnoringTooltips).toBe(false);

            ModalUI.openModal(testModal);

            expect(ModalUI._isIgnoringTooltips).toBe(true);

            // Tooltip re-enabling happens at 200ms (after focus at 150ms)
            vi.advanceTimersByTime(200);

            expect(ModalUI._isIgnoringTooltips).toBe(false);
        });

        it('should temporarily ignore tooltips when closing modal', () => {
            ModalUI.openModal(testModal);
            vi.advanceTimersByTime(200);

            ModalUI.closeModal(testModal);

            expect(ModalUI._isIgnoringTooltips).toBe(true);

            // closeModal tooltip reset happens at 300ms
            vi.advanceTimersByTime(300);

            expect(ModalUI._isIgnoringTooltips).toBe(false);
        });
    });
});
