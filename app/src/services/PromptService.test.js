
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptService } from './PromptService.js';
import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { StatsService } from './StatsService.js';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        currentSubject: 'Générique',
        useSubjectPersonalization: false,
        anonymizeData: true,
        subjects: {
            'Générique': { iaConfig: { tone: 3, voice: 'je', length: 50 } },
            'Mathématiques': {
                iaConfig: { tone: 1, voice: 'nous', length: 30 }
            }
        }
    }
}));

vi.mock('../config/Config.js', () => ({
    DEFAULT_IA_CONFIG: { tone: 3, voice: 'je', length: 50 },
    DEFAULT_PROMPT_TEMPLATES: {
        "Générique": { iaConfig: { tone: 3, voice: 'je', length: 50 } }
    }
}));

vi.mock('../utils/Utils.js', async (importOriginal) => ({
    Utils: {
        ...(await importOriginal()).Utils,
        getPeriods: vi.fn(),
        getPeriodLabel: vi.fn(),
        countWords: vi.fn(s => s ? s.split(' ').length : 0),
        cleanMarkdown: vi.fn(s => s),
        detectGender: vi.fn(() => 'neutre')
    }
}));

vi.mock('./StatsService.js', async (importOriginal) => ({
    StatsService: {
        ...(await importOriginal()).StatsService,
        analyserEvolution: vi.fn()
    }
}));

