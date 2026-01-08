/**
 * @fileoverview Manager for appreciation variations functionality
 * @module managers/VariationsManager
 */

import { appState } from '../state/State.js';
import { UI } from './UIManager.js';
import { AIService } from '../services/AIService.js';
import { AppreciationsManager } from './AppreciationsManager.js';

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

            // Construire un prompt de REFORMULATION (pas de génération from scratch)
            // On envoie l'appréciation actuelle et on demande une version différente
            const currentAppreciation = result.appreciation || '';
            const studentName = result.studentData?.prenom || '[PRÉNOM]';

            const variationPrompt = `Voici une appréciation scolaire pour l'élève ${studentName} :

"${currentAppreciation}"

Reformule cette appréciation de manière différente en gardant le même sens général et les mêmes informations clés, mais en variant :
- La structure des phrases (ordre, tournures)
- Le vocabulaire utilisé (synonymes, expressions alternatives)
- Le ton (légèrement plus encourageant ou plus factuel)

Produis UNIQUEMENT la nouvelle appréciation, sans introduction ni commentaire.`;

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
                await UI.typewriterReveal(appreciationEl, newAppreciation, { speed: 'fast' });
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
     * @param {string} text - The text to refine
     * @param {string} refineType - Type of refinement (concise, detailed, encouraging, variations, polish)
     * @returns {Promise<{text: string, modelUsed?: string, usage?: object, generationTimeMs?: number}|null>} 
     *          The refined text with AI metadata or null if error
     */
    async applyRefinement(text, refineType) {
        if (!text) return null;

        let instruction = "";
        switch (refineType) {
            case 'concise':
                instruction = "Reformule cette appréciation de manière plus concise, directe et synthétique, en gardant l'essentiel pour un bulletin scolaire. Réduis la longueur.";
                break;
            case 'detailed':
                instruction = "Développe cette appréciation en explicitant davantage les points abordés pour un bulletin scolaire. Sois plus précis et constructif, sans inventer de faits absents du texte original.";
                break;
            case 'encouraging':
                instruction = "Reformule cette appréciation sur un ton plus encourageant, bienveillant et positif. Mets en valeur les efforts et les marges de progression de l'élève.";
                break;
            case 'polish':
                instruction = "Améliore le style, la syntaxe et le vocabulaire de cette appréciation pour qu'elle soit parfaitement professionnelle et élégante. Corrige toute faute éventuelle.";
                break;
            case 'variations':
            default:
                instruction = "Reformule cette appréciation de manière différente (vocabulaire, structure) tout en gardant strictement le même sens et la même tonalité.";
                break;
        }

        const prompt = `Voici une appréciation scolaire :
"${text}"

Consigne : ${instruction}

Produis UNIQUEMENT le texte reformulé, sans guillemets, sans introduction ni commentaire.`;

        try {
            const aiResp = await AIService.callAIWithFallback(prompt);
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
