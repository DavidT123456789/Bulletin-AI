/**
 * @fileoverview Tests for PdfParsers
 */
import { describe, it, expect } from 'vitest';
import { detectMbnBilan, convertMbnBilan } from './PdfParsers.js';

describe('PdfParsers', () => {
    describe('detectMbnBilan()', () => {
        it('should detect valid MBN bilan format', () => {
            const rawData = `Bilan des appréciations du premier semestre
Élève Dev. Moy. Acquisitions
Martin Lucas 2 15.5 Très bon travail.`;
            expect(detectMbnBilan(rawData)).toBe(true);
        });

        it('should not detect other formats', () => {
            const rawData = `Some completely unrelated text.`;
            expect(detectMbnBilan(rawData)).toBe(false);
        });
    });

    describe('convertMbnBilan()', () => {
        it('should parse standard students correctly', () => {
            const rawData = `Bilan des appréciations du premier semestre
Élève Dev. Moy. Acquisitions
MARTIN Lucas 2 15,5 Très bon travail.
DUPONT Marie 2 18,0 Excellent semestre.`;

            const result = convertMbnBilan(rawData);
            const lines = result.split('\n');

            expect(lines).toHaveLength(2);
            expect(lines[0]).toBe('MARTIN Lucas\t2\t15.5\tTrès bon travail.');
            expect(lines[1]).toBe('DUPONT Marie\t2\t18.0\tExcellent semestre.');
        });

        it('should handle multi-line last names split by spaces (e.g. DOUILLOT DARDENNE Kylian)', () => {
            const rawData = `Bilan des appréciations du premier semestre
Élève Dev. Moy. Acquisitions
DOUILLOT
DARDENNE Kylian 2 7,0 Semestre très difficile : Kylian...`;

            const result = convertMbnBilan(rawData);
            const lines = result.split('\n');

            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe('DOUILLOT DARDENNE Kylian\t2\t7.0\tSemestre très difficile : Kylian...');
        });

        it('should handle compound hyphenated names split mid-word (e.g. MAKARS--TREUTENAERE Lisa)', () => {
            const rawData = `Bilan des appréciations du premier semestre
Élève Dev. Moy. Acquisitions
MAKARS--TREUTENA
ERE Lisa 2 14,5 Bon semestre : Lisa fait preuv...`;

            const result = convertMbnBilan(rawData);
            const lines = result.split('\n');

            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe('MAKARS--TREUTENAERE Lisa\t2\t14.5\tBon semestre : Lisa fait preuv...');
        });

        it('should handle multi-line split first names (e.g. SALI Zeynel Abedin \\n Yasir)', () => {
            const rawData = `Bilan des appréciations du premier semestre
Élève Dev. Moy. Acquisitions
SALI Zeynel Abedin
Yasir 2 12,0 Semestre satisfaisant.`;

            const result = convertMbnBilan(rawData);
            const lines = result.split('\n');

            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe('SALI Zeynel Abedin Yasir\t2\t12.0\tSemestre satisfaisant.');
        });
    });
});
