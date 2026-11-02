/**
 * @fileoverview Manager for appreciation variations functionality
 * @module managers/VariationsManager
 */

import { AIService } from '../services/AIService.js';
import { PromptService } from '../services/PromptService.js';

export const VariationsManager = {
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
