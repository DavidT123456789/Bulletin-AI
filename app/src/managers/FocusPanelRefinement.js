/**
 * @fileoverview Focus Panel Refinement — AI-powered appreciation refinement
 * Extracted from FocusPanelManager.js (Phase 2 — God Object Decomposition)
 * @module managers/FocusPanelRefinement
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { PromptService } from '../services/PromptService.js';
import { ModalUI } from './ModalUIManager.js';
import { FocusPanelHistory } from './FocusPanelHistory.js';
import { FocusPanelStatus } from './FocusPanelStatus.js';
import { VariationsManager } from './VariationsManager.js';
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
     * Remplace le placeholder [PRÉNOM] par le vrai prénom après raffinement IA.
     * @param {string} text
     * @param {string} prenom
     * @returns {string}
     * @private
     */
    _deanonymizeText(text, prenom) {
        return PromptService.deanonymizeText(text, prenom);
    },

    /**
     * Affiche une prévisualisation du prompt de raffinement
     * @param {string} refineType - Type de raffinement
     */
    async showPreview(refineType) {
        if (panel?._isAppreciationEdited && typeof panel?.saveCurrentContext === 'function') {
            panel.saveCurrentContext();
        }

        const refineStudentId = panel?.currentStudentId;
        const refinePeriod = appState.currentPeriod;
        const result = appState.generatedResults?.find(r => r.id === refineStudentId);
        const appreciationText = document.getElementById('focusAppreciationText');

        const stateText = (
            result?.studentData?.periods?.[refinePeriod]?.appreciation ??
            (result?.generationPeriod === refinePeriod ? result?.appreciation : '') ??
            ''
        ).trim();
        const currentText = stateText || appreciationText?.textContent?.trim() || '';

        if (!currentText || currentText.includes('Aucune appréciation')) {
            UI?.showNotification?.('Générez d\'abord une appréciation', 'info');
            return;
        }

        const promptText = PromptService.getRefinementPrompt(refineType, currentText, {
            prenom: result?.studentData?.prenom || result?.prenom || '',
            nom: result?.studentData?.nom || result?.nom || ''
        });
        await this.displayPromptModal(promptText, 'Prévisualisation du Prompt (Raffinement)');
    },

    /**
     * Helper partagé pour afficher une modale de prévisualisation de prompt
     * @param {string} promptText - Le texte du prompt à afficher
     * @param {string} title - Le titre de la modale
     */
    async displayPromptModal(promptText, title) {
        const escapedText = Utils.escapeHtml(promptText);

        const modalId = 'promptPreviewModal';
        let modal = document.getElementById(modalId);
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal modal-prompt-preview';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <span class="modal-title-icon"><iconify-icon icon="solar:document-text-linear"></iconify-icon></span>
                        <span class="modal-title-text">${title}</span>
                    </h2>
                    <button class="close-button" aria-label="Fermer">
                        <iconify-icon icon="ph:x"></iconify-icon>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="prompt-preview-container">
                        <div class="prompt-preview-content" tabindex="0">${escapedText}</div>
                    </div>
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
        ModalUI.openModal(modal);

        return new Promise((resolve) => {
            const copyBtn = document.getElementById('promptPreviewCopyBtn');
            const closeBtn = document.getElementById('promptPreviewCloseBtn');
            const xBtn = modal.querySelector('.close-button');
            let closed = false;

            const handleCopy = async () => {
                try {
                    await navigator.clipboard.writeText(promptText);
                    UI.showNotification('Prompt copié dans le presse-papier', 'prompt');
                    copyBtn.innerHTML = '<iconify-icon icon="solar:check-read-linear"></iconify-icon> Copié';
                    copyBtn.classList.replace('btn-primary', 'btn-success');
                    setTimeout(() => {
                        copyBtn.innerHTML = '<iconify-icon icon="solar:copy-linear"></iconify-icon> Copier';
                        copyBtn.classList.replace('btn-success', 'btn-primary');
                    }, 2000);
                } catch (err) {
                    UI.showNotification('Échec de la copie', 'error');
                }
            };

            const handleClose = () => {
                if (closed) return;
                closed = true;
                resolve();
                ModalUI.closeModal(modal);
            };

            copyBtn.addEventListener('click', handleCopy);
            closeBtn.addEventListener('click', handleClose, { once: true });
            xBtn?.addEventListener('click', handleClose, { once: true });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) handleClose();
            });
            modal.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') handleClose();
            });
        });
    },

    /**
     * Apply a refinement style to the appreciation
     * @param {string} refineType - Type of refinement (concise, detailed, encouraging, variations, polish)
     */
    async apply(refineType) {
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

        if (!currentText || currentText.includes('Aucune appréciation')) {
            UI?.showNotification?.('Générez d\'abord une appréciation', 'info');
            return;
        }

        FocusPanelHistory.push(currentText, 'edit', { studentId: refineStudentId, period: refinePeriod });

        const btn = document.querySelector(`[data-refine-type="${refineType}"]`);
        btn?.classList.add('is-generating');
        FocusPanelStatus.updateAppreciationStatus(null, { state: 'pending' });

        panel?._cancelGenerationForStudent?.(refineStudentId, { notify: false, restoreUI: false });

        const abortController = new AbortController();
        panel?._activeGenerations?.set(refineStudentId, abortController);
        const signal = abortController.signal;

        if (panel?.listViewManager?.setRowStatus) {
            panel.listViewManager.setRowStatus(refineStudentId, 'generating');
        } else if (ListViewManager?.setRowStatus) {
            ListViewManager.setRowStatus(refineStudentId, 'generating');
        }

        try {
            if (!result) return;

            const studentPrenom = result.studentData?.prenom || result.prenom || '';
            const studentNom = result.studentData?.nom || result.nom || '';
            const textForRefinement = PromptService.scrubStudentIdentity(currentText, {
                prenom: studentPrenom,
                nom: studentNom
            });

            const response = await VariationsManager.applyRefinement(textForRefinement, refineType, signal);

            if (signal.aborted) return;

            if (response?.text) {
                const refined = this._deanonymizeText(response.text, studentPrenom);

                result.copied = false;
                result.wasGenerated = true;
                result.appreciationSource = 'ai';
                if (!result.studentData) result.studentData = {};
                if (!result.studentData.periods) result.studentData.periods = {};
                if (!result.studentData.periods[refinePeriod]) {
                    result.studentData.periods[refinePeriod] = {};
                }
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

                result.promptHash = PromptService.getPromptHash({
                    ...result.studentData,
                    id: result.id,
                    currentPeriod: refinePeriod
                });
                result.generationPeriod = refinePeriod;

                FocusPanelHistory.push(refined, refineType, { studentId: refineStudentId, period: refinePeriod });

                const stillOnSameContext =
                    panel?.currentStudentId === refineStudentId &&
                    appState.currentPeriod === refinePeriod &&
                    appState.currentClassId === refineClassId;

                if (stillOnSameContext && appreciationText) {
                    const currentWordCount = Utils.countWords(appreciationText.textContent || '');
                    const targetWordCount = Utils.countWords(refined);

                    FocusPanelStatus.updateWordCount(true, currentWordCount, targetWordCount);

                    const finalHtml = Utils.cleanMarkdown(refined);
                    if (typeof UI?.animateHtmlReveal === 'function') {
                        await UI.animateHtmlReveal(appreciationText, finalHtml, { speed: 'fast' });
                    } else {
                        appreciationText.innerHTML = finalHtml;
                    }
                    if (panel) {
                        panel._initialAppreciationHtml = finalHtml;
                        panel._isAppreciationEdited = false;
                    }

                    FocusPanelStatus.updateAppreciationStatus(result, { state: 'generated' });
                    FocusPanelStatus.updateSourceIndicator(result);
                }

                // CRITICAL FIX: Delete the active generation ONLY after animation finishes,
                // so that _saveContext() triggered during animation does not save the span tags.
                panel?._activeGenerations?.delete(refineStudentId);

                // Update list row and persist
                panel?._updateListRow?.(result);
                StorageManager.saveAppState();
                UI?.updateStats?.();
            }
        } catch (error) {
            const isAborted = error.name === 'AbortError'
                || signal.aborted
                || error.message?.includes('annulé');

            const stillOnSameContext =
                panel?.currentStudentId === refineStudentId &&
                appState.currentPeriod === refinePeriod &&
                appState.currentClassId === refineClassId;

            if (isAborted) {
                if (stillOnSameContext) {
                    FocusPanelStatus.refreshAppreciationStatus();
                }
                panel?._activeGenerations?.delete(refineStudentId);
                btn?.classList.remove('is-generating');
                if (result) panel?._updateListRow?.(result);
                return;
            }

            UI?.showNotification?.(error.message || 'Erreur lors du raffinement', 'error');
            if (stillOnSameContext) {
                FocusPanelStatus.updateAppreciationStatus(result, { state: 'error', tooltip: error.message || 'Erreur lors du raffinement' });
            }
            panel?._activeGenerations?.delete(refineStudentId);
            btn?.classList.remove('is-generating');
            if (result) {
                panel?._updateListRow?.(result);
                StorageManager.saveAppState();
            }
        } finally {
            btn?.classList.remove('is-generating');
        }
    }
};
