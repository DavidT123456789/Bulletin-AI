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

        it('should handle multi-line split first names (e.g. SALI Zeynel Abedin \n Yasir)', () => {
            const rawData = `Bilan des appréciations du premier semestre
Élève Dev. Moy. Acquisitions
SALI Zeynel Abedin
Yasir 2 12,0 Semestre satisfaisant.`;

            const result = convertMbnBilan(rawData);
            const lines = result.split('\n');

            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe('SALI Zeynel Abedin Yasir\t2\t12.0\tSemestre satisfaisant.');
        });

        it('should handle Arthur SONGIS PIERRON with multi-line name and tab-separated appreciation (Arthur \t Trop d\'absence...)', () => {
            const rawData = `Bilan des appréciations du premier semestre
Élève Dev. Moy. Acquisitions
SONGIS PIERRON
Arthur\tTrop d'absence pour porter un jugement sérieux ce semestre.`;

            const result = convertMbnBilan(rawData);
            const lines = result.split('\n');

            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe("SONGIS PIERRON Arthur\t\t\tTrop d'absence pour porter un jugement sérieux ce semestre.");
        });

        it('should handle multi-line names spanning 3 lines (e.g. DEBANT RAKOTO DIT \n RAZAFINDRANALY \n Michel)', () => {
            const rawData = `Bilan des appréciations du second semestre
Élève Dev. Moy. Acquisitions
DEBANT RAKOTO DIT
RAZAFINDRANALY
Michel\t2\t12,5\tBon travail.`;

            const result = convertMbnBilan(rawData);
            const lines = result.split('\n');

            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe("DEBANT RAKOTO DIT RAZAFINDRANALY Michel\t2\t12.5\tBon travail.");
        });

        it('should handle compound first names with hyphens and capital letters (e.g. THIEBAULT \n Rose-Andréa)', () => {
            const rawData = `Bilan des appréciations du premier semestre
Élève Dev. Moy. Acquisitions
THIEBAULT
Rose-Andréa\t2\t17,5 Très bon semestre : Rose-Andréa...`;

            const result = convertMbnBilan(rawData);
            const lines = result.split('\n');

            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe("THIEBAULT Rose-Andréa\t2\t17.5\tTrès bon semestre : Rose-Andréa...");
        });

        it('should stop parsing immediately when STOP_PATTERN is encountered, ignoring post-tableau text', () => {
            const rawData = `Bilan des appréciations du premier semestre
Élève Dev. Moy. Acquisitions
MARTIN Lucas 2 15,5 Très bon travail.
Appréciations de la classe
Classe dynamique et travailleuse.
Parcours éducatifs
EPI Change`;

            const result = convertMbnBilan(rawData);
            const lines = result.split('\n');

            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe("MARTIN Lucas\t2\t15.5\tTrès bon travail.");
        });

        it('should clean tab characters leaked inside appreciation text (e.g. Chen Luc)', () => {
            const rawData = `Bilan des appréciations du premier semestre
Élève Dev. Moy. Acquisitions
CHEN Luc\tAucune\t\t\tévaluation ce semestre : impossible d'apprécier le niveau de Luc.`;

            const result = convertMbnBilan(rawData);
            const lines = result.split('\n');

            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe("CHEN Luc\t\t\tAucune évaluation ce semestre : impossible d'apprécier le niveau de Luc.");
        });
    });
});
