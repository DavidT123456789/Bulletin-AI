/**
 * @fileoverview UI Manager pour le sélecteur de classes
 * Gère l'affichage du dropdown, le rendu de la liste des classes, et les interactions utilisateur.
 * 
 * @module managers/ClassUIManager
 */

import { DOM } from '../utils/DOM.js';
import { appState, userSettings } from '../state/State.js';
import { ClassManager } from './ClassManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';

let UI;
let StorageManager;

export const ClassUIManager = {
    _isDropdownOpen: false,
    _originalDropdownParent: null, // Store original parent for teleportation

    /**
     * Initialise le ClassUIManager avec les dépendances
     */
    init(ui, storage) {
        UI = ui;
        StorageManager = storage;
        this._bindEvents();
    },

    /**
     * Attache les event listeners pour le sélecteur de classe
     */
    _bindEvents() {
        // Toggle dropdown on chip click
        DOM.headerClassChip?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });

        // Add new class button
        DOM.addNewClassBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showNewClassPrompt();
        });

        // Manage classes button
        DOM.manageClassesBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeDropdown();
            this.showManageClassesModal();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this._isDropdownOpen && !e.target.closest('.class-selector-wrapper')) {
                this.closeDropdown();
            }
        });

        // Close dropdown on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._isDropdownOpen) {
                this.closeDropdown();
            }
        });
    },

    /**
     * Toggle le dropdown de sélection de classe
     */
    toggleDropdown() {
        if (this._isDropdownOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    },

    /**
     * Ouvre le dropdown
     */
    openDropdown() {
        if (!DOM.classDropdown) return;

        this._isDropdownOpen = true;
        DOM.headerClassChip?.classList.add('active');
        DOM.classDropdown.style.display = 'block';

        // On narrow screens, teleport to body to escape header clipping (backdrop-filter creates containing block)
        if (window.innerWidth < 768) {
            this._originalDropdownParent = DOM.classDropdown.parentElement;
            const chipRect = DOM.headerClassChip?.getBoundingClientRect();
            document.body.appendChild(DOM.classDropdown);
            DOM.classDropdown.style.position = 'fixed';
            DOM.classDropdown.style.top = `${(chipRect?.bottom || 56) + 8}px`;
            DOM.classDropdown.style.left = '12px';
            DOM.classDropdown.style.right = '12px';
            DOM.classDropdown.style.minWidth = 'unset';
            DOM.classDropdown.style.maxWidth = 'none';
            DOM.classDropdown.style.width = 'auto';
            DOM.classDropdown.style.zIndex = '9999';
        }

        // Trigger animation
        requestAnimationFrame(() => {
            DOM.classDropdown.classList.add('visible');
        });

        // Render class list
        this.renderClassList();
    },

    /**
     * Ferme le dropdown
     */
    closeDropdown() {
        if (!DOM.classDropdown) return;

        this._isDropdownOpen = false;
        DOM.headerClassChip?.classList.remove('active');
        DOM.classDropdown.classList.remove('visible');

        // Hide after animation
        setTimeout(() => {
            if (!this._isDropdownOpen) {
                DOM.classDropdown.style.display = 'none';

                // Return to original parent if teleported
                if (this._originalDropdownParent && DOM.classDropdown.parentElement === document.body) {
                    this._originalDropdownParent.appendChild(DOM.classDropdown);
                    // Reset inline styles
                    DOM.classDropdown.style.position = '';
                    DOM.classDropdown.style.top = '';
                    DOM.classDropdown.style.left = '';
                    DOM.classDropdown.style.right = '';
                    DOM.classDropdown.style.minWidth = '';
                    DOM.classDropdown.style.maxWidth = '';
                    DOM.classDropdown.style.width = '';
                    DOM.classDropdown.style.zIndex = '';
                    this._originalDropdownParent = null;
                }
            }
        }, 200);
    },

    /**
     * Affiche un input inline dans le dropdown pour créer une nouvelle classe
     */
    showNewClassPrompt() {
        // Ne pas refermer le dropdown!
        if (!DOM.classDropdownList) return;

        // Vérifier si l'input existe déjà
        const existingInput = DOM.classDropdownList.querySelector('.inline-create-form');
        if (existingInput) {
            existingInput.querySelector('input')?.focus();
            return;
        }

        // Créer le formulaire inline
        const formHtml = `
            <form class="inline-create-form" action="javascript:void(0)" autocomplete="off" style="
                padding: 12px;
                background: var(--surface-color);
                border-bottom: 1px solid var(--border-color);
                animation: slideDownExpand 0.25s ease-out;
            ">
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="text" class="inline-class-input" 
                           placeholder="Nom de la classe..." 
                           autocomplete="off"
                           maxlength="50"
                           name="newClassName_ignore">
                    <button type="button" class="btn btn-primary btn-small inline-create-btn" style="padding: 10px 14px;" disabled>
                        <i class="fas fa-check"></i>
                    </button>
                    <button type="button" class="btn btn-secondary btn-small inline-cancel-btn" style="padding: 10px 14px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </form>
        `;

        // Insérer au début de la liste
        DOM.classDropdownList.insertAdjacentHTML('afterbegin', formHtml);

        const form = DOM.classDropdownList.querySelector('.inline-create-form');
        const input = form.querySelector('.inline-class-input');
        const createBtn = form.querySelector('.inline-create-btn');
        const cancelBtn = form.querySelector('.inline-cancel-btn');

        // Focus
        setTimeout(() => input?.focus(), 50);

        // Handlers
        const removeForm = () => {
            form.style.animation = 'slideUpCollapse 0.2s ease-out forwards';
            setTimeout(() => form.remove(), 180);
        };

        input.oninput = () => {
            createBtn.disabled = input.value.trim().length === 0;
        };

        input.onkeydown = (e) => {
            if (e.key === 'Enter' && input.value.trim()) {
                e.preventDefault();
                createBtn.click();
            } else if (e.key === 'Escape') {
                removeForm();
            }
        };

        cancelBtn.onclick = removeForm;

        createBtn.onclick = async () => {
            const className = input.value.trim();
            if (className) {
                createBtn.disabled = true;
                input.disabled = true;
                await this._createAndSwitchClass(className);
                removeForm();
                // Note: renderClassList() is already called in _createAndSwitchClass()
            }
        };
    },

    /**
     * Crée une classe et bascule vers elle
     * @private
     */
    async _createAndSwitchClass(className) {
        try {
            const newClass = ClassManager.createClass(className);
            await ClassManager.switchClass(newClass.id);
            this.updateHeaderDisplay();
            this.renderClassList();
            // CORRECTIF: Rafraîchir la liste des élèves et les stats pour la nouvelle classe
            AppreciationsManager.renderResults();
            UI?.updateStats?.();
        } catch (error) {
            UI?.showNotification(`Erreur : ${error.message}`, 'error');
        }
    },

    /**
     * Rend la liste des classes dans le dropdown
     */
    renderClassList() {
        if (!DOM.classDropdownList) return;

        const classes = ClassManager.getAllClasses();
        const currentClassId = appState.currentClassId;

        if (classes.length === 0) {
            DOM.classDropdownList.innerHTML = `
                <div class="class-dropdown-empty">
                    <i class="fas fa-graduation-cap"></i>
                    <p>Aucune classe créée</p>
                    <button type="button" class="btn btn-primary btn-small" id="createFirstClassBtn">
                        <i class="fas fa-plus"></i> Créer ma première classe
                    </button>
                </div>
            `;
            // Bind create first class button
            document.getElementById('createFirstClassBtn')?.addEventListener('click', () => {
                this.showNewClassPrompt();
            });
            return;
        }

        DOM.classDropdownList.innerHTML = classes.map(cls => `
            <div class="class-dropdown-item ${cls.id === currentClassId ? 'active' : ''}" 
                 data-class-id="${cls.id}">
                <div class="class-info">
                    <span class="class-name">${this._escapeHtml(cls.name)}</span>
                    <span class="class-meta">
                        <i class="fas fa-calendar"></i> ${cls.year || 'Non définie'}
                    </span>
                </div>
                <div class="class-progress-badge" data-class-id="${cls.id}">
                    <span class="progress-loader"></span>
                </div>
            </div>
        `).join('');

        // Bind click events on class items
        DOM.classDropdownList.querySelectorAll('.class-dropdown-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const classId = e.currentTarget.dataset.classId;
                await this.handleClassSwitch(classId);
            });
        });

        // Update progress indicators asynchronously
        this._updateClassProgressIndicators(classes);
    },

    /**
     * Gère la suppression d'une classe
     */
    async handleDeleteClass(classId) {
        const classToDelete = ClassManager.getClassById(classId);
        if (!classToDelete) return;

        // Confirmation déjà faite dans l'UI inline

        // Si c'est la classe courante, switch vers une autre avant suppression
        const classes = ClassManager.getAllClasses();
        if (appState.currentClassId === classId && classes.length > 1) {
            const nextClass = classes.find(c => c.id !== classId);
            if (nextClass) {
                await ClassManager.switchClass(nextClass.id);
            }
        }

        await ClassManager.deleteClass(classId, true);
        this.renderClassList();
        this.updateHeaderDisplay();
        AppreciationsManager.renderResults();
        UI?.updateStats?.(); // Refresh stats panel
    },

    /**
     * Gère le changement de classe
     */
    async handleClassSwitch(classId) {
        // Trigger generic page refresh animation
        // Target dynamic containers ONLY to keep the title "Bilan de la classe" visible (avoiding black screen)
        const containersToAnimate = document.querySelectorAll('.stats-container, #outputList, .output-header');

        containersToAnimate.forEach(el => {
            el.classList.remove('card-refresh-animation');
            void el.offsetWidth; // Force reflow
            el.classList.add('card-refresh-animation');
        });

        // Sync with the PEAK BLUR of the animation (50% of 400ms = 200ms)
        // Data swap happens while content is blurred but fully visible (opacity 0.85)
        await new Promise(resolve => setTimeout(resolve, 200));

        await ClassManager.switchClass(classId);
        this.updateHeaderDisplay();
        this.closeDropdown();
        // Refresh the results list with the new class data
        AppreciationsManager.renderResults();
        UI?.updateStats?.();

        // Cleanup after animation finishes (400ms + buffer)
        setTimeout(() => {
            containersToAnimate.forEach(el => {
                el.classList.remove('card-refresh-animation');
            });
        }, 450);
    },

    /**
     * Met à jour l'affichage du header (nom de classe et compteur)
     */
    updateHeaderDisplay() {
        const currentClass = ClassManager.getCurrentClass();
        const hasClasses = ClassManager.getAllClasses().length > 0;

        if (DOM.headerClassName) {
            if (currentClass) {
                DOM.headerClassName.textContent = currentClass.name;
            } else if (hasClasses) {
                DOM.headerClassName.textContent = 'Sélectionner une classe';
            } else {
                DOM.headerClassName.textContent = 'Créer une classe';
            }
        }

        // Update student count
        this.updateStudentCount();
    },

    /**
     * Met à jour le compteur d'élèves dans le header ET dans le dropdown
     * Uses in-memory appState data for immediate reactivity
     */
    updateStudentCount() {
        // Use in-memory data for immediate reactivity
        const count = appState.filteredResults?.length || 0;

        // Update header chip
        if (DOM.headerStudentCount) {
            DOM.headerStudentCount.textContent = count;
        }

        // Also update dropdown counters if visible (using in-memory data, not IndexedDB)
        const allClasses = ClassManager.getAllClasses();
        for (const cls of allClasses) {
            const countBadge = DOM.classDropdownList?.querySelector(
                `.class-student-count[data-class-id="${cls.id}"]`
            );
            if (countBadge) {
                // Count from in-memory generatedResults (faster, always up-to-date)
                const classStudentCount = appState.generatedResults.filter(
                    r => r.classId === cls.id
                ).length;
                countBadge.textContent = classStudentCount;
            }
        }

        // UPDATE "Mes Classes" button with class count & total students tooltip
        const totalStudents = appState.generatedResults?.length || 0;
        const classesCount = ClassManager.getAllClasses().length;

        const manageBtn = document.getElementById('manageClassesBtn');
        const manageBtnSpan = manageBtn ? manageBtn.querySelector('span') : null;

        if (manageBtn && manageBtnSpan) {
            // Button: "Mes Classes (3)" -> Shows number of classes
            manageBtnSpan.textContent = `Mes Classes (${classesCount})`;

            // Tooltip: "Total : 158 élèves"
            manageBtn.classList.add('tooltip');
            manageBtn.setAttribute('data-tooltip', `Total : ${totalStudents} élèves`);
        }
    },

    /**
     * Met à jour les indicateurs de progression dans le dropdown
     * Approche minimaliste : nombre seul + icône si état notable
     * @private
     */
    _updateClassProgressIndicators(classes) {
        const allResults = appState.generatedResults || [];
        const currentPeriod = appState.currentPeriod;

        for (const cls of classes) {
            const badge = DOM.classDropdownList?.querySelector(
                `.class-progress-badge[data-class-id="${cls.id}"]`
            );
            if (!badge) continue;

            // Get students for this class
            const classResults = allResults.filter(r => r.classId === cls.id);
            const totalStudents = classResults.length;

            if (totalStudents === 0) {
                badge.innerHTML = `<span class="progress-count">0</span>`;
                badge.title = 'Aucun élève';
                badge.dataset.status = 'empty';
                continue;
            }

            // Count appreciations status
            let completedCount = 0;
            let errorCount = 0;

            classResults.forEach(result => {
                // Check if has error
                if (result.errorMessage && result.studentData?.currentPeriod === currentPeriod) {
                    errorCount++;
                    return;
                }

                // Check appreciation for current period
                const periodData = result.studentData?.periods?.[currentPeriod];
                const appreciation = periodData?.appreciation || result.appreciation;

                if (appreciation && typeof appreciation === 'string') {
                    const textOnly = appreciation.replace(/<[^>]*>/g, '').trim().toLowerCase();
                    const isPlaceholder = textOnly === '' ||
                        textOnly.includes('en attente') ||
                        textOnly.includes('aucune appréciation') ||
                        textOnly.includes('cliquez sur') ||
                        textOnly.startsWith('remplissez');

                    if (!isPlaceholder) {
                        completedCount++;
                    }
                }
            });

            // Render badge - NEUTRAL: juste le nombre d'élèves, pas d'icône d'état
            // (Decision: afficher SEULEMENT les erreurs sans les autres états est incohérent)
            badge.innerHTML = `<span class="progress-count">${totalStudents}</span>`;

            // Set tooltip and status for potential CSS styling
            if (errorCount > 0) {
                badge.title = `${totalStudents} élève(s) – ${errorCount} erreur(s)`;
                badge.dataset.status = 'error';
            } else if (completedCount === totalStudents && totalStudents > 0) {
                badge.title = `${totalStudents} élève(s) – appréciations OK`;
                badge.dataset.status = 'complete';
            } else if (completedCount > 0) {
                badge.title = `${completedCount}/${totalStudents} appréciations générées`;
                badge.dataset.status = 'partial';
            } else {
                badge.title = `${totalStudents} élève(s)`;
                badge.dataset.status = 'pending';
            }
        }
    },

    /**
     * Met à jour les compteurs d'élèves dans le dropdown (legacy)
     * @private
     */
    _updateClassStudentCounts(classes) {
        const allResults = appState.generatedResults || [];

        for (const cls of classes) {
            const countBadge = DOM.classDropdownList?.querySelector(
                `.class-student-count[data-class-id="${cls.id}"]`
            );
            if (countBadge) {
                const classStudentCount = allResults.filter(
                    r => r.classId === cls.id
                ).length;
                countBadge.textContent = classStudentCount;
            }
        }
    },

    /**
     * Calcule les statistiques d'une classe (élèves, progression)
     * @param {string} classId 
     * @returns {{total: number, completed: number, errors: number, icon: string, statusClass: string}}
     * @private
     */
    _getClassStats(classId) {
        const allResults = appState.generatedResults || [];
        const currentPeriod = appState.currentPeriod;
        const classResults = allResults.filter(r => r.classId === classId);

        const total = classResults.length;
        let completed = 0;
        let errors = 0;

        classResults.forEach(result => {
            // Check errors
            if (result.errorMessage && result.studentData?.currentPeriod === currentPeriod) {
                errors++;
                return;
            }

            // Check appreciation
            const periodData = result.studentData?.periods?.[currentPeriod];
            const appreciation = periodData?.appreciation || result.appreciation;

            if (appreciation && typeof appreciation === 'string') {
                const textOnly = appreciation.replace(/<[^>]*>/g, '').trim().toLowerCase();
                const isPlaceholder = textOnly === '' ||
                    textOnly.includes('en attente') ||
                    textOnly.includes('aucune appréciation') ||
                    textOnly.includes('cliquez sur') ||
                    textOnly.startsWith('remplissez');

                if (!isPlaceholder) {
                    completed++;
                }
            }
        });

        // Determine icon and status class
        let icon = 'fa-clock';
        let statusClass = 'status-pending';

        if (errors > 0) {
            icon = 'fa-exclamation-triangle';
            statusClass = 'status-error';
        } else if (total > 0 && completed === total) {
            icon = 'fa-check';
            statusClass = 'status-complete';
        } else if (completed > 0) {
            icon = 'fa-spinner';
            statusClass = 'status-partial';
        }

        return { total, completed, errors, icon, statusClass };
    },

    /**
     * Échappe les caractères HTML
     * @private
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Vérifie si la migration vers multi-classes est nécessaire et la propose
     */
    async checkAndOfferMigration() {
        const classes = ClassManager.getAllClasses();

        // Si pas de classes mais des résultats existants, proposer la migration
        if (classes.length === 0) {
            const hasResults = appState.generatedResults?.length > 0;

            if (hasResults) {
                // Migration automatique silencieuse vers "Ma Classe"
                await ClassManager.migrateToMultiClass();
                this.updateHeaderDisplay();
            }
        } else {
            // Si des classes existent, mettre à jour l'affichage
            this.updateHeaderDisplay();
        }
    },

    /**
     * Affiche la modale de gestion des classes
     */
    showManageClassesModal() {
        const classes = ClassManager.getAllClasses();

        // Créer le contenu de la modale avec infos enrichies
        const modalContent = `
            <div class="class-management-content">
                ${classes.length === 0 ? `
                    <p style="color: var(--text-secondary); text-align: center; padding: 20px;">
                        Aucune classe créée.
                    </p>
                ` : `
                    <div class="class-management-list" style="display: flex; flex-direction: column; gap: 8px;">
                        ${classes.map(cls => {
            const stats = this._getClassStats(cls.id);
            return `
                            <div class="class-management-item" data-class-id="${cls.id}" draggable="true">
                                <div class="class-drag-handle" title="Glisser pour réorganiser">
                                    <i class="fas fa-grip-vertical"></i>
                                </div>
                                <div class="class-management-info">
                                    <span class="class-management-name">${this._escapeHtml(cls.name)}</span>
                                    <div class="class-management-meta">
                                        <span class="meta-item">
                                            <i class="fas fa-calendar"></i>
                                            ${cls.year || 'Non définie'}
                                        </span>
                                        <span class="meta-separator">•</span>
                                        <span class="meta-item">
                                            <i class="fas fa-users"></i>
                                            ${stats.total} élève${stats.total > 1 ? 's' : ''}
                                        </span>
                                        <span class="meta-separator">•</span>
                                        <span class="meta-item ${stats.statusClass}">
                                            <i class="fas ${stats.icon}"></i>
                                            ${stats.completed}/${stats.total}
                                        </span>
                                    </div>
                                </div>
                                <div class="class-management-actions">
                                    <button class="btn-icon-small manage-rename-btn" data-class-id="${cls.id}" 
                                            title="Renommer">
                                        <i class="fas fa-pencil"></i>
                                    </button>
                                    <button class="btn-icon-small manage-delete-btn" data-class-id="${cls.id}" 
                                            title="Supprimer">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `}).join('')}
                    </div>
                `}
            </div>
        `;

        // Utiliser showCustomConfirm comme base pour afficher le contenu
        // ou créer une simple alert avec le contenu HTML
        const modalEl = document.createElement('div');
        modalEl.className = 'modal modal-small';
        modalEl.id = 'classManagementModal';
        modalEl.innerHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <div class="modal-title-group">
                        <span class="modal-title-icon"><i class="fas fa-cog"></i></span>
                        <div class="modal-title-text-col">
                            <h2 class="modal-title-main">Gestion des classes</h2>
                            <span class="modal-subtitle">${classes.length} classes • ${appState.generatedResults?.length || 0} élèves</span>
                        </div>
                    </div>
                    <button class="close-button close-manage-modal"><i class="fas fa-xmark"></i></button>
                </div>
                <div class="modal-body" style="padding: 16px;">
                    <div style="display: flex; justify-content: flex-end; margin-bottom: 12px;">
                        <button class="btn btn-primary btn-small" id="addClassFromModalBtn">
                            <i class="fas fa-plus"></i> Nouvelle classe
                        </button>
                    </div>
                    ${modalContent}
                </div>
            </div>
        `;

        document.body.appendChild(modalEl);
        UI?.openModal(modalEl);

        // Bind events
        modalEl.querySelector('.close-manage-modal')?.addEventListener('click', () => {
            UI?.closeModal(modalEl);
            setTimeout(() => modalEl.remove(), 300);
        });

        // ========== Drag & Drop Reorder (Rail-Style) ==========
        let draggedItem = null;
        const list = modalEl.querySelector('.class-management-list');

        if (list) {
            // Create invisible drag ghost (1x1 transparent pixel)
            const ghostImg = document.createElement('div');
            ghostImg.style.cssText = 'width:1px;height:1px;position:fixed;top:-100px;opacity:0;';
            document.body.appendChild(ghostImg);

            // Cleanup ghost on modal close
            const cleanupGhost = () => ghostImg.remove();
            modalEl.addEventListener('close', cleanupGhost, { once: true });

            list.addEventListener('dragstart', (e) => {
                const item = e.target.closest('.class-management-item');
                if (!item) return;
                draggedItem = item;

                // Hide native ghost - item stays in place visually
                e.dataTransfer.setDragImage(ghostImg, 0, 0);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.dataset.classId);

                // Mark as dragging after a frame
                requestAnimationFrame(() => {
                    item.classList.add('dragging');
                });
            });

            list.addEventListener('dragend', () => {
                if (draggedItem) {
                    draggedItem.classList.remove('dragging');
                }
                draggedItem = null;

                // Persist final order
                const newOrder = [...list.querySelectorAll('.class-management-item')]
                    .map(i => i.dataset.classId);
                ClassManager.reorderClasses(newOrder);
                this.renderClassList();
            });

            list.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                const target = e.target.closest('.class-management-item');
                if (!target || target === draggedItem) return;

                const targetRect = target.getBoundingClientRect();
                const mouseY = e.clientY;
                const targetMiddle = targetRect.top + targetRect.height / 2;

                // Check if we need to move
                const shouldInsertBefore = mouseY < targetMiddle;
                const isAlreadyBefore = target.previousElementSibling === draggedItem;
                const isAlreadyAfter = target.nextElementSibling === draggedItem;

                if ((shouldInsertBefore && isAlreadyBefore) || (!shouldInsertBefore && isAlreadyAfter)) {
                    return; // Already in correct position
                }

                // FLIP Animation: capture positions before move
                const items = [...list.querySelectorAll('.class-management-item:not(.dragging)')];
                const firstRects = new Map();
                items.forEach(item => {
                    firstRects.set(item, item.getBoundingClientRect());
                });

                // Perform DOM move
                if (shouldInsertBefore) {
                    target.before(draggedItem);
                } else {
                    target.after(draggedItem);
                }

                // FLIP: animate from old position to new
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
        }

        // Add new class button in modal - inline form
        const addClassBtn = modalEl.querySelector('#addClassFromModalBtn');
        addClassBtn?.addEventListener('click', () => {
            // Check if form already exists
            const existingForm = modalEl.querySelector('.inline-create-class-form');
            if (existingForm) {
                existingForm.querySelector('input')?.focus();
                return;
            }

            // Create inline form at the top of the list
            const listContainer = modalEl.querySelector('.class-management-list') ||
                modalEl.querySelector('.class-management-content');

            const formHtml = `
                <div class="inline-create-class-form" style="
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    padding: 12px 16px;
                    background: rgba(var(--primary-color-rgb), 0.08);
                    border: 2px solid var(--primary-color);
                    border-radius: var(--radius-md);
                    margin-bottom: 12px;
                    animation: slideDownExpand 0.25s ease-out;
                ">
                    <input type="text" class="new-class-input" 
                           placeholder="Nom de la nouvelle classe..." 
                           maxlength="50"
                           style="
                               flex: 1;
                               padding: 10px 14px;
                               border: 1px solid var(--border-color);
                               border-radius: var(--radius-sm);
                               background: var(--surface-color);
                               font-size: 0.95em;
                               outline: none;
                           "
                           autocomplete="off">
                    <button class="btn btn-primary btn-small create-class-confirm" style="padding: 10px 14px;" disabled>
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="btn btn-secondary btn-small create-class-cancel" style="padding: 10px 14px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;

            listContainer.insertAdjacentHTML('afterbegin', formHtml);

            const form = listContainer.querySelector('.inline-create-class-form');
            const input = form.querySelector('.new-class-input');
            const confirmBtn = form.querySelector('.create-class-confirm');
            const cancelBtn = form.querySelector('.create-class-cancel');

            input.focus();

            const removeForm = () => {
                form.style.animation = 'slideUpCollapse 0.2s ease-out forwards';
                setTimeout(() => form.remove(), 180);
            };

            input.oninput = () => {
                confirmBtn.disabled = input.value.trim().length === 0;
            };

            input.onkeydown = (e) => {
                if (e.key === 'Enter' && input.value.trim()) {
                    e.preventDefault();
                    confirmBtn.click();
                } else if (e.key === 'Escape') {
                    removeForm();
                }
            };

            cancelBtn.onclick = removeForm;

            confirmBtn.onclick = async () => {
                const className = input.value.trim();
                if (className) {
                    confirmBtn.disabled = true;
                    input.disabled = true;
                    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                    await this._createAndSwitchClass(className);

                    // Refresh modal
                    UI?.closeModal(modalEl);
                    setTimeout(() => {
                        modalEl.remove();
                        this.showManageClassesModal();
                    }, 300);
                }
            };
        });

        // Rename buttons - inline editing
        const bindRenameHandler = (btn) => {
            const handler = () => {
                const classId = btn.dataset.classId;
                const cls = ClassManager.getClassById(classId);
                if (!cls) return;

                const row = btn.closest('.class-management-item');
                if (!row) return;

                const originalContent = row.innerHTML;

                row.innerHTML = `
                    <div class="rename-inline-form" style="
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        width: 100%;
                        animation: slideInConfirm 0.2s ease-out;
                    ">
                        <input type="text" class="inline-rename-input" 
                               value="${this._escapeHtml(cls.name)}"
                               maxlength="50"
                               style="
                                   flex: 1;
                                   padding: 8px 12px;
                                   border: 2px solid var(--primary-color);
                                   border-radius: var(--radius-sm);
                                   background: var(--surface-color);
                                   font-size: 0.95em;
                                   font-weight: 500;
                               ">
                        <button class="btn btn-primary btn-small save-rename-btn" style="padding: 8px 12px;">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-secondary btn-small cancel-rename-btn" style="padding: 8px 12px;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;

                row.style.background = 'rgba(var(--primary-color-rgb), 0.05)';
                row.style.borderColor = 'var(--primary-color)';

                const input = row.querySelector('.inline-rename-input');
                const saveBtn = row.querySelector('.save-rename-btn');
                const cancelBtn = row.querySelector('.cancel-rename-btn');

                input.focus();
                input.select();

                const restore = () => {
                    row.innerHTML = originalContent;
                    row.style.background = '';
                    row.style.borderColor = '';
                    // Re-bind both buttons
                    const newRenameBtn = row.querySelector('.manage-rename-btn');
                    const newDeleteBtn = row.querySelector('.manage-delete-btn');
                    if (newRenameBtn) bindRenameHandler(newRenameBtn);
                    if (newDeleteBtn) bindDeleteHandler(newDeleteBtn);
                };

                const save = () => {
                    const newName = input.value.trim();
                    if (newName && newName !== cls.name) {
                        ClassManager.updateClass(classId, { name: newName });
                        UI?.showNotification(`Classe renommée en "${newName}"`, 'success');
                        this.updateHeaderDisplay();
                        UI?.closeModal(modalEl);
                        setTimeout(() => {
                            modalEl.remove();
                            this.showManageClassesModal();
                        }, 300);
                    } else {
                        restore();
                    }
                };

                input.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        save();
                    } else if (e.key === 'Escape') {
                        restore();
                    }
                };

                saveBtn.onclick = save;
                cancelBtn.onclick = restore;
            };
            btn.addEventListener('click', handler);
        };

        modalEl.querySelectorAll('.manage-rename-btn').forEach(btn => bindRenameHandler(btn));

        // Delete buttons - inline confirmation
        const bindDeleteHandler = (btn) => {
            const handler = () => {
                const classId = btn.dataset.classId;
                const row = btn.closest('.class-management-item');
                if (!row) return;

                const originalContent = row.innerHTML;
                const cls = ClassManager.getClassById(classId);

                row.innerHTML = `
                    <div class="delete-confirm-inline" style="
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        width: 100%;
                        animation: slideInConfirm 0.2s ease-out;
                    ">
                        <span style="color: var(--error-color); font-weight: 500; font-size: 0.9em;">
                            <i class="fas fa-exclamation-triangle"></i> Supprimer "${this._escapeHtml(cls?.name || '')}" ?
                        </span>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-secondary btn-small cancel-delete-btn" style="padding: 6px 12px; font-size: 0.85em;">
                                Annuler
                            </button>
                            <button class="btn btn-danger btn-small confirm-delete-btn" style="padding: 6px 12px; font-size: 0.85em; background: var(--error-color); color: white; border: none;">
                                <i class="fas fa-trash"></i> Supprimer
                            </button>
                        </div>
                    </div>
                `;

                row.style.background = 'rgba(239, 68, 68, 0.1)';
                row.style.borderColor = 'var(--error-color)';

                // Cancel - restore and re-bind
                row.querySelector('.cancel-delete-btn').onclick = () => {
                    row.innerHTML = originalContent;
                    row.style.background = '';
                    row.style.borderColor = '';
                    // Re-bind the new delete button
                    const newDeleteBtn = row.querySelector('.manage-delete-btn');
                    if (newDeleteBtn) {
                        bindDeleteHandler(newDeleteBtn);
                    }
                    // Re-bind rename button too
                    const newRenameBtn = row.querySelector('.manage-rename-btn');
                    if (newRenameBtn) {
                        bindRenameHandler(newRenameBtn);
                    }
                };

                // Confirm delete
                row.querySelector('.confirm-delete-btn').onclick = async () => {
                    row.style.animation = 'slideOutRow 0.3s ease-out forwards';

                    setTimeout(async () => {
                        await this.handleDeleteClass(classId);
                        this.updateHeaderDisplay();
                        this.renderClassList(); // Also refresh the dropdown

                        // Juste retirer la ligne, pas besoin de fermer/rouvrir
                        row.remove();

                        // Si plus de classes, fermer la modale et proposer d'en créer une
                        const remainingClasses = ClassManager.getAllClasses();
                        if (remainingClasses.length === 0) {
                            UI?.closeModal(modalEl);
                            setTimeout(() => {
                                modalEl.remove();
                                // Ouvrir automatiquement le dropdown et proposer de créer une classe
                                this.openDropdown();
                                setTimeout(() => this.showNewClassPrompt(), 100);
                            }, 300);
                        }
                    }, 280);
                };
            };
            btn.addEventListener('click', handler);
        };

        modalEl.querySelectorAll('.manage-delete-btn').forEach(btn => bindDeleteHandler(btn));
    },

    /**
     * Affiche une modale pour déplacer un ou plusieurs élèves vers une autre classe
     * @param {string|Array<string>} studentIds - ID(s) des élèves à déplacer
     * @param {Function} [onSuccess] - Callback appelée après le déplacement réussi
     */
    showMoveStudentsModal(studentIds, onSuccess = null) {
        // Ensure array
        const ids = Array.isArray(studentIds) ? studentIds : [studentIds];
        if (ids.length === 0) return;

        // Find students
        const students = appState.generatedResults.filter(r => ids.includes(r.id));
        if (students.length === 0) {
            UI?.showNotification('Aucun élève trouvé', 'error');
            return;
        }

        const isBulk = students.length > 1;
        const firstStudent = students[0];

        // Check if all are in the same class (they should be for this UI, but good to be safe)
        const currentClassId = firstStudent.classId;
        const allClassesAreSame = students.every(s => s.classId === currentClassId);

        // Target classes (exclude current)
        // If mixed classes, exclude none? Or just use "Move to..." logic. 
        // For simplicity, we assume we are in a context where we move FROM a class (class dashboard usually).
        // If from "All Students" view, we might have mixed classes.
        // Let's list ALL classes except the one they are predominantly in, or just ALL classes if mixed.

        let classes = ClassManager.getAllClasses();
        if (allClassesAreSame) {
            classes = classes.filter(c => c.id !== currentClassId);
        }

        if (classes.length === 0) {
            UI?.showNotification('Aucune autre classe disponible. Créez d\'abord une autre classe.', 'warning');
            return;
        }

        const currentClass = ClassManager.getClassById(currentClassId);

        // Title & Description
        const title = isBulk ? 'Déplacer les élèves' : 'Déplacer l\'élève';
        const description = isBulk
            ? `Déplacer <strong>${students.length} élèves</strong> vers :`
            : `Déplacer <strong>${this._escapeHtml(firstStudent.prenom + ' ' + firstStudent.nom)}</strong> ${allClassesAreSame ? `depuis <strong>${this._escapeHtml(currentClass?.name || 'Class')}</strong>` : ''} vers :`;

        // Créer la modale
        const modalEl = document.createElement('div');
        modalEl.className = 'modal modal-small';
        modalEl.id = 'moveStudentModal';
        modalEl.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <span class="modal-title-icon"><i class="fas fa-arrow-right-arrow-left"></i></span>
                        <span class="modal-title-text">${title}</span>
                    </h2>
                    <button class="close-button close-move-modal"><i class="fas fa-xmark"></i></button>
                </div>
                <div class="modal-body" style="padding: 16px;">
                    <p style="margin-bottom: 16px; color: var(--text-secondary);">
                        ${description}
                    </p>
                    <div class="move-class-list" style="display: flex; flex-direction: column; gap: 8px;">
                        ${classes.map(cls => `
                            <button class="btn btn-secondary move-target-btn" data-class-id="${cls.id}" style="
                                justify-content: flex-start;
                                padding: 12px 16px;
                                text-align: left;
                            ">
                                <i class="fas fa-graduation-cap" style="margin-right: 10px; opacity: 0.7;"></i>
                                ${this._escapeHtml(cls.name)}
                                <span style="margin-left: auto; font-size: 0.85em; opacity: 0.6;">${cls.year || ''}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modalEl);
        UI?.openModal(modalEl);

        // Close button
        modalEl.querySelector('.close-move-modal')?.addEventListener('click', () => {
            UI?.closeModal(modalEl);
            setTimeout(() => modalEl.remove(), 300);
        });

        // Class selection buttons
        modalEl.querySelectorAll('.move-target-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const targetClassId = btn.dataset.classId;
                const targetClass = ClassManager.getClassById(targetClassId);

                // Confirm action
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Déplacement...';

                // Move students
                let movedCount = 0;

                // Using imported StudentDataManager if needed, but here we seem to update raw objects
                // Ideally we should use StudentDataManager.updateStudent() but direct manipulation 
                // seems to be the pattern here (based on previous code). 
                // Wait, previous code accessed 'student.classId = ...'. 
                // Let's stick to that for now, but really we should persist it.
                // The previous code did `await StorageManager?.saveAppState();` so that's enough.

                students.forEach(student => {
                    student.classId = targetClassId;

                    // Remove from current filtered results if we are viewing the source class
                    // (This logic is a bit fragile if we are in "All Classes" view, but keeps consistency with previous code)
                    const indexInFiltered = appState.filteredResults.findIndex(r => r.id === student.id);
                    if (indexInFiltered !== -1 && allClassesAreSame && appState.currentClassId === currentClassId) {
                        appState.filteredResults.splice(indexInFiltered, 1);
                    }
                    movedCount++;
                });

                // Save
                await StorageManager?.saveAppState();

                // Update UI
                this.updateStudentCount();

                // CRITICAL: if we are in ListView, we might need to refresh the whole list if we removed items
                // The splice above modifies filteredResults in place, so renderResults SHOULD refect it.
                // However, renderResults takes filteredResults as arg usually.
                AppreciationsManager.renderResults();
                UI?.updateStats?.();

                // If ListViewManager has selections, we should probably clear them
                // But we don't have access to ListViewManager instance here directly easily?
                // Actually `AppreciationsManager.renderResults()` usually calls `ListViewManager.render`.
                // We should rely on that.

                // Close modal and notify
                UI?.closeModal(modalEl);
                setTimeout(() => modalEl.remove(), 300);

                const notificationText = isBulk
                    ? `${movedCount} élèves déplacés vers "${targetClass?.name}"`
                    : `${firstStudent.prenom} déplacé vers "${targetClass?.name}"`;

                UI?.showNotification(notificationText, 'success');

                // Callback for caller (e.g. to clear selections)
                if (onSuccess) onSuccess();
            });
        });
    }
};
