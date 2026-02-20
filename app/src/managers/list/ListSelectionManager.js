/**
 * @fileoverview List Selection Manager
 * Handles bulk actions and multiple selection logic extracted from ListViewManager
 */

import { appState } from '../../state/State.js';
import { Utils } from '../../utils/Utils.js';
import { StudentPhotoManager } from '../StudentPhotoManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { ClassUIManager } from '../ClassUIManager.js';

export const ListSelectionManager = {
    selectedIds: new Set(),
    lastSelectedId: null,

    // Callbacks to avoid circular dependencies
    callbacks: {
        updateStudentRow: () => {},
        setRowStatus: () => {},
        renderList: () => {},
        clearSelections: () => {}
    },

    init(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    },

/**
     * Gère l'interaction de sélection avec support Shift/Ctrl
     * @param {string} studentId 
     * @param {Event} e 
     */
    handleSelectionInteraction(studentId, e) {
        if (!studentId) return;

        // Shift + Click : Range selection
        if (e.shiftKey && this.lastSelectedId) {
            this.selectRange(this.lastSelectedId, studentId);
            return;
        }

        // Standard toggle (Ctrl or simple click on avatar)
        this.toggleSelection(studentId);
    },

    /**
     * Sélectionne une plage d'élèves
     * @param {string} startId 
     * @param {string} endId 
     */
    selectRange(startId, endId) {
        // [OPTIMIZATION] Get rows directly from table body
        const tbody = document.querySelector('.student-list-table tbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('.student-row'));
        const startIndex = rows.findIndex(r => r.dataset.studentId === startId);
        const endIndex = rows.findIndex(r => r.dataset.studentId === endId);

        if (startIndex === -1 || endIndex === -1) return;

        const [low, high] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

        // Select all in range
        let changed = false;
        for (let i = low; i <= high; i++) {
            const id = rows[i].dataset.studentId;
            if (!this.selectedIds.has(id)) {
                this.selectedIds.add(id);
                this.updateSelectionUI(id, false); // Don't updating toolbar yet
                changed = true;
            }
        }

        if (changed) this.updateToolbarState();

        // Update last selected to the end of range
        this.lastSelectedId = endId;
    },

    /**
     * Bascule l'état de sélection d'un élève
     * @param {string} studentId 
     */
    toggleSelection(studentId) {
        if (!studentId) return;

        if (this.selectedIds.has(studentId)) {
            this.selectedIds.delete(studentId);
        } else {
            this.selectedIds.add(studentId);
        }
        this.lastSelectedId = studentId; // Update anchor for range selection

        this.updateSelectionUI(studentId);
    },

    /**
     * Tout sélectionner ou tout désélectionner (visibles)
     * @param {boolean} selectAll 
     */
    toggleSelectVisible(selectAll = true) {
        const rows = document.querySelectorAll('.student-row');
        rows.forEach(row => {
            const id = row.dataset.studentId;
            if (id) {
                if (selectAll) this.selectedIds.add(id);
                else this.selectedIds.delete(id);
                this.updateSelectionUI(id, false); // Update without calling toolbar update every time
            }
        });
        this.updateToolbarState();
    },

    /**
     * Réinitialise les sélections
     */
    clearSelections() {
        this.selectedIds.clear();
        this.updateSelectionUI(null);
    },

    /**
     * Met à jour l'UI suite à un changement de sélection
     * @param {string|null} studentId - ID de l'élève modifié ou null pour tout reset
     * @param {boolean} updateToolbar - Si on doit rafraîchir la barre d'outils
     * @private
     */
    updateSelectionUI(studentId, updateToolbar = true) {
        if (studentId) {
            const row = document.querySelector(`.student-row[data-student-id="${studentId}"]`);
            if (row) {
                const isSelected = this.selectedIds.has(studentId);
                row.classList.toggle('selected', isSelected);

                const wrapper = row.querySelector('.student-identity-wrapper');
                if (wrapper) wrapper.classList.toggle('selected', isSelected);

                const avatar = row.querySelector('.student-avatar');
                if (avatar) {
                    const student = appState.generatedResults.find(r => r.id === studentId);
                    if (student) {
                        avatar.outerHTML = StudentPhotoManager.getAvatarHTML(student, 'sm', isSelected);
                    }
                }
            }
        } else {
            // Reset all
            const selectedRows = document.querySelectorAll('.student-row.selected');
            selectedRows.forEach(row => {
                row.classList.remove('selected');
                // also wrapper
                const wrapper = row.querySelector('.student-identity-wrapper.selected');
                if (wrapper) wrapper.classList.remove('selected');

                // AND RESET AVATAR
                const studentId = row.dataset.studentId;
                const avatar = row.querySelector('.student-avatar');
                if (avatar && studentId) {
                    const student = appState.generatedResults.find(r => r.id === studentId);
                    if (student) {
                        // Pass false for isSelected since we are clearing
                        avatar.outerHTML = StudentPhotoManager.getAvatarHTML(student, 'sm', false);
                    }
                }
            });
            // Just in case some wrappers are selected but rows are not (cleanup)
            document.querySelectorAll('.student-identity-wrapper.selected').forEach(w => w.classList.remove('selected'));
        }

        if (updateToolbar) {
            this.updateToolbarState();
        }
    },

    /**
     * Gère l'affichage de la barre d'outils de sélection
     * @private
     */
    updateToolbarState() {
        const count = this.selectedIds.size;
        let toolbar = document.getElementById('selectionToolbar');

        if (count > 0) {
            if (!toolbar) {
                toolbar = this.createSelectionToolbar();
                document.body.appendChild(toolbar);

                // Initialize tooltips for the new toolbar
                // Import dynamically to avoid circular dependencies or load order issues
                import('../TooltipsManager.js').then(({ TooltipsUI }) => {
                    TooltipsUI.initTooltips();
                });

                // Trigger animation
                requestAnimationFrame(() => toolbar.classList.add('active'));
            }

            const countLabel = toolbar.querySelector('#selectionCount');
            if (countLabel) countLabel.textContent = `${count} ${count > 1 ? 'élèves sélectionnés' : 'élève sélectionné'}`;

            const selectAllLink = toolbar.querySelector('#btnSelectAllLink');
            if (selectAllLink) {
                const totalVisible = document.querySelectorAll('.student-row').length;
                selectAllLink.style.display = count >= totalVisible ? 'none' : '';
            }
        } else if (toolbar) {
            toolbar.classList.remove('active');
            setTimeout(() => {
                if (toolbar) toolbar.remove();
            }, 500);
        }
    },

    /**
     * Crée la barre d'outils de sélection contextualisée
     * @returns {HTMLElement}
     * @private
     */
    createSelectionToolbar() {
        const div = document.createElement('div');
        div.id = 'selectionToolbar';
        div.className = 'selection-toolbar';

        div.innerHTML = `
            <div class="selection-toolbar-content">
                <div class="selection-info">
                    <button class="btn-deselect tooltip" id="btnDeselectAll" data-tooltip="Annuler la sélection">
                        <iconify-icon icon="ph:x"></iconify-icon>
                    </button>
                    <span id="selectionCount">0 élève sélectionné</span>
                    <button class="btn-select-all-link" id="btnSelectAllLink">Tout sélectionner</button>
                </div>
                <div class="selection-actions">
                    <button class="btn-selection-action tooltip" data-bulk-action="regenerate" data-tooltip="Relancer la génération pour la sélection">
                        <iconify-icon icon="solar:refresh-linear"></iconify-icon> <span>Régénérer</span>
                    </button>
                    <button class="btn-selection-action tooltip" data-bulk-action="copy" data-tooltip="Copier les appréciations (Presse-papier)">
                        <iconify-icon icon="solar:copy-linear"></iconify-icon> <span>Copier</span>
                    </button>
                    
                    <button class="btn-selection-action tooltip" data-bulk-action="move" data-tooltip="Transférer vers une autre classe">
                        <iconify-icon icon="solar:transfer-horizontal-linear"></iconify-icon> <span>Déplacer</span>
                    </button>
                    <button class="btn-selection-action tooltip" data-bulk-action="reset" data-tooltip="Choisir les données à réinitialiser">
                        <iconify-icon icon="solar:restart-linear"></iconify-icon> <span>Réinitialiser</span>
                    </button>
                    <div class="selection-action-separator"></div>
                    <button class="btn-selection-action danger tooltip" data-bulk-action="delete" data-tooltip="Supprimer définitivement les élèves">
                        <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon> <span>Supprimer</span>
                    </button>
                </div>
            </div>
        `;

        // Listeners for toolbar actions
        div.querySelector('#btnDeselectAll').onclick = (e) => {
            e.stopPropagation();
            this.toggleSelectVisible(false);
        };

        div.querySelector('#btnSelectAllLink').onclick = (e) => {
            e.stopPropagation();
            this.toggleSelectVisible(true);
        };

        div.querySelectorAll('[data-bulk-action]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.handleBulkAction(btn.dataset.bulkAction);
            };
        });

        return div;
    },

    /**
     * Dispatcher pour les actions de masse
     * @param {string} action 
     * @private
     */
    async handleBulkAction(action) {
        const ids = Array.from(this.selectedIds);
        if (ids.length === 0) return;

        switch (action) {
            case 'delete':
                await this.bulkDelete(ids);
                break;
            case 'regenerate':
                await this.bulkRegenerate(ids);
                break;
            case 'copy':
                await this.bulkCopy(ids);
                break;
            case 'move':
                await this.bulkMove(ids);
                break;
            case 'reset':
                await this.bulkReset(ids);
                break;
        }
    },

    async bulkDelete(ids) {
        const results = appState.generatedResults || [];
        const students = ids.map(id => results.find(r => r.id === id)).filter(Boolean);
        const currentPeriod = appState.currentPeriod;

        // Build smart summary
        const namesPreview = students.slice(0, 5).map(s => `<strong>${s.prenom} ${s.nom}</strong>`);
        const remaining = students.length - namesPreview.length;
        const namesList = namesPreview.join(', ') + (remaining > 0 ? ` et <strong>${remaining} autre${remaining > 1 ? 's' : ''}</strong>` : '');

        // Count data that will be lost
        const withAppreciation = students.filter(s => {
            const app = s.studentData?.periods?.[currentPeriod]?.appreciation || s.appreciation;
            return app && app.replace(/<[^>]*>/g, '').trim().length > 0;
        }).length;
        const withJournal = students.filter(s => s.journal?.length > 0).length;
        const withPhoto = students.filter(s => s.studentPhoto?.data).length;

        const dataLines = [
            withAppreciation > 0 ? `<li>${withAppreciation} appréciation${withAppreciation > 1 ? 's' : ''} générée${withAppreciation > 1 ? 's' : ''}</li>` : '',
            withJournal > 0 ? `<li>${withJournal} journal${withJournal > 1 ? 'x' : ''} de bord</li>` : '',
            withPhoto > 0 ? `<li>${withPhoto} photo${withPhoto > 1 ? 's' : ''}</li>` : ''
        ].filter(Boolean).join('');

        const dataSection = dataLines
            ? `<p class="modal-confirm-detail-label">Données perdues :</p><ul class="modal-confirm-detail-list">${dataLines}</ul>`
            : '';

        const { ModalUI: ModalUIManager } = await import('../ModalUIManager.js');
        const confirmed = await ModalUIManager.showCustomConfirm(
            `<div>
                <p>Supprimer définitivement ${namesList} ?</p>
                ${dataSection}
            </div>`,
            null,
            null,
            {
                title: `Supprimer ${ids.length} élève${ids.length > 1 ? 's' : ''} ?`,
                confirmText: 'Supprimer',
                isDanger: true
            }
        );

        if (confirmed) {
            const { StudentDataManager } = await import('../StudentDataManager.js');
            for (const id of ids) {
                await StudentDataManager.deleteStudent(id);
            }

            const { StorageManager } = await import('../StorageManager.js');
            await StorageManager.saveAppState();

            this.clearSelections();
            this.callbacks.renderList();

            const { UI } = await import('../UIManager.js');
            UI?.showNotification(`${ids.length} élève${ids.length > 1 ? 's' : ''} supprimé${ids.length > 1 ? 's' : ''}.`, 'success');
        }
    },

    async bulkMove(ids) {
        ClassUIManager.showMoveStudentsModal(ids, () => {
            this.clearSelections();
        });
    },

    async bulkRegenerate(ids) {
        const { MassImportManager } = await import('../MassImportManager.js');
        const { AppreciationsManager } = await import('../AppreciationsManager.js');
        const { UI } = await import('../UIManager.js');
        const { StudentDataManager } = await import('../StudentDataManager.js');

        // 1. Initialize AbortController for global cancellation (Cancel button in header)
        if (MassImportManager.massImportAbortController) {
            MassImportManager.massImportAbortController.abort();
        }
        MassImportManager.massImportAbortController = new AbortController();
        const signal = MassImportManager.massImportAbortController.signal;

        let successCount = 0;
        let errorCount = 0;
        let wasAborted = false;
        const total = ids.length;

        // 2. Set visual state "Pending Skeleton" for all selected rows
        ids.forEach(id => this.callbacks.setRowStatus(id, 'pending-skeleton'));

        // 3. Sequential processing loop
        for (let i = 0; i < total; i++) {
            if (signal.aborted) {
                wasAborted = true;
                break;
            }

            const id = ids[i];
            const resultIndex = appState.generatedResults.findIndex(r => r.id === id);
            if (resultIndex === -1) continue;

            const originalResult = appState.generatedResults[resultIndex];
            const studentName = `${originalResult.prenom} ${originalResult.nom}`;

            UI.showHeaderProgress(i + 1, total, studentName);

            // Set current row status to "Generating"
            this.callbacks.setRowStatus(id, 'generating');

            try {
                // Reset history for regeneration (fresh start)
                originalResult.historyState = null;
                originalResult.copied = false;

                // Prepare Data
                const updatedStudentData = { ...originalResult.studentData };
                updatedStudentData.id = id;
                updatedStudentData.subject = appState.useSubjectPersonalization ? appState.currentSubject : 'Générique';
                updatedStudentData.currentAIModel = appState.currentAIModel;

                // Call AI Service directly (passing signal for cancellation)
                const newResult = await AppreciationsManager.generateAppreciation(updatedStudentData, false, null, signal, 'single-student');

                // Update State (promptHash auto-computed by updateResult)
                const updatedResult = StudentDataManager.updateResult(
                    appState.generatedResults[resultIndex],
                    newResult
                );

                // Update Filtered Results Sync
                const filteredIndex = appState.filteredResults.findIndex(r => r.id === id);
                if (filteredIndex > -1) {
                    appState.filteredResults[filteredIndex] = updatedResult;
                }

                // Update UI Row
                this.callbacks.updateStudentRow(id);
                successCount++;

            } catch (e) {
                if (e.name === 'AbortError' || signal.aborted) {
                    wasAborted = true;
                    break;
                }

                errorCount++;
                const msg = Utils.translateErrorMessage(e.message);

                // Create Error Result
                const errorResult = AppreciationsManager.createResultObject(
                    originalResult.nom,
                    originalResult.prenom,
                    originalResult.appreciation || '', // Keep existing if any
                    originalResult.evolutions,
                    originalResult.studentData,
                    originalResult.studentData.prompts || {},
                    originalResult.tokenUsage || {},
                    `Erreur IA : ${msg}.`
                );

                const updatedErrorResult = StudentDataManager.updateResult(appState.generatedResults[resultIndex], errorResult);

                // Update Filtered Results Sync (Error case)
                const filteredIndex = appState.filteredResults.findIndex(r => r.id === id);
                if (filteredIndex > -1) {
                    appState.filteredResults[filteredIndex] = updatedErrorResult;
                }

                this.callbacks.updateStudentRow(id);
            }
        }

        // 4. Cleanup & Feedback
        MassImportManager.massImportAbortController = null;
        UI.hideHeaderProgress(errorCount > 0, errorCount);
        this.clearSelections();

        if (wasAborted) {
            UI.showNotification("Régénération annulée.", "warning");
            // Restore visual state for all rows (clears "En file" / "Generated")
            ids.forEach(id => this.callbacks.updateStudentRow(id));
        } else {
            const resultMsg = errorCount > 0
                ? `Terminé avec ${errorCount} erreur(s).`
                : `Régénération terminée (${successCount}/${total}).`;
            UI.showNotification(resultMsg, errorCount > 0 ? "warning" : "success");
        }

        import('../StorageManager.js').then(({ StorageManager }) => StorageManager.saveAppState());
    },

    async bulkCopy(ids) {
        const { ExportManager } = await import('../ExportManager.js');
        const count = await ExportManager.copyBulkAppreciations(ids);
        if (count > 0) {
            this.clearSelections();
            const { UI } = await import('../UIManager.js');
            UI?.showNotification(`${count} appréciation${count > 1 ? 's' : ''} copiée${count > 1 ? 's' : ''}.`, 'success');
        }
    },

    /**
     * Copie l'appréciation d'un seul élève dans le presse-papier
     * @param {string} studentId
     * @private
     */
    async copySingleAppreciation(studentId) {
        const { ExportManager } = await import('../ExportManager.js');
        const count = await ExportManager.copyBulkAppreciations([studentId]);
        const { UI } = await import('../UIManager.js');
        if (count > 0) {
            UI?.showNotification('Appréciation copiée.', 'success');
        } else {
            UI?.showNotification('Aucune appréciation à copier.', 'info');
        }
    },

    /**
     * Réinitialisation sélective via modale à choix multiples
     * Fusionne les anciennes actions Effacer + Vider contexte
     * @param {Array<string>} ids - IDs des élèves
     * @private
     */
    async bulkReset(ids) {
        const { ModalUI: ModalUIManager } = await import('../ModalUIManager.js');
        const results = appState.generatedResults || [];
        const currentPeriod = appState.currentPeriod;
        const isSingle = ids.length === 1;

        // Count existing data for dynamic sublabels
        const students = ids.map(id => results.find(r => r.id === id)).filter(Boolean);
        const withAppreciation = students.filter(s => {
            const app = s.studentData?.periods?.[currentPeriod]?.appreciation || s.appreciation;
            return app && app.replace(/<[^>]*>/g, '').trim().length > 0;
        }).length;
        const withJournal = students.filter(s => s.journal?.length > 0).length;
        const withContext = students.filter(s => s.studentData?.periods?.[currentPeriod]?.context).length;
        const withPhoto = students.filter(s => s.studentPhoto?.data).length;

        const choices = [
            {
                id: 'appreciation',
                label: 'Appréciations',
                sublabel: withAppreciation > 0
                    ? `Efface le texte généré (${withAppreciation} élève${withAppreciation > 1 ? 's' : ''}). Notes et données conservées.`
                    : 'Aucune appréciation à effacer.',
                checked: withAppreciation > 0,
                disabled: withAppreciation === 0
            },
            {
                id: 'journal',
                label: 'Journal de bord',
                sublabel: withJournal > 0
                    ? `Efface les observations et gommettes (${withJournal} élève${withJournal > 1 ? 's' : ''}).`
                    : 'Aucun journal à effacer.',
                checked: false,
                disabled: withJournal === 0
            },
            {
                id: 'context',
                label: 'Notes de contexte',
                sublabel: withContext > 0
                    ? `Efface le texte du champ « Contexte » (${withContext} élève${withContext > 1 ? 's' : ''}).`
                    : 'Aucune note de contexte.',
                checked: false,
                disabled: withContext === 0
            },
            {
                id: 'photo',
                label: 'Photos',
                sublabel: withPhoto > 0
                    ? `Supprime la photo de profil (${withPhoto} élève${withPhoto > 1 ? 's' : ''}).`
                    : 'Aucune photo à supprimer.',
                checked: false,
                disabled: withPhoto === 0
            }
        ];

        const studentLabel = isSingle
            ? `<strong>${students[0]?.prenom} ${students[0]?.nom}</strong>`
            : `<strong>${ids.length} élèves</strong>`;

        const { confirmed, values } = await ModalUIManager.showChoicesModal(
            'Réinitialiser',
            `Choisissez les données à effacer pour ${studentLabel} :`,
            choices,
            {
                confirmText: 'Réinitialiser',
                cancelText: 'Annuler',
                isDanger: true,
                iconClass: 'solar:restart-circle-bold'
            }
        );

        if (!confirmed) return;

        const clearAppreciation = values.appreciation;
        const clearJournal = values.journal;
        const clearContext = values.context;
        const clearPhoto = values.photo;

        if (!clearAppreciation && !clearJournal && !clearContext && !clearPhoto) return;

        // Snapshot data before mutation (for undo)
        const snapshots = new Map();
        ids.forEach(id => {
            const student = results.find(r => r.id === id);
            if (!student) return;
            snapshots.set(id, {
                appreciation: student.appreciation,
                periodAppreciation: student.studentData?.periods?.[currentPeriod]?.appreciation,
                periodLastModified: student.studentData?.periods?.[currentPeriod]?._lastModified,
                lastModified: student._lastModified,
                copied: student.copied,
                journal: student.journal ? [...student.journal] : [],
                context: student.studentData?.periods?.[currentPeriod]?.context,
                studentPhoto: student.studentPhoto ? { ...student.studentPhoto } : null
            });
        });

        // Execute mutation
        const now = Date.now();
        const counts = { appreciation: 0, journal: 0, context: 0, photo: 0 };

        ids.forEach(id => {
            const student = results.find(r => r.id === id);
            if (!student) return;

            if (clearAppreciation) {
                const app = student.studentData?.periods?.[currentPeriod]?.appreciation || student.appreciation;
                if (app && app.replace(/<[^>]*>/g, '').trim().length > 0) {
                    student.appreciation = '';
                    if (student.studentData?.periods?.[currentPeriod]) {
                        student.studentData.periods[currentPeriod].appreciation = '';
                        student.studentData.periods[currentPeriod]._lastModified = now;
                    }
                    student._lastModified = now;
                    student.copied = false;
                    counts.appreciation++;
                }
            }

            if (clearJournal && student.journal?.length > 0) {
                student.journal = [];
                counts.journal++;
            }

            if (clearContext && student.studentData?.periods?.[currentPeriod]?.context) {
                student.studentData.periods[currentPeriod].context = '';
                counts.context++;
            }

            if (clearPhoto && student.studentPhoto?.data) {
                student.studentPhoto = null;
                student._lastModified = now;
                counts.photo++;
            }

            this.callbacks.updateStudentRow(id);
        });

        const totalCleared = Object.values(counts).reduce((sum, c) => sum + c, 0);

        if (totalCleared > 0) {
            const { StorageManager } = await import('../StorageManager.js');
            const { UI } = await import('../UIManager.js');
            await StorageManager.saveAppState();
            UI?.updateStats?.();
            const parts = [];
            if (counts.appreciation > 0) parts.push(`${counts.appreciation} appréciation${counts.appreciation > 1 ? 's' : ''}`);
            if (counts.journal > 0) parts.push(`${counts.journal} journal${counts.journal > 1 ? 'x' : ''}`);
            if (counts.context > 0) parts.push(`${counts.context} contexte${counts.context > 1 ? 's' : ''}`);
            if (counts.photo > 0) parts.push(`${counts.photo} photo${counts.photo > 1 ? 's' : ''}`);

            // Show undo toast instead of simple notification
            UI?.showUndoNotification(
                `Réinitialisé : ${parts.join(', ')}.`,
                async () => {
                    // Restore snapshot
                    for (const [id, snap] of snapshots) {
                        const student = results.find(r => r.id === id);
                        if (!student) continue;

                        if (clearAppreciation) {
                            student.appreciation = snap.appreciation;
                            if (student.studentData?.periods?.[currentPeriod]) {
                                student.studentData.periods[currentPeriod].appreciation = snap.periodAppreciation;
                                student.studentData.periods[currentPeriod]._lastModified = snap.periodLastModified;
                            }
                            student._lastModified = snap.lastModified;
                            student.copied = snap.copied;
                        }

                        if (clearJournal) {
                            student.journal = snap.journal;
                        }

                        if (clearContext && student.studentData?.periods?.[currentPeriod]) {
                            student.studentData.periods[currentPeriod].context = snap.context;
                        }

                        if (clearPhoto) {
                            student.studentPhoto = snap.studentPhoto;
                            student._lastModified = snap.lastModified;
                        }

                        this.callbacks.updateStudentRow(id);
                    }

                    await StorageManager.saveAppState();
                    UI?.updateStats?.();
                    UI?.showNotification('Réinitialisation annulée.', 'success');
                },
                { type: 'warning' }
            );
        }

        if (ids.length > 1) this.clearSelections();
    },
};
