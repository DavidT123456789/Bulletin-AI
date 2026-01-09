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
    checkDirtyState(result) {
        if (!result || !result.wasGenerated || !result.generationSnapshot) return false;

        // CRITICAL FIX: Only check dirty state if we're viewing the SAME period that was generated
        const currentPeriod = appState.currentPeriod;
        if (result.generationPeriod && result.generationPeriod !== currentPeriod) {
            return false;
        }

        // 1. Comparer les statuts
        const snapshot = result.generationSnapshot;
        let currentStatuses = result.studentData.statuses || [];
        const editMode = document.querySelector('.focus-header-edit');
        if (editMode && editMode.classList.contains('visible')) {
            const checkedBoxes = editMode.querySelectorAll('input[type="checkbox"]:checked');
            currentStatuses = Array.from(checkedBoxes).map(cb => cb.value);
        }

        const snapshotStatuses = snapshot.statuses || [];
        if (!Utils.isEqual([...currentStatuses].sort(), [...snapshotStatuses].sort())) return true;

        // 2. Comparer les données de la période (Grade + Contexte)
        const gradeInput = document.getElementById('focusCurrentGradeInput');
        const contextInput = document.getElementById('focusContextInput');

        let currentGrade = result.studentData.periods?.[currentPeriod]?.grade;
        if (gradeInput) {
            const val = gradeInput.value.replace(',', '.');
            currentGrade = (val === '' || val === null) ? null : parseFloat(val);
        }

        let currentContext = result.studentData.periods?.[currentPeriod]?.context || '';
        if (contextInput) {
            currentContext = contextInput.value.trim();
        }

        const snapshotPeriod = snapshot.periods?.[currentPeriod] || {};
        const snapshotGrade = snapshotPeriod.grade;
        const snapshotContext = snapshotPeriod.context || '';

        // Comparaison Note
        const normCurrentGrade = (currentGrade === undefined || currentGrade === null || isNaN(currentGrade)) ? null : currentGrade;
        const normSnapshotGrade = (snapshotGrade === undefined || snapshotGrade === null || isNaN(snapshotGrade)) ? null : snapshotGrade;

        if (normCurrentGrade !== normSnapshotGrade) return true;

        // Comparaison Contexte
        if (currentContext !== snapshotContext) return true;

        // 3. Comparer le Journal de bord
        const currentJournal = result.journal || [];
        const snapshotJournal = result.generationSnapshotJournal || [];

        // Fallback for old snapshots
        if (!result.generationSnapshotJournal && result.generationSnapshotJournalCount !== undefined) {
            const currentJournalCount = result.journal?.length || 0;
            const snapshotJournalCount = result.generationSnapshotJournalCount ?? 0;
            if (currentJournalCount !== snapshotJournalCount) return true;
            return false;
        }

        // A. Get threshold values
        const currentThreshold = appState.journalThreshold ?? 2;
        const snapshotThreshold = result.generationThreshold ?? currentThreshold;

        // B. Helper to get active tags (tags that meet threshold)
        const getActiveTags = (entries, thresh) => {
            const counts = {};
            entries.forEach(e => {
                e.tags.forEach(t => {
                    counts[t] = (counts[t] || 0) + 1;
                });
            });
            return Object.keys(counts).filter(t => counts[t] >= thresh).sort();
        };

        const currentActiveTags = getActiveTags(currentJournal, currentThreshold);
        const snapshotActiveTags = getActiveTags(snapshotJournal, snapshotThreshold);

        // C. Check Active Tags
        if (!Utils.isEqual(currentActiveTags, snapshotActiveTags)) return true;

        // D. Check Notes - ONLY for entries with tags that reached threshold
        const getRelevantNotes = (entries, thresh) => {
            const tagCounts = {};
            entries.forEach(e => {
                e.tags.forEach(t => {
                    tagCounts[t] = (tagCounts[t] || 0) + 1;
                });
            });
            const activeTags = new Set(Object.keys(tagCounts).filter(t => tagCounts[t] >= thresh));

            return entries
                .filter(e => e.note && e.note.trim() && e.tags.some(t => activeTags.has(t)))
                .map(e => e.note.trim())
                .sort()
                .join('||');
        };

        const currentNotes = getRelevantNotes(currentJournal, currentThreshold);
        const snapshotNotes = getRelevantNotes(snapshotJournal, snapshotThreshold);
        if (currentNotes !== snapshotNotes) return true;

        return false;
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
                state = 'none';
            }
        }

        // Reset badge state
        badge.className = 'appreciation-status-badge tooltip';
        badge.innerHTML = '';
        badge.removeAttribute('data-tooltip');

        if (state === 'none') {
            return;
        }

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
                icon = '<i class="fas fa-check-circle"></i>';
                text = '<span class="badge-text">Validé</span>';
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
                badge.setAttribute('data-tooltip', 'Le contexte ou la note ont changé. Cliquez sur Générer pour mettre à jour.');
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
