/**
 * @fileoverview UI Manager pour le sélecteur de classes
 * Gère l'affichage du dropdown, le rendu de la liste des classes, et les interactions utilisateur.
 * 
 * @module managers/ClassUIManager
 */

import { DOM } from '../utils/DOM.js';
import { CONFIG } from '../config/Config.js';
import { appState, userSettings } from '../state/State.js';
import { ClassManager } from './ClassManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { detectLevelFromName } from '../utils/LevelDetector.js';
import { HistoryManager } from './HistoryManager.js';
import { ClassDashboardManager } from './ClassDashboardManager.js';
import { SeatingChartManager } from './SeatingChartManager.js';
import { Utils } from '../utils/Utils.js';
import { TooltipsUI } from './TooltipsManager.js';

let UI;
let StorageManager;

export const ClassUIManager = {
    _isDropdownOpen: false,
    _showVirtualClasses: localStorage.getItem('bulletin_show_virtual_classes') !== 'false',
    _originalDropdownParent: null, // Store original parent for teleportation
    _virtualAnimationTimer: null,

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

        // Demo toolbar quick create button
        DOM.demoToolbarCreateBtn?.addEventListener('click', (e) => {
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
            if (this._isDropdownOpen && 
                !e.target.closest('.class-selector-wrapper') && 
                !DOM.classDropdown?.contains(e.target)) {
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

        // Mise à jour réactive des pastilles de plan de classe lors d'un changement de statut
        window.addEventListener('seating-chart:status-changed', () => {
            if (this._isDropdownOpen) {
                const classes = ClassManager.getAllClasses();
                this._updateClassProgressIndicators(classes);
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
            DOM.classDropdown.style.minWidth = 'unset';
            DOM.classDropdown.style.maxWidth = 'unset';
            DOM.classDropdown.style.width = '300px';
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
        DOM.headerClassChip?.blur?.();
        DOM.classDropdown.classList.remove('visible');
        TooltipsUI?.cleanupTooltipsIn?.(DOM.classDropdown);

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
        if (!this._isDropdownOpen) {
            this.openDropdown();
        }
        if (!DOM.classDropdownList) return;

        // Vérifier si l'input existe déjà
        const existingInput = DOM.classDropdownList.querySelector('.inline-create-form');
        if (existingInput) {
            existingInput.querySelector('input')?.focus();
            return;
        }

        // Créer le formulaire inline
        const formHtml = `
            <form class="inline-create-form class-dropdown-item" action="javascript:void(0)" autocomplete="off">
                <input type="text" class="inline-class-input custom-input" 
                       placeholder="Classe (ex. 6ème A)..." 
                       autocomplete="off"
                       autocorrect="off"
                       autocapitalize="off"
                       spellcheck="false"
                       data-lpignore="true"
                       data-1p-ignore="true"
                       data-form-type="other"
                       maxlength="50"
                       name="dropdown_school_class_title">
                <div class="inline-create-actions" style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
                    <button type="button" class="inline-create-btn" disabled title="Valider">
                        <iconify-icon icon="ph:check"></iconify-icon>
                    </button>
                    <button type="button" class="inline-cancel-btn" title="Annuler">
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
     * Crée une classe et bascule vers elle avec transition fluide
     * @private
     */
    async _createAndSwitchClass(className, level = null) {
        try {
            const newClass = ClassManager.createClass(className, null, null, level);
            this.closeDropdown();
            await this.handleClassSwitch(newClass.id);
            this.renderClassList();

            // Rétroaction tactile micro-ressort sur la puce de classe du header
            if (DOM.headerClassChip) {
                DOM.headerClassChip.classList.remove('class-created-pop');
                if (DOM.headerClassChip.offsetWidth !== undefined) {
                    void DOM.headerClassChip.offsetWidth;
                }
                DOM.headerClassChip.classList.add('class-created-pop');
                setTimeout(() => {
                    DOM.headerClassChip?.classList.remove('class-created-pop');
                }, 550);
            }
            return newClass;
        } catch (error) {
            UI?.showNotification?.(`Erreur : ${error.message}`, 'error');
            return null;
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

        const virtualClasses = ClassManager.getVirtualClasses();
        const hasVirtualClasses = virtualClasses.length > 0;

        // Pastille de filtre compacte dans l'en-tête (à côté du titre)
        const toggleBtn = DOM.toggleVirtualClassesBtn || document.getElementById('toggleVirtualClassesBtn');
        if (toggleBtn) {
            if (hasVirtualClasses) {
                toggleBtn.style.display = 'inline-flex';
                toggleBtn.classList.toggle('active', this._showVirtualClasses);
                toggleBtn.setAttribute('aria-pressed', this._showVirtualClasses ? 'true' : 'false');
                const countEl = toggleBtn.querySelector('.filter-count');
                if (countEl) countEl.textContent = virtualClasses.length;
                const newTooltip = this._showVirtualClasses
                    ? `Masquer les ${virtualClasses.length} classes reconstituées`
                    : `Afficher les ${virtualClasses.length} classes reconstituées`;
                toggleBtn.setAttribute('data-tooltip', newTooltip);
                TooltipsUI?.updateTooltip?.(toggleBtn, newTooltip);
            } else {
                toggleBtn.style.display = 'none';
            }

            if (!toggleBtn.dataset.bound) {
                toggleBtn.dataset.bound = 'true';
                toggleBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const willShow = !this._showVirtualClasses;
                    this._showVirtualClasses = willShow;
                    localStorage.setItem('bulletin_show_virtual_classes', willShow ? 'true' : 'false');

                    toggleBtn.classList.toggle('active', willShow);
                    toggleBtn.setAttribute('aria-pressed', willShow ? 'true' : 'false');
                    const vClasses = ClassManager.getVirtualClasses();
                    const newTooltip = willShow
                        ? `Masquer les ${vClasses.length} classes reconstituées`
                        : `Afficher les ${vClasses.length} classes reconstituées`;
                    toggleBtn.setAttribute('data-tooltip', newTooltip);
                    TooltipsUI?.updateTooltip?.(toggleBtn, newTooltip);

                    // Si on masque les classes reconstituées alors que la classe courante en est une :
                    // On bascule automatiquement sur son premier groupe source ou la première classe réelle
                    const currentClass = ClassManager.getCurrentClass();
                    if (!willShow && currentClass?.isVirtual) {
                        const fallbackId = currentClass.sourceGroupIds?.[0] || ClassManager.getAllClasses()[0]?.id;
                        if (fallbackId) {
                            await this.handleClassSwitch(fallbackId);
                            return;
                        }
                    }

                    this._animateVirtualClassesToggle(willShow);
                });
            }
        }

        if (DOM.classDropdownVirtualSubbar) {
            DOM.classDropdownVirtualSubbar.style.display = 'none';
            DOM.classDropdownVirtualSubbar.innerHTML = '';
        }

        const hasOnlyDemoOrNoRealClass = !classes.some(c => !ClassManager.isDemoClass(c.id));
        const ctaBtnHtml = hasOnlyDemoOrNoRealClass ? `
            <button type="button" class="class-dropdown-create-btn" id="dropdownCreateClassCta">
                <iconify-icon icon="solar:add-circle-bold"></iconify-icon>
                <span>Créer ma classe</span>
            </button>
        ` : '';

        // Fusion des classes et des classes reconstituées dans l'ordre alphabétique naturel
        const regularItems = classes.map(cls => ({
            ...cls,
            displayName: Utils.formatClassDisplayName(cls.name),
            isVirtual: false
        }));

        const virtualItems = hasVirtualClasses
            ? virtualClasses.map(vClass => ({
                ...vClass,
                displayName: Utils.formatClassDisplayName(vClass.name),
                isVirtual: true
            }))
            : [];

        const allItems = [...regularItems, ...virtualItems].sort((a, b) =>
            a.displayName.localeCompare(b.displayName, undefined, { numeric: true, sensitivity: 'base' })
        );

        const classItemsHtml = allItems.map(item => {
            if (item.isVirtual) {
                const isCollapsed = !this._showVirtualClasses;
                const sourceNames = item.sourceGroupNames?.join(' & ') || '';
                return `
                <div class="class-dropdown-item class-dropdown-item--virtual ${isCollapsed ? 'is-collapsed' : ''} ${item.id === currentClassId ? 'active' : ''}" 
                     data-class-id="${item.id}"
                     tabindex="${isCollapsed ? '-1' : '0'}"
                     role="option"
                     aria-selected="${item.id === currentClassId ? 'true' : 'false'}"
                     ${isCollapsed ? 'aria-hidden="true"' : ''}>
                    <div class="class-info">
                        <span class="class-name">
                            ${this._escapeHtml(item.displayName)}
                            <span class="class-item-virtual-badge">Reconstituée</span>
                        </span>
                        <span class="class-meta">
                            <span class="class-meta-sources" title="Groupes sources : ${this._escapeHtml(sourceNames)}">
                                <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                                <span>${this._escapeHtml(sourceNames)}</span>
                            </span>
                        </span>
                    </div>
                    <div class="class-progress-badge" data-class-id="${item.id}">
                        <span class="progress-count">${item.studentCount} él.</span>
                    </div>
                </div>
                `;
            }

            const isDemo = ClassManager.isDemoClass(item.id);
            const demoBadgeHtml = isDemo ? '<span class="class-item-demo-badge">Démo</span>' : '';
            return `
            <div class="class-dropdown-item ${item.id === currentClassId ? 'active' : ''}" 
                 data-class-id="${item.id}"
                 tabindex="0"
                 role="option"
                 aria-selected="${item.id === currentClassId ? 'true' : 'false'}">
                <div class="class-info">
                    <span class="class-name">
                        ${this._escapeHtml(item.displayName)}
                        ${demoBadgeHtml}
                    </span>
                    <span class="class-meta">
                        <span class="class-meta-year"><iconify-icon icon="solar:calendar-linear"></iconify-icon> ${item.year || 'Non définie'}</span>
                        <span class="class-seating-badge is-hidden" data-class-id="${item.id}"></span>
                    </span>
                </div>
                <div class="class-progress-badge" data-class-id="${item.id}">
                    <span class="progress-loader"></span>
                </div>
            </div>
            `;
        }).join('');

        DOM.classDropdownList.innerHTML = ctaBtnHtml + classItemsHtml;

        // Bind dropdown create class CTA
        document.getElementById('dropdownCreateClassCta')?.addEventListener('click', () => {
            this.showNewClassPrompt();
        });

        // Bind click and keyboard events on class items
        DOM.classDropdownList.querySelectorAll('.class-dropdown-item').forEach(item => {
            const selectClass = async () => {
                if (item.classList.contains('is-collapsed')) return;
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
        TooltipsUI?.initTooltips?.();

        // Défilement automatique vers la classe active si le dropdown est ouvert
        if (this._isDropdownOpen) {
            requestAnimationFrame(() => {
                DOM.classDropdownList?.querySelector('.class-dropdown-item.active')?.scrollIntoView({ block: 'nearest' });
            });
        }
    },

    /**
     * Anime le déploiement ou le rangement des classes reconstituées dans le menu déroulant
     * @param {boolean} willShow - Vrai pour déploiement, faux pour repli/rangement
     */
    _animateVirtualClassesToggle(willShow) {
        if (!DOM.classDropdownList) return;

        const virtualElements = Array.from(DOM.classDropdownList.querySelectorAll('.class-dropdown-item--virtual'));
        if (virtualElements.length === 0) {
            this.renderClassList();
            return;
        }

        const count = virtualElements.length;

        if (willShow) {
            virtualElements.forEach((el, index) => {
                el.style.transitionDelay = `${index * 35}ms`;
                el.classList.remove('is-collapsed');
                el.setAttribute('tabindex', '0');
                el.removeAttribute('aria-hidden');
            });

            // Smart Scroll contextuel : Si la première classe reconstituée est hors du champ visuel, défiler en douceur
            const firstVirtual = virtualElements[0];
            if (firstVirtual && DOM.classDropdownList) {
                const list = DOM.classDropdownList;
                const isOutOfView = firstVirtual.offsetTop < list.scrollTop || (firstVirtual.offsetTop + 40) > (list.scrollTop + list.clientHeight);
                if (isOutOfView) {
                    firstVirtual.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
                }
            }
        } else {
            virtualElements.forEach((el, index) => {
                const delay = (count - 1 - index) * 25;
                el.style.transitionDelay = `${delay}ms`;
                el.classList.add('is-collapsed');
                el.setAttribute('tabindex', '-1');
                el.setAttribute('aria-hidden', 'true');
            });

            // Smart Scroll contextuel : S'assurer que la classe active reste bien dans le champ visuel après le repli
            const activeItem = DOM.classDropdownList?.querySelector('.class-dropdown-item.active:not(.is-collapsed)');
            if (activeItem) {
                setTimeout(() => {
                    activeItem.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
                }, 280);
            }
        }

        // Nettoyer les transitionDelay inline après la fin de l'animation pour préserver la réactivité du hover
        const totalDuration = 350 + count * 35;
        clearTimeout(this._virtualAnimationTimer);
        this._virtualAnimationTimer = setTimeout(() => {
            virtualElements.forEach(el => {
                el.style.transitionDelay = '';
            });
        }, totalDuration);
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

            // Si toutes les classes ont été supprimées, recréer immédiatement une "Nouvelle classe"
            const remainingClasses = ClassManager.getAllClasses();
            if (remainingClasses.length === 0) {
                const freshClass = ClassManager.createClass('Nouvelle classe');
                await ClassManager.switchClass(freshClass.id);
            }
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
        const containersToAnimate = Array.from(
            document.querySelectorAll('.stats-container, #outputList, .output-header, #seatingChartView, #empty-state-card')
        ).filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });

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
        const isVirtualSwitch = ClassManager.isVirtualClass(classId);
        const hasResults = isVirtualSwitch
            ? (appState.filteredResults || []).length > 0
            : (appState.generatedResults || []).some(r => r.classId === classId);
        SeatingChartManager.onClassChange(hasResults);

        // Si l'état vide est affiché pour cette classe, déclencher l'apparition fluide en cascade
        if (DOM.emptyStateCard && DOM.emptyStateCard.style.display !== 'none') {
            DOM.emptyStateCard.classList.remove('card-refresh-animation');
            DOM.emptyStateCard.classList.remove('empty-state-entrance');
            if (DOM.emptyStateCard.offsetWidth !== undefined) {
                void DOM.emptyStateCard.offsetWidth;
            }
            DOM.emptyStateCard.classList.add('empty-state-entrance');
            setTimeout(() => {
                DOM.emptyStateCard?.classList.remove('empty-state-entrance');
            }, 600);
        }

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
        let currentClass = ClassManager.getCurrentClass();
        const allClasses = ClassManager.getAllClasses();

        if (!currentClass && allClasses.length > 0) {
            currentClass = allClasses[0];
            appState.currentClassId = currentClass.id;
            userSettings.academic.currentClassId = currentClass.id;
        }

        const isDemo = currentClass ? ClassManager.isDemoClass(currentClass.id) : false;
        const isVirtual = currentClass ? ClassManager.isVirtualClass(currentClass.id) : false;

        if (DOM.headerClassName) {
            if (currentClass) {
                DOM.headerClassName.textContent = Utils.formatClassDisplayName(currentClass.name);
            } else {
                DOM.headerClassName.textContent = 'Nouvelle classe';
            }
        }

        // Mettre à jour l'icône du header chip selon le type de classe
        if (DOM.headerClassIcon) {
            DOM.headerClassIcon.innerHTML = isVirtual
                ? '<iconify-icon icon="solar:diploma-bold"></iconify-icon>'
                : '<iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>';
        }

        // Afficher ou masquer le badge Démo dans le chip du header
        if (DOM.headerClassTag) {
            DOM.headerClassTag.style.display = isDemo ? 'inline-flex' : 'none';
        }

        // Afficher ou masquer le badge Classe complète dans le chip du header
        if (DOM.headerVirtualClassTag) {
            DOM.headerVirtualClassTag.style.display = isVirtual ? 'inline-flex' : 'none';
        }

        // Afficher ou masquer la micro-pastille contextuelle dans la toolbar
        if (DOM.demoToolbarPill) {
            DOM.demoToolbarPill.style.display = isDemo ? 'inline-flex' : 'none';
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

        // UPDATE "Mes classes" title with class count & total students tooltip
        const totalStudents = appState.generatedResults?.length || 0;
        const classesCount = ClassManager.getAllClasses().length;

        const titleEl = DOM.classDropdownTitle || document.getElementById('classDropdownTitle');
        if (titleEl) {
            titleEl.innerHTML = `Mes classes <span class="class-dropdown-count">(${classesCount})</span>`;
            titleEl.classList.add('tooltip');
            titleEl.removeAttribute('title');
            const totalTooltip = `Total : ${totalStudents} élève${totalStudents > 1 ? 's' : ''}`;
            titleEl.setAttribute('data-tooltip', totalTooltip);
            TooltipsUI?.updateTooltip?.(titleEl, totalTooltip);
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
                badge.innerHTML = `<span class="progress-count">0 él.</span>`;
                badge.removeAttribute('title');
                badge.setAttribute('data-tooltip', 'Aucun élève');
                badge.dataset.status = 'empty';
                TooltipsUI?.updateTooltip?.(badge, 'Aucun élève');
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
            badge.innerHTML = `<span class="progress-count">${totalStudents} él.</span>`;

            // Set tooltip and status for potential CSS styling
            let tooltipText = '';
            if (errorCount > 0) {
                tooltipText = `${totalStudents} élève(s) – ${errorCount} erreur(s)`;
                badge.dataset.status = 'error';
            } else if (completedCount === totalStudents && totalStudents > 0) {
                tooltipText = `${totalStudents} élève(s) – appréciations OK`;
                badge.dataset.status = 'complete';
            } else if (completedCount > 0) {
                tooltipText = `${completedCount}/${totalStudents} appréciations générées`;
                badge.dataset.status = 'partial';
            } else {
                tooltipText = `${totalStudents} élève(s)`;
                badge.dataset.status = 'pending';
            }
            badge.removeAttribute('title');
            badge.setAttribute('data-tooltip', tooltipText);
            TooltipsUI?.updateTooltip?.(badge, tooltipText);

            // Update seating chart indicator
            const seatingBadge = DOM.classDropdownList?.querySelector(
                `.class-seating-badge[data-class-id="${cls.id}"]`
            );
            if (seatingBadge && SeatingChartManager?.getClassSeatingStatus) {
                const seatingInfo = SeatingChartManager.getClassSeatingStatus(cls);
                seatingBadge.removeAttribute('title');
                if (seatingInfo.status === 'locked') {
                    seatingBadge.className = 'class-seating-badge is-locked';
                    seatingBadge.innerHTML = `<iconify-icon icon="solar:streets-map-point-bold"></iconify-icon>`;
                    const dateNote = seatingInfo.dateStr ? ` (${seatingInfo.dateStr})` : '';
                    const unplacedNote = seatingInfo.unplaced > 0 ? ` · ${seatingInfo.unplaced} non placé${seatingInfo.unplaced > 1 ? 's' : ''}` : '';
                    const seatingTooltip = `Plan de classe : Validé${dateNote}${unplacedNote}`;
                    seatingBadge.setAttribute('data-tooltip', seatingTooltip);
                    TooltipsUI?.updateTooltip?.(seatingBadge, seatingTooltip);
                } else if (seatingInfo.status === 'testing') {
                    seatingBadge.className = 'class-seating-badge is-testing';
                    seatingBadge.innerHTML = `<iconify-icon icon="solar:streets-map-point-bold"></iconify-icon>`;
                    const dateNote = seatingInfo.dateStr ? ` (${seatingInfo.dateStr})` : '';
                    const unplacedNote = seatingInfo.unplaced > 0 ? ` · ${seatingInfo.unplaced} non placé${seatingInfo.unplaced > 1 ? 's' : ''}` : '';
                    const seatingTooltip = `Plan de classe : En test${dateNote}${unplacedNote}`;
                    seatingBadge.setAttribute('data-tooltip', seatingTooltip);
                    TooltipsUI?.updateTooltip?.(seatingBadge, seatingTooltip);
                } else if (SeatingChartManager._isActive) {
                    seatingBadge.className = 'class-seating-badge is-empty';
                    seatingBadge.innerHTML = `<iconify-icon icon="solar:streets-map-point-linear"></iconify-icon>`;
                    const seatingTooltip = 'Plan de classe : À faire';
                    seatingBadge.setAttribute('data-tooltip', seatingTooltip);
                    TooltipsUI?.updateTooltip?.(seatingBadge, seatingTooltip);
                } else {
                    seatingBadge.className = 'class-seating-badge is-hidden';
                    seatingBadge.innerHTML = '';
                    seatingBadge.removeAttribute('data-tooltip');
                    if (seatingBadge._tippy) seatingBadge._tippy.destroy();
                }
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

        // Si pas de classes :
        if (classes.length === 0) {
            // Si première visite en cours, laisser le WelcomeModal injecter la classe démo
            if (!localStorage.getItem(CONFIG.LS_FIRST_VISIT_KEY)) {
                return;
            }

            const hasResults = appState.generatedResults?.length > 0;

            if (hasResults) {
                // Migration automatique silencieuse vers "Ma Classe"
                await ClassManager.migrateToMultiClass();
            } else {
                // Créer automatiquement "Nouvelle classe" pour garantir une classe active
                const defaultClass = ClassManager.createClass('Nouvelle classe');
                await ClassManager.switchClass(defaultClass.id);
            }
            this.updateHeaderDisplay();
            this.renderClassList();
            AppreciationsManager.renderResults();
            UI?.updateStats?.();
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
                if (!cls.level || cls.level === '3eme') {
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
        const existingModal = document.getElementById('classManagementModal');
        if (existingModal) {
            existingModal.remove();
        }

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
                            <span class="modal-subtitle">${classes.length} classe${classes.length > 1 ? 's' : ''} • ${appState.generatedResults?.length || 0} élève${(appState.generatedResults?.length || 0) > 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div class="modal-header-actions">
                        <button class="btn btn-small add-class-modal-btn" id="addClassFromModalBtn" data-tooltip="Créer une nouvelle classe">
                            <iconify-icon icon="solar:add-linear"></iconify-icon> <span>Nouvelle classe</span>
                        </button>
                        <div class="modal-header-actions-divider" aria-hidden="true"></div>
                        <div class="action-dropdown" id="classManageMoreWrapper" style="position: relative;">
                            <button type="button" class="btn-icon-small tooltip" id="classManageMoreBtn" data-tooltip="Options" aria-label="Options des classes">
                                <iconify-icon icon="solar:menu-dots-bold"></iconify-icon>
                            </button>
                            <div class="action-dropdown-menu" id="classManageMoreMenu" style="right: 0; min-width: 250px; width: max-content; white-space: nowrap;"></div>
                        </div>
                        <button class="close-button close-manage-modal" aria-label="Fermer"><iconify-icon icon="ph:x"></iconify-icon></button>
                    </div>
                </div>
                <div class="modal-body">
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

        const closeModal = () => {
            UI?.closeModal(modalEl);
            cleanupGhost();
            setTimeout(() => modalEl.remove(), 300);
        };

        modalEl.querySelector('.close-manage-modal')?.addEventListener('click', closeModal);
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) {
                closeModal();
            } else if (!e.target.closest('#classManageMoreWrapper')) {
                modalEl.querySelector('#classManageMoreMenu')?.classList.remove('open');
            }
        });

        // More options dropdown toggle
        const moreBtn = modalEl.querySelector('#classManageMoreBtn');
        const moreMenu = modalEl.querySelector('#classManageMoreMenu');
        moreBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            moreMenu?.classList.toggle('open');
        });

        // Add new class button in modal - inline row inside grouped list
        const addClassBtn = modalEl.querySelector('#addClassFromModalBtn');
        addClassBtn?.addEventListener('click', () => {
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
                        <input type="text" class="inline-field-input new-class-input custom-input" 
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
                        <button class="inline-action-btn confirm create-class-confirm" data-tooltip="Confirmer (Entrée)" aria-label="Confirmer (Entrée)" disabled>
                            <iconify-icon icon="ph:check"></iconify-icon>
                        </button>
                        <button class="inline-action-btn cancel create-class-cancel" data-tooltip="Annuler (Échap)" aria-label="Annuler (Échap)">
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

            const row = modalEl.querySelector('.creating-class-row');
            if (!row) return;
            const input = row.querySelector('.new-class-input');
            const confirmBtn = row.querySelector('.create-class-confirm');
            const cancelBtn = row.querySelector('.create-class-cancel');

            UI?.initTooltips?.();
            input.focus();

            const removeRow = () => {
                row.style.animation = 'slideUpCollapseRow 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards';
                setTimeout(() => {
                    row.remove();
                    if (emptyEl && !modalEl.querySelector('.class-management-item')) {
                        emptyEl.style.display = '';
                    }
                }, 200);
            };

            input.oninput = () => {
                confirmBtn.disabled = input.value.trim().length === 0;
            };

            input.onkeydown = (e) => {
                if (e.key === 'Enter' && input.value.trim()) {
                    e.preventDefault();
                    confirmBtn.click();
                } else if (e.key === 'Escape') {
                    removeRow();
                }
            };

            cancelBtn.onclick = removeRow;

            confirmBtn.onclick = async () => {
                const className = input.value.trim();
                if (!className) return;

                confirmBtn.disabled = true;
                input.disabled = true;
                confirmBtn.innerHTML = '<iconify-icon icon="svg-spinners:ring-resize"></iconify-icon>';

                try {
                    const newClass = await this._createAndSwitchClass(className);
                    if (newClass) {
                        confirmBtn.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon>';
                        confirmBtn.style.color = 'var(--success-color)';
                        row.style.animation = 'slideUpCollapseRow 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards';
                        setTimeout(() => {
                            row.remove();
                            refreshList(newClass.id);
                        }, 200);
                    } else {
                        confirmBtn.disabled = false;
                        input.disabled = false;
                        confirmBtn.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon>';
                    }
                } catch {
                    confirmBtn.disabled = false;
                    input.disabled = false;
                    confirmBtn.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon>';
                }
            };
        });

        // Event delegation and direct bindings inside the list
        const bindListEvents = () => {
            const list = modalEl.querySelector('.class-management-list');
            if (!list) return;

            // Bind Row Click (Switch Class without closing modal)
            list.addEventListener('click', async (e) => {
                const item = e.target.closest('.class-management-item');
                if (!item || item.classList.contains('editing')) return;

                if (e.target.closest('.class-management-actions') || e.target.closest('.class-drag-handle')) {
                    return;
                }

                const classId = item.dataset.classId;
                if (classId && classId !== appState.currentClassId) {
                    modalEl.querySelectorAll('.class-management-item').forEach(i => i.classList.remove('active-switch'));
                    item.classList.add('active-switch');
                    await this.handleClassSwitch(classId);
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

                    // Fermer tout autre renommage en cours
                    const activeRenaming = list.querySelector('.class-management-item.renaming');
                    if (activeRenaming && activeRenaming !== row) {
                        const activeCancelBtn = activeRenaming.querySelector('.cancel-rename-btn');
                        if (activeCancelBtn) activeCancelBtn.click();
                    }

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
                        <input type="text" class="inline-field-input in-situ-rename-input custom-input" 
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
                        <button class="inline-action-btn confirm save-rename-btn" data-tooltip="Confirmer (Entrée)" aria-label="Confirmer (Entrée)" disabled>
                            <iconify-icon icon="ph:check"></iconify-icon>
                        </button>
                        <button class="inline-action-btn cancel cancel-rename-btn" data-tooltip="Annuler (Échap)" aria-label="Annuler (Échap)">
                            <iconify-icon icon="ph:x"></iconify-icon>
                        </button>
                    `;

                    UI?.initTooltips?.();

                    const input = row.querySelector('.in-situ-rename-input');
                    const saveBtn = row.querySelector('.save-rename-btn');
                    const cancelBtn = row.querySelector('.cancel-rename-btn');

                    input.focus();
                    input.select();

                    input.oninput = () => {
                        const val = input.value.trim();
                        saveBtn.disabled = val.length === 0 || val === cls.name;
                    };

                    const restore = () => {
                        row.innerHTML = originalContent;
                        row.classList.remove('editing', 'renaming');
                        row.setAttribute('draggable', 'true');
                        row.setAttribute('tabindex', '0');
                        const newRenameBtn = row.querySelector('.manage-rename-btn');
                        const newDuplicateBtn = row.querySelector('.manage-duplicate-btn');
                        const newDeleteBtn = row.querySelector('.manage-delete-btn');
                        if (newRenameBtn) bindRenameHandler(newRenameBtn);
                        if (newDuplicateBtn) bindDuplicateHandler(newDuplicateBtn);
                        if (newDeleteBtn) bindDeleteHandler(newDeleteBtn);
                        UI?.initTooltips?.();
                    };

                    const save = () => {
                        const newName = input.value.trim();
                        if (newName && newName !== cls.name) {
                            ClassManager.updateClass(classId, { name: newName });
                            UI?.showNotification(`Classe renommée en "${newName}"`, 'success');
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
                            if (!saveBtn.disabled) save();
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

                    // Fermer tout autre renommage en cours
                    const activeRenaming = list.querySelector('.class-management-item.renaming');
                    if (activeRenaming && activeRenaming !== row) {
                        const activeCancelBtn = activeRenaming.querySelector('.cancel-rename-btn');
                        if (activeCancelBtn) activeCancelBtn.click();
                    }

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
                    row.removeAttribute('tabindex');

                    row.querySelector('.cancel-delete-btn').onclick = () => {
                        row.innerHTML = originalContent;
                        row.classList.remove('editing');
                        row.setAttribute('tabindex', '0');
                        const newDeleteBtn = row.querySelector('.manage-delete-btn');
                        if (newDeleteBtn) bindDeleteHandler(newDeleteBtn);
                        const newRenameBtn = row.querySelector('.manage-rename-btn');
                        if (newRenameBtn) bindRenameHandler(newRenameBtn);
                        const newDuplicateBtn = row.querySelector('.manage-duplicate-btn');
                        if (newDuplicateBtn) bindDuplicateHandler(newDuplicateBtn);
                        UI?.initTooltips?.();
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
                        const duplicatedClass = await ClassManager.duplicateClass(classId);

                        this.updateHeaderDisplay();
                        this.renderClassList();
                        this.updateStudentCount();
                        refreshList(duplicatedClass?.id);
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
        const refreshList = (highlightClassId = null) => {
            const currentClasses = ClassManager.getAllClasses();

            const subtitle = modalEl.querySelector('.modal-subtitle');
            if (subtitle) {
                const studentCount = appState.generatedResults?.length || 0;
                subtitle.textContent = `${currentClasses.length} classe${currentClasses.length > 1 ? 's' : ''} • ${studentCount} élève${studentCount > 1 ? 's' : ''}`;
            }

            // Options supplémentaires dans le header
            const moreMenu = modalEl.querySelector('#classManageMoreMenu');
            const moreWrapper = modalEl.querySelector('#classManageMoreWrapper');
            if (moreMenu) {
                const allResults = appState.generatedResults || [];
                const emptyClasses = currentClasses.filter(c => !allResults.some(r => r.classId === c.id));

                if (moreWrapper) {
                    moreWrapper.style.display = currentClasses.length > 0 ? '' : 'none';
                }

                let menuHtml = '';
                if (emptyClasses.length > 0) {
                    menuHtml += `
                        <button type="button" class="action-dropdown-item" id="cleanEmptyClassesBtn">
                            <iconify-icon icon="solar:broom-linear"></iconify-icon>
                            <span>Nettoyer les classes vides (${emptyClasses.length})</span>
                        </button>
                    `;
                }

                if (currentClasses.length > 0) {
                    menuHtml += `
                        <button type="button" class="action-dropdown-item danger" id="resetAllClassesBtn">
                            <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                            <span>Supprimer toutes les classes...</span>
                        </button>
                    `;
                }

                moreMenu.innerHTML = menuHtml;

                moreMenu.querySelector('#cleanEmptyClassesBtn')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    moreMenu.classList.remove('open');

                    const confirmed = await UI?.showCustomConfirm?.(
                        `Supprimer définitivement les ${emptyClasses.length} classe${emptyClasses.length > 1 ? 's' : ''} vides ?`,
                        null,
                        null,
                        {
                            title: 'Nettoyer les classes vides ?',
                            confirmText: 'Nettoyer',
                            cancelText: 'Annuler',
                            isDanger: true,
                            detailsHtml: `
                                <p style="margin-bottom:8px;">Classes sans élèves concernées :</p>
                                <ul style="margin-left:20px; margin-bottom:10px; line-height:1.6;">
                                    ${emptyClasses.map(c => `<li><strong>${this._escapeHtml(c.name)}</strong> (0 élève)</li>`).join('')}
                                </ul>
                                <p style="color:var(--text-tertiary); font-size:0.9em;">Aucun élève ni appréciation ne sera perdu.</p>
                            `
                        }
                    );

                    if (confirmed) {
                        const count = await ClassManager.deleteEmptyClasses();
                        this.renderClassList();
                        this.updateHeaderDisplay();
                        refreshList();
                        UI?.showNotification?.(`${count} classe${count > 1 ? 's' : ''} vide${count > 1 ? 's' : ''} supprimée${count > 1 ? 's' : ''}`, 'success');
                    }
                });

                moreMenu.querySelector('#resetAllClassesBtn')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    moreMenu.classList.remove('open');

                    const totalStudents = appState.generatedResults?.length || 0;
                    const confirmed = await UI?.showCustomConfirm?.(
                        `Cette action est irréversible et supprimera l'ensemble de vos classes ainsi que leurs élèves.`,
                        null,
                        null,
                        {
                            title: 'Supprimer toutes les classes ?',
                            confirmText: 'Tout supprimer',
                            cancelText: 'Annuler',
                            isDanger: true,
                            detailsHtml: `
                                <p style="margin-bottom:8px;">Cette action supprimera :</p>
                                <ul style="margin-left:20px; margin-bottom:12px; line-height:1.6;">
                                    <li>Les <strong>${currentClasses.length} classes</strong> existantes</li>
                                    <li>Les <strong>${totalStudents} élèves</strong> et leurs données de scolarité</li>
                                    <li>Toutes les appréciations générées associées</li>
                                </ul>
                                <p style="color:var(--success-color); display:flex; align-items:center; gap:6px; font-weight:500;">
                                    <iconify-icon icon="solar:shield-check-linear" style="font-size:16px;"></iconify-icon>
                                    <span>Vos clés API, prompts et réglages resteront intacts.</span>
                                </p>
                            `
                        }
                    );

                    if (confirmed) {
                        await ClassManager.resetAllClasses();
                        this.renderClassList();
                        this.updateHeaderDisplay();
                        AppreciationsManager.renderResults();
                        UI?.updateStats?.();
                        refreshList();
                        UI?.showNotification?.('Toutes les classes ont été réinitialisées', 'info');
                    }
                });
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
                        } else {
                            averageBadge = `<div class="class-stat-badge no-data" data-tooltip="Pas de moyenne disponible"><span class="stat-value">--/20</span></div>`;
                        }

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
                                        <span class="meta-item-inline" data-tooltip="Année scolaire">
                                            <iconify-icon icon="solar:calendar-linear"></iconify-icon>
                                            <span>${cls.year || '2025-2026'}</span>
                                        </span>
                                        <span class="meta-separator">•</span>
                                        <span class="meta-item-inline" data-tooltip="Nombre d'élèves">
                                            <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                                            <span>${stats.total} élève${stats.total > 1 ? 's' : ''}</span>
                                        </span>
                                        <span class="meta-separator">•</span>
                                        <span class="meta-item-inline ${stats.statusClass}" data-tooltip="Appréciations complétées (Trimestre actif)">
                                            <iconify-icon icon="${stats.icon}"></iconify-icon>
                                            <span>${stats.completed}/${stats.total}</span>
                                        </span>
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
            UI?.initTooltips?.();

            if (highlightClassId) {
                const newItem = modalEl.querySelector(`.class-management-item[data-class-id="${highlightClassId}"]`);
                if (newItem) {
                    newItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    setTimeout(() => {
                        newItem.classList.remove('class-item-just-created');
                    }, 800);
                }
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
            : `Déplacer ${Utils.formatStudentName(firstStudent.nom, firstStudent.prenom, true)} ${allClassesAreSame ? `depuis <strong>${this._escapeHtml(currentClass?.name || 'Class')}</strong>` : ''} vers :`;

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
                    : `${Utils.formatStudentName(firstStudent.nom, firstStudent.prenom, false)} déplacé vers "${targetClass?.name}"`;

                UI?.showNotification(notificationText, 'success');

                // Callback for caller (e.g. to clear selections)
                if (onSuccess) onSuccess();
            });
        });
    }
};
