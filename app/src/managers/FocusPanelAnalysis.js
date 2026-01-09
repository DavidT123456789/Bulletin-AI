/**
 * @fileoverview Focus Panel Analysis Manager
 * Handles AI Analysis page (strengths/weaknesses/next steps)
 * Extracted from FocusPanelManager for better maintainability
 * @module managers/FocusPanelAnalysis
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';

/** @type {import('./AppreciationsManager.js').AppreciationsManager|null} */
let AppreciationsManager = null;

/**
 * Analysis system for AI-powered student insights
 * @namespace FocusPanelAnalysis
 */
export const FocusPanelAnalysis = {
    /**
     * Callback functions set by parent manager
     * @private
     */
    _callbacks: {
        getCurrentStudentId: null
    },

    /**
     * Initialize with callbacks and references from parent manager
     * @param {Object} callbacks - Callback functions
     * @param {Function} callbacks.getCurrentStudentId - () => string|null
     * @param {Object} appreciationsManager - Reference to AppreciationsManager
     */
    init(callbacks = {}, appreciationsManager = null) {
        this._callbacks = { ...this._callbacks, ...callbacks };
        AppreciationsManager = appreciationsManager;
    },

    /**
     * Get current student ID via callback
     * @returns {string|null}
     * @private
     */
    _getCurrentStudentId() {
        return this._callbacks.getCurrentStudentId ? this._callbacks.getCurrentStudentId() : null;
    },

    /**
     * Show the analysis page (slide from right)
     */
    show() {
        const container = document.getElementById('focusPagesContainer');

        if (!container) return;

        // ALWAYS reset analysis first to clear previous student's data
        this._resetSection();

        // Slide to analysis page
        container.classList.add('show-analysis');

        // If analysis data already exists for CURRENT student, populate it
        const studentId = this._getCurrentStudentId();
        const result = appState.generatedResults.find(r => r.id === studentId);
        if (result && (result.strengthsWeaknesses || result.nextSteps)) {
            this._populateExisting(result);
        } else if (result) {
            // Auto-trigger generation if appreciation exists and analysis not yet generated
            const currentPeriod = appState.currentPeriod;
            const periodAppreciation = result.studentData.periods?.[currentPeriod]?.appreciation;
            const hasApiKey = UI.checkAPIKeyPresence();

            if (periodAppreciation && periodAppreciation.trim() && hasApiKey) {
                // Small delay to let the page slide animation start first
                setTimeout(() => this.generate(), 150);
            }
        }
    },

    /**
     * Hide the analysis page (slide back to main)
     */
    hide() {
        const container = document.getElementById('focusPagesContainer');
        if (container) {
            container.classList.remove('show-analysis');
        }
    },

    /**
     * Check if analysis page is visible
     * @returns {boolean}
     */
    isVisible() {
        const container = document.getElementById('focusPagesContainer');
        return container?.classList.contains('show-analysis') ?? false;
    },

    /**
     * Reset analysis section content to placeholder state
     * @private
     */
    _resetSection() {
        const forcesContent = document.getElementById('analysisForcesContent');
        const weaknessesContent = document.getElementById('analysisWeaknessesContent');
        const suggestionsContent = document.getElementById('analysisSuggestionsContent');

        const placeholderForces = `<div class="analysis-placeholder">
            <i class="fas fa-lightbulb"></i>
            <span>Cliquez sur "Générer l'analyse" pour découvrir les points forts</span>
        </div>`;
        const placeholderWeaknesses = `<div class="analysis-placeholder">
            <i class="fas fa-lightbulb"></i>
            <span>Cliquez sur "Générer l'analyse" pour identifier les faiblesses</span>
        </div>`;
        const placeholderSuggestions = `<div class="analysis-placeholder">
            <i class="fas fa-lightbulb"></i>
            <span>Cliquez sur "Générer l'analyse" pour des conseils personnalisés</span>
        </div>`;

        if (forcesContent) forcesContent.innerHTML = placeholderForces;
        if (weaknessesContent) weaknessesContent.innerHTML = placeholderWeaknesses;
        if (suggestionsContent) suggestionsContent.innerHTML = placeholderSuggestions;

        // Remove has-content class and badges
        document.querySelectorAll('.analysis-card').forEach(card => {
            card.classList.remove('has-content', 'has-error');
            // Remove existing badges
            const existingBadge = card.querySelector('.analysis-status-badge');
            if (existingBadge) existingBadge.remove();
        });
    },

    /**
     * Show skeleton loading state in analysis cards
     * @private
     */
    _showSkeleton() {
        const skeleton = `<div class="analysis-skeleton">
            <div class="analysis-skeleton-line"></div>
            <div class="analysis-skeleton-line"></div>
            <div class="analysis-skeleton-line"></div>
        </div>`;

        const forcesContent = document.getElementById('analysisForcesContent');
        const weaknessesContent = document.getElementById('analysisWeaknessesContent');
        const suggestionsContent = document.getElementById('analysisSuggestionsContent');

        if (forcesContent) forcesContent.innerHTML = skeleton;
        if (weaknessesContent) weaknessesContent.innerHTML = skeleton;
        if (suggestionsContent) suggestionsContent.innerHTML = skeleton;

        // Add loading badges to all cards
        document.querySelectorAll('.analysis-card').forEach(card => {
            this._setCardBadge(card, 'loading');
        });
    },

    /**
     * Set badge state on an analysis card
     * @param {HTMLElement} card - The analysis card element
     * @param {'loading'|'done'|'error'} state - Badge state
     * @private
     */
    _setCardBadge(card, state) {
        if (!card) return;

        const header = card.querySelector('.analysis-card-header');
        if (!header) return;

        // Remove existing badge
        let badge = header.querySelector('.analysis-status-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'analysis-status-badge';
            header.appendChild(badge);
        }

        // Update badge content and class
        badge.className = 'analysis-status-badge';
        switch (state) {
            case 'loading':
                badge.classList.add('loading');
                badge.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                break;
            case 'done':
                badge.classList.add('done');
                badge.innerHTML = '<i class="fas fa-check"></i>';
                break;
            case 'error':
                badge.classList.add('error');
                badge.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                break;
        }
    },

    /**
     * Generate AI analysis for current student
     */
    async generate() {
        const studentId = this._getCurrentStudentId();
        if (!studentId) return;

        const result = appState.generatedResults.find(r => r.id === studentId);
        if (!result) return;

        // Check API key
        if (!UI.checkAPIKeyPresence()) {
            UI.showNotification('Clé API requise pour l\'analyse IA', 'warning');
            return;
        }

        // Check that an appreciation exists for the current period
        const currentPeriod = appState.currentPeriod;
        const periodAppreciation = result.studentData.periods?.[currentPeriod]?.appreciation;
        if (!periodAppreciation || !periodAppreciation.trim()) {
            UI.showNotification(`Veuillez d'abord générer une appréciation pour ${Utils.getPeriodLabel(currentPeriod, false)}`, 'warning');
            return;
        }

        // Show skeleton loading state
        this._showSkeleton();

        // Update generate button to loading
        const generateBtn = document.getElementById('focusGenerateAnalysisBtn');
        if (generateBtn) {
            UI.showInlineSpinner(generateBtn);
        }

        try {
            // Force regeneration: reset existing data
            result.strengthsWeaknesses = null;
            result.nextSteps = null;

            // Fetch analyses using existing AppreciationsManager methods
            await this._fetchAnalyses(result);

            // Save to persist new analysis data
            StorageManager.saveAppState();

            UI.showNotification('Analyse générée !', 'success');
        } catch (error) {
            console.error('Erreur analyse:', error);
            UI.showNotification(`Erreur : ${error.message}`, 'error');

            // Show error state
            this._showError(error.message);
        } finally {
            if (generateBtn) {
                UI.hideInlineSpinner(generateBtn);
            }
        }
    },

    /**
     * Fetch and display analyses for the student
     * @param {Object} result - Student result object
     * @private
     */
    async _fetchAnalyses(result) {
        const id = result.id;
        // IMPORTANT: Always use the source object from generatedResults, not the filtered copy
        const sourceResult = appState.generatedResults.find(r => r.id === id) || result;

        const forcesContent = document.getElementById('analysisForcesContent');
        const weaknessesContent = document.getElementById('analysisWeaknessesContent');
        const suggestionsContent = document.getElementById('analysisSuggestionsContent');

        const forcesCard = forcesContent?.closest('.analysis-card');
        const weaknessesCard = weaknessesContent?.closest('.analysis-card');
        const suggestionsCard = suggestionsContent?.closest('.analysis-card');

        // Generate strengths/weaknesses (used for both Forces and Faiblesses cards)
        const generateStrengthsWeaknesses = async () => {
            if (sourceResult.strengthsWeaknesses === null || sourceResult.strengthsWeaknesses === undefined) {
                try {
                    await AppreciationsManager.generateStrengthsWeaknesses(id, true);
                    const updated = appState.generatedResults.find(r => r.id === id);

                    if (updated?.strengthsWeaknesses) {
                        // Parse and display Forces
                        if (forcesContent) {
                            UI.animateHtmlReveal(forcesContent, this._parseStrengthsWeaknesses(updated.strengthsWeaknesses, 'forces'));
                            forcesCard?.classList.add('has-content');
                            this._setCardBadge(forcesCard, 'done');
                        }
                        // Parse and display Faiblesses
                        if (weaknessesContent) {
                            UI.animateHtmlReveal(weaknessesContent, this._parseStrengthsWeaknesses(updated.strengthsWeaknesses, 'weaknesses'));
                            weaknessesCard?.classList.add('has-content');
                            this._setCardBadge(weaknessesCard, 'done');
                        }
                    } else {
                        if (forcesContent) {
                            forcesContent.innerHTML = '<em>Aucune donnée générée.</em>';
                            this._setCardBadge(forcesCard, 'done');
                        }
                        if (weaknessesContent) {
                            weaknessesContent.innerHTML = '<em>Aucune donnée générée.</em>';
                            this._setCardBadge(weaknessesCard, 'done');
                        }
                    }
                } catch (e) {
                    console.error('Échec de l\'analyse strengthsWeaknesses:', e);
                    const errorHtml = `<span style="color:var(--error-color);">Erreur : ${e.message.substring(0, 80)}...</span>`;
                    if (forcesContent) {
                        forcesContent.innerHTML = errorHtml;
                        forcesCard?.classList.add('has-error');
                        this._setCardBadge(forcesCard, 'error');
                    }
                    if (weaknessesContent) {
                        weaknessesContent.innerHTML = errorHtml;
                        weaknessesCard?.classList.add('has-error');
                        this._setCardBadge(weaknessesCard, 'error');
                    }
                }
            } else {
                // Data already exists
                if (forcesContent) {
                    forcesContent.innerHTML = this._parseStrengthsWeaknesses(sourceResult.strengthsWeaknesses, 'forces');
                    forcesCard?.classList.add('has-content');
                    this._setCardBadge(forcesCard, 'done');
                }
                if (weaknessesContent) {
                    weaknessesContent.innerHTML = this._parseStrengthsWeaknesses(sourceResult.strengthsWeaknesses, 'weaknesses');
                    weaknessesCard?.classList.add('has-content');
                    this._setCardBadge(weaknessesCard, 'done');
                }
            }
        };

        // Generate next steps (Pistes d'amélioration)
        const generateNextSteps = async () => {
            if (sourceResult.nextSteps === null || sourceResult.nextSteps === undefined) {
                try {
                    await AppreciationsManager.generateNextSteps(id, true);
                    const updated = appState.generatedResults.find(r => r.id === id);

                    if (updated?.nextSteps?.length) {
                        UI.animateHtmlReveal(suggestionsContent, `<ul>${updated.nextSteps.map(s => `<li>${Utils.cleanMarkdown(Utils.decodeHtmlEntities(s))}</li>`).join('')}</ul>`);
                        suggestionsCard?.classList.add('has-content');
                        this._setCardBadge(suggestionsCard, 'done');
                    } else {
                        suggestionsContent.innerHTML = '<em>Aucune piste générée.</em>';
                        this._setCardBadge(suggestionsCard, 'done');
                    }
                } catch (e) {
                    console.error('Échec de l\'analyse nextSteps:', e);
                    suggestionsContent.innerHTML = `<span style="color:var(--error-color);">Erreur : ${e.message.substring(0, 80)}...</span>`;
                    suggestionsCard?.classList.add('has-error');
                    this._setCardBadge(suggestionsCard, 'error');
                }
            } else {
                // Data already exists
                suggestionsContent.innerHTML = `<ul>${sourceResult.nextSteps.map(s => `<li>${Utils.cleanMarkdown(Utils.decodeHtmlEntities(s))}</li>`).join('')}</ul>`;
                suggestionsCard?.classList.add('has-content');
                this._setCardBadge(suggestionsCard, 'done');
            }
        };

        // Run both analyses in parallel (Forces+Faiblesses together, Pistes separately)
        await Promise.all([
            generateStrengthsWeaknesses(),
            generateNextSteps()
        ]);
    },

    /**
     * Parse strengths/weaknesses data for display in cards
     * @param {Object|string} data - Parsed strengths/weaknesses object or raw string
     * @param {string} type - 'forces' or 'weaknesses'
     * @returns {string} HTML content
     * @private
     */
    _parseStrengthsWeaknesses(data, type) {
        if (!data) return '<em>Aucune donnée.</em>';

        let items = [];

        if (typeof data === 'string') {
            // Raw string handling with section separation
            const raw = data;

            // Try to split into two sections using common headers from prompts, handling Markdown
            const splitRegex = /(?:^|\n)(?:[-*•]\s*)?(?:#+\s*)?(?:\*\*)?(?:Faiblesses|Axes d'amélioration|Points à améliorer|Fragilités|Axes de progrès|Points faibles|Axes d'effort)(?:\*\*)?[:\s]*(?:\n|$)/i;
            const parts = raw.split(splitRegex);

            let relevantText = '';

            if (parts.length > 1) {
                // Found a split between strengths (part 0) and weaknesses (part 1)
                if (type === 'forces') {
                    relevantText = parts[0];
                } else {
                    relevantText = parts.slice(1).join('\n');
                }
            } else {
                // No clear split found
                if (type === 'forces') {
                    relevantText = raw; // Default to strengths
                } else {
                    relevantText = ''; // No explicit weaknesses found
                }
            }

            // Cleanup headers from the relevant chunk specific to the type
            const headersToRemove = type === 'forces'
                ? ['Points Forts', 'Forces', 'Points forts', 'Atouts', 'Ce qui va bien']
                : ['Faiblesses', 'Axes d\'amélioration', 'Points à améliorer', 'Fragilités'];

            let cleanText = relevantText || '';
            headersToRemove.forEach(header => {
                // Remove header and potential markdown wrappers
                const regex = new RegExp(`(?:^|\\n)(?:[-*•]\\s*)?(?:#+\\s*)?(?:\\*\\*)?${header}(?:\\*\\*)?[:\\s]*`, 'gim');
                cleanText = cleanText.replace(regex, '');
            });

            // Parse bullets
            const lines = cleanText.split(/\n/);
            items = lines
                .map(line => line.trim())
                .filter(line => {
                    return line.length > 5 && (line.match(/^[-*•]/) || line.match(/^\d+\./) || line.length > 20);
                })
                .map(line => {
                    return line.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '');
                });

            // If just a block of text, keep it as one item
            if (items.length === 0 && cleanText.trim().length > 10) {
                items = [cleanText.trim()];
            }

        } else if (typeof data === 'object') {
            items = type === 'forces' ? (data.strengths || data.forces || []) : (data.weaknesses || data.faiblesses || []);
        }

        if (!items || items.length === 0) {
            return `<em>Aucun${type === 'forces' ? 'e force identifiée' : ' axe identifié'}.</em>`;
        }

        return `<ul>${items.map(item => `<li>${Utils.cleanMarkdown(Utils.decodeHtmlEntities(item))}</li>`).join('')}</ul>`;
    },

    /**
     * Show error state in analysis cards
     * @param {string} message - Error message
     * @private
     */
    _showError(message) {
        const errorHtml = `<span style="color:var(--error-color); font-size: 12px;">
            <i class="fas fa-exclamation-circle"></i> ${message.substring(0, 60)}...
        </span>`;

        const forcesContent = document.getElementById('analysisForcesContent');
        const weaknessesContent = document.getElementById('analysisWeaknessesContent');
        const suggestionsContent = document.getElementById('analysisSuggestionsContent');

        if (forcesContent) forcesContent.innerHTML = errorHtml;
        if (weaknessesContent) weaknessesContent.innerHTML = errorHtml;
        if (suggestionsContent) suggestionsContent.innerHTML = errorHtml;

        document.querySelectorAll('.analysis-card').forEach(card => {
            card.classList.add('has-error');
        });
    },

    /**
     * Pre-populate analysis section with existing data
     * @param {Object} result - Student result object
     * @private
     */
    _populateExisting(result) {
        const forcesContent = document.getElementById('analysisForcesContent');
        const weaknessesContent = document.getElementById('analysisWeaknessesContent');
        const suggestionsContent = document.getElementById('analysisSuggestionsContent');

        const forcesCard = forcesContent?.closest('.analysis-card');
        const weaknessesCard = weaknessesContent?.closest('.analysis-card');
        const suggestionsCard = suggestionsContent?.closest('.analysis-card');

        // Populate strengths/weaknesses if available
        if (result.strengthsWeaknesses) {
            if (forcesContent) {
                forcesContent.innerHTML = this._parseStrengthsWeaknesses(result.strengthsWeaknesses, 'forces');
                forcesCard?.classList.add('has-content');
                this._setCardBadge(forcesCard, 'done');
            }
            if (weaknessesContent) {
                weaknessesContent.innerHTML = this._parseStrengthsWeaknesses(result.strengthsWeaknesses, 'weaknesses');
                weaknessesCard?.classList.add('has-content');
                this._setCardBadge(weaknessesCard, 'done');
            }
        }

        // Populate next steps if available
        if (result.nextSteps && result.nextSteps.length > 0) {
            if (suggestionsContent) {
                suggestionsContent.innerHTML = `<ul>${result.nextSteps.map(s => `<li>${Utils.cleanMarkdown(Utils.decodeHtmlEntities(s))}</li>`).join('')}</ul>`;
                suggestionsCard?.classList.add('has-content');
                this._setCardBadge(suggestionsCard, 'done');
            }
        }
    }
};
