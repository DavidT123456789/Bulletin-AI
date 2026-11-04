/**
 * @fileoverview List View Events
 * Handles all DOM event listeners (click, keyboard, contextmenu, touch long-press) for the List View
 */

import { appState } from '../../state/State.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { FocusPanelStatus } from '../FocusPanelStatus.js';
import { ListViewRenderer } from './ListViewRenderer.js';
import { UI } from '../UIManager.js';
import { HistoryManager } from '../HistoryManager.js';
import { ListSelectionManager } from './ListSelectionManager.js';
import { EventHandlersManager } from '../EventHandlersManager.js';
import { AppreciationsManager } from '../AppreciationsManager.js';
import { ExportManager } from '../ExportManager.js';
import { MassImportManager } from '../MassImportManager.js';
import { StorageManager } from '../StorageManager.js';
import { ResultsUIManager } from '../ResultsUIManager.js';
import { ClassDashboardManager } from '../ClassDashboardManager.js';
import { ClassUIManager } from '../ClassUIManager.js';

export const ListViewEvents = {

    state: {
        abortController: null,
        activeDocClickListener: null,
        activeKeydownListener: null
    },

    callbacks: {
        copySingleAppreciation: () => { },
        bulkReset: () => { },
        deleteStudent: () => { },
        toggleAppreciationColumn: () => { },
        handleSelectionInteraction: () => { },
        clearSelections: () => { },
        handleBulkAction: () => { },
        toggleSelectVisible: () => { },
        renderList: () => { },
        updateHeaderSortIcons: () => { }
    },

    init(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    },

    /**
         * Attache les event listeners aux éléments de la liste
         * @param {HTMLElement} listContainer - Le conteneur spécifique de la liste
         * @private
         */
    attachEventListeners(listContainer) {
        if (!listContainer) return;

        // Abort previous controller to prevent listener accumulation across fresh renders or container reuse
        if (this.state.abortController) {
            this.state.abortController.abort();
        }
        if (listContainer._eventsAbortController) {
            listContainer._eventsAbortController.abort();
        }
        const abortController = new AbortController();
        this.state.abortController = abortController;
        listContainer._eventsAbortController = abortController;
        const { signal } = abortController;

        // Sort headers click (exclude appreciation toggle which has its own handler)
        listContainer.querySelectorAll('.sortable-header:not(.appreciation-toggle-header)').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.header-action-trigger')) return;

                e.stopPropagation();
                EventHandlersManager.handleHeaderSortClick(header);
            }, { signal });
        });

        // Horizontal mouse wheel scroll for status badges in compact view
        listContainer.addEventListener('wheel', (e) => {
            const badgesContainer = e.target.closest('.status-badges-container');
            if (badgesContainer && badgesContainer.scrollWidth > badgesContainer.clientWidth) {
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                    e.preventDefault();
                    badgesContainer.scrollLeft += e.deltaY;
                }
            }
        }, { passive: false, signal });

        // Generate Button (pending appreciations, or cancel active generation)
        const generateBtn = listContainer.querySelector('#generateBtnInline');
        if (generateBtn) {
            generateBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (generateBtn.classList.contains('loading') && MassImportManager.massImportAbortController) {
                    MassImportManager.cancelImport();
                    return;
                }
                if (generateBtn.classList.contains('disabled') || MassImportManager.massImportAbortController) return;
                await MassImportManager.generateAllPending();
            }, { signal });
        }

        // Update Button (dirty/error appreciations, or cancel active update)
        const updateBtn = listContainer.querySelector('#updateBtnInline');
        if (updateBtn) {
            updateBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (updateBtn.classList.contains('loading') && MassImportManager.massImportAbortController) {
                    MassImportManager.cancelImport();
                    return;
                }
                if (updateBtn.classList.contains('disabled') || MassImportManager.massImportAbortController) return;
                await ResultsUIManager.regenerateDirty();
            }, { signal });
        }

        const MENU_SELECTOR = '.action-dropdown-menu, .global-actions-dropdown-menu';
        const OPEN_MENU_SELECTOR = '.action-dropdown-menu.open, .global-actions-dropdown-menu.open';

        // Close any open menus
        const closeAllMenus = (options = {}) => {
            const openMenus = listContainer.querySelectorAll(OPEN_MENU_SELECTOR);
            if (openMenus.length === 0) return;

            openMenus.forEach(menu => {
                menu.classList.remove('open');

                const dropdown = menu.closest('.action-dropdown, .global-actions-dropdown');
                if (dropdown) {
                    dropdown.classList.remove('open', 'dropup');
                    const btn = dropdown.querySelector('.btn-action-menu, .btn-action-menu-header');
                    btn?.blur?.();
                    btn?.setAttribute('aria-expanded', 'false');
                }

                if (menu.dataset.closeTimeout) {
                    clearTimeout(parseInt(menu.dataset.closeTimeout));
                }

                // DELAY CLEANUP: Wait for CSS transition (200ms) before resetting styles
                const timeoutId = setTimeout(() => {
                    if (!menu.classList.contains('open')) {
                        menu.style.position = '';
                        menu.style.top = '';
                        menu.style.left = '';
                        menu.style.right = '';
                        menu.style.width = '';
                        menu.style.zIndex = '';
                        menu.style.maxHeight = '';
                    }
                    delete menu.dataset.closeTimeout;
                }, 200);

                menu.dataset.closeTimeout = timeoutId.toString();
            });

            if (!options?.causedByHistory && HistoryManager.isOpen('listActionMenu')) {
                HistoryManager.handleManualClose('listActionMenu');
            }
        };

        // Shared helper to activate a dropdown menu, constrain its height to the viewport, and push history state
        const activateMenu = (menu, dropdown, triggerBtn, availableSpace) => {
            if (menu.dataset.closeTimeout) {
                clearTimeout(parseInt(menu.dataset.closeTimeout));
                delete menu.dataset.closeTimeout;
            }
            menu.style.maxHeight = availableSpace > 120 ? `${Math.floor(availableSpace)}px` : '';
            menu.scrollTop = 0;
            menu.classList.add('open');
            dropdown?.classList.add('open');
            triggerBtn?.setAttribute('aria-expanded', 'true');
            HistoryManager.pushState('listActionMenu', (opts) => closeAllMenus(opts));
        };

        // Open a row actions menu anchored to its 3-dots button (auto dropup near the viewport bottom)
        const openRowMenu = (menuBtn) => {
            const dropdown = menuBtn.closest('.action-dropdown');
            const menu = dropdown?.querySelector('.action-dropdown-menu');
            if (!menu) return;

            // CRITICAL: Explicitly clear inline styles to ensure default positioning (relative to button)
            // This fixes the case where menu was previously opened via context menu (absolute/fixed position)
            menu.style.position = '';
            menu.style.top = '';
            menu.style.left = '';
            menu.style.right = '';
            menu.style.width = '';
            menu.style.zIndex = '';

            // Inversion automatique vers le haut si trop proche du bas de l'écran
            const rect = menuBtn.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom - 16;
            const spaceAbove = rect.top - 72;
            const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
            dropdown.classList.toggle('dropup', openUp);

            activateMenu(menu, dropdown, menuBtn, openUp ? spaceAbove : spaceBelow);
        };

        // Close open menus on scroll (outside the menu itself, including mobile touch gestures inside the menu)
        let isTouchingMenu = false;
        listContainer.addEventListener('touchstart', (e) => {
            isTouchingMenu = Boolean(e.target?.closest?.(MENU_SELECTOR));
        }, { capture: true, passive: true, signal });
        const clearTouchMenu = () => { isTouchingMenu = false; };
        listContainer.addEventListener('touchend', clearTouchMenu, { capture: true, passive: true, signal });
        listContainer.addEventListener('touchcancel', clearTouchMenu, { capture: true, passive: true, signal });

        const handleScrollDismiss = (e) => {
            if (isTouchingMenu || e.target?.closest?.(MENU_SELECTOR)) {
                return;
            }
            if (listContainer.querySelector(OPEN_MENU_SELECTOR)) {
                closeAllMenus();
            }
        };
        window.addEventListener('scroll', handleScrollDismiss, { capture: true, passive: true, signal });
        listContainer.addEventListener('scroll', handleScrollDismiss, { passive: true, signal });

        // Global capture click listener to close menus when clicking outside
        // and absorb the click to prevent accidental interaction with underlying student cards/buttons
        const handleOutsideClick = (e) => {
            if (e.target?.closest?.('.action-dropdown') || e.target?.closest?.('.global-actions-dropdown')) {
                return;
            }

            if (listContainer.querySelector(OPEN_MENU_SELECTOR)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                closeAllMenus();
            }
        };

        if (this.state.activeDocClickListener) {
            document.removeEventListener('click', this.state.activeDocClickListener, true);
        }
        this.state.activeDocClickListener = handleOutsideClick;
        document.addEventListener('click', this.state.activeDocClickListener, { capture: true, signal });

        // Click handler
        listContainer.addEventListener('click', (e) => {
            const target = e.target;

            // Toggle GLOBAL actions dropdown in header
            const globalMenuBtn = target.closest('.btn-action-menu-header');
            if (globalMenuBtn) {
                e.stopPropagation();
                globalMenuBtn.blur();
                setTimeout(() => globalMenuBtn.blur(), 50);
                const dropdown = globalMenuBtn.closest('.global-actions-dropdown');
                const menu = dropdown?.querySelector('.global-actions-dropdown-menu');

                const wasOpen = menu?.classList.contains('open');
                closeAllMenus();

                if (!wasOpen && menu) {
                    const rect = globalMenuBtn.getBoundingClientRect();
                    activateMenu(menu, dropdown, globalMenuBtn, window.innerHeight - rect.bottom - 16);
                }
                return;
            }

            // Toggle dropdown menu (per-row actions)
            const menuBtn = target.closest('[data-action="toggle-menu"]');
            if (menuBtn) {
                e.stopPropagation();
                e.preventDefault(); // Prevent browser default focus behavior on click
                menuBtn.blur(); // Blur immediately
                setTimeout(() => menuBtn.blur(), 50); // Defensively blur after click cycle finishes
                const dropdown = menuBtn.closest('.action-dropdown');
                const menu = dropdown?.querySelector('.action-dropdown-menu');

                // Check state before closing (because closeAllMenus will reset it)
                const wasOpen = menu?.classList.contains('open');

                // Close other menus first
                closeAllMenus();

                // Toggle this menu (if it was closed, open it; if it was open, it stays closed)
                if (!wasOpen) openRowMenu(menuBtn);
                return;
            }

            // Move Student action
            const moveBtn = target.closest('[data-action="move-student"]');
            if (moveBtn) {
                e.stopPropagation();
                closeAllMenus();
                const row = target.closest('.student-row');
                const studentId = row?.dataset.studentId;
                if (studentId) {
                    ClassUIManager.showMoveStudentsModal([studentId]);
                }
                return;
            }

            // Copy Appreciation action
            const copyAppBtn = target.closest('[data-action="copy-appreciation"]');
            if (copyAppBtn) {
                e.stopPropagation();
                closeAllMenus();
                const row = target.closest('.student-row');
                const studentId = row?.dataset.studentId;
                if (studentId) {
                    this.callbacks.copySingleAppreciation(studentId);
                }
                return;
            }

            // Reset Student action (modal with choices)
            const resetBtn = target.closest('[data-action="reset-student"]');
            if (resetBtn) {
                e.stopPropagation();
                closeAllMenus();
                const row = target.closest('.student-row');
                const studentId = row?.dataset.studentId;
                if (studentId) {
                    this.callbacks.bulkReset([studentId]);
                }
                return;
            }

            // Regenerate Student Action
            const regenBtn = target.closest('[data-action="regenerate-student"]');
            if (regenBtn) {
                e.stopPropagation();
                closeAllMenus();
                const row = target.closest('.student-row');
                const studentId = row?.dataset.studentId;
                if (studentId) {
                    AppreciationsManager.regenerateFailedAppreciation(studentId, regenBtn);
                }
                return;
            }

            // Delete Student action
            const deleteBtn = target.closest('[data-action="delete-student"]');
            if (deleteBtn) {
                e.stopPropagation();
                closeAllMenus();
                const row = target.closest('.student-row');
                const studentId = row?.dataset.studentId;
                if (studentId) this.callbacks.deleteStudent(studentId, row);
                return;
            }

            // Close menus if clicking elsewhere
            closeAllMenus();

            // Toggle appreciation column visibility (click on header or mobile compact toggle button)
            const toggleHeader = target.closest('.appreciation-toggle-header');
            if (toggleHeader) {
                if (!target.closest('#mobileCompactToggleBtn') && (target.closest('.appreciation-header-actions') || target.closest('#avgWordsChip'))) {
                    return;
                }
                e.stopPropagation();
                this.callbacks.toggleAppreciationColumn(listContainer);
                return;
            }

            // Dirty / Error indicator action in List View (regenerate AI/error or mark manual as verified)
            const dirtyIndicator = target.closest('.dirty-indicator');
            if (dirtyIndicator) {
                e.stopPropagation();
                closeAllMenus();
                const row = target.closest('.student-row');
                const studentId = row?.dataset.studentId;
                const result = studentId ? appState.generatedResults.find(r => r.id === studentId) : null;
                if (!result) return;

                const status = FocusPanelStatus.getAppreciationStatus(result, appState.currentPeriod);
                if (status.hasError || FocusPanelStatus._resolveSource(result) === 'ai') {
                    AppreciationsManager.regenerateFailedAppreciation(studentId);
                } else if (status.isDirty) {
                    FocusPanelStatus.markDirtyAsVerified(result);
                    StorageManager.saveAppState();
                    ListViewRenderer.updateStudentRow(studentId);
                    if (FocusPanelManager.currentStudentId === studentId) {
                        FocusPanelStatus.updateSourceIndicator(result);
                        FocusPanelStatus.updateAppreciationStatus(null, { state: 'saved' });
                    }
                }
                return;
            }

            // Avatar selection toggle
            const avatar = target.closest('.student-avatar');
            if (avatar) {
                e.stopPropagation();
                const studentId = avatar.dataset.studentId;
                if (studentId) {
                    ListSelectionManager.handleSelectionInteraction(studentId, e);
                }
                return;
            }

            // Click anywhere on the row -> Open Focus Panel OR Select if modifiers used
            const row = target.closest('.student-row');
            // Prevent opening if clicking on sortable headers, etc.
            if (row && !target.closest('.action-dropdown') && !target.closest('.sortable-header') && !target.closest('a') && !target.closest('input')) {
                const studentId = row.dataset.studentId;

                // [NEW] Handle Selection Modifiers (Ctrl/Shift)
                if (studentId && (e.ctrlKey || e.metaKey || e.shiftKey)) {
                    // Prevent text selection during shift-click
                    if (e.shiftKey) {
                        e.preventDefault();
                        const selection = window.getSelection();
                        if (selection) selection.removeAllRanges();
                    }
                    ListSelectionManager.handleSelectionInteraction(studentId, e);
                    return; // Stop here, don't open focus panel
                }

                if (studentId) FocusPanelManager.open(studentId);
            }
        }, { signal });

        // Touch long-press on a student card opens its actions menu (shortcut for the 3-dots button)
        const LONG_PRESS_DELAY_MS = 450;
        const LONG_PRESS_MOVE_TOLERANCE_PX = 8;
        const longPress = { timer: null, startX: 0, startY: 0, fired: false };

        const cancelLongPress = () => {
            clearTimeout(longPress.timer);
            longPress.timer = null;
        };

        const triggerLongPress = (row) => {
            cancelLongPress();
            const menuBtn = row.querySelector('[data-action="toggle-menu"]');
            if (!menuBtn) return;
            longPress.fired = true;
            navigator.vibrate?.(10);
            closeAllMenus();
            openRowMenu(menuBtn);
        };

        listContainer.addEventListener('touchstart', (e) => {
            cancelLongPress();
            longPress.fired = false;
            if (e.touches?.length !== 1) return;
            const row = e.target.closest('.student-row');
            if (!row || e.target.closest('.action-dropdown, a, input')) return;
            longPress.startX = e.touches[0].clientX;
            longPress.startY = e.touches[0].clientY;
            longPress.timer = setTimeout(() => triggerLongPress(row), LONG_PRESS_DELAY_MS);
        }, { passive: true, signal });

        listContainer.addEventListener('touchmove', (e) => {
            if (!longPress.timer) return;
            const touch = e.touches[0];
            const distance = Math.hypot(touch.clientX - longPress.startX, touch.clientY - longPress.startY);
            if (distance > LONG_PRESS_MOVE_TOLERANCE_PX) cancelLongPress();
        }, { passive: true, signal });

        const endLongPress = (e) => {
            cancelLongPress();
            if (!longPress.fired) return;
            // Swallow the synthetic click: neither open the Focus Panel nor dismiss the freshly opened menu
            if (e.cancelable) e.preventDefault();
            longPress.fired = false;
        };
        listContainer.addEventListener('touchend', endLongPress, { signal });
        listContainer.addEventListener('touchcancel', endLongPress, { signal });

        // Right click (context menu) on student row to open actions menu
        listContainer.addEventListener('contextmenu', (e) => {
            // Android fires contextmenu on long-press: the touch handler owns it (menu anchored to the 3-dots button)
            if (longPress.timer || longPress.fired) {
                e.preventDefault();
                const pressedRow = e.target.closest('.student-row');
                if (longPress.timer && pressedRow) triggerLongPress(pressedRow);
                return;
            }

            const row = e.target.closest('.student-row');
            // Allow default context menu on inputs/links/text-selection or if no row found
            if (!row || e.target.closest('a') || e.target.closest('input')) return;

            // Allow text selection context menu if text is selected
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0) return;

            e.preventDefault();
            e.stopPropagation();

            const menuBtn = row.querySelector('[data-action="toggle-menu"]');
            if (menuBtn) {
                const dropdown = menuBtn.closest('.action-dropdown');
                const menu = dropdown?.querySelector('.action-dropdown-menu');
                if (!menu) return;

                closeAllMenus();

                // Position at mouse cursor [USER REQUEST]
                // Use absolute positioning relative to parent so it follows scroll
                const rect = dropdown.getBoundingClientRect();
                const relX = e.clientX - rect.left;
                const relY = e.clientY - rect.top;

                menu.style.position = 'absolute';
                menu.style.top = `${relY}px`;
                menu.style.left = `${relX}px`;
                // CRITICAL FIX: Override 'right: 0' from CSS to prevent stretching
                menu.style.right = 'auto';
                menu.style.width = 'max-content';
                menu.style.zIndex = '9999';

                activateMenu(menu, dropdown, menuBtn, window.innerHeight - e.clientY - 16);
            }
        }, { signal });

        // Close menus on escape key
        // CRITICAL FIX: Remove previous listener to prevent accumulation
        // Global shortcuts (Escape, Delete)
        if (this.state.activeKeydownListener) {
            document.removeEventListener('keydown', this.state.activeKeydownListener);
        }
        this.state.activeKeydownListener = (e) => {
            if (UI.isAnyModalOpen() || FocusPanelManager.isOpen?.()) return;
            if (e.key === 'Escape') {
                // Priority 1: Close menus if any are open
                if (listContainer.querySelector(OPEN_MENU_SELECTOR)) {
                    closeAllMenus();
                }
                // Priority 2: Clear selections if no menu was open
                else if (ListSelectionManager.selectedIds.size > 0) {
                    ListSelectionManager.clearSelections();
                }
                // Priority 3: Clear active stat filter if in list view and no header dropdown is open
                else if (
                    appState.activeStatFilter &&
                    appState.activeView !== 'plan' &&
                    !document.querySelector('#headerMenuDropdown.open, #classDropdown.visible, #headerGenWrapper.open')
                ) {
                    EventHandlersManager.handleStatFilterClick(null);
                    if (document.activeElement?.closest?.('.stats-container')) {
                        document.activeElement.blur?.();
                    }
                }
            }

            // Delete key shortcut for bulk delete
            if (e.key === 'Delete' && ListSelectionManager.selectedIds.size > 0) {
                // Ignore if user is typing in an input
                const tag = document.activeElement.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;

                e.preventDefault();
                ListSelectionManager.handleBulkAction('delete');
            }

            // Ctrl+A: Select All
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                // Ignore if user is typing in an input
                const tag = document.activeElement.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;

                e.preventDefault();
                ListSelectionManager.toggleSelectVisible(true);
            }
        };
        document.addEventListener('keydown', this.state.activeKeydownListener, { signal });

        // [FIX] Prevent native text selection/blue rectangle when using Shift+Click
        listContainer.addEventListener('mousedown', (e) => {
            if (e.shiftKey && e.target.closest('.student-row')) {
                // Don't prevent if user is clicking on an input
                if (e.target.closest('input') || e.target.closest('textarea')) return;

                e.preventDefault();
            }
        }, { signal });

        // Keyboard navigation - Enter/Space opens Focus Panel
        listContainer.querySelectorAll('.student-row').forEach(row => {
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const studentId = row.dataset.studentId;
                    if (studentId) FocusPanelManager.open(studentId);
                }
            }, { signal });
        });

        // (Avatar click delegation removed - consolidated above)

        // === GLOBAL ACTIONS DROPDOWN LISTENERS ===
        // These are dynamically created in the table header, so we attach them here
        this.attachGlobalActionsListeners(listContainer, closeAllMenus, signal);
    },

    // ListSelectionManager methods removed

    /**
     * Attache les listeners pour les actions globales (export, copie, etc.)
     * @param {HTMLElement} listContainer - Conteneur de la liste
     * @param {Function} closeAllMenus - Fonction pour fermer tous les menus
     * @private
     */
    attachGlobalActionsListeners(listContainer, closeAllMenus, signal) {
        // Helper pour ajouter un listener qui ferme le menu
        const addAction = (selector, handler) => {
            const btn = listContainer.querySelector(selector);
            if (btn) {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    closeAllMenus();
                    await handler();
                }, { signal });
            }
        };

        // Selection
        addAction('#selectAllBtn-global', () => ListSelectionManager.toggleSelectVisible(true));

        // Mobile sort options inside global header dropdown
        listContainer.querySelectorAll('.mobile-sort-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAllMenus();
                const sortField = btn.dataset.mobileSort;
                const sortParam = btn.dataset.sortParam;
                const selector = sortParam
                    ? `.sortable-header[data-sort-field="${sortField}"][data-sort-param="${sortParam}"]`
                    : `.sortable-header[data-sort-field="${sortField}"]`;
                const targetHeader = listContainer.querySelector(selector);
                if (targetHeader) {
                    EventHandlersManager.handleHeaderSortClick(targetHeader);
                }
            }, { signal });
        });

        // Maintenance - Moved to toolbar

        // Export
        addAction('#exportJsonBtn', () => StorageManager.exportToJson());
        addAction('#exportCsvBtn', () => ExportManager.exportToCsv());
        addAction('#exportPdfBtn', () => ExportManager.exportToPdf());

        // Analyze class (in dropdown menu)
        addAction('#analyzeClassBtn-shortcut', () => ClassDashboardManager.openDashboard());

        // Copy All Appreciations
        addAction('#copyAllAppreciationsBtn', () => {
            const btn = listContainer.querySelector('#copyAllAppreciationsBtn');
            return ExportManager.copyAllResults(btn);
        });

        // Copy Student Names Only
        addAction('#copyStudentNamesBtn', () => {
            const btn = listContainer.querySelector('#copyStudentNamesBtn');
            return ExportManager.copyStudentList(btn);
        });
    },
};