describe('PromptService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset appState mocks manually if needed, but for simple tests defined above is fine
        // Default mocks
        Utils.getPeriods.mockReturnValue(['T1']);
        Utils.getPeriodLabel.mockImplementation((p) => p);
        StatsService.analyserEvolution.mockReturnValue([]);
        PromptService._classStatsCache.clear();
    });

    describe('getAllPrompts', () => {
        const mockStudentData = {
            nom: 'DOE',
            prenom: 'John',
            statuses: [],
            periods: { 'T1': { grade: 12, appreciation: 'Good' } },
            currentPeriod: 'T1'
        };

        it('should generate generic prompt correctly', () => {
            appState.useSubjectPersonalization = false;
            appState.currentSubject = 'Générique';

            const prompts = PromptService.getAllPrompts(mockStudentData);

            expect(prompts).toHaveProperty('appreciation');
            expect(prompts).toHaveProperty('sw');
            expect(prompts).toHaveProperty('ns');

            expect(prompts.appreciation).toContain("Rédige l'appréciation de l'élève [PRÉNOM]");
            // tone 3 = free mode, no explicit 'Adopte un ton'
            expect(prompts.appreciation).toContain("première personne du singulier"); // voice je
            expect(prompts.appreciation).toContain("Ne t'adresse pas directement à l'élève (ni « tu » ni « vous »)");
            expect(prompts.appreciation).toContain("ne compare pas explicitement l'élève à la classe");
            expect(prompts.appreciation).not.toContain("Si la période courante n'a pas de moyenne");
            expect(prompts.appreciation).not.toContain("appréciations des périodes précédentes");
        });

        it('should apply override config with different tone', () => {
            const overrideCfg = { tone: 1, voice: 'nous', length: 30 };

            const prompts = PromptService.getAllPrompts(mockStudentData, overrideCfg);

            expect(prompts.appreciation).toContain('très encourageant'); // tone 1
            expect(prompts.appreciation).toContain('première personne du pluriel'); // voice nous
        });

        it('should inject neutral tone when enableTone is true and tone is 3', () => {
            const overrideCfg = { tone: 3, enableTone: true, voice: 'je', length: 40 };
            const prompts = PromptService.getAllPrompts(mockStudentData, overrideCfg);
            expect(prompts.appreciation).toContain('Adopte un ton neutre, factuel et mesuré.');
        });

        it('should not inject any tone instruction when enableTone is false', () => {
            const overrideCfg = { tone: 1, enableTone: false, voice: 'je', length: 40 };
            const prompts = PromptService.getAllPrompts(mockStudentData, overrideCfg);
            expect(prompts.appreciation).not.toContain('Adopte un ton');
        });

        it('should include context from periods', () => {
            const dataWithContext = {
                ...mockStudentData,
                periods: { 'T1': { grade: 12, appreciation: 'Good', context: 'Ne pas mentionner le bavardage.' } },
            };
            const prompts = PromptService.getAllPrompts(dataWithContext);
            expect(prompts.appreciation).toContain("Ne pas mentionner le bavardage");
        });

        it('should include historic data and evolution in coherence instruction', () => {
            Utils.getPeriods.mockReturnValue(['T1', 'T2']);
            StatsService.analyserEvolution.mockReturnValue([{ periode: 'T1-T2', valeur: 4, type: 'very-positive' }]);
            const dataWithHistory = {
                ...mockStudentData,
                currentPeriod: 'T2',
                periods: {
                    'T1': { grade: 10, appreciation: 'Fair' },
                    'T2': { grade: 14 }
                }
            };
            const prompts = PromptService.getAllPrompts(dataWithHistory);
            expect(prompts.appreciation).toContain('10,0');
            expect(prompts.appreciation).toContain('suggéré par la moyenne et son évolution');
            expect(prompts.appreciation).toContain('ne les recopie pas et ne les paraphrase pas');
        });

        it('should include gender guidance for epicene names (detectGender === "neutre") even when anonymizeData is false', () => {
            const prevAnon = appState.anonymizeData;
            try {
                appState.anonymizeData = false;
                Utils.detectGender.mockReturnValueOnce('neutre');
                const epicenePrompts = PromptService.getAllPrompts({ ...mockStudentData, prenom: 'Sacha' });
                expect(epicenePrompts.appreciationUser).toContain('Élève : Sacha (non déterminé');

                Utils.detectGender.mockReturnValueOnce('masculin');
                const knownGenderPrompts = PromptService.getAllPrompts({ ...mockStudentData, prenom: 'Thomas' });
                expect(knownGenderPrompts.appreciationUser).toContain('Élève : Thomas\n');
            } finally {
                appState.anonymizeData = prevAnon;
            }
        });

        it('should use override config if provided', () => {
            const override = { tone: 5, voice: 'nous', length: 100 };
            const prompts = PromptService.getAllPrompts(mockStudentData, override);
            expect(prompts.appreciation).toContain('strict et formel'); // tone 5
            expect(prompts.appreciation).toContain('100 mots');
        });

        it('should handle student with no data correctly', () => {
            const dataWithNoData = {
                nom: 'DOE',
                prenom: 'John',
                statuses: [],
                periods: {
                    'T1': { grade: null, appreciation: '' },
                    'T2': { grade: undefined, appreciation: 'N/A' }
                },
                currentPeriod: 'T2'
            };
            Utils.getPeriods.mockReturnValue(['T1', 'T2']);
            
            const prompts = PromptService.getAllPrompts(dataWithNoData);
            
            expect(prompts.appreciation).not.toContain("cohérente avec le niveau de réussite");
            expect(prompts.appreciation).not.toContain("Ne cite ni les moyennes");
            expect(prompts.appreciation).toContain("aucune donnée d'évaluation");
        });

        it('should NOT trigger absence when past periods have real grades', () => {
            const dataWithPastGrades = {
                nom: 'DOE',
                prenom: 'Lina',
                statuses: [],
                periods: {
                    'S1': { grade: 14, appreciation: 'Bon travail' },
                    'S2': { grade: undefined, appreciation: '' }
                },
                currentPeriod: 'S2'
            };
            Utils.getPeriods.mockReturnValue(['S1', 'S2']);
            
            const prompts = PromptService.getAllPrompts(dataWithPastGrades);
            
            expect(prompts.appreciation).not.toContain("aucune donnée d'évaluation");
            expect(prompts.appreciation).toContain("cohérente avec le niveau de réussite");
            expect(prompts.appreciation).toContain("Si la période courante n'a pas de moyenne");
        });

        it('should trigger absence when ALL periods lack grades even with generated past appreciations', () => {
            const dataWithGeneratedAppreciation = {
                nom: 'DOE',
                prenom: 'Lina',
                statuses: [],
                periods: {
                    'S1': { grade: null, appreciation: "Aucune donnée d'évaluation disponible pour Lina ce semestre." },
                    'S2': { grade: undefined, appreciation: '' }
                },
                currentPeriod: 'S2'
            };
            Utils.getPeriods.mockReturnValue(['S1', 'S2']);
            
            const prompts = PromptService.getAllPrompts(dataWithGeneratedAppreciation);
            
            expect(prompts.appreciation).toContain("aucune donnée d'évaluation");
            expect(prompts.appreciation).not.toContain("cohérente avec le niveau de réussite");
            expect(prompts.appreciation).not.toContain("Ne cite ni les moyennes");
        });

        it('should keep the current appreciation as analysis reference when the period is not in the active period system', () => {
            Utils.getPeriods.mockReturnValue(['S1', 'S2']);
            const prompts = PromptService.getAllPrompts({
                nom: 'DOE',
                prenom: 'John',
                statuses: [],
                periods: { T2: { grade: 12, appreciation: 'Bonne dynamique de travail.' } },
                currentPeriod: 'T2'
            });

            expect(prompts.sw).toContain('Appréciation de référence : "Bonne dynamique de travail."');
        });

        it('should calculate and include class statistics in periods info when enough data exists', () => {
            appState.currentClassId = 'class-A';
            appState.generatedResults = [
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 10 } } } },
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 12 } } } },
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 14 } } } }
            ];
            
            const studentWithClass = {
                ...mockStudentData,
                classId: 'class-A',
                periods: { 'T1': { grade: 12, appreciation: 'Good' } }
            };
            
            const prompts = PromptService.getAllPrompts(studentWithClass);
            
            expect(prompts.appreciation).toContain('[Classe : Moy 12,0, Min 10,0, Max 14,0]');
        });

        it('should NOT include class statistics when less than 3 students have grades', () => {
            appState.currentClassId = 'class-A';
            appState.generatedResults = [
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 10 } } } },
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: null } } } }
            ];
            
            const studentWithClass = {
                ...mockStudentData,
                classId: 'class-A',
                periods: { 'T1': { grade: 12, appreciation: 'Good' } }
            };
            
            const prompts = PromptService.getAllPrompts(studentWithClass);
            
            expect(prompts.appreciation).not.toContain('[Classe :');
        });

        it('should cache class statistics and invalidate cache when grades change', () => {
            appState.currentClassId = 'class-A';
            appState.generatedResults = [
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 10 } } } },
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 12 } } } },
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 14 } } } }
            ];
            
            const studentWithClass = {
                ...mockStudentData,
                classId: 'class-A',
                periods: { 'T1': { grade: 12, appreciation: 'Good' } }
            };
            
            // First calculation (populates cache)
            const prompts1 = PromptService.getAllPrompts(studentWithClass);
            expect(prompts1.appreciation).toContain('[Classe : Moy 12,0, Min 10,0, Max 14,0]');
            expect(PromptService._classStatsCache.size).toBe(1);

            // Spy on cache to verify hit
            const cacheGetSpy = vi.spyOn(PromptService._classStatsCache, 'get');
            const prompts2 = PromptService.getAllPrompts(studentWithClass);
            expect(prompts2.appreciation).toContain('[Classe : Moy 12,0, Min 10,0, Max 14,0]');
            expect(cacheGetSpy).toHaveBeenCalled();
            cacheGetSpy.mockRestore();

            // Change grades to verify cache invalidation (different key signature)
            appState.generatedResults = [
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 8 } } } },
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 12 } } } },
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 16 } } } }
            ];
            
            const prompts3 = PromptService.getAllPrompts(studentWithClass);
            expect(prompts3.appreciation).toContain('[Classe : Moy 12,0, Min 8,0, Max 16,0]');
            expect(PromptService._classStatsCache.size).toBe(2); // New key is added
        });
    });

    describe('getAllPrompts — fidélité de l\'aperçu', () => {
        it('l\'aperçu (appreciation) est strictement la concaténation du system et du user envoyés à l\'API', () => {
            const studentData = {
                nom: 'DOE',
                prenom: 'John',
                statuses: [],
                periods: { 'T1': { grade: 12, appreciation: '' } },
                currentPeriod: 'T1'
            };
            const prompts = PromptService.getAllPrompts(studentData, { tone: 2, enableTone: true, voice: 'neutre', length: 60 });

            expect(prompts.appreciation).toBe(`${prompts.appreciationSystem}\n\n${prompts.appreciationUser}`);
            expect(prompts.appreciationSystem).toContain('INSTRUCTIONS DE STYLE');
            expect(prompts.appreciationSystem).not.toContain("Ne t'adresse pas directement à l'élève");
            expect(prompts.appreciationUser).toContain("DONNÉES DE L'ÉLÈVE");
            expect(prompts.appreciationUser).not.toContain('INSTRUCTIONS DE STYLE');
        });
    });

    describe('getRefinementPrompt', () => {
        const originalText = "Ceci est une bonne appréciation.";

        it('should keep the original grammatical person, include anti-hallucination guardrails and avoid word-count arithmetic', () => {
            for (const type of ['concise', 'encouraging', 'polish']) {
                const p = PromptService.getRefinementPrompt(type, originalText);
                expect(p).toContain('Conserve la personne grammaticale');
                expect(p).toContain("N'invente aucun fait");
                expect(p).toContain('ni « tu » ni « vous »');
                expect(p).not.toMatch(/\d+ mots/);
            }
        });

        it('should generate concise prompt', () => {
            const p = PromptService.getRefinementPrompt('concise', originalText);
            expect(p).toContain('concise');
            expect(p).toContain('supprime les redondances');
        });

        it('should generate encouraging prompt', () => {
            const p = PromptService.getRefinementPrompt('encouraging', originalText);
            expect(p).toContain('bienveillant, valorisant et constructif');
            expect(p).toContain('sans masquer les difficultés réelles');
        });

        it('should generate polish prompt', () => {
            const p = PromptService.getRefinementPrompt('polish', originalText);
            expect(p).toContain('Peaufine');
            expect(p).toContain('fluidifie la syntaxe');
        });

        it('should inject student gender when prenom is provided and strip surname locally without leaking [NOM]', () => {
            Utils.detectGender.mockReturnValueOnce('féminin');
            const pFemale = PromptService.getRefinementPrompt(
                'concise',
                'Marie Dupont fournit un travail sérieux avec constance.',
                { prenom: 'Marie', nom: 'Dupont' }
            );
            expect(pFemale).toContain("Genre de l'élève : féminin");
            expect(pFemale).toContain('[PRÉNOM]');
            expect(pFemale).not.toMatch(/Dupont/i);
            expect(pFemale).not.toMatch(/\[nom\]/i);
            expect(pFemale).toContain('avec constance');
        });

        it('should inject active teacher styleInstructions into refinement prompt', () => {
            appState.useSubjectPersonalization = true;
            appState.subjects['MonStyle'] = {
                iaConfig: {
                    tone: 3,
                    voice: 'neutre',
                    length: 35,
                    enableStyleInstructions: true,
                    styleInstructions: 'Bannir les superlatifs.'
                }
            };
            const p = PromptService.getRefinementPrompt('polish', originalText);
            expect(p).toContain("Consigne de l'enseignant : Bannir les superlatifs.");
        });
    });

    describe('getPromptHash', () => {
        const mockStudentData = {
            nom: 'DOE',
            prenom: 'John',
            statuses: [],
            periods: { 'T1': { grade: 12, appreciation: 'Good' } },
            currentPeriod: 'T1'
        };

        it('should prefix the hash with the current format version', () => {
            expect(PromptService.getPromptHash(mockStudentData)).toMatch(new RegExp(`^${PromptService.PROMPT_HASH_PREFIX}`));
        });

        it('should change when the student pedagogical data changes', () => {
            Utils.getPeriods.mockReturnValue(['T1', 'T2']);
            const base = {
                ...mockStudentData,
                currentPeriod: 'T2',
                periods: { T1: { grade: 12, appreciation: 'Bon trimestre' }, T2: { grade: 13 } }
            };
            const baseHash = PromptService.getPromptHash(base);

            const variants = [
                { periods: { ...base.periods, T2: { grade: '14,5' } } },
                { periods: { ...base.periods, T2: { grade: 13, evaluationCount: 4 } } },
                { periods: { ...base.periods, T2: { grade: 13, context: 'Très bonne participation' } } },
                { periods: { ...base.periods, T1: { grade: 12, appreciation: 'Trimestre fragile' } } },
                { statuses: ['PPRE'] },
                { journal: [{ note: 'Excellent exposé', period: 'T2' }] },
                { prenom: 'Jon' }
            ];
            variants.forEach(variant => {
                expect(PromptService.getPromptHash({ ...base, ...variant })).not.toBe(baseHash);
            });
        });

        it('should treat equivalent grade formats as identical', () => {
            const asNumber = { ...mockStudentData, periods: { T1: { grade: 12.5 } } };
            const asString = { ...mockStudentData, periods: { T1: { grade: '12,5' } } };
            expect(PromptService.getPromptHash(asString)).toBe(PromptService.getPromptHash(asNumber));
        });

        it('should ignore the appreciation of the evaluated period (teacher edits)', () => {
            const edited = { ...mockStudentData, periods: { T1: { grade: 12, appreciation: 'Texte retouché' } } };
            expect(PromptService.getPromptHash(edited)).toBe(PromptService.getPromptHash(mockStudentData));
        });

        it('should ignore global settings (style, evolution labels, anonymization, class)', () => {
            appState.useSubjectPersonalization = false;
            const genericConfig = appState.subjects['Générique'].iaConfig;
            const styleSnapshot = { ...genericConfig };
            const stateSnapshot = { anonymizeData: appState.anonymizeData, classes: appState.classes, currentClassId: appState.currentClassId };
            const baseHash = PromptService.getPromptHash(mockStudentData);
            try {
                Object.assign(genericConfig, { length: 90, tone: 5, enableTone: true, voice: 'neutre', discipline: 'Histoire', styleInstructions: 'Sois bref.' });
                appState.anonymizeData = false;
                appState.classes = [{ id: 'class-B', name: '3e B', level: 'college' }];
                appState.currentClassId = 'class-B';
                StatsService.analyserEvolution.mockReturnValue([{ periode: 'T1-T2', valeur: 1, type: 'very-positive' }]);

                expect(PromptService.getPromptHash(mockStudentData)).toBe(baseHash);
            } finally {
                Object.keys(genericConfig).forEach(key => delete genericConfig[key]);
                Object.assign(genericConfig, styleSnapshot);
                Object.assign(appState, stateSnapshot);
            }
        });

        it('should hash incomplete student data without throwing', () => {
            expect(PromptService.getPromptHash({ currentPeriod: 'T1' })).toMatch(new RegExp(`^${PromptService.PROMPT_HASH_PREFIX}`));
        });

        it('should return null when fingerprint building fails', () => {
            vi.spyOn(PromptService, '_extractJournalSynthesis').mockImplementationOnce(() => { throw new Error('boom'); });
            vi.spyOn(console, 'warn').mockImplementationOnce(() => {});
            expect(PromptService.getPromptHash(mockStudentData)).toBeNull();
        });

        it('should generate stable hash when other students grades change', () => {
            appState.currentClassId = 'class-A';
            appState.generatedResults = [
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 10 } } } },
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 12 } } } },
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 14 } } } }
            ];

            const hash1 = PromptService.getPromptHash(mockStudentData);

            // Change other students grades (which changes class stats)
            appState.generatedResults = [
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 4 } } } },
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 5 } } } },
                { classId: 'class-A', studentData: { periods: { 'T1': { grade: 6 } } } }
            ];

            const hash2 = PromptService.getPromptHash(mockStudentData);

            expect(hash1).toBe(hash2);
        });
    });

    describe('T-04 — Caractérisation RGPD & Anonymisation complète (Bugs B-01 & B-02)', () => {
        // Lot 3: Bug corrigé (anonymizeData: true par défaut + scrubbing RGPD + neutralisation statuts Art. 9)
        it('T-04 (Bugs B-01 & B-02) : active anonymizeData par défaut et anonymise prénom, nom et statuts médicaux (PAI/ULIS) dans tous les prompts (génération, journal, raffinement, bilan de classe)', async () => {
            const { DEFAULT_PRIVACY_SETTINGS } = await vi.importActual('../config/defaults.js');
            const { ClassDashboardManager } = await import('../managers/ClassDashboardManager.js');

            // 1. Privacy-by-default (RGPD Art. 25) : anonymizeData doit être true par défaut
            expect(DEFAULT_PRIVACY_SETTINGS.anonymizeData).toBe(true);

            // 2. Avec anonymizeData = true, aucune donnée nominative ("Lucas", "Martin") ni statut médical ("PAI", "ULIS")
            // ne doit fuiter dans les prompts d'appréciation, d'analyse ou de pistes
            appState.anonymizeData = true;
            Utils.getPeriods.mockReturnValue(['T1', 'T2', 'T3']);
            Utils.getPeriodLabel.mockReturnValue('Trimestre');

            const studentData = {
                prenom: 'Lucas',
                nom: 'Martin',
                gender: 'M',
                statuses: ['PAI', 'ULIS', 'PAP'],
                currentPeriod: 'T2',
                periods: {
                    T1: {
                        grade: 11,
                        appreciation: 'Lucas a fourni des efforts réguliers au premier trimestre.'
                    },
                    T2: {
                        grade: 13.5,
                        appreciation: 'Lucas progresse bien.',
                        context: 'Lucas participe davantage à l\'oral avec Martin.'
                    }
                },
                journal: [
                    { id: 'j1', date: '2026-10-05', tags: ['participation'], note: 'Intervention pertinente de Lucas en classe' },
                    { id: 'j2', date: '2026-10-12', tags: ['participation'], note: 'Devoir supplémentaire rendu par Lucas Martin' }
                ]
            };

            const prompts = PromptService.getAllPrompts(studentData);
            for (const promptText of [prompts.appreciation, prompts.sw, prompts.ns]) {
                expect(promptText).not.toMatch(/\bLucas\b/i);
                expect(promptText).not.toMatch(/\bMartin\b/i);
                expect(promptText).not.toMatch(/\bPAI\b/);
                expect(promptText).not.toMatch(/\bULIS\b/);
            }

            // 3. Raffinement : le texte envoyé à getRefinementPrompt doit également être anonymisé
            const refinementPrompt = PromptService.getRefinementPrompt(
                'concise',
                'Lucas Martin a montré un investissement exemplaire tout au long du trimestre.',
                { prenom: 'Lucas', nom: 'Martin', context: 'Insister sur les progrès de Lucas' }
            );
            expect(refinementPrompt).not.toMatch(/\bLucas\b/i);
            expect(refinementPrompt).not.toMatch(/\bMartin\b/i);

            // 4. Bilan de classe : ClassDashboardManager.buildAIPrompt ne doit envoyer aucun prénom réel
            const { userPrompt } = ClassDashboardManager.buildAIPrompt({
                total: 25,
                withGradesCount: 25,
                withAppreciationCount: 25,
                classAverage: 12.4,
                minGrade: 7,
                maxGrade: 18,
                stdDev: 2.1,
                distribution: { veryLow: 1, low: 4, average: 10, good: 7, excellent: 3 },
                evolutionStats: { up: 12, stable: 8, down: 5, avgEvolution: 0.6 },
                topProgressions: [{ prenom: 'Lucas', nom: 'Martin', evolution: 2.5 }],
                topRegressions: [{ prenom: 'Martin', nom: 'Dupont', evolution: -2.0 }],
                appreciationsList: [
                    { prenom: 'Lucas', nom: 'Martin', grade: 13.5, text: 'Lucas progresse bien.' }
                ],
                recurringKeywords: [{ word: 'sérieux', count: 10 }]
            });
            expect(userPrompt).not.toMatch(/\bLucas\b/i);
            expect(userPrompt).not.toMatch(/\bMartin\b/i);

            // 5. Statuts médico-scolaires Art. 9 RGPD (PAP, PPRE, ULIS, PAI, Geva-Sco) traduits en consignes neutres sans acronyme brut
            const statusInstructions = PromptService.getStatusInstructions(['PAP', 'PPRE', 'ULIS', 'PAI', 'Geva-Sco'], 'T2');
            expect(statusInstructions).toBeTruthy();
            expect(statusInstructions).not.toMatch(/\b(PAP|PPRE|ULIS|PAI|Geva-Sco|GevaSco)\b/i);
            expect(PromptService.deanonymizeText('[Prénom] [NOM] progresse.', 'Lucas')).toBe('Lucas progresse.');
        });
    });
});
