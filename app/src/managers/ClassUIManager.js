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
import { detectLevelFromName, sortClassesByLevel } from '../utils/LevelDetector.js';
import { HistoryManager } from './HistoryManager.js';
import { ClassDashboardManager } from './ClassDashboardManager.js';
import { CrossClassSearchManager } from './CrossClassSearchManager.js';
import { SeatingChartManager } from './SeatingChartManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { StudentDataManager } from './StudentDataManager.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
import { Utils } from '../utils/Utils.js';
import { TooltipsUI } from './TooltipsManager.js';

let UI;
let StorageManager;

export const ClassUIManager = {
    _isDropdownOpen: false,
    _showVirtualClasses: localStorage.getItem('bulletin_show_virtual_classes') !== 'false',
    _originalDropdownParent: null, // Store original parent for teleportation
    _virtualAnimationTimer: null,
    _closeDropdownTimer: null,

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

        // Close dropdown when clicking outside (capture phase to absorb click and prevent triggering underlying cards)
        if (this._boundOutsideClick) {
            document.removeEventListener('click', this._boundOutsideClick, true);
        }
        this._boundOutsideClick = (e) => {
            if (this._isDropdownOpen &&
                !e.target.closest?.('.class-selector-wrapper') &&
                !DOM.classDropdown?.contains(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.closeDropdown();
            }
        };
        document.addEventListener('click', this._boundOutsideClick, true);

        // Close dropdown when scrolling outside
        if (this._boundOutsideScroll) {
            window.removeEventListener('scroll', this._boundOutsideScroll, true);
        }
        this._boundOutsideScroll = (e) => {
            if (this._isDropdownOpen && !(e.target instanceof Node && DOM.classDropdown?.contains(e.target))) {
                this.closeDropdown();
            }
        };
        window.addEventListener('scroll', this._boundOutsideScroll, { capture: true, passive: true });

        // Reposition dropdown when resizing the window while open
        if (this._boundResize) {
            window.removeEventListener('resize', this._boundResize);
        }
        this._boundResize = () => {
            if (this._isDropdownOpen) {
                this._positionDropdown();
                FocusPanelManager.updateScrollAffordances(DOM.classDropdownList);
            }
            const modalBody = document.querySelector('#classManagementModal .modal-body');
            if (modalBody) {
                FocusPanelManager.updateScrollAffordances(modalBody);
            }
            const pickChips = document.getElementById('pickStudentsChips');
            if (pickChips) FocusPanelManager.updateScrollAffordances(pickChips);
            const pickList = document.getElementById('pickStudentsList');
            if (pickList) {
                FocusPanelManager.updateScrollAffordances(pickList);
            }
        };
        window.addEventListener('resize', this._boundResize, { passive: true });

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
                const items = Array.from(DOM.classDropdownList?.querySelectorAll('.class-dropdown-item:not(.is-collapsed)') || []);
                if (items.length === 0) return;

                e.preventDefault();
                const activeEl = document.activeElement;
                const index = items.indexOf(activeEl);

                if (index === -1) {
                    const activeItem = items.find(el => el.classList.contains('active'));
                    const target = activeItem || items[0];
                    target?.focus();
                    target?.scrollIntoView?.({ block: 'nearest' });
                } else {
                    const nextIndex = e.key === 'ArrowDown'
                        ? (index + 1) % items.length
                        : (index - 1 + items.length) % items.length;
                    items[nextIndex]?.focus();
                    items[nextIndex]?.scrollIntoView?.({ block: 'nearest' });
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
     * Positionne le dropdown par rapport au chip du header sur une grille de pixels entiers
     * @private
     */
    _positionDropdown() {
        if (!DOM.classDropdown) return;

        const chipRect = DOM.headerClassChip?.getBoundingClientRect();
        DOM.classDropdown.style.position = 'fixed';
        DOM.classDropdown.style.top = `${Math.round((chipRect?.bottom || 56) + 8)}px`;
        DOM.classDropdown.style.zIndex = '9999';

        if (window.innerWidth <= 600) {
            DOM.classDropdown.style.left = '12px';
            DOM.classDropdown.style.right = '12px';
            DOM.classDropdown.style.minWidth = 'unset';
            DOM.classDropdown.style.maxWidth = 'none';
            DOM.classDropdown.style.width = 'auto';
        } else {
            const isVerticalTablet = window.innerWidth <= 768;
            DOM.classDropdown.style.left = `${Math.round(chipRect?.left || (isVerticalTablet ? 12 : 16))}px`;
            DOM.classDropdown.style.right = 'unset';
            DOM.classDropdown.style.minWidth = 'unset';
            DOM.classDropdown.style.maxWidth = 'unset';
            DOM.classDropdown.style.width = isVerticalTablet ? '320px' : '300px';
        }
    },

    /**
     * Ouvre le dropdown
     */
    openDropdown() {
        if (!DOM.classDropdown) return;

        if (this._closeDropdownTimer) {
            clearTimeout(this._closeDropdownTimer);
            this._closeDropdownTimer = null;
        }

        // [UX Mobile] Push History State
        HistoryManager.pushState('classDropdown', (options) => this.closeDropdown(options));

        this._isDropdownOpen = true;
        DOM.headerClassChip?.classList.add('active');

        // Teleport to body on all screens to escape header clipping & nested backdrop-filter rendering bug in Chromium
        if (DOM.classDropdown.parentElement !== document.body) {
            this._originalDropdownParent = DOM.classDropdown.parentElement;
            document.body.appendChild(DOM.classDropdown);
        }

        this._positionDropdown();
        DOM.classDropdown.style.display = 'block';

        // Render class list & position scroll synchronously before fading in
        this.renderClassList();

        // Focus de la classe active sans saut de scroll différé
        DOM.classDropdownList?.querySelector('.class-dropdown-item.active')?.focus({ preventScroll: true });

        // Force layout calculation at opacity: 0 before triggering entry transition
        void DOM.classDropdown.offsetWidth;
        requestAnimationFrame(() => {
            if (this._isDropdownOpen) {
                DOM.classDropdown.classList.add('visible');
            }
        });
    },

    /**
     * Ferme le dropdown
     */
    closeDropdown(options = {}) {
        if (!DOM.classDropdown) return;

        // [UX Mobile] History Cleanup
        if (!options?.causedByHistory && this._isDropdownOpen) {
            HistoryManager.handleManualClose('classDropdown');
        }

        this._isDropdownOpen = false;
        DOM.headerClassChip?.classList.remove('active');
        DOM.headerClassChip?.blur?.();
        DOM.classDropdown.classList.remove('visible');
        TooltipsUI?.cleanupTooltipsIn?.(DOM.classDropdown);

        if (this._closeDropdownTimer) {
            clearTimeout(this._closeDropdownTimer);
        }

        // Hide after animation
        this._closeDropdownTimer = setTimeout(() => {
            this._closeDropdownTimer = null;
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
     * Crée une nouvelle classe immédiatement avec un nom générique intelligent,
     * bascule vers elle et affiche la page de présentation prête à l'emploi.
     * @param {Object} [options]
     * @param {boolean} [options.autoFocusInput=false] - Si true, focalise et sélectionne le champ sur l'Empty State
     * @returns {Promise<Object|null>}
     */
    async createNewClassAndSwitch(options = { autoFocusInput: false }) {
        try {
            const currentClass = ClassManager.getCurrentClass();
            const allClasses = ClassManager.getAllClasses() ?? [];
            const hasStudents = Boolean(currentClass && (appState.generatedResults ?? []).some(r => r.classId === currentClass.id));
            const isDemo = Boolean(currentClass && ClassManager.isDemoClass?.(currentClass.id));

            // Si la classe active est déjà une "Nouvelle classe" vide (non démo), on la réutilise
            // pour éviter d'empiler des classes fantômes ("Nouvelle classe 2", "Nouvelle classe 3")
            const isGenericCurrent = Boolean(currentClass && /^Nouvelle\s+classe(\s+\d+)?$/i.test(currentClass.name?.trim() ?? ''));
            if (currentClass && !hasStudents && !isDemo && isGenericCurrent) {
                this.closeDropdown();
                if (options.autoFocusInput) {
                    this.focusEmptyStateInput();
                }
                return currentClass;
            }

            // Déterminer le nom générique
            const baseName = 'Nouvelle classe';
            let targetName = baseName;
            if (allClasses.some(c => c?.name?.toLowerCase() === baseName.toLowerCase())) {
                let counter = 2;
                while (allClasses.some(c => c?.name?.toLowerCase() === `${baseName} ${counter}`.toLowerCase())) {
                    counter++;
                }
                targetName = `${baseName} ${counter}`;
            }

            // Créer la classe et basculer vers elle
            const newClass = await this._createAndSwitchClass(targetName);

            if (options.autoFocusInput) {
                this.focusEmptyStateInput();
            }

            return newClass;
        } catch (error) {
            UI?.showNotification?.(`Erreur : ${error.message}`, 'error');
            return null;
        }
    },

    /**
     * Rétrocompatibilité : déclenche la création fluide de classe
     */
    showNewClassPrompt(options = {}) {
        return this.createNewClassAndSwitch({ autoFocusInput: false, ...options });
    },

    /**
     * Place le curseur dans le champ de nom de classe de l'Empty State et sélectionne le texte
     */
    focusEmptyStateInput() {
        setTimeout(() => {
            const input = document.getElementById('emptyStateClassInput');
            if (input) {
                input.focus();
                input.select();
            }
        }, 120);
    },

    /**
     * Déclenche une micro-animation tactile ressort sur le chip de classe du header
     */
    pulseHeaderChip() {
        if (DOM.headerClassChip) {
            DOM.headerClassChip.classList.remove('class-created-pop');
            void DOM.headerClassChip.offsetWidth;
            DOM.headerClassChip.classList.add('class-created-pop');
            setTimeout(() => {
                DOM.headerClassChip?.classList.remove('class-created-pop');
            }, 550);
        }
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
            this.pulseHeaderChip();
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

        if (!DOM.classDropdownList.dataset.scrollBound) {
            DOM.classDropdownList.dataset.scrollBound = 'true';
            DOM.classDropdownList.addEventListener('scroll', (e) => {
                FocusPanelManager.updateScrollAffordances(e.currentTarget);
            }, { passive: true });
        }

        const classes = ClassManager.getAllClasses();
        const currentClassId = appState.currentClassId;

        if (classes.length === 0) {
            DOM.classDropdownList.innerHTML = `
                <div class="class-dropdown-empty">
                    <iconify-icon icon="solar:mortarboard-linear"></iconify-icon>
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
            FocusPanelManager.updateScrollAffordances(DOM.classDropdownList);
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

        const allItems = this._getOrderedClassItems(classes, virtualClasses);
        const existingItems = Array.from(DOM.classDropdownList.querySelectorAll('.class-dropdown-item'));
        const existingHasCta = Boolean(DOM.classDropdownList.querySelector('#dropdownCreateClassCta'));
        const canUpdateInPlace = existingItems.length > 0 &&
            existingItems.length === allItems.length &&
            existingHasCta === hasOnlyDemoOrNoRealClass &&
            existingItems.every((el, idx) =>
                el.dataset.classId === allItems[idx].id &&
                el.classList.contains('class-dropdown-item--virtual') === Boolean(allItems[idx].isVirtual)
            );

        if (canUpdateInPlace) {
            allItems.forEach((item, idx) => {
                const el = existingItems[idx];
                const isActive = item.id === currentClassId;
                el.classList.toggle('active', isActive);
                el.setAttribute('aria-selected', isActive ? 'true' : 'false');

                const nameTextEl = el.querySelector('.class-name-text');
                if (nameTextEl && nameTextEl.textContent !== item.displayName) {
                    nameTextEl.textContent = item.displayName;
                }

                if (item.isVirtual) {
                    const isCollapsed = !this._showVirtualClasses;
                    el.classList.toggle('is-collapsed', isCollapsed);
                    el.setAttribute('tabindex', isCollapsed ? '-1' : '0');
                    if (isCollapsed) {
                        el.setAttribute('aria-hidden', 'true');
                    } else {
                        el.removeAttribute('aria-hidden');
                    }

                    const sourceNames = item.sourceGroupNames?.join(' & ') || '';
                    const sourcesEl = el.querySelector('.class-meta-sources');
                    if (sourcesEl) {
                        sourcesEl.setAttribute('title', `Groupes sources : ${sourceNames}`);
                    }
                    const sourcesTextEl = el.querySelector('.class-meta-sources-text');
                    if (sourcesTextEl && sourcesTextEl.textContent !== sourceNames) {
                        sourcesTextEl.textContent = sourceNames;
                    }
                    const countValEl = el.querySelector('.progress-count-value');
                    const nextCount = String(item.studentCount ?? 0);
                    if (countValEl && countValEl.textContent !== nextCount) {
                        countValEl.textContent = nextCount;
                    }
                } else {
                    const yearStr = item.year || 'Non définie';
                    const yearTextEl = el.querySelector('.class-meta-year-text');
                    if (yearTextEl && yearTextEl.textContent !== yearStr) {
                        yearTextEl.textContent = yearStr;
                    }
                }
            });
        } else {
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
                                <span class="class-name-text">${this._escapeHtml(item.displayName)}</span>
                                <span class="class-item-virtual-badge">Reconstituée</span>
                            </span>
                            <span class="class-meta">
                                <span class="class-meta-sources" title="Groupes sources : ${this._escapeHtml(sourceNames)}">
                                    <iconify-icon icon="solar:link-round-linear"></iconify-icon>
                                    <span class="class-meta-sources-text">${this._escapeHtml(sourceNames)}</span>
                                </span>
                            </span>
                        </div>
                        <div class="class-progress-badge" data-class-id="${item.id}">
                            <span class="progress-count"><iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon> <span class="progress-count-value">${item.studentCount}</span></span>
                        </div>
                    </div>
                    `;
                }

                return `
                <div class="class-dropdown-item ${item.id === currentClassId ? 'active' : ''}"
                     data-class-id="${item.id}"
                     tabindex="0"
                     role="option"
                     aria-selected="${item.id === currentClassId ? 'true' : 'false'}">
                    <div class="class-info">
                        <span class="class-name">
                            <span class="class-name-text">${this._escapeHtml(item.displayName)}</span>
                        </span>
                        <span class="class-meta">
                            <span class="class-meta-year"><iconify-icon icon="solar:calendar-linear"></iconify-icon> <span class="class-meta-year-text">${this._escapeHtml(item.year || 'Non définie')}</span></span>
                            <span class="class-seating-badge is-hidden" data-class-id="${item.id}"><iconify-icon icon="solar:streets-map-point-bold"></iconify-icon></span>
                        </span>
                    </div>
                    <div class="class-progress-badge" data-class-id="${item.id}">
                        <span class="progress-count"><iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon> <span class="progress-count-value">0</span></span>
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
                    if (classId === appState.currentClassId) {
                        this.closeDropdown();
                        return;
                    }
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
        }

        // Update progress indicators
        this._updateClassProgressIndicators(classes);
        TooltipsUI?.initTooltips?.(DOM.classDropdown);

        // Défilement automatique synchrone vers la classe active si le dropdown est ouvert
        if (this._isDropdownOpen) {
            DOM.classDropdownList?.querySelector('.class-dropdown-item.active')?.scrollIntoView?.({ block: 'nearest' });
        }
        FocusPanelManager.updateScrollAffordances(DOM.classDropdownList);
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
                    FocusPanelManager.updateScrollAffordances(DOM.classDropdownList);
                }, 280);
            }
        }

        FocusPanelManager.updateScrollAffordances(DOM.classDropdownList);

        // Nettoyer les transitionDelay inline après la fin de l'animation pour préserver la réactivité du hover
        const totalDuration = 350 + count * 35;
        clearTimeout(this._virtualAnimationTimer);
        this._virtualAnimationTimer = setTimeout(() => {
            virtualElements.forEach(el => {
                el.style.transitionDelay = '';
            });
            FocusPanelManager.updateScrollAffordances(DOM.classDropdownList);
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
            if (btn) btn.innerHTML = '<iconify-icon icon="ph:spinner-gap-bold" class="rotate-icon"></iconify-icon>';
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
     * Retourne la liste ordonnée des classes (réelles + reconstituées) telle qu'affichée dans le menu
     * @private
     */
    _getOrderedClassItems(classes = ClassManager.getAllClasses(), virtualClasses = ClassManager.getVirtualClasses()) {
        const regularItems = (classes || []).map(cls => ({
            ...cls,
            displayName: Utils.formatClassDisplayName(cls.name),
            isVirtual: false
        }));

        const virtualItems = (virtualClasses && virtualClasses.length > 0)
            ? virtualClasses.map(vClass => ({
                ...vClass,
                displayName: Utils.formatClassDisplayName(vClass.name),
                isVirtual: true
            }))
            : [];

        if (userSettings.academic?.classesCustomOrder) {
            const allItems = [...regularItems];
            if (virtualItems.length > 0) {
                virtualItems.forEach(vItem => {
                    const firstSourceIndex = allItems.findIndex(item =>
                        vItem.sourceGroupIds?.includes(item.id)
                    );
                    if (firstSourceIndex !== -1) {
                        let insertAt = firstSourceIndex + 1;
                        while (insertAt < allItems.length && vItem.sourceGroupIds?.includes(allItems[insertAt].id)) {
                            insertAt++;
                        }
                        allItems.splice(insertAt, 0, vItem);
                    } else {
                        allItems.push(vItem);
                    }
                });
            }
            return allItems;
        }

        const sortDirection = userSettings.academic?.classesSortDirection || 'asc';
        return sortClassesByLevel([...regularItems, ...virtualItems], sortDirection);
    },

    /**
     * Retourne la liste ordonnée des identifiants de classes visibles dans le menu déroulant
     * (en excluant les groupes repliés sous une classe reconstituée).
     * @private
     */
    _getVisibleOrderedClassIds() {
        const domIds = Array.from(
            DOM.classDropdownList?.querySelectorAll('.class-dropdown-item:not(.is-collapsed)') || []
        ).map(el => el.dataset.classId).filter(Boolean);

        if (domIds.length > 0 && (!appState.currentClassId || domIds.includes(appState.currentClassId))) {
            return domIds;
        }
        return this._getOrderedClassItems().map(item => item.id).filter(Boolean);
    },

    /**
     * Retourne l'identifiant de la classe adjacente (précédente: delta = -1, suivante: delta = +1)
     * selon l'ordre visible du menu des classes.
     * @param {number} delta - Direction (-1 pour classe au-dessus, +1 pour classe en dessous)
     * @returns {string|null} L'ID de la classe cible ou null si en butée
     */
    getAdjacentClassId(delta) {
        const currentId = appState.currentClassId;
        if (!currentId || (delta !== -1 && delta !== 1)) return null;

        const visibleIds = this._getVisibleOrderedClassIds();
        const currentIndex = visibleIds.indexOf(currentId);
        if (currentIndex === -1) return null;

        const targetIndex = currentIndex + delta;
        if (targetIndex < 0 || targetIndex >= visibleIds.length) return null;

        return visibleIds[targetIndex] || null;
    },

    /**
     * Bascule vers la classe adjacente (-1: précédente, +1: suivante) si elle existe.
     * @param {number} delta - Direction (-1 ou +1)
     * @returns {Promise<boolean>} true si un changement de classe a été déclenché
     */
    async switchAdjacentClass(delta) {
        if (this._isSwitchingClass) return false;
        const targetId = this.getAdjacentClassId(delta);
        if (!targetId) return false;

        this._isSwitchingClass = true;
        try {
            await this.handleClassSwitch(targetId);
            return true;
        } finally {
            this._isSwitchingClass = false;
        }
    },

    /**
     * Détermine le sens du glissement vertical selon la position de la classe cible dans la liste :
     * - 'down' (du haut vers le bas) si on va vers une classe située AU-DESSUS dans la liste
     * - 'up' (du bas vers le haut) si on va vers une classe située EN DESSOUS dans la liste
     * @private
     */
    _getClassSwitchDirection(fromClassId, toClassId) {
        if (!fromClassId || !toClassId || fromClassId === toClassId) return 'up';

        const visibleIds = this._getVisibleOrderedClassIds();
        const fromIndex = visibleIds.indexOf(fromClassId);
        const toIndex = visibleIds.indexOf(toClassId);

        if (fromIndex !== -1 && toIndex !== -1 && toIndex < fromIndex) {
            return 'down';
        }
        return 'up';
    },

    /**
     * Gère le changement de classe avec micro-glisse verticale directionnelle (sans flou GPU)
     */
    async handleClassSwitch(classId, highlightId = null) {
        if (this._classSwitchCleanupTimer) {
            clearTimeout(this._classSwitchCleanupTimer);
            this._classSwitchCleanupTimer = null;
        }

        const prevClassId = appState.currentClassId;
        const direction = this._getClassSwitchDirection(prevClassId, classId);
        const outClass = direction === 'down' ? 'class-switch-out-down' : 'class-switch-out-up';
        const inClass = direction === 'down' ? 'class-switch-in-down' : 'class-switch-in-up';
        const headerOutClass = direction === 'down' ? 'header-class-out-down' : 'header-class-out-up';
        const headerInClass = direction === 'down' ? 'header-class-in-down' : 'header-class-in-up';
        const selector = '.stats-container, #outputList, #crossClassResults.visible, .output-header, #seatingChartView, #empty-state-card, #statsPagination';
        const allAnimClasses = [
            'class-switch-out-down', 'class-switch-out-up',
            'class-switch-in-down', 'class-switch-in-up',
            'view-slide-out-left', 'view-slide-in-left'
        ];

        // Fermer le menu immédiatement au clic pour une réactivité instantanée
        this.closeDropdown();

        document.getElementById('crossClassResults')?.classList.remove(...allAnimClasses);
        const outgoingContainers = Array.from(document.querySelectorAll(selector)).filter(el => {
            el.classList.remove(...allAnimClasses);
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });

        outgoingContainers.forEach(el => {
            void el.offsetWidth;
            el.classList.add(outClass);
        });

        if (DOM.headerClassName && prevClassId !== classId) {
            DOM.headerClassName.classList.remove(
                'header-class-out-down', 'header-class-out-up',
                'header-class-in-down', 'header-class-in-up'
            );
            void DOM.headerClassName.offsetWidth;
            DOM.headerClassName.classList.add(headerOutClass);
        }

        // Phase 1 : Sortie rapide (110ms) avant remplacement des données
        await new Promise(resolve => setTimeout(resolve, 110));

        outgoingContainers.forEach(el => {
            el.classList.remove('class-switch-out-down', 'class-switch-out-up');
        });

        // Réinitialiser proprement la recherche Liste avant de charger la nouvelle classe
        CrossClassSearchManager?.clearListSearch?.({ renderList: false, immediate: true });
        SeatingChartManager?._restoreUnmodifiedClassLock?.();

        await ClassManager.switchClass(classId);
        this.updateHeaderDisplay();

        if (DOM.headerClassName && prevClassId !== classId) {
            DOM.headerClassName.classList.remove('header-class-out-down', 'header-class-out-up');
            void DOM.headerClassName.offsetWidth;
            DOM.headerClassName.classList.add(headerInClass);
        }

        // Refresh the results list with the new class data
        AppreciationsManager.renderResults(highlightId, 'new');
        UI?.updateStats?.();

        // Notify seating chart of class change
        const isVirtualSwitch = ClassManager.isVirtualClass(classId);
        const hasResults = isVirtualSwitch
            ? (appState.filteredResults || []).length > 0
            : (appState.generatedResults || []).some(r => r.classId === classId);
        SeatingChartManager.onClassChange(hasResults);
        if (!SeatingChartManager?._isActive) {
            SeatingChartManager?._focusListScrollContainer?.();
        }

        // Phase 2 : Entrée directionnelle fluide (240ms) des conteneurs visibles
        const incomingContainers = Array.from(document.querySelectorAll(selector)).filter(el => {
            el.classList.remove('class-switch-out-down', 'class-switch-out-up');
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });

        incomingContainers.forEach(el => {
            void el.offsetWidth;
            el.classList.add(inClass);
        });

        this._classSwitchCleanupTimer = setTimeout(() => {
            this._classSwitchCleanupTimer = null;
            incomingContainers.forEach(el => {
                el.classList.remove('class-switch-in-down', 'class-switch-in-up');
            });
            DOM.headerClassName?.classList.remove('header-class-in-down', 'header-class-in-up');
        }, 260);
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

        const isVirtual = currentClass ? ClassManager.isVirtualClass(currentClass.id) : false;

        if (DOM.headerClassName) {
            if (currentClass) {
                DOM.headerClassName.textContent = Utils.formatClassDisplayName(currentClass.name);
            } else {
                DOM.headerClassName.textContent = 'Nouvelle classe';
            }
        }

        // Mettre à jour l'icône du header chip selon le type de classe (en place sans recréer le Web Component)
        if (DOM.headerClassIcon) {
            const targetIcon = isVirtual ? 'solar:diploma-bold' : 'solar:users-group-rounded-linear';
            let iconEl = DOM.headerClassIcon.querySelector('iconify-icon');
            if (!iconEl) {
                iconEl = document.createElement('iconify-icon');
                DOM.headerClassIcon.textContent = '';
                DOM.headerClassIcon.appendChild(iconEl);
            }
            if (iconEl.getAttribute('icon') !== targetIcon) {
                iconEl.setAttribute('icon', targetIcon);
            }
        }

        // Afficher ou masquer le badge Classe complète dans le chip du header
        if (DOM.headerVirtualClassTag) {
            DOM.headerVirtualClassTag.style.display = isVirtual ? 'inline-flex' : 'none';
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

        // Also update dropdown counters in place (using in-memory data, not IndexedDB)
        const allClasses = ClassManager.getAllClasses();
        if (DOM.classDropdownList) {
            this._updateClassProgressIndicators(allClasses);
            const virtualClasses = ClassManager.getVirtualClasses();
            for (const vClass of virtualClasses) {
                const vCountEl = DOM.classDropdownList.querySelector(
                    `.class-progress-badge[data-class-id="${vClass.id}"] .progress-count-value`
                );
                if (vCountEl) {
                    const nextCount = String(vClass.studentCount ?? 0);
                    if (vCountEl.textContent !== nextCount) {
                        vCountEl.textContent = nextCount;
                    }
                }
            }
        }

        // UPDATE "Mes classes" title with class count & total students tooltip
        const totalStudents = appState.generatedResults?.length || 0;
        const classesCount = allClasses.length;

        const titleEl = DOM.classDropdownTitle || document.getElementById('classDropdownTitle');
        if (titleEl) {
            const countSpan = titleEl.querySelector('.class-dropdown-count');
            const nextCountText = `(${classesCount})`;
            if (countSpan) {
                if (countSpan.textContent !== nextCountText) {
                    countSpan.textContent = nextCountText;
                }
            } else {
                titleEl.innerHTML = `Mes classes <span class="class-dropdown-count">${nextCountText}</span>`;
            }
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

            // Render/update badge in place without destroying <iconify-icon>
            const countValEl = badge.querySelector('.progress-count-value');
            if (countValEl) {
                const nextCount = String(totalStudents);
                if (countValEl.textContent !== nextCount) {
                    countValEl.textContent = nextCount;
                }
            } else {
                badge.innerHTML = `<span class="progress-count"><iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon> <span class="progress-count-value">${totalStudents}</span></span>`;
            }

            if (totalStudents === 0) {
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

                if (!Utils.isPlaceholderAppreciation(Utils.getPeriodAppreciation(result, currentPeriod))) {
                    completedCount++;
                }
            });

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

            // Update seating chart indicator in place
            const seatingBadge = DOM.classDropdownList?.querySelector(
                `.class-seating-badge[data-class-id="${cls.id}"]`
            );
            if (seatingBadge && SeatingChartManager?.getClassSeatingStatus) {
                const courseInfo = SeatingChartManager.getClassSeatingStatus(cls, 'course');
                const activityInfo = SeatingChartManager.getClassSeatingStatus(cls, 'activity');
                const primaryInfo = courseInfo.status !== 'empty' ? courseInfo : activityInfo;
                const isActivityOnly = courseInfo.status === 'empty' && activityInfo.status !== 'empty';
                const planPrefix = isActivityOnly ? 'Plan d\'activité' : 'Plan de classe';
                const activityUnplacedNote = (!isActivityOnly && activityInfo.status !== 'empty' && activityInfo.unplaced > 0)
                    ? ` (${activityInfo.unplaced} non placé${activityInfo.unplaced > 1 ? 's' : ''})`
                    : '';
                const activitySuffix = (!isActivityOnly && activityInfo.status !== 'empty')
                    ? ` · Activité : ${activityInfo.shortLabel || (activityInfo.status === 'locked' ? 'Validé' : 'En test')}${activityUnplacedNote}`
                    : '';
                const effectiveStatus = (primaryInfo.status === 'testing' || activityInfo.status === 'testing')
                    ? 'testing'
                    : primaryInfo.status;

                const ensureSeatingIcon = (iconName) => {
                    let iconEl = seatingBadge.querySelector('iconify-icon');
                    if (!iconEl) {
                        iconEl = document.createElement('iconify-icon');
                        seatingBadge.textContent = '';
                        seatingBadge.appendChild(iconEl);
                    }
                    if (iconEl.getAttribute('icon') !== iconName) {
                        iconEl.setAttribute('icon', iconName);
                    }
                };

                seatingBadge.removeAttribute('title');
                if (effectiveStatus === 'locked') {
                    seatingBadge.className = 'class-seating-badge is-locked';
                    ensureSeatingIcon('solar:streets-map-point-bold');
                    const dateNote = primaryInfo.dateStr ? ` (${primaryInfo.dateStr})` : '';
                    const unplacedNote = primaryInfo.unplaced > 0 ? ` · ${primaryInfo.unplaced} non placé${primaryInfo.unplaced > 1 ? 's' : ''}` : '';
                    const seatingTooltip = `${planPrefix} : Validé${dateNote}${unplacedNote}${activitySuffix}`;
                    seatingBadge.setAttribute('data-tooltip', seatingTooltip);
                    TooltipsUI?.updateTooltip?.(seatingBadge, seatingTooltip);
                } else if (effectiveStatus === 'testing') {
                    seatingBadge.className = 'class-seating-badge is-testing';
                    ensureSeatingIcon('solar:streets-map-point-bold');
                    const dateNote = primaryInfo.dateStr ? ` (${primaryInfo.dateStr})` : '';
                    const unplacedNote = primaryInfo.unplaced > 0 ? ` · ${primaryInfo.unplaced} non placé${primaryInfo.unplaced > 1 ? 's' : ''}` : '';
                    const primaryStatusLabel = primaryInfo.status === 'locked' ? 'Validé' : 'En test';
                    const seatingTooltip = `${planPrefix} : ${primaryStatusLabel}${dateNote}${unplacedNote}${activitySuffix}`;
                    seatingBadge.setAttribute('data-tooltip', seatingTooltip);
                    TooltipsUI?.updateTooltip?.(seatingBadge, seatingTooltip);
                } else if (SeatingChartManager._isActive) {
                    seatingBadge.className = 'class-seating-badge is-empty';
                    ensureSeatingIcon('solar:streets-map-point-linear');
                    const seatingTooltip = 'Plan de classe : À faire';
                    seatingBadge.setAttribute('data-tooltip', seatingTooltip);
                    TooltipsUI?.updateTooltip?.(seatingBadge, seatingTooltip);
                } else {
                    seatingBadge.className = 'class-seating-badge is-hidden';
                    seatingBadge.removeAttribute('data-tooltip');
                    if (seatingBadge._tippy) seatingBadge._tippy.destroy();
                }
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
            if (result.errorMessage && result.errorPeriod === currentPeriod) {
                errors++;
                return;
            }

            if (!Utils.isPlaceholderAppreciation(Utils.getPeriodAppreciation(result, currentPeriod))) {
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

            // Migrations silencieuses : niveau manquant + drapeau et casse des classes d'exemple
            for (const cls of classes) {
                if (!cls.level || cls.level === '3eme') {
                    const detectedLevel = detectLevelFromName(cls.name);
                    ClassManager.updateClass(cls.id, { level: detectedLevel });
                }
                if (ClassManager.isDemoClass(cls.id)) {
                    const updates = {};
                    if (!cls.isDemo) updates.isDemo = true;
                    if (cls.name === 'Classe Exemple') updates.name = 'Classe exemple';
                    if (Object.keys(updates).length > 0) {
                        ClassManager.updateClass(cls.id, updates);
                    }
                }
            }

            this.updateHeaderDisplay();
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

        const moreWrapper = modalEl.querySelector('#classManageMoreWrapper');
        const moreBtn = modalEl.querySelector('#classManageMoreBtn');
        const moreMenu = modalEl.querySelector('#classManageMoreMenu');
        const subtitle = modalEl.querySelector('.modal-subtitle');
        const modalBody = modalEl.querySelector('.modal-body');
        const updateModalScroll = () => FocusPanelManager.updateScrollAffordances(modalBody);
        modalBody?.addEventListener('scroll', updateModalScroll, { passive: true });

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
                    let isDeleting = false;

                    row.innerHTML = `
                        <div class="delete-confirm-icon" aria-hidden="true">
                            <iconify-icon icon="solar:danger-triangle-bold"></iconify-icon>
                        </div>
                        <div class="class-management-info delete-confirm-info">
                            <span class="delete-confirm-title">Supprimer « <strong>${displayName}</strong> » ?</span>
                            <span class="delete-confirm-subtext">Ses élèves et données seront définitivement effacés.</span>
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

            const bindRowActionButtons = (row) => {
                const renameBtn = row.querySelector('.manage-rename-btn');
                const duplicateBtn = row.querySelector('.manage-duplicate-btn');
                const deleteBtn = row.querySelector('.manage-delete-btn');
                if (renameBtn) bindRenameHandler(renameBtn);
                if (duplicateBtn) bindDuplicateHandler(duplicateBtn);
                if (deleteBtn) bindDeleteHandler(deleteBtn);
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
                UI?.showNotification?.(`Classes réordonnées par niveau (${sortRangeLabel})`, 'success');
            });

            moreMenu.querySelector('#cleanEmptyClassesBtn')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                moreMenu.classList.remove('open');

                const isSingleEmpty = emptyClasses.length === 1;
                const cleanMessage = isSingleEmpty
                    ? `Supprimer définitivement la classe vide <strong>${this._escapeHtml(emptyClasses[0].name)}</strong> ? Aucun élève ni appréciation ne sera perdu.`
                    : `Supprimer définitivement les <strong>${emptyClasses.length} classes</strong> sans élèves ? Aucun élève ni appréciation ne sera perdu.`;

                const confirmed = await UI?.showCustomConfirm?.(
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
                    UI?.showNotification?.(`${count} classe${count > 1 ? 's' : ''} vide${count > 1 ? 's' : ''} supprimée${count > 1 ? 's' : ''}`, 'success');
                }
            });

            moreMenu.querySelector('#resetAllClassesBtn')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                moreMenu.classList.remove('open');

                const totalStudents = appState.generatedResults?.length || 0;
                const classLabel = `${currentClasses.length} classe${currentClasses.length > 1 ? 's' : ''}`;
                const studentPart = totalStudents > 0
                    ? ` ainsi que les <strong>${totalStudents} élève${totalStudents > 1 ? 's' : ''}</strong> associés`
                    : '';
                const confirmed = await UI?.showCustomConfirm?.(
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
                    UI?.updateStats?.();
                    refreshList();
                    UI?.showNotification?.('Toutes les classes ont été réinitialisées', 'info');
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
                const studentCount = appState.generatedResults?.length || 0;
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

                        const metaContentHtml = stats.total === 0
                            ? `
                                ${yearMetaHtml}
                                <span class="meta-item-inline meta-empty-state">
                                    <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                                    <span>Aucun élève</span>
                                </span>
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
            updateModalScroll();
        };

        // Initial render & scroll to active class
        refreshList();
        modalEl.querySelector('.class-management-item.active-switch')?.scrollIntoView?.({ block: 'nearest' });
        updateModalScroll();
    },

    /**
     * Affiche une modale pour déplacer ou copier un ou plusieurs élèves vers une autre classe / groupe
     * @param {string|Array<string>} studentIds - ID(s) des élèves concernés
     * @param {Function} [onSuccess] - Callback appelée après l'action réussie
     * @param {Object} [options] - Options facultatives ({ defaultMode: 'copy' | 'move' })
     */
    showMoveStudentsModal(studentIds, onSuccess = null, options = {}) {
        const ids = Array.isArray(studentIds) ? studentIds : [studentIds];
        if (ids.length === 0) return;

        const idSet = new Set(ids);
        const allResults = appState.generatedResults || [];
        const students = allResults.filter(r => r && idSet.has(r.id));
        if (students.length === 0) {
            UI?.showNotification('Aucun élève trouvé', 'error');
            return;
        }

        const isBulk = students.length > 1;
        const firstStudent = students[0];
        const currentClassId = firstStudent.classId;
        const allClassesAreSame = students.every(s => s.classId === currentClassId);

        let classes = ClassManager.getAllClasses().filter(c => !ClassManager.isDemoClass(c.id));
        if (allClassesAreSame) {
            classes = classes.filter(c => c.id !== currentClassId);
        }

        const classStudentCounts = new Map();
        for (const r of allResults) {
            if (r?.classId) {
                classStudentCounts.set(r.classId, (classStudentCounts.get(r.classId) || 0) + 1);
            }
        }

        const isViewingVirtualClass = ClassManager.isVirtualClass(appState.currentClassId);
        const currentClass = isViewingVirtualClass
            ? ClassManager.getClassById(appState.currentClassId)
            : ClassManager.getClassById(currentClassId);

        // Mode initial : 'copy' par défaut pour sécuriser la classe d'origine et faciliter l'affectation aux groupes
        let currentMode = options.defaultMode || 'copy';

        const getSubjectLabel = () => isBulk
            ? `<strong>${students.length} élèves</strong>`
            : `<strong>${this._escapeHtml(Utils.formatStudentName(firstStudent.nom, firstStudent.prenom, false))}</strong>`;

        const getOriginLabel = () => {
            if (!currentClass?.name) return '';
            return ` depuis <strong>${this._escapeHtml(Utils.formatClassDisplayName(currentClass.name))}</strong>`;
        };

        const getInstructionHtml = (mode) => {
            if (mode === 'copy') {
                return `Copier ${getSubjectLabel()}${getOriginLabel()} vers :`;
            }
            return `Déplacer ${getSubjectLabel()}${allClassesAreSame ? getOriginLabel() : ''} vers :`;
        };

        const getHintText = (mode) => {
            if (mode === 'copy') {
                return isBulk
                    ? 'Conserve ces élèves dans leur classe actuelle et crée une fiche vierge (photo, statuts et classe d\'origine conservés).'
                    : 'Conserve l\'élève dans sa classe actuelle et crée une fiche vierge (photo, statuts et classe d\'origine conservés).';
            }
            return isBulk
                ? 'Transfère ces élèves avec leurs notes et appréciations et les retire de leur classe actuelle.'
                : 'Transfère l\'élève avec ses notes et appréciations et le retire de sa classe actuelle.';
        };

        const modalEl = document.createElement('div');
        modalEl.className = 'modal modal-small';
        modalEl.id = 'moveStudentModal';
        modalEl.innerHTML = `
            <div class="modal-content modal-content-confirm move-student-modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <span class="modal-title-icon" id="moveModalTitleIcon"><iconify-icon icon="solar:copy-bold-duotone"></iconify-icon></span>
                        <span class="modal-title-text" id="moveModalTitleText">${isBulk ? 'Affecter ou déplacer les élèves' : 'Affecter ou déplacer l\'élève'}</span>
                    </h2>
                    <button class="close-button close-move-modal" aria-label="Fermer"><iconify-icon icon="ph:x"></iconify-icon></button>
                </div>
                <div class="modal-body">
                    <div class="move-mode-segmented" role="tablist" aria-label="Mode d'action">
                        <button type="button" class="move-mode-btn ${currentMode === 'copy' ? 'active' : ''}" data-mode="copy" role="tab" aria-selected="${currentMode === 'copy'}">
                            <iconify-icon icon="solar:copy-bold-duotone"></iconify-icon>
                            <span>Copier dans…</span>
                        </button>
                        <button type="button" class="move-mode-btn ${currentMode === 'move' ? 'active' : ''}" data-mode="move" role="tab" aria-selected="${currentMode === 'move'}">
                            <iconify-icon icon="solar:transfer-horizontal-bold"></iconify-icon>
                            <span>Déplacer vers…</span>
                        </button>
                    </div>
                    <p class="move-mode-hint" id="moveModalHintText">${getHintText(currentMode)}</p>
                    <p class="modal-instruction-text" id="moveModalInstructionText">
                        ${getInstructionHtml(currentMode)}
                    </p>
                    <div class="move-class-list" id="moveModalClassList">
                        ${classes.map(cls => {
                            const isGroup = Utils.isGroupClassName(cls.name);
                            const count = classStudentCounts.get(cls.id) || 0;
                            return `
                                <button type="button" class="btn btn-secondary move-target-btn" data-class-id="${cls.id}">
                                    <iconify-icon icon="${isGroup ? 'solar:users-group-rounded-bold' : 'solar:mortarboard-bold'}"></iconify-icon>
                                    <span class="move-target-name">${this._escapeHtml(Utils.formatClassDisplayName(cls.name))}</span>
                                    <span class="move-target-year">${count} élève${count > 1 ? 's' : ''}</span>
                                </button>
                            `;
                        }).join('')}
                    </div>
                    <div class="move-create-class-section">
                        <button type="button" class="btn btn-secondary move-create-class-toggle" id="moveCreateClassToggle" style="${classes.length === 0 ? 'display: none;' : ''}">
                            <iconify-icon icon="ph:plus-bold"></iconify-icon>
                            <span>Nouvelle classe / groupe…</span>
                        </button>
                        <div class="move-create-class-form ${classes.length === 0 ? 'open' : ''}" id="moveCreateClassForm">
                            <input type="text" class="move-create-class-input" id="moveCreateClassInput" placeholder="Nom du groupe (ex : Groupe PAD, Projet PAPD...)" maxlength="50" autocomplete="off">
                            <button type="button" class="btn btn-primary move-create-class-submit" id="moveCreateClassSubmit">
                                <iconify-icon icon="ph:check-bold"></iconify-icon>
                                <span>Créer</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('moveStudentModal')?.remove();
        document.body.appendChild(modalEl);
        UI?.openModal(modalEl);

        const closeModal = () => {
            UI?.closeModal(modalEl);
            setTimeout(() => modalEl.remove(), 300);
        };

        modalEl.querySelector('.close-move-modal')?.addEventListener('click', closeModal);
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) closeModal();
        });

        // Toggle mode (Copier / Déplacer)
        const modeBtns = modalEl.querySelectorAll('.move-mode-btn');
        const hintEl = modalEl.querySelector('#moveModalHintText');
        const instructionEl = modalEl.querySelector('#moveModalInstructionText');
        const titleIconEl = modalEl.querySelector('#moveModalTitleIcon iconify-icon');

        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                if (!mode || mode === currentMode) return;
                currentMode = mode;
                modeBtns.forEach(b => {
                    const isActive = b.dataset.mode === currentMode;
                    b.classList.toggle('active', isActive);
                    b.setAttribute('aria-selected', String(isActive));
                });
                if (hintEl) hintEl.textContent = getHintText(currentMode);
                if (instructionEl) instructionEl.innerHTML = getInstructionHtml(currentMode);
                if (titleIconEl) {
                    titleIconEl.setAttribute('icon', currentMode === 'copy' ? 'solar:copy-bold-duotone' : 'solar:transfer-horizontal-bold');
                }
            });
        });

        const executeTargetAction = async (targetClassId, triggerBtn = null) => {
            const targetClass = ClassManager.getClassById(targetClassId);
            if (!targetClass) return;

            if (triggerBtn) {
                triggerBtn.disabled = true;
                triggerBtn.innerHTML = `<iconify-icon icon="svg-spinners:ring-resize"></iconify-icon> ${currentMode === 'copy' ? 'Copie...' : 'Déplacement...'}`;
            }

            const displayTarget = Utils.formatClassDisplayName(targetClass.name);
            let notificationText = '';
            let notificationType = 'success';

            if (currentMode === 'copy') {
                const { copiedCount, skippedCount } = StudentDataManager.copyStudentsToClass(ids, targetClassId);
                if (copiedCount > 0) {
                    notificationText = isBulk
                        ? `${copiedCount} élève${copiedCount > 1 ? 's' : ''} copié${copiedCount > 1 ? 's' : ''} dans « ${displayTarget} »${skippedCount > 0 ? ` (${skippedCount} déjà présent${skippedCount > 1 ? 's' : ''})` : ''}`
                        : `${Utils.formatStudentName(firstStudent.nom, firstStudent.prenom, false)} copié dans « ${displayTarget} »`;
                } else if (skippedCount > 0) {
                    notificationText = isBulk
                        ? `Ces élèves sont déjà présents dans « ${displayTarget} »`
                        : `${Utils.formatStudentName(firstStudent.nom, firstStudent.prenom, false)} est déjà dans « ${displayTarget} »`;
                    notificationType = 'info';
                }
            } else {
                let movedCount = 0;
                const now = Date.now();
                students.forEach(student => {
                    student.classId = targetClassId;
                    student._lastModified = now;

                    const indexInFiltered = appState.filteredResults.findIndex(r => r.id === student.id);
                    if (indexInFiltered !== -1 && allClassesAreSame && appState.currentClassId === currentClassId) {
                        appState.filteredResults.splice(indexInFiltered, 1);
                    }
                    movedCount++;
                });

                notificationText = isBulk
                    ? `${movedCount} élèves déplacés vers « ${displayTarget} »`
                    : `${Utils.formatStudentName(firstStudent.nom, firstStudent.prenom, false)} déplacé vers « ${displayTarget} »`;
            }

            await ClassManager._filterResultsByClass(appState.currentClassId);
            await StorageManager?.saveAppState();

            this.updateStudentCount();
            this.renderClassList();
            AppreciationsManager.renderResults();
            UI?.updateStats?.();

            closeModal();

            if (notificationText) {
                UI?.showNotification(notificationText, notificationType);
            }
            window.dispatchEvent(new CustomEvent('studentsUpdated'));
            if (onSuccess) onSuccess();
        };

        // Sélection d'une classe existante
        modalEl.querySelectorAll('.move-target-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                executeTargetAction(btn.dataset.classId, btn);
            });
        });

        // Création rapide d'une nouvelle classe / groupe à la volée
        const createToggleBtn = modalEl.querySelector('#moveCreateClassToggle');
        const createForm = modalEl.querySelector('#moveCreateClassForm');
        const createInput = modalEl.querySelector('#moveCreateClassInput');
        const createSubmitBtn = modalEl.querySelector('#moveCreateClassSubmit');

        if (classes.length === 0 && createInput) {
            setTimeout(() => createInput.focus(), 80);
        }

        createToggleBtn?.addEventListener('click', () => {
            createToggleBtn.style.display = 'none';
            createForm?.classList.add('open');
            setTimeout(() => createInput?.focus(), 50);
        });

        const handleCreateAndApply = async () => {
            const rawName = (createInput?.value || '').trim();
            if (!rawName) {
                UI?.showNotification('Veuillez saisir un nom de classe ou de groupe', 'warning');
                createInput?.focus();
                return;
            }
            const newClass = ClassManager.createClass(rawName);
            await executeTargetAction(newClass.id, createSubmitBtn);
        };

        createSubmitBtn?.addEventListener('click', handleCreateAndApply);
        createInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleCreateAndApply();
            }
        });
    },

    /**
     * Affiche la modale permettant de piocher des élèves parmi les classes existantes
     * pour les ajouter (copier) dans la classe/groupe actif.
     * @param {string|null} [targetClassId=null] - ID de la classe cible (par défaut classe active)
     */
    showPickExistingStudentsModal(targetClassId = null) {
        const effectiveTargetId = targetClassId || appState.currentClassId || userSettings.academic.currentClassId;
        const targetClass = ClassManager.getClassById(effectiveTargetId);
        if (!targetClass || ClassManager.isVirtualClass(effectiveTargetId)) {
            UI?.showNotification('Veuillez d\'abord sélectionner une classe ou un groupe.', 'warning');
            return;
        }

        const allResults = appState.generatedResults || [];
        const physicalClasses = ClassManager.getAllClasses().filter(
            c => c.id !== effectiveTargetId && !ClassManager.isDemoClass(c.id)
        );
        const classMap = new Map(physicalClasses.map(c => [c.id, c]));
        const virtualClasses = ClassManager.getVirtualClasses();
        const virtualClassIds = new Set(virtualClasses.map(vc => vc.id));

        // Élèves déjà présents dans la classe cible
        const targetKeys = new Set();
        for (const r of allResults) {
            if (r?.classId === effectiveTargetId) {
                targetKeys.add(Utils.normalizeName(r.nom, r.prenom));
            }
        }

        // Consolider la liste unique des élèves disponibles dans les autres classes
        const candidatesMap = new Map();

        allResults.forEach(r => {
            if (!r?.classId || r.classId === effectiveTargetId) return;
            const sourceClass = classMap.get(r.classId);
            if (!sourceClass) return;

            const key = Utils.normalizeName(r.nom, r.prenom);
            if (!key) return;

            const explicitOrigin = (r.studentData?.classe || r.classe || r.originClass || '').trim();
            const normOrigin = explicitOrigin ? Utils.normalizeClassName(explicitOrigin) : '';
            const rawVirtualId = normOrigin ? `virtual_${normOrigin}` : null;
            const virtualId = rawVirtualId && virtualClassIds.has(rawVirtualId) ? rawVirtualId : null;

            const existing = candidatesMap.get(key);
            if (!existing) {
                const badgeRaw = explicitOrigin || sourceClass.name || '';
                const statuses = Array.isArray(r.studentData?.statuses)
                    ? r.studentData.statuses.filter(s => typeof s === 'string' && !/^(Nouveau|Départ)\b/i.test(s.trim()))
                    : [];

                candidatesMap.set(key, {
                    key,
                    id: r.id,
                    nom: r.nom || '',
                    prenom: r.prenom || '',
                    studentPhoto: r.studentPhoto || r.studentData?.photo || null,
                    originBadge: badgeRaw ? Utils.formatClassDisplayName(badgeRaw) : '',
                    statuses,
                    isCopiedProfile: Boolean(r.isCopiedProfile),
                    classIds: new Set([sourceClass.id]),
                    virtualIds: new Set(virtualId ? [virtualId] : []),
                    alreadyInTarget: targetKeys.has(key)
                });
            } else {
                existing.classIds.add(sourceClass.id);
                if (virtualId) existing.virtualIds.add(virtualId);
                // Préférer l'ID d'une fiche principale et récupérer photo / statuts s'ils manquent
                if (existing.isCopiedProfile && !r.isCopiedProfile) {
                    existing.id = r.id;
                    existing.isCopiedProfile = false;
                }
                if (!existing.studentPhoto?.data && (r.studentPhoto?.data || r.studentData?.photo?.data)) {
                    existing.studentPhoto = r.studentPhoto || r.studentData?.photo;
                }
                if (!existing.originBadge && explicitOrigin) {
                    existing.originBadge = Utils.formatClassDisplayName(explicitOrigin);
                }
            }
        });

        const candidates = Array.from(candidatesMap.values()).sort((a, b) => {
            const cmpNom = (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' });
            if (cmpNom !== 0) return cmpNom;
            return (a.prenom || '').localeCompare(b.prenom || '', 'fr', { sensitivity: 'base' });
        });

        if (candidates.length === 0) {
            UI?.showNotification('Aucun élève disponible dans vos autres classes.', 'info');
            return;
        }

        // Pré-calcul en une passe : compteurs par filtre et index de recherche normalisé sans accents
        const classCounts = new Map();
        const virtualCounts = new Map();
        for (const cand of candidates) {
            cand.searchHaystack = `${cand.nom} ${cand.prenom} ${cand.originBadge}`
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
            cand.classIds.forEach(cid => classCounts.set(cid, (classCounts.get(cid) || 0) + 1));
            cand.virtualIds.forEach(vid => virtualCounts.set(vid, (virtualCounts.get(vid) || 0) + 1));
        }

        const filterChips = [
            { id: 'all', label: 'Toutes', count: candidates.length, isVirtual: false },
            ...virtualClasses
                .filter(vc => virtualCounts.has(vc.id))
                .map(vc => ({
                    id: vc.id,
                    label: Utils.formatClassDisplayName(vc.name),
                    count: virtualCounts.get(vc.id),
                    isVirtual: true
                })),
            ...physicalClasses
                .filter(c => classCounts.has(c.id))
                .map(c => ({
                    id: c.id,
                    label: Utils.formatClassDisplayName(c.name),
                    count: classCounts.get(c.id),
                    isVirtual: false
                }))
        ];

        const selectedIds = new Set();
        let activeFilterId = 'all';
        let searchQuery = '';

        const targetDisplayName = Utils.formatClassDisplayName(targetClass.name || 'la classe');

        const modalEl = document.createElement('div');
        modalEl.className = 'modal';
        modalEl.id = 'pickExistingStudentsModal';
        modalEl.innerHTML = `
            <div class="modal-content pick-students-modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <span class="modal-title-icon"><iconify-icon icon="solar:users-group-two-rounded-bold-duotone"></iconify-icon></span>
                        <span class="modal-title-text">Piocher dans mes classes</span>
                    </h2>
                    <button class="close-button close-pick-modal" aria-label="Fermer"><iconify-icon icon="ph:x"></iconify-icon></button>
                </div>
                <div class="modal-body pick-students-modal-body">
                    <div class="pick-students-toolbar">
                        <div class="pick-students-search-box">
                            <iconify-icon icon="solar:magnifer-linear" class="pick-search-icon"></iconify-icon>
                            <input type="text" id="pickStudentsSearchInput" class="custom-input pick-students-search-input" placeholder="Rechercher un élève ou une classe d'origine..." autocomplete="off">
                        </div>
                        <div class="pick-students-chips" id="pickStudentsChips" role="tablist" aria-label="Filtrer par classe">
                            ${filterChips.map(chip => `
                                <button type="button" class="pick-class-chip ${chip.id === 'all' ? 'active' : ''}" data-filter-id="${chip.id}" role="tab" aria-selected="${chip.id === 'all'}">
                                    ${chip.isVirtual ? '<iconify-icon icon="solar:users-group-two-rounded-linear"></iconify-icon>' : ''}
                                    <span>${this._escapeHtml(chip.label)}</span>
                                    <span class="pick-chip-count">${chip.count}</span>
                                </button>
                            `).join('')}
                        </div>
                        <div class="pick-students-selection-bar">
                            <span class="pick-visible-count" id="pickVisibleCount">${candidates.length} élève${candidates.length > 1 ? 's' : ''}</span>
                            <button type="button" class="pick-select-all-btn" id="pickSelectAllBtn">
                                <iconify-icon icon="solar:checklist-minimalistic-linear"></iconify-icon>
                                <span>Tout cocher</span>
                            </button>
                        </div>
                    </div>
                    <div class="pick-students-list" id="pickStudentsList" role="listbox" aria-multiselectable="true"></div>
                </div>
                <div class="modal-footer pick-students-modal-footer">
                    <button type="button" class="btn btn-secondary close-pick-modal-cancel">Annuler</button>
                    <button type="button" class="btn btn-primary" id="confirmPickStudentsBtn" disabled>
                        <iconify-icon icon="solar:user-plus-bold"></iconify-icon>
                        <span id="confirmPickStudentsLabel">Sélectionnez des élèves</span>
                    </button>
                </div>
            </div>
        `;

        document.getElementById('pickExistingStudentsModal')?.remove();
        document.body.appendChild(modalEl);
        UI?.openModal(modalEl);

        const closeModal = () => {
            UI?.closeModal(modalEl);
            setTimeout(() => modalEl.remove(), 300);
        };

        modalEl.querySelector('.close-pick-modal')?.addEventListener('click', closeModal);
        modalEl.querySelector('.close-pick-modal-cancel')?.addEventListener('click', closeModal);
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) closeModal();
        });

        const listEl = modalEl.querySelector('#pickStudentsList');
        const chipsEl = modalEl.querySelector('#pickStudentsChips');
        const chipBtns = modalEl.querySelectorAll('.pick-class-chip');
        const visibleCountEl = modalEl.querySelector('#pickVisibleCount');
        const selectAllBtn = modalEl.querySelector('#pickSelectAllBtn');
        const confirmBtn = modalEl.querySelector('#confirmPickStudentsBtn');
        const confirmLabel = modalEl.querySelector('#confirmPickStudentsLabel');
        const searchInput = modalEl.querySelector('#pickStudentsSearchInput');

        const getVisibleCandidates = () => {
            const normQuery = searchQuery.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return candidates.filter(c => {
                if (activeFilterId !== 'all' && !c.classIds.has(activeFilterId) && !c.virtualIds.has(activeFilterId)) {
                    return false;
                }
                if (normQuery && !c.searchHaystack.includes(normQuery)) {
                    return false;
                }
                return true;
            });
        };

        const updateSelectionUI = (visibleCandidates) => {
            const selectableVisible = visibleCandidates.filter(c => !c.alreadyInTarget);
            const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every(c => selectedIds.has(c.id));

            if (visibleCountEl) {
                visibleCountEl.textContent = `${visibleCandidates.length} élève${visibleCandidates.length > 1 ? 's' : ''}`;
            }

            if (selectAllBtn) {
                selectAllBtn.disabled = selectableVisible.length === 0;
                const span = selectAllBtn.querySelector('span');
                if (span) span.textContent = allVisibleSelected ? 'Tout décocher' : 'Tout cocher';
            }

            const count = selectedIds.size;
            if (confirmBtn && confirmLabel) {
                confirmBtn.disabled = count === 0;
                confirmLabel.textContent = count === 0
                    ? 'Sélectionnez des élèves'
                    : `Ajouter ${count} élève${count > 1 ? 's' : ''} à ${targetDisplayName}`;
            }
        };

        // Mise à jour ciblée sur place sans destruction/recréation du DOM (zéro flash image/icône)
        const syncRowSelectionDOM = (row, isSelected) => {
            if (!row) return;
            row.classList.toggle('selected', isSelected);
            row.setAttribute('aria-selected', String(isSelected));
        };

        const renderList = () => {
            const visible = getVisibleCandidates();
            updateSelectionUI(visible);

            if (!listEl) return;
            if (visible.length === 0) {
                listEl.innerHTML = `
                    <div class="pick-students-empty">
                        <iconify-icon icon="solar:user-speak-rounded-linear"></iconify-icon>
                        <p>Aucun élève ne correspond à ce filtre.</p>
                    </div>
                `;
                FocusPanelManager.updateScrollAffordances(listEl);
                return;
            }

            const trimmedQuery = searchQuery.trim();
            listEl.innerHTML = visible.map(cand => {
                const isSelected = selectedIds.has(cand.id);
                const isPresent = cand.alreadyInTarget;
                const avatarHtml = StudentPhotoManager.getAvatarHTML(cand, 'sm', false);
                const nameHtml = Utils.formatStudentName(cand.nom, cand.prenom, true, trimmedQuery, cand.originBadge);
                const statusesHtml = cand.statuses.length > 0
                    ? `<div class="pick-student-statuses">${cand.statuses.map(st => {
                        const info = Utils.getStatusBadgeInfo(st);
                        return `<span class="${info.className} tag-badge--sm">${this._escapeHtml(info.label)}</span>`;
                    }).join('')}</div>`
                    : '';

                return `
                    <div class="pick-student-row ${isSelected ? 'selected' : ''} ${isPresent ? 'already-present' : ''}"
                         data-student-id="${cand.id}"
                         role="option"
                         aria-selected="${isSelected || isPresent}"
                         tabindex="${isPresent ? '-1' : '0'}">
                        <span class="pick-student-checkbox" aria-hidden="true">
                            <svg viewBox="0 0 12 12" fill="none">
                                <path d="M2.5 6.2L5 8.7L9.5 3.5" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                        <div class="student-identity-wrapper">
                            ${avatarHtml}
                            <span class="student-nom-prenom">${nameHtml}</span>
                        </div>
                        ${statusesHtml}
                        ${isPresent ? '<span class="pick-student-present-tag">Déjà présent</span>' : ''}
                    </div>
                `;
            }).join('');
            FocusPanelManager.updateScrollAffordances(listEl);
        };

        // Événement clic sur une ligne élève : bascule sur place sans re-rendre la liste
        listEl?.addEventListener('click', (e) => {
            const row = e.target.closest('.pick-student-row');
            if (!row || row.classList.contains('already-present')) return;
            const id = row.dataset.studentId;
            if (!id) return;

            const willSelect = !selectedIds.has(id);
            if (willSelect) {
                selectedIds.add(id);
            } else {
                selectedIds.delete(id);
            }
            syncRowSelectionDOM(row, willSelect);
            updateSelectionUI(getVisibleCandidates());
        });

        listEl?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                const row = e.target.closest('.pick-student-row');
                if (row && !row.classList.contains('already-present')) {
                    e.preventDefault();
                    row.click();
                }
            }
        });

        // Défilement horizontal fluide à la molette sur la barre de filtres sans scrollbar native
        chipsEl?.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0 && chipsEl.scrollWidth > chipsEl.clientWidth) {
                e.preventDefault();
                chipsEl.scrollLeft += e.deltaY;
            }
        }, { passive: false });

        // Filtres par classe
        chipBtns.forEach(chip => {
            chip.addEventListener('click', () => {
                activeFilterId = chip.dataset.filterId || 'all';
                chipBtns.forEach(c => {
                    const isActive = c.dataset.filterId === activeFilterId;
                    c.classList.toggle('active', isActive);
                    c.setAttribute('aria-selected', String(isActive));
                });
                if (activeFilterId === 'all') {
                    chipsEl?.scrollTo?.({ left: 0, behavior: 'smooth' });
                } else {
                    chip.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                }
                renderList();
            });
        });

        // Recherche instantanée
        searchInput?.addEventListener('input', () => {
            searchQuery = searchInput.value || '';
            renderList();
        });

        // Tout cocher / Tout décocher (sur place sur les élèves visibles)
        selectAllBtn?.addEventListener('click', () => {
            const visibleAll = getVisibleCandidates();
            const selectable = visibleAll.filter(c => !c.alreadyInTarget);
            if (selectable.length === 0) return;
            const allSelected = selectable.every(c => selectedIds.has(c.id));
            const targetState = !allSelected;
            selectable.forEach(c => {
                if (targetState) selectedIds.add(c.id);
                else selectedIds.delete(c.id);
            });
            listEl?.querySelectorAll('.pick-student-row:not(.already-present)').forEach(row => {
                const id = row.dataset.studentId;
                if (id) syncRowSelectionDOM(row, selectedIds.has(id));
            });
            updateSelectionUI(visibleAll);
        });

        // Validation finale
        confirmBtn?.addEventListener('click', async () => {
            if (selectedIds.size === 0) return;
            confirmBtn.disabled = true;

            const { copiedStudents, copiedCount } = StudentDataManager.copyStudentsToClass(
                Array.from(selectedIds),
                effectiveTargetId
            );

            await ClassManager._filterResultsByClass(appState.currentClassId);
            await StorageManager?.saveAppState();

            this.updateStudentCount();
            this.renderClassList();

            import('./ListViewManager.js').then(({ ListViewManager }) => {
                ListViewManager?.prepareImportReveal?.({
                    newIds: copiedStudents.map(s => s.id),
                    updatedIds: []
                });
                AppreciationsManager.renderResults();
                UI?.updateStats?.();
            }).catch(() => {
                AppreciationsManager.renderResults();
                UI?.updateStats?.();
            });

            closeModal();

            if (copiedCount > 0) {
                UI?.showNotification(
                    `${copiedCount} élève${copiedCount > 1 ? 's' : ''} ajouté${copiedCount > 1 ? 's' : ''} à « ${targetDisplayName} »`,
                    'success'
                );
            }
            window.dispatchEvent(new CustomEvent('studentsUpdated'));
        });

        renderList();
        FocusPanelManager.bindScrollAffordances(chipsEl);
        FocusPanelManager.bindScrollAffordances(listEl);
        setTimeout(() => searchInput?.focus(), 80);
    }
};
