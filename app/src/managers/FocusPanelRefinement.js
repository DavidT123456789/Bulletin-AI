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

        const message = `
            <div style="text-align: left;">
                <textarea readonly class="prompt-preview-textarea" style="
                    width: 100%; 
                    height: 400px; 
                    padding: 12px; 
                    border-radius: var(--radius-sm); 
                    border: 1px solid var(--border-color); 
                    background: var(--bg-secondary); 
                    color: var(--text-primary); 
                    font-family: 'SF Mono', Consolas, monospace; 
                    font-size: 0.85rem; 
                    line-height: 1.5;
                    white-space: pre-wrap;
                    resize: vertical;">${escapedText}</textarea>
            </div>
        `;

        const confirmed = await ModalUI.showCustomConfirm(message, null, null, {
            title: title,
            confirmText: 'Copier',
            cancelText: 'Fermer',
            isDanger: false,
            compact: false
        });

        if (confirmed) {
            try {
                await navigator.clipboard.writeText(promptText);
                UI.showNotification('Prompt copié dans le presse-papier', 'success');
            } catch (err) {
                UI.showNotification('Échec de la copie', 'error');
            }
        }
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

                FocusPanelHistory.push(refined, refineType);

                FocusPanelStatus.updateAppreciationStatus(result, { state: 'generated' });
                FocusPanelStatus.updateSourceIndicator(result);

                UI.showNotification('Appréciation raffinée !', 'success');
            }
        } catch (error) {
            const isAborted = error.name === 'AbortError'
                || signal.aborted
                || error.message?.includes('annulé');

            if (isAborted) {
                UI.showNotification('Amélioration annulée', 'info');
                FocusPanelStatus.refreshAppreciationStatus();
                return;
            }

            UI.showNotification(error.message || 'Erreur lors du raffinement', 'error');
            const result = appState.generatedResults.find(r => r.id === refineStudentId);
            FocusPanelStatus.updateAppreciationStatus(result, { state: 'error' });
        } finally {
            panel._activeGenerations.delete(refineStudentId);
            btn.classList.remove('is-generating');
        }
    }
};
