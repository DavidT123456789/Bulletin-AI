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

        // 3. Compare Journal Count
        const currentJournalCount = current.journalCount || 0;
        // Handle various snapshot formats for journal
        const snapshotJournalCount = snapshot.journal ? snapshot.journal.length : (snapshot.journalCount ?? 0);

        // Note: For strict correctness regarding thresholds, we might need deeper check, 
        // but count is sufficient for general "something changed" warning.
        // If needed, we can add the threshold logic here later.
        const currentJournal = current.journal || [];
        // Legacy snapshot fallback (count only)
        if (!snapshot.journal && snapshot.journalCount !== undefined) {
            const cCount = currentJournal.length;
            const cCountVal = (current.journalCount !== undefined) ? current.journalCount : cCount;
            if (cCountVal !== snapshot.journalCount) return true;
        } else if (snapshot.journal) {
            // Full snapshot available (New Data)
            const snapshotJournal = snapshot.journal;
            // Use class-specific threshold if possible, otherwise global fallback
            const currentThreshold = JournalManager.getThreshold();
            const snapshotThreshold = snapshot.threshold ?? currentThreshold;
            const getActiveTags = (entries, thresh) => {
                const counts = {};
                entries.forEach(e => {
                    if (e.tags) e.tags.forEach(t => counts[t] = (counts[t] || 0) + 1);
                });
                return Object.keys(counts).filter(t => counts[t] >= thresh).sort();
            };
            const currentActiveTags = getActiveTags(currentJournal, currentThreshold);
            const snapshotActiveTags = getActiveTags(snapshotJournal, snapshotThreshold);
            if (!Utils.isEqual(currentActiveTags, snapshotActiveTags)) return true;
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
            if (getRelevantNotes(currentJournal, currentThreshold) !== getRelevantNotes(snapshotJournal, snapshotThreshold)) return true;
        }
        // If snapshot.journal AND snapshot.journalCount are undefined (Very Old Data)
        // We skip journal comparison to avoid false positives (Assume sync)

        return false;
    },

    /**
     * Vérifie si les données actuelles diffèrent du snapshot de génération
     * @param {Object} result - Student result object
     * @returns {boolean} true si des données pertinentes ont changé
     */
    checkDirtyState(result) {
        if (!result || !result.wasGenerated || !result.generationSnapshot) return false;

        const currentPeriod = appState.currentPeriod;
        if (result.generationPeriod && result.generationPeriod !== currentPeriod) {
            return false;
        }

        // REFACTOR: Use Model Data directly (Single Source of Truth)
        // Eliminates DOM parsing issues, timing bugs, and string/number mismatches
        const currentStatuses = result.studentData.statuses || [];
        const currentGrade = result.studentData.periods?.[currentPeriod]?.grade;
        const currentContext = result.studentData.periods?.[currentPeriod]?.context || '';
        const currentJournal = result.journal || [];

        // CRITICAL FIX: Include generationSnapshotJournal in the snapshot object
        const snapshot = {
            ...result.generationSnapshot,
            journal: result.generationSnapshotJournal,
            journalCount: result.generationSnapshotJournalCount, // BACKWARD COMPAT: Include legacy count
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
     * @param {Object} result - Student result object
     * @param {Object} [options] - Optional overrides { state, tooltip, animate }
     */
    updateAppreciationStatus(result, options = {}) {
        const badge = document.getElementById('focusAppreciationBadge');
        if (!badge) return;

        let state = options.state;
        let tooltip = options.tooltip || '';
        const animate = options.animate !== false;

        if (!state) {
            const isGenerating = this._isGenerating(result?.id);
            const isGenerated = result?.wasGenerated === true;
            const hasAppreciation = result?.appreciation && result.appreciation.trim();
            const isDirty = hasAppreciation && isGenerated && this.checkDirtyState(result);

            if (isGenerating) {
                state = 'pending';
                tooltip = 'Génération en cours...';
            } else if (isDirty) {
                state = 'modified';
                tooltip = 'Données modifiées depuis la génération.\nPensez à régénérer.';
            } else if (isGenerated && hasAppreciation) {
                state = 'generated';
                tooltip = 'Appréciation générée et à jour';
            } else if (hasAppreciation && !isGenerated) {
                state = 'valid';
                tooltip = 'Appréciation validée (éditée manuellement)';
            } else {
                state = 'empty';
                tooltip = 'En attente de génération';
            }
        }

        // Reset badge state
        badge.className = 'appreciation-status-badge tooltip';
        badge.innerHTML = '';
        badge.removeAttribute('data-tooltip');

        // Always show badge (including empty state)

        badge.classList.add('visible', state);
        badge.classList.remove('icon-only');

        if (state === 'dictating') {
            badge.classList.add('is-dictating');
        }

        let icon = '';
        let text = '';

        switch (state) {
            case 'pending':
                icon = '<i class="fas fa-spinner fa-spin"></i>';
                text = '';
                break;
            case 'generated':
                icon = '<i class="fas fa-check"></i>';
                if (animate) {
                    text = '<span class="badge-text">Généré</span>';
                    setTimeout(() => {
                        if (badge.classList.contains('generated')) {
                            badge.classList.add('icon-only');
                            UI.initTooltips();
                        }
                    }, 2000);
                } else {
                    text = '';
                    badge.classList.add('icon-only');
                }
                break;
            case 'modified':
                icon = '<i class="fas fa-sync-alt"></i>';
                text = '<span class="badge-text" style="display:inline-block;">Modifié</span>';
                break;
            case 'saved':
                icon = '<i class="fas fa-check"></i>';
                text = '<span class="badge-text">Enregistré</span>';
                setTimeout(() => {
                    if (badge.classList.contains('saved')) {
                        badge.classList.remove('visible', 'saved');
                    }
                }, 2000);
                break;
            case 'valid':
                icon = '<i class="fas fa-pen"></i>';
                text = '<span class="badge-text">Édité</span>';
                if (animate) {
                    setTimeout(() => {
                        if (badge.classList.contains('valid')) {
                            badge.classList.add('icon-only');
                        }
                    }, 2000);
                } else {
                    badge.classList.add('icon-only');
                    text = '';
                }
                break;
            case 'error':
                icon = '<i class="fas fa-exclamation-triangle"></i>';
                text = '<span class="badge-text">Erreur</span>';
                break;
            case 'dictating':
                icon = '<i class="fas fa-microphone"></i>';
                text = '<span class="badge-text">Dictée...</span>';
                break;
            case 'empty':
                icon = '<i class="fas fa-clock"></i>';
                text = '<span class="badge-text">En attente</span>';
                badge.classList.add('icon-only'); // Show subtle, icon-only by default
                break;
        }

        badge.innerHTML = icon + text;
        if (tooltip) {
            badge.setAttribute('data-tooltip', tooltip);
        }

        setTimeout(() => UI.initTooltips(), 50);
    },

    /**
     * Quick helper to refresh status from current student
     */
    refreshAppreciationStatus() {
        const currentStudentId = this._getCurrentStudentId();
        if (!currentStudentId) return;
        const result = appState.generatedResults.find(r => r.id === currentStudentId);
        if (result) {
            this.updateAppreciationStatus(result);
            // Also update generate button to reflect dirty state
            this._callbacks?.onUpdateGenerateButton?.(result);
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
            const templateFn = (val) => `<i class="fas fa-align-left"></i>${val} mot${val !== 1 ? 's' : ''}`;

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
     * Update AI indicator display
     * @param {Object} result - Student result object
     */
    updateAiIndicator(result) {
        const aiIndicator = document.getElementById('focusAiIndicator');
        if (!aiIndicator) return;

        const currentPeriod = appState.currentPeriod;
        const hasAppreciation = result.appreciation && result.appreciation.trim().length > 0;

        const isCurrentPeriodGenerated = result.generationPeriod && result.generationPeriod === currentPeriod;
        const wasExplicitlyGenerated = result.wasGenerated === true && isCurrentPeriodGenerated;
        const hasTokenData = (result.tokenUsage?.generationTimeMs > 0 ||
            result.tokenUsage?.appreciation?.total_tokens > 0) && isCurrentPeriodGenerated;
        const hasAiModelWithUsage = result.studentData?.currentAIModel && result.tokenUsage?.appreciation && isCurrentPeriodGenerated;

        const showIndicator = hasAppreciation && (wasExplicitlyGenerated || hasTokenData || hasAiModelWithUsage);

        if (showIndicator) {
            const { tooltip } = Utils.getGenerationModeInfo(result);
            aiIndicator.style.display = 'inline-flex';
            aiIndicator.setAttribute('data-tooltip', tooltip);
            UI.initTooltips();
        } else {
            aiIndicator.style.display = 'none';
        }
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
        const indicator = document.getElementById('focusHistoryIndicator');
        if (!indicator) return;

        const modifCount = FocusPanelHistory.getModificationCount();

        if (modifCount > 0) {
            indicator.style.display = 'inline-flex';
            const countEl = indicator.querySelector('.history-count');
            if (countEl) {
                countEl.textContent = modifCount;
            }
            indicator.setAttribute('data-tooltip', `${modifCount} modification${modifCount > 1 ? 's' : ''} • Ctrl+Z pour annuler`);
        } else {
            indicator.style.display = 'none';
        }
    },

    /**
     * Set appreciation badge state (legacy method)
     * @param {'pending'|'done'|'error'|'saved'|'none'|'modified'} state - Badge state
     */
    setAppreciationBadge(state) {
        const badge = document.getElementById('focusAppreciationBadge');
        if (!badge) return;

        badge.className = 'appreciation-status-badge';

        if (state === 'none') {
            return;
        }

        badge.classList.add('visible', state);

        switch (state) {
            case 'pending':
                badge.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                break;
            case 'done':
                badge.innerHTML = '<i class="fas fa-check"></i>';
                break;
            case 'error':
                badge.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                break;
            case 'saved':
                badge.innerHTML = '<i class="fas fa-check"></i> Enregistré';
                setTimeout(() => {
                    if (badge.classList.contains('saved')) {
                        badge.classList.remove('visible', 'saved');
                    }
                }, 2000);
                break;
            case 'modified':
                badge.innerHTML = '<i class="fas fa-sync-alt"></i> Données modifiées';
                badge.setAttribute('data-tooltip', 'Le contexte ou la note ont changé<br><i style="opacity:0.8; font-size: 0.9em;">Cliquer sur Générer pour mettre à jour</i>');
                badge.classList.add('tooltip');
                UI.initTooltips();
                break;
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
