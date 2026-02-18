/**
 * @fileoverview Focus Panel Status - Gestion des badges et indicateurs
 * Extracted from FocusPanelManager for better modularity
 * @module managers/FocusPanelStatus
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { StatsUI } from './StatsUIManager.js';
import { FocusPanelHistory } from './FocusPanelHistory.js';
import { JournalManager } from './JournalManager.js';
import { PromptService } from '../services/PromptService.js';

/**
 * Module de gestion des badges et indicateurs du Focus Panel
 * @namespace FocusPanelStatus
 */
export const FocusPanelStatus = {
    /** Callbacks for parent integration */
    _callbacks: null,

    /**
     * Initialize the module with callbacks
     * @param {Object} callbacks - Callback functions
     * @param {Function} callbacks.getCurrentStudentId - Get current student ID
     * @param {Function} callbacks.getActiveGenerations - Get active generations map
     * @param {Function} [callbacks.onUpdateGenerateButton] - Update generate button state
     */
    init(callbacks) {
        this._callbacks = callbacks;
    },

    /**
     * Get current student ID via callback
     * @returns {string|null}
     * @private
     */
    _getCurrentStudentId() {
        return this._callbacks?.getCurrentStudentId?.() ?? null;
    },

    /**
     * Check if generation is active for a student
     * @param {string} studentId
     * @returns {boolean}
     * @private
     */
    _isGenerating(studentId) {
        const activeGenerations = this._callbacks?.getActiveGenerations?.();
        return activeGenerations?.has(studentId) ?? false;
    },

    /**
     * Check if appreciation has REAL content (not placeholder or just whitespace)
     * @param {string|null|undefined} appreciation - The appreciation text
     * @returns {boolean}
     * @private
     */
    _hasRealContent(appreciation) {
        if (!appreciation) return false;
        const text = appreciation.trim();
        if (text.length === 0) return false;
        // Exclude all variations of placeholder text
        if (text.includes('Aucune appréciation')) return false;
        if (text.includes('Cliquez sur')) return false;
        // Exclude HTML placeholder spans that might be stored
        if (text.startsWith('<span') && text.includes('empty')) return false;
        return true;
    },

    /**
     * Vérifie si les données actuelles diffèrent du snapshot de génération
     * @param {Object} result - Student result object
     * @returns {boolean} true si des données pertinentes ont changé
     */
    /**
     * Pure comparison logic between current data and snapshot
     * Centralized Source of Truth for "Dirty" state
     * @param {Object} current - Current data { statuses, grade, context, journalCount }
     * @param {Object} snapshot - Snapshot data
     * @returns {boolean} True if data differs
     */
    compareDataWithSnapshot(current, snapshot) {
        if (!snapshot) return false;

        // 1. Compare Statuses
        const currentStatuses = (current.statuses || []).sort();
        const snapshotStatuses = (snapshot.statuses || []).sort();
        if (!Utils.isEqual(currentStatuses, snapshotStatuses)) return true;

        // 2. Compare Data (Period)
        // Normalize Grade (handle string/number/null)
        const normalizeGrade = (g) => {
            if (g === undefined || g === null || g === '') return null;
            // Handle comma/dot
            if (typeof g === 'string') g = g.replace(',', '.');
            const f = parseFloat(g);
            return isNaN(f) ? null : f;
        };
        const currentGrade = normalizeGrade(current.grade);
        const snapshotGrade = normalizeGrade(snapshot.periods?.[appState.currentPeriod]?.grade ?? snapshot.grade);

        if (currentGrade !== snapshotGrade) return true;

        // Normalize Context
        const normalizeContext = (c) => {
            return (c || '').trim();
        };
        const currentContext = normalizeContext(current.context);
        const snapshotContext = normalizeContext(snapshot.periods?.[appState.currentPeriod]?.context ?? snapshot.context);

        if (currentContext !== snapshotContext) return true;

        // 3. Compare Journal (Only tags/notes that meet threshold matter for AI)
        const currentJournal = current.journal || [];
        const currentThreshold = JournalManager.getThreshold();

        // Helper to get tags that meet threshold
        const getActiveTags = (entries, thresh) => {
            const counts = {};
            entries.forEach(e => {
                if (e.tags) e.tags.forEach(t => counts[t] = (counts[t] || 0) + 1);
            });
            return Object.keys(counts).filter(t => counts[t] >= thresh).sort();
        };

        // Helper to get relevant notes (only from entries with active tags)
        const getRelevantNotes = (entries, thresh) => {
            const tagCounts = {};
            entries.forEach(e => {
                if (e.tags) e.tags.forEach(t => tagCounts[t] = (tagCounts[t] || 0) + 1);
            });
            const activeTags = new Set(Object.keys(tagCounts).filter(t => tagCounts[t] >= thresh));
            return entries
                .filter(e => e.note && e.note.trim() && e.tags && e.tags.some(t => activeTags.has(t)))
                .map(e => e.note.trim())
                .sort()
                .join('||');
        };

        // Get what the AI would see NOW (current journal + current threshold)
        const currentActiveTags = getActiveTags(currentJournal, currentThreshold);
        const currentNotes = getRelevantNotes(currentJournal, currentThreshold);

        if (snapshot.journal) {
            // Full snapshot available
            const snapshotJournal = snapshot.journal;
            // Use snapshot's threshold (what the AI saw at generation time)
            const snapshotThreshold = snapshot.threshold ?? currentThreshold;

            // Get what the AI SAW at generation time
            const snapshotActiveTags = getActiveTags(snapshotJournal, snapshotThreshold);
            const snapshotNotes = getRelevantNotes(snapshotJournal, snapshotThreshold);



            // Compare: is what the AI would see NOW different from what it SAW?
            if (!Utils.isEqual(currentActiveTags, snapshotActiveTags)) {
                return true;
            }

            if (currentNotes !== snapshotNotes) {
                return true;
            }
        } else if (snapshot.journalCount !== undefined) {
            // Legacy snapshot (count only) - only trigger dirty if we NOW have active tags
            // that weren't there before (assume old generation had no active tags if count was 0)
            const snapshotHadActiveTags = snapshot.journalCount > 0;
            const currentHasActiveTags = currentActiveTags.length > 0;

            // Only dirty if we went from no active tags to having some
            if (!snapshotHadActiveTags && currentHasActiveTags) {
                return true;
            }
            // Or if we had some and lost them (regeneration needed to remove content)
            if (snapshotHadActiveTags && !currentHasActiveTags) {
                return true;
            }
        } else {
            // If snapshot.journal AND snapshot.journalCount are undefined (Very Old Data)
            // Assume generation was done with 0 journal entries
            // If we NOW have active tags, we should show the dirty badge
            if (currentActiveTags.length > 0) {
                return true;
            }
        }

        return false;
    },

    /**
     * Vérifie si les données actuelles diffèrent de ce qui a été utilisé pour la génération
     * NOUVELLE APPROCHE: Compare le hash du prompt actuel avec celui stocké à la génération
     * Cela capture TOUS les changements: notes, contexte, journal, seuil, paramètres, etc.
     * @param {Object} result - Student result object
     * @returns {boolean} true si le prompt serait différent (donc régénération utile)
     */
    checkDirtyState(result) {
        // Must have content and a stored hash to compare
        if (!result || !this._hasRealContent(result.appreciation)) return false;

        // If no hash stored, fall back to legacy check or return false
        if (!result.promptHash) {
            // BACKWARD COMPAT: Check legacy snapshot if present
            if (result.generationSnapshot) {
                return this._checkDirtyStateLegacy(result);
            }
            return false;
        }

        // Only check for the period the appreciation was generated for
        const currentPeriod = appState.currentPeriod;
        if (result.generationPeriod && result.generationPeriod !== currentPeriod) {
            return false;
        }

        // Calculate current prompt hash
        const currentHash = PromptService.getPromptHash({
            ...result.studentData,
            id: result.id,
            currentPeriod: currentPeriod
        });

        // If hash calculation failed, don't show dirty
        if (!currentHash) return false;

        return currentHash !== result.promptHash;
    },

    /**
     * Legacy dirty state check for backward compatibility
     * Used when promptHash is not available but generationSnapshot is
     * @private
     * 
     * TODO: [CLEANUP] After 2026-07-01, consider removing _checkDirtyStateLegacy()
     * and compareDataWithSnapshot() if all users have promptHash populated.
     * These ~100 lines exist only for backward compat with pre-promptHash data.
     */
    _checkDirtyStateLegacy(result) {
        const currentPeriod = appState.currentPeriod;
        if (result.generationPeriod && result.generationPeriod !== currentPeriod) {
            return false;
        }

        const currentStatuses = result.studentData.statuses || [];
        const currentGrade = result.studentData.periods?.[currentPeriod]?.grade;
        const currentContext = result.studentData.periods?.[currentPeriod]?.context || '';
        const currentJournal = result.journal || [];

        const snapshot = {
            ...result.generationSnapshot,
            journal: result.generationSnapshotJournal,
            journalCount: result.generationSnapshotJournalCount,
            threshold: result.generationThreshold
        };

        return this.compareDataWithSnapshot({
            statuses: currentStatuses,
            grade: currentGrade,
            context: currentContext,
            journal: currentJournal
        }, snapshot);
    },

    /**
     * Unified Appreciation Status Badge Manager
     * NOW: Only manages STATUS (pending/dirty/empty/uptodate)
     * Source (AI/Manual) is handled separately by updateSourceIndicator()
     * @param {Object} result - Student result object
     * @param {Object} [options] - Optional overrides { state, tooltip, animate }
     */
    updateAppreciationStatus(result, options = {}) {
        const badge = document.getElementById('focusAppreciationBadge');
        if (!badge) return;

        let state = options.state;
        let tooltip = options.tooltip || '';

        // If no explicit state, compute from result
        if (!state) {
            const isGenerating = this._isGenerating(result?.id);
            const hasContent = this._hasRealContent(result?.appreciation);

            if (isGenerating) {
                state = 'pending';
                tooltip = 'Génération en cours...';
            } else if (!hasContent) {
                state = 'empty';
                tooltip = 'En attente';
            } else if (this.checkDirtyState(result)) {
                state = 'dirty';
                const isAI = result?.wasGenerated === true;
                tooltip = isAI
                    ? 'Données modifiées depuis la génération.\nCliquez pour régénérer.'
                    : 'Données modifiées depuis l\'écriture.\nPensez à vérifier l\'appréciation.';
            } else {
                state = 'uptodate';
                tooltip = '';
            }
        }

        // Reset badge state
        badge.className = 'appreciation-status-badge tooltip';
        badge.innerHTML = '';
        badge.removeAttribute('data-tooltip');

        switch (state) {
            case 'pending':
                badge.innerHTML = '<iconify-icon icon="solar:spinner-linear" class="icon-spin"></iconify-icon>';
                badge.classList.add('visible', 'pending');
                break;
            case 'dirty':
                badge.innerHTML = '<iconify-icon icon="solar:refresh-linear"></iconify-icon><span class="badge-text">Mettre à jour</span>';
                badge.classList.add('visible', 'modified');
                break;
            case 'empty':
                badge.innerHTML = '<iconify-icon icon="solar:clock-circle-linear"></iconify-icon>';
                badge.classList.add('visible', 'empty', 'icon-only');
                break;
            case 'saved':
                badge.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon><span class="badge-text">Enregistré</span>';
                badge.classList.add('visible', 'saved');
                setTimeout(() => {
                    if (badge.classList.contains('saved')) {
                        badge.classList.remove('visible', 'saved');
                    }
                }, 2000);
                break;
            case 'dictating':
                badge.innerHTML = '<iconify-icon icon="solar:microphone-linear"></iconify-icon><span class="badge-text">Dictée...</span>';
                badge.classList.add('visible', 'is-dictating');
                break;
            case 'error':
                badge.innerHTML = '<iconify-icon icon="solar:danger-triangle-linear"></iconify-icon><span class="badge-text">Erreur</span>';
                badge.classList.add('visible', 'error');
                break;
            case 'generated':
                // Success state after generation - show brief confirmation then hide
                badge.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon>';
                badge.classList.add('visible', 'generated', 'icon-only');
                setTimeout(() => {
                    if (badge.classList.contains('generated')) {
                        badge.classList.remove('visible', 'generated', 'icon-only');
                    }
                }, 1500);
                break;
            case 'uptodate':
            default:
                // When up-to-date, hide badge - source indicator is sufficient
                badge.classList.remove('visible');
                break;
        }

        if (tooltip) {
            badge.setAttribute('data-tooltip', tooltip);
        }

        setTimeout(() => UI.initTooltips(), 50);
    },

    /**
     * Quick helper to refresh both Status and Source indicators from current student
     */
    refreshAppreciationStatus() {
        const currentStudentId = this._getCurrentStudentId();
        if (!currentStudentId) return;
        const result = appState.generatedResults.find(r => r.id === currentStudentId);
        if (result) {
            // Update both indicators
            this.updateAppreciationStatus(result);
            this.updateSourceIndicator(result);

            // Also update generate button to reflect dirty state
            this._callbacks?.onUpdateGenerateButton?.(result);
            // CRITICAL: Also update the List View row to show/hide dirty indicator
            this._callbacks?.onUpdateListRow?.(result);

            // FALLBACK: Emit event for decoupled sync (works even if callbacks not set)
            window.dispatchEvent(new CustomEvent('studentDirtyStateChanged', {
                detail: { studentId: currentStudentId, result }
            }));
        }
    },

    /**
     * Update word count display
     * @param {boolean} [animate=false] - Whether to animate the number change
     * @param {number|null} [fromCount=null] - Optional starting value for animation
     * @param {number|null} [targetCount=null] - Optional target value (use when DOM not ready yet)
     */
    updateWordCount(animate = false, fromCount = null, targetCount = null) {
        const appreciationText = document.getElementById('focusAppreciationText');
        const wordCountEl = document.getElementById('focusWordCount');

        if (!wordCountEl) return;

        // Determine word count: use targetCount if provided, else read from DOM
        let words, charCount, isEmpty;

        if (targetCount !== null) {
            // Target provided explicitly (DOM not ready yet, e.g. during typewriter)
            words = targetCount;
            charCount = null; // Can't compute char count without actual text
            isEmpty = words === 0;
        } else if (appreciationText) {
            const text = appreciationText.textContent || '';
            isEmpty = !text.trim();
            words = isEmpty ? 0 : Utils.countWords(text);
            charCount = isEmpty ? 0 : Utils.countCharacters(text);

            // Update empty class
            if (isEmpty) {
                appreciationText.classList.add('empty');
            } else {
                appreciationText.classList.remove('empty');
            }
        } else {
            return;
        }

        // Update refinement buttons state
        const refinementOptions = document.getElementById('focusRefinementOptions');
        if (refinementOptions) {
            const refineButtons = refinementOptions.querySelectorAll('[data-refine-type]');
            refineButtons.forEach(btn => {
                btn.disabled = isEmpty;
                btn.classList.toggle('disabled', isEmpty);
            });
        }

        const copyBtn = document.getElementById('focusCopyBtn');
        if (copyBtn) {
            copyBtn.disabled = isEmpty;
        }

        if (isEmpty) {
            wordCountEl.textContent = '0 mots';
            if (wordCountEl._tippy) {
                wordCountEl._tippy.destroy();
            }
            wordCountEl.removeAttribute('data-tooltip');
        } else {
            const templateFn = (val) => `${val} mot${val !== 1 ? 's' : ''}`;

            if (animate) {
                let startVal = 0;
                if (fromCount !== null) {
                    startVal = fromCount;
                } else {
                    const prevText = wordCountEl.textContent || '';
                    const prevMatch = prevText.match(/(\d+)/);
                    startVal = prevMatch ? parseInt(prevMatch[1], 10) : 0;
                }

                if (startVal !== words) {
                    StatsUI.animateNumberWithMarkup(wordCountEl, startVal, words, 600, templateFn);
                } else {
                    wordCountEl.innerHTML = templateFn(words);
                }
            } else {
                wordCountEl.innerHTML = templateFn(words);
            }

            // Update tooltip (only if we have char count)
            if (charCount !== null) {
                UI.updateTooltip(wordCountEl, `${words} mot${words !== 1 ? 's' : ''} • ${charCount} car.`);
            }
        }
    },

    /**
     * Update Source Indicator (shows HOW appreciation was produced)
     * NEW: Manages source dimension - AI (✨) / Manual (✏️) / None (hidden)
     * @param {Object} result - Student result object
     */
    updateSourceIndicator(result) {
        const sourceIndicator = document.getElementById('focusAiIndicator');
        if (!sourceIndicator) return;

        const hasContent = this._hasRealContent(result?.appreciation);
        const currentPeriod = appState.currentPeriod;
        const wasGeneratedForCurrentPeriod = result?.wasGenerated === true
            && (!result.generationPeriod || result.generationPeriod === currentPeriod);

        // Determine source
        let source = 'none';
        if (hasContent) {
            source = wasGeneratedForCurrentPeriod ? 'ai' : 'manual';
        }

        // Reset
        sourceIndicator.style.display = 'none';
        sourceIndicator.classList.remove('source-ai', 'source-manual');
        sourceIndicator.removeAttribute('data-tooltip');

        switch (source) {
            case 'ai':
                sourceIndicator.innerHTML = '✨';
                sourceIndicator.style.display = 'inline-flex';
                sourceIndicator.classList.add('source-ai');
                // Get detailed tooltip if available (model, tokens, etc.)
                const { tooltip } = Utils.getGenerationModeInfo(result);
                sourceIndicator.setAttribute('data-tooltip', tooltip || 'Généré par IA');
                break;
            case 'manual':
                sourceIndicator.innerHTML = '<iconify-icon icon="solar:pen-linear"></iconify-icon>';
                sourceIndicator.style.display = 'inline-flex';
                sourceIndicator.classList.add('source-manual');
                sourceIndicator.setAttribute('data-tooltip', 'Édité manuellement');
                break;
            case 'none':
            default:
                // Hidden - no content
                break;
        }

        UI.initTooltips();
    },


    /**
     * Sync appreciation content to the result object
     * @param {string} content - The appreciation content
     */
    syncAppreciationToResult(content) {
        const currentStudentId = this._getCurrentStudentId();
        const result = appState.generatedResults.find(r => r.id === currentStudentId);
        if (result) {
            result.appreciation = content;
            result.copied = false;
            if (result.studentData?.periods?.[appState.currentPeriod]) {
                result.studentData.periods[appState.currentPeriod].appreciation = content;
            }
        }
    },

    /**
     * Update the history indicator UI
     */
    updateHistoryIndicator() {
        const group = document.getElementById('historyNavigationGroup');
        const indicator = document.getElementById('focusHistoryIndicator');
        const prevBtn = document.getElementById('focusHistoryPrevBtn');
        const nextBtn = document.getElementById('focusHistoryNextBtn');

        if (!group || !indicator) return;

        const { current, total } = FocusPanelHistory.getCurrentVersionInfo();

        if (total > 1) {
            group.style.display = 'inline-flex';

            // Update counter to "Current/Total"
            const countEl = indicator.querySelector('.history-count');
            if (countEl) {
                countEl.textContent = `${current}/${total}`;
            }
            indicator.setAttribute('data-tooltip', `Version ${current} sur ${total} • Cliquez pour l'historique`);

            // Update navigation buttons
            if (prevBtn) prevBtn.disabled = !FocusPanelHistory.canUndo();
            if (nextBtn) nextBtn.disabled = !FocusPanelHistory.canRedo();

        } else {
            group.style.display = 'none';
        }
    },



    /**
     * Save appreciation edits to result
     */
    saveAppreciationEdits() {
        const currentStudentId = this._getCurrentStudentId();
        if (!currentStudentId) return;

        const appreciationText = document.getElementById('focusAppreciationText');
        const result = appState.generatedResults.find(r => r.id === currentStudentId);

        if (appreciationText && result) {
            const text = appreciationText.textContent?.trim();
            if (text && !text.includes('Aucune appréciation')) {
                result.appreciation = text;
                const currentPeriod = appState.currentPeriod;
                if (result.studentData.periods[currentPeriod]) {
                    result.studentData.periods[currentPeriod].appreciation = text;
                }
            }
        }
    },

    /**
     * Check if context or grade has been modified for an AI-generated appreciation
     */
    checkIfDataModified() {
        const currentStudentId = this._getCurrentStudentId();
        if (!currentStudentId) return;
        const result = appState.generatedResults.find(r => r.id === currentStudentId);
        if (!result) return;

        if (!result.wasGenerated) return;

        if (this._isGenerating(currentStudentId)) return;

        this.refreshAppreciationStatus();
    }
};
