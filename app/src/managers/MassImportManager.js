import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import { TooltipsUI } from './TooltipsManager.js';
import { MODEL_SHORT_NAMES } from '../config/models.js';
import { StudentDataManager } from './StudentDataManager.js';
import { ListViewManager } from './ListViewManager.js';
import { StorageManager } from './StorageManager.js';
import { ClassManager } from './ClassManager.js';

let Am;
let App;
let UI;

export const MassImportManager = {
    init(appreciationsManager, appInstance, uiManager) {
        Am = appreciationsManager;
        App = appInstance;
        UI = uiManager;
    },

    massImportAbortController: null,

    async processMassImport(studentsToProcess, ignoredCount) {
        this.massImportAbortController = new AbortController();
        appState.importJustCompleted = false;

        if (DOM.emptyStateCard) DOM.emptyStateCard.style.display = 'none';
        DOM.resultsDiv.innerHTML = '';

        // Créer les cartes pré-remplies avec skeleton sur l'appréciation
        const pendingCards = this._createPendingCards(studentsToProcess);

        const failedImports = [];
        let wasAborted = false;

        try {
            // Notification de démarrage (pas d'estimation car le rate limiting est réactif)
            UI.showNotification(
                `Génération de ${studentsToProcess.length} élève(s) en cours...`,
                'info'
            );

            UI.updateOutputProgress(0, studentsToProcess.length, 'Démarrage...');

            for (const [index, studentData] of studentsToProcess.entries()) {
                if (this.massImportAbortController.signal.aborted) {
                    wasAborted = true;
                    break;
                }

                // Afficher le nom de l'élève en cours dans la barre de progression
                const studentName = `${studentData.prenom || ''} ${studentData.nom || ''}`.trim();
                const generationStartTime = performance.now();

                // Mettre à jour l'affichage avec le nom (le temps sera mis à jour après)
                UI.updateOutputProgress(index + 1, studentsToProcess.length, studentName);

                // Marquer la rangée courante comme "en cours de génération"
                const resultId = pendingCards[index];

                ListViewManager.setRowStatus(resultId, 'generating');

                let newResultObject;
                let hasError = false;

                try {
                    // Rate limiting RÉACTIF : on attend seulement si l'API a demandé un délai
                    const waitTime = RateLimiter.getWaitTime(appState.currentAIModel);
                    if (waitTime > 0) {
                        UI.updateOutputProgress(
                            index,
                            studentsToProcess.length,
                            `⏱️ Pause API (${RateLimiter.formatTime(waitTime)})`
                        );
                        await RateLimiter.waitIfNeeded(appState.currentAIModel, null, this.massImportAbortController.signal);
                    }

                    newResultObject = await Am.generateAppreciation(studentData, false, null, this.massImportAbortController.signal);

                    // Calculer et afficher le temps de génération
                    const generationTime = ((performance.now() - generationStartTime) / 1000).toFixed(1);
                    UI.updateOutputProgress(index + 1, studentsToProcess.length, `${studentName} (${generationTime}s)`);

                    // Marquer la requête réussie pour l'auto-tuning (peut réduire le délai)
                    RateLimiter.markSuccess(appState.currentAIModel);

                } catch (e) {
                    // Vérifier si c'est une annulation (AbortError, signal aborted, ou message spécifique)
                    const isAborted = e.name === 'AbortError' ||
                        this.massImportAbortController?.signal?.aborted ||
                        e.message?.toLowerCase().includes('annulé');

                    if (isAborted) {
                        wasAborted = true;
                        ListViewManager.setRowStatus(resultId, 'pending'); // Revert skeleton
                        break;
                    }

                    console.error(`Erreur pour ${studentData.nom || ''}:`, e);
                    const msg = Utils.translateErrorMessage(e.message);
                    newResultObject = Am.createResultObject(studentData.nom, studentData.prenom, '', [], studentData, {}, {}, `Erreur IA : ${msg}.`);
                    failedImports.push(studentData);
                    hasError = true;

                    // Retry intelligent en cas d'erreur quota/rate limit
                    if (e.message?.includes('429') || e.message?.toLowerCase().includes('quota')) {
                        // Marquer l'erreur 429 pour l'auto-tuning (augmente le délai)
                        RateLimiter.markError429(appState.currentAIModel, e.message);

                        // Extraire le temps d'attente suggéré par l'API
                        const retryAfter = RateLimiter.extractRetryAfter(e.message);
                        const waitTime = retryAfter || 5000; // 5s par défaut (réactif)

                        UI.showNotification(
                            `Limite API atteinte, reprise dans ${RateLimiter.formatTime(waitTime)}...`,
                            'warning'
                        );

                        try {
                            await RateLimiter.sleep(waitTime, this.massImportAbortController.signal);
                        } catch (sleepError) {
                            if (sleepError.name === 'AbortError') {
                                wasAborted = true;
                                break;
                            }
                        }
                    }
                }

                const studentKey = Utils.normalizeName(studentData.nom, studentData.prenom);
                // CORRECTIF: Chercher seulement dans la classe courante
                const existingResultIndex = appState.generatedResults.findIndex(r =>
                    Utils.normalizeName(r.nom, r.prenom) === studentKey &&
                    r.classId === appState.currentClassId
                );

                if (existingResultIndex > -1) {
                    const existingResult = appState.generatedResults[existingResultIndex];
                    // Keep the ID from the existing state to ensure we update the correct row
                    newResultObject.id = existingResult.id;

                    Object.assign(existingResult.studentData.periods, newResultObject.studentData.periods);
                    existingResult.appreciation = newResultObject.appreciation;
                    existingResult.studentData.currentPeriod = newResultObject.studentData.currentPeriod;
                    existingResult.studentData.subject = newResultObject.studentData.subject;

                    existingResult.studentData.statuses = newResultObject.studentData.statuses;
                    existingResult.timestamp = newResultObject.timestamp;
                    existingResult.errorMessage = newResultObject.errorMessage;
                    existingResult.errorPeriod = newResultObject.errorPeriod ?? null;
                    existingResult.evolutions = newResultObject.evolutions;
                    existingResult.tokenUsage = newResultObject.tokenUsage;
                    existingResult.studentData.prompts = newResultObject.studentData.prompts;
                    // Transfer all generation metadata for dirty detection
                    StudentDataManager.transferGenerationMetadata(existingResult, newResultObject);
                    // Reset pending flag
                    existingResult.isPending = false;

                } else {
                    newResultObject.isPending = false;
                    // CRITICAL FIX: Restore preserved data (photo, journal) if passed from generateAllPending
                    if (studentData._preservedData) {
                        if (studentData._preservedData.studentPhoto) {
                            newResultObject.studentPhoto = studentData._preservedData.studentPhoto;
                        }
                        if (studentData._preservedData.journal) {
                            newResultObject.journal = studentData._preservedData.journal;
                        }
                        if (studentData._preservedData.history) {
                            newResultObject.history = studentData._preservedData.history;
                        }
                        if (studentData._preservedData._lastModified) {
                            newResultObject._lastModified = studentData._preservedData._lastModified;
                        }
                    }
                    appState.generatedResults.unshift(newResultObject);
                }

                // Mettre à jour la ligne avec l'animation Typewriter
                if (newResultObject) {
                    await ListViewManager.updateRow(resultId, newResultObject, true);
                }
            }

            if (!wasAborted) {
                const totalProcessed = studentsToProcess.length;
                let successMessage = `${totalProcessed - failedImports.length}/${totalProcessed} élèves traités.`;
                if (ignoredCount > 0) successMessage += ` ${ignoredCount} ligne(s) ignorée(s).`;

                if (failedImports.length > 0) {
                    UI.showNotification(`${failedImports.length} erreurs lors de la génération.`, 'warning');
                } else {
                    UI.showNotification(successMessage, 'success');
                }
                appState.importJustCompleted = true;
                if (DOM.massData) DOM.massData.value = '';
                UI.updateMassImportPreview();
            } else {
                // Notification d'annulation si pas déjà affichée
                UI.showNotification("Import annulé par l'utilisateur.", 'warning');
            }

        } catch (e) {
            console.error("Une erreur inattendue est survenue durant la génération:", e);
            UI.showNotification("Une erreur inattendue est survenue durant la génération.", 'error');
        } finally {
            // Hide progress and show errors if any
            const hasErrors = failedImports.length > 0;
            UI.hideHeaderProgress(hasErrors);
            this.massImportAbortController = null;

            Am.renderResults();

            // Émettre l'événement pour synchroniser l'UI (compteur, liste, stats)
            window.dispatchEvent(new CustomEvent('studentsUpdated'));
        }
    },

    cancelImport() {
        if (this.massImportAbortController) {
            this.massImportAbortController.abort();
        }
    },

    /**
     * Importe les élèves SANS génération IA
     * Crée des cartes "pending" qui pourront être générées plus tard
     * @param {Array} studentsToProcess - Liste des données élèves à importer
     * @param {number} ignoredCount - Nombre de lignes ignorées
     */
    async importStudentsOnly(studentsToProcess, ignoredCount) {

        let newCount = 0;
        let updatedCount = 0;

        for (const studentData of studentsToProcess) {
            const normalizedKey = Utils.normalizeName(studentData.nom, studentData.prenom);
            const currentClassId = appState.currentClassId;

            const existingResult = appState.generatedResults.find(r =>
                Utils.normalizeName(r.nom, r.prenom) === normalizedKey &&
                r.classId === currentClassId
            );

            if (existingResult) {
                const currentPeriod = appState.currentPeriod;
                if (!existingResult.studentData.periods) {
                    existingResult.studentData.periods = {};
                }
                existingResult.studentData.periods[currentPeriod] = studentData.periods[currentPeriod];
                existingResult.studentData.statuses = studentData.statuses || existingResult.studentData.statuses;

                // Sync root appreciation field to match imported period data
                const importedAppreciation = studentData.periods?.[currentPeriod]?.appreciation ?? '';
                existingResult.appreciation = importedAppreciation;

                // An imported appreciation is NOT AI-generated — reset the flag
                // so the AI icon is not shown for data that came from a PDF/manual import
                if (importedAppreciation) {
                    existingResult.wasGenerated = false;
                    existingResult.appreciationSource = 'imported';
                }

                updatedCount++;
            } else {
                const pendingResult = StudentDataManager.createPendingResult(studentData);
                appState.generatedResults.push(pendingResult);
                newCount++;
            }
        }

        await ClassManager._filterResultsByClass(appState.currentClassId);
        await StorageManager.saveAppState();

        Am?.renderResults?.();
        UI?.updateStats?.();
        UI?.updateControlButtons?.();

        let message = '';
        if (newCount > 0) message += `${newCount} élève(s) importé(s)`;
        if (updatedCount > 0) message += `${newCount > 0 ? ', ' : ''}${updatedCount} mis à jour`;
        if (ignoredCount > 0) message += ` (${ignoredCount} ignoré(s))`;

        UI?.showNotification(message || 'Import terminé', 'success');

        // Émettre l'événement pour synchroniser l'UI (compteur, liste, stats)
        window.dispatchEvent(new CustomEvent('studentsUpdated'));
    },

    /**
     * Génère les appréciations pour tous les élèves "pending" de la classe courante
     * Appelé par le bouton "Générer les appréciations" dans la toolbar
     */
    async generateAllPending() {
        // Récupérer les élèves en attente de la classe courante
        // CORRECTIF: Utiliser TOUS les élèves de la classe courante, pas seulement ceux filtrés/visibles
        // Le bouton affiche le nombre total (sourceResults), l'action doit correspondre.
        const currentClassId = appState.currentClassId;
        const sourceResults = currentClassId
            ? appState.generatedResults.filter(r => r.classId === currentClassId)
            : appState.generatedResults.filter(r => !r.classId);

        const pendingResults = sourceResults.filter(r => {
            const currentPeriod = appState.currentPeriod;
            const appRaw = r.studentData?.periods?.[currentPeriod]?.appreciation;
            const appCurrent = (r.studentData?.currentPeriod === currentPeriod) ? r.appreciation : null;
            const effectiveApp = appRaw || appCurrent;

            // Erreur bloquante uniquement si elle concerne la période actuelle
            const hasBlockingError = r.errorMessage && r.errorPeriod === currentPeriod;

            // Priorité au flag explicite
            if (r.isPending) return !hasBlockingError;

            // Si pas de contenu -> En attente
            if (!effectiveApp) return !hasBlockingError;

            // Nettoyage strict contenu vide
            const textOnly = effectiveApp.replace(/<[^>]*>/g, '').trim().toLowerCase();
            const isPlaceholder = textOnly === '' ||
                textOnly.includes('en attente') ||
                textOnly.includes('aucune appréciation') ||
                textOnly.includes('cliquez sur') ||
                textOnly.startsWith('remplissez');

            return isPlaceholder && !hasBlockingError;
        });

        if (pendingResults.length === 0) {
            UI?.showNotification('Aucun élève en attente de génération', 'info');
            return;
        }

        // Trier les résultats en attente selon l'ordre d'affichage actuel (tri visuel)
        const { field, direction, param } = appState.sortState || { field: 'name', direction: 'asc' };
        const dir = direction === 'asc' ? 1 : -1;
        const activePeriod = appState.currentPeriod;

        pendingResults.sort((a, b) => {
            if (field === 'recent') {
                return (new Date(b.timestamp) - new Date(a.timestamp)) * dir;
            }
            if (field === 'name') {
                return `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`) * dir;
            }
            if (field === 'grade') {
                const p = param || activePeriod;
                const gA = a.studentData?.periods?.[p]?.grade ?? -1;
                const gB = b.studentData?.periods?.[p]?.grade ?? -1;
                if (gA === -1 && gB !== -1) return 1;
                if (gA !== -1 && gB === -1) return -1;
                return (gA - gB) * dir;
            }
            if (field === 'evolution') {
                const p = param || activePeriod;
                const getRank = r => {
                    const e = Utils.getRelevantEvolution(r.evolutions, p);
                    return e ? { 'very-positive': 5, 'positive': 4, 'stable': 3, 'negative': 2, 'very-negative': 1 }[e.type] || 0 : 0;
                };
                return (getRank(a) - getRank(b)) * dir;
            }
            if (field === 'status') {
                const getStatusStr = r => {
                    if (r.errorMessage) return '!';
                    const statuses = r.studentData?.statuses || [];
                    if (statuses.length > 0) return statuses.slice().sort().join(' ').toLowerCase();
                    return '\uFFFF';
                };
                return getStatusStr(a).localeCompare(getStatusStr(b)) * dir;
            }
            return 0;
        });

        // Convertir les résultats pending en format étudiant pour processMassImport
        // IMPORTANT: Utiliser appState.currentPeriod (période AFFICHÉE) pour la génération
        // CRITICAL FIX: Preserve studentPhoto, journal and other user data
        const targetPeriod = appState.currentPeriod;
        const studentsToProcess = pendingResults.map(r => ({
            nom: r.nom,
            prenom: r.prenom,
            periods: r.studentData?.periods || {},
            statuses: r.studentData?.statuses || [],

            currentPeriod: targetPeriod,  // Toujours utiliser la période affichée
            // Garder référence à l'ID existant pour mise à jour
            existingId: r.id,
            // CRITICAL: Preserve user-added data
            _preservedData: {
                studentPhoto: r.studentPhoto,
                journal: r.journal,
                history: r.history,
                _lastModified: r._lastModified
            }
        }));

        // CRITICAL FIX: Do NOT delete existing results - let processMassImport update them in place
        // This preserves the studentPhoto and other user data
        // The old code was: appState.generatedResults = appState.generatedResults.filter(r => !pendingIds.has(r.id));

        // Utiliser processMassImport pour la génération avec UI de progression
        await this.processMassImport(studentsToProcess, 0);
    },

    /**
     * Crée des résultats en attente et rafraîchit la vue Liste
     * Si les étudiants ont un existingId, utilise les résultats existants au lieu d'en créer de nouveaux
     * @param {Array} students - Liste des élèves à traiter
     * @returns {Array} - Liste des IDs des résultats (existants ou créés)
     */
    _createPendingCards(students) {
        const resultIds = [];

        for (const studentData of students) {
            // CRITICAL FIX: If student has existingId (from generateAllPending), use existing result
            if (studentData.existingId) {
                const existingResult = appState.generatedResults.find(r => r.id === studentData.existingId);
                if (existingResult) {
                    // Mark as pending for skeleton animation
                    existingResult.isPending = true;
                    resultIds.push(existingResult.id);
                    continue;
                }
            }

            // No existing result - create new one
            const tempResult = Am.createResultObject(
                studentData.nom,
                studentData.prenom,
                '', // Pas encore d'appréciation
                [],
                studentData,
                {},
                {},
                null
            );

            // Marquer comme en attente
            tempResult.isPending = true;

            // CRITICAL: Restore preserved data if available
            if (studentData._preservedData) {
                if (studentData._preservedData.studentPhoto) {
                    tempResult.studentPhoto = studentData._preservedData.studentPhoto;
                }
                if (studentData._preservedData.journal) {
                    tempResult.journal = studentData._preservedData.journal;
                }
                if (studentData._preservedData.history) {
                    tempResult.history = studentData._preservedData.history;
                }
            }

            // Ajouter aux résultats globaux
            appState.generatedResults.push(tempResult);
            resultIds.push(tempResult.id);
        }

        // Liste + Focus: Appeler renderResults pour rafraîchir la vue tableau
        Am.renderResults();

        return resultIds;
    },

    /**
     * Met à jour un résultat après génération
     * Liste + Focus: Met à jour dans appState, le ListViewManager se charge du rendu
     * @param {string|HTMLElement} cardOrId - ID du résultat ou élément (compat)
     * @param {Object} resultObject - L'objet résultat avec l'appréciation
     * @param {boolean} hasError - Si la génération a échoué
     */
    async _updatePendingCard(cardOrId, resultObject, hasError) {
        // Liste + Focus: Trouver et mettre à jour le résultat dans appState
        const existingIndex = appState.generatedResults.findIndex(r =>
            r.nom === resultObject.nom && r.prenom === resultObject.prenom
        );

        if (existingIndex !== -1) {
            // Remplacer le résultat existant
            appState.generatedResults[existingIndex] = {
                ...resultObject,
                isPending: false
            };
        } else {
            resultObject.isPending = false;
            appState.generatedResults.push(resultObject);
        }

        // Note: renderResults() sera appelé en batch après traitement
    }
};


