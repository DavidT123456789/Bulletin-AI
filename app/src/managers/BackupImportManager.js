/**
 * @fileoverview Backup Import Manager — Selective import modal
 * Shows a category checklist before importing backup data
 * @module managers/BackupImportManager
 */

import { StorageManager } from './StorageManager.js';
import { UI } from './UIManager.js';
import { ModalUI } from './ModalUIManager.js';

const CATEGORY_ICONS = {
    settings: 'solar:settings-bold-duotone',
    classes: 'solar:users-group-rounded-bold-duotone',
    students: 'solar:document-text-bold-duotone',
    journal: 'solar:notebook-bold-duotone',
    apiKeys: 'solar:key-minimalistic-square-bold-duotone'
};

export const BackupImportManager = {
    async showSelectionModal(fileContent) {
        let parsed;
        try {
            parsed = StorageManager.parseBackupFile(fileContent);
        } catch (e) {
            UI.showNotification(`Fichier invalide : ${e.message}`, 'error');
            return;
        }

        const { categories, meta } = parsed;
        const modalId = 'backupImportModal';
        let modal = document.getElementById(modalId);
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal';

        const exportDate = meta.exportedAt
            ? new Date(meta.exportedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : null;
        const version = meta.appVersion || '';

        const categoryItemsHTML = Object.entries(categories)
            .filter(([, info]) => info.available)
            .map(([key, info]) => {
                const isChild = !!info.parent;
                const icon = CATEGORY_ICONS[key] || 'solar:document-bold';
                const countLabel = this._formatCount(key, info.count);

                return `
                <label class="backup-category-item${isChild ? ' sub-item' : ''}" data-category="${key}"${isChild ? ` data-parent="${info.parent}"` : ''}>
                    <div class="backup-category-check">
                        <input type="checkbox" checked data-cat="${key}">
                        <span class="backup-checkmark">
                            <iconify-icon icon="ph:check-bold"></iconify-icon>
                        </span>
                    </div>
                    <div class="backup-category-icon">
                        <iconify-icon icon="${icon}"></iconify-icon>
                    </div>
                    <div class="backup-category-info">
                        <span class="backup-category-name">${info.label}</span>
                        <span class="backup-category-desc">${info.description}</span>
                    </div>
                    <span class="backup-category-count">${countLabel}</span>
                </label>`;
            }).join('');

        const metaLine = exportDate
            ? `<div class="backup-meta-line"><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> ${exportDate}${version ? ` · v${version}` : ''}</div>`
            : '';

        modal.innerHTML = `
        <div class="modal-content modal-content-backup-import">
            <div class="modal-header">
                <h3 class="modal-title">
                    <iconify-icon icon="solar:import-bold-duotone" class="modal-title-icon" style="color: var(--primary-color);"></iconify-icon>
                    Importer la sauvegarde
                </h3>
                <button class="close-button" aria-label="Fermer" id="backupImportCloseBtn">
                    <iconify-icon icon="ph:x"></iconify-icon>
                </button>
            </div>
            <div class="modal-body">
                ${metaLine}
                <div class="backup-category-list" id="backupCategoryList">
                    ${categoryItemsHTML}
                </div>
                <div class="backup-import-mode-row">
                    <label class="toggle-switch small" id="backupMergeToggle">
                        <input type="checkbox" checked>
                        <span class="slider"></span>
                    </label>
                    <span class="backup-mode-label" id="backupModeLabel">Fusionner avec les données existantes</span>
                </div>
                <div class="backup-import-warning" id="backupImportWarning">
                    <iconify-icon icon="solar:info-circle-bold" style="color: var(--primary-color);"></iconify-icon>
                    <span>Les nouvelles données seront ajoutées. Les entrées existantes plus récentes seront conservées.</span>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="backupImportCancelBtn">Annuler</button>
                <button class="btn btn-primary" id="backupImportConfirmBtn">
                    <iconify-icon icon="solar:import-bold"></iconify-icon>
                    Importer
                </button>
            </div>
        </div>`;

        document.body.appendChild(modal);

        this._bindModalEvents(modal, fileContent, categories);

        ModalUI.openModal(modal);
    },

    _bindModalEvents(modal, fileContent, categories) {
        const closeModal = () => {
            ModalUI.closeModal(modal);
            // Clean up dynamically created modal after animation
            setTimeout(() => {
                if (modal.parentNode) modal.remove();
            }, 300);
        };

        modal.querySelector('#backupImportCloseBtn')?.addEventListener('click', closeModal);
        modal.querySelector('#backupImportCancelBtn')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });

        // Merge/Overwrite toggle
        const mergeToggle = modal.querySelector('#backupMergeToggle input');
        const modeLabel = modal.querySelector('#backupModeLabel');
        const warningEl = modal.querySelector('#backupImportWarning');

        mergeToggle?.addEventListener('change', () => {
            const isMerge = mergeToggle.checked;
            modeLabel.textContent = isMerge
                ? 'Fusionner avec les données existantes'
                : 'Écraser les données existantes';
            warningEl.innerHTML = isMerge
                ? `<iconify-icon icon="solar:info-circle-bold" style="color: var(--primary-color);"></iconify-icon>
                   <span>Les nouvelles données seront ajoutées. Les entrées existantes plus récentes seront conservées.</span>`
                : `<iconify-icon icon="solar:danger-triangle-bold" style="color: var(--warning-color);"></iconify-icon>
                   <span>Les données existantes seront <strong>remplacées</strong> pour les catégories sélectionnées.</span>`;
            warningEl.classList.toggle('warning', !isMerge);
        });

        // Parent-child checkbox logic
        const list = modal.querySelector('#backupCategoryList');
        list?.addEventListener('change', (e) => {
            const checkbox = e.target;
            if (!checkbox.dataset.cat) return;

            const catKey = checkbox.dataset.cat;

            // If parent unchecked, disable children
            const children = list.querySelectorAll(`[data-parent="${catKey}"] input[type="checkbox"]`);
            children.forEach(child => {
                child.disabled = !checkbox.checked;
                if (!checkbox.checked) child.checked = false;
            });

            // Update child item visual state
            const childItems = list.querySelectorAll(`[data-parent="${catKey}"]`);
            childItems.forEach(item => {
                item.classList.toggle('disabled', !checkbox.checked);
            });

            this._updateConfirmButton(modal);
        });

        // Confirm button
        modal.querySelector('#backupImportConfirmBtn')?.addEventListener('click', async () => {
            const btn = modal.querySelector('#backupImportConfirmBtn');
            btn.disabled = true;
            btn.innerHTML = '<iconify-icon icon="solar:spinner-bold-duotone" class="icon-spin"></iconify-icon> Import en cours...';

            const selectedCategories = {};
            const checkboxes = modal.querySelectorAll('#backupCategoryList input[type="checkbox"]');
            checkboxes.forEach(cb => {
                selectedCategories[cb.dataset.cat] = cb.checked;
            });

            // Ensure unchecked unavailable categories stay false
            Object.keys(categories).forEach(key => {
                if (selectedCategories[key] === undefined) {
                    selectedCategories[key] = false;
                }
            });

            const isMerge = mergeToggle?.checked ?? true;

            try {
                const result = await StorageManager.importBackup(fileContent, {
                    mergeData: isMerge,
                    categories: selectedCategories,
                    silent: true
                });
                closeModal();
                this._showRichFeedback(result.stats, selectedCategories, isMerge, categories);
            } catch (error) {
                btn.disabled = false;
                btn.innerHTML = '<iconify-icon icon="solar:import-bold"></iconify-icon> Importer';
                UI.showNotification(`Erreur d'import : ${error.message}`, 'error');
            }
        });

        this._updateConfirmButton(modal);
    },

    _updateConfirmButton(modal) {
        const btn = modal.querySelector('#backupImportConfirmBtn');
        const checkboxes = modal.querySelectorAll('#backupCategoryList input[type="checkbox"]:checked:not(:disabled)');
        if (btn) {
            btn.disabled = checkboxes.length === 0;
        }
    },

    _formatCount(key, count) {
        if (count === 0) return '';
        const units = {
            settings: ['matière', 'matières'],
            classes: ['classe', 'classes'],
            students: ['élève', 'élèves'],
            journal: ['entrée', 'entrées'],
            apiKeys: ['clé', 'clés']
        };
        const [singular, plural] = units[key] || ['', ''];
        return `${count} ${count > 1 ? plural : singular}`;
    },

    _showRichFeedback(stats, selectedCategories, isMerge, categories) {
        const parts = [];

        if (stats.settingsImported) {
            const count = categories.settings?.count || 0;
            parts.push(count > 0 ? `${count} matière${count > 1 ? 's' : ''}` : 'Paramètres');
        }
        if (stats.classesAdded > 0) {
            parts.push(`${stats.classesAdded} classe${stats.classesAdded > 1 ? 's' : ''}`);
        }
        if (stats.imported > 0 || stats.updated > 0) {
            const studentParts = [];
            if (stats.imported > 0) studentParts.push(`${stats.imported} ajouté${stats.imported > 1 ? 's' : ''}`);
            if (stats.updated > 0) studentParts.push(`${stats.updated} mis à jour`);
            parts.push(`${stats.imported + stats.updated} élève${(stats.imported + stats.updated) > 1 ? 's' : ''} (${studentParts.join(', ')})`);
        }
        if (stats.journalEntries > 0) {
            parts.push(`${stats.journalEntries} entrée${stats.journalEntries > 1 ? 's' : ''} journal`);
        }
        if (stats.apiKeysImported > 0) {
            parts.push(`${stats.apiKeysImported} clé${stats.apiKeysImported > 1 ? 's' : ''} API`);
        }

        const mode = isMerge ? 'Fusion' : 'Remplacement';
        const summary = parts.length > 0
            ? `${mode} réussi${isMerge ? '' : 'e'} · ${parts.join(' · ')}`
            : `${mode} terminé${isMerge ? '' : 'e'} — aucune donnée modifiée`;

        UI.showNotification(summary, 'success');
    }
};
