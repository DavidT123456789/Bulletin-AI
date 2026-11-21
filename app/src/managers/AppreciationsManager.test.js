import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UI } from './UIManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { AIService } from '../services/AIService.js';
import { appState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';

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
        callAIWithFallback: vi.fn(),
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

    describe('getAllPrompts()', () => {
        it('should return object with appreciation and unified analysis prompts', () => {
            const studentData = {
                nom: 'Dupont',
                prenom: 'Marie',
                periods: { T1: { grade: 14, appreciation: '' } },
                currentPeriod: 'T1',
                statuses: []
            };

            const result = AppreciationsManager.getAllPrompts(studentData);

            expect(result).toHaveProperty('appreciation');
            expect(result).toHaveProperty('analysis');
            expect(result).toHaveProperty('analysisSystem');
            expect(result).toHaveProperty('analysisUser');
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

    describe('_parseStudentAnalysisResponse() & generateStudentAnalysis()', () => {
        beforeEach(() => {
            AppreciationsManager.init({}, {
                ...UI,
                checkAPIKeyPresence: vi.fn(() => true),
                showNotification: vi.fn()
            });
            appState.currentPeriod = 'T2';
            appState.anonymizeData = true;
            appState.generatedResults = [
                {
                    id: 'stu-ana-1',
                    nom: 'Moreau',
                    prenom: 'Chloé',
                    classId: 'c1',
                    studentData: {
                        nom: 'Moreau',
                        prenom: 'Chloé',
                        statuses: [],
                        currentPeriod: 'T2',
                        periods: {
                            T1: { grade: 11, appreciation: 'Début encourageant.' },
                            T2: { grade: 14, appreciation: 'Chloé progresse avec régularité.' }
                        },
                        prompts: {}
                    }
                }
            ];
        });

        it('should parse fenced JSON analysis with empty vigilances and deanonymize student first name', () => {
            const raw = '```json\n{\n  "strengths": ["[PRÉNOM] participe activement", "Travail soigné"],\n  "vigilances": [],\n  "nextSteps": ["Poursuivre l\'approfondissement"]\n}\n```';
            const parsed = AppreciationsManager._parseStudentAnalysisResponse(raw, 'Chloé');

            expect(parsed).toEqual({
                strengths: ['Chloé participe activement', 'Travail soigné'],
                weaknesses: [],
                nextSteps: ['Poursuivre l\'approfondissement']
            });
        });

        it('should fall back cleanly on Markdown sections when model ignores JSON schema', () => {
            const raw = `### Points forts\n- Participation dynamique\n- Copies rigoureuses\n\n### Points de vigilance\n- Précipitations en DS\n\n### Pistes de progrès\n1. Relire systématiquement les énoncés`;
            const parsed = AppreciationsManager._parseStudentAnalysisResponse(raw, 'Chloé');

            expect(parsed.strengths).toEqual(['Participation dynamique', 'Copies rigoureuses']);
            expect(parsed.weaknesses).toEqual(['Précipitations en DS']);
            expect(parsed.nextSteps).toEqual(['Relire systématiquement les énoncés']);

            const boldColonRaw = `**Points forts** :\n- Sérieuse\n\n**Points de vigilance**:\n- Manque de méthode\n\n**Pistes de progrès** :\n- Structurer ses brouillons`;
            const parsedBoldColon = AppreciationsManager._parseStudentAnalysisResponse(boldColonRaw, 'Chloé');
            expect(parsedBoldColon.strengths).toEqual(['Sérieuse']);
            expect(parsedBoldColon.weaknesses).toEqual(['Manque de méthode']);
            expect(parsedBoldColon.nextSteps).toEqual(['Structurer ses brouillons']);
        });

        it('should send unified systemPrompt, store period-scoped analysis, deanonymize and update tokenUsage.analysis', async () => {
            AIService.callAIWithFallback.mockResolvedValueOnce({
                text: JSON.stringify({
                    strengths: ['[PRÉNOM] s\'investit pleinement'],
                    vigilances: ['Hésitations en expression orale'],
                    nextSteps: ['Préparer des fiches d\'argumentation orale']
                }),
                usage: { total_tokens: 185 },
                modelUsed: 'gemini-4-flash'
            });

            const entry = await AppreciationsManager.generateStudentAnalysis('stu-ana-1', 'T2', true);

            expect(AIService.callAIWithFallback).toHaveBeenCalledTimes(1);
            const [sentUserPrompt, callOptions] = AIService.callAIWithFallback.mock.calls[0];
            expect(sentUserPrompt).toContain('[PRÉNOM]');
            expect(sentUserPrompt).not.toMatch(/\bChloé\b/i);
            expect(callOptions.systemPrompt).toContain('"strengths"');
            expect(callOptions.context).toBe('single-student');

            expect(entry.strengths).toEqual(['Chloé s\'investit pleinement']);
            expect(entry.weaknesses).toEqual(['Hésitations en expression orale']);
            expect(entry.nextSteps).toEqual(['Préparer des fiches d\'argumentation orale']);
            expect(entry.model).toBe('gemini-4-flash');

            const student = appState.generatedResults[0];
            expect(student.analysisPerPeriod.T2).toBe(entry);
            expect(student.analysisPerPeriod.T1).toBeUndefined();
            expect(student.tokenUsage.analysis).toEqual({ total_tokens: 185 });
            expect(student.analysisGenerationPeriod).toBe('T2');
            expect(StorageManager.saveAppState).toHaveBeenCalled();
        });
    });

    describe('generateAppreciation() — nettoyage léger de sortie', () => {
        it('retire les préfixes parasites et guillemets englobants avant désanonymisation sans altérer la ponctuation interne', async () => {
            UI.checkAPIKeyPresence = vi.fn(() => true);
            AppreciationsManager.init({}, UI);

            AIService.callAIWithFallback.mockResolvedValueOnce({
                text: 'Appréciation : « Le travail de [PRÉNOM] est sérieux : à poursuivre ; très bien. »',
                usage: { total_tokens: 90 },
                generationTimeMs: 420,
                modelUsed: 'albert-openweight-medium'
            });

            const res = await AppreciationsManager.generateAppreciation({
                nom: 'MARTIN',
                prenom: 'Arthur',
                statuses: [],
                currentPeriod: 'T1',
                periods: { T1: { grade: 15 } }
            });

            expect(res.appreciation).toBe("Le travail d'Arthur est sérieux : à poursuivre ; très bien.");
        });
    });
});

