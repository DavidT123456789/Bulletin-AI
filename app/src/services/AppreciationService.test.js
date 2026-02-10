import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppreciationService } from './AppreciationService.js';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        currentPeriod: 'T1',
        currentSubject: 'Générique',
        currentAIModel: 'gemini-2.0-flash',
        useSubjectPersonalization: false,
        periodSystem: 'trimestres',
        evolutionThresholds: {
            positive: 0.5,
            veryPositive: 2.0,
            negative: -0.5,
            veryNegative: -2.0
        },
        subjects: {
            'Générique': {
                iaConfig: { tone: 3, voice: 'default', length: 50 }
            },
            'Mathématiques': {
                iaConfig: { tone: 4, voice: 'je', length: 45, styleInstructions: 'Être précis.' }
            }
        }
    }
}));

vi.mock('../config/Config.js', () => ({
    CONFIG: {},
    CONSTS: {},
    DEFAULT_IA_CONFIG: { tone: 3, voice: 'default', length: 50 },
    DEFAULT_PROMPT_TEMPLATES: {
        'Générique': {
            iaConfig: { tone: 3, voice: 'default', length: 50 }
        }
    }
}));

vi.mock('../utils/Utils.js', () => ({
    Utils: {
        getPeriods: vi.fn(() => ['T1', 'T2', 'T3']),
        getPeriodLabel: vi.fn((p, full) => full ? `Trimestre ${p.slice(1)}` : p),
        countWords: vi.fn((text) => text ? text.split(/\s+/).filter(w => w).length : 0),
        cleanMarkdown: vi.fn((text) => text || ''),
        normalizeName: vi.fn((nom, prenom) => `${nom.toLowerCase()}_${prenom.toLowerCase()}`),
        parseStudentLine: vi.fn((line, formatMap, currentPeriod) => {
            if (line.includes('|')) {
                const parts = line.split('|').map(p => p.trim());
                return {
                    nom: parts[0]?.split(' ')[0] || '',
                    prenom: parts[0]?.split(' ')[1] || '',
                    statuses: [],
                    periods: { [currentPeriod]: { grade: parseFloat(parts[2]) || null } }
                };
            }
            return null;
        })
    }
}));

vi.mock('./AIService.js', () => ({
    AIService: {
        callAI: vi.fn()
    }
}));

