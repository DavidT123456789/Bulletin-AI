
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptService } from './PromptService.js';
import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { StatsService } from './StatsService.js';

// Mock dependencies
vi.mock('../state/State.js', () => {
    const appState = {
        currentSubject: 'Générique',
        useSubjectPersonalization: false,
        anonymizeData: true,
        subjects: {
            'Générique': { iaConfig: { voice: 'je', length: 50 } },
            'Mathématiques': {
                iaConfig: { voice: 'nous', length: 30 }
            }
        }
    };
    const userSettings = {
        academic: {
            get classes() { return appState.classes || []; },
            set classes(v) { appState.classes = v; },
            get currentClassId() { return appState.currentClassId || null; },
            set currentClassId(v) { appState.currentClassId = v; }
        }
    };
    return { appState, userSettings };
});

vi.mock('../config/Config.js', () => ({
    DEFAULT_IA_CONFIG: { voice: 'je', length: 50 },
    DEFAULT_PROMPT_TEMPLATES: {
        "Générique": { iaConfig: { voice: 'je', length: 50 } }
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
            expect(prompts).toHaveProperty('analysis');
            expect(prompts).toHaveProperty('analysisSystem');
            expect(prompts).toHaveProperty('analysisUser');

            expect(prompts.appreciation).toContain("Rédige l'appréciation de l'élève [PRÉNOM]");
            // tone 3 = free mode, no explicit 'Adopte un ton'
            expect(prompts.appreciation).toContain("première personne du singulier"); // voice je
            expect(prompts.appreciation).toContain("Ne t'adresse pas directement à l'élève (ni « tu » ni « vous »)");
            expect(prompts.appreciation).toContain("Traduis le niveau de réussite en termes qualitatifs, sans citer de moyenne chiffrée.");
            expect(prompts.appreciation).not.toContain("comparer explicitement l'élève à la classe");
            expect(prompts.appreciation).toContain("sans écriture inclusive (ni point médian)");
            expect(prompts.appreciation).toContain("sans sigles de période");
            expect(prompts.appreciation).not.toContain("Si la période courante n'a pas de moyenne");
            expect(prompts.appreciation).not.toContain("appréciations des périodes précédentes");
        });

        it('should apply override config with voice, length and discipline while ignoring legacy tone fields', () => {
            const overrideCfg = { tone: 1, enableTone: true, voice: 'nous', length: 30, discipline: '  Anglais  ' };

            const prompts = PromptService.getAllPrompts(mockStudentData, overrideCfg);

            expect(prompts.appreciation).toContain('Tu es un enseignant en Anglais.');
            expect(prompts.appreciation).toContain('première personne du pluriel');
            expect(prompts.appreciation).toContain('environ 30 mots');
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
            expect(prompts.appreciation).toContain('en renouvelant la formulation, sans les recopier ni les paraphraser');
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
            const override = { voice: 'nous', length: 100 };
            const prompts = PromptService.getAllPrompts(mockStudentData, override);
            expect(prompts.appreciation).toContain('première personne du pluriel');
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
            expect(prompts.appreciation).not.toContain("Traduis le niveau de réussite en termes qualitatifs");
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
            expect(prompts.appreciation).not.toContain("Traduis le niveau de réussite en termes qualitatifs");
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

            expect(prompts.analysis).toContain('Appréciation de référence : "Bonne dynamique de travail."');
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
            expect(prompts.appreciation).toContain("Traduis le niveau de réussite en termes qualitatifs");
            expect(prompts.appreciation).toContain("comparer explicitement l'élève à la classe");
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
            const prompts = PromptService.getAllPrompts(studentData, { voice: 'neutre', length: 60 });

            expect(prompts.appreciation).toBe(`${prompts.appreciationSystem}\n\n${prompts.appreciationUser}`);
            expect(prompts.appreciationSystem).toContain('INSTRUCTIONS DE STYLE');
            expect(prompts.appreciationSystem).toContain("Ne t'adresse pas directement à l'élève (ni « tu » ni « vous »).");
            expect(prompts.appreciationSystem).not.toContain('cite son prénom une fois au maximum');
            expect(prompts.appreciationUser).toContain("DONNÉES DE L'ÉLÈVE");
            expect(prompts.appreciationUser).not.toContain('INSTRUCTIONS DE STYLE');
        });

        it('isole les profils de démo du laboratoire (isDemo) de la classe active, de ses stats et des camarades réels', () => {
            const prevClasses = appState.classes;
            const prevClassId = appState.currentClassId;
            const prevResults = appState.generatedResults;
            try {
                appState.classes = [{ id: 'real-class', name: '4e B', level: 'college' }];
                appState.currentClassId = 'real-class';
                appState.generatedResults = [
                    { id: 'r1', classId: 'real-class', prenom: 'Oral', nom: 'TEST', studentData: { periods: { T1: { grade: 8 } } } },
                    { id: 'r2', classId: 'real-class', prenom: 'Sérieux', nom: 'AUTRE', studentData: { periods: { T1: { grade: 10 } } } },
                    { id: 'r3', classId: 'real-class', prenom: 'Progrès', nom: 'TIERS', studentData: { periods: { T1: { grade: 12 } } } }
                ];

                const demoStudent = {
                    nom: 'BERNARD',
                    prenom: 'Thomas',
                    isDemo: true,
                    statuses: [],
                    periods: { T1: { grade: 15, appreciation: '', context: 'Pertinent à l\'Oral et Sérieux.' } },
                    currentPeriod: 'T1'
                };

                const prompts = PromptService.getAllPrompts(demoStudent, { voice: 'default', length: 40 });
                expect(prompts.appreciationUser).not.toContain('Classe : 4e B');
                expect(prompts.appreciationUser).not.toContain('Niveau :');
                expect(prompts.appreciationUser).not.toContain('[Classe :');
                expect(prompts.appreciationUser).not.toContain('[CAMARADE]');
                expect(prompts.appreciationUser).toContain("Pertinent à l'Oral et Sérieux.");
            } finally {
                appState.classes = prevClasses;
                appState.currentClassId = prevClassId;
                appState.generatedResults = prevResults;
            }
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

        it('should generate demanding prompt', () => {
            const p = PromptService.getRefinementPrompt('demanding', originalText);
            expect(p).toContain('plus ferme, direct et exigeant');
            expect(p).toContain('sans complaisance');
        });

        it('should generate polish prompt', () => {
            const p = PromptService.getRefinementPrompt('polish', originalText);
            expect(p).toContain('Peaufine');
            expect(p).toContain('fluidifie la syntaxe');
        });

        it('should generate custom refinement prompt with GDPR-scrubbed instruction and student dossier reference', () => {
            const { userPrompt, systemPrompt } = PromptService.getRefinementPrompts(
                'custom',
                'Sophie Dupont progresse bien en classe.',
                {
                    id: 'stu-1',
                    prenom: 'Sophie',
                    nom: 'Dupont',
                    currentPeriod: 'S2',
                    customInstruction: 'Mentionne les progrès de Sophie Dupont en TP et son PAP',
                    studentData: {
                        id: 'stu-1',
                        prenom: 'Sophie',
                        nom: 'Dupont',
                        statuses: [],
                        periods: {
                            S1: { grade: 11.0 },
                            S2: { grade: 14.5, context: 'Plus régulière à l\'oral avec Sophie Dupont' }
                        }
                    }
                }
            );

            expect(userPrompt).toContain('REPÈRES FACTUELS DU DOSSIER');
            expect(userPrompt).toContain('S2 14,5/20');
            expect(userPrompt).toContain('Plus régulière à l\'oral');
            expect(userPrompt).toContain('[PRÉNOM]');
            expect(userPrompt).toContain('[AMÉNAGEMENT]');
            expect(userPrompt).not.toContain('Dupont');
            expect(userPrompt).not.toContain('PAP');
            expect(systemPrompt).toContain('ne cite jamais de moyenne chiffrée');
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

        it('should inject active teacher styleInstructions (prioritaire) and discipline into refinement prompt with conditional tu/vous rule', () => {
            appState.useSubjectPersonalization = true;
            appState.subjects['MonStyle'] = {
                iaConfig: {
                    discipline: 'Anglais',
                    voice: 'neutre',
                    length: 35,
                    enableStyleInstructions: true,
                    styleInstructions: 'Bannir les superlatifs.'
                }
            };
            const { systemPrompt } = PromptService.getRefinementPrompts('polish', originalText);
            expect(systemPrompt).toContain('Tu es un enseignant en Anglais qui retravaille');
            expect(systemPrompt).toContain("Consigne de l'enseignant (prioritaire) : Bannir les superlatifs.");
            expect(systemPrompt).toContain("sauf si le texte d'origine ou la consigne de l'enseignant l'emploie déjà");
        });
    });

    describe('getClassSynthesisRefinementPrompts', () => {
        const sampleIntro = 'La classe de Lucas Martin progresse malgré des bavardages ponctuels et un élève PAP.';
        const longIntro = 'La classe a globalement progressé sur l\'ensemble de l\'année scolaire avec une amélioration notable des résultats écrits et oraux au second semestre. Le climat de travail demeure positif, marqué par une implication variée mais réelle de la majorité des élèves. Les écarts de niveau se sont légèrement réduits malgré quelques bavardages ponctuels.';
        const mediumIntro = 'La classe a progressé au second semestre avec un bon climat de travail, même si certains élèves doivent encore renforcer leur régularité et leur concentration en fin de séance.';

        it('devrait couvrir les 4 types harmonisés (concise adaptatif, encouraging, demanding, polish) et rejeter les types inconnus', () => {
            expect(PromptService.getClassSynthesisRefinementPrompts('unknown', sampleIntro)).toBeNull();
            expect(PromptService.getClassSynthesisRefinementPrompts(null, sampleIntro)).toBeNull();

            const conciseLong = PromptService.getClassSynthesisRefinementPrompts('concise', longIntro);
            const conciseMedium = PromptService.getClassSynthesisRefinementPrompts('concise', mediumIntro);
            const conciseShort = PromptService.getClassSynthesisRefinementPrompts('concise', sampleIntro);
            const encouraging = PromptService.getClassSynthesisRefinementPrompts('encouraging', sampleIntro);
            const demanding = PromptService.getClassSynthesisRefinementPrompts('demanding', sampleIntro);
            const polish = PromptService.getClassSynthesisRefinementPrompts('polish', sampleIntro);

            expect(conciseLong.userPrompt).toContain('max 35 mots');
            expect(conciseMedium.userPrompt).toMatch(/vise environ \d+ mots maximum/);
            expect(conciseShort.userPrompt).toContain('1 phrase directe et percutante');
            expect(encouraging.userPrompt).toContain('bienveillant, valorisant et constructif');
            expect(demanding.userPrompt).toContain('plus ferme, direct et exigeant');
            expect(polish.userPrompt).toContain('Peaufine cette synthèse globale');
        });

        it('devrait injecter la discipline, les consignes de style, anonymiser les identités et bloquer la fuite des marqueurs entre crochets', () => {
            appState.anonymizeData = true;
            appState.useSubjectPersonalization = true;
            appState.subjects['MonStyle'] = {
                iaConfig: {
                    discipline: 'Mathématiques',
                    enableStyleInstructions: true,
                    styleInstructions: 'Style sobre et direct.'
                }
            };

            const res = PromptService.getClassSynthesisRefinementPrompts('demanding', sampleIntro, {
                classmates: [{ prenom: 'Lucas', nom: 'Martin' }]
            });

            expect(res.systemPrompt).toContain('enseignant en Mathématiques');
            expect(res.systemPrompt).toContain("Consigne de l'enseignant (prioritaire) : Style sobre et direct.");
            expect(res.systemPrompt).toContain('sans jamais conserver de crochets');
            expect(res.userPrompt).not.toMatch(/\b(Lucas|Martin|PAP)\b/i);
            expect(res.userPrompt).toContain('[ÉLÈVE]');
            expect(res.userPrompt).toContain('[AMÉNAGEMENT]');

            const cleanRes = PromptService.getClassSynthesisRefinementPrompts('polish', mediumIntro);
            expect(cleanRes.systemPrompt).not.toContain('sans jamais conserver de crochets');
        });

        it('sanitizeAppreciationOutput retire les préambules de synthèse et préserve les guillemets internes légitimes', () => {
            expect(
                PromptService.sanitizeAppreciationOutput('Voici la synthèse globale révisée : « Classe dynamique et investie. »')
            ).toBe('Classe dynamique et investie.');
            expect(
                PromptService.sanitizeAppreciationOutput('La classe adopte une attitude « très constructive »')
            ).toBe('La classe adopte une attitude « très constructive »');
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
                Object.assign(genericConfig, { length: 90, voice: 'neutre', discipline: 'Histoire', styleInstructions: 'Sois bref.' });
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
            for (const promptText of [prompts.appreciation, prompts.analysis]) {
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

        it('should enrich unified analysis prompt with class, level, discipline, signed grade gap and JSON schema', () => {
            appState.currentClassId = 'c-4e';
            appState.classes = [{ id: 'c-4e', name: '4e B', level: 'college' }];
            appState.generatedResults = [
                { classId: 'c-4e', studentData: { periods: { T1: { grade: 10 } } } },
                { classId: 'c-4e', studentData: { periods: { T1: { grade: 12 } } } },
                { classId: 'c-4e', studentData: { periods: { T1: { grade: 14 } } } }
            ];

            const prompts = PromptService.getAllPrompts({
                classId: 'c-4e',
                nom: 'Dupont',
                prenom: 'Camille',
                statuses: [],
                currentPeriod: 'T1',
                periods: { T1: { grade: 10.5, appreciation: 'Travail sérieux malgré des difficultés à l\'écrit.' } }
            }, { discipline: 'Histoire-Géographie', voice: 'je', tone: 3, length: 40 });

            expect(prompts.analysisSystem).toContain('"strengths"');
            expect(prompts.analysisSystem).toContain('"vigilances"');
            expect(prompts.analysisSystem).toContain('"nextSteps"');
            expect(prompts.analysisSystem).toContain('0 à 3 items');
            expect(prompts.analysisUser).toContain('Classe : 4e B');
            expect(prompts.analysisUser).toContain('Niveau : Collège');
            expect(prompts.analysisUser).toContain('Matière : Histoire-Géographie');
            expect(prompts.analysisUser).toContain('Écart élève/classe : -1,5 pt, en dessous de la moyenne de classe');
        });

        it('should add sparse dossier anti-filler instruction when no appreciation or observation exists', () => {
            appState.currentClassId = null;
            appState.classes = [];
            appState.generatedResults = [];

            const prompts = PromptService.getAllPrompts({
                nom: 'Morel',
                prenom: 'Nolan',
                statuses: [],
                currentPeriod: 'T1',
                periods: { T1: { grade: 15, appreciation: '', context: '' } }
            });

            expect(prompts.analysisUser).toContain('dossier succinct sans appréciation ni observation textuelle');
        });

        it('should not throw when studentData.periods is undefined or null', () => {
            expect(() => PromptService.getAllPrompts({
                nom: 'Test',
                prenom: 'Leo',
                statuses: [],
                currentPeriod: 'T1',
                periods: undefined
            })).not.toThrow();
            expect(() => PromptService.getAllPrompts({
                nom: 'Test',
                prenom: 'Leo',
                statuses: [],
                currentPeriod: 'T2',
                periods: null
            })).not.toThrow();
        });

        it('should resolve class name and level in prompts for virtual_* reconstituted classes', () => {
            appState.currentClassId = 'virtual_3e1';
            appState.classes = [{ id: 'grp-1', name: '3e1 Gr1', isGroup: true }];
            appState.generatedResults = [
                { classId: 'grp-1', studentData: { classe: '3e1', periods: { T1: { grade: 13 } } } }
            ];

            const prompts = PromptService.getAllPrompts({
                classId: 'virtual_3e1',
                nom: 'Dupont',
                prenom: 'Lina',
                statuses: [],
                currentPeriod: 'T1',
                periods: { T1: { grade: 14 } }
            });

            expect(prompts.appreciationUser).toContain('Classe : 3ᵉ1');
            expect(prompts.appreciationUser).toContain('Niveau : Collège');
        });
    });

    describe('Lot 2 — Pseudonymisation RGPD avancée, Art. 9 & Élision française', () => {
        it('masque les camarades de classe en [CAMARADE] sans toucher aux mots courants français en minuscules ni en début de phrase', () => {
            appState.anonymizeData = true;
            const classmates = [
                { prenom: 'Chloé', nom: 'Bernard' },
                { prenom: 'Théo', nom: 'Petit' },
                { prenom: 'Clément', nom: 'Fort' },
                { prenom: 'Rose', nom: 'Bon' },
                { prenom: 'Pierre', nom: 'Aimé' },
                { prenom: 'Lucas', nom: 'Durand' },
                { prenom: 'Camille', nom: 'Martin' }
            ];

            // 1. Camarades cités par prénom majuscule, forme composée (même en minuscules) ou initiale
            const textWithMates = 'Lucas Martin bavarde avec Chloé, théo petit, Théo P., C. Bernard, Lucas Durand et Camille Martin.';
            const scrubbedMates = PromptService.scrubStudentIdentity(
                textWithMates,
                { prenom: 'Lucas', nom: 'Martin' },
                { anonymizePrenom: true, classmates }
            );
            expect(scrubbedMates).toBe('[PRÉNOM] bavarde avec [CAMARADE], [CAMARADE], [CAMARADE], [CAMARADE], [CAMARADE] et [CAMARADE].');

            // 2. Mots courants en minuscules (petit, fort, bon, clément, aimé, rose, pierre) jamais remplacés
            const commonWordsText = 'Bon trimestre. Petit relâchement mais un petit effort fort apprécié et bon travail, climat clément et aimé, couleur rose, pierre angulaire.';
            const scrubbedCommon = PromptService.scrubStudentIdentity(
                commonWordsText,
                { prenom: 'Lucas', nom: 'Martin' },
                { anonymizePrenom: true, classmates }
            );
            expect(scrubbedCommon).toBe(commonWordsText);

            // 3. Noms de camarades en milieu de phrase avec majuscule initiale bien masqués
            const capitalizedMates = 'Bavarde avec Petit, Fort, Bon, Clément, Aimé, Rose et Pierre.';
            const scrubbedCap = PromptService.scrubStudentIdentity(
                capitalizedMates,
                { prenom: 'Lucas', nom: 'Martin' },
                { anonymizePrenom: true, classmates }
            );
            expect(scrubbedCap).toBe('Bavarde avec [CAMARADE], [CAMARADE], [CAMARADE], [CAMARADE], [CAMARADE], [CAMARADE] et [CAMARADE].');
        });

        it('exclut les particules courtes (de, du, la, le, des, d) lors du découpage des noms composés (DE LA ROCHE)', () => {
            const text = "DE LA ROCHE a fait de grands progrès de la part de l'élève ; Mme Roche et M. DE LA ROCHE sont informés.";
            const scrubbed = PromptService.scrubStudentIdentity(
                text,
                { prenom: 'Arthur', nom: 'DE LA ROCHE' },
                { anonymizePrenom: true, classmates: [] }
            );
            expect(scrubbed).not.toMatch(/ROCHE/i);
            expect(scrubbed).toContain("a fait de grands progrès de la part de l'élève");

            const multiParticles = PromptService.scrubStudentIdentity(
                "DU PONT, DES CHAMPS, LE GRAND et D'ARCY font du travail, des exercices, le cours et d'autres efforts.",
                { prenom: 'Léo', nom: "D'ARCY" },
                { anonymizePrenom: true, classmates: [{ prenom: 'Paul', nom: 'DU PONT' }, { prenom: 'Emma', nom: 'DES CHAMPS' }, { prenom: 'Noé', nom: 'LE GRAND' }] }
            );
            expect(multiParticles).not.toMatch(/ARCY|PONT|CHAMPS|GRAND/i);
            expect(multiParticles).toContain("font du travail, des exercices, le cours et d'autres efforts.");
        });

        it('masque les initiales de l\'élève cible (Prénom N., P. Nom, P.N.) sans corrompre les sigles scolaires (D.M., T.P.) ni le verbe "a"', () => {
            const scrubbed = PromptService.scrubStudentIdentity(
                'Lucas M. et L. Martin progressent ; L.M. et L. M. participent bien.',
                { prenom: 'Lucas', nom: 'Martin' },
                { anonymizePrenom: true, classmates: [] }
            );
            expect(scrubbed).toBe('[PRÉNOM] et [PRÉNOM] progressent ; [PRÉNOM] et [PRÉNOM] participent bien.');

            // Sigles scolaires D.M. / T.P. préservés même si initiales identiques
            const dmPreserved = PromptService.scrubStudentIdentity(
                'David M. a rendu un très bon D.M. et participe en T.P.',
                { prenom: 'David', nom: 'Martin' },
                { anonymizePrenom: true, classmates: [] }
            );
            expect(dmPreserved).toBe('[PRÉNOM] a rendu un très bon D.M. et participe en T.P.');

            // Verbe "a" minuscule jamais avalé comme initiale de "Arnaud"
            const verbPreserved = PromptService.scrubStudentIdentity(
                'Lucas a fourni un travail sérieux. Lucas A. progresse.',
                { prenom: 'Lucas', nom: 'Arnaud' },
                { anonymizePrenom: true, classmates: [] }
            );
            expect(verbPreserved).toBe('[PRÉNOM] a fourni un travail sérieux. [PRÉNOM] progresse.');
        });

        it('neutralise les statuts composites (Nouveau ULIS, Départ PAI, Délégué dyslexique) et les mentions Art. 9 en texte libre', () => {
            const compositeUlis = PromptService.getStatusInstructions(['Nouveau ULIS'], 'T2');
            expect(compositeUlis).toContain('arrivée récente');
            expect(compositeUlis).toContain('objectifs personnalisés');
            expect(compositeUlis).not.toMatch(/ULIS/i);

            const compositeDys = PromptService.getStatusInstructions(['Délégué dyslexique', 'Départ PAI'], 'T2');
            expect(compositeDys).toContain('engagement citoyen');
            expect(compositeDys).toContain('départ de l\'élève');
            expect(compositeDys).not.toMatch(/dyslexi|PAI/i);

            // Statut mouvement sain traduit sans sigle de période brut
            const nouveauT2 = PromptService.getStatusInstructions(['Nouveau T2'], 'T2');
            expect(nouveauT2).toContain('au 2e trimestre');
            expect(nouveauT2).not.toMatch(/\bT2\b/);

            // Art. 9 en texte libre (contexte, journal, raffinement)
            appState.anonymizeData = true;
            appState.currentClassId = 'c-rgpd';
            appState.generatedResults = [
                { id: 's1', classId: 'c-rgpd', prenom: 'Arthur', nom: 'Dupont', studentData: { periods: { T1: { grade: 13 } } } },
                { id: 's2', classId: 'c-rgpd', prenom: 'Chloé', nom: 'Bernard', studentData: { periods: { T1: { grade: 14 } } } }
            ];

            const prompts = PromptService.getAllPrompts({
                id: 's1',
                classId: 'c-rgpd',
                prenom: 'Arthur',
                nom: 'Dupont',
                statuses: ['Nouveau ULIS'],
                currentPeriod: 'T1',
                periods: {
                    T1: {
                        grade: 13,
                        context: 'Élève dyslexique avec TDAH, tiers-temps et suivi orthophoniste ; bavarde avec Chloé.'
                    }
                },
                journal: [
                    { id: 'j1', period: 'T1', note: 'Absence liée à son asthme (PAI) ; aidé par son AESH.' }
                ]
            });

            for (const text of [prompts.appreciation, prompts.analysis]) {
                expect(text).not.toMatch(/\b(ULIS|PAP|PAI|AESH|TDAH|Chloé|Bernard|Dupont|Arthur)\b/i);
                expect(text).not.toMatch(/dyslexi|orthophon|asthm|tiers-temps/i);
                expect(text).toContain('[CAMARADE]');
                expect(text).toContain('[AMÉNAGEMENT]');
            }

            // Raffinement sans identité explicite : neutralise quand même Art. 9 et camarades de la classe active
            const refinedPrompt = PromptService.getRefinementPrompt(
                'polish',
                'Élève PAP avec trouble de l\'attention qui travaille bien avec Chloé Bernard.'
            );
            expect(refinedPrompt).not.toMatch(/\b(PAP|Chloé|Bernard)\b/i);
            expect(refinedPrompt).not.toMatch(/trouble de l'attention/i);
            expect(refinedPrompt).toContain('[AMÉNAGEMENT]');
            expect(refinedPrompt).toContain('[CAMARADE]');
        });

        it('corrige proprement l\'élision française dans deanonymizeText pour voyelles et h muet sans toucher aux autres cas', () => {
            // Voyelles & h muet -> élision
            expect(PromptService.deanonymizeText('Le travail de [PRÉNOM] est sérieux.', 'Arthur'))
                .toBe("Le travail d'Arthur est sérieux.");
            expect(PromptService.deanonymizeText('Les progrès de [PRÉNOM] sont constants.', 'Émilie'))
                .toBe("Les progrès d'Émilie sont constants.");
            expect(PromptService.deanonymizeText('La participation de [PRÉNOM] progresse.', 'Hugo'))
                .toBe("La participation d'Hugo progresse.");
            expect(PromptService.deanonymizeText('Il faut que [PRÉNOM] poursuive ses efforts.', 'Arthur'))
                .toBe("Il faut qu'Arthur poursuive ses efforts.");
            expect(PromptService.deanonymizeText('De [PRÉNOM], on retient la rigueur. Que [PRÉNOM] continue !', 'Émilie'))
                .toBe("D'Émilie, on retient la rigueur. Qu'Émilie continue !");
            expect(PromptService.deanonymizeText('Lorsque [PRÉNOM] participe, la classe progresse.', 'Hugo'))
                .toBe("Lorsqu'Hugo participe, la classe progresse.");
            expect(PromptService.deanonymizeText('Le sérieux de [PRÉNOM] est apprécié.', 'Yves'))
                .toBe("Le sérieux d'Yves est apprécié.");

            // Cas sans élision : consonne, h aspiré, Y + voyelle, autres prépositions/verbes
            expect(PromptService.deanonymizeText('Le travail de [PRÉNOM] et ce que [PRÉNOM] produit sont bons.', 'Lucas'))
                .toBe('Le travail de Lucas et ce que Lucas produit sont bons.');
            expect(PromptService.deanonymizeText('Le travail de [PRÉNOM] progresse.', 'Harry'))
                .toBe('Le travail de Harry progresse.');
            expect(PromptService.deanonymizeText('Le travail de [PRÉNOM] progresse.', 'Yanis'))
                .toBe('Le travail de Yanis progresse.');
            expect(PromptService.deanonymizeText('Pour [PRÉNOM], je remarque [PRÉNOM] en classe.', 'Arthur'))
                .toBe('Pour Arthur, je remarque Arthur en classe.');

            // Cas limites
            expect(PromptService.deanonymizeText('', 'Arthur')).toBe('');
            expect(PromptService.deanonymizeText(null, 'Arthur')).toBeNull();
        });

        it('nettoie les marqueurs techniques [CAMARADE] et [AMÉNAGEMENT] si un LLM les recopie en sortie', () => {
            expect(PromptService.deanonymizeText('[PRÉNOM] bavarde avec [CAMARADE].', 'Lucas'))
                .toBe('Lucas bavarde avec un camarade.');
            expect(PromptService.deanonymizeText('[PRÉNOM] travaille bien avec un [CAMARADE] et ses [CAMARADE].', 'Lucas'))
                .toBe('Lucas travaille bien avec un camarade et ses camarades.');
            expect(PromptService.deanonymizeText("[PRÉNOM] progresse grâce à l'[AMÉNAGEMENT] et ses [AMÉNAGEMENT].", 'Emma'))
                .toBe("Emma progresse grâce à l'accompagnement et ses aménagements.");
            expect(PromptService.deanonymizeText('[PRÉNOM] suit [AMÉNAGEMENT] avec sérieux.', 'Emma'))
                .toBe('Emma suit un accompagnement adapté avec sérieux.');
        });

        it('omet le nom de classe brut lorsqu\'il contient un terme Art. 9 (ULIS, SEGPA, UPE2A) tout en conservant le niveau', () => {
            appState.classes = [{ id: 'cls-ulis', name: '3e SEGPA / ULIS 1', level: 'college' }];
            appState.currentClassId = 'cls-ulis';

            const prompts = PromptService.getAllPrompts({
                id: 'stu-1',
                classId: 'cls-ulis',
                nom: 'MARTIN',
                prenom: 'Lucas',
                statuses: [],
                currentPeriod: 'T1',
                periods: { T1: { grade: '12', context: 'Bon investissement' } }
            });

            expect(prompts.appreciationUser).not.toMatch(/ULIS|SEGPA/i);
            expect(prompts.appreciationUser).toContain('Niveau :');
            expect(prompts.analysisUser).not.toMatch(/ULIS|SEGPA/i);
        });
    });

    describe('Lot 2 — Qualité rédactionnelle, cas limites, showGender, raffinement et sanitization', () => {
        it('n\'injecte PAS (non déterminé...) pour un prénom inconnu quand anonymizeData === false et voice !== neutre, mais le conserve pour les prénoms épicènes', () => {
            const prevAnon = appState.anonymizeData;
            try {
                appState.anonymizeData = false;
                Utils.detectGender.mockReturnValue('neutre');

                // Prénom inconnu de detectGender, mais visible en clair par le LLM
                const unknownReal = PromptService.getAllPrompts(
                    { nom: 'DIALLO', prenom: 'Bintou', statuses: [], currentPeriod: 'T1', periods: { T1: { grade: 14 } } },
                    { voice: 'default', length: 40 }
                );
                expect(unknownReal.appreciationUser).toContain('Élève : Bintou\n');
                expect(unknownReal.appreciationUser).not.toContain('non déterminé');

                // Prénom véritablement épicène : consigne impersonnelle conservée même en clair
                const epiceneReal = PromptService.getAllPrompts(
                    { nom: 'MARTIN', prenom: 'Sacha', statuses: [], currentPeriod: 'T1', periods: { T1: { grade: 14 } } },
                    { voice: 'default', length: 40 }
                );
                expect(epiceneReal.appreciationUser).toContain('Élève : Sacha (non déterminé');

                // En voix neutre, le genre reste toujours injecté
                const neutralVoice = PromptService.getAllPrompts(
                    { nom: 'DIALLO', prenom: 'Bintou', statuses: [], currentPeriod: 'T1', periods: { T1: { grade: 14 } } },
                    { voice: 'neutre', length: 40 }
                );
                expect(neutralVoice.appreciationUser).toContain('Genre : non déterminé');
            } finally {
                appState.anonymizeData = prevAnon;
            }
        });

        it('gère les cas limites de notes : contexte sans aucune note, évaluation unique, excellence (>= 18) et grande fragilité (< 6)', () => {
            // 1. Aucune note sur aucune période, uniquement du contexte
            const contextOnly = PromptService.getAllPrompts({
                nom: 'MARTIN', prenom: 'Lucas', statuses: [], currentPeriod: 'T1',
                periods: { T1: { grade: null, context: 'Absences répétées, quelques exercices rendus.' } }
            });
            expect(contextOnly.appreciationSystem).toContain("Aucune moyenne chiffrée n'est disponible");
            expect(contextOnly.appreciationSystem).not.toContain('suggéré par la moyenne');
            expect(contextOnly.appreciationSystem).not.toContain('sans citer de moyenne chiffrée');
            expect(contextOnly.appreciationUser).toContain('Moy Non renseignée');

            // 2. Une seule évaluation
            const singleEval = PromptService.getAllPrompts({
                nom: 'MARTIN', prenom: 'Lucas', statuses: [], currentPeriod: 'T1',
                periods: { T1: { grade: 13.5, evaluationCount: 1 } }
            });
            expect(singleEval.appreciationSystem).toContain('repose sur une seule évaluation');

            // 3. Note extrême haute (>= 18)
            const highGrade = PromptService.getAllPrompts({
                nom: 'MARTIN', prenom: 'Lucas', statuses: [], currentPeriod: 'T1',
                periods: { T1: { grade: 19.2 } }
            });
            expect(highGrade.appreciationSystem).toContain("sans inventer d'axe d'amélioration artificiel");

            // 4. Note extrême basse (< 6)
            const lowGrade = PromptService.getAllPrompts({
                nom: 'MARTIN', prenom: 'Lucas', statuses: [], currentPeriod: 'T1',
                periods: { T1: { grade: 4.5 } }
            });
            expect(lowGrade.appreciationSystem).toContain('sans formulation décourageante');
        });

        it('cadre la voix par défaut, le gabarit de longueur en phrases et évite le double préfixe Observations', () => {
            const prompts = PromptService.getAllPrompts(
                {
                    nom: 'DUPONT', prenom: 'Emma', statuses: ['PAP'], currentPeriod: 'T1',
                    periods: { T1: { grade: 11 } },
                    journal: [
                        { id: 'j1', period: 'T1', tags: ['participation'], note: 'Bonne intervention orale' },
                        { id: 'j2', period: 'T1', tags: ['participation'], note: 'Répond volontiers' }
                    ]
                },
                { voice: 'default', length: 40 }
            );

            expect(prompts.appreciationSystem).toContain('Rédige à la troisième personne, sans utiliser « je » ni « nous ».');
            expect(prompts.appreciationSystem).toContain('environ 40 mots (1 à 3 phrases)');
            expect(prompts.appreciationSystem).toContain('La justesse prime sur le décompte');
            expect(prompts.appreciationSystem.match(/en un seul paragraphe/g)).toHaveLength(1);
            expect(prompts.appreciationUser).not.toContain('Observations du professeur : Observations:');
            expect(prompts.appreciationUser).not.toMatch(/\n\n$/);

            // Vérification des 5 paliers de fourchettes souples (10 à 90 mots)
            expect(PromptService._formatLengthInstruction(15)).toBe('environ 15 mots (1 phrase courte)');
            expect(PromptService._formatLengthInstruction(25)).toBe('environ 25 mots (1 à 2 phrases courtes)');
            expect(PromptService._formatLengthInstruction(45)).toBe('environ 45 mots (1 à 3 phrases)');
            expect(PromptService._formatLengthInstruction(55)).toBe('environ 55 mots (2 à 3 phrases)');
            expect(PromptService._formatLengthInstruction(75)).toBe('environ 75 mots (2 à 4 phrases)');

            // Vérification de la priorité explicite des consignes spécifiques sur les règles de style
            // et de l'isolation de la fidélité factuelle au-dessus des règles de style
            Utils.getPeriods.mockReturnValue(['S1', 'S2']);
            const customPrompts = PromptService.getAllPrompts(
                {
                    nom: 'DUPONT',
                    prenom: 'Emma',
                    statuses: [],
                    currentPeriod: 'S2',
                    periods: {
                        S1: { grade: 14, appreciation: 'Bon travail.' },
                        S2: { grade: 14.5, context: 'Très investie à l\'oral.' }
                    }
                },
                { voice: 'default', length: 40, styleInstructions: "Vouvoyer l'élève.", enableStyleInstructions: true }
            );
            expect(customPrompts.appreciationSystem).toContain(
                "Consigne de l'enseignant (prioritaire sur les règles de style ci-dessus en cas de conflit) : Vouvoyer l'élève."
            );
            expect(customPrompts.appreciationSystem).toContain('ouverture facultative uniquement si elle vient naturellement');
            const fidelityIdx = customPrompts.appreciationSystem.indexOf('Appuie-toi uniquement sur les données fournies');
            const styleHeaderIdx = customPrompts.appreciationSystem.indexOf('--- INSTRUCTIONS DE STYLE ---');
            expect(fidelityIdx).toBeGreaterThan(-1);
            expect(styleHeaderIdx).toBeGreaterThan(fidelityIdx);

            // Période à évaluer regroupée avec les métadonnées élève avant les indications
            const periodIdx = customPrompts.appreciationUser.indexOf('Période à évaluer : S2');
            const contextIdx = customPrompts.appreciationUser.indexOf("Indications de l'enseignant :");
            expect(periodIdx).toBeGreaterThan(-1);
            expect(contextIdx).toBeGreaterThan(periodIdx);
            expect(customPrompts.appreciationSystem).toContain("respectant les indications et les observations fournies");
            expect(customPrompts.analysisUser).toContain("Indications de l'enseignant :");

            // Les badges ambigus Attitude - / Attitude + sont transmis avec leurs libellés explicites dans les prompts
            const prevThreshold = appState.journalThreshold;
            appState.journalThreshold = 1;
            try {
                const attitudePrompts = PromptService.getAllPrompts({
                    nom: 'MARTIN',
                    prenom: 'Sophie',
                    statuses: [],
                    currentPeriod: 'S2',
                    periods: {
                        S1: { grade: 9.0 },
                        S2: { grade: 10.5, context: 'Les efforts portent leurs fruits.' }
                    },
                    journal: [
                        { id: 'j-att', period: 'S2', tags: ['attitude-'], note: '' }
                    ]
                });
                expect(attitudePrompts.appreciationUser).toContain('Observations du professeur : Attitude à revoir');
                expect(attitudePrompts.appreciationUser).not.toContain('Attitude -');
                expect(attitudePrompts.analysisUser).toContain('Observations : Attitude à revoir');
            } finally {
                appState.journalThreshold = prevThreshold;
            }
        });

        it('sépare systemPrompt et userPrompt dans getRefinementPrompts avec cible de mots pour concise (>= 16 mots) et règles anti-sigles', () => {
            const longText = 'Cet élève fournit un travail très sérieux et régulier depuis le début du trimestre et participe activement aux échanges en classe, ce qui lui permet de consolider durablement ses acquis.';
            const { systemPrompt, userPrompt, prompt } = PromptService.getRefinementPrompts('concise', longText);

            expect(prompt).toBe(`${systemPrompt}\n\n${userPrompt}`);
            expect(systemPrompt).toContain('sans écriture inclusive');
            expect(systemPrompt).toContain('sans sigles de période');
            expect(userPrompt).toMatch(/vise environ \d+ mots/);

            // Texte court (< 16 mots) : pas de calcul arithmétique artificiel
            const shortRes = PromptService.getRefinementPrompts('concise', 'Bon travail ce trimestre.');
            expect(shortRes.userPrompt).not.toMatch(/\d+ mots/);
        });

        it('nettoie uniquement les préfixes parasites et guillemets englobants équilibrés sans altérer la ponctuation interne', () => {
            expect(PromptService.sanitizeAppreciationOutput('"Bon trimestre, travail sérieux."'))
                .toBe('Bon trimestre, travail sérieux.');
            expect(PromptService.sanitizeAppreciationOutput('« Très bons résultats ce trimestre. »'))
                .toBe('Très bons résultats ce trimestre.');
            expect(PromptService.sanitizeAppreciationOutput('Appréciation : "Travail sérieux : à poursuivre ; très bien."'))
                .toBe('Travail sérieux : à poursuivre ; très bien.');
            expect(PromptService.sanitizeAppreciationOutput('**Voici l\'appréciation proposée** : « Des progrès constants. »'))
                .toBe('Des progrès constants.');

            // Guillemets internes et ponctuation interne strictement préservés
            expect(PromptService.sanitizeAppreciationOutput('L\'élève « décroche » parfois ; il doit rester attentif.'))
                .toBe('L\'élève « décroche » parfois ; il doit rester attentif.');
            expect(PromptService.sanitizeAppreciationOutput('"Très bien" au début, puis "fragile" en fin de période.'))
                .toBe('"Très bien" au début, puis "fragile" en fin de période.');
            expect(PromptService.sanitizeAppreciationOutput('')).toBe('');
            expect(PromptService.sanitizeAppreciationOutput(null)).toBe('');
        });
    });

    describe('Garde-fou limite de caractères (Pronote / ÉcoleDirecte / LSU)', () => {
        const studentWithShortName = {
            nom: 'DUPONT',
            prenom: 'Léo',
            statuses: [],
            periods: { T1: { grade: 14, appreciation: '' } },
            currentPeriod: 'T1'
        };

        it('plafonne la cible de mots et injecte le plafond strict en caractères sans consigne contradictoire', () => {
            appState.anonymizeData = true;
            const prompts = PromptService.getAllPrompts(studentWithShortName, {
                length: 75,
                maxChars: 255,
                voice: 'default'
            });

            expect(prompts.appreciationSystem).toContain('sans jamais dépasser 255 caractères (espaces compris)');
            expect(prompts.appreciationSystem).not.toContain('environ 75 mots');
            expect(prompts.appreciationSystem).toMatch(/environ 3[0-4] mots/);
        });

        it('déduit l\'écart de longueur entre [PRÉNOM] et un prénom long en mode anonyme pour éviter un dépassement après désanonymisation', () => {
            appState.anonymizeData = true;
            const longNameStudent = { ...studentWithShortName, prenom: 'Jean-Baptiste' }; // 13 car. vs 8 ([PRÉNOM]) -> -5
            const prompts = PromptService.getAllPrompts(longNameStudent, {
                length: 40,
                maxChars: 255,
                voice: 'default'
            });

            expect(prompts.appreciationSystem).toContain('sans jamais dépasser 250 caractères (espaces compris)');
        });

        it('ne modifie pas le prompt lorsque maxChars est désactivé (null)', () => {
            const prompts = PromptService.getAllPrompts(studentWithShortName, {
                length: 40,
                maxChars: null,
                voice: 'default'
            });

            expect(prompts.appreciationSystem).toContain('environ 40 mots');
            expect(prompts.appreciationSystem).not.toContain('sans jamais dépasser');
        });

        it('oriente le raffinement Concise sous le plafond actif en cas de dépassement et protège les autres raffinements', () => {
            appState.useSubjectPersonalization = true;
            appState.anonymizeData = true;
            appState.subjects['MonStyle'] = {
                iaConfig: { length: 40, maxChars: 255, tone: 3, voice: 'default' }
            };

            const overText = 'A'.repeat(320);
            const conciseOver = PromptService.getRefinementPrompts('concise', overText, { prenom: 'Léo' });
            expect(conciseOver.userPrompt).toContain('impérativement sous 255 caractères');
            expect(conciseOver.systemPrompt).toContain('plafond maximal de 255 caractères');

            const underText = 'Travail sérieux et régulier, bonne implication en classe ce trimestre.';
            const conciseUnder = PromptService.getRefinementPrompts('concise', underText, { prenom: 'Léo' });
            expect(conciseUnder.userPrompt).toContain('plus courte');
            expect(conciseUnder.systemPrompt).toContain('plafond maximal de 255 caractères');

            const polishRes = PromptService.getRefinementPrompts('polish', underText, { prenom: 'Jean-Baptiste' });
            expect(polishRes.systemPrompt).toContain('plafond maximal de 250 caractères');

            delete appState.subjects['MonStyle'];
            appState.useSubjectPersonalization = false;
        });
    });

    describe('Anti-répétition des amorces en lot (recentOpenings)', () => {
        const sampleStudent = {
            nom: 'MARTIN',
            prenom: 'Camille',
            currentPeriod: 'T1',
            periods: { T1: { grade: 14.5, context: 'Travail sérieux' } },
            statuses: []
        };

        it('extrait une amorce courte RGPD-safe en remplaçant le prénom réel par [PRÉNOM]', () => {
            expect(PromptService.extractOpeningSnippet('Camille réalise un très bon trimestre. Bravo !', 'Camille'))
                .toBe('[PRÉNOM] réalise un très bon');
            expect(PromptService.extractOpeningSnippet('[PRÉNOM] progresse nettement, poursuivez ainsi.', 'Léo'))
                .toBe('[PRÉNOM] progresse nettement, poursuivez ainsi');
            expect(PromptService.extractOpeningSnippet('Très bien.', 'Léo')).toBe('Très bien');
            expect(PromptService.extractOpeningSnippet('Bravo.', 'Léo')).toBe('');
        });

        it('maintient une fenêtre glissante dédupliquée de 5 amorces maximum', () => {
            const list = [];
            for (let i = 1; i <= 7; i++) {
                PromptService.pushOpeningSnippet(list, `Amorce numéro ${i}`);
            }
            expect(list).toHaveLength(5);
            expect(list[0]).toBe('Amorce numéro 3');
            expect(list[4]).toBe('Amorce numéro 7');

            PromptService.pushOpeningSnippet(list, 'amorce numéro 4');
            expect(list).toHaveLength(5);
            expect(list[4]).toBe('amorce numéro 4');
        });

        it('injecte recentOpenings dans le prompt système sans modifier getPromptHash()', () => {
            const hashBefore = PromptService.getPromptHash(sampleStudent);
            const promptsWithout = PromptService.getAllPrompts(sampleStudent);
            const promptsWith = PromptService.getAllPrompts(sampleStudent, null, false, {
                recentOpenings: ['[PRÉNOM] réalise un trimestre sérieux', 'Un très bon trimestre pour']
            });
            const hashAfter = PromptService.getPromptHash(sampleStudent);

            expect(promptsWithout.appreciationSystem).not.toContain('Varie l\'amorce');
            expect(promptsWith.appreciationSystem).toContain('Varie l\'amorce de ta première phrase');
            expect(promptsWith.appreciationSystem).toContain('« [PRÉNOM] réalise un trimestre sérieux »');
            expect(hashAfter).toBe(hashBefore);
        });
    });

    describe('_extractJournalSynthesis — étanchéité mode Hors IA', () => {
        it('ne transmet aucune note rédigée quand la classe ou le réglage global est en mode Hors IA', () => {
            const prevClasses = appState.classes;
            const prevClassId = appState.currentClassId;
            const prevInclude = appState.journalIncludeInAI;

            try {
                appState.classes = [
                    { id: 'c-private', name: '3A', journalIncludeInAI: false },
                    { id: 'c-active', name: '3B', journalIncludeInAI: true }
                ];
                appState.currentClassId = 'c-private';
                appState.journalIncludeInAI = true;

                const privateStudent = {
                    id: 'stu-priv',
                    classId: 'c-private',
                    journal: [
                        { id: 'j1', period: 'T1', tags: ['bavardage'], note: 'Note confidentielle prof' },
                        { id: 'j2', period: 'T1', tags: ['bavardage'], note: '' }
                    ]
                };
                const activeStudent = {
                    id: 'stu-act',
                    classId: 'c-active',
                    journal: [
                        { id: 'j3', period: 'T1', tags: ['participation+'], note: 'Très pertinent à l\'oral' }
                    ]
                };

                // Mode Hors IA classe : aucune fuite via le fallback studentData.journal
                expect(PromptService._extractJournalSynthesis(privateStudent, 'T1')).toBe('');
                // Classe active : note rédigée transmise normalement
                expect(PromptService._extractJournalSynthesis(activeStudent, 'T1')).toContain('Très pertinent à l\'oral');

                // Mode Hors IA global sans classId
                appState.currentClassId = null;
                appState.journalIncludeInAI = false;
                expect(PromptService._extractJournalSynthesis({ journal: privateStudent.journal }, 'T1')).toBe('');
            } finally {
                appState.classes = prevClasses;
                appState.currentClassId = prevClassId;
                appState.journalIncludeInAI = prevInclude;
            }
        });
    });

    describe('getPromptSummary & isPrivate', () => {
        it('synthétise fidèlement les données envoyées à l\'IA (anonymisation, statuts RGPD, journal hors privé et scrubbé, genre)', () => {
            const prevAnon = appState.anonymizeData;
            const prevClasses = appState.classes;
            const prevClassId = appState.currentClassId;
            const prevInclude = appState.journalIncludeInAI;
            const prevResults = appState.generatedResults;

            try {
                Utils.getPeriods.mockReturnValue(['T1', 'T2', 'T3']);
                StatsService.analyserEvolution.mockReturnValue([{ periode: 'T1-T2', valeur: 2.5, type: 'very-positive' }]);
                appState.anonymizeData = true;
                appState.classes = [{ id: 'c1', name: '3A', journalIncludeInAI: true }];
                appState.currentClassId = 'c1';
                appState.journalIncludeInAI = true;

                const student = {
                    id: 'stu-sum',
                    classId: 'c1',
                    nom: 'Durand',
                    prenom: 'Sophie',
                    currentPeriod: 'T2',
                    statuses: ['PAP', 'delegue'],
                    periods: {
                        T1: { grade: '11.0', appreciation: 'Trimestre correct pour Sophie.' },
                        T2: { grade: '13.5', context: 'Encourager Sophie à participer davantage.' }
                    },
                    journal: [
                        { id: 'e1', period: 'T2', tags: ['bavardage'], note: 'Note confidentielle prof', isPrivate: true },
                        { id: 'e2', period: 'T2', tags: ['participation+'], note: 'Sophie collabore bien avec Lucas et son PAP l\'aide.' }
                    ]
                };
                appState.generatedResults = [
                    student,
                    { id: 'stu-mate', classId: 'c1', nom: 'Martin', prenom: 'Lucas' }
                ];

                const summaryAnon = PromptService.getPromptSummary(student);
                expect(summaryAnon.currentPeriodLabel).toBe('T2');
                expect(summaryAnon.identity.isAnonymous).toBe(true);
                expect(summaryAnon.identity.label).toBe('Aucun nom ni prénom');
                expect(summaryAnon.identity.genderIncluded).toBe(true);
                expect(summaryAnon.grades.items.map(i => i.period)).toEqual(['T1', 'T2']);
                expect(summaryAnon.grades.evolutions).toEqual([
                    { periode: 'T1 → T2', deltaLabel: '+2,5 pts', description: 'Progression notable', type: 'very-positive' }
                ]);
                expect(summaryAnon.previousAppreciations).toHaveLength(1);
                expect(summaryAnon.previousAppreciations[0].preview).toContain('[PRÉNOM]');
                expect(summaryAnon.statuses.find(s => s.raw === 'PAP').isGdprSensitive).toBe(true);
                expect(summaryAnon.statuses.find(s => s.raw === 'delegue').isGdprSensitive).toBe(false);
                expect(summaryAnon.journal.notes).toHaveLength(1);
                expect(summaryAnon.journal.notes[0].text).toContain('[PRÉNOM]');
                expect(summaryAnon.journal.notes[0].text).toContain('[CAMARADE]');
                expect(summaryAnon.journal.notes[0].text).toContain('[AMÉNAGEMENT]');
                expect(summaryAnon.journal.notes[0].text).not.toContain('Sophie');
                expect(summaryAnon.journal.notes[0].text).not.toContain('Lucas');
                expect(summaryAnon.journal.notes[0].text).not.toContain('PAP');
                expect(summaryAnon.journal.privateCount).toBe(1);
                expect(summaryAnon.context).toContain('[PRÉNOM]');

                // Mode non anonymisé (hors style neutre) : prénom affiché, genre non injecté si prénom non épicène
                appState.anonymizeData = false;
                const summaryNamed = PromptService.getPromptSummary(student, { voice: 'je' });
                expect(summaryNamed.identity.isAnonymous).toBe(false);
                expect(summaryNamed.identity.label).toBe('Sophie');
                expect(summaryNamed.identity.genderIncluded).toBe(false);
            } finally {
                appState.anonymizeData = prevAnon;
                appState.classes = prevClasses;
                appState.currentClassId = prevClassId;
                appState.journalIncludeInAI = prevInclude;
                appState.generatedResults = prevResults;
            }
        });

        it('modifie getPromptHash lorsqu\'une entrée du journal bascule isPrivate', () => {
            const prevInclude = appState.journalIncludeInAI;
            try {
                appState.journalIncludeInAI = true;
                const baseStudent = {
                    id: 'stu-hash',
                    nom: 'Martin',
                    prenom: 'Lucas',
                    currentPeriod: 'T1',
                    statuses: [],
                    periods: { T1: { moy: '12.0', context: '' } },
                    journal: [
                        { id: 'e1', period: 'T1', tags: ['participation+'], note: 'Très actif', isPrivate: false }
                    ]
                };
                const hashPublic = PromptService.getPromptHash(baseStudent);

                const privateStudent = {
                    ...baseStudent,
                    journal: [{ ...baseStudent.journal[0], isPrivate: true }]
                };
                const hashPrivate = PromptService.getPromptHash(privateStudent);

                expect(hashPrivate).not.toBe(hashPublic);
            } finally {
                appState.journalIncludeInAI = prevInclude;
            }
        });
    });
});
