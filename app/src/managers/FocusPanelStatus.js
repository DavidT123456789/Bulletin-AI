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
import * as HistoryPopoverUI from '../utils/HistoryPopoverUI.js';
import { JournalManager } from './JournalManager.js';
import { PromptService } from '../services/PromptService.js';
import { SpeechSynthesisManager } from './SpeechSynthesisManager.js';
import { HistoryManager } from './HistoryManager.js';
import { filterAiEligibleStatuses } from '../config/academicConstants.js';
import { bus, EVENTS } from '../core/EventBus.js';

const COPY_BUTTON_MODES = {
    prompt: {
        label: 'Prompt',
        tooltip: 'Copier le prompt',
        ariaLabel: 'Copier le prompt'
    },
    appreciation: {
        label: 'Copier',
        tooltip: 'Copier l\'appréciation<br><span class="kbd-hint">Clic droit : copier le prompt</span>',
        copiedTooltip: 'Copier l\'appréciation (déjà copiée)<br><span class="kbd-hint">Clic droit : copier le prompt</span>',
        ariaLabel: "Copier l'appréciation"
    }
};

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
     */
    hasRealContent(appreciation) {
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
     * Alias for backward compatibility
     * @private
     */
    _hasRealContent(appreciation) {
        return this.hasRealContent(appreciation);
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

        // 1. Compare Statuses (statuts d'accompagnement RGPD exclus car hors IA)
        const currentStatuses = filterAiEligibleStatuses(current.statuses).sort();
        const snapshotStatuses = filterAiEligibleStatuses(snapshot.statuses).sort();
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

        // 3. Compare Journal (independent Notes & Tags channels, excluding private entries)
        const currentJournal = current.journal || [];
        const currentIncludeNotes = JournalManager.isNotesIncludedInAI?.() !== false;
        const currentIncludeTags = JournalManager.isTagsIncludedInAI?.() !== false;

        // Helper to get transmitted tags with counts (excluding private entries & technical 'remarque')
        const getActiveTags = (entries, included = true) => {
            if (!included) return [];
            const counts = {};
            entries.forEach(e => {
                if (e?.isPrivate) return;
                if (e.tags) {
                    e.tags.forEach(t => {
                        if (t && t !== 'remarque') counts[t] = (counts[t] || 0) + 1;
                    });
                }
            });
            return Object.entries(counts)
                .map(([t, count]) => `${t}:${count}`)
                .sort();
        };

        // Helper to get relevant written notes (non-private written notes transmitted when Notes channel is active)
        const getRelevantNotes = (entries, included = true) => {
            if (!included) return '';
            return entries
                .filter(e => !e?.isPrivate && typeof e.note === 'string' && e.note.trim().length > 0)
                .map(e => e.note.trim())
                .sort()
                .join('||');
        };

        // Get what the AI would see NOW (current journal + active channels)
        const currentActiveTags = getActiveTags(currentJournal, currentIncludeTags);
        const currentNotes = getRelevantNotes(currentJournal, currentIncludeNotes);

        if (snapshot.journal) {
            // Full snapshot available
            const snapshotJournal = snapshot.journal;
            const snapshotIncludeNotes = snapshot.journalIncludeNotes ?? (snapshot.journalIncludeInAI !== false);
            const snapshotIncludeTags = snapshot.journalIncludeTags ?? (snapshot.journalIncludeInAI !== false);

            // Get what the AI SAW at generation time
            const snapshotActiveTags = getActiveTags(snapshotJournal, snapshotIncludeTags);
            const snapshotNotes = getRelevantNotes(snapshotJournal, snapshotIncludeNotes);

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

        // Empreinte d'un format antérieur : non comparable, pas d'alerte jusqu'à la prochaine génération
        if (!result.promptHash.startsWith(PromptService.PROMPT_HASH_PREFIX)) return false;

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
     * Legacy dirty state check for backward compatibility.
     * Used when promptHash is not available but generationSnapshot is.
     * @private
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
            journalCount: result.generationSnapshotJournalCount
        };

        return this.compareDataWithSnapshot({
            statuses: currentStatuses,
            grade: currentGrade,
            context: currentContext,
            journal: currentJournal
        }, snapshot);
    },

    /**
     * Single Source of Truth for Student Appreciation Status
     * Computes the exact state (generating, error, empty, dirty, uptodate)
     * and metadata used across both Focus Panel and List View.
     * @param {Object} result - Student result object
     * @param {string} [period] - Target period (defaults to appState.currentPeriod)
     * @returns {Object} {
     *   state: 'generating' | 'error' | 'empty' | 'dirty' | 'uptodate',
     *   isGenerating: boolean,
     *   hasError: boolean,
     *   errorMessage: string|null,
     *   hasContent: boolean,
     *   isRegenerationError: boolean,
     *   appreciation: string,
     *   isDirty: boolean,
     *   tooltip: string
     * }
     */
    getAppreciationStatus(result, period = appState.currentPeriod) {
        const isManualAppreciation = result?.appreciationSource === 'manual' && result?.wasGenerated === false;
        const hasError = !isManualAppreciation && !!(result?.errorMessage && result?.errorPeriod === period);
        const errorMessage = hasError ? result.errorMessage : null;
        const isGenerating = !hasError && this._isGenerating(result?.id);

        // Check period-specific appreciation first, with fallback only when generation period matches
        const periodApp = result?.studentData?.periods?.[period]?.appreciation;
        const effectiveApp = periodApp || ((result?.generationPeriod === period) ? result?.appreciation : null);
        const hasContent = this.hasRealContent(effectiveApp);
        const isDirty = hasContent && !isGenerating && !hasError && this.checkDirtyState(result);
        const source = isDirty ? this._resolveSource(result) : 'none';
        const isReview = isDirty && source !== 'ai';

        let state = 'uptodate';
        let tooltip = '';
        let isRegenerationError = false;

        if (isGenerating) {
            state = 'generating';
            tooltip = 'Génération en cours...';
        } else if (hasError) {
            state = 'error';
            isRegenerationError = hasContent;
            if (isRegenerationError) {
                tooltip = `Échec de la régénération : ${errorMessage}<br>Ancienne version conservée`;
            } else {
                tooltip = errorMessage || 'Échec de génération';
            }
        } else if (!hasContent) {
            state = 'empty';
            tooltip = 'En attente';
        } else if (isDirty) {
            state = 'dirty';
            if (source === 'ai') {
                tooltip = 'Données modifiées depuis la génération<br><span class="kbd-hint">Cliquer pour régénérer</span>';
            } else if (source === 'imported') {
                tooltip = 'Données modifiées depuis l\'import<br><span class="kbd-hint">Cliquer pour marquer comme vérifiée</span>';
            } else {
                tooltip = 'Données modifiées depuis l\'écriture<br><span class="kbd-hint">Cliquer pour marquer comme vérifiée</span>';
            }
        } else {
            state = 'uptodate';
            tooltip = '';
        }

        return {
            state,
            isGenerating,
            hasError,
            errorMessage,
            hasContent,
            isRegenerationError,
            appreciation: (effectiveApp || '').trim(),
            isDirty,
            isReview,
            tooltip
        };
    },

    /**
     * Indique si l'appréciation relève de l'action groupée « Actualiser » : échec de génération sur la période,
     * ou texte IA non retouché dont les données de l'élève ont changé.
     * Un texte rédigé, retouché ou importé par l'enseignant n'est jamais réécrit en masse :
     * son indicateur invite seulement à le relire.
     * @param {Object} result - Student result object
     * @param {string} [period] - Target period (defaults to appState.currentPeriod)
     * @returns {boolean}
     */
    isBulkRefreshable(result, period = appState.currentPeriod) {
        const status = this.getAppreciationStatus(result, period);
        return status.hasError || (status.isDirty && this._resolveSource(result) === 'ai');
    },

    /**
     * Marque une appréciation manuelle, retouchée ou importée comme vérifiée
     * en réalignant son empreinte sur les données actuelles de l'élève.
     * @param {Object} result - Student result object
     * @param {string} [period] - Target period (defaults to appState.currentPeriod)
     */
    markDirtyAsVerified(result, period = appState.currentPeriod) {
        if (!result) return;
        result.promptHash = PromptService.getPromptHash({
            ...result.studentData,
            id: result.id,
            currentPeriod: period
        });
        result.generationPeriod = period;
        result.generationSnapshot = null;
    },

    /**
     * Synchronise le tooltip d'un seul élément sans réinitialiser tous les tooltips de la page.
     * @param {HTMLElement|null} el
     * @param {string} tooltip
     * @private
     */
    _syncElementTooltip(el, tooltip) {
        if (!el) return;
        if (tooltip) {
            el.setAttribute('data-tooltip', tooltip);
            UI?.updateTooltip?.(el, tooltip);
        } else {
            el.removeAttribute('data-tooltip');
            if (typeof UI?.cleanupTooltipsIn === 'function') {
                UI.cleanupTooltipsIn(el);
            } else {
                el._tippy?.destroy?.();
            }
        }
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

        // If no explicit state, compute from single source of truth
        if (!state) {
            const status = this.getAppreciationStatus(result, appState.currentPeriod);
            state = status.state === 'generating' ? 'pending' : status.state;
            tooltip = status.tooltip;
        }

        const isHiddenAIDirty = state === 'dirty' && result && this._resolveSource(result) === 'ai';
        if (isHiddenAIDirty) {
            tooltip = '';
        }

        const visualState = isHiddenAIDirty || state === 'pending' || state === 'empty' || state === 'uptodate'
            ? 'hidden'
            : (state === 'dirty' ? 'modified' : state);

        // Skip DOM rebuild when visual state is already rendered (prevents <iconify-icon> flash)
        if (badge.dataset.statusState === visualState) {
            this._syncElementTooltip(badge, tooltip);
            return;
        }

        // Reset badge state
        badge.className = 'appreciation-status-badge tooltip';
        badge.innerHTML = '';
        badge.dataset.statusState = visualState;
        badge.removeAttribute('role');
        badge.removeAttribute('tabindex');
        badge.removeAttribute('aria-label');

        switch (visualState) {
            case 'hidden':
                break;
            case 'modified':
                badge.innerHTML = '<iconify-icon class="badge-icon-default" icon="solar:danger-circle-linear" aria-hidden="true"></iconify-icon><iconify-icon class="badge-icon-confirm" icon="ph:check-bold" aria-hidden="true"></iconify-icon>';
                badge.classList.add('visible', 'modified', 'icon-only');
                badge.setAttribute('role', 'button');
                badge.setAttribute('tabindex', '0');
                badge.setAttribute('aria-label', "Marquer l'appréciation comme vérifiée");
                break;
            case 'dictating':
                badge.innerHTML = '<iconify-icon icon="lucide:mic"></iconify-icon><span class="badge-text">Dictée...</span>';
                badge.classList.add('visible', 'is-dictating');
                break;
            case 'error':
                badge.innerHTML = '<iconify-icon icon="solar:danger-triangle-bold"></iconify-icon>';
                badge.classList.add('visible', 'error', 'icon-only');
                break;
            default:
                badge.dataset.statusState = 'hidden';
                break;
        }

        this._syncElementTooltip(badge, tooltip);
    },

    /**
     * Quick helper to refresh both Status and Source indicators from current student
     * @param {Object} [options={}]
     * @param {boolean} [options.dirtyOnly=false] - When true, update the list row dirty indicator in place
     */
    refreshAppreciationStatus(options = {}) {
        const currentStudentId = this._getCurrentStudentId();
        if (!currentStudentId) return;
        const result = appState.generatedResults.find(r => r.id === currentStudentId);
        if (result) {
            // Update both indicators
            this.updateAppreciationStatus(result);
            this.updateSourceIndicator(result);

            // Also update generate button to reflect dirty state
            this._callbacks?.onUpdateGenerateButton?.(result);
            // Update the List View row (or fall back to decoupled event when callback is not wired)
            if (this._callbacks?.onUpdateListRow) {
                const rowOptions = options?.dirtyOnly ? { dirtyOnly: true } : undefined;
                this._callbacks.onUpdateListRow(result, rowOptions);
            } else {
                bus.emit(EVENTS.STUDENT_DIRTY_STATE_CHANGED, { studentId: currentStudentId, result });
            }
        }
    },

    /**
     * Update word/character count display and character limit guardrails
     * @param {boolean} [animate=false] - Whether to animate the number change
     * @param {number|null} [fromCount=null] - Optional starting word count for animation
     * @param {number|null} [targetCount=null] - Optional target word count (use when DOM not ready yet)
     * @param {number|null} [targetCharCount=null] - Optional target character count (use when DOM not ready yet)
     */
    updateWordCount(animate = false, fromCount = null, targetCount = null, targetCharCount = null) {
        // Cancel speech synthesis on any content change if it is currently playing
        if (SpeechSynthesisManager.isPlaying()) {
            SpeechSynthesisManager.cancel();
        }

        const appreciationText = document.getElementById('focusAppreciationText');
        const wordCountEl = document.getElementById('focusWordCount');

        if (!wordCountEl) return;

        // Determine word & char counts: use explicit targets if provided, else read from DOM
        let words, charCount, isEmpty;

        if (targetCount !== null) {
            // Target provided explicitly (DOM not ready yet, e.g. during typewriter)
            words = targetCount;
            charCount = targetCharCount !== null ? targetCharCount : null;
            isEmpty = words === 0;
        } else if (appreciationText) {
            const hasSkeleton = Boolean(appreciationText.querySelector('.appreciation-skeleton'));
            const text = appreciationText.textContent || '';
            isEmpty = !hasSkeleton && !text.trim();
            words = isEmpty ? 0 : Utils.countWords(text);
            charCount = isEmpty ? 0 : Utils.countCharacters(text);

            // Normalize empty contenteditable DOM (strip residual <br>/<div> from Backspace) so :empty & ::before layout stay clean
            if (isEmpty) {
                if (appreciationText.innerHTML !== '') {
                    appreciationText.innerHTML = '';
                }
                appreciationText.classList.add('empty');
            } else {
                appreciationText.classList.remove('empty');
            }
        } else {
            return;
        }

        const isGenerating = this._isGenerating(this._getCurrentStudentId()) || targetCount !== null;
        const shouldDisable = isEmpty || isGenerating;

        if (!isGenerating || targetCount !== null) {
            // Update refinement buttons state: completely hidden when empty to avoid ghost disabled chips
            const refinementOptions = document.getElementById('focusRefinementOptions');
            if (refinementOptions) {
                refinementOptions.style.display = isEmpty ? 'none' : 'flex';
                if (isEmpty) {
                    refinementOptions.classList.remove('is-custom-mode');
                    if (HistoryManager.isOpen('focusCustomRefine')) {
                        HistoryManager.handleManualClose('focusCustomRefine');
                    }
                }
                const refineButtons = refinementOptions.querySelectorAll('[data-refine-type], #focusCustomRefineTrigger');
                refineButtons.forEach(btn => {
                    btn.disabled = false; // Always ensure native disabled is removed to allow hover and tooltips
                    btn.classList.toggle('disabled', shouldDisable && !btn.classList.contains('is-generating'));
                });
            }

            this.syncCopyButton({ isEmpty, isGenerating });

            const speakBtn = document.getElementById('focusAppreciationSpeakBtn');
            if (speakBtn) {
                const canSpeak = SpeechSynthesisManager.isSupported?.() ?? true;
                speakBtn.disabled = shouldDisable || !canSpeak;
                speakBtn.classList.toggle('disabled', shouldDisable || !canSpeak);
                speakBtn.style.display = (isEmpty || !canSpeak) ? 'none' : 'inline-flex';
            }

            const micBtn = document.getElementById('focusAppreciationMicBtn');
            if (micBtn) {
                micBtn.disabled = isGenerating;
                micBtn.classList.toggle('disabled', isGenerating);
            }

            this.syncRefinementStates();
        }

        const activeMaxChars = PromptService.getActiveMaxChars?.() ?? null;

        if (isEmpty) {
            wordCountEl.textContent = '';
            wordCountEl.classList.remove('is-limit-near', 'is-limit-over');
            if (wordCountEl._tippy) {
                wordCountEl._tippy.destroy();
            }
            wordCountEl.removeAttribute('data-tooltip');
            this._syncConciseLimitHint('none', null);
        } else {
            const limitInfo = (activeMaxChars && charCount !== null && typeof Utils.getCharLimitState === 'function')
                ? Utils.getCharLimitState(charCount, activeMaxChars)
                : { limit: null, state: 'none', overBy: 0 };

            const useCharLimitDisplay = Boolean(limitInfo.limit && charCount !== null);
            const displayValue = useCharLimitDisplay ? charCount : words;
            const templateFn = useCharLimitDisplay
                ? (val) => `${val}/${limitInfo.limit}<span class="word-count-unit"> car.</span>`
                : (val) => `${val} mot${val !== 1 ? 's' : ''}`;

            wordCountEl.classList.toggle('is-limit-near', limitInfo.state === 'near');
            wordCountEl.classList.toggle('is-limit-over', limitInfo.state === 'over');
            this._syncConciseLimitHint(limitInfo.state, limitInfo.limit);

            if (animate) {
                let startVal = 0;
                if (!useCharLimitDisplay && fromCount !== null) {
                    startVal = fromCount;
                } else {
                    const prevText = wordCountEl.textContent || '';
                    const prevMatch = prevText.match(/(\d+)/);
                    startVal = prevMatch ? parseInt(prevMatch[1], 10) : 0;
                }

                if (startVal !== displayValue) {
                    StatsUI.animateNumberWithMarkup(wordCountEl, startVal, displayValue, 600, templateFn);
                } else {
                    wordCountEl.innerHTML = templateFn(displayValue);
                }
            } else {
                wordCountEl.innerHTML = templateFn(displayValue);
            }

            // Update tooltip (only if we have char count)
            if (charCount !== null) {
                const wordLabel = `${words} mot${words !== 1 ? 's' : ''}`;
                let summaryLine;
                if (limitInfo.limit) {
                    const overSuffix = limitInfo.overBy > 0 ? ` (+${limitInfo.overBy})` : '';
                    summaryLine = `${wordLabel} · ${charCount}/${limitInfo.limit} car.${overSuffix}`;
                } else {
                    summaryLine = `${wordLabel} · ${charCount} car.`;
                }
                const tooltipText = `${summaryLine}<br><span class="kbd-hint">Ajuster la longueur</span>`;
                if (typeof UI?.updateTooltip === 'function') {
                    UI.updateTooltip(wordCountEl, tooltipText);
                } else {
                    wordCountEl.setAttribute('data-tooltip', tooltipText);
                }
            }
        }
    },

    /**
     * Synchronise les états visuels des contrôles de retouche :
     * - Bascule active (`.active` + `aria-pressed`) sur Encourageante / Exigeante
     * - Visibilité et mise en avant contextuelle de Peaufiner (après saisie manuelle ou dictée)
     * @param {Object|null} [explicitResult=null]
     */
    syncRefinementStates(explicitResult = null) {
        const currentId = this._getCurrentStudentId();
        const result = explicitResult || (currentId
            ? appState.generatedResults?.find(r => r.id === currentId)
            : null);
        const textEl = document.getElementById('focusAppreciationText');
        const hasSkeleton = Boolean(textEl?.querySelector('.appreciation-skeleton'));
        const currentText = hasSkeleton ? '' : (textEl?.textContent || '').trim();
        const isEmpty = !hasSkeleton && !currentText;
        const isGenerating = this._isGenerating(currentId);
        const currentVersion = FocusPanelHistory.getCurrentVersion?.() ?? null;

        const TONE_TOOLTIPS = {
            encouraging: 'Ton plus bienveillant et valorisant',
            demanding: 'Ton plus ferme et exigeant'
        };
        const activeTone = (
            !isEmpty &&
            currentVersion &&
            (currentVersion.source === 'encouraging' || currentVersion.source === 'demanding') &&
            Boolean(currentVersion.toneBaseContent) &&
            currentVersion.content?.trim() === currentText
        ) ? currentVersion.source : null;

        for (const toneType of ['encouraging', 'demanding']) {
            const btn = document.querySelector(`#focusRefinementOptions [data-refine-type="${toneType}"]`);
            if (!btn) continue;
            const isActive = activeTone === toneType;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', String(isActive));

            const tooltipText = isActive
                ? 'Cliquer pour revenir à la version précédente'
                : TONE_TOOLTIPS[toneType];
            if (btn.classList.contains('is-generating')) {
                btn.dataset.baseTooltip = tooltipText;
            } else if (typeof UI?.updateTooltip === 'function') {
                UI.updateTooltip(btn, tooltipText);
            } else {
                btn.setAttribute('data-tooltip', tooltipText);
            }
        }

        const polishBtn = document.getElementById('focusPolishBtn');
        if (polishBtn) {
            polishBtn.style.display = isEmpty ? 'none' : 'inline-flex';
            polishBtn.disabled = false;
            polishBtn.classList.toggle('disabled', (isEmpty || isGenerating) && !polishBtn.classList.contains('is-generating'));
            polishBtn.setAttribute('aria-disabled', String((isEmpty || isGenerating) && !polishBtn.classList.contains('is-generating')));

            const source = result ? this._resolveSource(result) : 'none';
            const currentVersionMatches = Boolean(
                currentVersion && currentVersion.content?.trim() === currentText
            );
            const isRecommended = !isEmpty && !isGenerating && (
                currentVersion
                    ? (!currentVersionMatches
                        || currentVersion.source === 'edit'
                        || currentVersion.source === 'dictation'
                        || (!currentVersion.source && source === 'manual'))
                    : source === 'manual'
            );
            polishBtn.classList.toggle('is-polish-recommended', isRecommended);

            const polishTooltip = isRecommended
                ? 'Corriger et fluidifier votre rédaction'
                : 'Corriger les maladresses et fluidifier la syntaxe';
            if (polishBtn.classList.contains('is-generating')) {
                polishBtn.dataset.baseTooltip = polishTooltip;
            } else if (typeof UI?.updateTooltip === 'function') {
                UI.updateTooltip(polishBtn, polishTooltip);
            } else {
                polishBtn.setAttribute('data-tooltip', polishTooltip);
            }
        }
    },

    /**
     * Met discrètement en avant le bouton « Raccourcir » lorsque la limite de caractères est dépassée.
     * @param {'none'|'ok'|'near'|'over'} limitState
     * @param {number|null} maxChars
     * @private
     */
    _syncConciseLimitHint(limitState, maxChars) {
        const conciseBtn = document.querySelector('#focusRefinementOptions [data-refine-type="concise"]');
        if (!conciseBtn) return;

        const isOver = limitState === 'over' && Boolean(maxChars);
        conciseBtn.classList.toggle('is-limit-recommended', isOver);
        const tooltipText = isOver
            ? `Raccourcir sous la limite (${maxChars} car.)`
            : "Raccourcir et aller à l'essentiel";
        if (conciseBtn.classList.contains('is-generating')) {
            conciseBtn.dataset.baseTooltip = tooltipText;
            return;
        }
        if (typeof UI?.updateTooltip === 'function') {
            UI.updateTooltip(conciseBtn, tooltipText);
        } else {
            conciseBtn.setAttribute('data-tooltip', tooltipText);
        }
    },

    /**
     * Retourne le libellé par défaut du bouton #focusCopyBtn selon son mode courant.
     * @param {HTMLElement|null} copyBtn
     * @returns {string}
     */
    getCopyButtonDefaultLabel(copyBtn) {
        const mode = copyBtn?.dataset?.copyMode === 'prompt' ? 'prompt' : 'appreciation';
        return COPY_BUTTON_MODES[mode].label;
    },

    /**
     * Synchronise le bouton adaptatif #focusCopyBtn (Prompt à vide, Copier quand rempli).
     * @param {Object} options
     * @param {boolean} options.isEmpty - True si l'appréciation est vide
     * @param {boolean} [options.isGenerating=false] - True pendant une génération IA
     */
    syncCopyButton({ isEmpty, isGenerating = false }) {
        const copyBtn = document.getElementById('focusCopyBtn');
        if (!copyBtn) return;

        const mode = isEmpty ? 'prompt' : 'appreciation';
        const config = COPY_BUTTON_MODES[mode];
        const currentId = this._getCurrentStudentId();
        const currentResult = currentId
            ? appState.generatedResults?.find(r => r.id === currentId)
            : null;
        const isAlreadyCopied = mode === 'appreciation'
            && Boolean(currentResult && Utils.isAppreciationCopied?.(currentResult, appState.currentPeriod));
        const isDirty = mode === 'appreciation'
            && Boolean(currentResult && this.isBulkRefreshable(currentResult, appState.currentPeriod));
        const tooltip = isAlreadyCopied
            ? config.copiedTooltip
            : config.tooltip;
        const ariaLabel = isAlreadyCopied
            ? 'Copier à nouveau (déjà copiée)'
            : config.ariaLabel;

        copyBtn.dataset.copyMode = mode;
        copyBtn.disabled = false;
        copyBtn.classList.toggle('disabled', isGenerating);
        copyBtn.classList.toggle('is-primary-action', mode === 'appreciation' && !isGenerating && !isDirty);
        copyBtn.setAttribute('aria-disabled', String(isGenerating));
        copyBtn.setAttribute('aria-label', ariaLabel);

        if (typeof UI?.updateTooltip === 'function') {
            UI.updateTooltip(copyBtn, tooltip);
        } else {
            copyBtn.setAttribute('data-tooltip', tooltip);
        }

        if (!copyBtn.classList.contains('copied') && !copyBtn.classList.contains('copied-prompt')) {
            const labelEl = copyBtn.querySelector('.btn-copy-label');
            if (labelEl) labelEl.textContent = config.label;
        }
    },

    /**
     * Resolve the source of an appreciation from a result object.
     * Priority: explicit `appreciationSource` field > fallback on `wasGenerated`.
     * Returns 'ai' | 'manual' | 'imported' | 'none'
     * @param {Object} result
     * @returns {'ai'|'manual'|'imported'|'none'}
     * @private
     */
    _resolveSource(result) {
        if (!this._hasRealContent(result?.appreciation)) return 'none';

        // Explicit field takes priority (new data)
        if (result.appreciationSource) return result.appreciationSource;

        // Fallback: legacy wasGenerated flag
        const currentPeriod = appState.currentPeriod;
        const wasGeneratedForCurrentPeriod = result?.wasGenerated === true
            && (!result.generationPeriod || result.generationPeriod === currentPeriod);

        return wasGeneratedForCurrentPeriod ? 'ai' : 'manual';
    },

    /**
     * Update Source Indicator (shows HOW appreciation was produced)
     * 3 states: AI (✨) / Imported (⬇) / Manual (✏️) / None (hidden)
     * @param {Object} result - Student result object
     */
    updateSourceIndicator(result) {
        const sourceIndicator = document.getElementById('focusAiIndicator');
        if (!sourceIndicator) return;

        // Hide source indicator when an error is active — error badge takes priority
        const hasError = !!(result?.errorMessage && result?.errorPeriod === appState.currentPeriod);
        const effectiveSource = hasError ? 'none' : this._resolveSource(result);

        let tooltip = '';
        let iconName = '';
        let sourceClass = '';
        if (effectiveSource === 'ai') {
            iconName = 'solar:stars-bold-duotone';
            sourceClass = 'source-ai';
            tooltip = Utils.getGenerationModeInfo(result).tooltip || 'Généré par IA';
        } else if (effectiveSource === 'imported') {
            iconName = 'solar:file-download-linear';
            sourceClass = 'source-imported';
            tooltip = 'Importé depuis un fichier';
        } else if (effectiveSource === 'manual') {
            iconName = 'solar:pen-linear';
            sourceClass = 'source-manual';
            tooltip = 'Rédigé manuellement';
        }

        const expectedDisplay = effectiveSource === 'none' ? 'none' : 'inline-flex';
        const existingIcon = sourceIndicator.querySelector('iconify-icon');
        const isSameSource = sourceIndicator.dataset.sourceState === effectiveSource
            && (effectiveSource === 'none' || Boolean(existingIcon));

        if (!isSameSource) {
            sourceIndicator.dataset.sourceState = effectiveSource;
            sourceIndicator.classList.remove('source-ai', 'source-manual', 'source-imported');

            if (effectiveSource !== 'none') {
                if (existingIcon) {
                    if (existingIcon.getAttribute('icon') !== iconName) {
                        existingIcon.setAttribute('icon', iconName);
                    }
                } else {
                    sourceIndicator.innerHTML = `<iconify-icon icon="${iconName}"></iconify-icon>`;
                }
                sourceIndicator.classList.add(sourceClass);
            }
        }

        // Always restore display (e.g. after showAppreciationSkeleton() hides #focusAiIndicator during regeneration)
        if (sourceIndicator.style.display !== expectedDisplay) {
            sourceIndicator.style.display = expectedDisplay;
        }

        this._syncElementTooltip(sourceIndicator, tooltip);
        if (!hasError) {
            this.syncRefinementStates(result);
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
            Utils.setAppreciationCopied(result, appState.currentPeriod, false);
            if (result.studentData?.periods?.[appState.currentPeriod]) {
                result.studentData.periods[appState.currentPeriod].appreciation = content;
            }
        }
    },

    /**
     * Update the history indicator UI (shared stepper logic via HistoryPopoverUI)
     */
    updateHistoryIndicator() {
        const group = document.getElementById('historyNavigationGroup');
        const indicator = document.getElementById('focusHistoryIndicator');
        const prevBtn = document.getElementById('focusHistoryPrevBtn');
        const nextBtn = document.getElementById('focusHistoryNextBtn');

        if (!group || !indicator) return;

        const state = FocusPanelHistory._getState?.() ?? null;
        const textEl = document.getElementById('focusAppreciationText');
        const hasSkeleton = Boolean(textEl?.querySelector('.appreciation-skeleton'));
        const isCurrentlyEmpty = !hasSkeleton && Boolean(textEl?.classList.contains('empty') || !textEl?.textContent?.trim());
        const isBusy = this._isGenerating(this._getCurrentStudentId());

        HistoryPopoverUI.syncStepperUI({
            groupEl: group,
            prevBtn,
            indicatorBtn: indicator,
            nextBtn,
            state,
            isCurrentlyEmpty,
            isBusy,
            onHide: () => FocusPanelHistory.closePopover?.()
        });
        this.syncRefinementStates();
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
