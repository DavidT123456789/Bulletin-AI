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

        it('should clean origin class annotation from group trombinoscopes', () => {
            expect(splitStudentFullName('BOUKHARI Sami (3 1)')).toEqual({
                nom: 'BOUKHARI',
                prenom: 'Sami',
                originClass: '3 1'
            });
            expect(splitStudentFullName('ERDOGAN PAUTRAS Helin (3 1)')).toEqual({
                nom: 'ERDOGAN PAUTRAS',
                prenom: 'Helin',
                originClass: '3 1'
            });
            expect(splitStudentFullName('CHARLOT Mila (3 4)')).toEqual({
                nom: 'CHARLOT',
                prenom: 'Mila',
                originClass: '3 4'
            });
            expect(splitStudentFullName('BULTE--LAURIA Alexis (6°2)')).toEqual({
                nom: 'BULTE--LAURIA',
                prenom: 'Alexis',
                originClass: '6°2'
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
            expect(meta.isGroup).toBe(false);
        });

        it('should handle alternative class notations', () => {
            const raw = 'Trombinoscope de la classe 6ème B 26 élèves';
            const meta = extractTrombiMetadata(raw);
            expect(meta.className).toBe('6ème B');
            expect(meta.totalStudents).toBe(26);
            expect(meta.isGroup).toBe(false);
        });

        it('should extract group name and isGroup flag from group trombinoscope', () => {
            const raw = `
                Collège Jean Monnet - Epernay Année scolaire 2026-2027
                Trombinoscope du groupe 3 TECHNOLOGIE G1
                20 élèves
            `;
            const meta = extractTrombiMetadata(raw);
            expect(meta.className).toBe('3 TECHNOLOGIE G1');
            expect(meta.totalStudents).toBe(20);
            expect(meta.schoolName).toBe('Collège Jean Monnet - Epernay');
            expect(meta.isGroup).toBe(true);
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

        it('should align student without photo with classmates on the same row', () => {
            const mockViewport = {
                width: 1200,
                height: 1600,
                scale: 2,
                convertToViewportPoint: (x, y) => [x, y]
            };

            // 2 colonnes, 2 lignes :
            // Ligne 1 : CASTEL Gaultier (col 1, avec photo), DA COSTA Gjallim (col 2, avec photo)
            // Ligne 2 : ENFERT Tom (col 1, SANS photo), ENNAJI Sofia (col 2, avec photo)
            const mockItems = [
                // Row 1
                { str: 'CASTEL Gaultier', transform: [0, 0, 0, 0, 200, 300], width: 100, height: 10 },
                { str: 'DA COSTA Gjallim', transform: [0, 0, 0, 0, 600, 300], width: 100, height: 10 },
                // Row 2 : ENFERT Tom a des initiales "ET" dans sa boîte photo
                { str: 'ET', transform: [0, 0, 0, 0, 200, 480], width: 30, height: 20 },
                { str: 'ENFERT Tom', transform: [0, 0, 0, 0, 200, 600], width: 80, height: 10 },
                { str: 'ENNAJI Sofia', transform: [0, 0, 0, 0, 600, 600], width: 80, height: 10 }
            ];

            // Images réelles : CASTEL (row 1, col 1), DA COSTA (row 1, col 2), ENNAJI (row 2, col 2)
            // ENFERT Tom n'a PAS d'image (juste le carré gris avec "ET")
            const mockImages = [
                // CASTEL : photo centrée à Y=200, hauteur=140
                { x: 130, y: 130, width: 140, height: 140, cx: 200, cy: 200, r: 70 },
                // DA COSTA : photo centrée à Y=200, hauteur=140
                { x: 530, y: 130, width: 140, height: 140, cx: 600, cy: 200, r: 70 },
                // ENNAJI : photo centrée à Y=500, hauteur=140
                { x: 530, y: 430, width: 140, height: 140, cx: 600, cy: 500, r: 70 }
            ];

            const students = extractStudentsFromTextItems(mockItems, mockViewport, 0, mockImages);

            // "ET" ne doit PAS être un élève ! Il y a exactement 4 élèves
            expect(students).toHaveLength(4);

            const tom = students.find(s => s.prenom === 'Tom');
            const sofia = students.find(s => s.prenom === 'Sofia');
            const gaultier = students.find(s => s.prenom === 'Gaultier');

            expect(tom).toBeDefined();
            expect(sofia).toBeDefined();
            expect(gaultier).toBeDefined();

            // Tom doit être aligné horizontalement sur sa colonne (X ~ 200)
            expect(tom.zone.cx).toBeCloseTo(tom.colCenterX, 0);

            // Crucial : Le centre Y de Tom doit être parfaitement aligné avec celui de Sofia (sa camarade de ligne)
            expect(tom.zone.cy).toBe(sofia.zone.cy);

            // Le rayon de Tom doit être identique à celui de Sofia
            expect(tom.zone.r).toBe(sofia.zone.r);

            // La boîte photo de Tom doit être au même niveau Y que celle de Sofia
            expect(tom.photoBounds.y).toBe(sofia.photoBounds.y);
            expect(tom.photoBounds.height).toBe(sofia.photoBounds.height);

            // Et Tom ne doit PAS empiéter sur Gaultier (ligne du dessus)
            expect(tom.zone.cy).toBeGreaterThan(gaultier.textY);
        });

        it('should use document-wide calibration when an entire row has no photos', () => {
            const mockViewport = {
                width: 1200,
                height: 1600,
                scale: 2,
                convertToViewportPoint: (x, y) => [x, y]
            };

            // Row 1 a des photos, Row 2 n'a aucune photo
            const mockItems = [
                { str: 'ALVES Lucas', transform: [0, 0, 0, 0, 200, 300], width: 100, height: 10 },
                { str: 'BERNARD Julie', transform: [0, 0, 0, 0, 600, 300], width: 100, height: 10 },
                { str: 'CLAUDE Eric', transform: [0, 0, 0, 0, 200, 600], width: 80, height: 10 },
                { str: 'DUPONT Marie', transform: [0, 0, 0, 0, 600, 600], width: 80, height: 10 }
            ];

            // Seule Row 1 a des images
            const mockImages = [
                { x: 130, y: 130, width: 140, height: 140, cx: 200, cy: 200, r: 70 },
                { x: 530, y: 130, width: 140, height: 140, cx: 600, cy: 200, r: 70 }
            ];

            const students = extractStudentsFromTextItems(mockItems, mockViewport, 0, mockImages);
            expect(students).toHaveLength(4);

            const eric = students.find(s => s.prenom === 'Eric');
            const marie = students.find(s => s.prenom === 'Marie');

            // Eric et Marie doivent avoir le même rayon calibré que les élèves de Row 1
            expect(eric.zone.r).toBe(Math.round(70 * 0.94));
            expect(marie.zone.r).toBe(Math.round(70 * 0.94));

            // Eric et Marie doivent être alignés sur le même Y
            expect(eric.zone.cy).toBe(marie.zone.cy);
            expect(eric.zone.cy).toBeGreaterThan(300); // Bien en-dessous de Row 1
        });

        it('should clean class annotations and extract originClass in group trombinoscopes', () => {
            const mockViewport = {
                width: 1200,
                height: 1600,
                scale: 2,
                convertToViewportPoint: (x, y) => [x, y]
            };

            // Simule un trombinoscope de groupe Pronote avec la classe sous le nom
            const mockItems = [
                // Col 1 : BOUKHARI Sami, puis (3 1) en-dessous
                { str: 'BOUKHARI Sami', transform: [0, 0, 0, 0, 200, 300], width: 100, height: 10 },
                { str: '(3 1)', transform: [0, 0, 0, 0, 200, 320], width: 30, height: 10 },
                // Col 2 : Multi-lignes ERDOGAN PAUTRAS, Helin, puis (3 1)
                { str: 'ERDOGAN PAUTRAS', transform: [0, 0, 0, 0, 600, 300], width: 120, height: 10 },
                { str: 'Helin', transform: [0, 0, 0, 0, 600, 320], width: 40, height: 10 },
                { str: '(3 1)', transform: [0, 0, 0, 0, 600, 340], width: 30, height: 10 },
                // Col 1, ligne 2 : CHARLOT Mila avec classe (3 4)
                { str: 'CHARLOT Mila', transform: [0, 0, 0, 0, 200, 600], width: 90, height: 10 },
                { str: '(3 4)', transform: [0, 0, 0, 0, 200, 620], width: 30, height: 10 }
            ];

            const students = extractStudentsFromTextItems(mockItems, mockViewport, 0);

            // Exactement 3 élèves détectés (les (3 1) et (3 4) ne sont pas des élèves)
            expect(students).toHaveLength(3);

            const sami = students.find(s => s.prenom === 'Sami');
            expect(sami).toBeDefined();
            expect(sami.nom).toBe('BOUKHARI');
            expect(sami.prenom).toBe('Sami');
            expect(sami.originClass).toBe('3 1');

            const helin = students.find(s => s.prenom === 'Helin');
            expect(helin).toBeDefined();
            expect(helin.nom).toBe('ERDOGAN PAUTRAS');
            expect(helin.prenom).toBe('Helin');
            expect(helin.originClass).toBe('3 1');

            const mila = students.find(s => s.prenom === 'Mila');
            expect(mila).toBeDefined();
            expect(mila.nom).toBe('CHARLOT');
            expect(mila.prenom).toBe('Mila');
            expect(mila.originClass).toBe('3 4');
        });
    });
});
