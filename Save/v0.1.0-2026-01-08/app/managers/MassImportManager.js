import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import { TooltipsUI } from './TooltipsManager.js';
import { MODEL_SHORT_NAMES } from '../config/models.js';

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
            // Afficher l'estimation du temps total
            const estimate = RateLimiter.estimateTime(studentsToProcess.length);
            UI.showNotification(
                `Génération de ${studentsToProcess.length} élèves (~${estimate.totalMinutes} min avec rate limiting)`,
                'info'
            );

            UI.updateOutputProgress(0, studentsToProcess.length, `Démarrage... (~${estimate.totalMinutes} min)`);

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

                // Trigger skeleton animation on the row
                const { ListViewManager } = await import('./ListViewManager.js');
                ListViewManager.setRowStatus(resultId, 'generating');

                let newResultObject;
                let hasError = false;

                try {
                    // Attendre le délai approprié AVANT la requête (rate limiting préventif)
                    if (index > 0) {
                        const waitTime = RateLimiter.getWaitTime(appState.currentAIModel);
                        if (waitTime > 0) {
                            const remaining = studentsToProcess.length - index;
                            const estimate = RateLimiter.estimateTime(remaining);
                            UI.updateOutputProgress(
                                index,
                                studentsToProcess.length,
                                `⏱️ Pause ${RateLimiter.formatTime(waitTime)} (~${estimate.totalMinutes} min restantes)`
                            );
                        }
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
                        const waitTime = retryAfter || 30000; // 30s par défaut

                        UI.showNotification(
                            `Quota atteint, reprise dans ${RateLimiter.formatTime(waitTime)}...`,
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
                    existingResult.studentData.negativeInstructions = newResultObject.studentData.negativeInstructions;
                    existingResult.studentData.statuses = newResultObject.studentData.statuses;
                    existingResult.timestamp = newResultObject.timestamp;
                    existingResult.errorMessage = newResultObject.errorMessage;
                    existingResult.evolutions = newResultObject.evolutions;
                    existingResult.tokenUsage = newResultObject.tokenUsage;
                    existingResult.studentData.prompts = newResultObject.studentData.prompts;
                    // Reset pending flag
                    existingResult.isPending = false;

                } else {
                    newResultObject.isPending = false;
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
            UI.hideHeaderProgress(hasErrors, failedImports.length);
            this.massImportAbortController = null;

            Am.renderResults();
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
        const { StudentDataManager } = await import('./StudentDataManager.js');
        const { StorageManager } = await import('./StorageManager.js');
        const { ClassManager } = await import('./ClassManager.js');

        // Compteurs
        let newCount = 0;
        let updatedCount = 0;

        for (const studentData of studentsToProcess) {
            const normalizedKey = Utils.normalizeName(studentData.nom, studentData.prenom);
            const currentClassId = appState.currentClassId;

            // CORRECTIF: Chercher seulement dans la classe courante
            const existingResult = appState.generatedResults.find(r =>
                Utils.normalizeName(r.nom, r.prenom) === normalizedKey &&
                r.classId === currentClassId
            );

            if (existingResult) {
                // Mettre à jour les données existantes (fusionner les périodes)
                const currentPeriod = appState.currentPeriod;
                if (!existingResult.studentData.periods) {
                    existingResult.studentData.periods = {};
                }
                existingResult.studentData.periods[currentPeriod] = studentData.periods[currentPeriod];
                existingResult.studentData.statuses = studentData.statuses || existingResult.studentData.statuses;
                // Les évolutions seront recalculées lors de la génération
                updatedCount++;
            } else {
                // Créer un nouvel élève en attente
                const pendingResult = StudentDataManager.createPendingResult(studentData);
                appState.generatedResults.push(pendingResult);
                newCount++;
            }
        }

        // Filtrer par classe et sauvegarder
        await ClassManager._filterResultsByClass(appState.currentClassId);
        await StorageManager.saveAppState();

        // Rafraîchir l'affichage
        Am?.renderResults?.();
        UI?.updateStats?.();
        UI?.updateControlButtons?.();

        // Notification de succès
        let message = '';
        if (newCount > 0) message += `${newCount} élève(s) importé(s)`;
        if (updatedCount > 0) message += `${newCount > 0 ? ', ' : ''}${updatedCount} mis à jour`;
        if (ignoredCount > 0) message += ` (${ignoredCount} ignoré(s))`;

        UI?.showNotification(message || 'Import terminé', 'success');
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
            const hasBlockingError = r.errorMessage && r.studentData?.currentPeriod === currentPeriod;

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

        // Convertir les résultats pending en format étudiant pour processMassImport
        // IMPORTANT: Utiliser appState.currentPeriod (période AFFICHÉE) pour la génération
        const targetPeriod = appState.currentPeriod;
        const studentsToProcess = pendingResults.map(r => ({
            nom: r.nom,
            prenom: r.prenom,
            periods: r.studentData?.periods || {},
            statuses: r.studentData?.statuses || [],
            negativeInstructions: r.studentData?.negativeInstructions || '',
            currentPeriod: targetPeriod,  // Toujours utiliser la période affichée
            // Garder référence à l'ID existant pour mise à jour
            existingId: r.id
        }));

        // Supprimer les résultats pending (ils seront recréés avec l'appréciation)
        const pendingIds = new Set(pendingResults.map(r => r.id));
        appState.generatedResults = appState.generatedResults.filter(r => !pendingIds.has(r.id));

        // Utiliser processMassImport pour la génération avec UI de progression
        await this.processMassImport(studentsToProcess, 0);
    },

    /**
     * Crée des résultats en attente et rafraîchit la vue Liste
     * Liste + Focus: Ne crée plus de cartes DOM, utilise ListViewManager via renderResults
     * @param {Array} students - Liste des élèves à traiter
     * @returns {Array} - Liste des IDs des résultats créés
     */
    _createPendingCards(students) {
        const createdIds = [];

        for (const studentData of students) {
            // Créer un objet résultat temporaire marqué comme "pending"
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

            // Ajouter aux résultats globaux
            appState.generatedResults.push(tempResult);
            createdIds.push(tempResult.id);
        }

        // Liste + Focus: Appeler renderResults pour rafraîchir la vue tableau
        // Le ListViewManager affichera les élèves avec statut "En attente"
        Am.renderResults();

        return createdIds;
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


