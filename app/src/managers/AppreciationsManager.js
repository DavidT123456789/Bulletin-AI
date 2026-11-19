import { appState } from '../state/State.js';
import { AI_PROVIDERS, getProviderForModel } from '../config/aiRegistry.js';
import { getSampleImportData } from '../data/SampleData.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';

import { StorageManager } from './StorageManager.js';
import { AIService } from '../services/AIService.js';
import { ExportManager } from './ExportManager.js';
import { StatsService } from '../services/StatsService.js';
import { PromptService } from '../services/PromptService.js';
import { StudentDataManager } from './StudentDataManager.js';
import { ResultsUIManager } from './ResultsUIManager.js';
import { MassImportManager } from './MassImportManager.js';
import { FileImportManager } from './FileImportManager.js';
import { ListViewManager } from './ListViewManager.js';
import * as HistoryUtils from '../utils/HistoryUtils.js';
import { FocusPanelManager } from './FocusPanelManager.js';

let App;
let UI;

export const AppreciationsManager = {
    init(appInstance, uiManager) {
        App = appInstance;
        UI = uiManager;
        ExportManager.init(appInstance);
        ResultsUIManager.init(this, UI);

        MassImportManager.init(this, appInstance, UI);
    },

    renderResults(highlightId = null, highlightType = 'new') {
        return ResultsUIManager.renderResults(highlightId, highlightType);
    },

    clearAllResults() {
        return ResultsUIManager.clearAllResults();
    },

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
     * Get per-period history state for a result (mirrors FocusPanelHistory._getState logic)
     * @param {Object} result - The result object
     * @returns {Object} The history state for the current period
     * @private
     */
    _getPerPeriodState(result, createIfMissing = false) {
        const currentPeriod = appState.currentPeriod;

        // Migrate legacy historyState → historyPerPeriod
        // CRITICAL: Only use generationPeriod (immutable) — never studentData.currentPeriod
        // because currentPeriod changes as the user navigates, causing S1 history
        // to be incorrectly assigned to S2.
        if (result.historyState?.versions?.length > 0) {
            if (!result.historyPerPeriod) result.historyPerPeriod = {};
            const legacyPeriod = result.generationPeriod;
            if (legacyPeriod && !result.historyPerPeriod[legacyPeriod]) {
                result.historyPerPeriod[legacyPeriod] = result.historyState;
            }
            result.historyState = null;
        }

        // 2. Return existing period history, or create empty state only if requested
        if (!result.historyPerPeriod?.[currentPeriod]) {
            if (createIfMissing) {
                if (!result.historyPerPeriod) result.historyPerPeriod = {};
                result.historyPerPeriod[currentPeriod] = { versions: [], currentIndex: -1 };
                HistoryUtils.seedInitialVersion(result.historyPerPeriod[currentPeriod], result, currentPeriod);
                return result.historyPerPeriod[currentPeriod];
            }
            return { versions: [], currentIndex: -1 };
        }

        HistoryUtils.seedInitialVersion(result.historyPerPeriod[currentPeriod], result, currentPeriod);
        return result.historyPerPeriod[currentPeriod];
    },

    /**
     * Sauvegarde la version actuelle dans l'historique avant modification
     * @param {Object} result - L'objet résultat à sauvegarder
     * @param {string} source - Source de la modification (edit, concise, encouraging, polish, regenerate)
     */
    pushToHistory(result, source = 'edit') {
        if (!result || !result.appreciation) return;
        const state = this._getPerPeriodState(result, true);
        const appreciationSource = result.appreciationSource ?? null;
        const aiModel = result.studentData?.currentAIModel ?? null;
        const tokenUsage = result.tokenUsage ? Utils.deepClone(result.tokenUsage) : null;

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

        const state = this._getPerPeriodState(result, true);

        // Sauvegarder texte actuel s'il diffère
        if (result.appreciation) {
            const appreciationSource = result.appreciationSource ?? null;
            const aiModel = result.studentData?.currentAIModel ?? null;
            const tokenUsage = result.tokenUsage ? Utils.deepClone(result.tokenUsage) : null;

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

        const currentVersion = HistoryUtils.normalizeVersion(state.versions[state.currentIndex]);
        result.appreciation = currentVersion.content;
        const currentPeriod = appState.currentPeriod;
        if (result.studentData?.periods) {
            Utils.markStudentModified(result, currentPeriod);
            result.studentData.periods[currentPeriod].appreciation = currentVersion.content;
        }
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
        return true;
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

    async generateAppreciation(studentData, isPreview = false, overrideConfig = null, signal = null, context = null) {
        let appreciation = '', prompts = {}, tokenUsage = { appreciation: null, analysis: null };
        const targetClassId = studentData?.classId ?? appState.currentClassId;
        const targetPeriod = studentData?.currentPeriod || appState.currentPeriod;

        if (!UI.checkAPIKeyPresence(true)) {
            const model = appState.currentAIModel || '';
            const providerId = getProviderForModel(model);
            if (providerId === 'ollama') {
                throw new Error("Ollama non activé. Activez-le dans les paramètres.");
            }
            const providerLabel = AI_PROVIDERS[providerId]?.shortLabel ? ` ${AI_PROVIDERS[providerId].shortLabel}` : '';
            throw new Error(`Clé API${providerLabel} manquante. Veuillez la configurer dans les paramètres.`);
        }

        const normalizedStudentData = {
            ...studentData,
            classId: targetClassId,
            currentPeriod: targetPeriod
        };

        prompts = this.getAllPrompts({ ...normalizedStudentData, generatedAppreciation: '' }, overrideConfig);
        const userPrompt = prompts.appreciationUser || prompts.appreciation;
        const systemPrompt = prompts.appreciationSystem || null;
        const aiResp = await AIService.callAIWithFallback(userPrompt, { signal, context, studentName: studentData.prenom, systemPrompt });

        // Désanonymisation : remplacer [PRÉNOM] par le vrai prénom et purger tout [NOM] résiduel
        appreciation = PromptService.deanonymizeText(aiResp.text, studentData.prenom);

        tokenUsage.appreciation = aiResp.usage;
        tokenUsage.generationTimeMs = aiResp.generationTimeMs; // Temps de génération
        const modelUsed = aiResp.modelUsed;

        if (isPreview) {
            return { appreciation, prompt: userPrompt, usage: aiResp.usage, generationTimeMs: aiResp.generationTimeMs, modelUsed };
        }

        const evolutions = this.analyserEvolution(normalizedStudentData.periods);
        const result = this.createResultObject(studentData.nom, studentData.prenom, appreciation, evolutions, normalizedStudentData, prompts, tokenUsage, null, modelUsed);
        result.classId = targetClassId;
        result.generationPeriod = targetPeriod;
        result.copied = false; // Ensure initialized as false
        UI?.recordSupportMilestone?.('generation', 1);
        return result;
    },

    _prepareStudentListForImport(lines, formatMap, importMode) {
        return StudentDataManager._prepareStudentListForImport(lines, formatMap, importMode);
    },

    async processMassImport(studentsToProcess, ignoredCount) {
        return MassImportManager.processMassImport(studentsToProcess, ignoredCount);
    },

    copyAppreciation(id, buttonEl) {
        ExportManager.copyAppreciation(id, buttonEl);
    },

    copyAllResults() {
        ExportManager.copyAllResults();
    },

    /**
     * Extrait les listes structurées (forces, points de vigilance, pistes de progrès)
     * d'une réponse IA JSON avec repli Markdown/texte, puis désanonymise chaque puce.
     * @param {string} rawText - Texte brut retourné par l'IA
     * @param {string} [prenom=''] - Prénom réel de l'élève pour la désanonymisation locale
     * @returns {{strengths: string[], weaknesses: string[], nextSteps: string[]}}
     * @private
     */
    _parseStudentAnalysisResponse(rawText, prenom = '') {
        if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
            throw new Error('Réponse IA vide pour l\'analyse.');
        }

        const deanonymizeList = (arr) => Utils.normalizeAnalysisItems(arr)
            .slice(0, 3)
            .map(item => (prenom ? PromptService.deanonymizeText(item, prenom) : item));

        // 1. Parsing JSON principal (gère les blocs ```json et le texte parasite éventuel)
        let cleaned = rawText.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        } else {
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                cleaned = cleaned.slice(firstBrace, lastBrace + 1);
            }
        }

        try {
            const data = JSON.parse(cleaned);
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                const hasExpectedKey = ['strengths', 'forces', 'vigilances', 'weaknesses', 'faiblesses', 'nextSteps', 'recommendations']
                    .some(k => k in data);
                if (hasExpectedKey) {
                    return {
                        strengths: deanonymizeList(data.strengths || data.forces || []),
                        weaknesses: deanonymizeList(data.vigilances || data.weaknesses || data.faiblesses || []),
                        nextSteps: deanonymizeList(data.nextSteps || data.recommendations || [])
                    };
                }
            }
        } catch (_) {
            // Repli Markdown structuré ci-dessous
        }

        // 2. Repli Markdown / texte si un modèle local n'a pas produit de JSON
        const lines = rawText.replace(/\.{3,}/g, '...').split('\n');
        let activeBucket = null;
        const buckets = { strengths: [], weaknesses: [], nextSteps: [] };
        const headingRules = [
            { key: 'strengths', regex: /^(?:#+\s*)?(?:\*\*)?(?:Points?\s*forts?|Forces?|Atouts?|Ce qui va bien)[:\s]*(?:\*\*)?[:\s]*$/i },
            { key: 'weaknesses', regex: /^(?:#+\s*)?(?:\*\*)?(?:Points?\s*de\s*vigilance|Faiblesses?|Fragilit[ée]s?|Axes?\s*d['’]am[ée]lioration|Points?\s*[àa]\s*am[ée]liorer|Points?\s*faibles?)[:\s]*(?:\*\*)?[:\s]*$/i },
            { key: 'nextSteps', regex: /^(?:#+\s*)?(?:\*\*)?(?:Pistes?\s*(?:de\s*progr[èe]s|d['’]am[ée]lioration)|Recommandations?|Conseils?)[:\s]*(?:\*\*)?[:\s]*$/i }
        ];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const matchedHeading = headingRules.find(rule => rule.regex.test(trimmed));
            if (matchedHeading) {
                activeBucket = matchedHeading.key;
                continue;
            }
            if (activeBucket) {
                if (/^(?:J['’]esp[èe]re|N['’]h[ée]sitez|En conclusion)/i.test(trimmed)) continue;
                buckets[activeBucket].push(trimmed);
            }
        }

        const fallbackResult = {
            strengths: deanonymizeList(buckets.strengths),
            weaknesses: deanonymizeList(buckets.weaknesses),
            nextSteps: deanonymizeList(buckets.nextSteps)
        };

        if (fallbackResult.strengths.length === 0 && fallbackResult.weaknesses.length === 0 && fallbackResult.nextSteps.length === 0) {
            throw new Error('Format de réponse IA non reconnu pour l\'analyse.');
        }

        return fallbackResult;
    },

    /**
     * Génère en un seul appel IA structuré l'analyse individuelle (Forces, Vigilances, Pistes)
     * pour une période donnée, avec cloisonnement strict et désanonymisation locale.
     * @param {string} id - ID du résultat élève
     * @param {string|null} [targetPeriod=null] - Période ciblée (capture synchrone recommandée)
     * @param {boolean} [silent=false] - Masque les notifications toast
     * @param {AbortSignal|null} [signal=null] - Signal d'annulation
     * @returns {Promise<Object>} Entrée d'analyse enregistrée pour la période
     */
    async generateStudentAnalysis(id, targetPeriod = null, silent = false, signal = null) {
        const result = appState.generatedResults.find(r => r.id === id);
        if (!result || (UI && !UI.checkAPIKeyPresence(silent))) throw new Error("Conditions non remplies.");

        const effectivePeriod = targetPeriod || appState.currentPeriod || result.studentData?.currentPeriod;
        try {
            const prompts = this.getAllPrompts({
                ...result.studentData,
                id: result.id,
                classId: result.classId ?? result.studentData?.classId ?? appState.currentClassId,
                currentPeriod: effectivePeriod
            });

            if (!result.studentData.prompts) result.studentData.prompts = {};
            result.studentData.prompts.analysis = prompts.analysis;

            const resp = await AIService.callAIWithFallback(prompts.analysisUser, {
                systemPrompt: prompts.analysisSystem,
                context: 'single-student',
                studentName: result.prenom,
                signal
            });

            const parsed = this._parseStudentAnalysisResponse(resp.text, result.prenom);
            const now = Date.now();
            if (!result.analysisPerPeriod || typeof result.analysisPerPeriod !== 'object') {
                result.analysisPerPeriod = {};
            }

            const periodEntry = {
                strengths: parsed.strengths,
                weaknesses: parsed.weaknesses,
                nextSteps: parsed.nextSteps,
                source: 'ai',
                timestamp: new Date(now).toISOString(),
                _lastModified: now,
                snapshot: Utils.buildStudentAnalysisSnapshot(result, effectivePeriod),
                sourceAppreciation: (result.studentData?.periods?.[effectivePeriod]?.appreciation || '').trim(),
                model: resp.modelUsed || appState.currentAIModel || null
            };

            result.analysisPerPeriod[effectivePeriod] = periodEntry;
            result._lastModified = now;
            if (!result.tokenUsage || typeof result.tokenUsage !== 'object') result.tokenUsage = {};
            result.tokenUsage.analysis = resp.usage || null;

            Utils.syncStudentAnalysisRootCache(result, effectivePeriod);
            StorageManager.saveAppState();
            return periodEntry;
        } catch (e) {
            if (e?.name === 'AbortError') throw e;
            console.error("Erreur analyse élève:", e);
            if (!silent && UI) UI.showNotification(`Erreur : ${Utils.translateErrorMessage(e.message)}`, 'error');
            throw e;
        }
    },
    // NOTE: Deprecated refinement methods removed - Focus Panel handles all refinement inline


    async regenerateFailedAppreciation(id, button) {
        const resultIndex = appState.generatedResults.findIndex(r => r.id === id);
        if (resultIndex === -1) return;

        const targetClassId = appState.currentClassId;
        const targetPeriod = appState.currentPeriod;

        if (button) UI.showInlineSpinner(button);

        // Afficher le skeleton dans la ligne et synchroniser le volet s'il est ouvert
        ListViewManager.setRowStatus(id, 'generating');
        FocusPanelManager?.handleExternalGenerationStart?.(id);

        const originalResult = appState.generatedResults[resultIndex];
        originalResult.copied = false;

        try {
            // Mise à jour de certaines données si nécessaire
            const updatedStudentData = { ...originalResult.studentData };
            updatedStudentData.id = id; // Include ID for journal lookup
            updatedStudentData.classId = originalResult.classId ?? targetClassId;
            updatedStudentData.currentPeriod = targetPeriod;
            updatedStudentData.subject = appState.useSubjectPersonalization ? appState.currentSubject : 'Générique';
            updatedStudentData.currentAIModel = appState.currentAIModel;

            const newResult = await this.generateAppreciation(updatedStudentData, false, null, null, 'single-student');

            // Use centralized updateResult to preserve user data (photo, journal, history)
            const updatedResult = StudentDataManager.updateResult(
                appState.generatedResults[resultIndex],
                newResult
            );

            // Enregistrer la nouvelle génération dans l'historique
            this.pushToHistory(updatedResult, 'regenerate');

            // CORRECTIF: Synchroniser filteredResults avec le nouveau résultat
            const filteredIndex = appState.filteredResults.findIndex(r => r.id === id);
            if (filteredIndex > -1) {
                appState.filteredResults[filteredIndex] = updatedResult;
            }

            // Mettre à jour la ligne avec animation typewriter et le volet s'il est ouvert
            if ((appState.currentClassId ?? null) === (targetClassId ?? null) && appState.currentPeriod === targetPeriod) {
                await ListViewManager.updateRow(id, updatedResult, true);
                await FocusPanelManager?.handleExternalGenerationComplete?.(id, updatedResult, true);
            }
            try { navigator?.vibrate?.([15, 50, 20]); } catch (_) { }

        } catch (e) {
            const msg = Utils.translateErrorMessage(e.message);
            // Préserver l'appréciation originale en cas d'échec
            const errorResult = this.createResultObject(
                originalResult.nom,
                originalResult.prenom,
                originalResult.appreciation || '', // Garder l'appréciation existante
                originalResult.evolutions,
                { ...originalResult.studentData, currentPeriod: targetPeriod },
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

            // Afficher l'erreur via updateRow et synchroniser le volet
            if ((appState.currentClassId ?? null) === (targetClassId ?? null) && appState.currentPeriod === targetPeriod) {
                ListViewManager.updateRow(id, updatedResult, false);
                await FocusPanelManager?.handleExternalGenerationComplete?.(id, updatedResult, false);
            }

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
        const sampleDataText = getSampleImportData(appState.currentPeriod);

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
    }
};

// Expose to window to avoid circular dependency issues
window.AppreciationsManager = AppreciationsManager;


