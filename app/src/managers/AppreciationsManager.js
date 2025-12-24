import { appState } from '../state/State.js';
import { CONFIG, CONSTS, DEFAULT_IA_CONFIG, DEFAULT_PROMPT_TEMPLATES, DEFAULT_MASS_IMPORT_FORMATS } from '../config/Config.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
// import { UI } from './UIManager.js'; // REMOVED

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
import { ResultCardsUI } from './ResultCardsUIManager.js';
import { TooltipsUI } from './TooltipsManager.js';

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
     * @param {string} source - Source de la modification ('regenerate', 'refine', 'manual')
     */
    pushToHistory(result, source = 'unknown') {
        if (!result || !result.appreciation) return;

        // Initialiser l'historique si nécessaire
        if (!result.history) result.history = [];

        // Sauvegarder la version actuelle avec toutes les infos IA
        result.history.unshift({
            appreciation: result.appreciation,
            timestamp: result.timestamp || new Date().toISOString(),
            source: source,
            modelUsed: result.studentData?.currentAIModel || null,
            // Sauvegarder aussi les informations de tokens pour le tooltip
            tokenUsage: result.tokenUsage ? JSON.parse(JSON.stringify(result.tokenUsage)) : null
        });

        // Limiter à 5 versions maximum
        if (result.history.length > 5) {
            result.history = result.history.slice(0, 5);
        }
    },

    /**
     * Bascule entre la version actuelle et la version précédente (toggle)
     * @param {string} id - ID du résultat
     * @returns {boolean} - true si bascule réussie
     */
    toggleVersion(id) {
        const result = appState.generatedResults.find(r => r.id === id);
        if (!result || !result.history || result.history.length === 0) {
            UI.showNotification('Aucune version alternative disponible.', 'warning');
            return false;
        }

        // Sauvegarder la version actuelle avec toutes les infos IA
        // Si on affichait déjà une "ancienne" version, on doit préserver ce statut (source='regenerate')
        // Sinon, c'est la version "latest" (la plus récente générée)
        const sourceToSave = result.isShowingOriginal ? 'regenerate' : 'latest';

        const currentVersion = {
            appreciation: result.appreciation,
            timestamp: result.timestamp || new Date().toISOString(),
            source: sourceToSave,
            modelUsed: result.studentData?.currentAIModel || null,
            tokenUsage: result.tokenUsage ? JSON.parse(JSON.stringify(result.tokenUsage)) : null
        };

        // Récupérer la version précédente (première de l'historique)
        const previousVersion = result.history.shift();

        // Basculer : la version actuelle devient la première de l'historique
        result.history.unshift(currentVersion);

        // Appliquer la version précédente
        result.appreciation = previousVersion.appreciation;
        result.timestamp = previousVersion.timestamp;

        // Restaurer le modèle IA utilisé pour cette version
        if (previousVersion.modelUsed && result.studentData) {
            result.studentData.currentAIModel = previousVersion.modelUsed;
        }

        // Restaurer les tokenUsage pour cette version (pour le tooltip)
        if (previousVersion.tokenUsage) {
            result.tokenUsage = JSON.parse(JSON.stringify(previousVersion.tokenUsage));
        }

        // Déterminer si on affiche maintenant la version "originale" (antérieure) ou "latest"
        // Une version est considérée comme "originale" si sa source indique qu'elle a été sauvegardée suite à une régénération/refinement/variation
        result.isShowingOriginal = (previousVersion.source === 'regenerate' || previousVersion.source === 'refine' || previousVersion.source === 'variation');

        const isShowingOriginal = result.isShowingOriginal;

        // Mettre à jour la carte dans l'UI
        const card = document.querySelector(`.appreciation-result[data-id="${id}"]`);
        if (card) {
            const appreciationEl = card.querySelector('[data-template="appreciation"]');
            if (appreciationEl) {
                appreciationEl.innerHTML = Utils.decodeHtmlEntities(Utils.cleanMarkdown(result.appreciation));
            }

            // Mettre à jour le tooltip du bouton toggle
            const toggleBtn = card.querySelector('[data-action="toggle-version"]');
            if (toggleBtn) {
                toggleBtn.dataset.tooltip = isShowingOriginal
                    ? 'Revenir à la nouvelle version'
                    : 'Voir version précédente';
                toggleBtn.classList.toggle('showing-original', isShowingOriginal);
            }

            // Mettre à jour le compteur de mots
            const wordCountEl = card.querySelector('[data-template="wordCount"]');
            if (wordCountEl) {
                const wordCount = Utils.countWords(result.appreciation);
                const charCount = Utils.countCharacters(result.appreciation);
                wordCountEl.textContent = `${wordCount} mot${wordCount > 1 ? 's' : ''}`;
                wordCountEl.dataset.tooltip = `${charCount} caractères`;
            }

            // Mettre à jour le tooltip de la pastille IA (✨) avec les infos de la version restaurée
            const nameEl = card.querySelector('[data-template="name"]');
            if (nameEl) {
                const aiIconEl = nameEl.querySelector('.ai-icon');
                if (aiIconEl) {
                    const { tooltip } = ResultCardsUI.getGenerationModeInfo(result);
                    TooltipsUI.updateTooltip(aiIconEl, tooltip);
                }
            }
        }

        StorageManager.saveAppState();
        UI.showNotification(isShowingOriginal ? 'Version originale affichée.' : 'Nouvelle version affichée.', 'info');
        return true;
    },

    /**
     * Vérifie si un résultat a un historique disponible
     * @param {string} id - ID du résultat
     * @returns {boolean}
     */
    hasHistory(id) {
        const result = appState.generatedResults.find(r => r.id === id);
        return result?.history?.length > 0;
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



    async generateAppreciation(studentData, isPreview = false, overrideConfig = null, signal = null) {
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
        const aiResp = await AIService.callAIWithFallback(prompts.appreciation, { signal });

        // Désanonymisation : remplacer [PRÉNOM] par le vrai prénom
        appreciation = this._deanonymizeText(aiResp.text, studentData.prenom);

        tokenUsage.appreciation = aiResp.usage;
        tokenUsage.generationTimeMs = aiResp.generationTimeMs; // Temps de génération
        const modelUsed = aiResp.modelUsed;

        if (isPreview) {
            return { appreciation, prompt: prompts.appreciation, usage: aiResp.usage, generationTimeMs: aiResp.generationTimeMs };
        }

        const evolutions = this.analyserEvolution(studentData.periods);
        return this.createResultObject(studentData.nom, studentData.prenom, appreciation, evolutions, studentData, prompts, tokenUsage, null, modelUsed);
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
        // Remplacer toutes les occurrences de [PRÉNOM] par le prénom réel
        return text.replace(/\[PRÉNOM\]/g, prenom);
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
            { key: 'strength', class: 'strengths-title', icon: '<i class="fas fa-thumbs-up"></i>' },
            { key: 'weakness', class: 'weaknesses-title', icon: '<i class="fas fa-thumbs-down"></i>' }
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
            const prompts = this.getAllPrompts(result.studentData);
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

    async generateNextSteps(id, silent = false) {
        const result = appState.generatedResults.find(r => r.id === id);
        if (!result || !UI.checkAPIKeyPresence(silent)) throw new Error("Conditions non remplies.");
        try {
            const prompts = this.getAllPrompts(result.studentData);
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

    // RefinementManager methods removed - Focus Panel handles all refinement inline
    async generateRefinedAppreciation(type, button) {
        console.warn('generateRefinedAppreciation: Deprecated - use FocusPanelManager._refineAppreciation instead');
    },

    applyRefinedAppreciation() {
        console.warn('applyRefinedAppreciation: Deprecated - Focus Panel auto-saves edits');
    },

    acceptRefinedSuggestion() {
        console.warn('acceptRefinedSuggestion: Deprecated - Focus Panel inline refinement applies directly');
    },

    async regenerateFailedAppreciation(id, button) {
        const resultIndex = appState.generatedResults.findIndex(r => r.id === id);
        if (resultIndex === -1) return;

        const card = document.querySelector(`.appreciation-result[data-id="${id}"]`);
        card?.classList.add('is-regenerating');
        if (button) UI.showInlineSpinner(button);

        const originalResult = appState.generatedResults[resultIndex];
        originalResult.copied = false;

        // Afficher le skeleton dans la zone d'appréciation
        UI.showSkeletonInCard(card, 'Génération...', false);
        const appreciationEl = card?.querySelector('[data-template="appreciation"]');

        try {
            // Sauvegarder l'ancienne version dans l'historique AVANT régénération
            this.pushToHistory(originalResult, 'regenerate');

            const updatedStudentData = JSON.parse(JSON.stringify(originalResult.studentData));
            updatedStudentData.subject = appState.useSubjectPersonalization ? appState.currentSubject : 'Générique';
            updatedStudentData.currentAIModel = appState.currentAIModel;

            const newResult = await this.generateAppreciation(updatedStudentData);
            newResult.id = id;
            // Transférer l'historique vers le nouveau résultat
            newResult.history = originalResult.history || [];
            appState.generatedResults[resultIndex] = newResult;

            // Effet typewriter pour afficher le texte progressivement
            if (appreciationEl) {
                await UI.typewriterReveal(appreciationEl, newResult.appreciation || '', { speed: 'fast' });
                card?.classList.remove('has-error'); // Retirer l'état d'erreur après succès
                card?.classList.add('just-generated');
                setTimeout(() => card?.classList.remove('just-generated'), 1000);
            }

            // Mettre à jour la carte complètement pour synchroniser le compteur de mots, l'icône IA, etc.
            // On le fait après l'animation typewriter pour que le compteur s'ajuste au texte final visible.
            ResultCardsUI.updateResultCard(id, { animate: false });

            UI.showNotification(`Réussi pour ${originalResult.prenom}.`, 'success');

            // Refinement modal removed - Focus Panel handles all editing inline
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
            errorResult.id = id;
            appState.generatedResults[resultIndex] = errorResult;

            // Afficher l'erreur avec animation
            if (appreciationEl) {
                await UI.fadeOutSkeleton(appreciationEl);
                appreciationEl.innerHTML = `<p class="error-text">⚠️ ${msg}</p>`;
                card?.classList.add('has-error', 'just-errored');
                setTimeout(() => card?.classList.remove('just-errored'), 1000);
            }

            UI.showNotification(`Échec pour ${originalResult.prenom} : ${msg}`, 'error');
        } finally {
            if (button) UI.hideInlineSpinner(button);
            card?.classList.remove('is-regenerating');
            StorageManager.saveAppState();

            // Mettre à jour les autres éléments de la carte (nom, notes, etc.)
            UI.updateStats();
            UI.updateControlButtons();
        }
    },

    renderResults(highlightId = null, highlightType = 'new') {
        return ResultsUIManager.renderResults(highlightId, highlightType);
    },



    // NOTE: showAppreciationDetails and refineAppreciation are defined further below



    exportToCsv() {
        ExportManager.exportToCsv();
    },

    exportToPdf() {
        ExportManager.exportToPdf();
    },

    // Refinement modal removed - Focus Panel handles all refinement inline
    refineAppreciation(id, fromNav = false) {
        console.warn('refineAppreciation: Deprecated - use FocusPanelManager.open(id) instead');
        // Forward to Focus Panel for backwards compatibility
        import('./FocusPanelManager.js').then(({ FocusPanelManager }) => {
            FocusPanelManager.open(id);
        });
    },



    clearAllResults() {
        return ResultsUIManager.clearAllResults();
    },

    loadSampleData() {
        UI.setInputMode(CONSTS.INPUT_MODE.MASS);
        appState.importJustCompleted = false;

        const periods = Utils.getPeriods();
        const currentPeriod = appState.currentPeriod;

        const formatString = DEFAULT_MASS_IMPORT_FORMATS[appState.periodSystem]?.[currentPeriod];

        if (!formatString) {
            UI.showNotification("Impossible de charger les données d'exemple : format de base manquant.", "error");
            console.error(`Aucun format d'import par défaut trouvé pour ${appState.periodSystem} - ${currentPeriod}`);
            return;
        }

        const studentsBase = [
            { nom: "MARTIN", prenom: "Lucas", statuses: [], baseGrade: 12.5, evolution: 0.7, apps: ["Bon début.", "Progression notable."], instructions: "Participe bien." },
            { nom: "DURAND", prenom: "Sophie", statuses: ["PPRE"], baseGrade: 9.1, evolution: 1.4, apps: ["Doit s'investir.", "Des efforts à poursuivre."], instructions: "Élève discrète." },
            { nom: "LEFEVRE", prenom: "Thomas", statuses: [], baseGrade: 15.0, evolution: -0.5, apps: ["Très bonne participation.", "Léger recul."], instructions: "Maintenir le cap." },
            { nom: "PETIT", prenom: "Camille", statuses: [], baseGrade: 8.2, evolution: -1.2, apps: ["Difficultés persistantes.", "Nécessite un accompagnement."], instructions: "Besoins spécifiques." },
            { nom: "ROUSSEAU", prenom: "Emma", statuses: ["Délégué"], baseGrade: 17.1, evolution: 0.9, apps: ["Excellents résultats.", "Très forte progression."], instructions: "Rôle moteur." },
            { nom: "MOREAU", prenom: "Axel", statuses: [], baseGrade: 10.5, evolution: 0.7, apps: ["Résultats corrects mais bavardages inacceptables.", "Trop de bavardages."], instructions: "Concentration à revoir." },
            { nom: "THOMAS", prenom: "Léa", statuses: [], baseGrade: 8.5, evolution: 1.3, apps: ["Des difficultés malgré du sérieux.", "Des progrès encourageants."], instructions: "Poursuivre les efforts." },
            { nom: "BERNARD", prenom: "Hugo", statuses: [], baseGrade: 11.0, evolution: 3.5, apps: ["Ensemble fragile.", "Progression spectaculaire."], instructions: "Bravo !" }
        ];

        const data = studentsBase.map(s => {
            const studentMap = {
                NOM_PRENOM: `${s.nom} ${s.prenom}`,
                STATUT: s.statuses.join(', '),
                INSTRUCTIONS: s.instructions
            };

            periods.forEach((p, pIndex) => {
                const grade = (s.baseGrade + pIndex * s.evolution).toFixed(1);

                studentMap[`MOY_${p}`] = grade;

                if (periods.indexOf(p) < periods.indexOf(currentPeriod)) {
                    studentMap[`APP_${p}`] = s.apps[pIndex] || `Appréciation ${p}.`;
                }
            });

            return formatString
                .split(' | ')
                .map(tag => studentMap[tag.trim().replace(/[{}]/g, '')] || '')
                .join(' | ');
        }).join('\n');

        if (DOM.massData) {
            DOM.massData.value = data;
            DOM.massData.dispatchEvent(new Event('input'));
        }

        UI.showNotification('Données d\'exemple chargées.', 'info');
    }
};

// Expose to window to avoid circular dependency issues
window.AppreciationsManager = AppreciationsManager;


