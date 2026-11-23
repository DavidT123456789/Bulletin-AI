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
import { Utils } from '../utils/Utils.js';
import { SpeechRecognitionManager } from './SpeechRecognitionManager.js';
import { HistoryManager } from './HistoryManager.js';
import { bus, EVENTS } from '../core/EventBus.js';

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
     * Check whether the journal quick-add or inline editor is currently open
     * @returns {boolean}
     */
    isEditing() {
        const section = document.getElementById('focusJournalSection');
        const draftPreview = document.getElementById('journalDraftPreview');
        return Boolean(
            this._editingJournalEntryId ||
            section?.classList.contains('editing') ||
            (draftPreview?.classList.contains('visible') && !draftPreview?.classList.contains('closing'))
        );
    },

    /**
     * Close the threshold popover and sync HistoryManager
     * @param {Object} [options={}]
     */
    closeThresholdPopover(options = {}) {
        const thresholdControl = document.getElementById('journalThresholdControl');
        if (!thresholdControl || !thresholdControl.classList.contains('open')) return;
        thresholdControl.classList.remove('open');
        if (!options?.causedByHistory && !options?.silentHistory && HistoryManager.isOpen('focusJournalThreshold')) {
            HistoryManager.handleManualClose('focusJournalThreshold');
        }
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
                if (thresholdControl.classList.contains('open')) {
                    this.closeThresholdPopover();
                } else {
                    thresholdControl.classList.add('open');
                    this._updateThresholdUI();
                    HistoryManager.pushState('focusJournalThreshold', (opts) => this.closeThresholdPopover(opts));
                }
            });

            // Close on outside click or Escape key
            document.addEventListener('click', (e) => {
                if (!thresholdControl.contains(e.target)) {
                    this.closeThresholdPopover();
                }
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && thresholdControl.classList.contains('open')) {
                    this.closeThresholdPopover();
                }
            });

            const applyJournalAISetting = (updates) => {
                const currentClassId = appState.currentClassId;
                const currentClass = currentClassId ? ClassManager.getClassById(currentClassId) : null;
                if (currentClass) {
                    Object.assign(currentClass, updates);
                } else {
                    Object.assign(appState, updates);
                }

                const studentId = this._getCurrentStudentId();
                const result = appState.generatedResults.find(r => r.id === studentId);
                if (result) {
                    this.render(result);
                } else {
                    this._updateThresholdUI();
                }

                // Defer persistence, prompt-hash & background list refresh after paint so the toggle animates at 0ms
                if (this._thresholdDeferredTimer) {
                    clearTimeout(this._thresholdDeferredTimer);
                }
                this._pendingThresholdUpdates = {
                    ...(this._pendingThresholdUpdates || {}),
                    ...updates
                };
                const flushDeferred = () => {
                    this._thresholdDeferredTimer = null;
                    const pending = this._pendingThresholdUpdates;
                    this._pendingThresholdUpdates = null;
                    if (!pending) return;

                    if (currentClassId) {
                        ClassManager.updateClass(currentClassId, pending);
                    } else {
                        StorageManager.saveAppState();
                    }
                    if (result) {
                        this._refreshStatus();
                    }
                    bus.emit(EVENTS.JOURNAL_THRESHOLD_CHANGED, {
                        newThreshold: JournalManager.getThreshold(),
                        includeInAI: JournalManager.isIncludedInAI(),
                        classId: currentClassId || null
                    });
                };
                this._thresholdDeferredTimer = setTimeout(flushDeferred, 0);
            };

            // AI Inclusion toggle ("Transmettre à l'IA" / Hors IA personal notepad mode)
            const includeAIToggle = document.getElementById('journalIncludeAIToggle');
            if (includeAIToggle) {
                includeAIToggle.addEventListener('change', (e) => {
                    e.stopPropagation();
                    applyJournalAISetting({ journalIncludeInAI: Boolean(includeAIToggle.checked) });
                });
            }

            // Threshold segmented buttons (1, 2, 3)
            thresholdControl.querySelectorAll('.journal-threshold-option[data-threshold]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!JournalManager.isIncludedInAI()) return;
                    const newValue = parseInt(btn.dataset.threshold, 10);
                    if (Number.isNaN(newValue) || newValue < 1 || newValue > 3) return;
                    if (newValue === JournalManager.getThreshold()) return;
                    applyJournalAISetting({ journalThreshold: newValue });
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
        if (!container) return;
        if (this._draftListenersAbortController) {
            this._draftListenersAbortController.abort();
        }
        this._draftListenersAbortController = new AbortController();
        const { signal } = this._draftListenersAbortController;

        const draftCancelFooter = container.querySelector('#journalDraftCancelFooterBtn');
        const draftSave = container.querySelector('#journalDraftSaveBtn');
        const draftInput = container.querySelector('#journalNoteInput');

        if (draftCancelFooter) draftCancelFooter.addEventListener('click', () => this.toggleQuickAdd(false), { signal });

        if (draftSave) {
            draftSave.addEventListener('click', (e) => {
                e.preventDefault();
                this._saveEntry();
            }, { signal });
            draftSave.addEventListener('pointerdown', (e) => {
                e.preventDefault();
            }, { signal });
        }

        if (draftInput) {
            draftInput.addEventListener('input', () => {
                const len = draftInput.value.length;
                const charCount = container.querySelector('#journalCharCount');
                if (charCount) {
                    charCount.textContent = len;
                    charCount.closest('.journal-char-count')?.classList.toggle('is-visible', len >= 200);
                }
                this._updateSaveButton();
            }, { signal });
            draftInput.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    const btn = container.querySelector('#journalDraftSaveBtn');
                    if (btn && !btn.disabled) this._saveEntry();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleQuickAdd(false);
                }
            }, { signal });
        }

        // Voice dictation mic button
        const micBtn = container.querySelector('#journalNoteMicBtn');
        if (micBtn) {
            SpeechRecognitionManager.setupButton(micBtn, 'journal');
        }

        this._updatePillDirectStates();
        this._setupDraftPillButtons(container, signal);
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
            this._initTooltips(contentEl);
            this._updateCountBadge(result);
            this._callbacks.bindScrollAffordances?.(contentEl);
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
            // Keep DOM node intact (no flicker/layout shift) while keeping title/subtitle synced
            const { title, subtitle } = JournalManager.getEmptyStateCopy(result.classId, appState.currentPeriod);
            const titleEl = existingEmpty.querySelector('.journal-empty-title');
            const subtitleEl = existingEmpty.querySelector('.journal-empty-subtitle');
            if (titleEl && titleEl.textContent !== title) titleEl.textContent = title;
            if (subtitleEl && subtitleEl.textContent !== subtitle) subtitleEl.textContent = subtitle;
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
            this._initTooltips(timelineContainer);
        }

        // Interactive empty state: click to open draft
        this._setupEmptyStateHandler(timelineContainer);

        // Update count badge
        this._updateCountBadge(result);
        this._callbacks.bindScrollAffordances?.(contentEl);
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
            let deleteTimeout = null;
            let outsideClickListener = null;
            let escapeListener = null;

            const resetConfirm = () => {
                btn.classList.remove('confirm-delete');
                btn.closest('.journal-entry-actions')?.classList.remove('has-confirm-delete');
                if (deleteTimeout) {
                    clearTimeout(deleteTimeout);
                    deleteTimeout = null;
                }
                if (outsideClickListener) {
                    document.removeEventListener('click', outsideClickListener);
                    outsideClickListener = null;
                }
                if (escapeListener) {
                    document.removeEventListener('keydown', escapeListener);
                    escapeListener = null;
                }
            };

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

                    outsideClickListener = (ev) => {
                        if (!btn.contains(ev.target)) resetConfirm();
                    };

                    escapeListener = (ev) => {
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
                            // Refresh badge status
                            this._refreshStatus();
                        }, 400); // Wait for animation
                    }
                }
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
                const includeInAI = JournalManager.isIncludedInAI(result.classId);
                const threshold = JournalManager.getThreshold(result.classId);

                // Render detailed counts with icons using standard journal-tag class for consistency
                const html = aggregated.map(item => {
                    const isBelow = includeInAI && item.count < threshold;
                    const belowClass = isBelow ? 'below-threshold' : '';
                    const escapedLabel = Utils.escapeHtml(item.label);
                    return `
                    <span class="journal-tag journal-count-tag ${belowClass}" style="--tag-color: ${item.color}; --tag-ink: ${item.ink || item.color}" data-tooltip="${escapedLabel} : ${item.count}">
                        <iconify-icon icon="${item.icon}"></iconify-icon> ${item.count}
                    </span>
                `}).join('');

                TooltipsUI.cleanupTooltipsIn(countBadge);
                countBadge.innerHTML = html;
                countBadge.classList.remove('is-hidden');
                TooltipsUI.initTooltips(countBadge);
            } else {
                TooltipsUI.cleanupTooltipsIn(countBadge);
                countBadge.innerHTML = '';
                countBadge.classList.add('is-hidden');
            }
        }
    },

    /**
     * Handle tag toggle from direct pill buttons
     * @param {string} tagId - ID of toggled tag
     */
    handleTagSelection(tagId) {
        if (!tagId || tagId === 'remarque') return;

        if (this._selectedJournalTags.includes(tagId)) {
            this._selectedJournalTags = this._selectedJournalTags.filter(t => t !== tagId);
        } else {
            this._selectedJournalTags.push(tagId);
        }

        this._updatePillDirectStates();
        this._updateSaveButton();
    },

    /**
     * Update active visual & ARIA state for direct tag pill buttons
     * @private
     */
    _updatePillDirectStates() {
        const pillsContainer = document.getElementById('journalDraftPills');
        if (!pillsContainer) return;

        pillsContainer.querySelectorAll('.journal-pill-direct').forEach(btn => {
            const tagId = btn.dataset.tagId;
            const isSelected = this._selectedJournalTags.includes(tagId);
            btn.classList.toggle('selected', isSelected);
            btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        });
    },

    /**
     * Update threshold & AI inclusion UI (button label, icon, scope, segmented control + popover state)
     * @private
     */
    _updateThresholdUI() {
        const threshold = JournalManager.getThreshold();
        const includeInAI = JournalManager.isIncludedInAI();
        const currentClassId = appState.currentClassId;
        const currentClass = currentClassId ? ClassManager.getClassById(currentClassId) : null;

        // Update button label & icon
        const btnValue = document.getElementById('journalThresholdValue');
        if (btnValue) {
            btnValue.textContent = includeInAI ? `IA · ≥${threshold}` : 'Hors IA';
        }
        const btnIcon = document.getElementById('journalThresholdIcon');
        if (btnIcon) {
            btnIcon.setAttribute('icon', includeInAI ? 'solar:stars-minimalistic-linear' : 'solar:eye-closed-linear');
        }

        // Update scope subtitle in popover
        const scopeLabel = document.getElementById('journalThresholdScope');
        if (scopeLabel) {
            scopeLabel.textContent = currentClass ? `Classe : ${currentClass.name}` : 'Réglage global';
        }

        // Update AI toggle & segmented block state
        const includeAIToggle = document.getElementById('journalIncludeAIToggle');
        if (includeAIToggle) {
            includeAIToggle.checked = includeInAI;
        }
        const stepperBlock = document.getElementById('journalThresholdStepperBlock');
        if (stepperBlock) {
            stepperBlock.classList.toggle('is-disabled', !includeInAI);
        }
        const aiOffHint = document.getElementById('journalAiOffHint');
        if (aiOffHint) {
            aiOffHint.classList.toggle('is-hidden', includeInAI);
        }

        // Update segmented control (1, 2, 3) & glider index
        const thresholdControl = document.getElementById('journalThresholdControl');
        const segmented = document.getElementById('journalThresholdSegmented');
        if (thresholdControl) {
            thresholdControl.classList.toggle('is-ai-excluded', !includeInAI);
        }
        if (segmented) {
            const clampedIndex = Math.max(0, Math.min(2, threshold - 1));
            segmented.dataset.activeIndex = String(clampedIndex);
            segmented.querySelectorAll('.journal-threshold-option[data-threshold]').forEach(opt => {
                const val = parseInt(opt.dataset.threshold, 10);
                const isSelected = val === Math.max(1, Math.min(3, threshold));
                opt.classList.toggle('active', isSelected);
                opt.setAttribute('aria-checked', isSelected ? 'true' : 'false');
                opt.disabled = !includeInAI;
            });
        }

        // Update dynamic contextual hint
        const hintEl = document.getElementById('thresholdHintText');
        if (hintEl) {
            if (threshold <= 1) {
                hintEl.textContent = 'Chaque tag et chaque note écrite est transmis à l\'IA.';
            } else if (threshold === 2) {
                hintEl.textContent = 'Tags répétés (≥2) et toutes les notes écrites transmis.';
            } else if (threshold === 3) {
                hintEl.textContent = 'Uniquement les tendances fréquentes (≥3) et notes écrites.';
            } else {
                hintEl.textContent = `Tags répétés (≥${threshold}) et toutes les notes écrites transmis.`;
            }
        }

        // Update tooltip on button
        const btn = document.getElementById('journalThresholdBtn');
        if (btn) {
            btn.classList.toggle('is-ai-excluded', !includeInAI);
            const contextLabel = currentClass ? `(Classe : ${currentClass.name})` : '(Global)';
            const tooltip = includeInAI
                ? `Journal transmis à l'IA · Seuil ≥${threshold} ${contextLabel}<br><span class="kbd-hint">Notes écrites toujours incluses · Cliquer pour régler</span>`
                : `Bloc-notes personnel (Hors IA) ${contextLabel}<br><span class="kbd-hint">Cliquer pour réactiver la transmission IA</span>`;
            TooltipsUI.updateTooltip(btn, tooltip);
        }
    },

    /**
     * Toggle the journal editing mode
     * @param {boolean} show - True to show editing UI, false to hide
     * @param {boolean} [reset=true] - Whether to reset the input fields (default: true)
     * @param {Object} [options={}]
     */
    toggleQuickAdd(show, reset = true, options = {}) {
        const section = document.getElementById('focusJournalSection');
        const studentId = this._getCurrentStudentId();

        // If hiding (Cancel), always reset editing state and re-render to standard view
        if (!show) {
            if (!options?.causedByHistory && !options?.silentHistory && HistoryManager.isOpen('focusJournalQuickAdd')) {
                HistoryManager.handleManualClose('focusJournalQuickAdd');
            }
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
                    if (charCount) {
                        charCount.textContent = '0';
                        charCount.closest('.journal-char-count')?.classList.remove('is-visible');
                    }
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
                        // Build the original entry HTML to inject via shared SSOT helper
                        const currentStudent = getCurrentResult();
                        const classId = currentStudent?.classId || null;
                        const tagCounts = JournalManager.countTags(studentId, appState.currentPeriod);
                        const threshold = JournalManager.getThreshold(classId);
                        const entryHTML = JournalManager.renderEntryCard(entry, tagCounts, threshold, classId, 'crossfade-in');

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
                const charCount = document.getElementById('journalCharCount');
                if (charCount) {
                    charCount.textContent = '0';
                    charCount.closest('.journal-char-count')?.classList.remove('is-visible');
                }

                if (noteInput) noteInput.value = '';
                if (saveBtn) {
                    saveBtn.disabled = true;
                    const saveBtnSpan = saveBtn.querySelector('span');
                    if (saveBtnSpan) saveBtnSpan.textContent = 'Enregistrer';
                }

                this._updatePillDirectStates();
            }

            // Show the draft preview when opening
            draftPreview?.classList.add('visible');
            HistoryManager.pushState('focusJournalQuickAdd', (opts) => this.toggleQuickAdd(false, true, opts));
        }

        // Remove visual dimming from original entries
        document.querySelectorAll('.journal-entry.editing-original').forEach(el => el.classList.remove('editing-original'));
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
     * Setup flat direct-toggle pill button event handlers inside draft
     * @param {HTMLElement} container - The content container
     * @private
     */
    _setupDraftPillButtons(container, signal) {
        const pillsContainer = container.querySelector('#journalDraftPills');
        if (!pillsContainer) return;

        const listenerOpts = signal ? { signal } : undefined;

        pillsContainer.querySelectorAll('.journal-pill-direct').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tagId = btn.dataset.tagId;
                this.handleTagSelection(tagId);
            }, listenerOpts);
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

        // 1. Set editing state and sync tags (exclude implicit 'remarque' auto-tag)
        this._editingJournalEntryId = entryId;
        this._selectedJournalTags = (Array.isArray(entry.tags) ? entry.tags : []).filter(t => t !== 'remarque');

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
        HistoryManager.pushState('focusJournalQuickAdd', (opts) => this.toggleQuickAdd(false, true, opts));
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

        if (HistoryManager.isOpen('focusJournalQuickAdd')) {
            HistoryManager.handleManualClose('focusJournalQuickAdd');
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
            } else {
                // Create new
                entry = JournalManager.addEntry(studentId, {
                    tags: [...this._selectedJournalTags],
                    note: note
                });
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
                    if (charCount) {
                        charCount.textContent = '0';
                        charCount.closest('.journal-char-count')?.classList.remove('is-visible');
                    }
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
