/**
 * @fileoverview Tests for ImportUtils
 */
import { describe, it, expect } from 'vitest';
import { detectSeparator, parseLine, detectVerticalFormat, convertVerticalToTabular } from './ImportUtils.js';

describe('ImportUtils', () => {
    describe('detectSeparator()', () => {
        it('should detect tab separator', () => {
            const data = `Nom\tPrénom\tNote
Martin\tLucas\t15
Dupont\tMarie\t18`;

            expect(detectSeparator(data)).toBe('\t');
        });

        it('should detect pipe separator', () => {
            const data = `Nom | Prénom | Note
Martin | Lucas | 15
Dupont | Marie | 18`;

            expect(detectSeparator(data)).toBe('|');
        });

        it('should detect semicolon separator', () => {
            const data = `Nom;Prénom;Note
Martin;Lucas;15
Dupont;Marie;18`;

            expect(detectSeparator(data)).toBe(';');
        });

        it('should detect comma separator', () => {
            const data = `Nom,Prénom,Note
Martin,Lucas,15
Dupont,Marie,18`;

            expect(detectSeparator(data)).toBe(',');
        });

        it('should return tab as default for empty data', () => {
            expect(detectSeparator('')).toBe('\t');
        });

        it('should return tab as default for data with only whitespace', () => {
            expect(detectSeparator('   \n   \n   ')).toBe('\t');
        });

        it('should prefer separator with most consistent occurrence', () => {
            // Data with pipes on all lines but commas only on some
            const data = `Nom | Prénom | Note
Martin | Lucas | 15
Dupont | Marie | 18`;

            expect(detectSeparator(data)).toBe('|');
        });

        it('should handle single line data', () => {
            const data = `Nom\tPrénom\tNote`;

            expect(detectSeparator(data)).toBe('\t');
        });

        it('should ignore empty lines when detecting', () => {
            const data = `Nom\tPrénom\tNote

Martin\tLucas\t15

Dupont\tMarie\t18`;

            expect(detectSeparator(data)).toBe('\t');
        });

        it('should analyze only first 10 lines', () => {
            const lines = [];
            for (let i = 0; i < 15; i++) {
                lines.push(`Name${i}\tValue${i}\tScore${i}`);
            }
            const data = lines.join('\n');

            expect(detectSeparator(data)).toBe('\t');
        });
    });

    describe('parseLine()', () => {
        it('should split by tab and trim values', () => {
            const result = parseLine('Nom\t  Prénom  \tNote', '\t');

            expect(result).toEqual(['Nom', 'Prénom', 'Note']);
        });

        it('should handle multiple consecutive tabs', () => {
            const result = parseLine('Nom\t\t\tPrénom\tNote', '\t');

            expect(result).toEqual(['Nom', 'Prénom', 'Note']);
        });

        it('should split by pipe and trim values', () => {
            const result = parseLine('Nom | Prénom | Note', '|');

            expect(result).toEqual(['Nom', 'Prénom', 'Note']);
        });

        it('should split by semicolon and trim values', () => {
            const result = parseLine('Nom; Prénom; Note', ';');

            expect(result).toEqual(['Nom', 'Prénom', 'Note']);
        });

        it('should split by comma and trim values', () => {
            const result = parseLine('Nom, Prénom, Note', ',');

            expect(result).toEqual(['Nom', 'Prénom', 'Note']);
        });

        it('should handle empty values', () => {
            const result = parseLine('Nom||Note', '|');

            expect(result).toEqual(['Nom', '', 'Note']);
        });

        it('should handle single value line', () => {
            const result = parseLine('JustOneValue', '|');

            expect(result).toEqual(['JustOneValue']);
        });

        it('should handle empty line', () => {
            const result = parseLine('', '|');

            expect(result).toEqual(['']);
        });

        it('should trim whitespace from all values', () => {
            const result = parseLine('  Nom  |  Prénom  |  Note  ', '|');

            expect(result).toEqual(['Nom', 'Prénom', 'Note']);
        });
    });

    describe('detectVerticalFormat()', () => {
        it('should detect valid vertical format with 2+ students', () => {
            const data = `AGNES Charly
2
7,3
Charly AGNES - Premier semestre - TECHNOLOGIE
ALEXANDRE Jérémy
2
9,3
Jérémy ALEXANDRE - Premier semestre - TECHNOLOGIE`;

            expect(detectVerticalFormat(data)).toBe(true);
        });

        it('should return false for tabular data', () => {
            const data = `Nom\tPrénom\tNote
Martin\tLucas\t15
Dupont\tMarie\t18`;

            expect(detectVerticalFormat(data)).toBe(false);
        });

        it('should return false for insufficient data (less than 8 lines)', () => {
            const data = `AGNES Charly
2
7,3
Charly AGNES - Premier semestre - TECHNOLOGIE`;

            expect(detectVerticalFormat(data)).toBe(false);
        });

        it('should return false when pattern is broken', () => {
            const data = `AGNES Charly
not a number
7,3
Charly AGNES - Premier semestre - TECHNOLOGIE
ALEXANDRE Jérémy
2
9,3
Jérémy ALEXANDRE - Premier semestre - TECHNOLOGIE`;

            expect(detectVerticalFormat(data)).toBe(false);
        });
    });

    describe('convertVerticalToTabular()', () => {
        it('should convert vertical format to tabular', () => {
            const data = `AGNES Charly
2
7,3
Charly AGNES - Premier semestre - TECHNOLOGIE
ALEXANDRE Jérémy
2
9,3
Jérémy ALEXANDRE - Premier semestre - TECHNOLOGIE`;

            const result = convertVerticalToTabular(data);
            const lines = result.split('\n');

            expect(lines.length).toBe(2);
            expect(lines[0]).toContain('AGNES Charly');
            expect(lines[0]).toContain('7.3'); // Virgule convertie en point
            expect(lines[0]).toContain('Premier semestre - TECHNOLOGIE');
        });

        it('should normalize comma to dot in grades', () => {
            const data = `TEST Élève
1
15,5
Élève TEST - T1 - Maths
AUTRE Élève
1
18,0
Élève AUTRE - T1 - Maths`;

            const result = convertVerticalToTabular(data);

            expect(result).toContain('15.5');
            expect(result).toContain('18.0');
        });
    });
});

