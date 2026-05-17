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

/** @type {import('./FocusPanelManager.js').FocusPanelManager|null} */
let panel = null;

/** @type {import('./UIManager.js').UI|null} */
let UI = null;

export const FocusPanelRefinement = {

    /**
     * Initialize with parent references
     * @param {Object} focusPanelManager - FocusPanelManager reference
     * @param {Object} uiManager - UI reference
     */
    init(focusPanelManager, uiManager) {
        panel = focusPanelManager;
        UI = uiManager;
    },

    /**
     * Affiche une prévisualisation du prompt de raffinement
     * @param {string} refineType - Type de raffinement
     */
    async showPreview(refineType) {
        const appreciationText = document.getElementById('focusAppreciationText');
        if (!appreciationText) return;

        const currentText = appreciationText.textContent?.trim();
        if (!currentText || currentText.includes('Aucune appréciation')) {
            UI.showNotification('Générez d\'abord une appréciation', 'info');
            return;
        }

        const promptText = PromptService.getRefinementPrompt(refineType, currentText);
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
                        <span class="modal-title-icon color-accent"><iconify-icon icon="solar:document-text-linear"></iconify-icon></span>
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
                    UI.showNotification('Prompt copié dans le presse-papier', 'success');
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
        const appreciationText = document.getElementById('focusAppreciationText');
        if (!appreciationText) return;

        const currentText = appreciationText.textContent?.trim();
        if (!currentText || currentText.includes('Aucune appréciation')) {
            UI.showNotification('Générez d\'abord une appréciation', 'info');
            return;
        }

        FocusPanelHistory.push(currentText);

        const btn = document.querySelector(`[data-refine-type="${refineType}"]`);
        if (!btn) return;

        btn.classList.add('is-generating');
        FocusPanelStatus.updateAppreciationStatus(null, { state: 'pending' });

        const refineStudentId = panel.currentStudentId;

        panel._cancelGenerationForStudent(refineStudentId);

        const abortController = new AbortController();
        panel._activeGenerations.set(refineStudentId, abortController);
        const signal = abortController.signal;

        try {
            const result = appState.generatedResults.find(r => r.id === panel.currentStudentId);
            if (!result) return;

            const response = await VariationsManager.applyRefinement(currentText, refineType, signal);

            if (signal.aborted) return;

            if (response?.text) {
                const refined = response.text;

                result.appreciation = refined;
                result.copied = false;
                result.wasGenerated = true;
                result.appreciationSource = 'ai';
                const currentPeriod = appState.currentPeriod;
                if (result.studentData.periods[currentPeriod]) {
                    result.studentData.periods[currentPeriod].appreciation = refined;
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
                    currentPeriod: currentPeriod
                });
                result.generationPeriod = currentPeriod;

                const currentWordCount = Utils.countWords(appreciationText.textContent || '');
                const targetWordCount = Utils.countWords(refined);

                FocusPanelStatus.updateWordCount(true, currentWordCount, targetWordCount);

                const finalHtml = Utils.decodeHtmlEntities(Utils.cleanMarkdown(refined));
                await UI.animateHtmlReveal(appreciationText, finalHtml, { speed: 'fast' });

                // CRITICAL FIX: Delete the active generation ONLY after animation finishes,
                // so that _saveContext() triggered during animation does not save the span tags.
                panel._activeGenerations.delete(refineStudentId);

                FocusPanelHistory.push(refined, refineType);

                FocusPanelStatus.updateAppreciationStatus(result, { state: 'generated' });
                FocusPanelStatus.updateSourceIndicator(result);

                UI.updateStats();
            }
        } catch (error) {
            const isAborted = error.name === 'AbortError'
                || signal.aborted
                || error.message?.includes('annulé');

            if (isAborted) {
                UI.showNotification('Amélioration annulée', 'info');
                FocusPanelStatus.refreshAppreciationStatus();
                // We must delete the active generation since we return early
                panel._activeGenerations.delete(refineStudentId);
                btn.classList.remove('is-generating');
                return;
            }

            UI.showNotification(error.message || 'Erreur lors du raffinement', 'error');
            const result = appState.generatedResults.find(r => r.id === refineStudentId);
            FocusPanelStatus.updateAppreciationStatus(result, { state: 'error' });
            panel._activeGenerations.delete(refineStudentId);
            btn.classList.remove('is-generating');
        } finally {
            // Delete is now handled in success path (after animation) and error paths
            btn.classList.remove('is-generating');
        }
    }
};
