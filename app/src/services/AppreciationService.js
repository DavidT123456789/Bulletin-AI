/**
 * AppreciationService - Logique métier pure pour les appréciations
 * 
 * Ce module contient la logique métier sans dépendances DOM/UI.
 * Facilite les tests unitaires et la réutilisation.
 */

import { appState } from '../state/State.js';
import { CONFIG, CONSTS, DEFAULT_IA_CONFIG, DEFAULT_PROMPT_TEMPLATES } from '../config/Config.js';
import { Utils } from '../utils/Utils.js';
import { AIService } from './AIService.js';
import { PromptService } from './PromptService.js';

export const AppreciationService = {
    /**
     * Crée un objet résultat standardisé pour un élève
     */
    createResultObject(nom, prenom, appreciation, evolutions, studentData, prompts, tokenUsage, errorMessage = null) {
        const newStudentData = JSON.parse(JSON.stringify(studentData));

        if (newStudentData.periods[newStudentData.currentPeriod]) {
            newStudentData.periods[newStudentData.currentPeriod].appreciation = appreciation;
        }

        return {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
            nom, prenom, appreciation, evolutions,
            // Associer à la classe courante pour le multi-classes
            classId: appState.currentClassId || null,
            studentData: {
                ...newStudentData,
                currentPeriod: appState.currentPeriod,
                subject: appState.useSubjectPersonalization ? appState.currentSubject : 'Générique',
                currentAIModel: appState.currentAIModel,
                prompts: prompts || { appreciation: null, sw: null, ns: null }
            },
            errorMessage,
            timestamp: new Date().toISOString(),
            strengthsWeaknesses: null,
            nextSteps: null,
            tokenUsage: tokenUsage || { appreciation: null, sw: null, ns: null },
            copied: false
        };
    },

    /**
     * Analyse l'évolution des notes entre les périodes
     */
    analyserEvolution(periodsData) {
        const evolutions = [], t = appState.evolutionThresholds;
        const getType = (diff) => {
            if (diff === null || isNaN(diff)) return 'stable';
            if (diff >= t.veryPositive) return 'very-positive'; if (diff >= t.positive) return 'positive';
            if (diff <= t.veryNegative) return 'very-negative'; if (diff <= t.negative) return 'negative';
            return 'stable';
        };
        const periods = Utils.getPeriods();
        for (let i = 1; i < periods.length; i++) {
            const v1 = periodsData[periods[i - 1]]?.grade, v2 = periodsData[periods[i]]?.grade;
            if (typeof v1 === 'number' && typeof v2 === 'number') {
                const diff = parseFloat((v2 - v1).toFixed(2));
                evolutions.push({ type: getType(diff), valeur: diff, periode: `${periods[i - 1]}-${periods[i]}` });
            }
        }
        return evolutions;
    },

    /**
     * Récupère l'évolution pertinente pour la période actuelle
     */
    getRelevantEvolution(evolutions, currentPeriod) {
        if (!evolutions || !Array.isArray(evolutions)) return null;
        return evolutions.find(e => e.periode.endsWith(`-${currentPeriod}`));
    },

    /**
     * Génère tous les prompts IA pour un élève
     * @deprecated Délègue maintenant à PromptService.getAllPrompts() pour éviter la duplication de code
     */
    getAllPrompts(studentData, overrideConfig = null) {
        return PromptService.getAllPrompts(studentData, overrideConfig);
    },

    /**
     * Génère le prompt de raffinement selon le type
     * @deprecated Délègue maintenant à PromptService.getRefinementPrompt() pour éviter la duplication de code
     */
    getRefinementPrompt(type, original, context = null) {
        return PromptService.getRefinementPrompt(type, original, context ? { context } : {});
    },

    /**
     * Génère une appréciation via l'IA
     */
    async generateAppreciation(studentData, isPreview = false, overrideConfig = null, signal = null) {
        let appreciation = '', prompts = {}, tokenUsage = { appreciation: null, sw: null, ns: null };

        prompts = this.getAllPrompts({ ...studentData, generatedAppreciation: '' }, overrideConfig);
        const aiResp = await AIService.callAIWithFallback(prompts.appreciation, { signal });
        appreciation = aiResp.text;
        tokenUsage.appreciation = aiResp.usage;

        if (isPreview) {
            return { appreciation, prompt: prompts.appreciation, usage: aiResp.usage };
        }

        const evolutions = this.analyserEvolution(studentData.periods);
        return this.createResultObject(studentData.nom, studentData.prenom, appreciation, evolutions, studentData, prompts, tokenUsage, null);
    },

    /**
     * Prépare la liste des élèves pour l'import de masse
     */
    prepareStudentListForImport(lines, formatMap, importMode, existingResults, currentPeriod) {
        const importPreviewData = {
            newStudents: [], updatedStudents: [], departedStudents: [],
            studentsToProcess: [], ignoredCount: 0
        };

        const existingStudentsMap = new Map(existingResults.map(r => [Utils.normalizeName(r.nom, r.prenom), r]));
        const importedStudentsMap = new Map();

        lines.forEach(line => {
            const studentData = Utils.parseStudentLine(line, formatMap, currentPeriod);
            if (studentData) {
                importedStudentsMap.set(Utils.normalizeName(studentData.nom, studentData.prenom), studentData);
            } else {
                importPreviewData.ignoredCount++;
            }
        });

        if (importMode === 'replace') {
            importPreviewData.studentsToProcess = Array.from(importedStudentsMap.values());
            importPreviewData.newStudents = [...importPreviewData.studentsToProcess];
            importPreviewData.updatedStudents = [];
            existingStudentsMap.forEach((result, key) => {
                if (!importedStudentsMap.has(key)) {
                    importPreviewData.departedStudents.push({ nom: result.nom, prenom: result.prenom });
                }
            });
        } else {
            importedStudentsMap.forEach((importedData, key) => {
                const existingResult = existingStudentsMap.get(key);
                if (!existingResult) {
                    const periods = Utils.getPeriods();
                    const currentPeriodIndex = periods.indexOf(currentPeriod);
                    const hasDataInPreviousPeriods = periods.slice(0, currentPeriodIndex).some(p => {
                        const periodData = importedData.periods[p];
                        return periodData && (typeof periodData.grade === 'number' || periodData.appreciation);
                    });

                    if (currentPeriodIndex > 0 && !hasDataInPreviousPeriods && importedData.statuses.length === 0) {
                        importedData.statuses.push(`Nouveau ${currentPeriod}`);
                    }

                    importPreviewData.newStudents.push({ nom: importedData.nom, prenom: importedData.prenom });
                } else {
                    importPreviewData.updatedStudents.push({ nom: existingResult.nom, prenom: existingResult.prenom });
                }
                importPreviewData.studentsToProcess.push(importedData);
            });

            existingStudentsMap.forEach((result, key) => {
                const statuses = result.studentData.statuses || [];
                if (!importedStudentsMap.has(key) && !statuses.some(s => s.startsWith('Départ'))) {
                    importPreviewData.departedStudents.push({ nom: result.nom, prenom: result.prenom });
                }
            });
        }
        return importPreviewData;
    },

    /**
     * Parse le texte de forces/faiblesses en structure HTML
     * Note: Cette fonction génère du HTML mais c'est pour le formatage des données, pas pour le DOM
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
            { key: 'strength', class: 'strengths-title', icon: '<iconify-icon icon="solar:like-bold"></iconify-icon>' },
            { key: 'weakness', class: 'weaknesses-title', icon: '<iconify-icon icon="solar:dislike-bold"></iconify-icon>' }
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
    }
};
