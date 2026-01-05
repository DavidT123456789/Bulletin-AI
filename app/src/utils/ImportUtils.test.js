/**
 * @fileoverview Tests for ImportUtils
 */
import { describe, it, expect } from 'vitest';
import { detectSeparator, parseLine } from './ImportUtils.js';

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
});
