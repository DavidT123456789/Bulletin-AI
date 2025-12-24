
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptService } from './PromptService.js';
import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { DOM } from '../utils/DOM.js';
import { StatsService } from './StatsService.js';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        currentSubject: 'Générique',
        useSubjectPersonalization: false,
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

vi.mock('../utils/Utils.js', () => ({
    Utils: {
        getPeriods: vi.fn(),
        getPeriodLabel: vi.fn(),
        countWords: vi.fn(s => s ? s.split(' ').length : 0),
        cleanMarkdown: vi.fn(s => s)
    }
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {
        refinementContext: { value: 'context' }
    }
}));

vi.mock('./StatsService.js', () => ({
    StatsService: {
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

            expect(prompts.appreciation).toContain("Rédige l'appréciation de l'élève John DOE");
            expect(prompts.appreciation).toContain("Adopte un ton équilibré"); // tone 3
            expect(prompts.appreciation).toContain("Utilise impérativement la première personne du singulier"); // voice je
        });

        it('should generate personalized prompt for Mathématiques', () => {
            // Change state for this test
            appState.useSubjectPersonalization = true;
            mockStudentData.subject = 'Mathématiques';

            const prompts = PromptService.getAllPrompts(mockStudentData);

            expect(prompts.appreciation).toContain("En tant que professeur de Mathématiques");
            expect(prompts.appreciation).toContain("Adopte un ton très encourageant"); // tone 1
            expect(prompts.appreciation).toContain("première personne du pluriel"); // voice nous
        });

        it('should include negative instructions/constraints', () => {
            const dataWithInstructions = {
                ...mockStudentData,
                negativeInstructions: "Ne pas mentionner le bavardage."
            };
            const prompts = PromptService.getAllPrompts(dataWithInstructions);
            expect(prompts.appreciation).toContain("Prends en compte cette information spécifique à l'élève");
            expect(prompts.appreciation).toContain("Ne pas mentionner le bavardage");
        });

        it('should include historic data', () => {
            Utils.getPeriods.mockReturnValue(['T1', 'T2']);
            const dataWithHistory = {
                ...mockStudentData,
                currentPeriod: 'T2',
                periods: {
                    'T1': { grade: 10, appreciation: 'Fair' },
                    'T2': { grade: 14 }
                }
            };
            const prompts = PromptService.getAllPrompts(dataWithHistory);
            expect(prompts.appreciation).toContain("Historique");
            expect(prompts.appreciation).toContain("Période T1 -> Moy: 10,0");
        });

        it('should use override config if provided', () => {
            const override = { tone: 5, voice: 'nous', length: 100 };
            const prompts = PromptService.getAllPrompts(mockStudentData, override);
            expect(prompts.appreciation).toContain("très strict et formel"); // tone 5
            expect(prompts.appreciation).toContain("environ 100 mots");
        });
    });

    describe('getRefinementPrompt', () => {
        const originalText = "Ceci est une bonne appréciation.";

        it('should generate polish prompt', () => {
            const p = PromptService.getRefinementPrompt('polish', originalText);
            expect(p).toContain("Peaufine");
        });

        it('should generate variations prompt', () => {
            const p = PromptService.getRefinementPrompt('variations', originalText);
            expect(p).toContain("Reformule différemment");
        });

        it('should generate context prompt', () => {
            const p = PromptService.getRefinementPrompt('context', originalText, "Plus de détails");
            expect(p).toContain('Intègre ce contexte : "Plus de détails"');
        });

        it('should generate detailed prompt', () => {
            const p = PromptService.getRefinementPrompt('detailed', originalText);
            expect(p).toContain("Développe les points");
        });

        it('should generate concise prompt', () => {
            const p = PromptService.getRefinementPrompt('concise', originalText);
            expect(p).toContain("Plus concis");
        });
    });
});
