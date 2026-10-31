/**
 * @fileoverview Tests for StudentDataManager
 * @module managers/StudentDataManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        currentPeriod: 'T1',
        currentAIModel: 'gemini-2.5-flash',
        currentSubject: 'Mathématiques',
        useSubjectPersonalization: false,
        generatedResults: [],
        journalThreshold: 2
    },
    userSettings: {
        academic: {
            currentClassId: null
        }
    }
}));

vi.mock('../utils/Utils.js', async (importOriginal) => ({
    Utils: {
        ...(await importOriginal()).Utils,
        normalizeName: (nom, prenom) => `${nom}_${prenom}`.toLowerCase(),
        parseStudentLine: vi.fn(),
        getPeriods: vi.fn(() => ['T1', 'T2', 'T3']),
        deepClone: (obj) => JSON.parse(JSON.stringify(obj))
    }
}));

import { StudentDataManager } from './StudentDataManager.js';
import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';

describe('StudentDataManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        appState.currentPeriod = 'T1';
        appState.currentAIModel = 'gemini-2.5-flash';
        appState.currentSubject = 'Mathématiques';
        appState.useSubjectPersonalization = false;
        appState.generatedResults = [];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('createResultObject', () => {
        it('should create a valid result object with all required fields', () => {
            const studentData = {
                nom: 'MARTIN',
                prenom: 'Lucas',
                periods: { T1: { grade: 15 } },
                currentPeriod: 'T1'
            };

            const result = StudentDataManager.createResultObject(
                'MARTIN', 'Lucas', 'Good student',
                [{ period: 'T1', evolution: 0.5 }],
                studentData,
                { appreciation: 'prompt1' },
                { appreciation: { total_tokens: 100 } },
                null,
                'gemini-2.5-flash'
            );

            expect(result).toHaveProperty('id');
            expect(result.nom).toBe('MARTIN');
            expect(result.prenom).toBe('Lucas');
            expect(result.appreciation).toBe('Good student');
            expect(result.evolutions).toHaveLength(1);
            expect(result.studentData).toBeDefined();
            expect(result.timestamp).toBeDefined();
            expect(result.errorMessage).toBeNull();
        });

        it('should generate unique IDs', () => {
            const studentData = { periods: { T1: {} }, currentPeriod: 'T1' };

            const result1 = StudentDataManager.createResultObject(
                'A', 'B', '', [], studentData, {}, {}
            );
            const result2 = StudentDataManager.createResultObject(
                'C', 'D', '', [], studentData, {}, {}
            );

            expect(result1.id).not.toBe(result2.id);
        });

        it('should store appreciation in the period data', () => {
            const studentData = {
                periods: { T1: { grade: 15 } },
                currentPeriod: 'T1'
            };

            const result = StudentDataManager.createResultObject(
                'MARTIN', 'Lucas', 'Test appreciation',
                [], studentData, {}, {}
            );

            expect(result.studentData.periods.T1.appreciation).toBe('Test appreciation');
        });

        it('should use current AI model if none specified', () => {
            appState.currentAIModel = 'gpt-4o';
            const studentData = { periods: { T1: {} }, currentPeriod: 'T1' };

            const result = StudentDataManager.createResultObject(
                'A', 'B', '', [], studentData, {}, {}
            );

            expect(result.studentData.currentAIModel).toBe('gpt-4o');
        });

        it('should use specified model when provided', () => {
            appState.currentAIModel = 'gpt-4o';
            const studentData = { periods: { T1: {} }, currentPeriod: 'T1' };

            const result = StudentDataManager.createResultObject(
                'A', 'B', '', [], studentData, {}, {}, null, 'custom-model'
            );

            expect(result.studentData.currentAIModel).toBe('custom-model');
        });

        it('should use subject personalization when enabled', () => {
            appState.useSubjectPersonalization = true;
            appState.currentSubject = 'Physique';
            const studentData = { periods: { T1: {} }, currentPeriod: 'T1' };

            const result = StudentDataManager.createResultObject(
                'A', 'B', '', [], studentData, {}, {}
            );

            expect(result.studentData.subject).toBe('Physique');
        });

        it('should default to Générique when personalization disabled', () => {
            appState.useSubjectPersonalization = false;
            appState.currentSubject = 'Physique';
            const studentData = { periods: { T1: {} }, currentPeriod: 'T1' };

            const result = StudentDataManager.createResultObject(
                'A', 'B', '', [], studentData, {}, {}
            );

            expect(result.studentData.subject).toBe('Générique');
        });

        it('should store error message when provided', () => {
            const studentData = { periods: { T1: {} }, currentPeriod: 'T1' };

            const result = StudentDataManager.createResultObject(
                'A', 'B', '', [], studentData, {}, {},
                'API Error: Rate limit exceeded'
            );

            expect(result.errorMessage).toBe('API Error: Rate limit exceeded');
        });

        it('should initialize analysis fields as null', () => {
            const studentData = { periods: { T1: {} }, currentPeriod: 'T1' };

            const result = StudentDataManager.createResultObject(
                'A', 'B', '', [], studentData, {}, {}
            );

            expect(result.strengthsWeaknesses).toBeNull();
            expect(result.nextSteps).toBeNull();
        });

        it('should set copied to false by default', () => {
            const studentData = { periods: { T1: {} }, currentPeriod: 'T1' };

            const result = StudentDataManager.createResultObject(
                'A', 'B', '', [], studentData, {}, {}
            );

            expect(result.copied).toBe(false);
        });

        it('should deep clone studentData to avoid mutations', () => {
            const originalData = {
                periods: { T1: { grade: 15 } },
                currentPeriod: 'T1'
            };

            const result = StudentDataManager.createResultObject(
                'A', 'B', 'Test', [], originalData, {}, {}
            );

            // Modify the result
            result.studentData.periods.T1.grade = 20;

            // Original should be unchanged
            expect(originalData.periods.T1.grade).toBe(15);
        });
    });

    describe('_prepareStudentListForImport', () => {
        beforeEach(() => {
            Utils.parseStudentLine.mockImplementation((line, formatMap, period) => {
                if (line.includes('INVALID')) return null;
                const parts = line.split('\t');
                return {
                    nom: parts[0].split(' ')[0],
                    prenom: parts[0].split(' ')[1] || '',
                    periods: { [period]: { grade: parseFloat(parts[1]) || 0 } },
                    statuses: []
                };
            });
        });

        it('should parse valid lines into students', () => {
            const lines = [
                'MARTIN Lucas\t15',
                'DUPONT Emma\t12'
            ];
            const formatMap = {};

            const result = StudentDataManager._prepareStudentListForImport(
                lines, formatMap, 'merge'
            );

            expect(result.studentsToProcess).toHaveLength(2);
        });

        it('should track ignored lines', () => {
            const lines = [
                'MARTIN Lucas\t15',
                'INVALID LINE'
            ];
            const formatMap = {};

            const result = StudentDataManager._prepareStudentListForImport(
                lines, formatMap, 'merge'
            );

            expect(result.ignoredCount).toBe(1);
        });

        it('should identify new students in merge mode', () => {
            appState.generatedResults = [];
            const lines = ['MARTIN Lucas\t15'];
            const formatMap = {};

            const result = StudentDataManager._prepareStudentListForImport(
                lines, formatMap, 'merge'
            );

            expect(result.newStudents).toHaveLength(1);
            expect(result.newStudents[0].nom).toBe('MARTIN');
        });

        it('should identify updated students in merge mode', () => {
            appState.generatedResults = [
                { nom: 'MARTIN', prenom: 'Lucas', studentData: { statuses: [] } }
            ];
            const lines = ['MARTIN Lucas\t18'];
            const formatMap = {};

            const result = StudentDataManager._prepareStudentListForImport(
                lines, formatMap, 'merge'
            );

            expect(result.updatedStudents).toHaveLength(1);
        });

        it('should identify departed students in merge mode', () => {
            appState.generatedResults = [
                { nom: 'OLD', prenom: 'Student', studentData: { statuses: [] } }
            ];
            const lines = ['MARTIN Lucas\t15'];
            const formatMap = {};

            const result = StudentDataManager._prepareStudentListForImport(
                lines, formatMap, 'merge'
            );

            expect(result.departedStudents).toHaveLength(1);
            expect(result.departedStudents[0].nom).toBe('OLD');
        });

        it('should treat all as new students in replace mode', () => {
            appState.generatedResults = [
                { nom: 'OLD', prenom: 'Student', studentData: {} }
            ];
            const lines = [
                'MARTIN Lucas\t15',
                'DUPONT Emma\t12'
            ];
            const formatMap = {};

            const result = StudentDataManager._prepareStudentListForImport(
                lines, formatMap, 'replace'
            );

            expect(result.newStudents).toHaveLength(2);
            expect(result.updatedStudents).toHaveLength(0);
        });

        it('should identify departed students in replace mode', () => {
            appState.generatedResults = [
                { nom: 'OLD', prenom: 'Student', studentData: {} }
            ];
            const lines = ['MARTIN Lucas\t15'];
            const formatMap = {};

            const result = StudentDataManager._prepareStudentListForImport(
                lines, formatMap, 'replace'
            );

            expect(result.departedStudents).toHaveLength(1);
        });

        it('should not mark students with Départ status as departed', () => {
            appState.generatedResults = [
                { nom: 'LEFT', prenom: 'Student', studentData: { statuses: ['Départ T1'] } }
            ];
            const lines = ['MARTIN Lucas\t15'];
            const formatMap = {};

            const result = StudentDataManager._prepareStudentListForImport(
                lines, formatMap, 'merge'
            );

            // LEFT Student already has Départ status, should not be in departedStudents
            expect(result.departedStudents.find(s => s.nom === 'LEFT')).toBeUndefined();
        });

        it('should add Nouveau status for new students in later periods', () => {
            appState.currentPeriod = 'T2';
            Utils.getPeriods.mockReturnValue(['T1', 'T2', 'T3']);
            Utils.parseStudentLine.mockReturnValue({
                nom: 'NEW',
                prenom: 'Student',
                periods: { T2: { grade: 15 } },
                statuses: []
            });
            // Need existing students so merge mode enters the else branch
            appState.generatedResults = [
                { nom: 'EXISTING', prenom: 'User', classId: null, studentData: { statuses: [] } }
            ];

            const lines = ['NEW Student\t15'];
            const formatMap = {};

            const result = StudentDataManager._prepareStudentListForImport(
                lines, formatMap, 'merge'
            );

            // Student should have "Nouveau T2" status added
            const newStudent = result.studentsToProcess.find(s => s.nom === 'NEW');
            expect(newStudent.statuses).toContain('Nouveau T2');
        });

        it('should preserve auto-detected Nouveau status in ImportWizardManager._performImport when no STATUT column is mapped, and strip when STATUT column is unchecked', async () => {
            const { ImportWizardManager } = await import('./ImportWizardManager.js');
            const { MassImportManager } = await import('./MassImportManager.js');
            const importSpy = vi.spyOn(MassImportManager, 'importStudentsOnly').mockResolvedValue();
            const saveFormatSpy = vi.spyOn(ImportWizardManager, '_saveFormat').mockImplementation(() => {});
            const closeSpy = vi.spyOn(ImportWizardManager, 'close').mockImplementation(() => {});

            appState.currentPeriod = 'T2';
            document.body.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th><label class="preview-col-header"><input type="checkbox" checked disabled data-col-tag="NOM_PRENOM"></label></th>
                            <th><label class="preview-col-header"><input type="checkbox" checked data-col-tag="MOY_T2"></label></th>
                        </tr>
                    </thead>
                </table>
            `;

            // Case 1: No STATUT column in formatMap -> auto-detected "Nouveau T2" must be preserved
            ImportWizardManager.state = {
                formatMap: { NOM_PRENOM: 0, MOY_T2: 1 },
                studentsToProcess: [
                    { nom: 'ARRIVANT', prenom: 'Léo', statuses: ['Nouveau T2'], periods: { T2: { grade: 14 } } }
                ],
                departedStudents: [],
                ignoredCount: 0
            };

            await ImportWizardManager._performImport();
            expect(importSpy).toHaveBeenCalledTimes(1);
            expect(importSpy.mock.calls[0][0][0].statuses).toEqual(['Nouveau T2']);

            // Case 2: STATUT column mapped in formatMap, but unchecked in preview table -> statuses must be stripped
            document.body.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th><label class="preview-col-header"><input type="checkbox" checked disabled data-col-tag="NOM_PRENOM"></label></th>
                            <th><label class="preview-col-header"><input type="checkbox" data-col-tag="STATUT"></label></th>
                        </tr>
                    </thead>
                </table>
            `;
            ImportWizardManager.state = {
                formatMap: { NOM_PRENOM: 0, STATUT: 1 },
                studentsToProcess: [
                    { nom: 'ARRIVANT', prenom: 'Léo', statuses: ['PPRE'], periods: { T2: {} } }
                ],
                departedStudents: [],
                ignoredCount: 0
            };

            await ImportWizardManager._performImport();
            expect(importSpy).toHaveBeenCalledTimes(2);
            expect(importSpy.mock.calls[1][0][0].statuses).toEqual([]);

            importSpy.mockRestore();
            saveFormatSpy.mockRestore();
            closeSpy.mockRestore();
        });
    });

    describe('syncFilteredStudent', () => {
        afterEach(() => {
            delete appState.filteredResults;
        });

        it('should replace the filtered copy with the up-to-date result', () => {
            const stale = { id: 'a', nom: 'OLD' };
            const fresh = { id: 'a', nom: 'NEW' };
            appState.filteredResults = [{ id: 'b' }, stale];

            StudentDataManager.syncFilteredStudent('a', fresh);

            expect(appState.filteredResults[1]).toBe(fresh);
            expect(appState.filteredResults[0]).toEqual({ id: 'b' });
        });

        it('should fall back to generatedResults when no result is provided', () => {
            const fresh = { id: 'a', nom: 'NEW' };
            appState.generatedResults = [fresh];
            appState.filteredResults = [{ id: 'a', nom: 'OLD' }];

            StudentDataManager.syncFilteredStudent('a');

            expect(appState.filteredResults[0]).toBe(fresh);
        });

        it('should not add students absent from the filtered list', () => {
            appState.filteredResults = [{ id: 'b' }];

            StudentDataManager.syncFilteredStudent('a', { id: 'a' });

            expect(appState.filteredResults).toHaveLength(1);
        });

        it('should not throw when filteredResults is undefined or id is missing', () => {
            delete appState.filteredResults;
            expect(() => StudentDataManager.syncFilteredStudent('a', { id: 'a' })).not.toThrow();

            appState.filteredResults = [{ id: 'a' }];
            expect(() => StudentDataManager.syncFilteredStudent(null, { id: 'a' })).not.toThrow();
        });
    });

    describe('copyStudentsToClass & enrichWithExistingProfile (Multi-classes / Groupes projets)', () => {
        let userSettingsRef;

        beforeEach(async () => {
            const stateMod = await import('../state/State.js');
            userSettingsRef = stateMod.userSettings;
            userSettingsRef.academic.classes = [
                { id: 'cls-4a', name: '4e A', isDemo: false },
                { id: 'cls-pad', name: 'Groupe PAD', isDemo: false },
                { id: 'cls-demo', name: 'Classe Exemple', isDemo: true }
            ];
            userSettingsRef.academic.currentClassId = 'cls-pad';
        });

        it('devrait copier un élève vers un groupe cible en conservant photo, statuts pédagogiques et classe d\'origine mais avec des notes vierges', () => {
            appState.generatedResults = [
                {
                    id: 'stu-1',
                    nom: 'BOUKHARI',
                    prenom: 'Sami',
                    classId: 'cls-4a',
                    appreciation: 'Très bon trimestre en 4e A.',
                    studentPhoto: { data: 'data:image/jpeg;base64,abc', source: 'trombi' },
                    studentData: {
                        nom: 'BOUKHARI',
                        prenom: 'Sami',
                        statuses: ['PAP', 'Nouveau T1'],
                        periods: { T1: { grade: 16, appreciation: 'Très bon trimestre en 4e A.' } }
                    }
                }
            ];

            const res = StudentDataManager.copyStudentsToClass(['stu-1'], 'cls-pad');

            expect(res.copiedCount).toBe(1);
            expect(res.skippedCount).toBe(0);
            expect(appState.generatedResults).toHaveLength(2);

            const copied = res.copiedStudents[0];
            expect(copied.id).not.toBe('stu-1');
            expect(copied.classId).toBe('cls-pad');
            expect(copied.nom).toBe('BOUKHARI');
            expect(copied.prenom).toBe('Sami');
            expect(copied.originClass).toBe('4e A');
            expect(copied.studentData.classe).toBe('4e A');
            expect(copied.isCopiedProfile).toBe(true);
            expect(copied.studentPhoto).toEqual({ data: 'data:image/jpeg;base64,abc', source: 'trombi' });
            // Conserve PAP mais filtre le statut transitoire "Nouveau T1"
            expect(copied.studentData.statuses).toEqual(['PAP']);
            // Fiche vierge pour le nouveau groupe
            expect(copied.appreciation).toBeNull();
            expect(copied.isPending).toBe(true);
            expect(copied.studentData.periods).toEqual({});
        });

        it('devrait ignorer les élèves déjà présents dans la classe cible lors d\'une copie', () => {
            appState.generatedResults = [
                { id: 'stu-1', nom: 'BOUKHARI', prenom: 'Sami', classId: 'cls-4a', studentData: {} },
                { id: 'stu-2', nom: 'BOUKHARI', prenom: 'Sami', classId: 'cls-pad', studentData: {} }
            ];

            const res = StudentDataManager.copyStudentsToClass(['stu-1'], 'cls-pad');
            expect(res.copiedCount).toBe(0);
            expect(res.skippedCount).toBe(1);
            expect(appState.generatedResults).toHaveLength(2);
        });

        it('devrait enrichir automatiquement un élève créé dans un groupe si son profil existe déjà dans une autre classe (hors démo)', () => {
            appState.generatedResults = [
                {
                    id: 'demo-stu',
                    nom: 'MARTIN',
                    prenom: 'Lucas',
                    classId: 'cls-demo',
                    studentPhoto: { data: 'demo-photo' },
                    studentData: { statuses: ['ULIS'] }
                },
                {
                    id: 'real-stu',
                    nom: 'BOURGADE',
                    prenom: 'Thibaut',
                    classId: 'cls-4a',
                    originClass: '3*1',
                    studentPhoto: { data: 'real-photo' },
                    studentData: { classe: '3*1', statuses: ['PPRE'] }
                }
            ];

            // Élève présent uniquement en démo -> aucun enrichissement
            const pendingFromDemo = StudentDataManager.createPendingResult(
                { nom: 'MARTIN', prenom: 'Lucas', statuses: [], periods: {} },
                'cls-pad'
            );
            expect(pendingFromDemo.studentPhoto).toBeNull();
            expect(pendingFromDemo.studentData.statuses).toEqual([]);

            // Élève présent en 4e A -> récupère photo, PPRE et badge 3*1
            const pendingReal = StudentDataManager.createPendingResult(
                { nom: 'BOURGADE', prenom: 'Thibaut', statuses: [], periods: {} },
                'cls-pad'
            );
            expect(pendingReal.studentPhoto).toEqual({ data: 'real-photo' });
            expect(pendingReal.studentData.statuses).toEqual(['PPRE']);
            expect(pendingReal.originClass).toBe('3*1');
            expect(pendingReal.isCopiedProfile).toBe(true);
        });
    });
});
