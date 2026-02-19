import { appState } from '../state/State.js';
import { CONFIG, CONSTS, DEFAULT_IA_CONFIG, DEFAULT_PROMPT_TEMPLATES, DEFAULT_MASS_IMPORT_FORMATS } from '../config/Config.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';

import { StorageManager } from './StorageManager.js';
import { AIService } from '../services/AIService.js';
import { AppreciationService } from '../services/AppreciationService.js';
// RefinementManager removed - Focus Panel handles all refinement inline
import { ExportManager } from './ExportManager.js';
import { SingleStudentManager } from './SingleStudentManager.js';
import { StatsService } from '../services/StatsService.js';
import { PromptService } from '../services/PromptService.js';
// ... imports ...
import { StudentDataManager } from './StudentDataManager.js';
import { ResultsUIManager } from './ResultsUIManager.js';

import { MassImportManager } from './MassImportManager.js';
import { FileImportManager } from './FileImportManager.js';

import { TooltipsUI } from './TooltipsManager.js';
import * as HistoryUtils from '../utils/HistoryUtils.js';

let App;
let UI;

export const AppreciationsManager = {
    init(appInstance, uiManager) {
        App = appInstance;
        UI = uiManager;
        // RefinementManager removed - Focus Panel handles all refinement inline
        ExportManager.init(appInstance);
        SingleStudentManager.init(appInstance, this);
        ResultsUIManager.init(this, UI);

        MassImportManager.init(this, appInstance, UI);
    },

    // ... existing code ...

    renderResults(highlightId = null, highlightType = 'new') {
        return ResultsUIManager.renderResults(highlightId, highlightType);
    },

    async regenerateVisible(onlyErrors = false) {
        return ResultsUIManager.regenerateVisible(onlyErrors);
    },

    clearAllResults() {
        return ResultsUIManager.clearAllResults();
    },

    clearVisibleAppreciations() {
        return ResultsUIManager.clearVisibleAppreciations();
    },

    clearVisibleJournals() {
        return ResultsUIManager.clearVisibleJournals();
    },

    // ... existing code ...

    saveFormState() {
        // Currently a no-op - form state is saved on generation
        // This can be enhanced to persist draft state to localStorage
    },

    get massImportAbortController() {
        return MassImportManager.massImportAbortController;
    },

    createResultObject(...args) {
        return StudentDataManager.createResultObject(...args);
    },

    /**
     * Sauvegarde la version actuelle dans l'historique avant modification
     * @param {Object} result - L'objet résultat à sauvegarder
     * @param {string} source - Source de la modification (edit, concise, detailed, encouraging, variation, regenerate)
     */
    pushToHistory(result, source = 'edit') {
        if (!result || !result.appreciation) return;
        const state = HistoryUtils.getHistoryState(result);
        const appreciationSource = result.appreciationSource ?? null;
        const aiModel = result.studentData?.currentAIModel ?? null;
        const tokenUsage = result.tokenUsage ? JSON.parse(JSON.stringify(result.tokenUsage)) : null;

        HistoryUtils.pushToState(state, result.appreciation, source, appreciationSource, aiModel, tokenUsage);
    },

    /**
     * Bascule entre versions (toggle)
     * @param {string} id - ID du résultat
     * @returns {boolean}
     */
    toggleVersion(id) {
        const result = appState.generatedResults.find(r => r.id === id);
        if (!result) return false;

        const state = HistoryUtils.getHistoryState(result);

        // Sauvegarder texte actuel s'il diffère
        if (result.appreciation) {
            const appreciationSource = result.appreciationSource ?? null;
            const aiModel = result.studentData?.currentAIModel ?? null;
            const tokenUsage = result.tokenUsage ? JSON.parse(JSON.stringify(result.tokenUsage)) : null;

            HistoryUtils.pushToState(state, result.appreciation, 'edit', appreciationSource, aiModel, tokenUsage);
        }

        if (!HistoryUtils.hasMultipleVersions(state)) {
            UI.showNotification('Aucune version alternative disponible.', 'warning');
            return false;
        }

        // Naviguer (cycle)
        if (state.currentIndex > 0) {
            state.currentIndex--;
        } else {
            state.currentIndex = state.versions.length - 1;
        }

        result.appreciation = state.versions[state.currentIndex];
        const isShowingOlder = state.currentIndex < state.versions.length - 1;

        // Mettre à jour la carte UI
        const card = document.querySelector(`.appreciation-result[data-id="${id}"]`);
        if (card) {
            const appreciationEl = card.querySelector('[data-template="appreciation"]');
            if (appreciationEl) {
                appreciationEl.innerHTML = Utils.decodeHtmlEntities(Utils.cleanMarkdown(result.appreciation));
            }

            const toggleBtn = card.querySelector('[data-action="toggle-version"]');
            if (toggleBtn) {
                toggleBtn.dataset.tooltip = isShowingOlder ? 'Revenir à la version récente' : 'Voir version précédente';
                toggleBtn.classList.toggle('showing-original', isShowingOlder);
            }

            const wordCountEl = card.querySelector('[data-template="wordCount"]');
            if (wordCountEl) {
                const wordCount = Utils.countWords(result.appreciation);
                wordCountEl.textContent = `${wordCount} mot${wordCount > 1 ? 's' : ''}`;
                wordCountEl.dataset.tooltip = `${Utils.countCharacters(result.appreciation)} caractères`;
            }
        }

        StorageManager.saveAppState();
        UI.showNotification(isShowingOlder ? 'Version précédente affichée.' : 'Version récente affichée.', 'info');
        return true;
    },

    /**
     * Vérifie si un résultat a un historique
     * @param {string} id
     * @returns {boolean}
     */
    hasHistory(id) {
        const result = appState.generatedResults.find(r => r.id === id);
        return result ? HistoryUtils.hasMultipleVersions(HistoryUtils.getHistoryState(result)) : false;
    },



    analyserEvolution(periodsData) {
        return StatsService.analyserEvolution(periodsData);
    },

    getRelevantEvolution(evolutions, currentPeriod) {
        return StatsService.getRelevantEvolution(evolutions, currentPeriod);
    },

    getAllPrompts(studentData, overrideConfig = null) {
        return PromptService.getAllPrompts(studentData, overrideConfig);
    },

    getRefinementPrompt(type, original, context = null) {
        return PromptService.getRefinementPrompt(type, original, context);
    },



    async generateAppreciation(studentData, isPreview = false, overrideConfig = null, signal = null, context = null) {
        let appreciation = '', prompts = {}, tokenUsage = { appreciation: null, sw: null, ns: null };

        if (!UI.checkAPIKeyPresence()) {
            const model = appState.currentAIModel;
            const isOllama = model.startsWith('ollama');
            const errorMsg = isOllama
                ? "Ollama non activé. Activez-le dans les paramètres."
                : "Clé API manquante. Veuillez la configurer dans les paramètres.";
            // La notification est déjà affichée par checkAPIKeyPresence
            throw new Error(errorMsg);
        }

        prompts = this.getAllPrompts({ ...studentData, generatedAppreciation: '' }, overrideConfig);
        const aiResp = await AIService.callAIWithFallback(prompts.appreciation, { signal, context, studentName: studentData.prenom });

        // Désanonymisation : remplacer [PRÉNOM] par le vrai prénom
        appreciation = this._deanonymizeText(aiResp.text, studentData.prenom);

        tokenUsage.appreciation = aiResp.usage;
        tokenUsage.generationTimeMs = aiResp.generationTimeMs; // Temps de génération
        const modelUsed = aiResp.modelUsed;

        if (isPreview) {
            return { appreciation, prompt: prompts.appreciation, usage: aiResp.usage, generationTimeMs: aiResp.generationTimeMs };
        }

        const evolutions = this.analyserEvolution(studentData.periods);
        const result = this.createResultObject(studentData.nom, studentData.prenom, appreciation, evolutions, studentData, prompts, tokenUsage, null, modelUsed);
        result.copied = false; // Ensure initialized as false
        return result;
    },

    /**
     * Remplace le placeholder [PRÉNOM] par le vrai prénom de l'élève
     * @param {string} text - Texte avec placeholder
     * @param {string} prenom - Prénom réel de l'élève
     * @returns {string} Texte avec le prénom réinjecté
     * @private
     */
    _deanonymizeText(text, prenom) {
        if (!text || !prenom) return text;
        // Remplacer toutes les occurrences de [PRÉNOM] avec diverses variantes Unicode
        // Les modèles IA peuvent générer: [Prénom], [PRÉNOM], [prénom], [Prėnom], [Prênom], etc.
        // Cette regex couvre les variantes courantes des accents sur le 'e'
        return text.replace(/\[pr[eéèêëėẻẽ]nom\]/gi, prenom);
    },

    _validateSingleStudentForm() {
        return SingleStudentManager.validateForm();
    },

    async generateSingleAppreciation() {
        return SingleStudentManager.generateAppreciation();
    },

    async updateSingleAppreciation() {
        return SingleStudentManager.updateAppreciation();
    },

    _prepareStudentListForImport(lines, formatMap, importMode) {
        return StudentDataManager._prepareStudentListForImport(lines, formatMap, importMode);
    },

    async processMassImport(studentsToProcess, ignoredCount) {
        return MassImportManager.processMassImport(studentsToProcess, ignoredCount);
    },

    switchToCreationMode() {
        SingleStudentManager.switchToCreationMode();
    },

    resetForm(forNext = false) {
        SingleStudentManager.resetForm(forNext);
    },

    _getSingleStudentFormData() {
        return SingleStudentManager.getFormData();
    },

    editAppreciation(id) {
        SingleStudentManager.edit(id);
    },

    loadStudentIntoForm(id) {
        SingleStudentManager.loadIntoForm(id);
    },

    deleteAppreciation(id) {
        SingleStudentManager.delete(id);
    },

    copyAppreciation(id, buttonEl) {
        ExportManager.copyAppreciation(id, buttonEl);
    },

    copyRefinementText(type) {
        ExportManager.copyRefinementText(type);
    },

    copyAllResults() {
        ExportManager.copyAllResults();
    },

    parseStrengthsWeaknesses(text) {
        // ... implementation existing ...
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
            { key: 'strength', class: 'strengths-title', icon: '<iconify-icon icon="solar:like-linear"></iconify-icon>' },
            { key: 'weakness', class: 'weaknesses-title', icon: '<iconify-icon icon="solar:dislike-linear"></iconify-icon>' }
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

    async generateStrengthsWeaknesses(id, silent = false) {
        const result = appState.generatedResults.find(r => r.id === id);
        if (!result || !UI.checkAPIKeyPresence(silent)) throw new Error("Conditions non remplies.");
        try {
            const prompts = this.getAllPrompts({ ...result.studentData, id: result.id });
            result.studentData.prompts.sw = prompts.sw;
            const resp = await AIService.callAIWithFallback(prompts.sw, { context: 'single-student', studentName: result.prenom });
            result.strengthsWeaknesses = resp.text;
            // Ensure tokenUsage exists before setting properties
            if (!result.tokenUsage) result.tokenUsage = {};
            result.tokenUsage.sw = resp.usage;
            StorageManager.saveAppState();
            if (!silent) UI.showNotification('Analyse générée.', 'success');
        } catch (e) {
            console.error("Erreur F/F:", e);
            if (!silent) UI.showNotification(`Erreur : ${Utils.translateErrorMessage(e.message)}`, 'error');
            throw e;
        }
    },

    async generateNextSteps(id, silent = false) {
        const result = appState.generatedResults.find(r => r.id === id);
        if (!result || !UI.checkAPIKeyPresence(silent)) throw new Error("Conditions non remplies.");
        try {
            const prompts = this.getAllPrompts({ ...result.studentData, id: result.id });
            result.studentData.prompts.ns = prompts.ns;
            const resp = await AIService.callAIWithFallback(prompts.ns, { context: 'single-student', studentName: result.prenom });

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
            // Ensure tokenUsage exists before setting properties
            if (!result.tokenUsage) result.tokenUsage = {};
            result.tokenUsage.ns = resp.usage;
            StorageManager.saveAppState();
            if (!silent) UI.showNotification('Pistes générées.', 'success');
        } catch (e) {
            console.error("Erreur pistes:", e);
            if (!silent) UI.showNotification(`Erreur : ${Utils.translateErrorMessage(e.message)}`, 'error');
            throw e;
        }
    },
    // NOTE: Deprecated refinement methods removed - Focus Panel handles all refinement inline


    async regenerateFailedAppreciation(id, button) {
        const resultIndex = appState.generatedResults.findIndex(r => r.id === id);
        if (resultIndex === -1) return;

        if (button) UI.showInlineSpinner(button);

        // Afficher le skeleton dans la ligne
        const { ListViewManager } = await import('./ListViewManager.js');
        ListViewManager.setRowStatus(id, 'generating');

        const originalResult = appState.generatedResults[resultIndex];
        originalResult.copied = false;

        try {
            // Réinitialiser l'historique - la régénération est un nouveau départ
            // L'"Original" sera la nouvelle génération IA
            originalResult.historyState = null;

            // Mise à jour de certaines données si nécessaire
            const updatedStudentData = { ...originalResult.studentData };
            updatedStudentData.id = id; // Include ID for journal lookup
            updatedStudentData.subject = appState.useSubjectPersonalization ? appState.currentSubject : 'Générique';
            updatedStudentData.currentAIModel = appState.currentAIModel;

            const newResult = await this.generateAppreciation(updatedStudentData, false, null, null, 'single-student');

            // Use centralized updateResult to preserve user data (photo, journal, history)
            const updatedResult = StudentDataManager.updateResult(
                appState.generatedResults[resultIndex],
                newResult
            );
            // historyState is reset - will be re-initialized on first access

            // CORRECTIF: Synchroniser filteredResults avec le nouveau résultat
            const filteredIndex = appState.filteredResults.findIndex(r => r.id === id);
            if (filteredIndex > -1) {
                appState.filteredResults[filteredIndex] = updatedResult;
            }

            // Mettre à jour la ligne avec animation typewriter
            await ListViewManager.updateRow(id, updatedResult, true);

            UI.showNotification(`Réussi pour ${originalResult.prenom}.`, 'success');

        } catch (e) {
            const msg = Utils.translateErrorMessage(e.message);
            // Préserver l'appréciation originale en cas d'échec
            const errorResult = this.createResultObject(
                originalResult.nom,
                originalResult.prenom,
                originalResult.appreciation || '', // Garder l'appréciation existante
                originalResult.evolutions,
                originalResult.studentData,
                originalResult.studentData.prompts || {},
                originalResult.tokenUsage || {},
                `Nouvelle Erreur : ${msg}.`
            );

            // Use centralized updateResult to preserve user data
            const updatedResult = StudentDataManager.updateResult(
                appState.generatedResults[resultIndex],
                errorResult
            );
            updatedResult.history = originalResult.history;

            // CORRECTIF: Synchroniser filteredResults aussi en cas d'erreur
            const filteredIndex = appState.filteredResults.findIndex(r => r.id === id);
            if (filteredIndex > -1) {
                appState.filteredResults[filteredIndex] = updatedResult;
            }

            // Afficher l'erreur via updateRow
            ListViewManager.updateRow(id, updatedResult, false);

            UI.showNotification(`Échec pour ${originalResult.prenom} : ${msg}`, 'error');
        } finally {
            if (button) UI.hideInlineSpinner(button);
            StorageManager.saveAppState();

            // Mettre à jour les autres éléments
            UI.updateStats();
            UI.updateControlButtons();
        }
    },

    /**
     * Loads sample data for demonstration purposes.
     * Stores sample data and triggers import wizard when ready.
     */
    loadSampleData() {
        // Import sample data from shared source
        import('../data/SampleData.js').then(({ getSampleImportData }) => {
            const sampleDataText = getSampleImportData();

            // Store in sessionStorage for later use
            sessionStorage.setItem('pendingSampleData', sampleDataText);

            // If massData textarea exists (main app view), fill it directly
            if (DOM.massData) {
                DOM.massData.value = sampleDataText;
                DOM.massData.dispatchEvent(new Event('input'));
                sessionStorage.removeItem('pendingSampleData');
                // Trigger import wizard
                setTimeout(() => {
                    FileImportManager.handleMassImportTrigger();
                }, 100);
            }
            // Otherwise data stays in sessionStorage until welcome modal closes
        });
    }
};

// Expose to window to avoid circular dependency issues
window.AppreciationsManager = AppreciationsManager;


