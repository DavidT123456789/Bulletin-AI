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
            // Historique des versions précédentes (max 5)
            history: []
        };
    },

    /**
     * Crée un objet résultat "en attente" - sans appréciation générée
     * Utilisé pour l'import de données sans génération IA immédiate
     */
    createPendingResult(studentData) {
        const newStudentData = JSON.parse(JSON.stringify(studentData));

        return {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
            nom: studentData.nom,
            prenom: studentData.prenom,
            appreciation: null,  // Pas encore d'appréciation
            evolutions: [], // Calculées lors de la génération
            // Associer à la classe courante
            classId: userSettings.academic.currentClassId || null,
            // Flag pour identifier les cartes en attente de génération
            isPending: true,
            studentData: {
                ...newStudentData,
                currentPeriod: appState.currentPeriod,
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
            history: []
        };
    },

    _prepareStudentListForImport(lines, formatMap, importMode) {
        const importPreviewData = {
            newStudents: [], updatedStudents: [], departedStudents: [],
            studentsToProcess: [], ignoredCount: 0
        };

        const existingStudentsMap = new Map(appState.generatedResults.map(r => [Utils.normalizeName(r.nom, r.prenom), r]));
        const importedStudentsMap = new Map();

        lines.forEach(line => {
            const studentData = Utils.parseStudentLine(line, formatMap, appState.currentPeriod);
            if (studentData) {
                importedStudentsMap.set(Utils.normalizeName(studentData.nom, studentData.prenom), studentData);
            } else {
                importPreviewData.ignoredCount++;
            }
        });

        if (importMode === 'replace') {
            importPreviewData.studentsToProcess = Array.from(importedStudentsMap.values());
            // Utiliser des objets simplifiés {nom, prenom} pour l'affichage cohérent
            importPreviewData.newStudents = importPreviewData.studentsToProcess.map(s => ({ nom: s.nom, prenom: s.prenom }));
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
