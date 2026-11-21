/**
 * @fileoverview UI Manager pour le sélecteur de classes (Façade)
 * Gère l'état partagé, la navigation inter-classes, l'affichage de l'en-tête,
 * les migrations et agrège les sous-modules spécialisés (Dropdown, Bulle Mémo,
 * Modale « Mes classes » et Modales de transfert d'élèves).
 *
 * @module managers/ClassUIManager
 */

import { DOM } from '../utils/DOM.js';
import { CONFIG } from '../config/Config.js';
import { appState, userSettings } from '../state/State.js';
import { ClassManager } from './ClassManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { detectLevelFromName, getClassSortRank, compareClassesPedagogically, sortClassesByLevel } from '../utils/LevelDetector.js';
import { CrossClassSearchManager } from './CrossClassSearchManager.js';
import { SeatingChartManager } from './SeatingChartManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { Utils } from '../utils/Utils.js';
import { SafeStorage, STORAGE_KEYS } from '../utils/SafeStorage.js';
import { TooltipsUI } from './TooltipsManager.js';
import { ClassDropdown } from './class/ClassDropdown.js';
import { ClassNotePopover } from './class/ClassNotePopover.js';
import { ClassManageModal } from './class/ClassManageModal.js';
import { ClassStudentTransferModal } from './class/ClassStudentTransferModal.js';
import { bus, EVENTS } from '../core/EventBus.js';

