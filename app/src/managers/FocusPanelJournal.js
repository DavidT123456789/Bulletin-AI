/**
 * @fileoverview Focus Panel Journal Manager
 * Handles Journal de Bord (student observation notes) functionality
 * Extracted from FocusPanelManager for better maintainability
 * @module managers/FocusPanelJournal
 */

import { appState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';
import { JournalManager } from './JournalManager.js';
import { ClassManager } from './ClassManager.js';
import { TooltipsUI } from './TooltipsManager.js';
import { UI } from './UIManager.js';
import { SpeechRecognitionManager } from './SpeechRecognitionManager.js';

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
        return this._callbacks.getCurrentStudentId?.() ?? null;
    },

    /**
     * Refresh appreciation status via callback
     * @private
     */
    _refreshStatus() {
        this._callbacks.onStatusRefresh?.();
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

            // Close on outside click or Escape key
            document.addEventListener('click', (e) => {
                if (!thresholdControl.contains(e.target)) {
                    thresholdControl.classList.remove('open');
                }
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && thresholdControl.classList.contains('open')) {
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

                    // CRITICAL: Threshold affects ALL students' dirty state
                    // Emit global event to refresh entire list view
                    window.dispatchEvent(new CustomEvent('journalThresholdChanged', {
                        detail: { newThreshold: newValue }
                    }));
                });
            });
        }

        // Note button in header (Ajouter une note)
        const noteBtn = document.getElementById('focusJournalNoteBtn');
        if (noteBtn) {
            noteBtn.addEventListener('click', () => {
                const draftPreview = document.getElementById('journalDraftPreview');
                if (draftPreview) {
                    draftPreview.classList.add('visible');
                    const journalContent = document.getElementById('focusJournalContent');
                    if (journalContent) {
                        requestAnimationFrame(() => {
                            journalContent.scrollTo({ top: 0, behavior: 'smooth' });
                        });
                    }
                }
                this.toggleQuickAdd(true, true);
            });
        }

        // Journal Entry Click (Delegated Edit)
        const journalContent = document.getElementById('focusJournalContent');
        if (journalContent) {
            journalContent.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.journal-entry-delete');
                const infoIcon = e.target.closest('.journal-entry-info');
                if (deleteBtn || infoIcon) return;

                const editBtn = e.target.closest('.journal-entry-edit');
                const entryEl = e.target.closest('.journal-entry');

                if (editBtn) {
                    e.stopPropagation();
                    const entryId = editBtn.dataset.entryId;
                    this._onEditEntry(entryId);
                } else if (entryEl) {
                    const entryId = entryEl.dataset.entryId;
                    this._onEditEntry(entryId);
                }
            });
        }
    },

    /**
     * Initialize tooltips for a container
     * @param {HTMLElement} container
     * @private
     */
    _initTooltips(container) {
        if (!container) return;
        setTimeout(() => {
            container.querySelectorAll('[data-tooltip]').forEach(el => {
                const tooltipText = el.getAttribute('data-tooltip');
                if (tooltipText) {
                    TooltipsUI.updateTooltip(el, tooltipText);
                }
            });
        }, 0);
    },

    /**
     * Attach dynamic listeners for draft actions
     * @param {HTMLElement} container
     * @private
     */
    _setupDraftListeners(container) {
        const draftCancel = container.querySelector('#journalDraftCancelBtn');
        const draftCancelFooter = container.querySelector('#journalDraftCancelFooterBtn');
        const draftSave = container.querySelector('#journalDraftSaveBtn');
        const draftInput = container.querySelector('#journalNoteInput');

        if (draftCancel) draftCancel.addEventListener('click', () => this.toggleQuickAdd(false));
        if (draftCancelFooter) draftCancelFooter.addEventListener('click', () => this.toggleQuickAdd(false));

        if (draftSave) {
            draftSave.addEventListener('click', (e) => {
                e.preventDefault();
                this._saveEntry();
            });
            draftSave.addEventListener('pointerdown', (e) => {
                e.preventDefault();
            });
        }

        if (draftInput) {
            draftInput.addEventListener('input', () => {
                const charCount = container.querySelector('#journalCharCount');
                if (charCount) charCount.textContent = draftInput.value.length;
                this._updateSaveButton();
            });
            draftInput.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    const btn = container.querySelector('#journalDraftSaveBtn');
                    if (btn && !btn.disabled) this._saveEntry();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.toggleQuickAdd(false);
                }
            });
        }

        // Voice dictation mic button
        const micBtn = container.querySelector('#journalNoteMicBtn');
        if (micBtn) {
            SpeechRecognitionManager.setupButton(micBtn, 'journal');
        }

        this._updatePillDirectStates();
        this._setupDraftPillButtons(container);
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

        const contentEl = document.getElementById('focusJournalContent');
        if (!contentEl) return;

        // If editing an entry inline, render the inline editor in full
        if (this._editingJournalEntryId) {
            TooltipsUI.cleanupTooltipsIn(contentEl);
            contentEl.innerHTML = JournalManager.renderTimeline(
                result.id,
                appState.currentPeriod,
                highlightEntryId,
                this._editingJournalEntryId
            );
            this._setupDraftListeners(contentEl);
            this._setupDeleteHandlers(contentEl, result);
            this._setupChipRemoveHandlers(contentEl);
            this._initTooltips(contentEl);
            this._updateCountBadge(result);
            return;
        }

        // Standard view: Ensure top draft preview exists
        let draftPreview = contentEl.querySelector('#journalDraftPreview');
        let timelineContainer = contentEl.querySelector('#journalTimelineContainer');

        if (!draftPreview || !timelineContainer) {
            TooltipsUI.cleanupTooltipsIn(contentEl);
            contentEl.innerHTML = `
                ${JournalManager.renderDraftPreview()}
                <div class="journal-timeline-container" id="journalTimelineContainer"></div>
            `;
            draftPreview = contentEl.querySelector('#journalDraftPreview');
            timelineContainer = contentEl.querySelector('#journalTimelineContainer');
            this._setupDraftListeners(contentEl);
        } else {
            draftPreview.classList.remove('closing');
            const section = document.getElementById('focusJournalSection');
            if (!section?.classList.contains('editing')) {
                draftPreview.classList.remove('visible', 'is-editing');
            }
        }

        const entries = JournalManager.getEntriesForPeriod(result.id, appState.currentPeriod);
        const isNewEmpty = entries.length === 0;
        const existingEmpty = timelineContainer.querySelector('.journal-empty');

        if (isNewEmpty && existingEmpty) {
            // Stable empty state: keep DOM node intact to eliminate disappearance flicker and layout shift
        } else if (isNewEmpty) {
            TooltipsUI.cleanupTooltipsIn(timelineContainer);
            timelineContainer.innerHTML = JournalManager.renderTimeline(
                result.id,
                appState.currentPeriod,
                null,
                null
            );
            const emptyEl = timelineContainer.querySelector('.journal-empty');
            emptyEl?.classList.add('fade-in');
        } else {
            TooltipsUI.cleanupTooltipsIn(timelineContainer);
            timelineContainer.innerHTML = JournalManager.renderTimeline(
                result.id,
                appState.currentPeriod,
                highlightEntryId,
                null
            );
            const timelineEl = timelineContainer.querySelector('.journal-timeline');
            timelineEl?.classList.add('fade-in');

            this._setupDeleteHandlers(timelineContainer, result);
            this._setupChipRemoveHandlers(timelineContainer);
            this._initTooltips(timelineContainer);
        }

        // Interactive empty state: click to open draft
        this._setupEmptyStateHandler(timelineContainer);

        // Update count badge
        this._updateCountBadge(result);
    },

    /**
     * Setup click handler on the interactive empty state to open the draft editor
     * @param {HTMLElement} container
     * @private
     */
    _setupEmptyStateHandler(container) {
        const emptyEl = container?.querySelector('.journal-empty-interactive');
        if (!emptyEl || emptyEl._journalBound) return;

        emptyEl._journalBound = true;

        emptyEl.addEventListener('click', () => {
            const draftPreview = document.getElementById('journalDraftPreview');
            if (draftPreview) {
                draftPreview.classList.add('visible');
                const journalContent = document.getElementById('focusJournalContent');
                journalContent?.scrollTo({ top: 0, behavior: 'smooth' });
            }
            this.toggleQuickAdd(true, true);
        });

        emptyEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                emptyEl.click();
            }
        });
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
                    contentEl.querySelectorAll('.has-confirm-delete').forEach(a => a.classList.remove('has-confirm-delete'));

                    btn.classList.add('confirm-delete');
                    btn.closest('.journal-entry-actions')?.classList.add('has-confirm-delete');
                    btn._tippy?.hide();

                    const resetConfirm = () => {
                        btn.classList.remove('confirm-delete');
                        btn.closest('.journal-entry-actions')?.classList.remove('has-confirm-delete');
                        clearTimeout(deleteTimeout);
                        document.removeEventListener('click', outsideClickListener);
                        document.removeEventListener('keydown', escapeListener);
                    };

                    const outsideClickListener = (ev) => {
                        if (!btn.contains(ev.target)) resetConfirm();
                    };

                    const escapeListener = (ev) => {
                        if (ev.key === 'Escape') resetConfirm();
                    };

                    // Auto-reset after 3s
                    deleteTimeout = setTimeout(resetConfirm, 3000);

                    // Delay slightly to avoid catching current click
                    setTimeout(() => {
                        document.addEventListener('click', outsideClickListener);
                        document.addEventListener('keydown', escapeListener);
                    }, 0);
                }
                // Second click: execute delete
                else {
                    resetConfirm();

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
                const tagId = chip?.dataset?.tagId;

                if (tagId) {
                    this._selectedJournalTags = this._selectedJournalTags.filter(t => t !== tagId);
                }
                chip?.remove();
                this._updatePillDirectStates();
                this._updateSaveButton();
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
                const threshold = JournalManager.getThreshold();

                // Render detailed counts with icons using standard journal-tag class for consistency
                const html = aggregated.map(item => {
                    const isBelow = item.count < threshold;
                    const belowClass = isBelow ? 'below-threshold' : '';
                    return `
                    <span class="journal-tag journal-count-tag ${belowClass}" style="--tag-color: ${item.color}" data-tooltip="${item.label} : ${item.count}">
                        <iconify-icon icon="${item.icon}"></iconify-icon> ${item.count}
                    </span>
                `}).join('');

                countBadge.innerHTML = html;
                countBadge.classList.remove('is-hidden');

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
                countBadge.innerHTML = '';
                countBadge.classList.add('is-hidden');
            }
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

        // If already selected: if it's a direct pill, toggle it off!
        if (this._selectedJournalTags.includes(tagId)) {
            if (originElement?.classList?.contains('journal-pill-direct')) {
                this._selectedJournalTags = this._selectedJournalTags.filter(t => t !== tagId);
                const chipsContainer = document.getElementById('journalSelectedTags');
                const existingChip = chipsContainer?.querySelector(`[data-tag-id="${tagId}"]`);
                existingChip?.remove();
                this._updatePillDirectStates();
                this._updateSaveButton();
                return;
            }
            originElement?.closest('.journal-pill-dropdown')?.classList.remove('open');
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
                <iconify-icon icon="${tag.icon}"></iconify-icon>
                <span>${tag.label}</span>
                <button type="button" class="journal-chip-remove" aria-label="Retirer ${tag.label}">
                    <iconify-icon icon="ph:x"></iconify-icon>
                </button>
            `;

            // Remove handler
            chip.querySelector('.journal-chip-remove').addEventListener('click', (ev) => {
                ev.stopPropagation();
                this._selectedJournalTags = this._selectedJournalTags.filter(t => t !== tagId);
                chip.remove();
                this._updatePillDirectStates();
                this._updateSaveButton();
            });

            chipsContainer.appendChild(chip);
        }

        // Close dropdown
        originElement?.closest('.journal-pill-dropdown')?.classList.remove('open');
        originElement?.closest('.journal-tag-dropdown')?.classList.remove('open');
        this._updatePillDirectStates();
        this._updateSaveButton();
        this._updateDraftPreviewVisibility();
    },

    /**
     * Update active visual state for direct pill buttons (Difficulté, Remarque) and dropdown triggers
     * @private
     */
    _updatePillDirectStates() {
        const pillsContainer = document.getElementById('journalDraftPills');
        if (!pillsContainer) return;

        // Direct pill buttons (Difficulté, Remarque)
        pillsContainer.querySelectorAll('.journal-pill-direct').forEach(btn => {
            const tagId = btn.dataset.tagId;
            btn.classList.toggle('selected', this._selectedJournalTags.includes(tagId));
        });

        // Dropdown triggers (Positif, Négatif)
        pillsContainer.querySelectorAll('.journal-pill-dropdown').forEach(dd => {
            const category = dd.dataset.category;
            const categoryTags = JournalManager.tags.filter(t => t.category === category).map(t => t.id);
            const hasSelected = this._selectedJournalTags.some(t => categoryTags.includes(t));
            dd.classList.toggle('has-selected', hasSelected);
        });
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
            btn.setAttribute('data-tooltip', `Seuil : ${threshold} ${contextLabel}<br><span class="kbd-hint">Modifier</span>`);
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
                section?.classList.remove('editing');
                const draft = document.getElementById('journalDraftPreview');
                if (draft) {
                    draft.classList.remove('visible', 'closing', 'is-editing');
                    const noteInput = draft.querySelector('#journalNoteInput');
                    if (noteInput) noteInput.value = '';
                    const charCount = draft.querySelector('#journalCharCount');
                    if (charCount) charCount.textContent = '0';
                    const selectedTags = draft.querySelector('#journalSelectedTags');
                    if (selectedTags) selectedTags.innerHTML = '';
                    const saveBtn = draft.querySelector('#journalDraftSaveBtn');
                    if (saveBtn) saveBtn.disabled = true;
                }
                this._updatePillDirectStates();
                const contentEl = document.getElementById('focusJournalContent');
                contentEl?.querySelectorAll('.journal-crossfade-wrapper').forEach(w => w.remove());
                const result = getCurrentResult();
                if (result) this.render(result);
            };

            if (isVisible) {
                // === Special handling for INLINE EDIT close (crossfade) ===
                if (editingId) {
                    const entry = JournalManager.getEntry(studentId, editingId);
                    if (entry) {
                        // Build the original entry HTML to inject
                        const tagCounts = JournalManager.countTags(studentId, appState.currentPeriod);
                        const threshold = JournalManager.getThreshold();
                        const isIsolated = JournalManager.isEntryIsolated(entry, tagCounts);

                        const tagsHTML = entry.tags.map(tagId => {
                            const tag = JournalManager.getTag(tagId);
                            if (!tag) return '';
                            return `<span class="journal-tag" style="--tag-color: ${tag.color}">
                            <iconify-icon icon="${tag.icon}"></iconify-icon> ${tag.label}
                            </span>`;
                        }).join('');

                        const infoIcon = isIsolated
                            ? `<span class="journal-entry-info tooltip" data-tooltip="Observation isolée (< ${threshold}×) — non transmise à l'IA"><iconify-icon icon="solar:info-circle-linear"></iconify-icon></span>`
                            : '';

                        const entryHTML = `
                            <div class="journal-entry crossfade-in ${isIsolated ? 'isolated' : ''}" data-entry-id="${entry.id}">
                                <div class="journal-entry-date">${JournalManager.formatDate(entry.date)}</div>
                                <div class="journal-entry-content">
                                    <div class="journal-entry-tags">
                                        ${tagsHTML}
                                        ${infoIcon}
                                    </div>
                                    ${entry.note ? `<div class="journal-entry-note">${entry.note}</div>` : ''}
                                </div>
                                <div class="journal-entry-actions">
                                    <button type="button" class="journal-entry-action-btn journal-entry-edit tooltip" data-entry-id="${entry.id}" aria-label="Modifier l'observation" data-tooltip="Modifier">
                                        <iconify-icon icon="solar:pen-linear"></iconify-icon>
                                    </button>
                                    <button type="button" class="journal-entry-action-btn journal-entry-delete tooltip" data-entry-id="${entry.id}" aria-label="Supprimer l'observation" data-tooltip="Supprimer">
                                        <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                                    </button>
                                </div>
                            </div>
                        `;

                        // Inject the entry card at the same position as the draft
                        const entryWrapper = document.createElement('div');
                        entryWrapper.className = 'journal-crossfade-wrapper';
                        entryWrapper.innerHTML = entryHTML;
                        draftPreview.after(entryWrapper);

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
                const headerTitleText = document.querySelector('.journal-draft-title-text');
                if (headerTitleText) {
                    headerTitleText.textContent = 'Nouvelle observation';
                }
                const headerIcon = document.querySelector('.journal-draft-title iconify-icon');
                if (headerIcon) {
                    headerIcon.setAttribute('icon', 'solar:add-circle-linear');
                }
                const charCount = document.getElementById('journalCharCount');
                if (charCount) charCount.textContent = '0';

                if (noteInput) noteInput.value = '';
                if (saveBtn) {
                    saveBtn.disabled = true;
                    const saveBtnSpan = saveBtn.querySelector('span');
                    if (saveBtnSpan) saveBtnSpan.textContent = 'Enregistrer';
                }

                // Clear selected chips
                const chipsContainer = document.getElementById('journalSelectedTags');
                if (chipsContainer) chipsContainer.innerHTML = '';

                this._updatePillDirectStates();
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
     * Ensure draft preview is visible when tags are selected
     * @private
     */
    _updateDraftPreviewVisibility() {
        const draftPreview = document.getElementById('journalDraftPreview');
        if (!draftPreview) return;

        // If tags are selected, ensure draft preview is visible.
        // Never auto-hide when tags become empty: the user is in editing mode
        // and may write a note or pick another tag.
        if (this._selectedJournalTags.length > 0) {
            draftPreview.classList.add('visible');
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

        // Handle direct pill buttons (Difficulté, Remarque)
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

        if (!studentId) return;

        // If no tags selected but note is provided, automatically default to 'remarque'
        if (this._selectedJournalTags.length === 0) {
            if (note.length > 0) {
                this._selectedJournalTags = ['remarque'];
            } else {
                return; // Nothing to save
            }
        }

        // Disable button immediately
        const saveBtn = document.getElementById('journalDraftSaveBtn');
        if (saveBtn) saveBtn.disabled = true;

        // Animate closing
        const draftPreview = document.getElementById('journalDraftPreview');
        if (draftPreview) draftPreview.classList.add('closing');

        const wasEditingId = this._editingJournalEntryId;

        // Execute save after animation
        setTimeout(() => {
            let entry;

            if (wasEditingId) {
                // Update existing
                entry = JournalManager.updateEntry(studentId, wasEditingId, {
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
                const section = document.getElementById('focusJournalSection');
                section?.classList.remove('editing');

                const draft = document.getElementById('journalDraftPreview');
                if (draft) {
                    draft.classList.remove('visible', 'closing', 'is-editing');
                    const noteInput = draft.querySelector('#journalNoteInput');
                    if (noteInput) noteInput.value = '';
                    const charCount = draft.querySelector('#journalCharCount');
                    if (charCount) charCount.textContent = '0';
                    const selectedTags = draft.querySelector('#journalSelectedTags');
                    if (selectedTags) selectedTags.innerHTML = '';
                    const saveBtn = draft.querySelector('#journalDraftSaveBtn');
                    if (saveBtn) saveBtn.disabled = true;
                }
                this._updatePillDirectStates();

                // Re-render journal
                const result = appState.generatedResults.find(r => r.id === studentId);
                if (result) {
                    // If new entry, highlight it
                    const highlightId = wasEditingId ? null : entry.id;
                    this.render(result, highlightId);
                }
            } else {
                // If failed, re-enable button and remove closing class
                if (saveBtn) saveBtn.disabled = false;
                if (draftPreview) draftPreview.classList.remove('closing');
            }
        }, 300);
    }
};
