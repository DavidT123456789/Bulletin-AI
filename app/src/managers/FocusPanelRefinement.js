/**
 * @fileoverview Focus Panel Refinement — AI-powered appreciation refinement
 * Extracted from FocusPanelManager.js (Phase 2 — God Object Decomposition)
 * @module managers/FocusPanelRefinement
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { AIService } from '../services/AIService.js';
import { PromptService } from '../services/PromptService.js';
import { ModalUI } from './ModalUIManager.js';
import { FocusPanelHistory } from './FocusPanelHistory.js';
import { FocusPanelStatus } from './FocusPanelStatus.js';
import { StorageManager } from './StorageManager.js';
import { ListViewManager } from './ListViewManager.js';

/** @type {import('./FocusPanelManager.js').FocusPanelManager|null} */
let panel = null;

/** @type {import('./UIManager.js').UI|null} */
let UI = null;

const TONE_TYPES = new Set(['encouraging', 'demanding']);

export const FocusPanelRefinement = {

    /**
     * Initialize with parent references
     * @param {Object} focusPanelManager - FocusPanelManager reference
     * @param {Object} uiManager - UI reference
     * @param {Object} [maybeUiManager] - Optional 3rd arg for backward-compatible test signature
     */
    init(focusPanelManager, uiManager, maybeUiManager = null) {
        panel = focusPanelManager;
        UI = maybeUiManager || uiManager;
    },

    /**
     * Retourne tous les boutons de retouche IA de la carte Bulletin (puces + Peaufiner).
     * @returns {HTMLElement[]}
     * @private
     */
    _getRefineButtons() {
        return Array.from(
            document.querySelectorAll('#focusRefinementOptions [data-refine-type], #focusPolishBtn[data-refine-type]')
        );
    },

    /**
     * Retourne le bouton correspondant à un type de retouche donné.
     * @param {string} refineType
     * @returns {HTMLElement|null}
     * @private
     */
    _getRefineButton(refineType) {
        if (refineType === 'custom') {
            return document.getElementById('focusCustomRefineSubmitBtn');
        }
        return document.querySelector(
            `#focusRefinementOptions [data-refine-type="${refineType}"], #focusPolishBtn[data-refine-type="${refineType}"]`
        );
    },

    /**
     * Indique si la barre de consigne libre est actuellement ouverte.
     * @returns {boolean}
     */
    isCustomInputOpen() {
        return Boolean(document.getElementById('focusRefinementOptions')?.classList.contains('is-custom-mode'));
    },

    /**
     * Synchronise l'état actif/désactivé du bouton d'envoi de la consigne libre.
     */
    _syncCustomSubmitState() {
        const input = document.getElementById('focusCustomRefineInput');
        const submitBtn = document.getElementById('focusCustomRefineSubmitBtn');
        if (!submitBtn) return;

        if (submitBtn.classList.contains('is-generating')) {
            submitBtn.classList.remove('disabled');
            submitBtn.setAttribute('aria-disabled', 'false');
            return;
        }
        const hasText = Boolean(input?.value?.trim());
        submitBtn.classList.toggle('disabled', !hasText);
        submitBtn.setAttribute('aria-disabled', String(!hasText));
        const tooltipText = hasText
            ? "Appliquer la retouche<br><span class='kbd-hint'>Clic droit : voir le prompt</span>"
            : 'Saisissez une consigne de retouche';
        if (typeof UI?.updateTooltip === 'function') {
            UI.updateTooltip(submitBtn, tooltipText);
        } else {
            submitBtn.setAttribute('data-tooltip', tooltipText);
        }
    },

    /**
     * Ouvre la barre de consigne libre sur place (en remplaçant temporairement les puces).
     */
    openCustomInput() {
        const ctx = this._resolveRefinementContext();
        if (!ctx) return;

        const container = document.getElementById('focusRefinementOptions');
        const input = document.getElementById('focusCustomRefineInput');
        if (!container || !input) return;

        container.classList.add('is-custom-mode');
        input.disabled = false;
        this._syncCustomSubmitState();
        input.focus();
        if (input.value) {
            input.select();
        }
    },

    /**
     * Referme la barre de consigne libre et restaure les puces.
     * @param {Object} [options={}]
     * @param {boolean} [options.clear=false]
     * @param {boolean} [options.restoreFocus=false]
     */
    closeCustomInput({ clear = false, restoreFocus = false } = {}) {
        const container = document.getElementById('focusRefinementOptions');
        const input = document.getElementById('focusCustomRefineInput');
        const submitBtn = document.getElementById('focusCustomRefineSubmitBtn');
        const closeBtn = document.getElementById('focusCustomRefineCloseBtn');

        container?.classList.remove('is-custom-mode');
        if (input) {
            if (clear) input.value = '';
            input.disabled = false;
        }
        if (closeBtn) {
            closeBtn.disabled = false;
            closeBtn.classList.remove('disabled');
        }
        if (submitBtn) {
            submitBtn.classList.remove('is-generating');
            if (submitBtn.dataset.baseTooltip !== undefined) {
                const baseTooltip = submitBtn.dataset.baseTooltip;
                delete submitBtn.dataset.baseTooltip;
                if (typeof UI?.updateTooltip === 'function') {
                    UI.updateTooltip(submitBtn, baseTooltip);
                } else {
                    submitBtn.setAttribute('data-tooltip', baseTooltip);
                }
            }
        }
        this._syncCustomSubmitState();

        if (restoreFocus) {
            document.getElementById('focusCustomRefineTrigger')?.focus?.();
        }
    },

    /**
     * Lance (ou annule si en cours) la retouche libre saisie dans #focusCustomRefineInput.
     */
    async applyCustom() {
        const submitBtn = document.getElementById('focusCustomRefineSubmitBtn');
        const studentId = panel?.currentStudentId;
        if (submitBtn?.classList.contains('is-generating') && studentId && panel?._activeGenerations?.has(studentId)) {
            const elapsed = Date.now() - (panel._activeGenerationStartTime || 0);
            if (elapsed >= 350) {
                panel._cancelGenerationForStudent(studentId);
            }
            return;
        }

        const input = document.getElementById('focusCustomRefineInput');
        const instruction = input?.value?.trim() || '';
        if (!instruction) {
            input?.focus?.();
            return;
        }

        await this.apply('custom', { customInstruction: instruction });
    },

    /**
     * Prévisualise le prompt de retouche libre (clic droit sur le bouton d'envoi).
     */
    async showCustomPreview() {
        const input = document.getElementById('focusCustomRefineInput');
        const instruction = input?.value?.trim() || '';
        if (!instruction) return;
        await this.showPreview('custom', { customInstruction: instruction });
    },

    /**
     * Résout et valide le contexte courant avant prévisualisation ou application d'une retouche.
     * @returns {{ refineStudentId: string, refinePeriod: string, refineClassId: string, result: Object, appreciationText: HTMLElement|null, currentText: string }|null}
     * @private
     */
    _resolveRefinementContext() {
        if (panel?._isAppreciationEdited && typeof panel?.saveCurrentContext === 'function') {
            panel.saveCurrentContext();
        }

        const refineStudentId = panel?.currentStudentId;
        const refinePeriod = appState.currentPeriod;
        const refineClassId = appState.currentClassId;
        const result = appState.generatedResults?.find(r => r.id === refineStudentId);
        const appreciationText = document.getElementById('focusAppreciationText');

        const stateText = (
            result?.studentData?.periods?.[refinePeriod]?.appreciation ??
            (result?.generationPeriod === refinePeriod ? result?.appreciation : '') ??
            ''
        ).trim();
        const currentText = stateText || appreciationText?.textContent?.trim() || '';

        if (!result || !currentText || currentText.includes('Aucune appréciation')) {
            UI?.showNotification?.('Générez d\'abord une appréciation', 'info');
            return null;
        }

        return { refineStudentId, refinePeriod, refineClassId, result, appreciationText, currentText };
    },

    /**
     * Active ou désactive les boutons d'action secondaires de la carte pendant une retouche.
     * @param {boolean} disabled
     * @private
     */
    _setSecondaryControlsDisabled(disabled) {
        for (const id of ['focusCopyBtn', 'focusAppreciationSpeakBtn', 'focusAppreciationMicBtn', 'focusCustomRefineTrigger']) {
            const el = document.getElementById(id);
            if (!el) continue;
            el.classList.toggle('disabled', disabled);
            if (id === 'focusCopyBtn' || id === 'focusCustomRefineTrigger') {
                el.disabled = false;
                el.setAttribute('aria-disabled', String(disabled));
            } else if (!disabled) {
                el.disabled = false;
            }
        }
    },

    /**
     * Construit le descripteur d'identité, classe et dossier élève utilisé par PromptService.
     * @param {{ refineStudentId: string, refinePeriod: string, refineClassId: string, result: Object }} ctx
     * @param {Object} [extra={}]
     * @returns {Object}
     * @private
     */
    _buildRefinementOptions(ctx, extra = {}) {
        const result = ctx?.result;
        const classId = result?.classId || result?.studentData?.classId || ctx?.refineClassId || null;
        const studentData = typeof panel?._prepareStudentData === 'function'
            ? panel._prepareStudentData(ctx.refineStudentId, ctx.refinePeriod, result)
            : (result?.studentData
                ? {
                    ...result.studentData,
                    id: ctx?.refineStudentId ?? result?.id ?? null,
                    classId,
                    nom: result?.nom || result?.studentData?.nom || '',
                    prenom: result?.prenom || result?.studentData?.prenom || '',
                    currentPeriod: ctx?.refinePeriod || appState.currentPeriod
                }
                : null);

        return {
            id: ctx?.refineStudentId ?? result?.id ?? null,
            classId,
            prenom: result?.studentData?.prenom || result?.prenom || '',
            nom: result?.studentData?.nom || result?.nom || '',
            currentPeriod: ctx?.refinePeriod || appState.currentPeriod,
            studentData,
            ...extra
        };
    },

    /**
     * Résout le texte source effectif (pour éviter l'effet « téléphone arabe » entre Encourageante et Exigeante).
     * @param {string} refineType
     * @param {{ refineStudentId: string, refinePeriod: string, currentText: string }} ctx
     * @returns {{ sourceText: string, toneBaseContent: string|null, currentVersion: Object|null, currentVersionMatches: boolean }}
     * @private
     */
    _resolveSourceForRefinement(refineType, ctx) {
        const currentVersion = FocusPanelHistory.getCurrentVersion?.(ctx.refinePeriod, ctx.refineStudentId) ?? null;
        const currentVersionMatches = Boolean(
            currentVersion && currentVersion.content?.trim() === ctx.currentText.trim()
        );

        if (!TONE_TYPES.has(refineType)) {
            return {
                sourceText: ctx.currentText,
                toneBaseContent: null,
                currentVersion,
                currentVersionMatches
            };
        }

        if (
            currentVersionMatches &&
            TONE_TYPES.has(currentVersion.source) &&
            currentVersion.source !== refineType &&
            currentVersion.toneBaseContent
        ) {
            const baseText = currentVersion.toneBaseContent.trim();
            return {
                sourceText: baseText,
                toneBaseContent: baseText,
                currentVersion,
                currentVersionMatches
            };
        }

        return {
            sourceText: ctx.currentText,
            toneBaseContent: ctx.currentText.trim(),
            currentVersion,
            currentVersionMatches
        };
    },

    /**
     * Affiche une prévisualisation du prompt de raffinement
     * @param {string} refineType - Type de raffinement
     * @param {Object} [options={}]
     */
    async showPreview(refineType, options = {}) {
        const ctx = this._resolveRefinementContext();
        if (!ctx) return;

        const { sourceText, currentVersion, currentVersionMatches } = this._resolveSourceForRefinement(refineType, ctx);
        const previousCustomInstruction = refineType === 'custom' && currentVersionMatches && currentVersion?.source === 'custom'
            ? (currentVersion.customInstruction || '')
            : '';

        const promptText = PromptService.getRefinementPrompt(
            refineType,
            sourceText,
            this._buildRefinementOptions(ctx, {
                ...options,
                ...(previousCustomInstruction ? { previousCustomInstruction } : {})
            })
        );
        await this.displayPromptModal(promptText, 'Prévisualisation du prompt (raffinement)');
    },

    /**
     * Helper partagé pour afficher une modale de prévisualisation de prompt
     * (avec résumé lisible optionnel des données transmises à l'IA).
     * @param {string} promptText - Le texte du prompt à afficher
     * @param {string} [title='Prévisualisation du prompt'] - Le titre de la modale
     * @param {Object} [options={}]
     * @param {string} [options.summaryHtml=''] - HTML structuré du résumé humain affiché au-dessus du prompt brut
     */
    async displayPromptModal(promptText, title = 'Prévisualisation du prompt', options = {}) {
        const escapedText = Utils.escapeHtml(promptText);
        const escapedTitle = Utils.escapeHtml(title);
        const summaryHtml = typeof options?.summaryHtml === 'string' ? options.summaryHtml : '';
        const copyLabel = summaryHtml ? 'Copier le prompt' : 'Copier';
        const headerIcon = summaryHtml ? 'solar:eye-linear' : 'solar:code-square-linear';

        const modalId = 'promptPreviewModal';
        let modal = document.getElementById(modalId);
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal modal-prompt-preview';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'promptPreviewModalTitle');

        const bodyHtml = summaryHtml
            ? `${summaryHtml}
               <details class="prompt-raw-details">
                   <summary class="prompt-raw-toggle">
                       <iconify-icon icon="solar:code-square-linear" aria-hidden="true"></iconify-icon>
                       <span>Voir le prompt complet</span>
                       <iconify-icon class="prompt-raw-chevron" icon="solar:alt-arrow-down-linear" aria-hidden="true"></iconify-icon>
                   </summary>
                   <div class="prompt-preview-content">${escapedText}</div>
               </details>`
            : `<div class="prompt-preview-content">${escapedText}</div>`;

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title" id="promptPreviewModalTitle">
                        <span class="modal-title-icon"><iconify-icon icon="${headerIcon}"></iconify-icon></span>
                        <span class="modal-title-text">${escapedTitle}</span>
                    </h2>
                    <button type="button" class="close-button" aria-label="Fermer">
                        <iconify-icon icon="ph:x"></iconify-icon>
                    </button>
                </div>
                <div class="modal-body" tabindex="0">
                    ${bodyHtml}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="promptPreviewCloseBtn">Fermer</button>
                    <button type="button" class="btn btn-primary" id="promptPreviewCopyBtn">
                        <iconify-icon icon="solar:copy-linear"></iconify-icon>
                        ${copyLabel}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        return new Promise((resolve) => {
            const copyBtn = modal.querySelector('#promptPreviewCopyBtn');
            const closeBtn = modal.querySelector('#promptPreviewCloseBtn');
            const xBtn = modal.querySelector('.close-button');
            let closed = false;
            let copyResetTimer = null;

            const finalizeClose = () => {
                if (closed) return;
                closed = true;
                if (copyResetTimer) {
                    clearTimeout(copyResetTimer);
                    copyResetTimer = null;
                }
                resolve();
            };

            const handleCopy = async () => {
                try {
                    await navigator.clipboard.writeText(promptText);
                    UI.showNotification('Prompt copié dans le presse-papier', 'prompt');
                    if (copyResetTimer) clearTimeout(copyResetTimer);
                    copyBtn.innerHTML = '<iconify-icon icon="solar:check-read-linear"></iconify-icon> Copié';
                    copyBtn.classList.replace('btn-primary', 'btn-success');
                    copyResetTimer = setTimeout(() => {
                        copyResetTimer = null;
                        copyBtn.innerHTML = `<iconify-icon icon="solar:copy-linear"></iconify-icon> ${copyLabel}`;
                        copyBtn.classList.replace('btn-success', 'btn-primary');
                    }, 2000);
                } catch (err) {
                    UI.showNotification('Échec de la copie', 'error');
                }
            };

            const handleClose = () => {
                if (closed) return;
                finalizeClose();
                ModalUI.closeModal(modal);
            };

            ModalUI.openModal(modal, { onClose: finalizeClose });

            copyBtn?.addEventListener('click', handleCopy);
            closeBtn?.addEventListener('click', handleClose, { once: true });
            xBtn?.addEventListener('click', handleClose, { once: true });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) handleClose();
            });
            modal.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleClose();
                }
            });
        });
    },

    /**
     * Apply a refinement style or freeform instruction to the appreciation
     * @param {string} refineType - Type of refinement (concise, encouraging, demanding, polish, custom)
     * @param {Object} [options={}] - Optional refinement parameters ({ customInstruction })
     */
    async apply(refineType, options = {}) {
        const ctx = this._resolveRefinementContext();
        if (!ctx) return;
        const { refineStudentId, refinePeriod, refineClassId, result, appreciationText, currentText } = ctx;

        const btn = this._getRefineButton(refineType);
        if (btn?.classList.contains('is-generating') && panel?._activeGenerations?.has(refineStudentId)) {
            const elapsed = Date.now() - (panel._activeGenerationStartTime || 0);
            if (elapsed >= 350) {
                panel._cancelGenerationForStudent(refineStudentId);
            }
            return;
        }

        const customInstruction = refineType === 'custom'
            ? String(options?.customInstruction || '').trim()
            : '';
        if (refineType === 'custom' && !customInstruction) {
            return;
        }

        const { sourceText, toneBaseContent, currentVersion, currentVersionMatches } = this._resolveSourceForRefinement(refineType, ctx);

        // Bascule réversible sur les variantes de ton (Encourageante ↔ Exigeante) :
        // 1) Re-clic sur le ton actif -> retour instantané à la base (0 ms, 0 appel API)
        if (TONE_TYPES.has(refineType) && currentVersionMatches && currentVersion?.source === refineType && currentVersion?.toneBaseContent) {
            const baseIdx = FocusPanelHistory.findContentIndex?.(currentVersion.toneBaseContent, refinePeriod, refineStudentId) ?? -1;
            if (baseIdx !== -1) {
                FocusPanelHistory.restoreVersion(baseIdx);
                return;
            }
            // Fallback si la version de base a été évincée par MAX_VERSIONS
            FocusPanelHistory.push(currentVersion.toneBaseContent, 'edit', {
                studentId: refineStudentId,
                period: refinePeriod,
                autoSeed: false
            });
            const pushedIdx = FocusPanelHistory.findContentIndex?.(currentVersion.toneBaseContent, refinePeriod, refineStudentId) ?? -1;
            if (pushedIdx !== -1) {
                FocusPanelHistory.restoreVersion(pushedIdx);
            }
            return;
        }

        // 2) Variante déjà calculée pour cette même base -> bascule instantanée (0 ms, 0 appel API)
        if (TONE_TYPES.has(refineType) && toneBaseContent) {
            const cachedIdx = FocusPanelHistory.findToneVariantIndex?.(refineType, toneBaseContent, refinePeriod, refineStudentId) ?? -1;
            if (cachedIdx !== -1) {
                FocusPanelHistory.restoreVersion(cachedIdx);
                return;
            }
        }

        if (typeof UI?.checkAPIKeyPresence === 'function' && !UI.checkAPIKeyPresence()) {
            return;
        }

        FocusPanelHistory.push(currentText, 'edit', { studentId: refineStudentId, period: refinePeriod });

        const allRefineBtns = this._getRefineButtons();
        allRefineBtns.forEach(b => {
            b.classList.remove('is-generating');
            b.classList.toggle('disabled', b !== btn);
        });

        const customInput = document.getElementById('focusCustomRefineInput');
        const customCloseBtn = document.getElementById('focusCustomRefineCloseBtn');
        if (refineType === 'custom') {
            if (customInput) customInput.disabled = true;
            if (customCloseBtn) {
                customCloseBtn.disabled = true;
                customCloseBtn.classList.add('disabled');
            }
        } else if (this.isCustomInputOpen()) {
            this.closeCustomInput();
        }

        if (btn) {
            btn.classList.remove('disabled');
            btn.classList.add('is-generating');
            btn.dataset.baseTooltip ??= btn.dataset.tooltip || '';
            if (typeof UI?.updateTooltip === 'function') {
                UI.updateTooltip(btn, 'Cliquer pour annuler');
            } else {
                btn.setAttribute('data-tooltip', 'Cliquer pour annuler');
            }
        }
        FocusPanelStatus.updateAppreciationStatus(null, { state: 'pending' });

        panel?._cancelGenerationForStudent?.(refineStudentId, { notify: false, restoreUI: false });

        if (panel) panel._activeGenerationStartTime = Date.now();
        this._setSecondaryControlsDisabled(true);
        const generateBtn = document.getElementById('focusGenerateBtn');
        if (generateBtn) UI?.showInlineSpinner?.(generateBtn);

        const abortController = new AbortController();
        panel?._activeGenerations?.set(refineStudentId, abortController);
        const signal = abortController.signal;
        FocusPanelHistory.closePopover?.();
        FocusPanelStatus.updateHistoryIndicator();

        const isStillOnSameContext = () =>
            panel?.currentStudentId === refineStudentId &&
            appState.currentPeriod === refinePeriod &&
            appState.currentClassId === refineClassId;
        const clearActiveGeneration = () => {
            if (panel?._activeGenerations?.get(refineStudentId)?.signal === signal) {
                panel._activeGenerations.delete(refineStudentId);
            }
        };

        if (panel?.listViewManager?.setRowStatus) {
            panel.listViewManager.setRowStatus(refineStudentId, 'generating');
        } else if (ListViewManager?.setRowStatus) {
            ListViewManager.setRowStatus(refineStudentId, 'generating');
        }

        try {
            const previousCustomInstruction = refineType === 'custom' && currentVersionMatches && currentVersion?.source === 'custom'
                ? (currentVersion.customInstruction || '')
                : '';
            const promptOptions = this._buildRefinementOptions(ctx, {
                ...(customInstruction ? { customInstruction } : {}),
                ...(previousCustomInstruction ? { previousCustomInstruction } : {})
            });
            const studentPrenom = promptOptions.prenom;

            const { systemPrompt, userPrompt } = PromptService.getRefinementPrompts(refineType, sourceText, promptOptions);
            const response = await AIService.callAIWithFallback(userPrompt, { context: 'refinement', systemPrompt, signal });

            if (signal.aborted) return;

            if (response?.text) {
                const refined = PromptService.deanonymizeText(
                    PromptService.sanitizeAppreciationOutput(response.text),
                    studentPrenom
                );
                const finalHtml = Utils.cleanMarkdown(refined);

                if (isStillOnSameContext() && appreciationText) {
                    const currentWordCount = Utils.countWords(appreciationText.textContent || '');
                    const targetWordCount = Utils.countWords(refined);
                    const targetCharCount = Utils.countCharacters(refined);

                    FocusPanelStatus.updateWordCount(true, currentWordCount, targetWordCount, targetCharCount);

                    if (typeof UI?.animateHtmlReveal === 'function') {
                        await UI.animateHtmlReveal(appreciationText, finalHtml, { speed: 'fast', signal });
                    } else {
                        appreciationText.innerHTML = finalHtml;
                    }
                }

                if (signal.aborted) return;

                const priorSource = FocusPanelStatus._resolveSource(result);
                const isProtectedSource = priorSource === 'manual' || priorSource === 'imported';

                Utils.setAppreciationCopied(result, refinePeriod, false);
                result.wasGenerated = !isProtectedSource;
                result.appreciationSource = isProtectedSource ? priorSource : 'ai';
                Utils.markStudentModified(result, refinePeriod);
                result.studentData.periods[refinePeriod].appreciation = refined;

                if (appState.currentPeriod === refinePeriod) {
                    result.appreciation = refined;
                }

                if (response.modelUsed) {
                    result.studentData.currentAIModel = response.modelUsed;
                }
                result.tokenUsage = {
                    appreciation: {
                        total_tokens: response.usage?.total_tokens || 0
                    },
                    analysis: result.tokenUsage?.analysis ?? null,
                    generationTimeMs: response.generationTimeMs || 0
                };
                result.timestamp = new Date().toISOString();

                if (!result.generationPeriod) {
                    result.generationPeriod = refinePeriod;
                }

                FocusPanelHistory.push(refined, refineType, {
                    studentId: refineStudentId,
                    period: refinePeriod,
                    autoSeed: false,
                    ...(toneBaseContent ? { toneBaseContent } : {}),
                    ...(customInstruction ? { customInstruction } : {})
                });

                // Delete the active generation ONLY after animation finishes,
                // so that _saveContext() triggered during animation does not save the span tags.
                clearActiveGeneration();

                if (isStillOnSameContext() && appreciationText) {
                    if (appreciationText.innerHTML !== finalHtml) {
                        appreciationText.innerHTML = finalHtml;
                    }
                    if (panel) {
                        panel._initialAppreciationHtml = finalHtml;
                        panel._isAppreciationEdited = false;
                    }

                    if (refineType === 'custom') {
                        this.closeCustomInput({ clear: true });
                    }

                    FocusPanelStatus.updateWordCount();
                    FocusPanelStatus.updateAppreciationStatus(result, { state: 'generated' });
                    FocusPanelStatus.updateSourceIndicator(result);
                }

                // Update list row and persist
                panel?._updateListRow?.(result);
                StorageManager.saveAppState();
                UI?.updateStats?.();
            }
        } catch (error) {
            const isAborted = error.name === 'AbortError'
                || signal.aborted
                || error.message?.includes('annulé');

            const stillOnSameContext = isStillOnSameContext();
            clearActiveGeneration();

            if (isAborted) {
                if (stillOnSameContext) {
                    FocusPanelStatus.refreshAppreciationStatus();
                }
                panel?._updateListRow?.(result);
                return;
            }

            UI?.showNotification?.(error.message || 'Erreur lors du raffinement', 'error');
            if (stillOnSameContext) {
                FocusPanelStatus.updateAppreciationStatus(result, { state: 'error', tooltip: error.message || 'Erreur lors du raffinement' });
            }
            panel?._updateListRow?.(result);
            StorageManager.saveAppState();
        } finally {
            clearActiveGeneration();
            if (panel?.currentStudentId === refineStudentId && !panel?._activeGenerations?.has(refineStudentId)) {
                btn?.classList.remove('is-generating');
                if (btn?.dataset?.baseTooltip !== undefined) {
                    const baseTooltip = btn.dataset.baseTooltip;
                    delete btn.dataset.baseTooltip;
                    if (typeof UI?.updateTooltip === 'function') {
                        UI.updateTooltip(btn, baseTooltip);
                    } else {
                        btn.setAttribute('data-tooltip', baseTooltip);
                    }
                }
                this._getRefineButtons().forEach(b => {
                    b.classList.remove('disabled');
                });
                if (customInput) customInput.disabled = false;
                if (customCloseBtn) {
                    customCloseBtn.disabled = false;
                    customCloseBtn.classList.remove('disabled');
                }
                this._syncCustomSubmitState();
                if (refineType === 'custom' && this.isCustomInputOpen() && customInput && !window.matchMedia?.('(pointer: coarse)')?.matches) {
                    customInput.focus();
                }
                this._setSecondaryControlsDisabled(false);
                if (generateBtn) UI?.hideInlineSpinner?.(generateBtn);
                panel?._updateGenerateButton?.(result);
                FocusPanelStatus.updateHistoryIndicator();
                FocusPanelStatus.syncRefinementStates?.(result);
            }
        }
    }
};
