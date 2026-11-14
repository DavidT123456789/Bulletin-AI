/**
 * @fileoverview Sous-module du menu déroulant des classes (ClassUIManager)
 * Gère l'ouverture/fermeture du dropdown, le positionnement adaptatif, la création
 * instantanée de classe, le rendu de la liste, le filtre des classes reconstituées
 * et les indicateurs de progression.
 *
 * @module managers/class/ClassDropdown
 */

import { DOM } from '../../utils/DOM.js';
import { appState } from '../../state/State.js';
import { ClassManager } from '../ClassManager.js';
import { HistoryManager } from '../HistoryManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { SeatingChartManager } from '../SeatingChartManager.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { Utils } from '../../utils/Utils.js';

export const ClassDropdown = {
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

        if (this._isNotePopoverOpen) {
            this.closeNotePopover({ replaceNext: true });
        }

        if (this._closeDropdownTimer) {
            clearTimeout(this._closeDropdownTimer);
            this._closeDropdownTimer = null;
        }

        // [UX Mobile] Push History State
        HistoryManager.pushState('classDropdown', (options) => this.closeDropdown(options));

        this._isDropdownOpen = true;
        DOM.headerClassChip?.classList.add('active');
        DOM.headerClassChip?._tippy?.hide?.();

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
            HistoryManager.handleManualClose('classDropdown', { replaceNext: Boolean(options?.replaceNext) });
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
            this._ui?.showNotification?.(`Erreur : ${error.message}`, 'error');
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
            this._ui?.showNotification?.(`Erreur : ${error.message}`, 'error');
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
                    <iconify-icon icon="solar:mortarboard-linear"></iconify-icon>
                    <p>Aucune classe créée</p>
                    <button type="button" class="btn btn-primary btn-small" id="createFirstClassBtn">
                        <iconify-icon icon="ph:plus-bold" aria-hidden="true"></iconify-icon> Créer ma première classe
                    </button>
                </div>
            `;
            // Bind create first class button
            document.getElementById('createFirstClassBtn')?.addEventListener('click', () => {
                this.showNewClassPrompt();
            });
            FocusPanelManager.bindScrollAffordances(DOM.classDropdownList);
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
                    this._syncDropdownNoteBadge(item.id, item.classNote);
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

                const noteText = typeof item.classNote === 'string' ? item.classNote.trim() : '';
                const hasNote = Boolean(noteText);
                const noteTooltipAttr = hasNote ? ` data-tooltip="${this._formatNoteTooltip(noteText)}"` : '';

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
                            <span class="class-note-badge ${hasNote ? 'tooltip' : 'is-hidden'}" data-class-id="${item.id}"${noteTooltipAttr}><iconify-icon icon="solar:bookmark-bold"></iconify-icon></span>
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
                const noteBadge = item.querySelector('.class-note-badge');
                if (noteBadge) {
                    noteBadge.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const classId = item.dataset.classId;
                        this.closeDropdown();
                        if (classId && classId !== appState.currentClassId) {
                            await this.handleClassSwitch(classId);
                        }
                        this.openNotePopover(classId);
                    });
                }

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
        FocusPanelManager.bindScrollAffordances(DOM.classDropdownList);
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
                const hasCourse = courseInfo.status !== 'empty';
                const hasActivity = activityInfo.status !== 'empty';
                const primaryInfo = hasCourse ? courseInfo : activityInfo;
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
                if (effectiveStatus === 'locked' || effectiveStatus === 'testing') {
                    seatingBadge.className = `class-seating-badge is-${effectiveStatus}`;
                    ensureSeatingIcon('solar:streets-map-point-bold');
                    const formatPlan = (prefix, info) => {
                        const label = info.shortLabel || (info.status === 'locked' ? 'Validé' : 'En test');
                        const unplaced = info.unplaced > 0 ? ` (${info.unplaced} non placé${info.unplaced > 1 ? 's' : ''})` : '';
                        return `${prefix} : ${label}${unplaced}`;
                    };
                    const seatingTooltip = (hasCourse && hasActivity)
                        ? `${formatPlan('Cours', courseInfo)} · ${formatPlan('Activité', activityInfo)}`
                        : formatPlan(hasCourse ? 'Plan de classe' : 'Plan d\'activité', primaryInfo);
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
    }
};
