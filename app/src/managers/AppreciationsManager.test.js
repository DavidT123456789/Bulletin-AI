import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppreciationsManager } from './AppreciationsManager.js';

// Mock dependencies
vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        getStudentData: vi.fn(),
        saveStudentData: vi.fn(),
        saveAppState: vi.fn(),
    }
}));

vi.mock('./UIManager.js', () => ({
    UI: {
        updateUI: vi.fn(),
        showNotification: vi.fn(),
        openModal: vi.fn(),
        closeModal: vi.fn(),
        showCustomConfirm: vi.fn(),
        getPeriods: vi.fn(() => ['T1', 'T2', 'T3']),
        getPeriodLabel: vi.fn((p) => p),
    }
}));

vi.mock('../services/AIService.js', () => ({
    AIService: {
        callAI: vi.fn(),
    }
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {
        resultsContainer: { innerHTML: '' },
        noResultsMessage: { style: { display: '' } },
    }
}));

vi.mock('../state/State.js', () => ({
    appState: {
        subjects: {
            'Générique': {
                iaConfig: { tone: 1, voice: 'je', length: 50 }
            }
        },
        currentSubject: 'Générique',
        useSubjectPersonalization: false,
        periodSystem: 'trimestres',
        generatedResults: [],
        filteredResults: [],
        evolutionThresholds: {
            positive: 0.5,
            veryPositive: 1.5,
            negative: -0.5,
            veryNegative: -1.5
        }
    },
    userSettings: {
        academic: {
            currentClassId: null
        }
    }
}));

