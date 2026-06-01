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
import { detectLevelFromName } from '../utils/LevelDetector.js';
import { HistoryManager } from './HistoryManager.js';
import { ClassDashboardManager } from './ClassDashboardManager.js';
import { SeatingChartManager } from './SeatingChartManager.js';

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

        // Support clavier pour le bouton d'en-tête (Entrée/Espace)
        DOM.headerClassChip?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                this.toggleDropdown();
            }
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

        // Navigation clavier et fermeture via Échap lorsque le dropdown est ouvert
        document.addEventListener('keydown', (e) => {
            if (!this._isDropdownOpen) return;

            // Ne pas interférer si l'utilisateur saisit du texte dans un champ (ex: création de classe)
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === 'Escape') {
                this.closeDropdown();
                DOM.headerClassChip?.focus();
                return;
            }

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const items = Array.from(DOM.classDropdownList?.querySelectorAll('.class-dropdown-item') || []);
                if (items.length === 0) return;

                e.preventDefault();
                const activeEl = document.activeElement;
                const index = items.indexOf(activeEl);

                if (index === -1) {
                    const activeItem = DOM.classDropdownList.querySelector('.class-dropdown-item.active');
                    (activeItem || items[0])?.focus();
                } else {
                    const nextIndex = e.key === 'ArrowDown'
                        ? (index + 1) % items.length
                        : (index - 1 + items.length) % items.length;
                    items[nextIndex]?.focus();
                }
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

        // [UX Mobile] Push History State
        HistoryManager.pushState('classDropdown', (options) => this.closeDropdown(options));

        this._isDropdownOpen = true;
        DOM.headerClassChip?.classList.add('active');
        DOM.classDropdown.style.display = 'block';

        // Teleport to body on all screens to escape header clipping & nested backdrop-filter rendering bug in Chromium
        this._originalDropdownParent = DOM.classDropdown.parentElement;
        const chipRect = DOM.headerClassChip?.getBoundingClientRect();
        document.body.appendChild(DOM.classDropdown);
        DOM.classDropdown.style.position = 'fixed';
        DOM.classDropdown.style.top = `${(chipRect?.bottom || 56) + 8}px`;
        DOM.classDropdown.style.zIndex = '9999';

        if (window.innerWidth < 768) {
            DOM.classDropdown.style.left = '12px';
            DOM.classDropdown.style.right = '12px';
            DOM.classDropdown.style.minWidth = 'unset';
            DOM.classDropdown.style.maxWidth = 'none';
            DOM.classDropdown.style.width = 'auto';
        } else {
            DOM.classDropdown.style.left = `${chipRect?.left || 16}px`;
            DOM.classDropdown.style.right = 'unset';
            DOM.classDropdown.style.minWidth = '280px';
            DOM.classDropdown.style.maxWidth = '340px';
            DOM.classDropdown.style.width = 'auto';
        }

        // Trigger animation
        requestAnimationFrame(() => {
            DOM.classDropdown.classList.add('visible');
        });

        // Render class list
        this.renderClassList();

        // Focus de la classe active pour une accessibilité clavier optimale
        requestAnimationFrame(() => {
            DOM.classDropdownList?.querySelector('.class-dropdown-item.active')?.focus();
        });
    },

    /**
     * Ferme le dropdown
     */
    closeDropdown(options = {}) {
        if (!DOM.classDropdown) return;

        // [UX Mobile] History Cleanup
        if (!options.causedByHistory && this._isDropdownOpen) {
            HistoryManager.handleManualClose('classDropdown');
        }

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
            <form class="inline-create-form" action="javascript:void(0)" autocomplete="off">
                <div class="inline-create-form-row">
                    <input type="text" class="inline-class-input" 
                           placeholder="Nom de la classe..." 
                           autocomplete="off"
                           maxlength="50"
                           name="newClassName_ignore">
                    <button type="button" class="btn btn-secondary btn-small inline-create-btn" disabled>
                        <iconify-icon icon="ph:check"></iconify-icon>
                    </button>
                    <button type="button" class="btn btn-secondary btn-small inline-cancel-btn">
                        <iconify-icon icon="ph:x"></iconify-icon>
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
            }
        };
    },


    /**
     * Crée une classe et bascule vers elle
     * @private
     */
    async _createAndSwitchClass(className, level = null) {
        try {
            const newClass = ClassManager.createClass(className, null, null, level);
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
                    <iconify-icon icon="solar:mortarboard-linear" style="font-size: 24px; color: var(--text-tertiary);"></iconify-icon>
                    <p>Aucune classe créée</p>
                    <button type="button" class="btn btn-primary btn-small" id="createFirstClassBtn">
                        <iconify-icon icon="ph:plus"></iconify-icon> Créer ma première classe
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
                 data-class-id="${cls.id}"
                 tabindex="0"
                 role="option"
                 aria-selected="${cls.id === currentClassId ? 'true' : 'false'}">
                <div class="class-info">
                    <span class="class-name">${this._escapeHtml(cls.name)}</span>
                    <span class="class-meta">
                        <iconify-icon icon="solar:calendar-linear"></iconify-icon> ${cls.year || 'Non définie'}
                    </span>
                </div>
                <div class="class-progress-badge" data-class-id="${cls.id}">
                    <span class="progress-loader"></span>
                </div>
            </div>
        `).join('');

        // Bind click and keyboard events on class items
        DOM.classDropdownList.querySelectorAll('.class-dropdown-item').forEach(item => {
            const selectClass = async () => {
                const classId = item.dataset.classId;
                await this.handleClassSwitch(classId);
            };

            item.addEventListener('click', selectClass);
            item.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    await selectClass();
                }
            });
        });

        // Update progress indicators asynchronously
        this._updateClassProgressIndicators(classes);

        // Défilement automatique vers la classe active si le dropdown est ouvert
        if (this._isDropdownOpen) {
            requestAnimationFrame(() => {
                DOM.classDropdownList?.querySelector('.class-dropdown-item.active')?.scrollIntoView({ block: 'nearest' });
            });
        }
    },

    /**
     * Gère la suppression d'une classe
     */
    async handleDeleteClass(classId) {
        const classToDelete = ClassManager.getClassById(classId);
        if (!classToDelete) return;

        // Visual feedback during deletion
        const row = document.querySelector(`.class-management-item[data-class-id="${classId}"]`);
        if (row) {
            const btn = row.querySelector('.confirm-delete-btn');
            if (btn) btn.innerHTML = '<iconify-icon icon="solar:spinner-linear" class="spin"></iconify-icon>';
        }

        try {
            // Si c'est la classe courante, switch vers une autre avant suppression
            const classes = ClassManager.getAllClasses();
            const isCurrentClass = appState.currentClassId === classId;

            if (isCurrentClass && classes.length > 1) {
                const nextClass = classes.find(c => c.id !== classId);
                if (nextClass) {
                    // Switch logic: State first to ensure UI consistency
                    await ClassManager.switchClass(nextClass.id);
                }
            } else if (isCurrentClass) {
                // Deleting the last/only class - Clear view immediately
                if (DOM.resultsDiv) DOM.resultsDiv.innerHTML = '';
            }

            // Proceed to delete
            await ClassManager.deleteClass(classId, true);

        } catch {
            UI?.showNotification("Erreur lors de la suppression de la classe.", "error");
        } finally {
            // Always refresh UI state
            this.renderClassList();
            this.updateHeaderDisplay();

            // Force refresh interactions
            AppreciationsManager.renderResults();
            UI?.updateStats?.();

            // Notify seating chart
            const newClassId = appState.currentClassId;
            const hasResults = newClassId && (appState.generatedResults || []).some(r => r.classId === newClassId);
            SeatingChartManager.onClassChange(!!hasResults);

            // Check migration if 0 classes left
            this.checkAndOfferMigration();
        }
    },

    /**
     * Gère le changement de classe
     */
    async handleClassSwitch(classId, highlightId = null) {
        // Trigger generic page refresh animation
        // Target dynamic containers ONLY to keep the title "Bilan de la classe" visible (avoiding black screen)
        const containersToAnimate = document.querySelectorAll('.stats-container, #outputList, .output-header, #seatingChartView');

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
        AppreciationsManager.renderResults(highlightId, 'new');
        UI?.updateStats?.();

        // Notify seating chart of class change
        const hasResults = (appState.generatedResults || []).some(r => r.classId === classId);
        SeatingChartManager.onClassChange(hasResults);

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
        // Update header chip via UIManager if available to preserve active filters context
        if (UI && UI.updateHeaderContext) {
            UI.updateHeaderContext();
        } else if (DOM.headerStudentCount) {
            const count = appState.filteredResults?.length || 0;
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
                if (result.errorMessage && result.errorPeriod === currentPeriod) {
                    errorCount++;
                    return;
                }

                const periodData = result.studentData?.periods?.[currentPeriod];
                const appreciation = periodData?.appreciation || result.appreciation;

                if (!this._isPlaceholderAppreciation(appreciation)) {
                    completedCount++;
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
     * Vérifie si un texte d'appréciation est un placeholder vide
     * @private
     */
    _isPlaceholderAppreciation(appreciation) {
        if (!appreciation || typeof appreciation !== 'string') return true;
        const text = appreciation.replace(/<[^>]*>/g, '').trim().toLowerCase();
        return text === '' ||
            text.includes('en attente') ||
            text.includes('aucune appréciation') ||
            text.includes('cliquez sur') ||
            text.startsWith('remplissez');
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
            if (result.errorMessage && result.errorPeriod === currentPeriod) {
                errors++;
                return;
            }

            const periodData = result.studentData?.periods?.[currentPeriod];
            const appreciation = periodData?.appreciation || result.appreciation;

            if (!this._isPlaceholderAppreciation(appreciation)) {
                completed++;
            }
        });

        // Determine icon and status class
        let icon = 'solar:clock-circle-linear';
        let statusClass = 'status-pending';

        if (errors > 0) {
            icon = 'solar:danger-triangle-bold';
            statusClass = 'status-error';
        } else if (total > 0 && completed === total) {
            icon = 'ph:check';
            statusClass = 'status-complete';
        } else if (completed > 0) {
            icon = 'solar:pie-chart-2-linear'; // Or spinner if you prefer
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
                // CORRECTIF: Rafraîchir les résultats et les stats pour afficher les élèves après migration
                AppreciationsManager.renderResults();
                UI?.updateStats?.();
            }
        } else {
            // Si des classes existent, mettre à jour l'affichage
            // SAUVEGARDE: Si aucune classe courante n'est sélectionnée ou si elle n'existe plus, sélectionner la première classe
            const currentClassId = appState.currentClassId;
            const currentClassExists = classes.some(c => c.id === currentClassId);
            if (!currentClassId || !currentClassExists) {
                const firstClass = classes[0];
                if (firstClass) {
                    await ClassManager.switchClass(firstClass.id);
                    AppreciationsManager.renderResults();
                    UI?.updateStats?.();
                }
            }

            this.updateHeaderDisplay();

            // Migration silencieuse des classes existantes n'ayant pas de niveau
            for (const cls of classes) {
                if (!cls.level) {
                    const detectedLevel = detectLevelFromName(cls.name);
                    ClassManager.updateClass(cls.id, { level: detectedLevel });
                }
            }
        }
    },

    /**
     * Affiche la modale de gestion des classes (Vue d'ensemble)
     */
    showManageClassesModal() {
        const classes = ClassManager.getAllClasses();

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
                            <span class="modal-subtitle">${classes.length} classes • ${appState.generatedResults?.length || 0} élèves</span>
                        </div>
                    </div>
                    <div class="modal-header-actions">
                        <button class="btn btn-secondary btn-small add-class-modal-btn" id="addClassFromModalBtn" title="Créer une nouvelle classe">
                            <iconify-icon icon="ph:plus"></iconify-icon> <span>Nouvelle classe</span>
                        </button>
                        <button class="close-button close-manage-modal"><iconify-icon icon="ph:x"></iconify-icon></button>
                    </div>
                </div>
                <div class="modal-body" style="padding: 16px;">
                    <!-- Rempli par refreshList -->
                </div>
            </div>
        `;

        document.body.appendChild(modalEl);
        UI?.openModal(modalEl);

        // Bind events
        const ghostImg = document.createElement('div');
        ghostImg.style.cssText = 'width:1px;height:1px;position:fixed;top:-100px;opacity:0;';
        document.body.appendChild(ghostImg);

        const cleanupGhost = () => ghostImg.remove();
        modalEl.addEventListener('close', cleanupGhost, { once: true });

        modalEl.querySelector('.close-manage-modal')?.addEventListener('click', () => {
            UI?.closeModal(modalEl);
            cleanupGhost();
            setTimeout(() => modalEl.remove(), 300);
        });

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
                <div class="inline-create-class-form">
                    <div class="form-row">
                        <input type="text" class="new-class-input" 
                               placeholder="Nom de la nouvelle classe..." 
                               maxlength="50"
                               autocomplete="off">
                        <button class="create-class-confirm" title="Confirmer" disabled>
                            <iconify-icon icon="ph:check-bold"></iconify-icon>
                        </button>
                        <button class="create-class-cancel" title="Annuler">
                            <iconify-icon icon="ph:x"></iconify-icon>
                        </button>
                    </div>
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
                    confirmBtn.innerHTML = '<iconify-icon icon="svg-spinners:ring-resize"></iconify-icon>';

                    await this._createAndSwitchClass(className);
                    refreshList();
                }
            };
        });

        // Event delegation and direct bindings inside the list
        const bindListEvents = () => {
            const list = modalEl.querySelector('.class-management-list');
            if (!list) return;

            // Bind Row Click (Switch Class)
            list.addEventListener('click', async (e) => {
                const item = e.target.closest('.class-management-item');
                if (!item) return;

                // Ignore if row is currently in editing mode (renaming or deleting)
                if (item.classList.contains('editing')) {
                    return;
                }

                // Ignore if clicking on actions or drag handle
                if (e.target.closest('.class-management-actions') || e.target.closest('.class-drag-handle')) {
                    return;
                }

                const classId = item.dataset.classId;
                if (classId) {
                    modalEl.querySelectorAll('.class-management-item').forEach(i => i.classList.remove('active-switch'));
                    item.classList.add('active-switch');

                    await this.handleClassSwitch(classId);

                    setTimeout(() => {
                        UI?.closeModal(modalEl);
                        cleanupGhost();
                        setTimeout(() => modalEl.remove(), 300);
                    }, 150);
                }
            });

            // ========== Drag & Drop Reorder (Rail-Style) ==========
            list.addEventListener('dragstart', (e) => {
                const item = e.target.closest('.class-management-item');
                if (!item) return;
                draggedItem = item;

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

                const shouldInsertBefore = mouseY < targetMiddle;
                const isAlreadyBefore = target.previousElementSibling === draggedItem;
                const isAlreadyAfter = target.nextElementSibling === draggedItem;

                if ((shouldInsertBefore && isAlreadyBefore) || (!shouldInsertBefore && isAlreadyAfter)) {
                    return;
                }

                const items = [...list.querySelectorAll('.class-management-item:not(.dragging)')];
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

                    const originalContent = row.innerHTML;

                    row.innerHTML = `
                        <div class="rename-inline-form">
                            <input type="text" class="inline-rename-input" 
                                   value="${this._escapeHtml(cls.name)}"
                                   maxlength="50"
                                   autocomplete="off">
                            <button class="save-rename-btn" title="Confirmer">
                                <iconify-icon icon="ph:check-bold"></iconify-icon>
                            </button>
                            <button class="cancel-rename-btn" title="Annuler">
                                <iconify-icon icon="ph:x"></iconify-icon>
                            </button>
                        </div>
                    `;

                    row.classList.add('editing', 'renaming');

                    const input = row.querySelector('.inline-rename-input');
                    const saveBtn = row.querySelector('.save-rename-btn');
                    const cancelBtn = row.querySelector('.cancel-rename-btn');

                    input.focus();
                    input.select();

                    const restore = () => {
                        row.innerHTML = originalContent;
                        row.classList.remove('editing', 'renaming');
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
                            refreshList();
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
                });
            };

            list.querySelectorAll('.manage-rename-btn').forEach(btn => bindRenameHandler(btn));

            // Delete buttons - inline confirmation
            const bindDeleteHandler = (btn) => {
                btn.addEventListener('click', () => {
                    const classId = btn.dataset.classId;
                    const row = btn.closest('.class-management-item');
                    if (!row) return;

                    const originalContent = row.innerHTML;
                    const cls = ClassManager.getClassById(classId);

                    row.innerHTML = `
                        <div class="delete-confirm-inline">
                            <div class="delete-confirm-info">
                                <span class="delete-confirm-title">
                                    <iconify-icon icon="solar:danger-triangle-bold"></iconify-icon> 
                                    Supprimer la classe <strong>${this._escapeHtml(cls?.name || '')}</strong> ?
                                </span>
                                <span class="delete-confirm-subtext">Ses élèves et données seront définitivement effacés.</span>
                            </div>
                            <div class="delete-confirm-actions">
                                <button class="inline-delete-btn cancel cancel-delete-btn">
                                    Annuler
                                </button>
                                <button class="inline-delete-btn confirm confirm-delete-btn">
                                    <iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon> Supprimer
                                </button>
                            </div>
                        </div>
                    `;

                    row.classList.add('editing');

                    row.querySelector('.cancel-delete-btn').onclick = () => {
                        row.innerHTML = originalContent;
                        row.classList.remove('editing');
                        const newDeleteBtn = row.querySelector('.manage-delete-btn');
                        if (newDeleteBtn) bindDeleteHandler(newDeleteBtn);
                        const newRenameBtn = row.querySelector('.manage-rename-btn');
                        if (newRenameBtn) bindRenameHandler(newRenameBtn);
                    };

                    row.querySelector('.confirm-delete-btn').onclick = async () => {
                        row.style.animation = 'slideOutRow 0.3s ease-out forwards';

                        setTimeout(async () => {
                            await this.handleDeleteClass(classId);
                            this.updateHeaderDisplay();
                            this.renderClassList();

                            const remainingClasses = ClassManager.getAllClasses();
                            if (remainingClasses.length === 0) {
                                UI?.closeModal(modalEl);
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

            list.querySelectorAll('.manage-delete-btn').forEach(btn => bindDeleteHandler(btn));

            // Duplicate buttons handler
            const bindDuplicateHandler = (btn) => {
                btn.addEventListener('click', async () => {
                    const classId = btn.dataset.classId;
                    if (!classId) return;

                    const originalIcon = btn.innerHTML;
                    btn.innerHTML = '<iconify-icon icon="svg-spinners:ring-resize"></iconify-icon>';
                    btn.disabled = true;

                    try {
                        await ClassManager.duplicateClass(classId);

                        this.updateHeaderDisplay();
                        this.renderClassList();
                        this.updateStudentCount();
                        refreshList();
                    } catch {
                        UI?.showNotification('Erreur lors de la duplication', 'error');
                        btn.innerHTML = originalIcon;
                        btn.disabled = false;
                    }
                });
            };

            list.querySelectorAll('.manage-duplicate-btn').forEach(btn => bindDuplicateHandler(btn));
        };

        let draggedItem = null;

        // Render function to dynamically update the list
        const refreshList = () => {
            const currentClasses = ClassManager.getAllClasses();

            const subtitle = modalEl.querySelector('.modal-subtitle');
            if (subtitle) {
                subtitle.textContent = `${currentClasses.length} classes • ${appState.generatedResults?.length || 0} élèves`;
            }

            const modalBody = modalEl.querySelector('.modal-body');
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
                            const colorClass = pedagoStats.average >= 14 ? 'good' : pedagoStats.average >= 10 ? 'average' : 'risk';

                            let trendIcon = '';
                            if (pedagoStats.avgEvolution !== null) {
                                const trend = pedagoStats.avgEvolution;
                                const trendClass = trend > 0.5 ? 'positive' : trend < -0.5 ? 'negative' : 'neutral';
                                const trendArrow = trend > 0.5 ? '↗' : trend < -0.5 ? '↘' : '→';
                                trendIcon = `<span class="trend-indicator ${trendClass}" title="Évolution trimestrielle">${trendArrow}</span>`;
                            }

                            averageBadge = `
                                <div class="class-stat-badge ${colorClass}" title="Moyenne générale de la classe">
                                    <span class="stat-value">${avg}</span>
                                    <span class="stat-suffix">/20</span>
                                    ${trendIcon}
                                </div>
                            `;
                        } else {
                            averageBadge = `<div class="class-stat-badge no-data"><span class="stat-value">--/20</span></div>`;
                        }

                        return `
                            <div class="class-management-item ${isActive ? 'active-switch' : ''}" 
                                 data-class-id="${cls.id}" 
                                 draggable="true"
                                 tabindex="0"
                                 role="option"
                                 aria-selected="${isActive ? 'true' : 'false'}">
                                <div class="class-drag-handle" title="Réorganiser">
                                    <iconify-icon icon="solar:hamburger-menu-linear"></iconify-icon>
                                </div>
                                
                                <div class="class-management-info">
                                    <div class="class-info-header">
                                        <span class="class-management-name">${this._escapeHtml(cls.name)}</span>
                                        ${averageBadge}
                                    </div>
                                    
                                    <div class="class-management-meta">
                                        <span class="meta-item-inline" title="Année scolaire">
                                            <iconify-icon icon="solar:calendar-linear"></iconify-icon>
                                            <span>${cls.year || '2025-2026'}</span>
                                        </span>
                                        <span class="meta-separator">•</span>
                                        <span class="meta-item-inline" title="Nombre d'élèves">
                                            <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                                            <span>${stats.total} élèves</span>
                                        </span>
                                        <span class="meta-separator">•</span>
                                        <span class="meta-item-inline ${stats.statusClass}" title="Appréciations complétées (Trimestre actif)">
                                            <iconify-icon icon="${stats.icon}"></iconify-icon>
                                            <span>${stats.completed}/${stats.total}</span>
                                        </span>
                                    </div>
                                </div>

                                <div class="class-management-actions">
                                    <button class="manage-duplicate-btn" data-class-id="${cls.id}" 
                                            title="Dupliquer la classe">
                                        <iconify-icon icon="solar:copy-linear"></iconify-icon>
                                    </button>
                                    <button class="manage-rename-btn" data-class-id="${cls.id}" 
                                            title="Renommer">
                                        <iconify-icon icon="solar:pen-new-square-linear"></iconify-icon>
                                    </button>
                                    <button class="manage-delete-btn" data-class-id="${cls.id}" 
                                            title="Supprimer la classe">
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

            // Mettre le focus sur la classe active/nouvelle pour l'accessibilité et le repérage visuel
            const activeItem = modalEl.querySelector('.class-management-item.active-switch');
            if (activeItem) {
                requestAnimationFrame(() => {
                    activeItem.focus();
                });
            }
        };

        // Initial render
        refreshList();
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
            <div class="modal-content modal-content-confirm">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <span class="modal-title-icon"><iconify-icon icon="solar:transfer-horizontal-bold"></iconify-icon></span>
                        <span class="modal-title-text">${title}</span>
                    </h2>
                    <button class="close-button close-move-modal" aria-label="Fermer"><iconify-icon icon="ph:x"></iconify-icon></button>
                </div>
                <div class="modal-body">
                    <p class="modal-instruction-text">
                        ${description}
                    </p>
                    <div class="move-class-list">
                        ${classes.map(cls => `
                            <button class="btn btn-secondary move-target-btn" data-class-id="${cls.id}">
                                <iconify-icon icon="solar:mortarboard-bold"></iconify-icon>
                                ${this._escapeHtml(cls.name)}
                                <span class="move-target-year">${cls.year || ''}</span>
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
                btn.innerHTML = '<iconify-icon icon="svg-spinners:ring-resize"></iconify-icon> Déplacement...';

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
