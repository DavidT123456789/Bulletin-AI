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

    /** Whether active draft/edit entry is marked as private (excluded from AI) */
    _isDraftPrivate: false,

    /** Last rendered student+period key to restrict timeline fade-in to context switches */
    _lastRenderedContext: null,

    /** Pending close/crossfade timer handle */
    _closeTimer: null,

    /** Active transitionend cleanup callback for draft close */
    _closeTransitionCleanup: null,

    /**
     * Check whether the user prefers reduced motion
     * @returns {boolean}
     * @private
     */
    _prefersReducedMotion() {
        return Boolean(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    },

    /**
     * Cancel any pending draft close/crossfade timeout, transition listener, and height-lock style
     * @private
     */
    _clearCloseTimer() {
        if (this._closeTimer) {
            clearTimeout(this._closeTimer);
            this._closeTimer = null;
        }
        if (this._closeTransitionCleanup) {
            this._closeTransitionCleanup();
            this._closeTransitionCleanup = null;
        }
        const contentEl = document.getElementById('focusJournalContent');
        if (contentEl) {
            contentEl.classList.remove('is-collapsing');
            contentEl.style.maxHeight = '';
        }
    },

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
     * @param {Object} [options]
     * @private
     */
    _refreshStatus(options) {
        this._callbacks.onStatusRefresh?.(options);
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
     * Resolve the physical class ID owning the current student's journal AI settings.
     * Falls back to null (global settings) when viewing a virtual class without a physical student class.
     * @param {Object|null} [result=null]
     * @returns {string|null}
     * @private
     */
    _resolveTargetClassId(result = null) {
        const targetResult = result || (this._getCurrentStudentId()
            ? appState.generatedResults?.find(r => r.id === this._getCurrentStudentId())
            : null);
        const candidateId = targetResult?.classId || appState.currentClassId || null;
        if (candidateId && ClassManager.isVirtualClass?.(candidateId)) {
            return null;
        }
        return candidateId;
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

            const flushDeferredThresholdUpdates = () => {
                if (this._thresholdDeferredTimer) {
                    clearTimeout(this._thresholdDeferredTimer);
                    this._thresholdDeferredTimer = null;
                }
                const pending = this._pendingThresholdUpdates;
                const pendingClassId = this._pendingThresholdClassId ?? null;
                const pendingStudentId = this._pendingThresholdStudentId ?? null;
                this._pendingThresholdUpdates = null;
                this._pendingThresholdClassId = null;
                this._pendingThresholdStudentId = null;
                if (!pending) return;

                if (pendingClassId) {
                    ClassManager.updateClass(pendingClassId, pending);
                } else {
                    StorageManager.saveAppState();
                }
                if (pendingStudentId && this._getCurrentStudentId() === pendingStudentId) {
                    this._refreshStatus({ dirtyOnly: true });
                }
                bus.emit(EVENTS.JOURNAL_AI_SETTINGS_CHANGED, {
                    includeNotes: JournalManager.isNotesIncludedInAI(pendingClassId),
                    includeTags: JournalManager.isTagsIncludedInAI(pendingClassId),
                    includeInAI: JournalManager.isIncludedInAI(pendingClassId),
                    classId: pendingClassId
                });
            };

            const applyJournalAISetting = (updates) => {
                const studentId = this._getCurrentStudentId();
                const result = studentId ? appState.generatedResults?.find(r => r.id === studentId) : null;
                const targetClassId = this._resolveTargetClassId(result);
                const targetClass = targetClassId ? ClassManager.getClassById(targetClassId) : null;
                const effectiveClassId = targetClass ? targetClassId : null;

                // If a pending deferred update targets another class, commit it before switching targets
                if (this._pendingThresholdUpdates && this._pendingThresholdClassId !== effectiveClassId) {
                    flushDeferredThresholdUpdates();
                }

                const resolvedChannels = {
                    journalIncludeNotes: updates.journalIncludeNotes ?? JournalManager.isNotesIncludedInAI(effectiveClassId),
                    journalIncludeTags: updates.journalIncludeTags ?? JournalManager.isTagsIncludedInAI(effectiveClassId)
                };

                const payloadWithTimestamp = effectiveClassId
                    ? { ...resolvedChannels, journalSettingsUpdatedAt: Date.now() }
                    : resolvedChannels;

                if (targetClass) {
                    delete targetClass.journalIncludeInAI;
                    delete targetClass.journalThreshold;
                    Object.assign(targetClass, payloadWithTimestamp);
                } else {
                    Object.assign(appState, resolvedChannels);
                }

                if (result) {
                    this._syncAIStateInPlace(result);
                } else {
                    this._updateThresholdUI();
                }

                // Defer persistence, prompt-hash & background list refresh after paint so the toggle animates at 0ms
                if (this._thresholdDeferredTimer) {
                    clearTimeout(this._thresholdDeferredTimer);
                }
                this._pendingThresholdClassId = effectiveClassId;
                this._pendingThresholdStudentId = result?.id || null;
                this._pendingThresholdUpdates = {
                    ...(this._pendingThresholdUpdates || {}),
                    ...payloadWithTimestamp
                };
                this._thresholdDeferredTimer = setTimeout(flushDeferredThresholdUpdates, 0);
            };

            // Written observations toggle ("Observations écrites")
            const includeNotesToggle = document.getElementById('journalIncludeNotesToggle');
            if (includeNotesToggle) {
                includeNotesToggle.addEventListener('change', (e) => {
                    e.stopPropagation();
                    applyJournalAISetting({ journalIncludeNotes: Boolean(includeNotesToggle.checked) });
                });
            }

            // Tags toggle ("Tags")
            const includeTagsToggle = document.getElementById('journalIncludeTagsToggle');
            if (includeTagsToggle) {
                includeTagsToggle.addEventListener('change', (e) => {
                    e.stopPropagation();
                    applyJournalAISetting({ journalIncludeTags: Boolean(includeTagsToggle.checked) });
                });
            }
        }

        // Note button in header & empty-header click (Ajouter une observation)
        const openQuickAdd = () => {
            this.toggleQuickAdd(true, true);
            const journalContent = document.getElementById('focusJournalContent');
            if (journalContent) {
                requestAnimationFrame(() => {
                    journalContent.scrollTo({
                        top: 0,
                        behavior: this._prefersReducedMotion() ? 'auto' : 'smooth'
                    });
                });
            }
        };

        const noteBtn = document.getElementById('focusJournalNoteBtn');
        if (noteBtn) {
            noteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.isEditing()) {
                    this.toggleQuickAdd(false);
                    return;
                }
                openQuickAdd();
            });
        }

        const journalHeader = document.getElementById('focusJournalHeader');
        if (journalHeader) {
            journalHeader.addEventListener('click', (e) => {
                const section = document.getElementById('focusJournalSection');
                if (!section?.classList.contains('is-empty') || section.classList.contains('editing')) return;
                if (e.target.closest('#journalThresholdControl, #focusJournalNoteBtn')) return;
                openQuickAdd();
            });
        }

        // Journal Entry Click (Delegated Edit)
        const journalContent = document.getElementById('focusJournalContent');
        if (journalContent) {
            journalContent.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.journal-entry-delete');
                const statusBadge = e.target.closest('.journal-private-badge');
                if (deleteBtn || statusBadge) return;

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

        // Private toggle button
        const privateBtn = container.querySelector('#journalDraftPrivateBtn');
        if (privateBtn) {
            privateBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._isDraftPrivate = !this._isDraftPrivate;
                privateBtn.classList.toggle('is-active', this._isDraftPrivate);
                privateBtn.setAttribute('aria-pressed', this._isDraftPrivate ? 'true' : 'false');
            }, { signal });
        }

        this._updatePillDirectStates();
        this._setupDraftPillButtons(container, signal);
    },

    /**
     * Update inline empty-state hint text based on AI inclusion mode
     * @param {string|null} [classId=null]
     * @private
     */
    _updateEmptyHint(classId = null) {
        const hintEl = document.getElementById('focusJournalEmptyHint');
        if (!hintEl) return;
        hintEl.textContent = JournalManager.isIncludedInAI(classId)
            ? 'Aucune observation'
            : 'Bloc-notes vide · Hors IA';
    },

    /**
     * Sync existing .journal-empty title & subtitle in place without replacing DOM
     * @param {HTMLElement|null} existingEmpty
     * @param {string|null} [classId=null]
     * @private
     */
    _syncEmptyStateCopy(existingEmpty, classId = null) {
        if (!existingEmpty) return;
        const { title, subtitle } = JournalManager.getEmptyStateCopy(classId, appState.currentPeriod);
        const titleEl = existingEmpty.querySelector('.journal-empty-title');
        const subtitleEl = existingEmpty.querySelector('.journal-empty-subtitle');
        if (titleEl && titleEl.textContent !== title) titleEl.textContent = title;
        if (subtitleEl && subtitleEl.textContent !== subtitle) subtitleEl.textContent = subtitle;
    },

    /**
     * Render Journal section for current student
     * @param {Object} result - Student data
     * @param {string|null} [highlightEntryId=null] - Entry ID to highlight after save
     * @param {Object} [options={}]
     * @param {boolean} [options.animateTimeline] - Force timeline fade-in on or off (defaults to true only on student/period switch)
     * @param {string} [options.highlightClass='enter'] - Animation class for highlighted entry
     */
    render(result, highlightEntryId = null, options = {}) {
        if (!result?.id) {
            this._lastRenderedContext = null;
            // Hide journal section in creation mode
            const section = document.getElementById('focusJournalSection');
            if (section) {
                section.classList.remove('is-empty');
                section.style.display = 'none';
            }
            return;
        }

        const contextKey = `${result.id}:${appState.currentPeriod}`;
        const shouldFadeIn = options.animateTimeline !== undefined
            ? Boolean(options.animateTimeline)
            : this._lastRenderedContext !== contextKey;
        this._lastRenderedContext = contextKey;

        const highlightClass = options.highlightClass || 'enter';

        const section = document.getElementById('focusJournalSection');
        if (section) section.style.display = '';

        const titleEl = document.getElementById('focusJournalTitle');
        if (titleEl) {
            const periodLabel = appState.currentPeriod ? Utils.getPeriodLabel(appState.currentPeriod, false) : '';
            titleEl.textContent = periodLabel ? `Journal ${periodLabel}` : 'Journal';
        }

        // Compute AI summary once per render (SSOT shared between footer and header count badges)
        const aiSummary = JournalManager.getAISummary(result, appState.currentPeriod);
        this._updateThresholdUI(result, aiSummary);

        const contentEl = document.getElementById('focusJournalContent');
        if (!contentEl) return;

        // If editing an entry inline, render the inline editor in full
        if (this._editingJournalEntryId) {
            section?.classList.remove('is-empty');
            TooltipsUI.cleanupTooltipsIn(contentEl);
            contentEl.innerHTML = JournalManager.renderTimeline(
                result.id,
                appState.currentPeriod,
                highlightEntryId,
                this._editingJournalEntryId,
                highlightClass
            );
            this._setupDraftListeners(contentEl);
            this._setupDeleteHandlers(contentEl, result);
            this._initTooltips(contentEl);
            this._updateCountBadge(result, aiSummary);
            this._callbacks.bindScrollAffordances?.(contentEl);
            return;
        }

        // Standard view: Ensure top draft preview exists
        let draftPreview = contentEl.querySelector('#journalDraftPreview');
        let timelineContainer = contentEl.querySelector('#journalTimelineContainer');

        if (!draftPreview || !timelineContainer) {
            TooltipsUI.cleanupTooltipsIn(contentEl);
            contentEl.innerHTML = `
                ${JournalManager.renderDraftPreview(null, result.classId)}
                <div class="journal-timeline-container" id="journalTimelineContainer"></div>
            `;
            draftPreview = contentEl.querySelector('#journalDraftPreview');
            timelineContainer = contentEl.querySelector('#journalTimelineContainer');
            this._setupDraftListeners(contentEl);
        } else {
            draftPreview.classList.remove('closing');
            if (!section?.classList.contains('editing')) {
                draftPreview.classList.remove('visible', 'is-editing');
                this._syncNoteButtonState(false);
            }
        }

        const entries = JournalManager.getEntriesForPeriod(result.id, appState.currentPeriod);
        const isNewEmpty = entries.length === 0;
        section?.classList.toggle('is-empty', isNewEmpty);
        this._updateEmptyHint(result.classId);
        const existingEmpty = timelineContainer.querySelector('.journal-empty');

        if (isNewEmpty && existingEmpty) {
            // Keep DOM node intact (no flicker/layout shift) while keeping title/subtitle synced
            this._syncEmptyStateCopy(existingEmpty, result.classId);
        } else if (isNewEmpty) {
            TooltipsUI.cleanupTooltipsIn(timelineContainer);
            timelineContainer.innerHTML = JournalManager.renderTimeline(
                result.id,
                appState.currentPeriod,
                null,
                null
            );
            if (shouldFadeIn) {
                timelineContainer.querySelector('.journal-empty')?.classList.add('fade-in');
            }
        } else {
            TooltipsUI.cleanupTooltipsIn(timelineContainer);
            timelineContainer.innerHTML = JournalManager.renderTimeline(
                result.id,
                appState.currentPeriod,
                highlightEntryId,
                null,
                highlightClass
            );
            if (shouldFadeIn) {
                timelineContainer.querySelector('.journal-timeline')?.classList.add('fade-in');
            }

            // Calibrate height of sliding-in entry so expansion matches exact rendered height
            if (highlightEntryId && highlightClass === 'enter' && !this._prefersReducedMotion()) {
                const entryEl = timelineContainer.querySelector('.journal-entry.enter');
                if (entryEl) {
                    entryEl.classList.remove('enter');
                    const exactHeight = entryEl.offsetHeight;
                    if (exactHeight > 0) {
                        entryEl.style.setProperty('--entry-target-height', `${exactHeight}px`);
                        void entryEl.offsetHeight;
                    }
                    entryEl.classList.add('enter');
                }
            }

            this._setupDeleteHandlers(timelineContainer, result);
            this._initTooltips(timelineContainer);
        }

        // Interactive empty state: click to open draft
        this._setupEmptyStateHandler(timelineContainer);

        // Update count badge
        this._updateCountBadge(result, aiSummary);
        this._callbacks.bindScrollAffordances?.(contentEl);
    },

    /**
     * Surgically sync AI transmission & threshold visuals in place without rebuilding
     * timeline DOM or destroying <iconify-icon> elements (zero icon flicker, preserves inline editor).
     * Falls back to full render() only if the timeline has not been mounted yet.
     * @param {Object} result - Student data
     * @private
     */
    _syncAIStateInPlace(result) {
        if (!result?.id) {
            this._updateThresholdUI();
            return;
        }

        const contentEl = document.getElementById('focusJournalContent');
        if (!contentEl?.querySelector('#journalTimelineContainer, .journal-timeline, .journal-empty')) {
            this.render(result, null, { animateTimeline: false });
            return;
        }

        const aiSummary = JournalManager.getAISummary(result, appState.currentPeriod);
        this._updateThresholdUI(result, aiSummary);

        const entries = JournalManager.getEntriesForPeriod(result.id, appState.currentPeriod);
        const classId = result.classId || null;

        if (entries.length === 0) {
            this._syncEmptyStateCopy(contentEl.querySelector('.journal-empty'), classId);
        }

        this._updateCountBadge(result, aiSummary);
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
            this.toggleQuickAdd(true, true);
            const journalContent = document.getElementById('focusJournalContent');
            journalContent?.scrollTo({
                top: 0,
                behavior: this._prefersReducedMotion() ? 'auto' : 'smooth'
            });
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
                btn.setAttribute('aria-label', "Supprimer l'observation");
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
                    contentEl.querySelectorAll('.confirm-delete').forEach(b => {
                        b.classList.remove('confirm-delete');
                        b.setAttribute('aria-label', "Supprimer l'observation");
                    });
                    contentEl.querySelectorAll('.has-confirm-delete').forEach(a => a.classList.remove('has-confirm-delete'));

                    btn.classList.add('confirm-delete');
                    btn.closest('.journal-entry-actions')?.classList.add('has-confirm-delete');
                    btn.setAttribute('aria-label', "Confirmer la suppression de l'observation");
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

                    const commitDelete = () => {
                        JournalManager.deleteEntry(result.id, entryId);
                        this.render(result, null, { animateTimeline: false });
                    };

                    const entryEl = btn.closest('.journal-entry');
                    if (!entryEl || this._prefersReducedMotion()) {
                        commitDelete();
                        return;
                    }

                    // Lock exact rendered height so CSS transitions smoothly from real height -> 0
                    const currentHeight = entryEl.offsetHeight;
                    if (currentHeight > 0) {
                        entryEl.style.maxHeight = `${currentHeight}px`;
                        void entryEl.offsetHeight;
                    }
                    entryEl.classList.add('leave');

                    setTimeout(commitDelete, 250);
                }
            });
        });
    },

    /**
     * Update count badge with journal entry counts
     * @param {Object} result - Student result
     * @private
     */
    _updateCountBadge(result, precomputedSummary = null) {
        const countBadge = document.getElementById('focusJournalCount');
        if (countBadge) {
            const includeInAI = JournalManager.isIncludedInAI(result.classId);
            const includeTags = JournalManager.isTagsIncludedInAI(result.classId);
            const aggregated = JournalManager.getAggregatedCounts(result.id, appState.currentPeriod, {
                excludePrivate: includeInAI,
                excludeRemarque: true
            });

            if (aggregated.length > 0) {
                const summary = includeTags
                    ? (precomputedSummary || JournalManager.getAISummary(result, appState.currentPeriod))
                    : null;
                const transmittedTagIds = new Set(summary?.transmittedTagIds || []);

                // Show up to 4 tags directly; when 5+, show top 3 + "+N" (never a "+1" replacing a single tag)
                const maxVisible = aggregated.length <= 4 ? 4 : 3;
                const visibleItems = aggregated.slice(0, maxVisible);
                const overflowItems = aggregated.slice(maxVisible);

                // Build tooltip for each visible count tag (semantic tag colors always remain active)
                const visibleMeta = visibleItems.map(item => {
                    const rawLabel = item.label;
                    let tooltipText;
                    if (!includeTags) {
                        tooltipText = `${rawLabel} : ${item.count} (non transmis à l'IA)`;
                    } else if (!transmittedTagIds.has(item.id)) {
                        tooltipText = `${rawLabel} : ${item.count} (hors top 5 transmis à l'IA)`;
                    } else {
                        tooltipText = `${rawLabel} : ${item.count}`;
                    }
                    return { item, tooltipText };
                });

                const existingTags = Array.from(countBadge.querySelectorAll('.journal-count-tag'));
                const existingOverflow = countBadge.querySelector('.tag-more-count');
                const expectedOverflowText = overflowItems.length > 0 ? `+${overflowItems.length}` : null;
                const canPatchInPlace = existingTags.length === visibleMeta.length
                    && visibleMeta.every(({ item }, i) =>
                        existingTags[i].dataset.tagId === item.id &&
                        existingTags[i].dataset.count === String(item.count)
                    )
                    && (existingOverflow ? existingOverflow.textContent : null) === expectedOverflowText;

                if (canPatchInPlace) {
                    visibleMeta.forEach(({ tooltipText }, i) => {
                        TooltipsUI.updateTooltip(existingTags[i], tooltipText);
                    });
                    if (existingOverflow && overflowItems.length > 0) {
                        const overflowTooltip = overflowItems
                            .map(item => `${item.label} : ${item.count}`)
                            .join(' • ');
                        TooltipsUI.updateTooltip(existingOverflow, overflowTooltip);
                    }
                    countBadge.classList.remove('is-hidden');
                    return;
                }

                // Render top 3 tag counts + neutral +N overflow pill to keep header compact
                let html = visibleMeta.map(({ item, tooltipText }) => `
                    <span class="journal-tag journal-count-tag" data-tag-id="${Utils.escapeHtml(String(item.id))}" data-count="${item.count}" style="--tag-color: ${item.color}; --tag-ink: ${item.ink || item.color}" data-tooltip="${Utils.escapeHtml(tooltipText)}">
                        <iconify-icon icon="${item.icon}"></iconify-icon> ${item.count}
                    </span>
                `).join('');

                if (overflowItems.length > 0) {
                    const overflowTooltip = overflowItems
                        .map(item => `${Utils.escapeHtml(item.label)} : ${item.count}`)
                        .join(' • ');
                    html += `<span class="tag-more-count tooltip" data-tooltip="${overflowTooltip}">+${overflowItems.length}</span>`;
                }

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
     * Update threshold & AI inclusion UI (plain-language AI footer line + popover state)
     * @param {Object|null} [result=null]
     * @private
     */
    _updateThresholdUI(result = null, precomputedSummary = null) {
        const targetResult = result || (this._getCurrentStudentId()
            ? appState.generatedResults?.find(r => r.id === this._getCurrentStudentId())
            : null);
        const targetClassId = this._resolveTargetClassId(targetResult);
        const includeNotes = JournalManager.isNotesIncludedInAI(targetClassId);
        const includeTags = JournalManager.isTagsIncludedInAI(targetClassId);
        const includeInAI = includeNotes || includeTags;
        const currentClass = targetClassId ? ClassManager.getClassById(targetClassId) : null;
        const summary = precomputedSummary || (targetResult
            ? JournalManager.getAISummary(targetResult, appState.currentPeriod)
            : null);

        const footerSummaryText = summary?.compactText || '';
        const hasAISignal = Boolean(includeInAI && footerSummaryText);
        let footerText = '';
        if (!includeInAI) {
            footerText = 'Journal personnel · Non transmis à l\'IA';
        } else if (hasAISignal) {
            footerText = `Transmis à l'IA : ${footerSummaryText}`;
        } else if (summary && summary.totalCount > 0 && summary.privateCount === summary.totalCount) {
            const plural = summary.privateCount > 1 ? 's' : '';
            footerText = `Aucune observation transmise · ${summary.privateCount} obs. privée${plural}`;
        } else if (summary && summary.totalCount > 0 && !includeTags) {
            footerText = 'Aucune observation écrite à transmettre';
        } else if (summary && summary.totalCount > 0 && !includeNotes) {
            footerText = 'Aucun tag à transmettre';
        } else {
            footerText = 'Aucune observation transmise';
        }

        // Update footer label & icon
        const btnValue = document.getElementById('journalThresholdValue');
        if (btnValue) {
            if (hasAISignal) {
                btnValue.innerHTML = `<span class="journal-ai-footer-prefix">Transmis à l'IA :</span> <span class="journal-ai-footer-value">${Utils.escapeHtml(footerSummaryText)}</span>`;
            } else {
                btnValue.textContent = footerText;
            }
        }
        const btnIcon = document.getElementById('journalThresholdIcon');
        if (btnIcon) {
            const nextIcon = includeInAI ? 'solar:stars-line-duotone' : 'solar:lock-keyhole-minimalistic-linear';
            if (btnIcon.getAttribute('icon') !== nextIcon) {
                btnIcon.setAttribute('icon', nextIcon);
            }
        }

        // Update scope subtitle in popover
        const scopeLabel = document.getElementById('journalThresholdScope');
        if (scopeLabel) {
            scopeLabel.textContent = currentClass ? `Classe : ${currentClass.name}` : 'Réglage global';
        }

        // Update channel switches
        const includeNotesToggle = document.getElementById('journalIncludeNotesToggle');
        if (includeNotesToggle) {
            includeNotesToggle.checked = includeNotes;
        }
        const includeTagsToggle = document.getElementById('journalIncludeTagsToggle');
        if (includeTagsToggle) {
            includeTagsToggle.checked = includeTags;
        }

        this._updateEmptyHint(targetClassId);

        const section = document.getElementById('focusJournalSection');
        if (section) {
            section.classList.toggle('is-ai-excluded', !includeInAI);
        }
        const thresholdControl = document.getElementById('journalThresholdControl');
        if (thresholdControl) {
            thresholdControl.classList.toggle('is-ai-excluded', !includeInAI);
        }
        const noteInput = document.getElementById('journalNoteInput');
        if (noteInput) {
            noteInput.placeholder = JournalManager.getDraftPlaceholder(includeNotes, includeTags);
        }

        // Update concise footer hint inside popover
        const hintEl = document.getElementById('journalAiPopoverHint');
        if (hintEl) {
            hintEl.textContent = includeInAI
                ? 'Les entrées Privé ne sont jamais transmises.'
                : 'Journal personnel : rien n\'est transmis à l\'IA.';
        }

        // Update tooltip on button (concise 1-line action hint)
        const btn = document.getElementById('journalThresholdBtn');
        if (btn) {
            btn.classList.toggle('is-ai-excluded', !includeInAI);
            btn.classList.toggle('has-ai-signal', hasAISignal);
            let tooltip;
            if (!includeInAI) {
                tooltip = 'Réactiver la transmission du journal à l\'IA';
            } else if (includeNotes && includeTags) {
                tooltip = 'Régler la transmission à l\'IA';
            } else if (includeNotes) {
                tooltip = 'Régler la transmission à l\'IA · Observations écrites seules';
            } else {
                tooltip = 'Régler la transmission à l\'IA · Tags seuls';
            }
            TooltipsUI.updateTooltip(btn, tooltip);
        }
    },

    /**
     * Synchronize the header "+" / "×" toggle button label and tooltip with editing state
     * @param {boolean} isOpen
     * @private
     */
    _syncNoteButtonState(isOpen) {
        const noteBtn = document.getElementById('focusJournalNoteBtn');
        if (!noteBtn) return;
        const label = isOpen ? 'Fermer' : 'Ajouter une observation';
        noteBtn.setAttribute('aria-label', label);
        noteBtn.setAttribute('aria-expanded', String(Boolean(isOpen)));
        TooltipsUI.updateTooltip?.(noteBtn, label);
    },

    /**
     * Synchronously reset any active quick-add or inline-edit journal state (no exit animation).
     * Used on student switches, panel close, and as the shared final cleanup of toggleQuickAdd(false).
     * @param {Object} [options={}]
     * @param {boolean} [options.silentHistory=false] - Skip HistoryManager synchronization
     * @param {boolean} [options.reRender=false] - Re-render the current student's journal after reset
     * @param {string|null} [options.highlightEntryId=null] - Optional entry ID to settle-highlight
     * @param {string} [options.highlightClass='just-saved'] - CSS class for highlighted entry
     */
    resetEditingState({ silentHistory = false, reRender = false, highlightEntryId = null, highlightClass = 'just-saved' } = {}) {
        this._clearCloseTimer();
        if (!silentHistory && HistoryManager.isOpen('focusJournalQuickAdd')) {
            HistoryManager.handleManualClose('focusJournalQuickAdd');
        }
        this._editingJournalEntryId = null;
        this._selectedJournalTags = [];
        this._isDraftPrivate = false;

        const section = document.getElementById('focusJournalSection');
        section?.classList.remove('editing');
        this._syncNoteButtonState(false);

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
            const privateBtn = draft.querySelector('#journalDraftPrivateBtn');
            if (privateBtn) {
                privateBtn.classList.remove('is-active');
                privateBtn.setAttribute('aria-pressed', 'false');
            }
            const saveBtn = draft.querySelector('#journalDraftSaveBtn');
            if (saveBtn) saveBtn.disabled = true;
        }

        this._updatePillDirectStates();
        const contentEl = document.getElementById('focusJournalContent');
        contentEl?.querySelectorAll('.journal-crossfade-wrapper').forEach(w => w.remove());

        if (reRender) {
            const studentId = this._getCurrentStudentId();
            const result = studentId ? appState.generatedResults?.find(r => r.id === studentId) : null;
            if (result) {
                this.render(result, highlightEntryId, { animateTimeline: false, highlightClass });
            }
        } else if (contentEl) {
            this._callbacks.bindScrollAffordances?.(contentEl);
        }
    },

    /**
     * Smoothly collapse the draft/inline-editor while optionally expanding an incoming entry row in lockstep.
     * Both transitions (plus container max-height when scrollable) share the exact same duration & spring easing
     * so total height glides monotonically in a single gesture.
     * @param {HTMLElement|null} draftPreview
     * @param {Object|null} entry - Entry to crossfade into (null for plain cancel)
     * @param {Object|null} result - Student result object
     * @param {Object} [options={}]
     * @param {boolean} [options.isIncoming=false] - Apply subtle highlight tint during arrival
     * @param {Function} options.onComplete - Callback once transition completes
     * @private
     */
    _animateDraftClose(draftPreview, entry, result, { isIncoming = false, onComplete } = {}) {
        this._clearCloseTimer();
        this.closeThresholdPopover();

        const section = document.getElementById('focusJournalSection');
        const contentEl = document.getElementById('focusJournalContent');
        const canAnimate = Boolean(draftPreview && !this._prefersReducedMotion());
        // Measure before mutating DOM classes to avoid an extra forced reflow
        const startHeight = (canAnimate && contentEl && !section?.classList.contains('is-empty'))
            ? contentEl.offsetHeight
            : 0;
        const lockContentHeight = startHeight > 0;

        // Sync header toggle button immediately so × -> + rotates in lockstep with the collapsing editor
        section?.classList.remove('editing');
        this._syncNoteButtonState(false);

        if (!canAnimate) {
            onComplete?.();
            return;
        }

        let entryWrapper = null;
        if (entry && result) {
            const entryHTML = JournalManager.renderEntryCard(
                entry,
                isIncoming ? 'is-incoming' : ''
            );

            entryWrapper = document.createElement('div');
            entryWrapper.className = 'journal-crossfade-wrapper';
            entryWrapper.innerHTML = `<div class="journal-crossfade-inner">${entryHTML}</div>`;
            draftPreview.after(entryWrapper);
        }

        if (lockContentHeight) {
            contentEl.style.maxHeight = `${startHeight}px`;
        }

        // Single forced reflow to commit entryWrapper's 0fr & contentEl's locked start height
        if (entryWrapper || lockContentHeight) {
            void (entryWrapper || contentEl).offsetHeight;
        }

        if (lockContentHeight) {
            contentEl.classList.add('is-collapsing');
        }
        draftPreview.classList.add('closing');
        entryWrapper?.classList.add('is-visible');
        if (lockContentHeight) {
            contentEl.style.maxHeight = '';
        }

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            this._clearCloseTimer();
            onComplete?.();
        };

        const onTransitionEnd = (e) => {
            if (e.target === draftPreview && e.propertyName === 'grid-template-rows') {
                finish();
            }
        };
        draftPreview.addEventListener('transitionend', onTransitionEnd);
        this._closeTransitionCleanup = () => {
            draftPreview.removeEventListener('transitionend', onTransitionEnd);
        };
        this._closeTimer = setTimeout(finish, 280);
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
            const editingId = this._editingJournalEntryId;

            const finishClose = () => {
                // Standard quick-add leaves the timeline DOM untouched; only inline edit needs a re-render
                this.resetEditingState({ silentHistory: true, reRender: Boolean(editingId) });
            };

            if (isVisible) {
                const currentResult = studentId ? appState.generatedResults?.find(r => r.id === studentId) : null;
                const restoredEntry = editingId ? JournalManager.getEntry(studentId, editingId) : null;
                this._animateDraftClose(draftPreview, restoredEntry, currentResult, {
                    isIncoming: false,
                    onComplete: finishClose
                });
            } else {
                finishClose();
            }
            return;
        }

        this._clearCloseTimer();
        const contentEl = document.getElementById('focusJournalContent');
        contentEl?.querySelectorAll('.journal-crossfade-wrapper').forEach(w => w.remove());

        const saveBtn = document.getElementById('journalDraftSaveBtn');
        const draftPreview = document.getElementById('journalDraftPreview');
        const noteInput = document.getElementById('journalNoteInput');

        if (show) {
            section?.classList.add('editing');
            this._syncNoteButtonState(true);

            if (reset) {
                // Reset state
                this._selectedJournalTags = [];
                this._isDraftPrivate = false;
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
                const privateBtn = document.getElementById('journalDraftPrivateBtn');
                if (privateBtn) {
                    privateBtn.classList.remove('is-active');
                    privateBtn.setAttribute('aria-pressed', 'false');
                }

                if (noteInput) noteInput.value = '';
                if (saveBtn) {
                    saveBtn.disabled = true;
                    const saveBtnSpan = saveBtn.querySelector('span');
                    if (saveBtnSpan) saveBtnSpan.textContent = 'Enregistrer';
                }

                this._updatePillDirectStates();
            }

            // Show the draft preview when opening (clear any mid-close class for smooth reversal)
            draftPreview?.classList.remove('closing');
            draftPreview?.classList.add('visible');
            HistoryManager.pushState('focusJournalQuickAdd', (opts) => this.toggleQuickAdd(false, true, opts));
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
        this._clearCloseTimer();
        const studentId = this._getCurrentStudentId();
        const entry = JournalManager.getEntry(studentId, entryId);
        if (!entry) return;

        // 1. Set editing state and sync tags & privacy (exclude implicit 'remarque' auto-tag)
        this._editingJournalEntryId = entryId;
        this._selectedJournalTags = (Array.isArray(entry.tags) ? entry.tags : []).filter(t => t !== 'remarque');
        this._isDraftPrivate = Boolean(entry.isPrivate);

        // 2. Re-render journal to show inline editor
        const result = appState.generatedResults.find(r => r.id === studentId);
        if (result) {
            this.render(result, null, { animateTimeline: false });

            // 3. Gently ensure inline editor is in view without unnecessary scroll jumps
            requestAnimationFrame(() => {
                const draftPreview = document.getElementById('journalDraftPreview');
                draftPreview?.scrollIntoView?.({
                    behavior: this._prefersReducedMotion() ? 'auto' : 'smooth',
                    block: 'nearest'
                });
                const noteInput = document.getElementById('journalNoteInput');
                if (noteInput && !entry.note) noteInput.focus();
            });
        }

        // 4. Mark section as editing
        const section = document.getElementById('focusJournalSection');
        section?.classList.add('editing');
        this._syncNoteButtonState(true);
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

        const saveBtn = document.getElementById('journalDraftSaveBtn');
        if (saveBtn) saveBtn.disabled = true;

        const wasEditingId = this._editingJournalEntryId;
        const entry = wasEditingId
            ? JournalManager.updateEntry(studentId, wasEditingId, {
                tags: [...this._selectedJournalTags],
                note: note,
                isPrivate: this._isDraftPrivate
            })
            : JournalManager.addEntry(studentId, {
                tags: [...this._selectedJournalTags],
                note: note,
                isPrivate: this._isDraftPrivate
            });

        if (!entry) {
            if (saveBtn) saveBtn.disabled = false;
            return;
        }

        // Commit badges & AI summary immediately (JournalManager already refreshed appreciation status)
        const result = appState.generatedResults.find(r => r.id === studentId);
        const section = document.getElementById('focusJournalSection');
        section?.classList.remove('is-empty');

        if (result) {
            const aiSummary = JournalManager.getAISummary(result, appState.currentPeriod);
            this._updateThresholdUI(result, aiSummary);
            this._updateCountBadge(result, aiSummary);
        }

        // Collapse editor straight into the new/updated row in one 240ms continuous gesture
        const draftPreview = document.getElementById('journalDraftPreview');
        this._animateDraftClose(draftPreview, entry, result, {
            isIncoming: true,
            onComplete: () => {
                this.resetEditingState({
                    silentHistory: true,
                    reRender: true,
                    highlightEntryId: this._prefersReducedMotion() ? null : entry.id,
                    highlightClass: 'just-saved'
                });
            }
        });
    }
};
