import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BackupImportManager } from './BackupImportManager.js';
import { StorageManager } from './StorageManager.js';
import { RestoreTransitionManager } from './RestoreTransitionManager.js';
import { ModalUI } from './ModalUIManager.js';
import { UI } from './UIManager.js';

describe('BackupImportManager', () => {
    const validBackupJson = JSON.stringify({
        _meta: {
            exportType: 'full_backup',
            appVersion: '0.1.1',
            exportedAt: '2026-11-06T14:32:00.000Z'
        },
        settings: {
            subjects: { math: { name: 'Mathématiques' }, fr: { name: 'Français' } }
        },
        classes: [{ id: 'c1', name: '3eA', studentIds: ['s1'] }],
        generatedResults: [
            {
                id: 's1',
                name: 'Alice Martin',
                classId: 'c1',
                journal: [{ id: 'j1', text: 'Participation active', _lastModified: 1700000000000 }]
            }
        ]
    });

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
        ModalUI.activeModal = null;
        ModalUI.stackedModal = null;
        vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        vi.spyOn(StorageManager, 'savePreRestoreSnapshot').mockResolvedValue();
        vi.spyOn(StorageManager, 'importBackup').mockResolvedValue({
            stats: { settingsImported: true, classesAdded: 1, imported: 1, updated: 0, journalEntries: 1, apiKeysImported: 0 }
        });
        vi.spyOn(RestoreTransitionManager, 'rehydrateAndTransition').mockResolvedValue();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('should reject invalid backup JSON with an error notification without mounting modal', async () => {
        await BackupImportManager.showSelectionModal('{"foo":"bar"}');

        expect(UI.showNotification).toHaveBeenCalledWith(
            expect.stringContaining('Fichier invalide'),
            'error'
        );
        expect(document.getElementById('backupImportModal')).toBeNull();
    });

    it('should enforce parent-child dependency (students -> journal) and disable confirm when all unchecked', async () => {
        await BackupImportManager.showSelectionModal(validBackupJson);

        const modal = document.getElementById('backupImportModal');
        expect(modal).not.toBeNull();

        const studentsCb = modal.querySelector('input[data-cat="students"]');
        const journalItem = modal.querySelector('.backup-category-item[data-category="journal"]');
        const journalCb = modal.querySelector('input[data-cat="journal"]');
        const confirmBtn = modal.querySelector('#backupImportConfirmBtn');

        expect(journalItem.dataset.parent).toBe('students');
        expect(journalCb.checked).toBe(true);
        expect(confirmBtn.disabled).toBe(false);

        // Unchecking parent disables and unchecks child
        studentsCb.checked = false;
        studentsCb.dispatchEvent(new Event('change', { bubbles: true }));
        expect(journalCb.disabled).toBe(true);
        expect(journalCb.checked).toBe(false);
        expect(journalItem.classList.contains('disabled')).toBe(true);

        // Unchecking remaining categories disables confirm button
        modal.querySelectorAll('#backupCategoryList input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(confirmBtn.disabled).toBe(true);
    });

    it('should toggle overwrite warning, snapshot before import, and pass false for unavailable categories', async () => {
        await BackupImportManager.showSelectionModal(validBackupJson);

        const modal = document.getElementById('backupImportModal');
        const mergeCb = modal.querySelector('#backupMergeCheckbox');
        const warningEl = modal.querySelector('#backupImportWarning');
        const modeLabel = modal.querySelector('#backupModeLabel');

        expect(modeLabel.getAttribute('for')).toBe('backupMergeCheckbox');
        expect(warningEl.classList.contains('warning')).toBe(false);

        // Switch to overwrite mode
        mergeCb.checked = false;
        mergeCb.dispatchEvent(new Event('change'));
        expect(warningEl.classList.contains('warning')).toBe(true);
        expect(modeLabel.textContent).toBe('Écraser les données existantes');

        modal.querySelector('#backupImportConfirmBtn').click();
        await vi.runAllTimersAsync();

        expect(StorageManager.savePreRestoreSnapshot).toHaveBeenCalledTimes(1);
        expect(StorageManager.importBackup).toHaveBeenCalledWith(validBackupJson, {
            mergeData: false,
            categories: {
                settings: true,
                classes: true,
                students: true,
                journal: true,
                apiKeys: false
            },
            silent: true,
            skipSnapshot: true
        });
        expect(RestoreTransitionManager.rehydrateAndTransition).toHaveBeenCalledTimes(1);
    });

    it('should recover button state and keep modal open when StorageManager.importBackup fails', async () => {
        StorageManager.importBackup.mockRejectedValueOnce(new Error('Quota dépassé'));

        await BackupImportManager.showSelectionModal(validBackupJson);
        const modal = document.getElementById('backupImportModal');
        const confirmBtn = modal.querySelector('#backupImportConfirmBtn');

        confirmBtn.click();
        await vi.advanceTimersByTimeAsync(0);

        expect(confirmBtn.disabled).toBe(false);
        expect(confirmBtn.textContent).toBe('Importer');
        expect(document.getElementById('backupImportModal')).not.toBeNull();
        expect(UI.showNotification).toHaveBeenCalledWith(
            expect.stringContaining('Quota dépassé'),
            'error'
        );
    });

    it('should stop Escape propagation and restore stacked settings modal when closing backupImportModal', async () => {
        const settingsModal = document.createElement('div');
        settingsModal.id = 'appSettingsModal';
        settingsModal.className = 'modal';
        document.body.appendChild(settingsModal);
        ModalUI.openModal(settingsModal);

        const docEscapeSpy = vi.fn();
        document.addEventListener('keydown', docEscapeSpy);

        await BackupImportManager.showSelectionModal(validBackupJson);
        const importModal = document.getElementById('backupImportModal');
        expect(ModalUI.activeModal).toBe(importModal);
        expect(ModalUI.stackedModal).toBe(settingsModal);

        importModal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(docEscapeSpy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(250);
        expect(document.getElementById('backupImportModal')).toBeNull();
        expect(ModalUI.activeModal).toBe(settingsModal);

        document.removeEventListener('keydown', docEscapeSpy);
    });

    it('should include addedEnrollments in rich feedback toast when existing students are enrolled into another class/group', () => {
        BackupImportManager._showRichFeedback(
            { settingsImported: false, classesAdded: 0, imported: 0, updated: 0, addedEnrollments: 3, journalEntries: 0, apiKeysImported: 0 },
            { students: true },
            true,
            {}
        );

        expect(UI.showNotification).toHaveBeenCalledWith(
            '+3 affectations',
            'success',
            5000,
            { title: 'Fusion réussie' }
        );
    });
});
