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

vi.mock('../utils/Utils.js', () => ({
    Utils: {
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
    });
});
