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
        for (const id of ['focusCopyBtn', 'focusAppreciationSpeakBtn', 'focusAppreciationMicBtn']) {
            document.getElementById(id)?.classList.toggle('disabled', disabled);
        }
    },

    /**
     * Affiche une prévisualisation du prompt de raffinement
     * @param {string} refineType - Type de raffinement
     */
    async showPreview(refineType) {
        const ctx = this._resolveRefinementContext();
        if (!ctx) return;

        const promptText = PromptService.getRefinementPrompt(refineType, ctx.currentText, {
            prenom: ctx.result.studentData?.prenom || ctx.result.prenom || '',
            nom: ctx.result.studentData?.nom || ctx.result.nom || ''
        });
        await this.displayPromptModal(promptText, 'Prévisualisation du prompt (raffinement)');
    },

    /**
     * Helper partagé pour afficher une modale de prévisualisation de prompt
     * @param {string} promptText - Le texte du prompt à afficher
     * @param {string} [title='Prévisualisation du prompt'] - Le titre de la modale
     */
    async displayPromptModal(promptText, title = 'Prévisualisation du prompt') {
        const escapedText = Utils.escapeHtml(promptText);
        const escapedTitle = Utils.escapeHtml(title);

        const modalId = 'promptPreviewModal';
        let modal = document.getElementById(modalId);
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal modal-prompt-preview';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'promptPreviewModalTitle');

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title" id="promptPreviewModalTitle">
                        <span class="modal-title-icon"><iconify-icon icon="solar:code-square-linear"></iconify-icon></span>
                        <span class="modal-title-text">${escapedTitle}</span>
                    </h2>
                    <button class="close-button" aria-label="Fermer">
                        <iconify-icon icon="ph:x"></iconify-icon>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="prompt-preview-content" tabindex="0">${escapedText}</div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="promptPreviewCloseBtn">Fermer</button>
                    <button class="btn btn-primary" id="promptPreviewCopyBtn">
                        <iconify-icon icon="solar:copy-linear"></iconify-icon>
                        Copier
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
                        copyBtn.innerHTML = '<iconify-icon icon="solar:copy-linear"></iconify-icon> Copier';
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
     * Apply a refinement style to the appreciation
     * @param {string} refineType - Type of refinement (concise, encouraging, polish)
     */
    async apply(refineType) {
        const ctx = this._resolveRefinementContext();
        if (!ctx) return;
        const { refineStudentId, refinePeriod, refineClassId, result, appreciationText, currentText } = ctx;

        const btn = document.querySelector(`#focusRefinementOptions [data-refine-type="${refineType}"]`);
        if (btn?.classList.contains('is-generating') && panel?._activeGenerations?.has(refineStudentId)) {
            const elapsed = Date.now() - (panel._activeGenerationStartTime || 0);
            if (elapsed >= 350) {
                panel._cancelGenerationForStudent(refineStudentId);
            }
            return;
        }

        FocusPanelHistory.push(currentText, 'edit', { studentId: refineStudentId, period: refinePeriod });

        document.querySelectorAll('#focusRefinementOptions [data-refine-type]').forEach(b => {
            b.classList.remove('is-generating');
            b.classList.toggle('disabled', b !== btn);
        });
        btn?.classList.add('is-generating');
        FocusPanelStatus.updateAppreciationStatus(null, { state: 'pending' });

        panel?._cancelGenerationForStudent?.(refineStudentId, { notify: false, restoreUI: false });

        if (panel) panel._activeGenerationStartTime = Date.now();
        this._setSecondaryControlsDisabled(true);
        const generateBtn = document.getElementById('focusGenerateBtn');
        if (generateBtn) UI?.showInlineSpinner?.(generateBtn);

        const abortController = new AbortController();
        panel?._activeGenerations?.set(refineStudentId, abortController);
        const signal = abortController.signal;

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
            const studentPrenom = result.studentData?.prenom || result.prenom || '';
            const studentNom = result.studentData?.nom || result.nom || '';

            const prompt = PromptService.getRefinementPrompt(refineType, currentText, {
                prenom: studentPrenom,
                nom: studentNom
            });
            const response = await AIService.callAIWithFallback(prompt, { context: 'refinement', signal });

            if (signal.aborted) return;

            if (response?.text) {
                const refined = PromptService.deanonymizeText(response.text.trim(), studentPrenom);
                const finalHtml = Utils.cleanMarkdown(refined);

                if (isStillOnSameContext() && appreciationText) {
                    const currentWordCount = Utils.countWords(appreciationText.textContent || '');
                    const targetWordCount = Utils.countWords(refined);

                    FocusPanelStatus.updateWordCount(true, currentWordCount, targetWordCount);

                    if (typeof UI?.animateHtmlReveal === 'function') {
                        await UI.animateHtmlReveal(appreciationText, finalHtml, { speed: 'fast', signal });
                    } else {
                        appreciationText.innerHTML = finalHtml;
                    }
                }

                if (signal.aborted) return;

                const priorSource = FocusPanelStatus._resolveSource(result);
                const isProtectedSource = priorSource === 'manual' || priorSource === 'imported';

                result.copied = false;
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
                    generationTimeMs: response.generationTimeMs || 0
                };
                result.timestamp = new Date().toISOString();

                if (!result.generationPeriod) {
                    result.generationPeriod = refinePeriod;
                }

                FocusPanelHistory.push(refined, refineType, { studentId: refineStudentId, period: refinePeriod });

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
                document.querySelectorAll('#focusRefinementOptions [data-refine-type]').forEach(b => {
                    b.classList.remove('disabled');
                });
                this._setSecondaryControlsDisabled(false);
                if (generateBtn) UI?.hideInlineSpinner?.(generateBtn);
                panel?._updateGenerateButton?.(result);
            }
        }
    }
};
