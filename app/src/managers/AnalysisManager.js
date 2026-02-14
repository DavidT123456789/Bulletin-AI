/**
 * @fileoverview Gestionnaire des analyses d'élèves.
 * 
 * Ce module gère les fonctionnalités d'analyse approfondie des élèves :
 * - Génération des forces et faiblesses
 * - Génération des pistes de progression
 * - Parsing du texte d'analyse
 * 
 * @module managers/AnalysisManager
 */

import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { AIService } from '../services/AIService.js';
import { StorageManager } from './StorageManager.js';

/** @type {import('./AppManager.js').App|null} */
let App = null;

/** @type {import('./AppreciationsManager.js').AppreciationsManager|null} */
let AppreciationsManager = null;

/**
 * Module de gestion des analyses d'élèves.
 * @namespace AnalysisManager
 */
export const AnalysisManager = {
    /**
     * Initialise le module avec une référence à l'application principale.
     * @param {Object} appInstance - Instance de l'application principale
     * @param {Object} appreciationsManager - Référence à AppreciationsManager pour getAllPrompts
     */
    init(appInstance, appreciationsManager = null) {
        App = appInstance;
        AppreciationsManager = appreciationsManager;
    },

    /**
     * Parse le texte de forces/faiblesses et retourne du HTML formaté.
     * @param {string} text - Texte brut à parser
     * @returns {string} HTML formaté
     */
    parseStrengthsWeaknesses(text) {
        if (!text) return '';
        const analysis = { strength: { title: null, items: [] }, weakness: { title: null, items: [] } };
        let currentSectionKey = null;
        const lines = text.split('\n').filter(line => line.trim() !== '');

        lines.forEach(line => {
            const trimmedLine = line.trim();
            const isStrengthTitle = /^(?:###\s*|\*\*)?\s*(points (forts|positifs)|atouts|réussites|force)/i.test(trimmedLine);
            const isWeaknessTitle = /^(?:###\s*|\*\*)?\s*(points (faibles|négatifs)|axes d'amélioration|vigilance|faiblesse)/i.test(trimmedLine);

            if (isStrengthTitle) {
                currentSectionKey = 'strength';
                analysis.strength.title = trimmedLine.replace(/###\s*/, '').replace(/\*\*/g, '');
            } else if (isWeaknessTitle) {
                currentSectionKey = 'weakness';
                analysis.weakness.title = trimmedLine.replace(/###\s*/, '').replace(/\*\*/g, '');
            } else if (currentSectionKey && /^(\* |- |\d+\.)/.test(trimmedLine)) {
                analysis[currentSectionKey].items.push(trimmedLine.replace(/^(\* |- |\d+\.\s*)/, '').trim());
            } else if (currentSectionKey && analysis[currentSectionKey].items.length > 0) {
                const lastItemIndex = analysis[currentSectionKey].items.length - 1;
                analysis[currentSectionKey].items[lastItemIndex] += ' ' + trimmedLine;
            }
        });

        let html = '';
        const sections = [
            { key: 'strength', class: 'strengths-title', icon: '<iconify-icon icon="solar:like-bold-duotone"></iconify-icon>' },
            { key: 'weakness', class: 'weaknesses-title', icon: '<iconify-icon icon="solar:dislike-bold-duotone"></iconify-icon>' }
        ];

        sections.forEach(sectionInfo => {
            const sectionData = analysis[sectionInfo.key];
            if (sectionData.title || sectionData.items.length > 0) {
                html += `<h4 class="${sectionInfo.class}">${sectionInfo.icon} ${Utils.cleanMarkdown(sectionData.title || (sectionInfo.key === 'strength' ? 'Points Forts' : 'Points Faibles'))}</h4>`;
                const listClass = sectionInfo.key === 'strength' ? 'strengths-list' : 'weaknesses-list';
                if (sectionData.items.length > 0) {
                    html += `<ul class="${listClass}">${sectionData.items.map(item => `<li>${Utils.cleanMarkdown(item)}</li>`).join('')}</ul>`;
                } else {
                    const fallbackText = sectionInfo.key === 'weakness' ? "Aucun point faible notable." : "Aucun point fort notable.";
                    html += `<ul class="${listClass}"><li>${fallbackText}</li></ul>`;
                }
            }
        });
        return html || `<p>${Utils.cleanMarkdown(text.replace(/\n/g, '<br>'))}</p>`;
    },

    /**
     * Génère l'analyse des forces et faiblesses pour un élève.
     * @param {string} id - Identifiant de l'élève
     * @param {boolean} [silent=false] - Si true, pas de notification
     * @throws {Error} Si conditions non remplies
     */
    async generateStrengthsWeaknesses(id, silent = false) {
        const result = appState.generatedResults.find(r => r.id === id);
        if (!result || !UI.checkAPIKeyPresence(silent)) {
            throw new Error("Conditions non remplies.");
        }

        try {
            const prompts = AppreciationsManager.getAllPrompts({ ...result.studentData, id: result.id });
            result.studentData.prompts.sw = prompts.sw;
            const resp = await AIService.callAIWithFallback(prompts.sw);
            result.strengthsWeaknesses = resp.text;
            result.tokenUsage.sw = resp.usage;
            StorageManager.saveAppState();
            if (!silent) UI.showNotification('Analyse générée.', 'success');
        } catch (e) {
            console.error("Erreur F/F:", e);
            if (!silent) UI.showNotification(`Erreur : ${Utils.translateErrorMessage(e.message)}`, 'error');
            throw e;
        }
    },

    /**
     * Génère les pistes de progression pour un élève.
     * @param {string} id - Identifiant de l'élève
     * @param {boolean} [silent=false] - Si true, pas de notification
     * @throws {Error} Si conditions non remplies
     */
    async generateNextSteps(id, silent = false) {
        const result = appState.generatedResults.find(r => r.id === id);
        if (!result || !UI.checkAPIKeyPresence(silent)) {
            throw new Error("Conditions non remplies.");
        }

        try {
            const prompts = AppreciationsManager.getAllPrompts({ ...result.studentData, id: result.id });
            result.studentData.prompts.ns = prompts.ns;
            const resp = await AIService.callAIWithFallback(prompts.ns);

            const steps = [];
            const lines = resp.text.split('\n').filter(l => l.trim() !== '');
            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (/^\d+\.?\s*-?/.test(trimmedLine)) {
                    steps.push(trimmedLine.replace(/^\d+\.?\s*-?/, '').trim());
                } else if (steps.length > 0 && !/^(J'espère|N'hésitez|En conclusion)/i.test(trimmedLine)) {
                    steps[steps.length - 1] += ' ' + trimmedLine;
                }
            });

            result.nextSteps = steps.slice(0, 3).filter(Boolean);
            result.tokenUsage.ns = resp.usage;
            StorageManager.saveAppState();
            if (!silent) UI.showNotification('Pistes générées.', 'success');
        } catch (e) {
            console.error("Erreur pistes:", e);
            if (!silent) UI.showNotification(`Erreur : ${Utils.translateErrorMessage(e.message)}`, 'error');
            throw e;
        }
    },

    /**
     * Récupère les analyses pour un élève (forces/faiblesses et pistes).
     * @param {string} id - Identifiant de l'élève
     */
    async fetchAnalysesForStudent(id) {
        const result = appState.generatedResults.find(r => r.id === id);
        if (!result) return;

        const analyze = async (type, contentEl, listEl, generator, parser) => {
            if (result[type] === null) {
                try {
                    await generator(id, true);
                    const updated = appState.generatedResults.find(r => r.id === id);
                    const html = parser(updated[type]);
                    const target = listEl || contentEl;

                    if (target) {
                        await UI.animateHtmlReveal(target, html);
                    }
                } catch (e) {
                    (listEl || contentEl).innerHTML = `<p style="color:var(--error-color);">Échec.</p><button class="btn btn-warning btn-small" data-action="retry-analysis" data-id="${id}" data-type="${type.slice(0, 2)}">Réessayer</button>`;
                }
            } else {
                if (listEl) listEl.innerHTML = parser(result[type]);
                else contentEl.innerHTML = parser(result[type]);
            }
        };

        await Promise.all([
            analyze('strengthsWeaknesses', DOM.studentDetailsModal.querySelector('#strengthsWeaknessesContent'), null, this.generateStrengthsWeaknesses.bind(this), this.parseStrengthsWeaknesses),
            analyze('nextSteps', null, DOM.studentDetailsModal.querySelector('#nextStepsList'), this.generateNextSteps.bind(this), (steps) => steps?.length ? steps.map(s => `<li>${Utils.cleanMarkdown(Utils.decodeHtmlEntities(s))}</li>`).join('') : '<li>Aucune piste.</li>')
        ]);
    },

    /**
     * Réexécute une analyse spécifique (forces/faiblesses ou pistes).
     * @param {string} id - Identifiant de l'élève
     * @param {'sw'|'ns'} type - Type d'analyse à réexécuter
     */
    refetchAnalyses(id, type) {
        const result = appState.generatedResults.find(r => r.id === id);
        if (result) {
            if (type === 'sw') {
                result.strengthsWeaknesses = null;
                DOM.studentDetailsModal.querySelector('#strengthsWeaknessesContent').innerHTML = `<div class="analysis-loading-state"><div class="loading-spinner"></div><span>Génération...</span></div>`;
            }
            if (type === 'ns') {
                result.nextSteps = null;
                DOM.studentDetailsModal.querySelector('#nextStepsList').innerHTML = `<li><div class="analysis-loading-state"><div class="loading-spinner"></div><span>Génération...</span></div></li>`;
            }
            this.fetchAnalysesForStudent(id);
        }
    }
};