describe('AppreciationsManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Module Structure', () => {
        it('should export AppreciationsManager object', () => {
            expect(AppreciationsManager).toBeDefined();
            expect(typeof AppreciationsManager).toBe('object');
        });

        it('should have init method', () => {
            expect(AppreciationsManager.init).toBeDefined();
            expect(typeof AppreciationsManager.init).toBe('function');
        });

        it('should have saveFormState method', () => {
            expect(AppreciationsManager.saveFormState).toBeDefined();
        });

        it('should have createResultObject method', () => {
            expect(AppreciationsManager.createResultObject).toBeDefined();
        });

        it('should have analyserEvolution method', () => {
            expect(AppreciationsManager.analyserEvolution).toBeDefined();
        });

        it('should have getAllPrompts method', () => {
            expect(AppreciationsManager.getAllPrompts).toBeDefined();
        });

        it('should have renderResults method', () => {
            expect(AppreciationsManager.renderResults).toBeDefined();
        });

        it('should have copyAppreciation method', () => {
            expect(AppreciationsManager.copyAppreciation).toBeDefined();
        });

        it('should have deleteAppreciation method', () => {
            expect(AppreciationsManager.deleteAppreciation).toBeDefined();
        });
    });

    describe('analyserEvolution()', () => {
        it('should return an array', () => {
            const result = AppreciationsManager.analyserEvolution({});
            expect(Array.isArray(result)).toBe(true);
        });

        it('should return empty array for empty periods', () => {
            const result = AppreciationsManager.analyserEvolution({});
            expect(result).toEqual([]);
        });

        it('should return empty array for single period', () => {
            const result = AppreciationsManager.analyserEvolution({
                T1: { grade: 15 }
            });
            expect(result).toEqual([]);
        });
    });

    describe('createResultObject()', () => {
        it('should create a result object with required fields', () => {
            const result = AppreciationsManager.createResultObject(
                'Dupont',
                'Marie',
                'Très bon travail.',
                [],
                { periods: { T1: { grade: 14 } }, currentPeriod: 'T1' },
                { main: 'prompt' },
                { input: 100, output: 50 }
            );

            expect(result).toBeDefined();
            expect(result.nom).toBe('Dupont');
            expect(result.prenom).toBe('Marie');
            expect(result.appreciation).toBe('Très bon travail.');
            expect(result.id).toBeDefined();
        });

        it('should include error message when provided', () => {
            const result = AppreciationsManager.createResultObject(
                'Dupont', 'Marie', '', [],
                { periods: { T1: { grade: 14 } }, currentPeriod: 'T1' },
                {}, {}, 'API Error'
            );

            expect(result.errorMessage).toBe('API Error');
        });

        it('should generate unique IDs', () => {
            const result1 = AppreciationsManager.createResultObject(
                'A', 'B', 'test', [],
                { periods: { T1: { grade: 10 } }, currentPeriod: 'T1' },
                {}, {}
            );
            const result2 = AppreciationsManager.createResultObject(
                'C', 'D', 'test2', [],
                { periods: { T1: { grade: 11 } }, currentPeriod: 'T1' },
                {}, {}
            );

            expect(result1.id).not.toBe(result2.id);
        });
    });

    describe('analyserEvolution() - detailed', () => {
        it('should detect positive evolution between periods', () => {
            const result = AppreciationsManager.analyserEvolution({
                T1: { grade: 12 },
                T2: { grade: 13 }  // +1 is positive, not very-positive
            });

            expect(result.length).toBe(1);
            expect(result[0].type).toBe('positive');
            expect(result[0].valeur).toBe(1);
            expect(result[0].periode).toBe('T1-T2');
        });

        it('should detect negative evolution between periods', () => {
            const result = AppreciationsManager.analyserEvolution({
                T1: { grade: 13 },
                T2: { grade: 12 }  // -1 is negative, not very-negative
            });

            expect(result.length).toBe(1);
            expect(result[0].type).toBe('negative');
            expect(result[0].valeur).toBe(-1);
        });

        it('should detect stable evolution for small changes', () => {
            const result = AppreciationsManager.analyserEvolution({
                T1: { grade: 12 },
                T2: { grade: 12.3 }
            });

            expect(result.length).toBe(1);
            expect(result[0].type).toBe('stable');
        });

        it('should detect very-positive evolution', () => {
            const result = AppreciationsManager.analyserEvolution({
                T1: { grade: 10 },
                T2: { grade: 12 }
            });

            expect(result.length).toBe(1);
            expect(result[0].type).toBe('very-positive');
        });

        it('should handle multiple periods evolution', () => {
            const result = AppreciationsManager.analyserEvolution({
                T1: { grade: 10 },
                T2: { grade: 12 },
                T3: { grade: 11 }
            });

            expect(result.length).toBe(2);
            expect(result[0].periode).toBe('T1-T2');
            expect(result[1].periode).toBe('T2-T3');
        });

        it('should skip periods without grade', () => {
            const result = AppreciationsManager.analyserEvolution({
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

            const result = AppreciationsManager.getRelevantEvolution(evolutions, 'T2');
            expect(result).toBeDefined();
            expect(result.periode).toBe('T1-T2');
        });

        it('should return null if no matching period', () => {
            const evolutions = [
                { type: 'positive', valeur: 1, periode: 'T1-T2' }
            ];

            const result = AppreciationsManager.getRelevantEvolution(evolutions, 'T3');
            expect(result).toBeUndefined();
        });

        it('should return null for null evolutions', () => {
            expect(AppreciationsManager.getRelevantEvolution(null, 'T1')).toBeNull();
        });

        it('should return null for non-array evolutions', () => {
            expect(AppreciationsManager.getRelevantEvolution('invalid', 'T1')).toBeNull();
        });
    });

    describe('getRefinementPrompt()', () => {
        it('should generate polish prompt', () => {
            const result = AppreciationsManager.getRefinementPrompt(
                'polish',
                'Bon travail élève.',
                { nom: 'Dupont', prenom: 'Marie' }
            );

            expect(result).toContain('Peaufine');
            expect(result).toContain('Bon travail élève.');
        });

        it('should generate variations prompt', () => {
            const result = AppreciationsManager.getRefinementPrompt(
                'variations',
                'Travail sérieux.',
                { nom: 'Dupont', prenom: 'Marie' }
            );

            expect(result).toContain('Reformule');
            expect(result).toContain('Travail sérieux.');
        });

        it('should generate concise prompt with 15% reduction', () => {
            const result = AppreciationsManager.getRefinementPrompt(
                'concise',
                'Un deux trois quatre cinq six sept huit neuf dix.',
                { nom: 'Dupont', prenom: 'Marie' }
            );

            expect(result).toContain('concis');
            expect(result).toContain('8 mots');
        });

        it('should generate encouraging prompt', () => {
            const result = AppreciationsManager.getRefinementPrompt(
                'encouraging',
                'Travail moyen.',
                { nom: 'Dupont', prenom: 'Marie' }
            );

            expect(result).toContain('encourageant');
            expect(result).toContain('positif');
        });

        it('should generate formal prompt', () => {
            const result = AppreciationsManager.getRefinementPrompt(
                'formal',
                'Bon travail.',
                { nom: 'Dupont', prenom: 'Marie' }
            );

            expect(result).toContain('Reformule');
        });

        it('should generate detailed prompt with 15% more words', () => {
            const result = AppreciationsManager.getRefinementPrompt(
                'detailed',
                'Bon travail cette période.',
                { nom: 'Dupont', prenom: 'Marie' }
            );

            expect(result).toContain('Développe');
        });
    });

    describe('parseStrengthsWeaknesses()', () => {
        it('should return empty string for null input', () => {
            const result = AppreciationsManager.parseStrengthsWeaknesses(null);
            expect(result).toBe('');
        });

        it('should return empty string for empty input', () => {
            const result = AppreciationsManager.parseStrengthsWeaknesses('');
            expect(result).toBe('');
        });

        it('should parse strengths with markdown list', () => {
            const text = `### Points forts
* Travail régulier
* Bonne participation
### Points faibles
* Attention dispersée`;

            const result = AppreciationsManager.parseStrengthsWeaknesses(text);

            expect(result).toContain('strengths-title');
            expect(result).toContain('Travail régulier');
            expect(result).toContain('Bonne participation');
        });

        it('should parse weaknesses with dash list', () => {
            const text = `### Points faibles
- Manque de concentration
- Travail irrégulier`;

            const result = AppreciationsManager.parseStrengthsWeaknesses(text);

            expect(result).toContain('weaknesses-title');
            expect(result).toContain('Manque de concentration');
        });

        it('should parse numbered list format', () => {
            const text = `Points positifs
1. Premier point
2. Deuxième point`;

            const result = AppreciationsManager.parseStrengthsWeaknesses(text);

            expect(result).toContain('Premier point');
            expect(result).toContain('Deuxième point');
        });

        it('should handle atouts as strength keyword', () => {
            const text = `Atouts
* Élève motivé`;

            const result = AppreciationsManager.parseStrengthsWeaknesses(text);

            expect(result).toContain('strengths-title');
            expect(result).toContain('Élève motivé');
        });

        it('should handle axes amélioration as weakness keyword', () => {
            const text = `Axes d'amélioration
* Doit progresser`;

            const result = AppreciationsManager.parseStrengthsWeaknesses(text);

            expect(result).toContain('weaknesses-title');
            expect(result).toContain('Doit progresser');
        });

        it('should fall back to raw text if no sections detected', () => {
            const text = 'Simple text without sections';
            const result = AppreciationsManager.parseStrengthsWeaknesses(text);

            expect(result).toContain('<p>');
            expect(result).toContain('Simple text without sections');
        });

        it('should show fallback message for empty strength items', () => {
            const text = `Points forts`;

            const result = AppreciationsManager.parseStrengthsWeaknesses(text);

            expect(result).toContain('Aucun point fort notable');
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

            const result = AppreciationsManager.getAllPrompts(studentData);

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

            const result = AppreciationsManager.getAllPrompts(studentData);

            expect(result.appreciation).toContain('PRÉNOM');
            expect(result.appreciation).toContain('NOM');
        });

        it('should include tone instruction in appreciation prompt', () => {
            const studentData = {
                nom: 'Test',
                prenom: 'Eleve',
                periods: { T1: { grade: 10 } },
                currentPeriod: 'T1',
                statuses: []
            };

            const result = AppreciationsManager.getAllPrompts(studentData);

            expect(result.appreciation).toContain('ton');
        });
    });

    describe('clearAllResults()', () => {
        it('should have clearAllResults method', () => {
            expect(AppreciationsManager.clearAllResults).toBeDefined();
            expect(typeof AppreciationsManager.clearAllResults).toBe('function');
        });
    });

    describe('loadSampleData()', () => {
        it('should have loadSampleData method', () => {
            expect(AppreciationsManager.loadSampleData).toBeDefined();
            expect(typeof AppreciationsManager.loadSampleData).toBe('function');
        });
    });

    describe('saveFormState()', () => {
        it('should return without error', () => {
            expect(() => AppreciationsManager.saveFormState()).not.toThrow();
        });
    });

    describe('init()', () => {
        it('should accept an app instance', () => {
            const mockApp = { name: 'test' };
            expect(() => AppreciationsManager.init(mockApp)).not.toThrow();
        });
    });

    describe('massImportAbortController', () => {
        it('should have massImportAbortController property', () => {
            expect(AppreciationsManager).toHaveProperty('massImportAbortController');
        });

        it('should be null initially', () => {
            expect(AppreciationsManager.massImportAbortController).toBeNull();
        });
    });
});

