import { appState, userSettings } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { DBService } from '../services/DBService.js';

export const StudentDataManager = {
    createResultObject(nom, prenom, appreciation, evolutions, studentData, prompts, tokenUsage, errorMessage = null, modelUsed = null) {
        const newStudentData = JSON.parse(JSON.stringify(studentData));

        if (newStudentData.periods[newStudentData.currentPeriod]) {
            newStudentData.periods[newStudentData.currentPeriod].appreciation = appreciation;
        }

        return {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
            nom, prenom, appreciation, evolutions,
            // Associer à la classe courante pour le multi-classes
            classId: userSettings.academic.currentClassId || null,
            studentData: {
                ...newStudentData,
                currentPeriod: appState.currentPeriod,
                subject: appState.useSubjectPersonalization ? appState.currentSubject : 'Générique',
                currentAIModel: modelUsed || appState.currentAIModel,
                prompts: prompts || { appreciation: null, sw: null, ns: null }
            },
            errorMessage,
            timestamp: new Date().toISOString(),
            strengthsWeaknesses: null,
            nextSteps: null,
            tokenUsage: tokenUsage || { appreciation: null, sw: null, ns: null },
            copied: false,
            // Student photo data (base64)
            studentPhoto: null,
            // Snapshot des données au moment de la génération (pour détection dirty status)
            generationSnapshot: Utils.deepClone(newStudentData),
            // Full journal at generation time (for granular dirty comparison)
            generationSnapshotJournal: [],
            // Journal entry count at generation time (legacy, for backward compat)
            generationSnapshotJournalCount: 0,
            // Threshold used at generation time (for journal dirty detection)
            generationThreshold: appState.journalThreshold ?? 2,
            // Period for which the generation was made (for per-period dirty detection)
            generationPeriod: appState.currentPeriod,
            // Historique des versions précédentes (max 5)
            history: [],
            // Flag pour indiquer si le résultat vient d'être généré par l'IA (vs import ou erreur)
            wasGenerated: !errorMessage
        };
    },

    /**
     * Transfère les métadonnées de génération d'un nouveau résultat vers un existant
     * Utilisé par MassImportManager et SingleStudentManager pour éviter la duplication
     * 
     * @param {Object} existingResult - Le résultat existant à mettre à jour
     * @param {Object} newResult - Le nouveau résultat avec les métadonnées à transférer
     */
    transferGenerationMetadata(existingResult, newResult) {
        existingResult.wasGenerated = newResult.wasGenerated;
        existingResult.generationSnapshot = newResult.generationSnapshot;
        existingResult.generationPeriod = newResult.generationPeriod;
        existingResult.generationSnapshotJournal = newResult.generationSnapshotJournal;
        existingResult.generationSnapshotJournalCount = newResult.generationSnapshotJournalCount;
        existingResult.generationThreshold = newResult.generationThreshold;
    },

    /**
     * Met à jour un résultat existant avec de nouvelles données générées par l'IA
     * PRÉSERVE les données utilisateur : studentPhoto, journal, history, _lastModified
     * 
     * @param {Object} existingResult - Le résultat existant à mettre à jour
     * @param {Object} newResult - Le nouveau résultat généré (de createResultObject)
     * @returns {Object} - Le résultat mis à jour (même référence que existingResult)
     */
    updateResult(existingResult, newResult) {
        // Sauvegarder les données utilisateur qui doivent être préservées
        const preserved = {
            id: existingResult.id,
            studentPhoto: existingResult.studentPhoto,
            journal: existingResult.journal,
            history: existingResult.history,
            _lastModified: existingResult._lastModified,
            _manualEdits: existingResult._manualEdits
        };

        // Copier toutes les nouvelles propriétés générées
        existingResult.appreciation = newResult.appreciation;
        existingResult.evolutions = newResult.evolutions;
        existingResult.errorMessage = newResult.errorMessage;
        existingResult.timestamp = newResult.timestamp;
        existingResult.tokenUsage = newResult.tokenUsage;
        existingResult.copied = false;
        existingResult.wasGenerated = newResult.wasGenerated;
        existingResult.isPending = false;
        existingResult.generationSnapshot = newResult.generationSnapshot;
        existingResult.generationSnapshotJournal = Utils.deepClone(preserved.journal || []);
        existingResult.generationSnapshotJournalCount = preserved.journal?.length || 0;
        existingResult.generationThreshold = newResult.generationThreshold ?? appState.journalThreshold ?? 2;
        existingResult.generationPeriod = newResult.generationPeriod;

        // Mettre à jour studentData
        if (newResult.studentData) {
            Object.assign(existingResult.studentData.periods, newResult.studentData.periods);
            existingResult.studentData.currentPeriod = newResult.studentData.currentPeriod;
            existingResult.studentData.subject = newResult.studentData.subject;
            existingResult.studentData.currentAIModel = newResult.studentData.currentAIModel;
            existingResult.studentData.prompts = newResult.studentData.prompts;
            existingResult.studentData.statuses = newResult.studentData.statuses;
        }

        // Restaurer les données utilisateur préservées
        existingResult.id = preserved.id;
        existingResult.studentPhoto = preserved.studentPhoto;
        existingResult.journal = preserved.journal;
        existingResult.history = preserved.history;
        if (preserved._lastModified) existingResult._lastModified = preserved._lastModified;
        if (preserved._manualEdits) existingResult._manualEdits = preserved._manualEdits;

        return existingResult;
    },

    /**
     * Crée un objet résultat "en attente" - sans appréciation générée
     * Utilisé pour l'import de données sans génération IA immédiate
     * 
     * Note: isPending is set to false if an appreciation already exists
     * for the current period in the imported data.
     */
    createPendingResult(studentData) {
        const newStudentData = JSON.parse(JSON.stringify(studentData));
        const currentPeriod = appState.currentPeriod;

        // Check if appreciation already exists for current period
        const existingAppreciation = studentData.periods?.[currentPeriod]?.appreciation;
        const hasAppreciation = existingAppreciation && existingAppreciation.trim().length > 0;

        return {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
            nom: studentData.nom,
            prenom: studentData.prenom,
            // Use existing appreciation if available for current period
            appreciation: hasAppreciation ? existingAppreciation : null,
            evolutions: [], // Calculées lors de la génération
            // Associer à la classe courante
            classId: userSettings.academic.currentClassId || null,
            // Only mark as pending if NO appreciation exists for current period
            isPending: !hasAppreciation,
            studentData: {
                ...newStudentData,
                currentPeriod: currentPeriod,
                subject: appState.useSubjectPersonalization ? appState.currentSubject : 'Générique',
                prompts: { appreciation: null, sw: null, ns: null }
            },
            errorMessage: null,
            timestamp: new Date().toISOString(),
            strengthsWeaknesses: null,
            nextSteps: null,
            tokenUsage: { appreciation: null, sw: null, ns: null },
            copied: false,
            // Student photo data (base64)
            studentPhoto: null,
            wasGenerated: false,
            history: []
        };
    },

    _prepareStudentListForImport(lines, formatMap, importMode) {
        const importPreviewData = {
            newStudents: [], updatedStudents: [], departedStudents: [],
            studentsToProcess: [], ignoredCount: 0
        };

        // IMPORTANT: Filter by CURRENT CLASS only to avoid showing "update" for students from other classes
        const currentClassId = userSettings.academic.currentClassId || null;
        const currentClassResults = appState.generatedResults.filter(r =>
            !currentClassId || r.classId === currentClassId
        );

        const existingStudentsMap = new Map(currentClassResults.map(r => [Utils.normalizeName(r.nom, r.prenom), r]));
        const importedStudentsMap = new Map();

        lines.forEach(line => {
            const studentData = Utils.parseStudentLine(line, formatMap, appState.currentPeriod);
            if (studentData) {
                importedStudentsMap.set(Utils.normalizeName(studentData.nom, studentData.prenom), studentData);
            } else {
                importPreviewData.ignoredCount++;
            }
        });

        // If no existing students in current class, ALL imported students are "new"
        const hasExistingStudents = existingStudentsMap.size > 0;

        if (importMode === 'replace' || !hasExistingStudents) {
            // Replace mode OR empty class: all are new
            importPreviewData.studentsToProcess = Array.from(importedStudentsMap.values());
            importPreviewData.newStudents = importPreviewData.studentsToProcess.map(s => ({ nom: s.nom, prenom: s.prenom }));
            importPreviewData.updatedStudents = [];

            // Only show departures if we're replacing AND there were existing students
            if (importMode === 'replace' && hasExistingStudents) {
                existingStudentsMap.forEach((result, key) => {
                    if (!importedStudentsMap.has(key)) {
                        importPreviewData.departedStudents.push({ nom: result.nom, prenom: result.prenom });
                    }
                });
            }
        } else {
            // Merge mode with existing students
            importedStudentsMap.forEach((importedData, key) => {
                const existingResult = existingStudentsMap.get(key);
                if (!existingResult) {
                    const periods = Utils.getPeriods();
                    const currentPeriodIndex = periods.indexOf(appState.currentPeriod);
                    const hasDataInPreviousPeriods = periods.slice(0, currentPeriodIndex).some(p => {
                        const periodData = importedData.periods[p];
                        return periodData && (typeof periodData.grade === 'number' || periodData.appreciation);
                    });

                    if (currentPeriodIndex > 0 && !hasDataInPreviousPeriods && importedData.statuses.length === 0) {
                        importedData.statuses.push(`Nouveau ${appState.currentPeriod}`);
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
     * Supprime un élève et enregistre un tombstone pour la synchro
     * @param {string} id - ID de l'élève
     */
    async deleteStudent(id) {
        const student = appState.generatedResults.find(r => r.id === id);
        if (!student) return false;

        // Filtrer l'état
        appState.generatedResults = appState.generatedResults.filter(r => r.id !== id);
        appState.filteredResults = appState.filteredResults.filter(r => r.id !== id);

        // Supprimer immédiatement d'IndexedDB (putAll ne fait plus de clear)
        DBService.delete('generatedResults', id);

        // Enregistrer le tombstone pour la synchro cloud
        try {
            const { runtimeState } = await import('../state/State.js');
            if (!runtimeState.data.deletedItems) {
                runtimeState.data.deletedItems = { students: [], classes: [] };
            }
            runtimeState.data.deletedItems.students.push({
                id: id,
                classId: student.classId || student.studentData?.classId,
                deletedAt: Date.now()
            });
        } catch (e) {
            console.warn('[StudentDataManager] Erreur tombstone:', e);
        }

        return true;
    },

    /**
     * Efface l'appréciation d'un élève pour la période actuelle
     * @param {string} id - ID de l'élève
     */
    clearStudentAppreciation(id) {
        const student = appState.generatedResults.find(r => r.id === id);
        if (!student) return false;

        const currentPeriod = appState.currentPeriod;

        // Clear in main object
        student.appreciation = '';

        // Clear in periods data
        if (student.studentData?.periods?.[currentPeriod]) {
            student.studentData.periods[currentPeriod].appreciation = '';
        }

        // Reset history if desired? No, let's keep it but mark changed
        student._lastModified = Date.now();

        return true;
    }
};