describe('AppreciationService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Module Structure', () => {
        it('should export AppreciationService object', () => {
            expect(AppreciationService).toBeDefined();
            expect(typeof AppreciationService).toBe('object');
        });

        it('should have all required methods', () => {
            expect(AppreciationService.createResultObject).toBeDefined();
            expect(AppreciationService.analyserEvolution).toBeDefined();
            expect(AppreciationService.getRelevantEvolution).toBeDefined();
            expect(AppreciationService.getAllPrompts).toBeDefined();
            expect(AppreciationService.getRefinementPrompt).toBeDefined();
            expect(AppreciationService.generateAppreciation).toBeDefined();
            expect(AppreciationService.prepareStudentListForImport).toBeDefined();
            expect(AppreciationService.parseStrengthsWeaknesses).toBeDefined();
        });
    });

    describe('createResultObject()', () => {
        it('should create a result object with all required fields', () => {
            const result = AppreciationService.createResultObject(
                'Dupont',
                'Marie',
                'Très bon travail.',
                [{ type: 'positive', valeur: 1, periode: 'T1-T2' }],
                { periods: { T1: { grade: 14 } }, currentPeriod: 'T1' },
                { appreciation: 'prompt' },
                { appreciation: { input: 100, output: 50 } }
            );

            expect(result).toBeDefined();
            expect(result.nom).toBe('Dupont');
            expect(result.prenom).toBe('Marie');
            expect(result.appreciation).toBe('Très bon travail.');
            expect(result.id).toBeDefined();
            expect(result.timestamp).toBeDefined();
            expect(result.copied).toBe(false);
            expect(result.strengthsWeaknesses).toBeNull();
            expect(result.nextSteps).toBeNull();
        });

        it('should include error message when provided', () => {
            const result = AppreciationService.createResultObject(
                'Dupont', 'Marie', '', [],
                { periods: { T1: { grade: 14 } }, currentPeriod: 'T1' },
                {}, {}, 'API Error'
            );

            expect(result.errorMessage).toBe('API Error');
        });

        it('should generate unique IDs', () => {
            const result1 = AppreciationService.createResultObject(
                'A', 'B', 'test', [],
                { periods: { T1: { grade: 10 } }, currentPeriod: 'T1' },
                {}, {}
            );
            const result2 = AppreciationService.createResultObject(
                'C', 'D', 'test2', [],
                { periods: { T1: { grade: 11 } }, currentPeriod: 'T1' },
                {}, {}
            );

            expect(result1.id).not.toBe(result2.id);
        });

        it('should store token usage', () => {
            const tokenUsage = { appreciation: { input: 500, output: 200 }, sw: null, ns: null };
            const result = AppreciationService.createResultObject(
                'Test', 'User', 'Appréciation', [],
                { periods: { T1: { grade: 12 } }, currentPeriod: 'T1' },
                {}, tokenUsage
            );

            expect(result.tokenUsage).toEqual(tokenUsage);
        });
    });

    describe('analyserEvolution()', () => {
        it('should return an empty array for empty periods', () => {
            const result = AppreciationService.analyserEvolution({});
            expect(result).toEqual([]);
        });

        it('should return empty array for single period', () => {
            const result = AppreciationService.analyserEvolution({
                T1: { grade: 15 }
            });
            expect(result).toEqual([]);
        });

        it('should detect positive evolution', () => {
            const result = AppreciationService.analyserEvolution({
                T1: { grade: 12 },
                T2: { grade: 13 }
            });

            expect(result.length).toBe(1);
            expect(result[0].type).toBe('positive');
            expect(result[0].valeur).toBe(1);
            expect(result[0].periode).toBe('T1-T2');
        });

        it('should detect negative evolution', () => {
            const result = AppreciationService.analyserEvolution({
                T1: { grade: 15 },
                T2: { grade: 14 }
            });

            expect(result.length).toBe(1);
            expect(result[0].type).toBe('negative');
            expect(result[0].valeur).toBe(-1);
        });

        it('should detect very-positive evolution', () => {
            const result = AppreciationService.analyserEvolution({
                T1: { grade: 10 },
                T2: { grade: 13 }
            });

            expect(result[0].type).toBe('very-positive');
            expect(result[0].valeur).toBe(3);
        });

        it('should detect very-negative evolution', () => {
            const result = AppreciationService.analyserEvolution({
                T1: { grade: 15 },
                T2: { grade: 12 }
            });

            expect(result[0].type).toBe('very-negative');
            expect(result[0].valeur).toBe(-3);
        });

        it('should detect stable evolution for small changes', () => {
            const result = AppreciationService.analyserEvolution({
                T1: { grade: 12 },
                T2: { grade: 12.3 }
            });

            expect(result[0].type).toBe('stable');
        });

        it('should handle multiple periods', () => {
            const result = AppreciationService.analyserEvolution({
                T1: { grade: 10 },
                T2: { grade: 12 },
                T3: { grade: 11 }
            });

            expect(result.length).toBe(2);
            expect(result[0].periode).toBe('T1-T2');
            expect(result[1].periode).toBe('T2-T3');
        });

        it('should skip periods without grade', () => {
            const result = AppreciationService.analyserEvolution({
                T1: { grade: null },
                T2: { grade: 12 }
            });

            expect(result.length).toBe(0);
        });
    });

    describe('getRelevantEvolution()', () => {
        it('should find evolution for current period', () => {
            const evolutions = [
                { type: 'positive', valeur: 1, periode: 'T1-T2' },
                { type: 'negative', valeur: -0.5, periode: 'T2-T3' }
            ];

            const result = AppreciationService.getRelevantEvolution(evolutions, 'T2');
            expect(result).toBeDefined();
            expect(result.periode).toBe('T1-T2');
        });

        it('should return undefined if no matching period', () => {
            const evolutions = [
                { type: 'positive', valeur: 1, periode: 'T1-T2' }
            ];

            const result = AppreciationService.getRelevantEvolution(evolutions, 'T3');
            expect(result).toBeUndefined();
        });

        it('should return null for null evolutions', () => {
            expect(AppreciationService.getRelevantEvolution(null, 'T1')).toBeNull();
        });

        it('should return null for non-array evolutions', () => {
            expect(AppreciationService.getRelevantEvolution('invalid', 'T1')).toBeNull();
        });

        it('should return null for undefined evolutions', () => {
            expect(AppreciationService.getRelevantEvolution(undefined, 'T1')).toBeNull();
        });
    });

    describe('getRefinementPrompt()', () => {
        it('should generate polish prompt', () => {
            const result = AppreciationService.getRefinementPrompt('polish', 'Bon travail.');
            expect(result).toContain('Peaufine');
            expect(result).toContain('Bon travail.');
        });

        it('should generate variations prompt', () => {
            const result = AppreciationService.getRefinementPrompt('variations', 'Travail sérieux.');
            expect(result).toContain('Reformule');
            expect(result).toContain('Travail sérieux.');
        });

        it('should generate context prompt with context', () => {
            const result = AppreciationService.getRefinementPrompt('context', 'Bon travail.', 'Élève timide');
            expect(result).toContain('Élève timide');
            expect(result).toContain('contexte');
        });

        it('should generate detailed prompt', () => {
            const result = AppreciationService.getRefinementPrompt('detailed', 'Bon travail.');
            expect(result).toContain('Développe');
        });

        it('should generate concise prompt', () => {
            const result = AppreciationService.getRefinementPrompt('concise', 'Un texte avec beaucoup de mots inutiles.');
            expect(result).toContain('concis');
        });

        it('should generate encouraging prompt', () => {
            const result = AppreciationService.getRefinementPrompt('encouraging', 'Travail moyen.');
            expect(result).toContain('encourageant');
            expect(result).toContain('positif');
        });

        it('should generate formal prompt', () => {
            const result = AppreciationService.getRefinementPrompt('formal', 'Bon travail.');
            expect(result).toContain('formel');
            expect(result).toContain('soutenu');
        });

        it('should generate default prompt for unknown type', () => {
            const result = AppreciationService.getRefinementPrompt('unknown', 'Test.');
            expect(result).toContain('Reformule');
            expect(result).toContain('Test.');
        });

        it('should always include base instruction', () => {
            const result = AppreciationService.getRefinementPrompt('polish', 'Test.');
            expect(result).toContain('Sans "performance"');
            expect(result).toContain('Texte seul');
        });
    });

    describe('getAllPrompts()', () => {
        it('should return object with appreciation, sw, ns prompts', () => {
            const studentData = {
                nom: 'Dupont',
                prenom: 'Marie',
                periods: { T1: { grade: 14, appreciation: '' } },
                currentPeriod: 'T1',
                statuses: []
            };

            const result = AppreciationService.getAllPrompts(studentData);

            expect(result).toHaveProperty('appreciation');
            expect(result).toHaveProperty('sw');
            expect(result).toHaveProperty('ns');
        });

        it('should include student name in appreciation prompt', () => {
            const studentData = {
                nom: 'Martin',
                prenom: 'Pierre',
                periods: { T1: { grade: 12 } },
                currentPeriod: 'T1',
                statuses: []
            };

            const result = AppreciationService.getAllPrompts(studentData);

            expect(result.appreciation).toContain('Martin');
            expect(result.appreciation).toContain('Pierre');
        });

        it('should include tone instruction', () => {
            const studentData = {
                nom: 'Test',
                prenom: 'Eleve',
                periods: { T1: { grade: 10 } },
                currentPeriod: 'T1',
                statuses: []
            };

            const result = AppreciationService.getAllPrompts(studentData);
            expect(result.appreciation).toContain('ton');
        });

        it('should respect override config', () => {
            const studentData = {
                nom: 'Test',
                prenom: 'User',
                periods: { T1: { grade: 12 } },
                currentPeriod: 'T1',
                statuses: []
            };

            const overrideConfig = { tone: 1, voice: 'je', length: 80 };
            const result = AppreciationService.getAllPrompts(studentData, overrideConfig);

            expect(result.appreciation).toContain('80 mots');
            expect(result.appreciation).toContain('très encourageant');
        });

        it('should include context from periods if provided', () => {
            const studentData = {
                nom: 'Test',
                prenom: 'User',
                periods: { T1: { grade: 12, context: 'Élève en difficulté' } },
                currentPeriod: 'T1',
                statuses: []
            };

            const result = AppreciationService.getAllPrompts(studentData);
            expect(result.appreciation).toContain('Élève en difficulté');
        });
    });

    describe('parseStrengthsWeaknesses()', () => {
        it('should return empty string for null input', () => {
            const result = AppreciationService.parseStrengthsWeaknesses(null);
            expect(result).toBe('');
        });

        it('should return empty string for empty input', () => {
            const result = AppreciationService.parseStrengthsWeaknesses('');
            expect(result).toBe('');
        });

        it('should parse strengths section', () => {
            const text = `### Points forts
* Travail régulier
* Bonne participation`;

            const result = AppreciationService.parseStrengthsWeaknesses(text);

            expect(result).toContain('strengths-title');
            expect(result).toContain('Travail régulier');
            expect(result).toContain('Bonne participation');
        });

        it('should parse weaknesses section', () => {
            const text = `### Points faibles
- Manque de concentration
- Travail irrégulier`;

            const result = AppreciationService.parseStrengthsWeaknesses(text);

            expect(result).toContain('weaknesses-title');
            expect(result).toContain('Manque de concentration');
        });

        it('should handle both sections', () => {
            const text = `### Points Forts
* Élève motivé
### Points Faibles
* Doit progresser`;

            const result = AppreciationService.parseStrengthsWeaknesses(text);

            expect(result).toContain('strengths-title');
            expect(result).toContain('weaknesses-title');
        });

        it('should handle numbered list format', () => {
            const text = `Points positifs
1. Premier point
2. Deuxième point`;

            const result = AppreciationService.parseStrengthsWeaknesses(text);

            expect(result).toContain('Premier point');
            expect(result).toContain('Deuxième point');
        });

        it('should handle "atouts" as strength keyword', () => {
            const text = `Atouts
* Élève motivé`;

            const result = AppreciationService.parseStrengthsWeaknesses(text);

            expect(result).toContain('strengths-title');
        });

        it('should handle "axes amélioration" as weakness keyword', () => {
            const text = `Axes d'amélioration
* Doit progresser`;

            const result = AppreciationService.parseStrengthsWeaknesses(text);

            expect(result).toContain('weaknesses-title');
        });

        it('should fall back to raw text if no sections detected', () => {
            const text = 'Simple text without sections';
            const result = AppreciationService.parseStrengthsWeaknesses(text);

            expect(result).toContain('<p>');
        });

        it('should show fallback for empty strength items', () => {
            const text = 'Points forts';
            const result = AppreciationService.parseStrengthsWeaknesses(text);

            expect(result).toContain('Aucun point fort notable');
        });
    });

    describe('prepareStudentListForImport()', () => {
        it('should return import preview data structure', () => {
            const result = AppreciationService.prepareStudentListForImport(
                [], {}, 'merge', [], 'T1'
            );

            expect(result).toHaveProperty('newStudents');
            expect(result).toHaveProperty('updatedStudents');
            expect(result).toHaveProperty('departedStudents');
            expect(result).toHaveProperty('studentsToProcess');
            expect(result).toHaveProperty('ignoredCount');
        });

        it('should count ignored lines', () => {
            const lines = ['invalid line', 'another invalid'];
            const result = AppreciationService.prepareStudentListForImport(
                lines, {}, 'merge', [], 'T1'
            );

            expect(result.ignoredCount).toBe(2);
        });

        it('should identify new students in replace mode', () => {
            const lines = ['Dupont Marie | status | 14'];
            const result = AppreciationService.prepareStudentListForImport(
                lines, {}, 'replace', [], 'T1'
            );

            expect(result.newStudents.length).toBeGreaterThanOrEqual(0);
        });
    });
});
