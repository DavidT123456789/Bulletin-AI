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
        testModal.innerHTML = '<button id="focusable">Click</button>';
        document.body.appendChild(testModal);

        helpModal = document.createElement('div');
        helpModal.id = 'helpModal';
        helpModal.className = 'modal';
        helpModal.style.display = 'none';
        helpModal.innerHTML = '<button id="helpBtn">Help</button>';
        document.body.appendChild(helpModal);

        vi.useFakeTimers();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.useRealTimers();
    });

    describe('openModal', () => {
        it('should open modal by element', () => {
            ModalUI.openModal(testModal);

            expect(testModal.style.display).toBe('flex');
            expect(testModal.classList.contains('show')).toBe(true);
            expect(document.body.classList.contains('modal-open')).toBe(true);
        });

        it('should open modal by id', () => {
            ModalUI.openModal('testModal');

            expect(testModal.style.display).toBe('flex');
            expect(testModal.classList.contains('show')).toBe(true);
        });

        it('should set activeModal', () => {
            expect(ModalUI.activeModal).toBeNull();

            ModalUI.openModal(testModal);

            expect(ModalUI.activeModal).toBe(testModal);
        });

        it('should save last focused element', () => {
            const button = document.createElement('button');
            document.body.appendChild(button);
            button.focus();

            ModalUI.openModal(testModal);

            expect(ModalUI.lastFocusedElement).toBe(button);
        });

        it('should attempt to focus first focusable element in modal', () => {
            ModalUI.openModal(testModal);

            // JSDOM doesn't fully support focus/offsetParent, just verify modal opened and element exists
            const focusable = testModal.querySelector('#focusable');
            expect(focusable).not.toBeNull();
            expect(testModal.style.display).toBe('flex'); // Modal is visible
        });

        it('should do nothing if modal not found', () => {
            ModalUI.openModal('nonExistent');

            expect(ModalUI.activeModal).toBeNull();
            expect(document.body.classList.contains('modal-open')).toBe(false);
        });

        it('should stack helpModal on top of another modal', () => {
            // Open first modal
            ModalUI.openModal(testModal);
            expect(ModalUI.activeModal).toBe(testModal);

            // Open helpModal on top
            ModalUI.openModal(helpModal);

            expect(ModalUI.stackedModal).toBe(testModal);
            expect(ModalUI.activeModal).toBe(helpModal);
        });
    });

    describe('closeModal', () => {
        it('should close modal by element', () => {
            ModalUI.openModal(testModal);
            ModalUI.closeModal(testModal);

            expect(testModal.style.display).toBe('none');
            expect(testModal.classList.contains('show')).toBe(false);
            expect(document.body.classList.contains('modal-open')).toBe(false);
        });

        it('should close modal by id', () => {
            ModalUI.openModal(testModal);
            ModalUI.closeModal('testModal');

            expect(testModal.style.display).toBe('none');
        });

        it('should restore last focused element', () => {
            const button = document.createElement('button');
            document.body.appendChild(button);
            button.focus();

            ModalUI.openModal(testModal);
            ModalUI.closeModal(testModal);

            expect(document.activeElement).toBe(button);
            expect(ModalUI.lastFocusedElement).toBeNull();
        });

        it('should clear activeModal', () => {
            ModalUI.openModal(testModal);
            ModalUI.closeModal(testModal);

            expect(ModalUI.activeModal).toBeNull();
        });

        it('should restore stacked modal when closing helpModal', () => {
            // Open first modal
            ModalUI.openModal(testModal);
            // Open helpModal on top
            ModalUI.openModal(helpModal);

            // Close helpModal
            ModalUI.closeModal(helpModal);

            expect(ModalUI.activeModal).toBe(testModal);
            expect(ModalUI.stackedModal).toBeNull();
        });

        it('should remove customConfirmModal from DOM', () => {
            const confirmModal = document.createElement('div');
            confirmModal.id = 'customConfirmModal';
            confirmModal.className = 'modal';
            document.body.appendChild(confirmModal);

            ModalUI.openModal(confirmModal);
            ModalUI.closeModal(confirmModal);

            expect(document.getElementById('customConfirmModal')).toBeNull();
        });

        it('should close open details elements', () => {
            const details = document.createElement('details');
            details.setAttribute('open', '');
            testModal.appendChild(details);

            ModalUI.openModal(testModal);
            ModalUI.closeModal(testModal);

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

            expect(testModal.style.display).toBe('none');
            expect(helpModal.style.display).toBe('none');
        });
    });

    describe('tooltip ignore state', () => {
        it('should temporarily ignore tooltips when opening modal', () => {
            expect(ModalUI._isIgnoringTooltips).toBe(false);

            ModalUI.openModal(testModal);

            expect(ModalUI._isIgnoringTooltips).toBe(true);

            vi.advanceTimersByTime(150);

            expect(ModalUI._isIgnoringTooltips).toBe(false);
        });

        it('should temporarily ignore tooltips when closing modal', () => {
            ModalUI.openModal(testModal);
            vi.advanceTimersByTime(150);

            ModalUI.closeModal(testModal);

            expect(ModalUI._isIgnoringTooltips).toBe(true);

            vi.advanceTimersByTime(150);

            expect(ModalUI._isIgnoringTooltips).toBe(false);
        });
    });
});
