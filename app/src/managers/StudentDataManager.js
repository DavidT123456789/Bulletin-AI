import { appState, userSettings, runtimeState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { DBService } from '../services/DBService.js';
import { PromptService } from '../services/PromptService.js';

export const StudentDataManager = {
    createResultObject(nom, prenom, appreciation, evolutions, studentData, prompts, tokenUsage, errorMessage = null, modelUsed = null) {
        const newStudentData = Utils.deepClone(studentData);

        if (newStudentData.periods[newStudentData.currentPeriod]) {
            newStudentData.periods[newStudentData.currentPeriod].appreciation = appreciation;
        }

        const result = {
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
            errorPeriod: errorMessage ? appState.currentPeriod : null,
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
            wasGenerated: !errorMessage,
            // Source explicite de l'appréciation : 'ai' | 'manual' | 'imported'
            appreciationSource: errorMessage ? null : 'ai'
        };

        this.enrichWithExistingProfile(result, result.classId);
        return result;
    },

    _isDemoClass(cls) {
        if (!cls) return false;
        return cls.isDemo === true || cls.name?.toLowerCase() === 'classe exemple';
    },

    /**
     * Recherche un profil existant pour le même élève dans les autres classes (hors démo)
     * afin de mutualiser photo, statuts pédagogiques et classe d'origine.
     *
     * @param {string} nom - Nom de l'élève
     * @param {string} prenom - Prénom de l'élève
     * @param {string|null} [excludeClassId=null] - ID de la classe à exclure (classe cible)
     * @returns {Object|null} Profil consolidé { studentPhoto, statuses, originClass, sourceStudent } ou null
     */
    findExistingStudentProfile(nom, prenom, excludeClassId = null) {
        const targetKey = Utils.getStudentIdentityKey(nom, prenom);
        if (!targetKey) return null;

        const allResults = appState.generatedResults || [];
        const classes = userSettings?.academic?.classes || [];
        const classMap = new Map(classes.map(c => [c.id, c]));
        const isDemoClassId = (classId) => Boolean(classId && this._isDemoClass(classMap.get(classId)));

        const matches = allResults.filter(r => {
            if (!r) return false;
            if (excludeClassId && r.classId === excludeClassId) return false;
            if (isDemoClassId(r.classId)) return false;
            return Utils.getStudentIdentityKey(r.nom, r.prenom) === targetKey;
        });

        if (matches.length === 0) return null;

        // Prioriser les fiches principales (non copiées)
        matches.sort((a, b) => Number(Boolean(a.isCopiedProfile)) - Number(Boolean(b.isCopiedProfile)));

        let studentPhoto = null;
        let statuses = [];
        let originClass = '';

        for (const match of matches) {
            if (!studentPhoto && match.studentPhoto?.data) {
                studentPhoto = match.studentPhoto;
            }
            if (statuses.length === 0 && Array.isArray(match.studentData?.statuses) && match.studentData.statuses.length > 0) {
                statuses = match.studentData.statuses.filter(
                    s => typeof s === 'string' && !/^(Nouveau|Départ)\b/i.test(s.trim())
                );
            }
            if (!originClass) {
                const explicitOrigin = (match.studentData?.classe || match.classe || match.originClass || '').trim();
                if (explicitOrigin) {
                    originClass = explicitOrigin;
                } else if (match.classId) {
                    const sourceClass = classMap.get(match.classId);
                    if (sourceClass?.name && !Utils.isGroupClassName(sourceClass.name)) {
                        originClass = sourceClass.name.trim();
                    }
                }
            }
        }

        // Fallback : si aucune classe non-groupe n'a été trouvée, utiliser le nom de la classe source
        if (!originClass && matches[0]?.classId) {
            const fallbackClass = classMap.get(matches[0].classId);
            if (fallbackClass?.name) {
                originClass = fallbackClass.name.trim();
            }
        }

        return {
            studentPhoto,
            statuses,
            originClass,
            sourceStudent: matches[0]
        };
    },

    /**
     * Enrichit automatiquement une nouvelle fiche élève avec les données transversales
     * (photo, statuts, classe d'origine) si cet élève existe déjà dans une autre classe.
     *
     * @param {Object} result - Nouvel objet élève
     * @param {string|null} [targetClassId=null] - ID de la classe cible
     * @returns {Object} L'objet élève enrichi
     */
    enrichWithExistingProfile(result, targetClassId = null) {
        if (!result) return result;
        const effectiveClassId = targetClassId ?? result.classId ?? userSettings?.academic?.currentClassId ?? null;
        const profile = this.findExistingStudentProfile(result.nom, result.prenom, effectiveClassId);
        if (!profile) return result;

        if (!result.studentPhoto && profile.studentPhoto) {
            result.studentPhoto = Utils.deepClone(profile.studentPhoto);
        }

        if (result.studentData) {
            const currentStatuses = Array.isArray(result.studentData.statuses) ? result.studentData.statuses : [];
            if (currentStatuses.length === 0 && profile.statuses.length > 0) {
                result.studentData.statuses = Utils.deepClone(profile.statuses);
            }
        }

        if (profile.originClass) {
            const classes = userSettings?.academic?.classes || [];
            const targetClass = effectiveClassId ? classes.find(c => c.id === effectiveClassId) : null;
            const normTarget = targetClass?.name ? Utils.normalizeClassName(targetClass.name) : '';
            const normOrigin = Utils.normalizeClassName(profile.originClass);

            if (!normTarget || normOrigin !== normTarget) {
                const existingOrigin = (result.studentData?.classe || result.classe || result.originClass || '').trim();
                if (!existingOrigin) {
                    result.originClass = profile.originClass;
                    if (result.studentData) {
                        result.studentData.classe = profile.originClass;
                    }
                }
                result.isCopiedProfile = true;
            }
        }

        return result;
    },

    /**
     * Copie un ou plusieurs élèves existants vers une classe/groupe cible.
     * Crée des fiches vierges (en attente) dans la classe cible tout en conservant
     * leur identité, photo, statuts pédagogiques et classe d'origine.
     *
     * @param {string|Array<string>} studentIds - ID(s) des élèves sources
     * @param {string} targetClassId - ID de la classe cible
     * @returns {{ copiedStudents: Array<Object>, copiedCount: number, skippedCount: number }}
     */
    copyStudentsToClass(studentIds, targetClassId) {
        const ids = Array.isArray(studentIds) ? studentIds : [studentIds];
        if (!targetClassId || ids.length === 0) {
            return { copiedStudents: [], copiedCount: 0, skippedCount: 0 };
        }

        const allResults = appState.generatedResults || [];
        const classes = userSettings?.academic?.classes || [];
        const classMap = new Map(classes.map(c => [c.id, c]));
        const targetClass = classMap.get(targetClassId);
        const normTargetName = targetClass?.name ? Utils.normalizeClassName(targetClass.name) : '';

        // Indexation en une passe : recherche par ID O(1), clés déjà dans la cible O(1) et photos existantes hors démo
        const resultsById = new Map();
        const targetExistingKeys = new Set();
        const photoByKey = new Map();
        for (const r of allResults) {
            if (!r) continue;
            if (r.id) resultsById.set(r.id, r);
            const rKey = Utils.getStudentIdentityKey(r.nom, r.prenom) || Utils.normalizeName(r.nom, r.prenom);
            if (r.classId === targetClassId) {
                targetExistingKeys.add(rKey);
            }
            if (r.studentPhoto?.data && !photoByKey.has(rKey)) {
                const cls = r.classId ? classMap.get(r.classId) : null;
                if (cls && !this._isDemoClass(cls)) {
                    photoByKey.set(rKey, r.studentPhoto);
                }
            }
        }

        // Dédupliquer les élèves sources par identité normalisée (en privilégiant la fiche principale)
        const uniqueSources = new Map();
        for (const id of ids) {
            const student = resultsById.get(id);
            if (!student) continue;
            const key = Utils.getStudentIdentityKey(student.nom, student.prenom) || Utils.normalizeName(student.nom, student.prenom);
            if (!uniqueSources.has(key) || (!student.isCopiedProfile && uniqueSources.get(key).isCopiedProfile)) {
                uniqueSources.set(key, student);
            }
        }

        const copiedStudents = [];
        let skippedCount = 0;

        uniqueSources.forEach((sourceStudent, normalizedKey) => {
            if (targetExistingKeys.has(normalizedKey)) {
                skippedCount++;
                return;
            }

            // Déterminer la classe d'origine à afficher en badge dans le nouveau groupe
            const explicitOrigin = (sourceStudent.studentData?.classe || sourceStudent.classe || sourceStudent.originClass || '').trim();
            const sourceClass = sourceStudent.classId ? classMap.get(sourceStudent.classId) : null;
            let originClass = explicitOrigin || (sourceClass?.name || '').trim();

            if (originClass && normTargetName && Utils.normalizeClassName(originClass) === normTargetName) {
                originClass = '';
            }

            const statuses = Array.isArray(sourceStudent.studentData?.statuses)
                ? sourceStudent.studentData.statuses.filter(s => typeof s === 'string' && !/^(Nouveau|Départ)\b/i.test(s.trim()))
                : [];

            const newStudent = this.createPendingResult({
                nom: sourceStudent.nom,
                prenom: sourceStudent.prenom,
                classe: originClass || undefined,
                statuses: Utils.deepClone(statuses),
                periods: {}
            }, targetClassId, { enrichProfile: false });

            newStudent.classId = targetClassId;
            newStudent.isCopiedProfile = true;
            newStudent._lastModified = Date.now();

            if (originClass) {
                newStudent.originClass = originClass;
                if (newStudent.studentData) {
                    newStudent.studentData.classe = originClass;
                }
            }

            const photoToCopy = sourceStudent.studentPhoto?.data ? sourceStudent.studentPhoto : photoByKey.get(normalizedKey);
            if (photoToCopy) {
                newStudent.studentPhoto = Utils.deepClone(photoToCopy);
            }

            targetExistingKeys.add(normalizedKey);
            allResults.push(newStudent);
            copiedStudents.push(newStudent);
        });

        return {
            copiedStudents,
            copiedCount: copiedStudents.length,
            skippedCount
        };
    },

    /**
     * Transfère les métadonnées de génération d'un nouveau résultat vers un existant
     * Utilisé par MassImportManager pour éviter la duplication
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

        // Use provided hash, or auto-compute from finalized studentData
        if (newResult.promptHash) {
            existingResult.promptHash = newResult.promptHash;
        } else if (existingResult.studentData) {
            try {
                existingResult.promptHash = PromptService.getPromptHash({
                    ...existingResult.studentData,
                    id: existingResult.id,
                    currentPeriod: existingResult.generationPeriod || existingResult.studentData?.currentPeriod
                });
            } catch (_) { /* non-critical */ }
        }
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
            historyPerPeriod: existingResult.historyPerPeriod,
            _lastModified: existingResult._lastModified,
            _manualEdits: existingResult._manualEdits
        };

        // Copier toutes les nouvelles propriétés générées
        existingResult.appreciation = newResult.appreciation;
        existingResult.evolutions = newResult.evolutions;
        existingResult.errorMessage = newResult.errorMessage;
        existingResult.errorPeriod = newResult.errorPeriod ?? (newResult.errorMessage ? appState.currentPeriod : null);
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
        existingResult.promptHash = newResult.promptHash ?? existingResult.promptHash;

        // Mettre à jour studentData
        if (newResult.studentData) {
            for (const periodKey in newResult.studentData.periods) {
                if (Object.prototype.hasOwnProperty.call(newResult.studentData.periods, periodKey)) {
                    if (!existingResult.studentData.periods[periodKey]) {
                        existingResult.studentData.periods[periodKey] = {};
                    }
                    Object.assign(existingResult.studentData.periods[periodKey], newResult.studentData.periods[periodKey]);
                }
            }
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
        if (preserved.historyPerPeriod) existingResult.historyPerPeriod = preserved.historyPerPeriod;
        if (preserved._lastModified) existingResult._lastModified = preserved._lastModified;
        if (preserved._manualEdits) existingResult._manualEdits = preserved._manualEdits;

        // Auto-compute prompt hash AFTER all data is finalized
        if (!newResult.promptHash && existingResult.studentData) {
            try {
                existingResult.promptHash = PromptService.getPromptHash({
                    ...existingResult.studentData,
                    id: existingResult.id,
                    currentPeriod: existingResult.generationPeriod || appState.currentPeriod
                });
            } catch (_) { /* non-critical */ }
        }

        return existingResult;
    },

    /**
     * Crée un objet résultat "en attente" - sans appréciation générée
     * Utilisé pour l'import de données sans génération IA immédiate
     * 
     * Note: isPending is set to false if an appreciation already exists
     * for the current period in the imported data.
     */
    createPendingResult(studentData, targetClassId = null, { enrichProfile = true } = {}) {
        const newStudentData = Utils.deepClone(studentData);
        const currentPeriod = appState.currentPeriod;
        const effectiveClassId = targetClassId || userSettings.academic.currentClassId || appState.currentClassId || null;

        // Check if appreciation already exists for current period
        const existingAppreciation = studentData.periods?.[currentPeriod]?.appreciation;
        const hasAppreciation = existingAppreciation && existingAppreciation.trim().length > 0;

        const result = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
            nom: studentData.nom,
            prenom: studentData.prenom,
            // Use existing appreciation if available for current period
            appreciation: hasAppreciation ? existingAppreciation : null,
            evolutions: [], // Calculées lors de la génération
            // Associer à la classe courante
            classId: effectiveClassId,
            // Only mark as pending if NO appreciation exists for current period
            isPending: !hasAppreciation,
            studentData: {
                ...newStudentData,
                statuses: Array.isArray(newStudentData.statuses) ? newStudentData.statuses : [],
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
            // Source : 'imported' si une appréciation est déjà présente (depuis fichier), null sinon
            appreciationSource: hasAppreciation ? 'imported' : null,
            history: []
        };

        // Enrichir avec photo, statuts et classe d'origine si l'élève existe déjà dans une autre classe
        if (enrichProfile) {
            this.enrichWithExistingProfile(result, effectiveClassId);
        }

        // Compute promptHash baseline if appreciation is imported
        if (hasAppreciation) {
            result.generationPeriod = currentPeriod;
            try {
                result.promptHash = PromptService.getPromptHash({
                    ...result.studentData,
                    id: result.id,
                    currentPeriod: currentPeriod
                });
            } catch (_) { /* non-critical */ }
        }

        return result;
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
                        if (!periodData) return false;
                        const gradeRaw = periodData.grade;
                        const gradeVal = typeof gradeRaw === 'number' ? gradeRaw : parseFloat(String(gradeRaw || '').replace(',', '.'));
                        return (!isNaN(gradeVal)) || periodData.appreciation;
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
                const alreadyDeparted = Utils.isStudentDeparted(result, appState.currentPeriod);
                if (!importedStudentsMap.has(key) && !alreadyDeparted) {
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
        if (!id || !Array.isArray(appState.generatedResults)) return false;
        const student = appState.generatedResults.find(r => r.id === id);
        if (!student) return false;

        // Filtrer l'état
        appState.generatedResults = appState.generatedResults.filter(r => r.id !== id);
        if (Array.isArray(appState.filteredResults)) {
            appState.filteredResults = appState.filteredResults.filter(r => r.id !== id);
        }

        // Enregistrer le tombstone pour la synchro cloud
        try {
            if (runtimeState?.data) {
                if (!runtimeState.data.deletedItems) {
                    runtimeState.data.deletedItems = { students: [], classes: [] };
                }
                runtimeState.data.deletedItems.students.push({
                    id: id,
                    classId: student.classId || student.studentData?.classId,
                    deletedAt: Date.now()
                });
            }
        } catch (e) {
            console.warn('[StudentDataManager] Erreur tombstone:', e);
        }

        // Supprimer immédiatement d'IndexedDB (putAll ne fait plus de clear)
        try {
            await DBService.delete('generatedResults', id);
        } catch (e) {
            console.warn('[StudentDataManager] Erreur suppression IndexedDB:', e);
        }

        return true;
    },

    /**
     * Retourne la liste des autres classes ou groupes (hors démo) dans lesquels
     * le même élève possède une fiche distincte.
     *
     * @param {string|Object} studentOrId - ID de la fiche ou objet élève
     * @returns {Array<{ studentId: string, classId: string, className: string, displayName: string, isGroup: boolean }>}
     */
    getOtherEnrollments(studentOrId) {
        if (!studentOrId) return [];
        const allResults = appState.generatedResults || [];
        const student = typeof studentOrId === 'string'
            ? allResults.find(r => r?.id === studentOrId)
            : studentOrId;
        if (!student) return [];

        const classes = userSettings?.academic?.classes || appState?.classes || [];
        const classMap = new Map(classes.map(c => [c.id, c]));
        const isDemoClassId = (classId) => Boolean(classId && this._isDemoClass(classMap.get(classId)));

        if (isDemoClassId(student.classId)) return [];

        const targetKey = Utils.getStudentIdentityKey(student.nom, student.prenom);
        if (!targetKey) return [];

        const seenClassIds = new Set();
        const enrollments = [];

        for (const r of allResults) {
            if (!r || r.id === student.id) continue;
            if (!r.classId || r.classId === student.classId) continue;
            if (isDemoClassId(r.classId) || seenClassIds.has(r.classId)) continue;
            if (Utils.getStudentIdentityKey(r.nom, r.prenom) !== targetKey) continue;

            seenClassIds.add(r.classId);
            const cls = classMap.get(r.classId);
            const rawName = (cls?.name || '').trim();
            const displayName = rawName ? Utils.formatClassDisplayName(rawName) : 'Autre classe';
            const isGroup = Boolean(cls?.isGroup || cls?.type === 'group' || Utils.isGroupClassName(rawName));

            enrollments.push({
                studentId: r.id,
                classId: r.classId,
                className: rawName || displayName,
                displayName,
                isGroup,
                isCopiedProfile: Boolean(r.isCopiedProfile)
            });
        }

        enrollments.sort((a, b) => {
            if (a.isGroup !== b.isGroup) return Number(a.isGroup) - Number(b.isGroup);
            return Number(a.isCopiedProfile) - Number(b.isCopiedProfile);
        });

        return enrollments.map(({ isCopiedProfile: _ignored, ...rest }) => rest);
    },

    /**
     * Calcule les libellés contextuels (menu, barre de sélection, modale de confirmation, toast)
     * pour le retrait d'une fiche de groupe/classe vs la suppression définitive d'un élève.
     *
     * @param {string|Object|Array<string|Object>} studentIds - ID(s) ou objet(s) élève(s)
     * @param {Object} [options={}]
     * @param {string|null} [options.currentClassId] - ID de la classe affichée (physique ou `virtual_*`)
     * @returns {Object} Métadonnées d'affichage et de confirmation
     */
    getDeleteActionMeta(studentIds, options = {}) {
        const rawList = Array.isArray(studentIds) ? studentIds : (studentIds ? [studentIds] : []);
        const allResults = appState.generatedResults || [];
        const classes = userSettings?.academic?.classes || appState?.classes || [];
        const classMap = new Map(classes.map(c => [c.id, c]));

        const seenIds = new Set();
        const students = [];
        for (const entry of rawList) {
            const resolved = typeof entry === 'string'
                ? allResults.find(r => r?.id === entry)
                : entry;
            if (resolved?.id && !seenIds.has(resolved.id)) {
                seenIds.add(resolved.id);
                students.push(resolved);
            }
        }

        const effectiveClassId = options.currentClassId !== undefined
            ? options.currentClassId
            : (appState?.currentClassId || userSettings?.academic?.currentClassId || null);
        const isVirtualView = typeof effectiveClassId === 'string' && effectiveClassId.startsWith('virtual_');

        const getOwnerDisplayName = (s) => {
            const cls = s?.classId ? classMap.get(s.classId) : null;
            const rawName = (cls?.name || s?.sourceGroupName || '').trim();
            return rawName ? Utils.formatClassDisplayName(rawName) : '';
        };

        const truncateLabel = (str, max = 22) => (
            str.length > max ? `${str.slice(0, max - 1).trimEnd()}…` : str
        );

        const formatClassListHtml = (names) => {
            if (names.length === 0) return '';
            if (names.length === 1) return `<strong>${Utils.escapeHtml(names[0])}</strong>`;
            if (names.length === 2) {
                return `<strong>${Utils.escapeHtml(names[0])}</strong> et <strong>${Utils.escapeHtml(names[1])}</strong>`;
            }
            const remaining = names.length - 2;
            return `<strong>${Utils.escapeHtml(names[0])}</strong>, <strong>${Utils.escapeHtml(names[1])}</strong> et ${remaining} autre${remaining > 1 ? 's' : ''}`;
        };

        if (students.length === 0) {
            return {
                students: [],
                menuLabel: "Supprimer l'élève",
                menuIcon: 'solar:trash-bin-trash-linear',
                toolbarIcon: 'solar:trash-bin-trash-linear',
                toolbarTooltip: 'Supprimer la sélection (Suppr)',
                title: 'Supprimer ?',
                message: 'Cette action est irréversible.',
                confirmText: 'Supprimer',
                toastMessage: 'Élève supprimé.',
                isVirtualView,
                hasPermanentDeletion: true
            };
        }

        if (students.length === 1) {
            const student = students[0];
            const studentName = Utils.formatStudentName(student.nom, student.prenom) || 'cet élève';
            const safeStudentName = Utils.escapeHtml(studentName);
            const ownerName = getOwnerDisplayName(student);
            const safeOwner = Utils.escapeHtml(ownerName);
            const compactOwner = ownerName ? truncateLabel(ownerName, 22) : '';
            const others = this.getOtherEnrollments(student);
            const hasOthers = others.length > 0;

            if (hasOthers) {
                const otherListHtml = formatClassListHtml(others.map(o => o.displayName));
                return {
                    students,
                    menuLabel: compactOwner ? `Retirer de ${compactOwner}` : 'Retirer de la classe',
                    menuIcon: 'solar:user-minus-linear',
                    toolbarIcon: 'solar:user-minus-linear',
                    toolbarTooltip: ownerName ? `Retirer de ${ownerName} (Suppr)` : 'Retirer de la classe (Suppr)',
                    title: ownerName ? `Retirer ${safeStudentName} de ${safeOwner} ?` : `Retirer ${safeStudentName} de cette classe ?`,
                    message: `${ownerName ? `Sa fiche dans <strong>${safeOwner}</strong>` : 'Sa fiche dans cette classe'} (notes, appréciations, journal) sera supprimée. Cet élève reste inscrit dans ${otherListHtml}.`,
                    confirmText: 'Retirer',
                    toastMessage: ownerName ? `Fiche de ${studentName} retirée de « ${ownerName} ».` : `Fiche de ${studentName} retirée.`,
                    isVirtualView,
                    hasPermanentDeletion: false
                };
            }

            if (isVirtualView && ownerName) {
                return {
                    students,
                    menuLabel: `Retirer de ${compactOwner}`,
                    menuIcon: 'solar:user-minus-linear',
                    toolbarIcon: 'solar:trash-bin-trash-linear',
                    toolbarTooltip: `Retirer de ${ownerName} (Suppr)`,
                    title: `Retirer ${safeStudentName} de ${safeOwner} ?`,
                    message: `Cet élève n'est inscrit dans aucune autre classe : sa fiche dans <strong>${safeOwner}</strong> et toutes ses données associées seront définitivement supprimées.`,
                    confirmText: 'Supprimer',
                    toastMessage: `${studentName} supprimé de « ${ownerName} ».`,
                    isVirtualView,
                    hasPermanentDeletion: true
                };
            }

            return {
                students,
                menuLabel: "Supprimer l'élève",
                menuIcon: 'solar:trash-bin-trash-linear',
                toolbarIcon: 'solar:trash-bin-trash-linear',
                toolbarTooltip: 'Supprimer définitivement (Suppr)',
                title: `Supprimer ${safeStudentName} ?`,
                message: `Cet élève n'est inscrit dans aucune autre classe : sa fiche${ownerName ? ` dans <strong>${safeOwner}</strong>` : ''} et toutes ses données associées seront définitivement supprimées.`,
                confirmText: 'Supprimer',
                toastMessage: `${studentName} supprimé.`,
                isVirtualView,
                hasPermanentDeletion: true
            };
        }

        const count = students.length;
        const deletingIds = new Set(students.map(s => s.id));
        const items = students.map(s => ({
            student: s,
            ownerName: getOwnerDisplayName(s),
            others: this.getOtherEnrollments(s).filter(e => !deletingIds.has(e.studentId))
        }));

        const keptCount = items.filter(i => i.others.length > 0).length;
        const foreverCount = count - keptCount;
        const ownerNames = [...new Set(items.map(i => i.ownerName).filter(Boolean))];
        const singleOwner = ownerNames.length === 1 ? ownerNames[0] : '';
        const safeSingleOwner = Utils.escapeHtml(singleOwner);
        const ownerListHtml = formatClassListHtml(ownerNames);

        if (foreverCount === 0) {
            const scopeHtml = singleOwner
                ? `<strong>${safeSingleOwner}</strong>`
                : (ownerListHtml || 'cette classe');
            return {
                students,
                menuLabel: singleOwner ? `Retirer de ${truncateLabel(singleOwner, 22)}` : 'Retirer de la classe',
                menuIcon: 'solar:user-minus-linear',
                toolbarIcon: 'solar:user-minus-linear',
                toolbarTooltip: singleOwner ? `Retirer ${count} élèves de ${singleOwner} (Suppr)` : `Retirer ${count} élèves (Suppr)`,
                title: singleOwner ? `Retirer ${count} élèves de ${safeSingleOwner} ?` : `Retirer ${count} élèves ?`,
                message: `Leurs fiches dans ${scopeHtml} (notes, appréciations, journal) seront supprimées. Tous ces élèves restent inscrits dans une autre classe.`,
                confirmText: 'Retirer',
                toastMessage: singleOwner ? `${count} fiches retirées de « ${singleOwner} ».` : `${count} fiches retirées.`,
                isVirtualView,
                hasPermanentDeletion: false
            };
        }

        if (keptCount === 0) {
            if (isVirtualView && ownerNames.length > 0) {
                return {
                    students,
                    menuLabel: singleOwner ? `Retirer de ${truncateLabel(singleOwner, 22)}` : 'Retirer des groupes',
                    menuIcon: 'solar:user-minus-linear',
                    toolbarIcon: 'solar:trash-bin-trash-linear',
                    toolbarTooltip: 'Supprimer définitivement la sélection (Suppr)',
                    title: singleOwner ? `Retirer ${count} élèves de ${safeSingleOwner} ?` : `Supprimer ${count} élèves ?`,
                    message: `Aucun de ces élèves n'est inscrit ailleurs : leurs fiches dans ${ownerListHtml} et toutes leurs données associées seront définitivement supprimées.`,
                    confirmText: 'Supprimer',
                    toastMessage: `${count} élèves supprimés.`,
                    isVirtualView,
                    hasPermanentDeletion: true
                };
            }

            return {
                students,
                menuLabel: 'Supprimer les élèves',
                menuIcon: 'solar:trash-bin-trash-linear',
                toolbarIcon: 'solar:trash-bin-trash-linear',
                toolbarTooltip: 'Supprimer définitivement la sélection (Suppr)',
                title: `Supprimer ${count} élèves ?`,
                message: `Aucun de ces élèves n'est inscrit dans une autre classe : leurs fiches${singleOwner ? ` dans <strong>${safeSingleOwner}</strong>` : ''} et toutes leurs données associées seront définitivement supprimées.`,
                confirmText: 'Supprimer',
                toastMessage: `${count} élèves supprimés.`,
                isVirtualView,
                hasPermanentDeletion: true
            };
        }

        const keptLabel = keptCount === 1
            ? '1 élève reste inscrit dans une autre classe'
            : `${keptCount} élèves restent inscrits dans une autre classe`;
        const foreverLabel = foreverCount === 1
            ? '<strong>1 élève sera définitivement supprimé</strong> (inscrit nulle part ailleurs)'
            : `<strong>${foreverCount} élèves seront définitivement supprimés</strong> (inscrits nulle part ailleurs)`;
        const scopePrefix = ownerListHtml && !singleOwner ? `Fiches concernées dans ${ownerListHtml} :<br>` : '';

        return {
            students,
            menuLabel: singleOwner ? `Retirer de ${truncateLabel(singleOwner, 22)}` : 'Retirer',
            menuIcon: 'solar:user-minus-linear',
            toolbarIcon: 'solar:user-minus-linear',
            toolbarTooltip: singleOwner ? `Retirer ${count} élèves de ${singleOwner} (Suppr)` : `Retirer / supprimer ${count} élèves (Suppr)`,
            title: singleOwner ? `Retirer ${count} élèves de ${safeSingleOwner} ?` : `Retirer ${count} élèves ?`,
            message: `${scopePrefix}• ${keptLabel}<br>• ${foreverLabel}`,
            confirmText: 'Retirer',
            toastMessage: `${keptCount} ${keptCount > 1 ? 'fiches retirées' : 'fiche retirée'}, ${foreverCount} ${foreverCount > 1 ? 'élèves supprimés' : 'élève supprimé'}.`,
            isVirtualView,
            hasPermanentDeletion: true
        };
    },

    /**
     * Synchronise un élève modifié dans appState.filteredResults si présent
     * pour maintenir la cohérence de l'affichage sans duplication de code.
     * @param {string} id - ID de l'élève
     * @param {Object} [updatedResult=null] - Données à jour (prend student dans generatedResults si omis)
     */
    syncFilteredStudent(id, updatedResult = null) {
        if (!appState.filteredResults || !id) return;
        const target = updatedResult || appState.generatedResults?.find(r => r.id === id);
        if (!target) return;
        const idx = appState.filteredResults.findIndex(r => r.id === id);
        if (idx !== -1) {
            appState.filteredResults[idx] = target;
        }
    }
};
