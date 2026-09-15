import { describe, it, expect } from 'vitest';
import {
    normalizeText,
    isHeaderOrFooterText,
    splitStudentFullName,
    extractTrombiMetadata,
    extractStudentsFromTextItems
} from './PronoteTrombiParser.js';

describe('PronoteTrombiParser Unit Tests', () => {
    describe('normalizeText', () => {
        it('should handle non-breaking spaces and redundant whitespaces', () => {
            const input = 'AUBERT\u00A0\u00A0Noe   test\u202F';
            expect(normalizeText(input)).toBe('AUBERT Noe test');
        });

        it('should return empty string for null or undefined', () => {
            expect(normalizeText(null)).toBe('');
            expect(normalizeText(undefined)).toBe('');
        });
    });

    describe('isHeaderOrFooterText', () => {
        it('should detect header elements', () => {
            expect(isHeaderOrFooterText('Trombinoscope de la classe 5 1')).toBe(true);
            expect(isHeaderOrFooterText('Professeur principal : M. MAITRE')).toBe(true);
            expect(isHeaderOrFooterText('28 élèves')).toBe(true);
            expect(isHeaderOrFooterText('Collège Jean Monnet - Epernay')).toBe(true);
            expect(isHeaderOrFooterText('Année scolaire 2026-2027')).toBe(true);
        });

        it('should detect footer elements', () => {
            expect(isHeaderOrFooterText('Trombinoscope édité le 14/09/2026 12:08')).toBe(true);
            expect(isHeaderOrFooterText('Page 1 sur 2')).toBe(true);
        });

        it('should NOT flag student names as header/footer', () => {
            expect(isHeaderOrFooterText('AUBERT Noe')).toBe(false);
            expect(isHeaderOrFooterText('DE OLIVEIRA FERREIRA Bianca')).toBe(false);
            expect(isHeaderOrFooterText('GOUY--MATHEROT Nolan')).toBe(false);
        });
    });

    describe('splitStudentFullName', () => {
        it('should split standard single uppercase name and mixedcase first name', () => {
            expect(splitStudentFullName('AUBERT Noe')).toEqual({
                nom: 'AUBERT',
                prenom: 'Noe'
            });
            expect(splitStudentFullName('BOUILLOT Agathe')).toEqual({
                nom: 'BOUILLOT',
                prenom: 'Agathe'
            });
        });

        it('should handle multi-part uppercase last names', () => {
            expect(splitStudentFullName('DE OLIVEIRA FERREIRA Bianca')).toEqual({
                nom: 'DE OLIVEIRA FERREIRA',
                prenom: 'Bianca'
            });
            expect(splitStudentFullName('BEN EL KHATTAB Sofia')).toEqual({
                nom: 'BEN EL KHATTAB',
                prenom: 'Sofia'
            });
            expect(splitStudentFullName('VAN HERREWEGHE Ellie')).toEqual({
                nom: 'VAN HERREWEGHE',
                prenom: 'Ellie'
            });
            expect(splitStudentFullName('LEPRETRE REMY Paul')).toEqual({
                nom: 'LEPRETRE REMY',
                prenom: 'Paul'
            });
            expect(splitStudentFullName('MUNIER BOIVIN Louis')).toEqual({
                nom: 'MUNIER BOIVIN',
                prenom: 'Louis'
            });
        });

        it('should handle hyphenated names and accents', () => {
            expect(splitStudentFullName('GOUY--MATHEROT Nolan')).toEqual({
                nom: 'GOUY--MATHEROT',
                prenom: 'Nolan'
            });
            expect(splitStudentFullName('DE PAEPE Noé')).toEqual({
                nom: 'DE PAEPE',
                prenom: 'Noé'
            });
            expect(splitStudentFullName('ZARAT Sénwé')).toEqual({
                nom: 'ZARAT',
                prenom: 'Sénwé'
            });
        });

        it('should handle single word gracefully', () => {
            expect(splitStudentFullName('AUBERT')).toEqual({
                nom: 'AUBERT',
                prenom: ''
            });
        });
    });

    describe('extractTrombiMetadata', () => {
        it('should extract class name, total students, school and school year', () => {
            const raw = `
                Collège Jean Monnet - Epernay Année scolaire 2026-2027
                Trombinoscope de la classe 5 1
                28 élèves
                Professeur principal : M. MAITRE
            `;

            const meta = extractTrombiMetadata(raw);
            expect(meta.className).toBe('5 1');
            expect(meta.totalStudents).toBe(28);
            expect(meta.schoolName).toBe('Collège Jean Monnet - Epernay');
            expect(meta.schoolYear).toBe('2026-2027');
        });

        it('should handle alternative class notations', () => {
            const raw = 'Trombinoscope de la classe 6ème B 26 élèves';
            const meta = extractTrombiMetadata(raw);
            expect(meta.className).toBe('6ème B');
            expect(meta.totalStudents).toBe(26);
        });
    });

    describe('extractStudentsFromTextItems', () => {
        it('should cluster items into columns and group multi-line names', () => {
            // Mock viewport (1200 x 1600 px)
            const mockViewport = {
                width: 1200,
                height: 1600,
                scale: 2,
                convertToViewportPoint: (x, y) => [x, y] // Identity for simplicity in mock
            };

            // Simule 4 colonnes régulières à X = 150, 450, 750, 1050
            // Col 1 : AUBERT Noe à Y = 400
            // Col 2 : DE OLIVEIRA FERREIRA à Y = 400, Bianca à Y = 420 (multi-line)
            // Col 3 : BOUILLOT Agathe à Y = 400
            // Col 4 : BOUTROUX Leon à Y = 400
            const mockItems = [
                // Col 1
                { str: 'AUBERT Noe', transform: [0, 0, 0, 0, 150, 400], width: 60, height: 10 },
                // Col 2 (multi-lignes)
                { str: 'DE OLIVEIRA FERREIRA', transform: [0, 0, 0, 0, 450, 400], width: 100, height: 10 },
                { str: 'Bianca', transform: [0, 0, 0, 0, 450, 420], width: 40, height: 10 },
                // Col 3
                { str: 'BOUILLOT Agathe', transform: [0, 0, 0, 0, 750, 400], width: 80, height: 10 },
                // Col 4
                { str: 'BOUTROUX Leon', transform: [0, 0, 0, 0, 1050, 400], width: 70, height: 10 },
                // Header (doit être ignoré)
                { str: 'Trombinoscope de la classe 5 1', transform: [0, 0, 0, 0, 400, 50], width: 200, height: 20 },
                // Footer (doit être ignoré)
                { str: 'Page 1 sur 2', transform: [0, 0, 0, 0, 1000, 1550], width: 50, height: 10 }
            ];

            const students = extractStudentsFromTextItems(mockItems, mockViewport, 0);

            expect(students).toHaveLength(4);
            expect(students[0].nom).toBe('AUBERT');
            expect(students[0].prenom).toBe('Noe');

            // Vérification de la fusion multi-lignes
            expect(students[1].nom).toBe('DE OLIVEIRA FERREIRA');
            expect(students[1].prenom).toBe('Bianca');
            expect(students[1].rawFullName).toBe('DE OLIVEIRA FERREIRA Bianca');

            expect(students[2].nom).toBe('BOUILLOT');
            expect(students[2].prenom).toBe('Agathe');

            expect(students[3].nom).toBe('BOUTROUX');
            expect(students[3].prenom).toBe('Leon');

            // Vérification des zones géométriques calculées
            expect(students[0].zone.cx).toBeCloseTo(students[0].colCenterX, 0);
            expect(students[0].zone.cy).toBeLessThan(students[0].textY); // Au-dessus du texte
            expect(students[0].zone.r).toBeGreaterThan(0);
        });
    });
});
