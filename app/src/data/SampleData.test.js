/**
 * @fileoverview Unit tests for SampleData module
 * @module data/SampleData.test
 */

import { describe, it, expect } from 'vitest';
import {
    SAMPLE_STUDENTS,
    getSampleImportData,
    getDemoClassData,
    getSampleTrombiStudents,
    DEMO_STUDENT_PROFILES
} from './SampleData.js';

describe('SampleData', () => {
    const EXPECTED_TROMBI_ORDER = [
        { nom: 'BERNARD', prenom: 'Thomas', statut: '', photo: 'bernard.jpg' },
        { nom: 'DURAND', prenom: 'Sophie', statut: 'PPRE', photo: 'durand.jpg' },
        { nom: 'LEFEVRE', prenom: 'Hugo', statut: '', photo: 'lefevre.jpg' },
        { nom: 'MARTIN', prenom: 'Lucas', statut: '', photo: 'martin.jpg' },
        { nom: 'MOREAU', prenom: 'Julie', statut: 'Délégué', photo: 'moreau.jpg' },
        { nom: 'PETIT', prenom: 'Emma', statut: '', photo: 'petit.jpg' },
        { nom: 'ROBERT', prenom: 'Antoine', statut: 'PAP', photo: 'robert.jpg' },
        { nom: 'SIMON', prenom: 'Clara', statut: 'ULIS', photo: 'simon.jpg' }
    ];

    describe('Canonical student alignment with Trombinoscope', () => {
        it('should keep the 8 students in strict alphabetical order matching sample-trombinoscope.png', () => {
            expect(SAMPLE_STUDENTS).toHaveLength(8);
            SAMPLE_STUDENTS.forEach((student, idx) => {
                expect(student.nom).toBe(EXPECTED_TROMBI_ORDER[idx].nom);
                expect(student.prenom).toBe(EXPECTED_TROMBI_ORDER[idx].prenom);
                expect(student.statut).toBe(EXPECTED_TROMBI_ORDER[idx].statut);
                expect(student.photo).toBe(EXPECTED_TROMBI_ORDER[idx].photo);
            });
        });

        it('should synchronize getSampleTrombiStudents and DEMO_STUDENT_PROFILES with SAMPLE_STUDENTS', () => {
            const trombiStudents = getSampleTrombiStudents();
            expect(trombiStudents).toHaveLength(8);
            expect(DEMO_STUDENT_PROFILES).toHaveLength(8);

            EXPECTED_TROMBI_ORDER.forEach((expected, idx) => {
                expect(trombiStudents[idx]).toEqual({
                    id: `sample-${expected.nom.toLowerCase()}`,
                    nom: expected.nom,
                    prenom: expected.prenom
                });

                const profile = DEMO_STUDENT_PROFILES[idx];
                expect(profile.id).toBe(`demo-${expected.nom.toLowerCase()}`);
                expect(profile.nom).toBe(expected.nom);
                expect(profile.prenom).toBe(expected.prenom);
                expect(profile.photo).toBe(`./images/Demo/${expected.photo}`);
                expect(profile.studentData.statuses).toEqual(expected.statut ? [expected.statut] : []);
                expect(profile.studentData.periods.T1.grade).toBeTypeOf('number');
                expect(profile.studentData.periods.T2.grade).toBeTypeOf('number');
                expect(profile.studentData.periods.T3.grade).toBeTypeOf('number');
                expect(profile.studentData.periods.S1.grade).toBeTypeOf('number');
                expect(profile.studentData.periods.S2.grade).toBeTypeOf('number');
            });
        });
    });

    describe('getSampleImportData()', () => {
        it('should generate 5 columns for S1 and T1 (Nom | Statut | Moy P1 | App P1 | Ctx P1)', () => {
            for (const period of ['S1', 'T1']) {
                const lines = getSampleImportData(period).split('\n');
                expect(lines).toHaveLength(8);
                const cols = lines[0].split(' | ');
                expect(cols).toHaveLength(5);
                expect(cols[0]).toBe('BERNARD Thomas');
                expect(cols[2]).toBe('15');
            }
        });

        it('should generate 7 cumulative columns for S2 and T2 (Nom | Statut | Moy P1 | App P1 | Moy P2 | App P2 | Ctx P2)', () => {
            for (const period of ['S2', 'T2']) {
                const lines = getSampleImportData(period).split('\n');
                expect(lines).toHaveLength(8);
                const cols = lines[0].split(' | ');
                expect(cols).toHaveLength(7);
                expect(cols[0]).toBe('BERNARD Thomas');
                expect(cols[2]).toBe('15');
                expect(cols[4]).toBe('15.2');
                // Distinct data between P1 and P2
                expect(getSampleImportData('S2')).not.toBe(getSampleImportData('S1'));
            }
        });

        it('should generate 9 cumulative columns for T3 (Nom | Statut | Moy T1 | App T1 | Moy T2 | App T2 | Moy T3 | App T3 | Ctx T3)', () => {
            const lines = getSampleImportData('T3').split('\n');
            expect(lines).toHaveLength(8);
            const cols = lines[0].split(' | ');
            expect(cols).toHaveLength(9);
            expect(cols[0]).toBe('BERNARD Thomas');
            expect(cols[2]).toBe('15');
            expect(cols[4]).toBe('15.2');
            expect(cols[6]).toBe('16');
        });

        it('should fallback gracefully to P1 (5 columns) when period is omitted, null or unknown', () => {
            const defaultSample = getSampleImportData();
            expect(defaultSample.split('\n')[0].split(' | ')).toHaveLength(5);
            expect(getSampleImportData(null)).toBe(defaultSample);
            expect(getSampleImportData('')).toBe(defaultSample);
            expect(getSampleImportData('UNKNOWN')).toBe(defaultSample);
        });
    });

    describe('getDemoClassData()', () => {
        it('should build trimestres demo class with T1 populated and T2/T3 empty', () => {
            const demo = getDemoClassData('trimestres');
            expect(demo.className).toBe('Classe exemple');
            expect(demo.students).toHaveLength(8);
            expect(demo.students[0].nom).toBe('BERNARD');
            expect(demo.students[0].prenom).toBe('Thomas');
            expect(demo.students[0].periods.T1.grade).toBe(15);
            expect(demo.students[0].periods.T1.appreciation).toBe('');
            expect(demo.students[0].periods.T2.grade).toBeNull();
            expect(demo.students[0].periods.T3.grade).toBeNull();
        });

        it('should build semestres demo class with S1 populated and S2 empty', () => {
            const demo = getDemoClassData('semestres');
            expect(demo.students).toHaveLength(8);
            expect(demo.students[1].nom).toBe('DURAND');
            expect(demo.students[1].statuses).toEqual(['PPRE']);
            expect(demo.students[1].periods.S1.grade).toBe(9);
            expect(demo.students[1].periods.S2.grade).toBeNull();
        });
    });
});
