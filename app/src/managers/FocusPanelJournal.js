/**
 * @fileoverview Focus Panel Journal Manager
 * Handles Journal de Bord (student observation notes) functionality
 * Extracted from FocusPanelManager for better maintainability
 * @module managers/FocusPanelJournal
 */

import { appState, userSettings } from '../state/State.js';
import { StorageManager } from './StorageManager.js';
import { JournalManager } from './JournalManager.js';
import { ClassManager } from './ClassManager.js';
import { TooltipsUI } from './TooltipsManager.js';
import { UI } from './UIManager.js';

/**
 * Journal system for student observation notes
 * @namespace FocusPanelJournal
 */
export const FocusPanelJournal = {
    /** Selected tags for quick add */
    _selectedJournalTags: [],

    /** Currently editing entry ID (null if creating new) */
    _editingJournalEntryId: null,

    /**
     * Callback functions set by parent manager
     * @private
     */
    _callbacks: {
        getCurrentStudentId: null,
        onStatusRefresh: null
    },

    /**
     * Initialize with callbacks from parent manager
     * @param {Object} callbacks - Callback functions
     * @param {Function} callbacks.getCurrentStudentId - () => string|null
     * @param {Function} callbacks.onStatusRefresh - () => void
     */
    init(callbacks = {}) {
        this._callbacks = { ...this._callbacks, ...callbacks };
        this._setupListeners();
    },

    /**
     * Get current student ID via callback
     * @returns {string|null}
     * @private
     */
    _getCurrentStudentId() {
        return this._callbacks.getCurrentStudentId ? this._callbacks.getCurrentStudentId() : null;
    },

    /**
     * Refresh appreciation status via callback
     * @private
     */
    _refreshStatus() {
        if (this._callbacks.onStatusRefresh) {
            this._callbacks.onStatusRefresh();
        }
    },

    /**
     * Get currently editing entry ID
     * @returns {string|null}
     */
    getEditingEntryId() {
        return this._editingJournalEntryId;
    },

    /**
     * Setup Journal event listeners
     * @private
     */
    _setupListeners() {
        // Threshold control
        const thresholdBtn = document.getElementById('journalThresholdBtn');
        const thresholdControl = document.getElementById('journalThresholdControl');
        if (thresholdBtn && thresholdControl) {
            // Toggle popover
            thresholdBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                thresholdControl.classList.toggle('open');
                this._updateThresholdUI();
            });

            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!thresholdControl.contains(e.target)) {
                    thresholdControl.classList.remove('open');
                }
            });

            // Adjust buttons
            thresholdControl.querySelectorAll('.threshold-adjust-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const delta = parseInt(btn.dataset.delta, 10);
                    // Get current value via JournalManager (handles class vs global)
                    const current = JournalManager.getThreshold();
                    const newValue = Math.max(1, Math.min(5, current + delta)); // Clamp 1-5

                    // SAVE: Update Class if selected, or global fallback
                    const currentClassId = appState.currentClassId;
                    if (currentClassId) {
                        ClassManager.updateClass(currentClassId, { journalThreshold: newValue });
                    } else {
                        appState.journalThreshold = newValue;
                        StorageManager.saveAppState();
                    }

                    this._updateThresholdUI();

                    // Re-render journal to update isolated states
                    const studentId = this._getCurrentStudentId();
                    const result = appState.generatedResults.find(r => r.id === studentId);
                    if (result) {
                        this.render(result);
                        this._refreshStatus();
                    }
                });
            });
        }

        // Journal Entry Click (Delegated Edit)
        const journalContent = document.getElementById('focusJournalContent');
        if (journalContent) {
            journalContent.addEventListener('click', (e) => {
                const entryEl = e.target.closest('.journal-entry');
                const deleteBtn = e.target.closest('.journal-entry-delete');

                // If clicked on entry but NOT on delete button
                if (entryEl && !deleteBtn) {
                    const entryId = entryEl.dataset.entryId;
                    this._onEditEntry(entryId);
                }
            });
        }
    },

    /**
     * Render Journal section for current student
     * @param {Object} result - Student data
     * @param {string|null} highlightEntryId - Entry ID to highlight after save
     */
    render(result, highlightEntryId = null) {
        if (!result?.id) {
            // Hide journal section in creation mode
            const section = document.getElementById('focusJournalSection');
            if (section) section.style.display = 'none';
            return;
        }

        const section = document.getElementById('focusJournalSection');
        if (section) section.style.display = '';

        // Update threshold UI (button label + popover value)
        this._updateThresholdUI();

        // Render timeline combined with draft preview
        const contentEl = document.getElementById('focusJournalContent');
        if (contentEl) {
            // Logic: If editing an entry, the draft preview is rendered INLINE in the timeline
            // If NOT editing, the draft preview is rendered at the top

            let html = '';

            // Only render top draft preview if NOT editing an existing entry
            if (!this._editingJournalEntryId) {
                html += JournalManager.renderDraftPreview();
            }

            html += JournalManager.renderTimeline(
                result.id,
                appState.currentPeriod,
                highlightEntryId,
                this._editingJournalEntryId
            );

            // Destroy existing tooltips in the container using centralized manager
            TooltipsUI.cleanupTooltipsIn(contentEl);

            contentEl.innerHTML = html;

            // Attach dynamic listeners for draft actions (Cancel/Save are same IDs)
            const draftCancel = document.getElementById('journalDraftCancelBtn');
            const draftSave = document.getElementById('journalDraftSaveBtn');
            const draftInput = document.getElementById('journalNoteInput');

            if (draftCancel) draftCancel.addEventListener('click', () => this.toggleQuickAdd(false));
            if (draftSave) draftSave.addEventListener('click', () => this._saveEntry());
            if (draftInput) draftInput.addEventListener('input', () => this._updateSaveButton());

            // Attach pill button handlers (inside draft)
            this._setupDraftPillButtons(contentEl);

            // Add delete handlers
            this._setupDeleteHandlers(contentEl, result);

            // Re-attach listeners for populated chips (if inline editing or pre-filled)
            this._setupChipRemoveHandlers(contentEl);

            // Initialize tooltips for the timeline entries
            setTimeout(() => {
                contentEl.querySelectorAll('[data-tooltip]').forEach(el => {
                    const tooltipText = el.getAttribute('data-tooltip');
                    if (tooltipText) {
                        TooltipsUI.updateTooltip(el, tooltipText);
                    }
                });
            }, 0);
        }

        // Update count badge
        this._updateCountBadge(result);

        // Header + button: opens the draft
        this._setupAddButton();
    },

    /**
     * Setup delete handlers for journal entries
     * @param {HTMLElement} contentEl - Content container
     * @param {Object} result - Student result
     * @private
     */
    _setupDeleteHandlers(contentEl, result) {
        contentEl.querySelectorAll('.journal-entry-delete').forEach(btn => {
            let deleteTimeout;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const entryId = btn.dataset.entryId;

                // First click: ask confirmation
                if (!btn.classList.contains('confirm-delete')) {
                    // Reset any other active buttons first
                    contentEl.querySelectorAll('.confirm-delete').forEach(b => b.classList.remove('confirm-delete'));

                    btn.classList.add('confirm-delete');

                    // Auto-reset after 3s
                    deleteTimeout = setTimeout(() => {
                        btn.classList.remove('confirm-delete');
                    }, 3000);

                    // Handle outside click
                    const outsideClickListener = (ev) => {
                        if (!btn.contains(ev.target)) {
                            btn.classList.remove('confirm-delete');
                            clearTimeout(deleteTimeout);
                            document.removeEventListener('click', outsideClickListener);
                        }
                    };
                    // Delay slightly to avoid catching current click
                    setTimeout(() => document.addEventListener('click', outsideClickListener), 0);
                }
                // Second click: execute delete
                else {
                    clearTimeout(deleteTimeout);

                    // Animate removal
                    const entryEl = btn.closest('.journal-entry');
                    if (entryEl) {
                        entryEl.classList.add('leave');

                        setTimeout(() => {
                            // Execute delete
                            JournalManager.deleteEntry(result.id, entryId);
                            // Re-render to update timeline and isolated states
                            this.render(result);
                            UI.showNotification('Observation supprimée', 'success');
                            // Refresh badge status
                            this._refreshStatus();
                        }, 400); // Wait for animation
                    }
                }
            });
        });
    },

    /**
     * Setup chip remove handlers
     * @param {HTMLElement} contentEl - Content container
     * @private
     */
    _setupChipRemoveHandlers(contentEl) {
        contentEl.querySelectorAll('.journal-chip-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const chip = btn.closest('.journal-selected-chip');
                const tagId = chip.dataset.tagId;

                this._selectedJournalTags = this._selectedJournalTags.filter(t => t !== tagId);
                chip.remove();
                this._updateSaveButton();
                this._updateDraftPreviewVisibility();
            });
        });
    },

    /**
     * Update count badge with journal entry counts
     * @param {Object} result - Student result
     * @private
     */
    _updateCountBadge(result) {
        const countBadge = document.getElementById('focusJournalCount');
        if (countBadge) {
            const aggregated = JournalManager.getAggregatedCounts(result.id, appState.currentPeriod);

            if (aggregated.length > 0) {
                const threshold = appState.journalThreshold ?? 2;

                // Render detailed counts with icons using standard journal-tag class for consistency
                const html = aggregated.map(item => {
                    const isBelow = item.count < threshold;
                    const belowClass = isBelow ? 'below-threshold' : '';
                    return `
                    <span class="journal-tag ${belowClass}" style="--tag-color: ${item.color}; margin-right: 0; cursor: help;" data-tooltip="${item.label} : ${item.count}">
                        <i class="fas ${item.icon}"></i> ${item.count}
                    </span>
                `}).join('');

                countBadge.innerHTML = html;

                // Override default badge styles to act as a container
                countBadge.style.display = 'inline-flex';
                countBadge.style.gap = '6px';
                countBadge.style.background = 'transparent';
                countBadge.style.padding = '0';
                countBadge.style.minWidth = 'auto';
                countBadge.style.boxShadow = 'none';
                countBadge.style.border = 'none';
                countBadge.style.fontSize = 'inherit';
                countBadge.style.height = 'auto';

                // Initialize tooltips for the new elements manually since they are created dynamically
                setTimeout(() => {
                    countBadge.querySelectorAll('[data-tooltip]').forEach(tag => {
                        const tooltipText = tag.getAttribute('data-tooltip');
                        if (tooltipText) {
                            TooltipsUI.updateTooltip(tag, tooltipText);
                        }
                    });
                }, 50);
            } else {
                countBadge.style.display = 'none';
            }
        }
    },

    /**
     * Setup add button click handler
     * @private
     */
    _setupAddButton() {
        const addBtn = document.getElementById('focusJournalNoteBtn');
        if (addBtn) {
            // Remove old listeners by cloning
            const newBtn = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(newBtn, addBtn);

            newBtn.addEventListener('click', () => {
                // Show draft preview
                const draftPreview = document.getElementById('journalDraftPreview');
                if (draftPreview) {
                    draftPreview.classList.add('visible');
                    // Auto-scroll journal content to top to show draft
                    const journalContent = document.getElementById('focusJournalContent');
                    if (journalContent) {
                        requestAnimationFrame(() => {
                            journalContent.scrollTo({ top: 0, behavior: 'smooth' });
                        });
                    }
                }
                // Open editing mode
                this.toggleQuickAdd(true, true);
            });
        }
    },

    /**
     * Handle tag selection from dropdown
     * @param {string} tagId - ID of selected tag
     * @param {HTMLElement} originElement - Element that triggered the selection
     */
    handleTagSelection(tagId, originElement) {
        // Ensure editing mode is open
        const section = document.getElementById('focusJournalSection');
        if (!section?.classList.contains('editing')) {
            // Force reset when opening from a fresh tag selection
            this.toggleQuickAdd(true, true);
            // Show draft preview immediately since we are adding a tag
            const draftPreview = document.getElementById('journalDraftPreview');
            if (draftPreview) {
                draftPreview.classList.add('visible');
                // Auto-scroll journal content to top to show draft
                const journalContent = document.getElementById('focusJournalContent');
                if (journalContent) {
                    requestAnimationFrame(() => {
                        journalContent.scrollTo({ top: 0, behavior: 'smooth' });
                    });
                }
            }
        }

        const tag = JournalManager.getTag(tagId);

        // Don't add if already selected
        if (this._selectedJournalTags.includes(tagId)) {
            // Close dropdown
            originElement?.closest('.journal-tag-dropdown')?.classList.remove('open');
            return;
        }

        // Add to selection
        this._selectedJournalTags.push(tagId);

        // Add chip to display
        const chipsContainer = document.getElementById('journalSelectedTags');
        if (chipsContainer && tag) {
            const chip = document.createElement('span');
            chip.className = 'journal-selected-chip';
            chip.style.setProperty('--tag-color', tag.color);
            chip.dataset.tagId = tagId;
            chip.innerHTML = `
                <i class="fas ${tag.icon}"></i>
                <span>${tag.label}</span>
                <button class="journal-chip-remove" aria-label="Retirer">
                    <i class="fas fa-times"></i>
                </button>
            `;

            // Remove handler
            chip.querySelector('.journal-chip-remove').addEventListener('click', (ev) => {
                ev.stopPropagation();
                this._selectedJournalTags = this._selectedJournalTags.filter(t => t !== tagId);
                chip.remove();
                this._updateSaveButton();
                this._updateDraftPreviewVisibility();
            });

            chipsContainer.appendChild(chip);
        }

        // Close dropdown
        originElement?.closest('.journal-tag-dropdown')?.classList.remove('open');
        this._updateSaveButton();
        this._updateDraftPreviewVisibility();
    },

    /**
     * Update threshold UI (button label + popover value)
     * @private
     */
    _updateThresholdUI() {
        const threshold = JournalManager.getThreshold();
        const currentClassId = appState.currentClassId;
        const currentClass = currentClassId ? ClassManager.getClassById(currentClassId) : null;

        // Update button label
        const btnValue = document.getElementById('journalThresholdValue');
        if (btnValue) {
            btnValue.textContent = `≥${threshold}`;
        }

        // Update popover value
        const popoverValue = document.getElementById('thresholdCurrentValue');
        if (popoverValue) {
            popoverValue.textContent = threshold;
        }

        // Update tooltip on button
        const btn = document.getElementById('journalThresholdBtn');
        if (btn) {
            const contextLabel = currentClass ? `(Classe : ${currentClass.name})` : '(Global)';
            btn.setAttribute('data-tooltip', `Seuil : ${threshold} ${contextLabel}<br><i>Cliquer pour modifier</i>`);
        }
    },

    /**
     * Toggle the journal editing mode
     * @param {boolean} show - True to show editing UI, false to hide
     * @param {boolean} reset - Whether to reset the input fields (default: true)
     */
    toggleQuickAdd(show, reset = true) {
        const section = document.getElementById('focusJournalSection');
        const studentId = this._getCurrentStudentId();

        // If hiding (Cancel), always reset editing state and re-render to standard view
        if (!show) {
            const draftPreview = document.getElementById('journalDraftPreview');
            const isVisible = draftPreview && (draftPreview.classList.contains('visible') || this._editingJournalEntryId);
            const editingId = this._editingJournalEntryId; // Capture before reset

            // Helper to get current student result
            const getCurrentResult = () => appState.generatedResults.find(r => r.id === studentId);

            // Cleanup helper
            const finishClose = () => {
                this._editingJournalEntryId = null;
                this._selectedJournalTags = [];
                const result = getCurrentResult();
                if (result) this.render(result);
                section?.classList.remove('editing');
            };

            if (isVisible) {
                // === Special handling for INLINE EDIT close (crossfade) ===
                if (editingId) {
                    const entry = JournalManager.getEntry(studentId, editingId);
                    if (entry) {
                        // Build the original entry HTML to inject
                        const tagCounts = JournalManager.countTags(studentId, appState.currentPeriod);
                        const threshold = appState.journalThreshold ?? 2;
                        const isIsolated = JournalManager.isEntryIsolated(entry, tagCounts);

                        const tagsHTML = entry.tags.map(tagId => {
                            const tag = JournalManager.getTag(tagId);
                            if (!tag) return '';
                            return `<span class="journal-tag" style="--tag-color: ${tag.color}">
                                <i class="fas ${tag.icon}"></i> ${tag.label}
                            </span>`;
                        }).join('');

                        const infoIcon = isIsolated
                            ? `<div class="journal-entry-info" data-tooltip="Observation isolée (< ${threshold}×) — non transmise à l'IA"><i class="fas fa-info-circle"></i></div>`
                            : '';

                        const entryHTML = `
                            <div class="journal-entry crossfade-in ${isIsolated ? 'isolated' : ''}" data-entry-id="${entry.id}">
                                <div class="journal-entry-date">${JournalManager.formatDate(entry.date)}</div>
                                <div class="journal-entry-content">
                                    <div class="journal-entry-tags">${tagsHTML}</div>
                                    ${entry.note ? `<div class="journal-entry-note">${entry.note}</div>` : ''}
                                </div>
                                ${infoIcon}
                                <button class="journal-entry-delete" data-entry-id="${entry.id}" aria-label="Supprimer">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `;

                        // Inject the entry card at the same position as the draft
                        const entryWrapper = document.createElement('div');
                        entryWrapper.className = 'journal-crossfade-wrapper';
                        entryWrapper.innerHTML = entryHTML;
                        draftPreview.parentNode.insertBefore(entryWrapper, draftPreview.nextSibling);

                        // Trigger crossfade animation
                        draftPreview.classList.add('closing');

                        // Wait for crossfade animation then cleanup
                        setTimeout(finishClose, 350);
                        return;
                    }
                }

                // === Standard draft close (not inline edit) ===
                draftPreview.classList.add('closing');
                setTimeout(finishClose, 300);
            } else {
                // Instant update if not visible
                finishClose();
            }
            return;
        }

        const saveBtn = document.getElementById('journalDraftSaveBtn');
        const draftPreview = document.getElementById('journalDraftPreview');
        const noteInput = document.getElementById('journalNoteInput');

        if (show) {
            section?.classList.add('editing');

            if (reset) {
                // Reset state
                this._selectedJournalTags = [];
                // Reset edit mode
                this._editingJournalEntryId = null;

                // Reset header title
                const headerLabel = document.querySelector('.journal-draft-label');
                if (headerLabel) {
                    headerLabel.innerHTML = `<i class="fas fa-pencil"></i> Brouillon`;
                }

                if (noteInput) noteInput.value = '';
                if (saveBtn) saveBtn.disabled = true;

                // Clear selected chips
                const chipsContainer = document.getElementById('journalSelectedTags');
                if (chipsContainer) chipsContainer.innerHTML = '';
            }

            // Show the draft preview when opening
            draftPreview?.classList.add('visible');
        }

        // Close any open dropdowns
        document.querySelectorAll('.journal-tag-dropdown.open').forEach(d => d.classList.remove('open'));
        document.querySelectorAll('.journal-pill-dropdown.open').forEach(d => d.classList.remove('open'));

        // Remove visual dimming from original entries
        document.querySelectorAll('.journal-entry.editing-original').forEach(el => el.classList.remove('editing-original'));
    },

    /**
     * Show/hide draft preview based on selected tags
     * @private
     */
    _updateDraftPreviewVisibility() {
        const draftPreview = document.getElementById('journalDraftPreview');
        if (!draftPreview) return;

        if (this._selectedJournalTags.length > 0) {
            draftPreview.classList.add('visible');
        } else {
            draftPreview.classList.remove('visible');
        }
    },

    /**
     * Update save button state based on selected tags or note content
     * @private
     */
    _updateSaveButton() {
        const saveBtn = document.getElementById('journalDraftSaveBtn');
        if (saveBtn) {
            const noteInput = document.getElementById('journalNoteInput');
            const hasNote = noteInput && noteInput.value.trim().length > 0;
            const hasTags = this._selectedJournalTags.length > 0;

            // Enable save if at least one tag is selected OR there is a note
            saveBtn.disabled = !hasTags && !hasNote;
        }
    },

    /**
     * Setup pill button event handlers inside draft
     * @param {HTMLElement} container - The content container
     * @private
     */
    _setupDraftPillButtons(container) {
        const pillsContainer = container.querySelector('#journalDraftPills');
        if (!pillsContainer) return;

        // Handle pill dropdown triggers
        pillsContainer.querySelectorAll('.journal-pill-btn:not(.journal-pill-direct)').forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const dropdown = trigger.closest('.journal-pill-dropdown');
                const wasOpen = dropdown?.classList.contains('open');

                // Close all dropdowns first
                pillsContainer.querySelectorAll('.journal-pill-dropdown.open').forEach(dd => {
                    dd.classList.remove('open');
                });

                // Toggle clicked dropdown
                if (!wasOpen) {
                    dropdown?.classList.add('open');

                    // Show draft if not visible
                    const draftPreview = document.getElementById('journalDraftPreview');
                    draftPreview?.classList.add('visible');

                    // Close on outside click
                    const closeHandler = (ev) => {
                        if (!dropdown?.contains(ev.target)) {
                            dropdown?.classList.remove('open');
                            document.removeEventListener('click', closeHandler);
                        }
                    };
                    setTimeout(() => document.addEventListener('click', closeHandler), 0);
                }
            });
        });

        // Handle dropdown option clicks
        pillsContainer.querySelectorAll('.journal-dropdown-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const tagId = option.dataset.tagId;
                this.handleTagSelection(tagId, option);
                // Close dropdown after selection
                option.closest('.journal-pill-dropdown')?.classList.remove('open');
            });
        });

        // Handle direct Remarque button
        pillsContainer.querySelectorAll('.journal-pill-direct').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tagId = btn.dataset.tagId;
                this.handleTagSelection(tagId, btn);
            });
        });
    },

    /**
     * Handle editing a journal entry
     * @param {string} entryId
     * @private
     */
    _onEditEntry(entryId) {
        const studentId = this._getCurrentStudentId();
        const entry = JournalManager.getEntry(studentId, entryId);
        if (!entry) return;

        // 1. Set editing state and sync tags
        this._editingJournalEntryId = entryId;
        this._selectedJournalTags = [...entry.tags];

        // 2. Re-render journal to show inline editor
        const result = appState.generatedResults.find(r => r.id === studentId);
        if (result) {
            this.render(result);

            // 3. Scroll to the inline editor
            setTimeout(() => {
                const journalContent = document.querySelector('.journal-content');
                if (journalContent) {
                    // Scroll the journal-content container to show the draft at top
                    journalContent.scrollTo({ top: 0, behavior: 'smooth' });
                    // Focus inputs
                    const noteInput = document.getElementById('journalNoteInput');
                    if (noteInput && !entry.note) noteInput.focus();
                }
            }, 50);
        }

        // 4. Mark section as editing
        const section = document.getElementById('focusJournalSection');
        section?.classList.add('editing');
    },

    /**
     * Save a new journal entry or update existing
     * @private
     */
    _saveEntry() {
        const noteInput = document.getElementById('journalNoteInput');
        const note = noteInput?.value?.trim() || '';
        const studentId = this._getCurrentStudentId();

        if (!studentId || (this._selectedJournalTags.length === 0 && !note)) return;

        // Disable button immediately
        const saveBtn = document.getElementById('journalDraftSaveBtn');
        if (saveBtn) saveBtn.disabled = true;

        // Animate closing
        const draftPreview = document.getElementById('journalDraftPreview');
        if (draftPreview) draftPreview.classList.add('closing');

        // Execute save after animation
        setTimeout(() => {
            let entry;

            if (this._editingJournalEntryId) {
                // Update existing
                entry = JournalManager.updateEntry(studentId, this._editingJournalEntryId, {
                    tags: [...this._selectedJournalTags],
                    note: note
                });
                if (entry) UI.showNotification('Observation modifiée', 'success');
            } else {
                // Create new
                entry = JournalManager.addEntry(studentId, {
                    tags: [...this._selectedJournalTags],
                    note: note
                });
                if (entry) UI.showNotification('Observation enregistrée', 'success');
            }

            if (entry) {
                // Refresh badge status (dirty check)
                this._refreshStatus();

                // Reset editing state
                this._editingJournalEntryId = null;
                this._selectedJournalTags = [];

                // Re-render journal
                const result = appState.generatedResults.find(r => r.id === studentId);
                if (result) {
                    // If new entry, highlight it
                    const highlightId = this._editingJournalEntryId ? null : entry.id;
                    this.render(result, highlightId);
                }

                const section = document.getElementById('focusJournalSection');
                section?.classList.remove('editing');
            } else {
                // If failed, re-enable button and remove closing class
                if (saveBtn) saveBtn.disabled = false;
                if (draftPreview) draftPreview.classList.remove('closing');
            }
        }, 300);
    }
};
