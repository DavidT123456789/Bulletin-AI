/**
 * @fileoverview Tests unitaires pour FocusPanelGenerator._buildPromptSummaryHtml
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../state/State.js', () => ({ appState: {} }));
vi.mock('../UIManager.js', () => ({ UI: {} }));
vi.mock('../StorageManager.js', () => ({ StorageManager: {} }));
vi.mock('../../services/PromptService.js', () => ({ PromptService: {} }));
vi.mock('../ListViewManager.js', () => ({ ListViewManager: {} }));
vi.mock('../FocusPanelHistory.js', () => ({ FocusPanelHistory: {} }));
vi.mock('../FocusPanelHeader.js', () => ({ FocusPanelHeader: {} }));
vi.mock('../FocusPanelStatus.js', () => ({ FocusPanelStatus: {} }));
vi.mock('../SpeechRecognitionManager.js', () => ({ SpeechRecognitionManager: {} }));

import { FocusPanelGenerator } from './FocusPanelGenerator.js';

const buildBaseSummary = (overrides = {}) => ({
    currentPeriodLabel: 'S2',
    identity: {
        label: 'Sophie',
        isAnonymous: false,
        isNeutralVoice: false,
        gender: 'féminin',
        genderIncluded: false,
        className: 'Classe exemple',
        levelLabel: ''
    },
    grades: {
        items: [
            { period: 'S1', periodLabel: 'S1', gradeFormatted: '9,0/20', evalCount: null, isCurrent: false },
            { period: 'S2', periodLabel: 'S2', gradeFormatted: '10,5/20', evalCount: null, isCurrent: true }
        ],
        evolutionText: 'Évolution S1 -> S2 : Progression (+1,5 pt)',
        evolutions: [{ periode: 'S1 → S2', deltaLabel: '+1,5 pt', description: 'Progression', type: 'positive' }],
        classStatsIncluded: true,
        classAverageFormatted: '13,1/20'
    },
    previousAppreciations: [],
    statuses: [],
    journal: {
        includedInAI: true,
        threshold: 1,
        tags: [],
        notes: [],
        standaloneLabels: [],
        privateCount: 0,
        totalCount: 0
    },
    context: '',
    style: {
        voiceLabel: '3e personne',
        length: 45,
        maxChars: null,
        discipline: 'Technologie',
        hasCustomInstructions: true
    },
    ...overrides
});

describe('FocusPanelGenerator._buildPromptSummaryHtml', () => {
    it('ne duplique pas le tag en seuil 1 quand standaloneLabels est vide et affiche la note complète', () => {
        const summary = buildBaseSummary({
            journal: {
                includedInAI: true,
                threshold: 1,
                tags: [{ id: 'progres', label: 'Progrès', count: 1 }],
                notes: [{ text: "Méthode bien appliquée lors de l'exercice en autonomie.", extraTagLabels: [], uiTagLabels: ['Progrès'] }],
                standaloneLabels: [],
                privateCount: 1,
                totalCount: 2
            }
        });

        const html = FocusPanelGenerator._buildPromptSummaryHtml(summary);
        const progresMatches = html.match(/Progrès/g) || [];
        expect(progresMatches).toHaveLength(1);
        expect(html).toContain("Méthode bien appliquée lors de l&#39;exercice en autonomie.");
        expect(html).toContain('(1 privée exclue)');
        expect(html).not.toContain('<div class="ai-data-line">Progrès');
    });

    it('utilise ai-data-line en multi-notes et rattache le suffixe privé à la dernière ligne', () => {
        const summary = buildBaseSummary({
            previousAppreciations: [
                { period: 'T1', periodLabel: 'T1', preview: 'Bon début.' },
                { period: 'T2', periodLabel: 'T2', preview: 'Poursuit ses efforts.' }
            ],
            journal: {
                includedInAI: true,
                threshold: 2,
                tags: [{ id: 'bavardage', label: 'Bavardage', count: 2 }],
                notes: [
                    { text: 'Première note', extraTagLabels: [], uiTagLabels: [] },
                    { text: 'Seconde note', extraTagLabels: ['Progrès'], uiTagLabels: ['Progrès'] }
                ],
                standaloneLabels: ['Bavardage'],
                privateCount: 2,
                totalCount: 5
            }
        });

        const html = FocusPanelGenerator._buildPromptSummaryHtml(summary);
        expect(html).toContain('<div class="ai-data-line"><strong>T1 :</strong> « Bon début. »</div>');
        expect(html).toContain('<div class="ai-data-line">Bavardage</div>');
        expect(html).toContain('<div class="ai-data-line">Progrès : « Seconde note » <span class="ai-data-muted">(2 privées exclues)</span></div>');
    });

    it('omet les rubriques vides et clarifie le badge RGPD des statuts sensibles', () => {
        const emptySummary = buildBaseSummary();
        const emptyHtml = FocusPanelGenerator._buildPromptSummaryHtml(emptySummary);
        expect(emptyHtml).toContain('Identité');
        expect(emptyHtml).toContain('Moyennes');
        expect(emptyHtml).not.toContain('Précédent');
        expect(emptyHtml).not.toContain('Statuts');
        expect(emptyHtml).not.toContain('Journal');
        expect(emptyHtml).not.toContain('Indications');
        expect(emptyHtml).toContain('Nom masqué');
        expect(emptyHtml).not.toContain('Féminin');

        const rgpdSummary = buildBaseSummary({
            statuses: [
                {
                    raw: 'PPRE',
                    label: 'PPRE',
                    isGdprSensitive: true,
                    isExcludedFromAI: true,
                    instruction: ''
                },
                {
                    raw: 'Délégué',
                    label: 'Délégué',
                    isGdprSensitive: false,
                    isExcludedFromAI: false,
                    instruction: "Prendre en compte l'engagement citoyen de l'élève si pertinent."
                }
            ]
        });
        const rgpdHtml = FocusPanelGenerator._buildPromptSummaryHtml(rgpdSummary);
        expect(rgpdHtml).toContain('PPRE · Hors IA');
        expect(rgpdHtml).toContain("Non transmis à l'IA (repère local · RGPD)");
        expect(rgpdHtml).toContain('Délégué');
        expect(rgpdHtml).toContain('« Prendre en compte l&#39;engagement citoyen de l&#39;élève si pertinent. »');
    });
});
