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

        it('should dispatch welcome-modal-close when closing welcomeModal', () => {
            const welcomeEl = document.createElement('div');
            welcomeEl.id = 'welcomeModal';
            welcomeEl.className = 'modal';
            document.body.appendChild(welcomeEl);

            const listener = vi.fn();
            document.addEventListener('welcome-modal-close', listener);

            ModalUI.openModal(welcomeEl);
            ModalUI.closeModal(welcomeEl, { causedByHistory: true });

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener.mock.calls[0][0].detail).toEqual({
                modalId: 'welcomeModal',
                options: { causedByHistory: true }
            });

            document.removeEventListener('welcome-modal-close', listener);
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

        it('should stack customConfirmModal over an open modal, remove it from DOM, and restore the underlying modal', () => {
            ModalUI.openModal(testModal);

            const confirmModal = document.createElement('div');
            confirmModal.id = 'customConfirmModal';
            confirmModal.className = 'modal';
            confirmModal.innerHTML = '<div class="modal-content"></div>';
            document.body.appendChild(confirmModal);

            ModalUI.openModal(confirmModal);
            expect(ModalUI.stackedModal).toBe(testModal);
            expect(ModalUI.activeModal).toBe(confirmModal);

            ModalUI.closeModal(confirmModal);
            vi.advanceTimersByTime(250);

            expect(document.getElementById('customConfirmModal')).toBeNull();
            expect(ModalUI.activeModal).toBe(testModal);
            expect(ModalUI.stackedModal).toBeNull();
            expect(document.body.classList.contains('modal-open')).toBe(true);
        });

        it('should restore focus to the original trigger after a stacked confirm and the underlying modal close', () => {
            const trigger = document.createElement('button');
            document.body.appendChild(trigger);
            trigger.focus();

            ModalUI.openModal(testModal);

            const confirmModal = document.createElement('div');
            confirmModal.id = 'customConfirmModal';
            confirmModal.className = 'modal';
            confirmModal.innerHTML = '<div class="modal-content"><button>OK</button></div>';
            document.body.appendChild(confirmModal);

            ModalUI.openModal(confirmModal);
            ModalUI.closeModal(confirmModal);
            vi.advanceTimersByTime(250);

            ModalUI.closeModal(testModal);
            vi.advanceTimersByTime(250);

            expect(document.activeElement).toBe(trigger);
        });

        it('should not clobber activeModal when a new modal opens while customConfirmModal is closing', () => {
            const confirmModal = document.createElement('div');
            confirmModal.id = 'customConfirmModal';
            confirmModal.className = 'modal';
            confirmModal.innerHTML = '<div class="modal-content"></div>';
            document.body.appendChild(confirmModal);

            ModalUI.openModal(confirmModal);
            ModalUI.closeModal(confirmModal);

            // Simulate switching to another modal (e.g. ImportWizard) before the 250ms close timeout finishes
            ModalUI.openModal(testModal);
            expect(ModalUI.activeModal).toBe(testModal);

            vi.advanceTimersByTime(250);

            expect(document.getElementById('customConfirmModal')).toBeNull();
            expect(ModalUI.activeModal).toBe(testModal);
            expect(document.body.classList.contains('modal-open')).toBe(true);
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
        it('should render a true conflict with merge recommended and focused, and resolve with selected choice', async () => {
            const promise = ModalUI.showConflictResolutionModal({
                remoteDate: 1726000000000,
                syncState: 'conflict'
            });

            const modal = document.getElementById('conflictResolutionModal');
            expect(modal).not.toBeNull();
            expect(modal.textContent).toContain('Conflit de synchronisation');
            expect(modal.textContent).toContain('modifications non sauvegardées');

            const mergeBtn = document.getElementById('conflictChoiceMerge');
            expect(mergeBtn.classList.contains('recommended')).toBe(true);
            expect(document.activeElement).toBe(mergeBtn);
            mergeBtn.click();

            const result = await promise;
            expect(result).toBe('merge');
        });

        it('should not claim local changes nor offer merge when only the Cloud is newer', async () => {
            const promise = ModalUI.showConflictResolutionModal({
                remoteDate: 1726000000000,
                syncState: 'cloud-changes'
            });

            const modal = document.getElementById('conflictResolutionModal');
            expect(modal.textContent).toContain('Version Cloud plus récente');
            expect(modal.textContent).toContain('aucune modification non sauvegardée');
            expect(document.getElementById('conflictChoiceMerge')).toBeNull();

            const restoreBtn = document.getElementById('conflictChoiceRestore');
            expect(restoreBtn.classList.contains('recommended')).toBe(true);
            expect(document.activeElement).toBe(restoreBtn);
            expect(document.getElementById('conflictChoiceOverwrite')).not.toBeNull();

            restoreBtn.click();
            expect(await promise).toBe('restore');
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

        it('should omit the redundant third line when remote and local volumes are identical', async () => {
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
            expect(modal.querySelector('.restore-comparison-card.cloud .restore-card-sub-stat')).toBeNull();
            expect(modal.querySelector('.restore-comparison-card.local .restore-card-sub-stat')).toBeNull();
            expect(modal.textContent).toContain('Session alignée');

            const cancelBtn = document.getElementById('restoreConfirmCancelBtn');
            cancelBtn.click();
            await promise;
        });

        it('should show unified impact box and list local changes without false appreciation counts when syncState is local-changes', async () => {
            // Mock local changes with seating chart change (and student._lastModified updated by seat move)
            window.appState = {
                classes: [{ id: 'c1', name: '6A', seatingUpdatedAt: Date.now() }]
            };
            window.runtimeState = {
                data: { generatedResults: [{ id: 's1', _lastModified: Date.now(), studentData: { periods: {} } }] }
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
            const impactBox = modal.querySelector('.restore-impact-box.warning');
            expect(impactBox).not.toBeNull();
            expect(impactBox.textContent).toContain('Sera remplacé sur cet appareil');
            expect(impactBox.textContent).toContain('Plan de classe réorganisé');
            expect(impactBox.textContent).not.toContain('appréciations ou notes éditées');
            expect(impactBox.textContent).toContain('Une copie de secours de votre session sera créée automatiquement');

            // Two-line date display: relative stat and exact timestamp
            expect(modal.querySelector('.restore-comparison-card.cloud .restore-card-exact-date')).not.toBeNull();
            expect(modal.querySelector('.restore-comparison-card.local .restore-card-exact-date')).not.toBeNull();

            // Primary button has no duplicate icon
            const okBtn = document.getElementById('restoreConfirmOkBtn');
            expect(okBtn.querySelector('iconify-icon')).toBeNull();
            expect(okBtn.textContent.trim()).toBe('Restaurer');

            // Destructive restore: safe default focus and no blind Enter confirmation
            const cancelBtn = document.getElementById('restoreConfirmCancelBtn');
            expect(document.activeElement).toBe(cancelBtn);
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
            expect(document.getElementById('restoreConfirmationModal')).not.toBeNull();

            cancelBtn.click();
            expect(await promise).toBe(false);

            delete window.appState;
            delete window.runtimeState;
        });

        it('should display seconds as a tie-breaker when cloud and local timestamps fall in the same minute', async () => {
            const now = Date.now();
            const cloudTime = now - (4 * 60 + 45) * 1000; // Il y a 4 min 45 s
            const localTime = now - (4 * 60 + 10) * 1000; // Il y a 4 min 10 s

            const promise = ModalUI.showRestoreConfirmationModal({
                remoteDate: cloudTime,
                localDate: localTime,
                remoteStudentCount: 28,
                localStudentCount: 28,
                syncState: 'local-changes',
                lastSyncTime: cloudTime
            });

            const modal = document.getElementById('restoreConfirmationModal');
            const cloudMainStat = modal.querySelector('.restore-comparison-card.cloud .restore-card-main-stat').textContent.trim();
            const localMainStat = modal.querySelector('.restore-comparison-card.local .restore-card-main-stat').textContent.trim();
            expect(cloudMainStat).toBe('Il y a 4 min 45 s');
            expect(localMainStat).toBe('Il y a 4 min 10 s');
            expect(cloudMainStat).not.toBe(localMainStat);

            document.getElementById('restoreConfirmCancelBtn').click();
            await promise;
        });

        it('should warn about missing local students instead of showing Session alignée when localStudentCount is 0 and remoteStudentCount > 0', async () => {
            const promise = ModalUI.showRestoreConfirmationModal({
                remoteDate: 1726000000000,
                remoteStudentCount: 307,
                remoteClassCount: 13,
                localStudentCount: 0,
                localClassCount: 13,
                syncState: 'in-sync'
            });

            const modal = document.getElementById('restoreConfirmationModal');
            expect(modal).not.toBeNull();
            expect(modal.textContent).not.toContain('Session alignée');
            expect(modal.textContent).not.toContain('Session à jour');
            expect(modal.textContent).toContain('Données manquantes');
            expect(modal.textContent).toContain('Aucun élève sur cet appareil');
            expect(modal.textContent).toContain('Restauration recommandée');
            expect(modal.textContent).toContain('307 élèves');

            const cancelBtn = document.getElementById('restoreConfirmCancelBtn');
            cancelBtn.click();
            await promise;
        });
    });

    describe('showSaveConfirmationModal', () => {
        it('should render comparison cards, local changes list, and resolve true on confirm', async () => {
            const promise = ModalUI.showSaveConfirmationModal({
                localStudentCount: 305,
                localClassCount: 13,
                remoteStudentCount: 300,
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
            expect(modal.textContent).toContain('Session locale');
            expect(modal.textContent).toContain('Modifications à enregistrer');
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
            expect(modal.textContent).toContain('Aucune sauvegarde');
            expect(modal.textContent).toContain('Première synchronisation');
            expect(modal.textContent).not.toContain('Date inconnue');
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
                localClassCount: null,
                remoteStudentCount: 10
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

        it('should focus Cancel and ignore the Enter shortcut when data shrinkage is detected', async () => {
            const promise = ModalUI.showSaveConfirmationModal({
                localStudentCount: 20,
                localClassCount: 1,
                remoteStudentCount: 305
            });

            const cancelBtn = document.getElementById('saveConfirmCancelBtn');
            expect(document.activeElement).toBe(cancelBtn);

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
            expect(document.getElementById('saveConfirmationModal')).not.toBeNull();

            cancelBtn.click();
            expect(await promise).toBe(false);
        });

        it('should display the aligned session notice when isInSync is true', async () => {
            const promise = ModalUI.showSaveConfirmationModal({
                localStudentCount: 25,
                localClassCount: 1,
                isInSync: true
            });

            const modal = document.getElementById('saveConfirmationModal');
            const notice = modal.querySelector('.restore-safety-notice.in-sync');
            expect(notice).not.toBeNull();
            expect(notice.textContent).toContain('Vos données locales sont déjà synchronisées');

            document.getElementById('saveConfirmCancelBtn').click();
            expect(await promise).toBe(false);
        });
    });

    describe('isAnyModalOpen & Focus Isolation', () => {
        it('should detect standard modals and standalone overlays (#trombiWizardModal, #importHubBackdrop, #pwaModalOverlay)', () => {
            expect(ModalUI.isAnyModalOpen()).toBe(false);

            const trombi = document.createElement('div');
            trombi.id = 'trombiWizardModal';
            document.body.appendChild(trombi);
            expect(ModalUI.isAnyModalOpen()).toBe(false);

            trombi.classList.add('visible');
            expect(ModalUI.isAnyModalOpen()).toBe(true);
            trombi.classList.remove('visible');
            expect(ModalUI.isAnyModalOpen()).toBe(false);

            const hub = document.createElement('div');
            hub.id = 'importHubBackdrop';
            hub.classList.add('active');
            document.body.appendChild(hub);
            expect(ModalUI.isAnyModalOpen()).toBe(true);
            hub.classList.remove('active');
            expect(ModalUI.isAnyModalOpen()).toBe(false);
        });

        it('should trap Tab / Shift+Tab focus and support Escape on standalone dialogs (#trombiWizardModal, #importHubBackdrop, #focusPanel)', () => {
            const hub = document.createElement('div');
            hub.id = 'importHubBackdrop';
            hub.className = 'active';
            hub.innerHTML = '<button id="hubBtn1">Option 1</button><button id="hubBtn2">Option 2</button>';
            document.body.appendChild(hub);

            ModalUI.activateFocusTrap(hub);
            const btn1 = document.getElementById('hubBtn1');
            const btn2 = document.getElementById('hubBtn2');

            btn2.focus();
            expect(document.activeElement).toBe(btn2);

            const tabForward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
            document.dispatchEvent(tabForward);
            expect(document.activeElement).toBe(btn1);

            const tabBackward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
            document.dispatchEvent(tabBackward);
            expect(document.activeElement).toBe(btn2);

            const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
            document.dispatchEvent(escEvent);
            expect(hub.classList.contains('active')).toBe(false);
        });

        it('should immediately move focus off background .main-content on openModal while preserving lastFocusedElement', () => {
            const mainContent = document.createElement('main');
            mainContent.className = 'main-content';
            mainContent.setAttribute('tabindex', '-1');
            document.body.appendChild(mainContent);
            mainContent.focus();
            expect(document.activeElement).toBe(mainContent);

            ModalUI.openModal(testModal);

            // Immediately (before 150ms timer), focus is moved off mainContent onto testModal
            expect(document.activeElement).toBe(testModal);
            expect(ModalUI.lastFocusedElement).toBe(mainContent);

            // At 150ms, focus moves to the first focusable element inside testModal (when visible)
            const focusableBtn = document.getElementById('focusable');
            Object.defineProperty(focusableBtn, 'offsetParent', { value: testModal, configurable: true });
            vi.advanceTimersByTime(150);
            expect(document.activeElement).toBe(focusableBtn);

            // Closing restores focus to mainContent
            ModalUI.closeModal(testModal);
            vi.advanceTimersByTime(250);
            expect(document.activeElement).toBe(mainContent);
        });

        it('should preserve underlying stackedModal when chaining two dynamic modals (customConfirmModal -> hardConfirmModal)', () => {
            ModalUI.openModal(testModal);

            const confirmModal = document.createElement('div');
            confirmModal.id = 'customConfirmModal';
            confirmModal.className = 'modal';
            document.body.appendChild(confirmModal);

            ModalUI.openModal(confirmModal);
            expect(ModalUI.stackedModal).toBe(testModal);

            // Close first dynamic modal and immediately open second dynamic modal before 250ms timeout
            ModalUI.closeModal(confirmModal);
            const hardModal = document.createElement('div');
            hardModal.id = 'hardConfirmModal';
            hardModal.className = 'modal';
            document.body.appendChild(hardModal);
            ModalUI.openModal(hardModal);

            expect(ModalUI.stackedModal).toBe(testModal);
            expect(ModalUI.activeModal).toBe(hardModal);

            vi.advanceTimersByTime(250);
            expect(ModalUI.activeModal).toBe(hardModal);
            expect(ModalUI.stackedModal).toBe(testModal);

            // Closing second dynamic modal restores testModal
            ModalUI.closeModal(hardModal);
            vi.advanceTimersByTime(250);
            expect(ModalUI.activeModal).toBe(testModal);
            expect(ModalUI.stackedModal).toBeNull();
        });
    });
});

