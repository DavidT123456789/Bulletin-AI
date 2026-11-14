/**
 * @fileoverview Sous-module de la modale « Mes classes » (ClassUIManager)
 * Gère la vue d'ensemble des classes : création en ligne, renommage in-situ,
 * duplication, suppression inline sécurisée, réorganisation par glisser-déposer,
 * tri pédagogique (6ᵉ ↔ 3ᵉ), nettoyage des classes vides et réinitialisation.
 *
 * @module managers/class/ClassManageModal
 */

import { appState, userSettings } from '../../state/State.js';
import { ClassManager } from '../ClassManager.js';
import { AppreciationsManager } from '../AppreciationsManager.js';
import { sortClassesByLevel } from '../../utils/LevelDetector.js';
import { ClassDashboardManager } from '../ClassDashboardManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { StudentDataManager } from '../StudentDataManager.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { Utils } from '../../utils/Utils.js';

export const ClassManageModal = {
    /**
     * Affiche la modale de gestion des classes (Vue d'ensemble)
     */
    showManageClassesModal() {
        const existingModal = document.getElementById('classManagementModal');
        if (existingModal) {
            existingModal.remove();
        }

        const classes = ClassManager.getAllClasses();
        const initialStudentCount = Utils.countUniqueStudents(appState.generatedResults, classes);

        const modalEl = document.createElement('div');
        modalEl.className = 'modal modal-small';
        modalEl.id = 'classManagementModal';
        modalEl.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-title-group">
                        <span class="modal-title-icon"><iconify-icon icon="solar:layers-linear"></iconify-icon></span>
                        <div class="modal-title-text-col">
                            <h2 class="modal-title-main">Mes classes</h2>
                            <span class="modal-subtitle">${classes.length} classe${classes.length > 1 ? 's' : ''} • ${initialStudentCount} élève${initialStudentCount > 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div class="modal-header-actions">
                        <button type="button" class="btn btn-small add-class-modal-btn" id="addClassFromModalBtn" data-tooltip="Créer une nouvelle classe">
                            <iconify-icon icon="ph:plus-bold" aria-hidden="true"></iconify-icon> <span>Nouvelle classe</span>
                        </button>
                        <div class="modal-header-actions-divider" aria-hidden="true"></div>
                        <div class="action-dropdown" id="classManageMoreWrapper">
                            <button type="button" class="btn-icon-small tooltip" id="classManageMoreBtn" data-tooltip="Options" aria-label="Options des classes">
                                <iconify-icon icon="solar:menu-dots-bold"></iconify-icon>
                            </button>
                            <div class="action-dropdown-menu" id="classManageMoreMenu"></div>
                        </div>
                        <button class="close-button close-manage-modal" aria-label="Fermer"><iconify-icon icon="ph:x"></iconify-icon></button>
                    </div>
                </div>
                <div class="modal-body">
                    <!-- Rempli par refreshList -->
                </div>
            </div>
        `;

        // Bind events
        const ghostImg = document.createElement('div');
        ghostImg.style.cssText = 'width:1px;height:1px;position:fixed;top:-100px;opacity:0;';
        document.body.appendChild(ghostImg);

        const cleanupGhost = () => ghostImg.remove();
        modalEl.addEventListener('close', cleanupGhost, { once: true });

        document.body.appendChild(modalEl);
        this._ui?.openModal(modalEl, {
            onClose: cleanupGhost,
            onClosed: () => modalEl.remove()
        });

        const closeModal = () => {
            this._ui?.closeModal(modalEl);
        };

        const moreWrapper = modalEl.querySelector('#classManageMoreWrapper');
        const moreBtn = modalEl.querySelector('#classManageMoreBtn');
        const moreMenu = modalEl.querySelector('#classManageMoreMenu');
        const subtitle = modalEl.querySelector('.modal-subtitle');
        const modalBody = modalEl.querySelector('.modal-body');
        const updateModalScroll = () => FocusPanelManager.bindScrollAffordances(modalBody);

        modalEl.querySelector('.close-manage-modal')?.addEventListener('click', closeModal);
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) {
                closeModal();
            } else if (!e.target.closest('#classManageMoreWrapper')) {
                moreMenu?.classList.remove('open');
            }
        });

        // More options dropdown toggle
        moreBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            moreMenu?.classList.toggle('open');
        });

        const setInlineConfirmDisabled = (btn, isDisabled) => {
            if (!btn) return;
            btn.classList.toggle('disabled', isDisabled);
            btn.setAttribute('aria-disabled', String(isDisabled));
        };

        // Add new class button in modal - inline row inside grouped list
        const addClassBtn = modalEl.querySelector('#addClassFromModalBtn');
        addClassBtn?.addEventListener('click', () => {
            modalEl.querySelectorAll('.class-management-item.editing').forEach(editingRow => {
                editingRow.querySelector('.cancel-rename-btn, .cancel-delete-btn')?.click();
            });

            // Check if row already exists
            const existingRow = modalEl.querySelector('.creating-class-row');
            if (existingRow) {
                existingRow.querySelector('input')?.focus();
                return;
            }

            const contentEl = modalEl.querySelector('.class-management-content');
            let listEl = modalEl.querySelector('.class-management-list');
            const emptyEl = modalEl.querySelector('.class-management-empty');

            const rowHtml = `
                <div class="class-management-item creating-class-row">
                    <div class="class-drag-handle creating-icon" title="Nouvelle classe">
                        <iconify-icon icon="ph:plus"></iconify-icon>
                    </div>
                    <div class="class-management-info">
                        <input type="text" class="inline-field-input new-class-input"
                               id="newSchoolClassInput"
                               name="school_class_title"
                               placeholder="Classe (ex. 6ème A, 3ème B)..."
                               maxlength="50"
                               autocomplete="off"
                               autocorrect="off"
                               autocapitalize="off"
                               spellcheck="false"
                               data-lpignore="true"
                               data-1p-ignore="true"
                               data-form-type="other">
                    </div>
                    <div class="class-management-actions">
                        <button type="button" class="inline-action-btn confirm create-class-confirm disabled" data-tooltip="Confirmer (Entrée)" aria-label="Confirmer (Entrée)" aria-disabled="true">
                            <iconify-icon icon="ph:check-bold"></iconify-icon>
                        </button>
                        <button type="button" class="inline-action-btn cancel create-class-cancel" data-tooltip="Annuler (Échap)" aria-label="Annuler (Échap)">
                            <iconify-icon icon="ph:x"></iconify-icon>
                        </button>
                    </div>
                </div>
            `;

            if (emptyEl) {
                emptyEl.style.display = 'none';
            }

            if (!listEl && contentEl) {
                listEl = document.createElement('div');
                listEl.className = 'class-management-list';
                contentEl.appendChild(listEl);
            }

            if (listEl) {
                listEl.insertAdjacentHTML('afterbegin', rowHtml);
            }
            updateModalScroll();

            const row = modalEl.querySelector('.creating-class-row');
            if (!row) return;
            const input = row.querySelector('.new-class-input');
            const confirmBtn = row.querySelector('.create-class-confirm');
            const cancelBtn = row.querySelector('.create-class-cancel');
            let isSubmitting = false;

            TooltipsUI?.initTooltips?.(row);
            input.focus();

            const removeRow = () => {
                TooltipsUI?.cleanupTooltipsIn?.(row);
                row.style.animation = 'slideUpCollapseRow 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards';
                setTimeout(() => {
                    row.remove();
                    if (emptyEl && !modalEl.querySelector('.class-management-item')) {
                        emptyEl.style.display = '';
                    }
                    updateModalScroll();
                }, 200);
            };

            input.oninput = () => {
                if (isSubmitting) return;
                setInlineConfirmDisabled(confirmBtn, input.value.trim().length === 0);
            };

            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!confirmBtn.classList.contains('disabled')) {
                        confirmBtn.click();
                    }
                } else if (e.key === 'Escape' && !isSubmitting) {
                    removeRow();
                }
            };

            cancelBtn.onclick = (e) => {
                e.stopPropagation();
                if (!isSubmitting) removeRow();
            };

            confirmBtn.onclick = async (e) => {
                e.stopPropagation();
                if (isSubmitting || confirmBtn.classList.contains('disabled')) return;
                const className = input.value.trim();
                if (!className) return;

                isSubmitting = true;
                setInlineConfirmDisabled(confirmBtn, true);
                input.disabled = true;
                confirmBtn.innerHTML = '<iconify-icon icon="svg-spinners:ring-resize"></iconify-icon>';

                try {
                    const newClass = await this._createAndSwitchClass(className);
                    if (newClass) {
                        setInlineConfirmDisabled(confirmBtn, false);
                        confirmBtn.innerHTML = '<iconify-icon icon="ph:check-bold"></iconify-icon>';
                        TooltipsUI?.cleanupTooltipsIn?.(row);
                        row.style.animation = 'slideUpCollapseRow 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards';
                        setTimeout(() => {
                            row.remove();
                            refreshList(newClass.id);
                        }, 200);
                        return;
                    }
                } catch {
                    // Handled by _createAndSwitchClass
                }
                isSubmitting = false;
                input.disabled = false;
                setInlineConfirmDisabled(confirmBtn, input.value.trim().length === 0);
                confirmBtn.innerHTML = '<iconify-icon icon="ph:check-bold"></iconify-icon>';
            };
        });

        // Event delegation and direct bindings inside the list
        const bindListEvents = () => {
            const list = modalEl.querySelector('.class-management-list');
            if (!list) return;

            const closeActiveEditingRows = (excludeRow = null) => {
                list.querySelectorAll('.class-management-item.editing').forEach(editingRow => {
                    if (editingRow !== excludeRow) {
                        editingRow.querySelector('.cancel-rename-btn, .cancel-delete-btn')?.click();
                    }
                });
            };

            // Bind Row Click & Keyboard Activation (Switch Class without closing modal)
            list.addEventListener('click', async (e) => {
                const item = e.target.closest('.class-management-item');
                if (!item || item.classList.contains('editing') || item.classList.contains('creating-class-row')) return;

                if (e.target.closest('.class-management-actions') || e.target.closest('.class-drag-handle')) {
                    return;
                }

                const classId = item.dataset.classId;
                if (classId && classId !== appState.currentClassId) {
                    modalEl.querySelectorAll('.class-management-item').forEach(i => {
                        i.classList.remove('active-switch');
                        i.setAttribute('aria-selected', 'false');
                    });
                    item.classList.add('active-switch');
                    item.setAttribute('aria-selected', 'true');
                    await this.handleClassSwitch(classId);
                }
            });

            list.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                const item = e.target.closest('.class-management-item');
                if (!item || e.target !== item || item.classList.contains('editing')) return;
                e.preventDefault();
                item.click();
            });

            // ========== Drag & Drop Reorder (Rail-Style) ==========
            list.addEventListener('dragstart', (e) => {
                const item = e.target.closest('.class-management-item');
                if (!item || item.classList.contains('editing') || item.classList.contains('creating-class-row')) return;
                draggedItem = item;
                TooltipsUI?.hideAll?.();

                e.dataTransfer.setDragImage(ghostImg, 0, 0);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.dataset.classId);

                requestAnimationFrame(() => {
                    item.classList.add('dragging');
                });
            });

            list.addEventListener('dragend', () => {
                if (draggedItem) {
                    draggedItem.classList.remove('dragging');
                }
                draggedItem = null;

                const newOrder = [...list.querySelectorAll('.class-management-item[data-class-id]')]
                    .map(i => i.dataset.classId)
                    .filter(Boolean);
                ClassManager.reorderClasses(newOrder);
                this.renderClassList();
                renderMoreMenu(ClassManager.getAllClasses());
            });

            list.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (!draggedItem) return;

                const target = e.target.closest('.class-management-item[data-class-id]');
                if (!target || target === draggedItem || target.classList.contains('editing')) return;

                const targetRect = target.getBoundingClientRect();
                const mouseY = e.clientY;
                const targetMiddle = targetRect.top + targetRect.height / 2;

                const shouldInsertBefore = mouseY < targetMiddle;
                const isAlreadyBefore = target.previousElementSibling === draggedItem;
                const isAlreadyAfter = target.nextElementSibling === draggedItem;

                if ((shouldInsertBefore && isAlreadyBefore) || (!shouldInsertBefore && isAlreadyAfter)) {
                    return;
                }

                const items = [...list.querySelectorAll('.class-management-item[data-class-id]:not(.dragging)')];
                const firstRects = new Map();
                items.forEach(item => {
                    firstRects.set(item, item.getBoundingClientRect());
                });

                if (shouldInsertBefore) {
                    target.before(draggedItem);
                } else {
                    target.after(draggedItem);
                }

                items.forEach(item => {
                    const firstRect = firstRects.get(item);
                    const lastRect = item.getBoundingClientRect();
                    const deltaY = firstRect.top - lastRect.top;

                    if (Math.abs(deltaY) > 1) {
                        item.style.transition = 'none';
                        item.style.transform = `translateY(${deltaY}px)`;
                        item.offsetHeight; // Force reflow
                        item.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)';
                        item.style.transform = '';
                        setTimeout(() => {
                            item.style.transition = '';
                            item.style.transform = '';
                        }, 250);
                    }
                });
            });

            // Rename buttons - inline editing
            const bindRenameHandler = (btn) => {
                btn.addEventListener('click', () => {
                    const classId = btn.dataset.classId;
                    const cls = ClassManager.getClassById(classId);
                    if (!cls) return;

                    const row = btn.closest('.class-management-item');
                    if (!row) return;

                    closeActiveEditingRows(row);

                    const originalContent = row.innerHTML;
                    const headerEl = row.querySelector('.class-info-header');
                    const nameEl = headerEl?.querySelector('.class-management-name');
                    const actionsEl = row.querySelector('.class-management-actions');

                    if (!headerEl || !nameEl || !actionsEl) return;

                    row.classList.add('editing', 'renaming');
                    row.removeAttribute('draggable');
                    row.removeAttribute('tabindex');
                    row.blur?.();

                    // Remplacement in-situ du libellé par l'input
                    nameEl.outerHTML = `
                        <input type="text" class="inline-field-input in-situ-rename-input"
                               name="rename_school_class_title"
                               value="${this._escapeHtml(cls.name)}"
                               placeholder="Nom de la classe..."
                               maxlength="50"
                               autocomplete="off"
                               autocorrect="off"
                               autocapitalize="off"
                               spellcheck="false"
                               data-lpignore="true"
                               data-1p-ignore="true"
                               data-form-type="other">
                    `;

                    // Remplacement des actions par Confirmer / Annuler
                    actionsEl.innerHTML = `
                        <button type="button" class="inline-action-btn confirm save-rename-btn disabled" data-tooltip="Confirmer (Entrée)" aria-label="Confirmer (Entrée)" aria-disabled="true">
                            <iconify-icon icon="ph:check-bold"></iconify-icon>
                        </button>
                        <button type="button" class="inline-action-btn cancel cancel-rename-btn" data-tooltip="Annuler (Échap)" aria-label="Annuler (Échap)">
                            <iconify-icon icon="ph:x"></iconify-icon>
                        </button>
                    `;

                    TooltipsUI?.initTooltips?.(row);

                    const input = row.querySelector('.in-situ-rename-input');
                    const saveBtn = row.querySelector('.save-rename-btn');
                    const cancelBtn = row.querySelector('.cancel-rename-btn');

                    input.focus();
                    input.select();

                    input.oninput = () => {
                        const val = input.value.trim();
                        setInlineConfirmDisabled(saveBtn, val.length === 0 || val === cls.name);
                    };

                    const restore = () => restoreRow(row, originalContent);

                    const save = () => {
                        const newName = input.value.trim();
                        if (newName && newName !== cls.name) {
                            TooltipsUI?.cleanupTooltipsIn?.(row);
                            ClassManager.updateClass(classId, { name: newName });
                            this._ui?.showNotification(`Classe renommée en "${newName}"`, 'success');
                            this.updateHeaderDisplay();
                            this.renderClassList();
                            refreshList();
                        } else {
                            restore();
                        }
                    };

                    input.onkeydown = (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (!saveBtn.classList.contains('disabled')) save();
                        } else if (e.key === 'Escape') {
                            restore();
                        }
                    };

                    saveBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (saveBtn.classList.contains('disabled')) return;
                        save();
                    };
                    cancelBtn.onclick = (e) => {
                        e.stopPropagation();
                        restore();
                    };
                });
            };

            // Delete buttons - inline confirmation
            const bindDeleteHandler = (btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const classId = btn.dataset.classId;
                    const row = btn.closest('.class-management-item');
                    if (!row) return;

                    closeActiveEditingRows(row);
                    TooltipsUI?.cleanupTooltipsIn?.(row);

                    const originalContent = row.innerHTML;
                    const cls = ClassManager.getClassById(classId);
                    const displayName = this._escapeHtml(Utils.formatClassDisplayName(cls?.name || ''));
                    const deleteSubtext = this._escapeHtml(StudentDataManager.getClassDeleteSubtext(classId));
                    let isDeleting = false;

                    row.innerHTML = `
                        <div class="delete-confirm-icon" aria-hidden="true">
                            <iconify-icon icon="solar:danger-triangle-bold"></iconify-icon>
                        </div>
                        <div class="class-management-info delete-confirm-info">
                            <span class="delete-confirm-title">Supprimer « <strong>${displayName}</strong> » ?</span>
                            <span class="delete-confirm-subtext">${deleteSubtext}</span>
                        </div>
                        <div class="delete-confirm-actions">
                            <button type="button" class="inline-delete-btn cancel cancel-delete-btn">
                                Annuler
                            </button>
                            <button type="button" class="inline-delete-btn confirm confirm-delete-btn">
                                Supprimer
                            </button>
                        </div>
                    `;

                    row.classList.add('editing', 'deleting');
                    row.removeAttribute('draggable');
                    row.removeAttribute('tabindex');
                    updateModalScroll();

                    const cancelBtn = row.querySelector('.cancel-delete-btn');
                    const confirmBtn = row.querySelector('.confirm-delete-btn');

                    row.onkeydown = (ev) => {
                        if (ev.key === 'Escape' && !isDeleting) {
                            ev.preventDefault();
                            ev.stopPropagation();
                            restoreRow(row, originalContent);
                        }
                    };

                    cancelBtn?.focus({ preventScroll: true });

                    cancelBtn.onclick = (ev) => {
                        ev.stopPropagation();
                        if (isDeleting) return;
                        restoreRow(row, originalContent);
                    };

                    confirmBtn.onclick = async (ev) => {
                        ev.stopPropagation();
                        if (isDeleting) return;
                        isDeleting = true;
                        cancelBtn.disabled = true;
                        confirmBtn.disabled = true;
                        row.onkeydown = null;
                        row.style.animation = 'slideOutRow 0.3s ease-out forwards';

                        setTimeout(async () => {
                            await this.handleDeleteClass(classId);
                            this.updateHeaderDisplay();
                            this.renderClassList();

                            const remainingClasses = ClassManager.getAllClasses();
                            if (remainingClasses.length === 0) {
                                this._ui?.closeModal(modalEl);
                                cleanupGhost();
                                setTimeout(() => {
                                    modalEl.remove();
                                    this.openDropdown();
                                    setTimeout(() => this.showNewClassPrompt(), 100);
                                }, 300);
                            } else {
                                refreshList();
                            }
                        }, 280);
                    };
                });
            };

            // Duplicate buttons handler
            const bindDuplicateHandler = (btn) => {
                btn.addEventListener('click', async () => {
                    const classId = btn.dataset.classId;
                    if (!classId) return;

                    const originalIcon = btn.innerHTML;
                    btn.innerHTML = '<iconify-icon icon="svg-spinners:ring-resize"></iconify-icon>';
                    btn.disabled = true;

                    try {
                        const duplicatedClass = await ClassManager.duplicateClass(classId);

                        this.updateHeaderDisplay();
                        this.renderClassList();
                        this.updateStudentCount();
                        refreshList(duplicatedClass?.id);
                    } catch {
                        this._ui?.showNotification('Erreur lors de la duplication', 'error');
                        btn.innerHTML = originalIcon;
                        btn.disabled = false;
                    }
                });
            };

            const bindRowActionButtons = (row) => {
                const renameBtn = row.querySelector('.manage-rename-btn');
                const duplicateBtn = row.querySelector('.manage-duplicate-btn');
                const deleteBtn = row.querySelector('.manage-delete-btn');
                const noteMeta = row.querySelector('.class-management-note-meta');
                if (renameBtn) bindRenameHandler(renameBtn);
                if (duplicateBtn) bindDuplicateHandler(duplicateBtn);
                if (deleteBtn) bindDeleteHandler(deleteBtn);
                if (noteMeta) {
                    noteMeta.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (row.classList.contains('editing')) return;
                        const classId = row.dataset.classId;
                        this._ui?.closeModal(modalEl);
                        cleanupGhost();
                        setTimeout(() => modalEl.remove(), 300);
                        if (classId && classId !== appState.currentClassId) {
                            await this.handleClassSwitch(classId);
                        }
                        this.openNotePopover(classId);
                    });
                }
            };

            const restoreRow = (row, originalContent) => {
                TooltipsUI?.cleanupTooltipsIn?.(row);
                row.onkeydown = null;
                row.innerHTML = originalContent;
                row.classList.remove('editing', 'renaming', 'deleting');
                row.setAttribute('draggable', 'true');
                row.setAttribute('tabindex', '0');
                bindRowActionButtons(row);
                TooltipsUI?.initTooltips?.(row);
                updateModalScroll();
            };

            list.querySelectorAll('.class-management-item[data-class-id]').forEach(row => bindRowActionButtons(row));
        };

        let draggedItem = null;

        // Options supplémentaires dans le header (menu ⋯)
        const renderMoreMenu = (currentClasses) => {
            if (!moreMenu) return;

            const allResults = appState.generatedResults || [];
            const emptyClasses = currentClasses.filter(c => !allResults.some(r => r.classId === c.id));

            if (moreWrapper) {
                moreWrapper.style.display = currentClasses.length > 0 ? '' : 'none';
            }

            let menuHtml = '';
            let nextSortDirection = 'asc';
            let sortRangeLabel = '6ᵉ → 3ᵉ';

            if (currentClasses.length > 1) {
                const ascSorted = sortClassesByLevel(currentClasses, 'asc');
                const isCurrentlyAsc = currentClasses.every((cls, idx) => cls.id === ascSorted[idx]?.id);
                nextSortDirection = isCurrentlyAsc ? 'desc' : 'asc';
                sortRangeLabel = isCurrentlyAsc ? '3ᵉ → 6ᵉ' : '6ᵉ → 3ᵉ';

                menuHtml += `
                    <button type="button" class="action-dropdown-item" id="sortClassesPedagogicalBtn" data-sort-direction="${nextSortDirection}">
                        <iconify-icon icon="solar:sort-by-alphabet-linear"></iconify-icon>
                        <span>Trier par niveau (${sortRangeLabel})</span>
                    </button>
                `;
            }

            if (emptyClasses.length > 0) {
                menuHtml += `
                    <button type="button" class="action-dropdown-item" id="cleanEmptyClassesBtn">
                        <iconify-icon icon="solar:broom-linear"></iconify-icon>
                        <span>Nettoyer les classes vides (${emptyClasses.length})</span>
                    </button>
                `;
            }

            if (currentClasses.length > 0) {
                if (menuHtml) {
                    menuHtml += '<div class="dropdown-divider"></div>';
                }
                menuHtml += `
                    <button type="button" class="action-dropdown-item danger" id="resetAllClassesBtn">
                        <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                        <span>Supprimer toutes les classes...</span>
                    </button>
                `;
            }

            moreMenu.innerHTML = menuHtml;

            moreMenu.querySelector('#sortClassesPedagogicalBtn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                moreMenu.classList.remove('open');
                ClassManager.sortByPedagogicalOrder(nextSortDirection);
                this.renderClassList();
                this.updateHeaderDisplay();
                refreshList();
                this._ui?.showNotification?.(`Classes réordonnées par niveau (${sortRangeLabel})`, 'success');
            });

            moreMenu.querySelector('#cleanEmptyClassesBtn')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                moreMenu.classList.remove('open');

                const isSingleEmpty = emptyClasses.length === 1;
                const cleanMessage = isSingleEmpty
                    ? `Supprimer définitivement la classe vide <strong>${this._escapeHtml(emptyClasses[0].name)}</strong> ? Aucun élève ni appréciation ne sera perdu.`
                    : `Supprimer définitivement les <strong>${emptyClasses.length} classes</strong> sans élèves ? Aucun élève ni appréciation ne sera perdu.`;

                const confirmed = await this._ui?.showCustomConfirm?.(
                    cleanMessage,
                    null,
                    null,
                    {
                        title: isSingleEmpty ? 'Supprimer cette classe vide ?' : 'Nettoyer les classes vides ?',
                        confirmText: isSingleEmpty ? 'Supprimer' : 'Nettoyer',
                        cancelText: 'Annuler',
                        isDanger: true,
                        detailsHtml: isSingleEmpty ? '' : `
                            <p class="confirm-details-lead">Classes concernées :</p>
                            <ul class="confirm-details-list">
                                ${emptyClasses.map(c => `<li><strong>${this._escapeHtml(c.name)}</strong></li>`).join('')}
                            </ul>
                        `
                    }
                );

                if (confirmed) {
                    const count = await ClassManager.deleteEmptyClasses();
                    this.renderClassList();
                    this.updateHeaderDisplay();
                    refreshList();
                    this._ui?.showNotification?.(`${count} classe${count > 1 ? 's' : ''} vide${count > 1 ? 's' : ''} supprimée${count > 1 ? 's' : ''}`, 'success');
                }
            });

            moreMenu.querySelector('#resetAllClassesBtn')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                moreMenu.classList.remove('open');

                const totalStudents = Utils.countUniqueStudents(appState.generatedResults, currentClasses);
                const classLabel = `${currentClasses.length} classe${currentClasses.length > 1 ? 's' : ''}`;
                const studentPart = totalStudents > 0
                    ? ` ainsi que les <strong>${totalStudents} élève${totalStudents > 1 ? 's' : ''}</strong> associés`
                    : '';
                const confirmed = await this._ui?.showCustomConfirm?.(
                    `Cette action est irréversible et supprimera vos <strong>${classLabel}</strong>${studentPart}. Vos clés API, prompts et réglages resteront intacts.`,
                    null,
                    null,
                    {
                        title: 'Supprimer toutes les classes ?',
                        confirmText: 'Tout supprimer',
                        cancelText: 'Annuler',
                        isDanger: true
                    }
                );

                if (confirmed) {
                    await ClassManager.resetAllClasses();
                    this.renderClassList();
                    this.updateHeaderDisplay();
                    AppreciationsManager.renderResults();
                    this._ui?.updateStats?.();
                    refreshList();
                    this._ui?.showNotification?.('Toutes les classes ont été réinitialisées', 'info');
                }
            });
        };

        // Render function to dynamically update the list
        const refreshList = (highlightClassId = null) => {
            let currentClasses = [...ClassManager.getAllClasses()];
            if (!userSettings.academic?.classesCustomOrder) {
                const sortDirection = userSettings.academic?.classesSortDirection || 'asc';
                currentClasses = sortClassesByLevel(currentClasses, sortDirection);
            }

            const defaultYear = ClassManager._getCurrentSchoolYear?.() || '2026-2027';
            const primaryYear = currentClasses[0]?.year || defaultYear;
            const allSameYear = currentClasses.length > 0 && currentClasses.every(c => (c.year || primaryYear) === primaryYear);

            if (subtitle) {
                const studentCount = Utils.countUniqueStudents(appState.generatedResults, currentClasses);
                const baseSubtitle = `${currentClasses.length} classe${currentClasses.length > 1 ? 's' : ''} • ${studentCount} élève${studentCount > 1 ? 's' : ''}`;
                subtitle.textContent = allSameYear ? `${baseSubtitle} • ${primaryYear}` : baseSubtitle;
            }

            renderMoreMenu(currentClasses);

            if (!modalBody) return;

            if (currentClasses.length === 0) {
                modalBody.innerHTML = `
                    <div class="class-management-content">
                        <div class="class-management-empty">
                            <iconify-icon icon="solar:layers-minimalistic-linear"></iconify-icon>
                            <p class="empty-title">Aucune classe créée</p>
                            <p class="empty-subtitle">Commencez par ajouter votre première classe.</p>
                        </div>
                    </div>
                `;
                updateModalScroll();
                return;
            }

            const listHtml = `
                <div class="class-management-list" role="listbox" aria-label="Liste des classes">
                    ${currentClasses.map(cls => {
                        const stats = this._getClassStats(cls.id);
                        const pedagoStats = ClassDashboardManager.getStatsForClass(cls.id);
                        const hasGrades = pedagoStats && pedagoStats.count > 0;
                        const isActive = cls.id === appState.currentClassId;

                        let averageBadge = '';
                        if (hasGrades) {
                            const avg = pedagoStats.average.toFixed(1).replace('.', ',');
                            const colorClass = Utils.getGradeClass(pedagoStats.average);

                            let trendIcon = '';
                            if (pedagoStats.avgEvolution !== null) {
                                const trend = pedagoStats.avgEvolution;
                                const trendClass = trend > 0.5 ? 'positive' : trend < -0.5 ? 'negative' : 'neutral';
                                const trendArrow = trend > 0.5 ? '↗' : trend < -0.5 ? '↘' : '→';
                                trendIcon = `<span class="trend-indicator ${trendClass}" data-tooltip="Évolution trimestrielle">${trendArrow}</span>`;
                            }

                            averageBadge = `
                                <div class="class-stat-badge ${colorClass}" data-tooltip="Moyenne générale de la classe">
                                    <span class="stat-value">${avg}</span>
                                    <span class="stat-suffix">/20</span>
                                    ${trendIcon}
                                </div>
                            `;
                        }

                        const yearMetaHtml = !allSameYear ? `
                            <span class="meta-item-inline" data-tooltip="Année scolaire">
                                <iconify-icon icon="solar:calendar-linear"></iconify-icon>
                                <span>${cls.year || primaryYear}</span>
                            </span>
                            <span class="meta-separator">•</span>
                        ` : '';

                        const trimmedNote = typeof cls.classNote === 'string' ? cls.classNote.trim() : '';
                        const noteMetaHtml = trimmedNote ? `
                            <span class="meta-separator">•</span>
                            <span class="meta-item-inline class-management-note-meta tooltip" data-tooltip="${this._formatNoteTooltip(trimmedNote)}">
                                <iconify-icon icon="solar:bookmark-bold"></iconify-icon>
                                <span class="class-management-note-text">${this._escapeHtml(trimmedNote)}</span>
                            </span>
                        ` : '';

                        const metaContentHtml = stats.total === 0
                            ? `
                                ${yearMetaHtml}
                                <span class="meta-item-inline meta-empty-state">
                                    <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                                    <span>Aucun élève</span>
                                </span>
                                ${noteMetaHtml}
                            `
                            : `
                                ${yearMetaHtml}
                                <span class="meta-item-inline" data-tooltip="Nombre d'élèves">
                                    <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                                    <span>${stats.total} élève${stats.total > 1 ? 's' : ''}</span>
                                </span>
                                <span class="meta-separator">•</span>
                                <span class="meta-item-inline ${stats.statusClass}" data-tooltip="Appréciations complétées (Trimestre actif)">
                                    <iconify-icon icon="${stats.icon}"></iconify-icon>
                                    <span>${stats.completed}/${stats.total} appréciation${stats.total > 1 ? 's' : ''}</span>
                                </span>
                                ${noteMetaHtml}
                            `;

                        const isNew = highlightClassId && cls.id === highlightClassId;

                        return `
                            <div class="class-management-item ${isActive ? 'active-switch' : ''} ${isNew ? 'class-item-just-created' : ''}"
                                 data-class-id="${cls.id}"
                                 draggable="true"
                                 tabindex="0"
                                 role="option"
                                 aria-selected="${isActive ? 'true' : 'false'}">
                                <div class="class-drag-handle" data-tooltip="Réorganiser">
                                    <iconify-icon icon="ph:dots-six-vertical-bold"></iconify-icon>
                                </div>

                                <div class="class-management-info">
                                    <div class="class-info-header">
                                        <span class="class-management-name">${this._escapeHtml(Utils.formatClassDisplayName(cls.name))}</span>
                                        ${averageBadge}
                                    </div>

                                    <div class="class-management-meta">
                                        ${metaContentHtml}
                                    </div>
                                </div>

                                <div class="class-management-actions">
                                    <button class="manage-duplicate-btn btn-icon-small tooltip" data-class-id="${cls.id}"
                                            data-tooltip="Dupliquer la classe" aria-label="Dupliquer la classe">
                                        <iconify-icon icon="solar:copy-linear"></iconify-icon>
                                    </button>
                                    <button class="manage-rename-btn btn-icon-small tooltip" data-class-id="${cls.id}"
                                            data-tooltip="Renommer" aria-label="Renommer">
                                        <iconify-icon icon="solar:pen-new-square-linear"></iconify-icon>
                                    </button>
                                    <button class="manage-delete-btn btn-icon-small danger tooltip" data-class-id="${cls.id}"
                                            data-tooltip="Supprimer la classe" aria-label="Supprimer la classe">
                                        <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            modalBody.innerHTML = `
                <div class="class-management-content">
                    ${listHtml}
                </div>
            `;

            bindListEvents();

            // Initialiser les tooltips pour les nouveaux éléments
            this._ui?.initTooltips?.();

            if (highlightClassId) {
                const newItem = modalEl.querySelector(`.class-management-item[data-class-id="${highlightClassId}"]`);
                if (newItem) {
                    newItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    setTimeout(() => {
                        newItem.classList.remove('class-item-just-created');
                    }, 800);
                }
            }
            updateModalScroll();
        };

        // Initial render & scroll to active class
        refreshList();
        modalEl.querySelector('.class-management-item.active-switch')?.scrollIntoView?.({ block: 'nearest' });
        updateModalScroll();
    }
};
