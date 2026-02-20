/**
 * @fileoverview List View Events
 * Handles all DOM event listeners (click, keyboard, contextmenu) for the List View
 */

import { appState } from '../../state/State.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { HistoryManager } from '../HistoryManager.js';
import { ListSelectionManager } from './ListSelectionManager.js';
import { EventHandlersManager } from '../EventHandlersManager.js';

export const ListViewEvents = {

    state: {
        activeDocClickListener: null,
        activeKeydownListener: null,
        activePopstateListener: null
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
         * Attache les event listeners aux Ã©lÃ©ments de la liste
         * @param {HTMLElement} listContainer - Le conteneur spÃ©cifique de la liste
         * @private
         */
    attachEventListeners(listContainer) {
        // Sort headers click (exclude appreciation toggle which has its own handler)
        listContainer.querySelectorAll('.sortable-header:not(.appreciation-toggle-header)').forEach(header => {
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                EventHandlersManager.handleHeaderSortClick(header);
            });
        });

        // Bouton "Actualiser" inline dans le header du tableau
        const updateBtnInline = listContainer.querySelector('#updateDirtyBtnInline');
        if (updateBtnInline) {
            updateBtnInline.addEventListener('click', async (e) => {
                e.stopPropagation();
                const { ResultsUIManager } = await import('../ResultsUIManager.js');
                await ResultsUIManager.regenerateDirty();
            });
        }

        // Bouton "Générer" inline dans le header du tableau
        const generateBtnInline = listContainer.querySelector('#generatePendingBtnInline');
        if (generateBtnInline) {
            generateBtnInline.addEventListener('click', async (e) => {
                e.stopPropagation();
                const { MassImportManager } = await import('../MassImportManager.js');
                await MassImportManager.generateAllPending();
            });
        }

        // Close any open menus when clicking outside
        const closeAllMenus = () => {
            // Fermer les menus d'actions individuelles
            listContainer.querySelectorAll('.action-dropdown-menu.open').forEach(menu => {
                // Trigger exit animation
                menu.classList.remove('open');

                // Clear any existing timeout to avoid conflict
                if (menu.dataset.closeTimeout) {
                    clearTimeout(parseInt(menu.dataset.closeTimeout));
                }

                // DELAY CLEANUP: Wait for CSS transition (200ms) before resetting styles
                // This prevents the menu from jumping to default position while fading out
                const timeoutId = setTimeout(() => {
                    // Only cleanup if it hasn't been reopened in the meantime
                    if (!menu.classList.contains('open')) {
                        menu.style.position = '';
                        menu.style.top = '';
                        menu.style.left = '';
                        menu.style.right = '';
                        menu.style.width = '';
                        menu.style.zIndex = '';
                    }
                    delete menu.dataset.closeTimeout;
                }, 200);

                menu.dataset.closeTimeout = timeoutId.toString();
            });
            // Fermer le menu global du header
            listContainer.querySelectorAll('.global-actions-dropdown-menu.open').forEach(menu => {
                menu.classList.remove('open');
            });
        };

        // Global click listener to close menus when clicking outside
        // Use capture=true to catch clicks even if other elements stop propagation
        // CRITICAL FIX: Remove previous listener to prevent accumulation on class switch
        if (this._activeDocClickListener) {
            document.removeEventListener('click', this._activeDocClickListener, true);
        }
        this._activeDocClickListener = (e) => {
            // If click is NOT on a menu interaction, close all menus
            if (!e.target.closest('.action-dropdown') && !e.target.closest('.global-actions-dropdown')) {
                closeAllMenus();
            }
        };
        document.addEventListener('click', this._activeDocClickListener, true);

        // Click handler
        listContainer.addEventListener('click', (e) => {
            const target = e.target;

            // Toggle GLOBAL actions dropdown in header
            const globalMenuBtn = target.closest('.btn-action-menu-header');
            if (globalMenuBtn) {
                e.stopPropagation();
                const dropdown = globalMenuBtn.closest('.global-actions-dropdown');
                const menu = dropdown?.querySelector('.global-actions-dropdown-menu');

                const wasOpen = menu?.classList.contains('open');
                closeAllMenus();

                if (!wasOpen) {
                    menu?.classList.add('open');
                }
                return;
            }

            // Toggle dropdown menu (per-row actions)
            const menuBtn = target.closest('[data-action="toggle-menu"]');
            if (menuBtn) {
                e.stopPropagation();
                const dropdown = menuBtn.closest('.action-dropdown');
                const menu = dropdown?.querySelector('.action-dropdown-menu');

                // Check state before closing (because closeAllMenus will reset it)
                const wasOpen = menu?.classList.contains('open');

                // Close other menus first
                closeAllMenus();

                // Toggle this menu (if it was closed, open it; if it was open, it stays closed)
                if (!wasOpen) {
                    // Cancel pending cleanup if re-opening same menu
                    if (menu.dataset.closeTimeout) {
                        clearTimeout(parseInt(menu.dataset.closeTimeout));
                        delete menu.dataset.closeTimeout;
                    }

                    // CRITICAL: Explicitly clear inline styles to ensure default positioning (relative to button)
                    // This fixes the case where menu was previously opened via context menu (absolute/fixed position)
                    menu.style.position = '';
                    menu.style.top = '';
                    menu.style.left = '';
                    menu.style.right = '';
                    menu.style.width = '';
                    menu.style.zIndex = '';

                    menu?.classList.add('open');
                }
                return;
            }

            // Move Student action
            const moveBtn = target.closest('[data-action="move-student"]');
            if (moveBtn) {
                e.stopPropagation();
                closeAllMenus();
                const row = target.closest('.student-row');
                const studentId = row?.dataset.studentId;
                if (studentId) ClassUIManager.showMoveStudentsModal([studentId]);
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
                    import('../AppreciationsManager.js').then(({ AppreciationsManager }) => {
                        AppreciationsManager.regenerateFailedAppreciation(studentId, regenBtn);
                    });
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

            // Toggle appreciation column visibility (click on header)
            const toggleHeader = target.closest('.appreciation-toggle-header');
            if (toggleHeader) {
                e.stopPropagation();
                this.callbacks.toggleAppreciationColumn(listContainer);
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
        });

        // Right click (context menu) on student row to open actions menu
        listContainer.addEventListener('contextmenu', (e) => {
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

                closeAllMenus();

                // Cancel pending cleanup
                if (menu.dataset.closeTimeout) {
                    clearTimeout(parseInt(menu.dataset.closeTimeout));
                    delete menu.dataset.closeTimeout;
                }

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

                menu?.classList.add('open');
            }
        });

        // Close menus on escape key
        // CRITICAL FIX: Remove previous listener to prevent accumulation
        // Global shortcuts (Escape, Delete)
        if (this.state.activeKeydownListener) {
            document.removeEventListener('keydown', this.state.activeKeydownListener);
        }
        this.state.activeKeydownListener = (e) => {
            if (e.key === 'Escape') {
                // Priority 1: Close menus if any are open
                const openMenus = listContainer.querySelectorAll('.action-dropdown-menu.open, .global-actions-dropdown-menu.open');
                if (openMenus.length > 0) {
                    closeAllMenus();
                }
                // Priority 2: Clear selections if no menu was open
                else if (ListSelectionManager.selectedIds.size > 0) {
                    ListSelectionManager.clearSelections();
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
        document.addEventListener('keydown', this.state.activeKeydownListener);

        // [FIX] Prevent native text selection/blue rectangle when using Shift+Click
        listContainer.addEventListener('mousedown', (e) => {
            if (e.shiftKey && e.target.closest('.student-row')) {
                // Don't prevent if user is clicking on an input
                if (e.target.closest('input') || e.target.closest('textarea')) return;

                e.preventDefault();
            }
        });

        // Keyboard navigation - Enter/Space opens Focus Panel
        listContainer.querySelectorAll('.student-row').forEach(row => {
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const studentId = row.dataset.studentId;
                    if (studentId) FocusPanelManager.open(studentId);
                }
            });
        });

        // (Avatar click delegation removed - consolidated above)

        // === GLOBAL ACTIONS DROPDOWN LISTENERS ===
        // These are dynamically created in the table header, so we attach them here
        this.attachGlobalActionsListeners(listContainer, closeAllMenus);
    },

    // ListSelectionManager methods removed

    /**
     * Attache les listeners pour les actions globales (export, copie, etc.)
     * @param {HTMLElement} listContainer - Conteneur de la liste
     * @param {Function} closeAllMenus - Fonction pour fermer tous les menus
     * @private
     */
    attachGlobalActionsListeners(listContainer, closeAllMenus) {
        // Helper pour ajouter un listener qui ferme le menu
        const addAction = (selector, handler) => {
            const btn = listContainer.querySelector(selector);
            if (btn) {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    closeAllMenus();
                    await handler();
                });
            }
        };

        // Import dynamique des dépendances
        import('../AppreciationsManager.js').then(({ AppreciationsManager }) => {
            import('../StorageManager.js').then(({ StorageManager }) => {
                // Selection
                addAction('#selectAllBtn-global', () => ListSelectionManager.toggleSelectVisible(true));

                // Maintenance - Moved to toolbar

                // Export
                addAction('#exportJsonBtn', () => StorageManager.exportToJson());
                addAction('#exportCsvBtn', AppreciationsManager.exportToCsv);
                addAction('#exportPdfBtn', AppreciationsManager.exportToPdf);

                // Analyze class (in dropdown menu)
                import('../ClassDashboardManager.js').then(({ ClassDashboardManager }) => {
                    addAction('#analyzeClassBtn-shortcut', () => ClassDashboardManager.openDashboard());
                });
            });
        });

        // Attach inline search listeners
        this.attachInlineSearchListeners(listContainer);
    },

    /**
     * Attache les listeners pour la recherche inline dans l'entête du tableau
     * @param {HTMLElement} listContainer - Conteneur de la liste
     * @private
     */
    attachInlineSearchListeners(listContainer) {
        // CLEANUP: Remove previous popstate listener to avoid accumulation
        if (this.state.activePopstateListener) {
            window.removeEventListener('popstate', this.state.activePopstateListener);
            this.state.activePopstateListener = null;
        }

        const nameHeader = listContainer.querySelector('.name-header-with-search');
        const headerContent = listContainer.querySelector('#nameHeaderContent');
        const searchContainer = listContainer.querySelector('#inlineSearchContainer');
        const searchInput = listContainer.querySelector('#inlineSearchInput');
        const searchClear = listContainer.querySelector('#inlineSearchClear');

        if (!nameHeader || !searchContainer || !searchInput) return;

        // Perform UI update for activation (without history push)
        const _performActivateUI = () => {
            searchContainer.classList.add('active');
            // Small delay to ensure transition starts and element is focusable
            setTimeout(() => {
                searchInput.focus();
            }, 50);

            // Sync with existing search value if any
            const existingInput = document.getElementById('searchInput');
            if (existingInput && existingInput.value) {
                searchInput.value = existingInput.value;
                searchContainer.classList.add('has-value');
            }
        };

        // Perform UI update for deactivation (without history manipulation)
        const _performDeactivateUI = () => {
            searchContainer.classList.remove('active');
            if (!searchInput.value) {
                searchContainer.classList.remove('has-value');
            }
        };

        // Helper to activate search mode (With History Push)
        const activateSearch = () => {
            if (searchContainer.classList.contains('active')) return;

            _performActivateUI();

            // HISTORY PUSH: Use HistoryManager for safe navigation
            // Permet de fermer la recherche avec le bouton retour du mobile
            HistoryManager.pushCustomState({ inlineSearch: true });
        };

        // Helper to deactivate search mode (With History Check)
        const deactivateSearch = () => {
            _performDeactivateUI();

            // CRITICAL: Do NOT call history.back() here! It can navigate to landing page.
            // Instead, replace the current state to "neutralize" it.
            if (history.state && history.state.inlineSearch) {
                HistoryManager.replaceCurrentState({ appBase: true, consumed: true });
            }
        };

        // EVENT: Popstate (Back Button) [NEW]
        this.state.activePopstateListener = (e) => {
            const isSearchState = e.state && e.state.inlineSearch;
            const isVisible = searchContainer.classList.contains('active');

            if (!isSearchState && isVisible) {
                // On est revenu en arrière (plus d'état local) -> on ferme
                _performDeactivateUI();
            } else if (isSearchState && !isVisible) {
                // On est revenu en avant (ou refresh) -> on rouvre
                _performActivateUI();
            }
        };
        window.addEventListener('popstate', this.state.activePopstateListener);

        // Click on search trigger button to activate search
        const searchTrigger = listContainer.querySelector('#inlineSearchTrigger');
        if (searchTrigger) {
            searchTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                activateSearch();
            });
        }

        // Prevent clicks inside search container from triggering sort
        searchContainer.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Also auto-focus the input when search container is clicked
        searchContainer.addEventListener('mousedown', (e) => {
            // If clicking anywhere in container, focus the input
            if (e.target !== searchInput) {
                e.preventDefault();
                searchInput.focus();
            }
        });

        // Input event - filter as user types
        searchInput.addEventListener('input', (e) => {
            const value = e.target.value;
            searchContainer.classList.toggle('has-value', value.length > 0);

            // Sync with the existing searchInput in toolbar (for backward compatibility)
            const existingInput = document.getElementById('searchInput');
            if (existingInput) {
                existingInput.value = value;
                existingInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        // Clear button
        if (searchClear) {
            searchClear.addEventListener('click', (e) => {
                e.stopPropagation();
                searchInput.value = '';
                searchContainer.classList.remove('has-value');

                // Sync clear with existing search
                const existingInput = document.getElementById('searchInput');
                if (existingInput) {
                    existingInput.value = '';
                    existingInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        }

        // Escape to close search
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                // Clear search when pressing Escape twice, or deactivate if empty
                if (!searchInput.value) {
                    deactivateSearch();
                } else {
                    searchInput.value = '';
                    searchContainer.classList.remove('has-value');
                    // Sync clear
                    const existingInput = document.getElementById('searchInput');
                    if (existingInput) {
                        existingInput.value = '';
                        existingInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            }
        });

        // Click outside to deactivate (if empty)
        document.addEventListener('click', (e) => {
            if (!nameHeader.contains(e.target) && !searchInput.value) {
                if (searchContainer.classList.contains('active')) {
                    deactivateSearch();
                }
            }
        });

        // Ctrl+F keyboard shortcut to activate search
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                // Only intercept if the list view is visible
                if (listContainer.offsetParent !== null) {
                    e.preventDefault();
                    activateSearch();
                }
            }
        });
    },
};
