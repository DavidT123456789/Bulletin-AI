import { appState, userSettings } from '../state/State.js';
import { Utils } from '../utils/Utils.js';

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
                negativeInstructions: studentData.negativeInstructions || '',
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
            // Journal entry count at generation time (journal is on result, not studentData)
            generationSnapshotJournalCount: 0,
            // Period for which the generation was made (for per-period dirty detection)
            generationPeriod: appState.currentPeriod,
            // Historique des versions précédentes (max 5)
            history: [],
            // Flag pour indiquer si le résultat vient d'être généré par l'IA (vs import ou erreur)
            wasGenerated: !errorMessage
        };
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
                negativeInstructions: studentData.negativeInstructions || '',
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
    }
};
