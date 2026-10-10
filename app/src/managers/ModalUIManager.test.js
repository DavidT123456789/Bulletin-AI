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

        it('should not call HistoryManager.handleManualClose if modal is already closed or closing', async () => {
            const { HistoryManager } = await import('./HistoryManager.js');
            vi.clearAllMocks();

            // Modale fermée initialement
            testModal.style.display = 'none';
            testModal.classList.remove('modal-visible', 'show', 'modal-closing');

            ModalUI.closeModal(testModal);
            expect(HistoryManager.handleManualClose).not.toHaveBeenCalled();

            // Modale déjà en cours de fermeture
            testModal.classList.add('modal-closing');
            ModalUI.closeModal(testModal);
            expect(HistoryManager.handleManualClose).not.toHaveBeenCalled();
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

    describe('showConflictResolutionModal', () => {
        it('should render modal with details and resolve with selected choice', async () => {
            const promise = ModalUI.showConflictResolutionModal({
                remoteDate: 1726000000000,
                localStudentCount: 25
            });

            const modal = document.getElementById('conflictResolutionModal');
            expect(modal).not.toBeNull();
            expect(modal.textContent).toContain('25 élèves');

            const mergeBtn = document.getElementById('conflictChoiceMerge');
            expect(mergeBtn).not.toBeNull();
            mergeBtn.click();

            const result = await promise;
            expect(result).toBe('merge');
        });

        it('should resolve with overwrite when overwrite button is clicked', async () => {
            const promise = ModalUI.showConflictResolutionModal();
            const overwriteBtn = document.getElementById('conflictChoiceOverwrite');
            overwriteBtn.click();

            const result = await promise;
            expect(result).toBe('overwrite');
        });

        it('should resolve with restore when restore button is clicked', async () => {
            const promise = ModalUI.showConflictResolutionModal();
            const restoreBtn = document.getElementById('conflictChoiceRestore');
            restoreBtn.click();

            const result = await promise;
            expect(result).toBe('restore');
        });

        it('should resolve with cancel when cancel button is clicked', async () => {
            const promise = ModalUI.showConflictResolutionModal();
            const cancelBtn = document.getElementById('conflictCancelBtn');
            cancelBtn.click();

            const result = await promise;
            expect(result).toBe('cancel');
        });
    });

    describe('showRestoreConfirmationModal', () => {
        it('should render comparison details and resolve true on confirm', async () => {
            const promise = ModalUI.showRestoreConfirmationModal({
                remoteDate: 1726000000000,
                remoteStudentCount: 304,
                remoteClassCount: 8,
                localStudentCount: 280,
                localClassCount: 7,
                providerName: 'google'
            });

            const modal = document.getElementById('restoreConfirmationModal');
            expect(modal).not.toBeNull();
            expect(modal.textContent).toContain('304 élèves');
            expect(modal.textContent).toContain('8 classes');
            expect(modal.textContent).toContain('280 élèves');
            expect(modal.textContent).toContain('Google Drive');

            const okBtn = document.getElementById('restoreConfirmOkBtn');
            expect(okBtn).not.toBeNull();
            okBtn.click();

            const result = await promise;
            expect(result).toBe(true);
        });

        it('should resolve false when cancel button is clicked', async () => {
            const promise = ModalUI.showRestoreConfirmationModal({
                remoteStudentCount: 50,
                localStudentCount: 10
            });

            const cancelBtn = document.getElementById('restoreConfirmCancelBtn');
            cancelBtn.click();

            const result = await promise;
            expect(result).toBe(false);
        });

        it('should resolve false on Escape key', async () => {
            const promise = ModalUI.showRestoreConfirmationModal();

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

            const result = await promise;
            expect(result).toBe(false);
        });

        it('should resolve true on Enter key', async () => {
            const promise = ModalUI.showRestoreConfirmationModal();

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

            const result = await promise;
            expect(result).toBe(true);
        });

        it('should hide redundant volume counts when remote and local volumes are identical', async () => {
            const promise = ModalUI.showRestoreConfirmationModal({
                remoteDate: 1726000000000,
                remoteStudentCount: 28,
                remoteClassCount: 1,
                localStudentCount: 28,
                localClassCount: 1,
                syncState: 'in-sync'
            });

            const modal = document.getElementById('restoreConfirmationModal');
            expect(modal).not.toBeNull();
            // Should NOT duplicate redundant "28 élèves" counters
            expect(modal.querySelector('.restore-comparison-card.cloud .restore-card-sub-stat').textContent).toBe('Sauvegarde en ligne');
            expect(modal.querySelector('.restore-comparison-card.local .restore-card-sub-stat').textContent).toBe('À jour');
            expect(modal.textContent).toContain('Session alignée');

            const cancelBtn = document.getElementById('restoreConfirmCancelBtn');
            cancelBtn.click();
            await promise;
        });

        it('should show unified impact box and list local changes without accordion button when syncState is local-changes', async () => {
            // Mock local changes with seating chart change
            window.appState = {
                classes: [{ id: 'c1', name: '6A', seatingUpdatedAt: Date.now() }]
            };
            window.runtimeState = {
                data: { generatedResults: [] }
            };

            const promise = ModalUI.showRestoreConfirmationModal({
                remoteDate: 1726000000000,
                localDate: Date.now(),
                remoteStudentCount: 28,
                localStudentCount: 28,
                syncState: 'local-changes',
                lastSyncTime: 1726000000000
            });

            const modal = document.getElementById('restoreConfirmationModal');
            expect(modal.querySelector('.restore-impact-box.warning')).not.toBeNull();
            expect(modal.textContent).toContain('Sera remplacé sur cet appareil');

            // No unnecessary accordion button
            expect(document.getElementById('modalAlertDetailsBtn')).toBeNull();

            // Directly lists seating chart change and safety assurance
            const impactBox = modal.querySelector('.restore-impact-box.warning');
            expect(impactBox.textContent).toContain('Plan de classe réorganisé');
            expect(impactBox.textContent).toContain('Une copie de secours de votre session sera créée automatiquement');

            // Two-line date display: relative stat and exact timestamp
            expect(modal.querySelector('.restore-comparison-card.cloud .restore-card-exact-date')).not.toBeNull();
            expect(modal.querySelector('.restore-comparison-card.local .restore-card-exact-date')).not.toBeNull();

            // Primary button has no duplicate icon
            const okBtn = document.getElementById('restoreConfirmOkBtn');
            expect(okBtn.querySelector('iconify-icon')).toBeNull();
            expect(okBtn.textContent.trim()).toBe('Restaurer');

            const cancelBtn = document.getElementById('restoreConfirmCancelBtn');
            cancelBtn.click();
            await promise;

            delete window.appState;
            delete window.runtimeState;
        });
    });

    describe('showSaveConfirmationModal', () => {
        it('should render save summary details and resolve true on confirm', async () => {
            const promise = ModalUI.showSaveConfirmationModal({
                localStudentCount: 305,
                localClassCount: 13,
                providerName: 'google',
                providerLabel: 'Google Drive',
                lastSyncTime: Date.now() - 3600000 // 1 hour ago
            });

            const modal = document.getElementById('saveConfirmationModal');
            expect(modal).not.toBeNull();
            expect(modal.textContent).toContain('Sauvegarder vers le Cloud');
            expect(modal.textContent).toContain('305 élèves');
            expect(modal.textContent).toContain('13 classes');
            expect(modal.textContent).toContain('Google Drive');
            expect(modal.querySelector('.restore-safety-notice.warning')).toBeNull();

            const okBtn = document.getElementById('saveConfirmOkBtn');
            expect(okBtn).not.toBeNull();
            okBtn.click();

            const result = await promise;
            expect(result).toBe(true);
        });

        it('should resolve false when cancel button is clicked and fallback to provider metadata without printing null', async () => {
            const promise = ModalUI.showSaveConfirmationModal({
                localStudentCount: 50,
                localClassCount: 2,
                providerName: 'google'
            });

            const modal = document.getElementById('saveConfirmationModal');
            expect(modal).not.toBeNull();
            expect(modal.textContent).toContain('Google Drive');
            expect(modal.querySelector('.restore-card-badge span').textContent).toBe('Google Drive');
            expect(modal.textContent).not.toContain('null');

            const cancelBtn = document.getElementById('saveConfirmCancelBtn');
            expect(cancelBtn).not.toBeNull();
            cancelBtn.click();

            const result = await promise;
            expect(result).toBe(false);
        });

        it('should safely coerce null counts without printing null élève', async () => {
            const promise = ModalUI.showSaveConfirmationModal({
                localStudentCount: null,
                localClassCount: null
            });

            const modal = document.getElementById('saveConfirmationModal');
            expect(modal.textContent).toContain('0 élève · 0 classe');
            expect(modal.textContent).not.toContain('null élève');

            const cancelBtn = document.getElementById('saveConfirmCancelBtn');
            cancelBtn.click();
            await promise;
        });

        it('should resolve false on Escape key', async () => {
            const promise = ModalUI.showSaveConfirmationModal();

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

            const result = await promise;
            expect(result).toBe(false);
        });

        it('should resolve true on Enter key', async () => {
            const promise = ModalUI.showSaveConfirmationModal();

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

            const result = await promise;
            expect(result).toBe(true);
        });

        it('should display data shrinkage warning when remote count exceeds local count', async () => {
            const promise = ModalUI.showSaveConfirmationModal({
                localStudentCount: 20,
                localClassCount: 1,
                remoteStudentCount: 305
            });

            const modal = document.getElementById('saveConfirmationModal');
            expect(modal).not.toBeNull();
            const warningEl = modal.querySelector('.restore-safety-notice.warning');
            expect(warningEl).not.toBeNull();
            expect(warningEl.textContent).toContain('Attention (réduction de données)');
            expect(warningEl.textContent).toContain('305 élèves');
            expect(warningEl.textContent).toContain('20 élèves');

            const okBtn = document.getElementById('saveConfirmOkBtn');
            okBtn.click();
            await promise;
        });

        it('should adapt alert message when syncState is in-sync vs local-changes', async () => {
            const inSyncPromise = ModalUI.showSaveConfirmationModal({
                localStudentCount: 28,
                localClassCount: 1,
                syncState: 'in-sync'
            });

            const inSyncModal = document.getElementById('saveConfirmationModal');
            expect(inSyncModal.querySelector('.modal-alert-message').textContent).toContain('déjà synchronisé');
            document.getElementById('saveConfirmCancelBtn').click();
            await inSyncPromise;

            const localChangesPromise = ModalUI.showSaveConfirmationModal({
                localStudentCount: 28,
                localClassCount: 1,
                syncState: 'local-changes'
            });

            const localChangesModal = document.getElementById('saveConfirmationModal');
            expect(localChangesModal.querySelector('.modal-alert-message').textContent).toContain('modifications locales');
            document.getElementById('saveConfirmCancelBtn').click();
            await localChangesPromise;
        });
    });
});

