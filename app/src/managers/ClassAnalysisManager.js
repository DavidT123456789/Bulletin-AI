/**
 * @fileoverview Manager for class analysis functionality
 * @module managers/ClassAnalysisManager
 */

import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { AIService } from '../services/AIService.js';

export const ClassAnalysisManager = {
    /**
     * Analyzes all filtered students and generates a class synthesis
     * Opens the class analysis modal and calls AI for analysis
     */
    async analyzeClass() {
        if (!UI.checkAPIKeyPresence()) return;
        if (appState.filteredResults.length === 0) {
            UI.showNotification("Aucun élève à analyser.", "warning");
            return;
        }

        UI.openModal(DOM.classAnalysisModal);
        const contentDiv = document.getElementById('classAnalysisContent');
        contentDiv.innerHTML = `<div class="analysis-loading-state"><div class="loading-spinner"></div><span>Analyse de la classe en cours...</span></div>`;

        try {
            const analyses = appState.filteredResults
                .map(r => `Élève : ${r.prenom} ${r.nom}\nMoyenne : ${r.studentData.periods[appState.currentPeriod]?.grade || 'N/A'}\nAppréciation : ${r.appreciation}`)
                .join('\n\n');

            const prompt = `Analyse ces appréciations de classe pour la période ${appState.currentPeriod} :\n\n${analyses}\n\nFais une synthèse globale : niveau général, ambiance de travail, points forts collectifs, points faibles récurrents. Sois constructif et professionnel.`;

            const resp = await AIService.callAIWithFallback(prompt);
            await UI.animateHtmlReveal(contentDiv, Utils.cleanMarkdown(resp.text));
            DOM.classAnalysisModal.dataset.analysisContent = resp.text;
        } catch (e) {
            contentDiv.innerHTML = `<p class="error-message">Erreur d'analyse : ${e.message}</p>`;
        }
    },

    /**
     * Handles refinement actions on the class analysis (summarize, positive, actionable)
     * @param {HTMLButtonElement} button - The clicked button with data-refine-type
     */
    handleClassAnalysisActions(button) {
        const type = button.dataset.refineType;
        const contentDiv = document.getElementById('classAnalysisContent');
        const currentContent = DOM.classAnalysisModal.dataset.analysisContent;

        if (!currentContent) return;

        UI.showInlineSpinner(button);

        const prompts = {
            'summarize': "Résume cette analyse en 3 points clés très concis.",
            'positive': "Reformule cette analyse pour insister davantage sur les aspects positifs et encourageants.",
            'actionable': "Transforme cette analyse en un plan d'action concret pour le prochain trimestre (3-4 objectifs collectifs)."
        };

        AIService.callAIWithFallback(`${prompts[type]}\n\nAnalyse originale :\n${currentContent}`)
            .then(resp => {
                UI.animateHtmlReveal(contentDiv, Utils.cleanMarkdown(resp.text));
            })
            .catch(e => UI.showNotification("Erreur : " + e.message, 'error'))
            .finally(() => UI.hideInlineSpinner(button));
    },

    /**
     * Copies the current class analysis content to clipboard
     */
    copyClassAnalysis() {
        const content = document.getElementById('classAnalysisContent').innerText;
        navigator.clipboard.writeText(content)
            .then(() => UI.showNotification("Analyse copiée !", "success"));
    }
};
