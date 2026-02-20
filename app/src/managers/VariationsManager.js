/**
 * @fileoverview Manager for appreciation variations functionality
 * @module managers/VariationsManager
 */

import { appState } from '../state/State.js';
import { UI } from './UIManager.js';
import { AIService } from '../services/AIService.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { Utils } from '../utils/Utils.js';
import { PromptService } from '../services/PromptService.js';

export const VariationsManager = {
    /**
     * Generates a new variation of an appreciation for a student
     * Saves the current appreciation to history before generating new one
     * @param {string} id - The student result ID
     * @param {HTMLButtonElement} btn - The button element for spinner display
     */
    async generateVariation(id, btn) {
        UI.showInlineSpinner(btn);

        const result = appState.generatedResults.find(r => r.id === id);
        if (!result) {
            UI.showNotification("Élève introuvable.", "error");
            UI.hideInlineSpinner(btn);
            return;
        }

        const card = document.querySelector(`.appreciation-result[data-id="${id}"]`);
        const appreciationEl = card?.querySelector('[data-template="appreciation"]');

        // Afficher le skeleton avec badge "Variation..."
        if (card) {
            card.classList.add('is-regenerating');
            UI.showSkeletonInCard(card, 'Variation...', false);
        }

        try {
            // Sauvegarder la version actuelle dans l'historique UNIFIÉ (comme regenerate)
            AppreciationsManager.pushToHistory(result, 'variation');

            // Use unified PromptService for consistent prompt formatting
            const currentAppreciation = result.appreciation || '';
            const variationPrompt = PromptService.getRefinementPrompt('variations', currentAppreciation);

            const aiResp = await AIService.callAIWithFallback(variationPrompt);

            // Désanonymisation : remplacer [PRÉNOM] par le vrai prénom
            const newAppreciation = AppreciationsManager._deanonymizeText(aiResp.text, result.studentData.prenom);
            result.appreciation = newAppreciation;

            // Stocker le modèle utilisé pour cette nouvelle version
            if (aiResp.modelUsed) {
                result.studentData.currentAIModel = aiResp.modelUsed;
            }

            if (aiResp.usage) {
                result.tokenUsage = result.tokenUsage || {};
                result.tokenUsage.appreciation = (result.tokenUsage.appreciation || 0) + aiResp.usage.total_tokens;
            }

            // Effet typewriter pour afficher le nouveau texte
            if (appreciationEl) {
                const finalHtml = Utils.decodeHtmlEntities(Utils.cleanMarkdown(newAppreciation));
                await UI.animateHtmlReveal(appreciationEl, finalHtml, { speed: 'fast' });
                card?.classList.add('just-generated');
                setTimeout(() => card?.classList.remove('just-generated'), 1000);
            }

            UI.showNotification("Nouvelle variation générée.", "success");
        } catch (e) {
            console.error(e);

            // En cas d'erreur, restaurer le texte précédent
            if (appreciationEl) {
                await UI.fadeOutSkeleton(appreciationEl);
                appreciationEl.textContent = result.appreciation || '';
            }

            UI.showNotification("Erreur lors de la variation.", "error");
        } finally {
            UI.hideInlineSpinner(btn);
            card?.classList.remove('is-regenerating');
        }
    },

    /**
     * Undoes the last variation, restoring the previous appreciation
     * Utilise le système d'historique unifié (toggleVersion)
     * @param {string} id - The student result ID
     * @param {HTMLButtonElement} btn - The button element (unused, kept for API consistency)
     */
    undoVariation(id, btn) {
        // Utiliser le système d'historique unifié
        const success = AppreciationsManager.toggleVersion(id);
        if (!success) {
            UI.showNotification("Aucune version précédente disponible.", "warning");
        }
    },

    /**
     * Applies a specific refinement to a text (concise, detailed, encouraging, etc.)
     * Uses unified prompts from PromptService for consistency
     * @param {string} text - The text to refine
     * @param {string} refineType - Type of refinement (concise, detailed, encouraging, variations, polish)
     * @param {AbortSignal} [signal] - Optional abort signal for cancellation
     * @returns {Promise<{text: string, modelUsed?: string, usage?: object, generationTimeMs?: number}|null>} 
     *          The refined text with AI metadata or null if error
     */
    async applyRefinement(text, refineType, signal = null) {
        if (!text) return null;

        // Use unified PromptService for prompt generation
        const prompt = PromptService.getRefinementPrompt(refineType, text);

        try {
            // CRITICAL FIX: Pass context and signal so that ai-generation-end properly hides the header progress
            const aiResp = await AIService.callAIWithFallback(prompt, { context: 'refinement', signal });
            // Return full response with text and metadata
            return {
                text: aiResp.text.trim(),
                modelUsed: aiResp.modelUsed,
                usage: aiResp.usage,
                generationTimeMs: aiResp.generationTimeMs
            };
        } catch (error) {
            console.error("VariationsManager.applyRefinement error:", error);
            throw error;
        }
    }
};