export const ClassUIManager = {
    _ui: null,
    _storage: null,
    _isDropdownOpen: false,
    _isNotePopoverOpen: false,
    _showVirtualClasses: SafeStorage.get(STORAGE_KEYS.SHOW_VIRTUAL_CLASSES) !== 'false',
    _originalDropdownParent: null, // Store original parent for teleportation
    _originalNotePopoverParent: null,
    _virtualAnimationTimer: null,
    _closeDropdownTimer: null,
    _closeNotePopoverTimer: null,
    _noteTargetClassId: null,
    _noteHistoryByClassId: new Map(),
    _noteTypingBurstTimer: null,

    /**
     * Initialise le ClassUIManager avec les dépendances
     */
    init(ui, storage) {
        this._ui = ui;
        this._storage = storage;
        this._bindEvents();
    },

    /**
     * Attache les event listeners pour le sélecteur de classe et la bulle Mémo
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

        // Header class note button & popover controls (Bulle Mémo)
        this._bindNotePopoverEvents();

        // Close dropdown or note popover when clicking outside (capture phase to absorb click and prevent triggering underlying cards)
        if (this._boundOutsideClick) {
            document.removeEventListener('click', this._boundOutsideClick, true);
        }
        this._boundOutsideClick = (e) => {
            const isNoteBtnClick = Boolean(DOM.headerClassNoteBtn?.contains(e.target));
            const isChipClick = Boolean(DOM.headerClassChip?.contains(e.target));

            if (this._isDropdownOpen &&
                !isChipClick &&
                !isNoteBtnClick &&
                !DOM.classDropdown?.contains(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.closeDropdown();
            }
            if (this._isNotePopoverOpen &&
                !isNoteBtnClick &&
                !isChipClick &&
                !DOM.classNotePopover?.contains(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.closeNotePopover();
            }
        };
        document.addEventListener('click', this._boundOutsideClick, true);

        // Close dropdown or note popover when scrolling outside
        if (this._boundOutsideScroll) {
            window.removeEventListener('scroll', this._boundOutsideScroll, true);
        }
        this._boundOutsideScroll = (e) => {
            if (this._isDropdownOpen && !(e.target instanceof Node && DOM.classDropdown?.contains(e.target))) {
                this.closeDropdown();
            }
            if (this._isNotePopoverOpen && !(e.target instanceof Node && DOM.classNotePopover?.contains(e.target))) {
                this.closeNotePopover();
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
            if (this._isNotePopoverOpen) {
                this._positionNotePopover();
            }
            document.querySelectorAll('.modal-body:not(.modal-body-flex):not(.import-wizard-body), .ui-tabs-content, #pickStudentsChips, #pickStudentsList, #moveModalClassList, #scStudentList').forEach(el => {
                FocusPanelManager.updateScrollAffordances(el);
            });
        };
        window.addEventListener('resize', this._boundResize, { passive: true });

        // Navigation clavier et fermeture via Échap lorsque le dropdown ou le mémo est ouvert
        document.addEventListener('keydown', (e) => {
            if (this._isNotePopoverOpen && e.key === 'Escape') {
                this.closeNotePopover();
                DOM.headerClassNoteBtn?.focus?.();
                return;
            }
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
        bus.on(EVENTS.SEATING_STATUS_CHANGED, () => {
            if (this._isDropdownOpen) {
                const classes = ClassManager.getAllClasses();
                this._updateClassProgressIndicators(classes);
            }
        });
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
            this._ui?.showNotification('Erreur lors de la suppression de la classe.', 'error');
        } finally {
            // Always refresh UI state
            this.renderClassList();
            this.updateHeaderDisplay();

            // Force refresh interactions
            AppreciationsManager.renderResults();
            this._ui?.updateStats?.();

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
            return this._mergeVirtualIntoCustomOrder(regularItems, virtualItems);
        }

        const sortDirection = userSettings.academic?.classesSortDirection || 'asc';
        return sortClassesByLevel([...regularItems, ...virtualItems], sortDirection);
    },

    /**
     * Insère les classes reconstituées dans un ordre personnalisé sans fragmenter
     * ni inverser les classes dont les groupes sources se chevauchent.
     * @private
     */
    _mergeVirtualIntoCustomOrder(regularItems, virtualItems) {
        if (virtualItems.length === 0) return regularItems;

        const indexById = new Map(regularItems.map((item, idx) => [item.id, idx]));
        const anchored = [];
        const unanchored = [];

        for (const vItem of virtualItems) {
            let minIdx = Infinity;
            let maxIdx = -1;
            for (const sourceId of vItem.sourceGroupIds || []) {
                const idx = indexById.get(sourceId);
                if (idx !== undefined) {
                    if (idx < minIdx) minIdx = idx;
                    if (idx > maxIdx) maxIdx = idx;
                }
            }

            if (maxIdx === -1) {
                unanchored.push(vItem);
                continue;
            }

            anchored.push({
                vItem,
                minIdx,
                maxIdx,
                rank: getClassSortRank(vItem.displayName || vItem.name)
            });
        }

        // Regrouper les classes reconstituées d'un même niveau dont les groupes sources se chevauchent ou se suivent
        anchored.sort((a, b) => a.minIdx - b.minIdx);

        const clusters = [];
        for (const entry of anchored) {
            const prev = clusters[clusters.length - 1];
            const sameAnchor = prev && entry.minIdx === prev.anchorIdx;
            const sameRank = prev && entry.rank < 500 && entry.rank === prev.rank;

            if (sameAnchor || (sameRank && entry.minIdx <= prev.maxIdx + 1)) {
                if (entry.maxIdx > prev.maxIdx) prev.maxIdx = entry.maxIdx;
                prev.items.push(entry.vItem);
            } else {
                clusters.push({ anchorIdx: entry.minIdx, maxIdx: entry.maxIdx, rank: entry.rank, items: [entry.vItem] });
            }
        }

        const allItems = [];
        let clusterPtr = 0;
        for (let idx = 0; idx < regularItems.length; idx++) {
            while (clusterPtr < clusters.length && clusters[clusterPtr].anchorIdx === idx) {
                const { items } = clusters[clusterPtr++];
                if (items.length > 1) {
                    items.sort((a, b) => compareClassesPedagogically(a, b, 'asc'));
                }
                allItems.push(...items);
            }
            allItems.push(regularItems[idx]);
        }

        if (unanchored.length > 0) {
            allItems.push(...unanchored);
        }
        return allItems;
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
        const selector = '.stats-container, #outputList, #seatingChartView, #empty-state-card, #statsPagination';
        const allAnimClasses = [
            'class-switch-out-down', 'class-switch-out-up',
            'class-switch-in-down', 'class-switch-in-up',
            'view-slide-out-left', 'view-slide-in-left',
            'nav-boundary-bounce'
        ];

        // Fermer le menu et la bulle mémo immédiatement au clic pour une réactivité instantanée
        this.closeDropdown();
        this.closeNotePopover();
        SeatingChartManager?._clearNavigationBoundaryBounce?.();

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
        this._ui?.updateStats?.();

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

        // Update student count & header note button
        this.updateStudentCount();
        this.syncHeaderNoteButton();
    },

    /**
     * Met à jour le compteur d'élèves dans le header ET dans le dropdown
     * Uses in-memory appState data for immediate reactivity
     */
    updateStudentCount() {
        // Update header chip via UIManager if available to preserve active filters context
        if (this._ui && this._ui.updateHeaderContext) {
            this._ui.updateHeaderContext();
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
        const totalStudents = Utils.countUniqueStudents(appState.generatedResults, allClasses);
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
            icon = 'solar:pie-chart-2-linear';
            statusClass = 'status-partial';
        }

        return { total, completed, errors, icon, statusClass };
    },

    /**
     * Échappe les caractères HTML (y compris guillemets/apostrophes pour contexte d'attribut)
     * @private
     */
    _escapeHtml(text) {
        return Utils.escapeHtml(text == null ? '' : String(text));
    },

    /**
     * Vérifie si la migration vers multi-classes est nécessaire et la propose
     */
    async checkAndOfferMigration() {
        const classes = ClassManager.getAllClasses();

        // Si pas de classes :
        if (classes.length === 0) {
            // Si première visite en cours, laisser le WelcomeModal injecter la classe démo
            if (!SafeStorage.get(CONFIG.LS_FIRST_VISIT_KEY)) {
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
            this._ui?.updateStats?.();
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
                    this._ui?.updateStats?.();
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

    ...ClassDropdown,
    ...ClassNotePopover,
    ...ClassManageModal,
    ...ClassStudentTransferModal
};
