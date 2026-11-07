/**
 * @fileoverview Unit tests for ClassDashboardManager safe modal handling, analytics & AI synthesis
 * @module managers/ClassDashboardManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClassDashboardManager } from './ClassDashboardManager.js';
import { appState } from '../state/State.js';
import { AIService } from '../services/AIService.js';
import { StorageManager } from './StorageManager.js';
import { UI } from './UIManager.js';

describe('ClassDashboardManager - Safe DOM handling & Analytics', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        ClassDashboardManager.modal = null;
        ClassDashboardManager._listenersBound = false;
        ClassDashboardManager.cachedStats = null;
        ClassDashboardManager.cachedSynthesisHTML = null;
        ClassDashboardManager.cachedSynthesisClassId = null;
        ClassDashboardManager.cachedSynthesisPeriod = null;
        ClassDashboardManager.previousSynthesisState = null;
        appState.currentClassId = 'class-1';
        appState.currentPeriod = 'T2';
        appState.periodSystem = 'trimestres';
        appState.evolutionThresholds = { positive: 0.5, negative: -0.5 };
        appState.generatedResults = [];
        appState.filteredResults = [];
        appState.classes = [];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('devrait exécuter restoreOrResetAISection sans erreur même si le modal est absent du DOM (null)', () => {
        appState.currentClassId = 'class-1';
        appState.currentPeriod = 'T1';

        expect(() => {
            ClassDashboardManager.restoreOrResetAISection();
        }).not.toThrow();
    });

    it('devrait exécuter resetAISection sans erreur même si le modal est absent du DOM (null)', () => {
        expect(() => {
            ClassDashboardManager.resetAISection();
        }).not.toThrow();
    });

    it('devrait automatiquement trouver et lier le modal quand il est présent dans le DOM et masquer le bouton Générer redondant au reset', () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent"></div>
                <button id="generateSynthesisBtn"></button>
                <div id="aiRefinementToolbar"></div>
                <button id="revertSynthesisBtn"></button>
            </div>
        `;

        expect(ClassDashboardManager.modal).toBeNull();
        const modal = ClassDashboardManager._ensureModal();

        expect(modal).not.toBeNull();
        expect(ClassDashboardManager.modal).toBe(modal);
        expect(ClassDashboardManager._listenersBound).toBe(true);

        expect(() => {
            ClassDashboardManager.resetAISection();
        }).not.toThrow();

        const content = document.getElementById('aiSynthesisContent');
        const generateBtn = document.getElementById('generateSynthesisBtn');
        expect(content.innerHTML).toContain('ai-placeholder');
        expect(generateBtn.style.display).toBe('none');
    });

    it('devrait restaurer l\'analyse enregistrée et afficher le bouton Régénérer quand le modal existe', () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent"></div>
                <button id="generateSynthesisBtn" style="display: none;"></button>
                <div id="aiRefinementToolbar"></div>
                <button id="revertSynthesisBtn"></button>
                <button id="copyDashboardSynthesisBtn"></button>
            </div>
        `;

        appState.currentClassId = 'class-1';
        appState.currentPeriod = 'T1';
        appState.classes = [
            {
                id: 'class-1',
                name: '3ème A',
                analyses: {
                    T1: {
                        content: '<p>Excellente dynamique de classe.</p>',
                        dataHash: 'hash123'
                    }
                }
            }
        ];

        expect(() => {
            ClassDashboardManager.restoreOrResetAISection();
        }).not.toThrow();

        const content = document.getElementById('aiSynthesisContent');
        const generateBtn = document.getElementById('generateSynthesisBtn');
        expect(content.innerHTML).toBe('<p>Excellente dynamique de classe.</p>');
        expect(generateBtn.style.display).toBe('inline-flex');
    });

    it('devrait analyser la cohorte complète de la classe même si appState.filteredResults est filtré', () => {
        appState.currentClassId = 'class-1';
        appState.currentPeriod = 'T2';
        appState.generatedResults = [
            {
                id: '1',
                classId: 'class-1',
                nom: 'Dupont',
                prenom: 'Alice',
                studentData: {
                    periods: {
                        T1: { grade: 12 },
                        T2: { grade: 14.5, appreciation: 'Très bon trimestre.' }
                    }
                }
            },
            {
                id: '2',
                classId: 'class-1',
                nom: 'Martin',
                prenom: 'Bob',
                studentData: {
                    periods: {
                        T1: { grade: 10 },
                        T2: { grade: 8.5, appreciation: 'Efforts à poursuivre.' }
                    }
                }
            },
            {
                id: '3',
                classId: 'class-1',
                nom: 'Parti',
                prenom: 'Charles',
                statuses: ['Départ T1'],
                studentData: {
                    periods: {
                        T1: { grade: 11 },
                        T2: { grade: 11 }
                    }
                }
            }
        ];
        // Simulate active search filter showing only 1 student in table
        appState.filteredResults = [appState.generatedResults[0]];

        const students = ClassDashboardManager.getStudentsData();
        expect(students).toHaveLength(2);
        expect(students[0].prenom).toBe('Alice');
        expect(students[0].appreciation).toBe('Très bon trimestre.');
        expect(students[0].evolution).toBe(2.5);
        expect(students[1].prenom).toBe('Bob');
        expect(students[1].evolution).toBe(-1.5);
    });

    it('devrait calculer les statistiques (médiane, seuils personnalisés, top progressions et élèves à surveiller pertinents)', () => {
        appState.evolutionThresholds = { positive: 1.0, negative: -1.0 };

        const students = [
            // Excellente note avec micro-baisse (-0.2) : NE DOIT PAS être dans "Élèves à surveiller"
            { nom: 'Excellence', prenom: 'Clara', grade: 16.5, previousGrade: 16.7, evolution: -0.2, appreciation: '' },
            // Forte progression (+2.2 >= 1.0)
            { nom: 'Progres', prenom: 'Lucas', grade: 14.0, previousGrade: 11.8, evolution: 2.2, appreciation: '' },
            // Légère hausse (+0.4 < 1.0) : stable selon le seuil personnalisé, ne doit pas être dans Top Progressions
            { nom: 'StablePlus', prenom: 'Emma', grade: 12.4, previousGrade: 12.0, evolution: 0.4, appreciation: '' },
            // Élève en difficulté (< 10) avec légère hausse (+0.2) : DOIT être dans "Élèves à surveiller"
            { nom: 'Fragile', prenom: 'Hugo', grade: 7.5, previousGrade: 7.3, evolution: 0.2, appreciation: '' },
            // Élève moyen (11.0 < 12) avec baisse marquée (-1.2 <= -1.0) : DOIT être dans "Élèves à surveiller"
            { nom: 'Chute', prenom: 'Léo', grade: 11.0, previousGrade: 12.2, evolution: -1.2, appreciation: '' }
        ];

        const stats = ClassDashboardManager.calculateStatistics(students);

        expect(stats.count).toBe(5);
        expect(stats.median).toBe(12.4);
        expect(stats.aboveTenCount).toBe(4);
        expect(stats.successRate).toBe(80);
        expect(stats.progressCount).toBe(1);
        expect(stats.regressionCount).toBe(1);
        expect(stats.stableCount).toBe(3);

        // Seul Lucas dépasse le seuil positif (+1.0)
        expect(stats.topProgressions.map(s => s.prenom)).toEqual(['Lucas']);

        // Clara (16.5, -0.2) est exclue ; Hugo (7.5) et Léo (11.0, -1.2) sont inclus
        const atRiskNames = stats.atRisk.map(s => s.prenom);
        expect(atRiskNames).toContain('Hugo');
        expect(atRiskNames).toContain('Léo');
        expect(atRiskNames).not.toContain('Clara');
    });

    it('devrait mettre à jour la barre de cohorte (médiane, badge sémantique) et gérer l\'état T1 sans évolution dans updateHighlights', () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <span id="cohortHeaderMetric"></span>
                <div id="cohortStatMedianItem"><span id="cohortStatMedian"></span></div>
                <span id="cohortStatAverage"></span>
                <span id="cohortStatMin"></span>
                <span id="cohortStatMax"></span>
                <span id="highlightProgressCount"></span>
                <span id="highlightRiskCount"></span>
                <div id="highlightProgressList"></div>
                <div id="highlightRiskList"></div>
            </div>
        `;
        ClassDashboardManager._ensureModal();
        appState.currentPeriod = 'T1';
        appState.periodSystem = 'trimestres';

        const students = [
            { id: '1', nom: 'Dupont', prenom: 'Alice', fullName: 'Alice Dupont', grade: 15.0, previousGrade: null, evolution: null, appreciation: '' },
            { id: '2', nom: 'Fragile', prenom: 'Hugo', fullName: 'Hugo Fragile', grade: 8.0, previousGrade: null, evolution: null, appreciation: '' }
        ];
        const stats = ClassDashboardManager.calculateStatistics(students);
        ClassDashboardManager.renderDashboard(stats);

        const metric = document.getElementById('cohortHeaderMetric');
        expect(metric.classList.contains('warning')).toBe(true);
        expect(metric.textContent).toContain('50% de réussite');

        const medianEl = document.getElementById('cohortStatMedian');
        expect(medianEl.textContent).toContain('11,5/20');

        const progressCount = document.getElementById('highlightProgressCount');
        expect(progressCount.textContent).toBe('Dès le T2');
        expect(document.getElementById('highlightProgressList').textContent).toContain('Comparaison disponible au prochain trimestre');

        const riskCount = document.getElementById('highlightRiskCount');
        expect(riskCount.textContent).toBe('1');
        expect(document.getElementById('highlightRiskList').textContent).toContain('FRAGILE Hugo');
    });

    it('devrait conserver la grille Bento JSON lors d\'un affinement IA (handleClassAnalysisActions)', async () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent"><div class="ai-synthesis-text"><div class="synthesis-section">Ancien contenu</div></div></div>
                <button id="generateSynthesisBtn"></button>
                <div id="aiRefinementToolbar">
                    <button id="btnSummarize" class="btn-refinement" data-refine-type="summarize">Synthétiser</button>
                </div>
                <button id="revertSynthesisBtn"></button>
                <button id="copyDashboardSynthesisBtn"></button>
            </div>
        `;
        ClassDashboardManager._ensureModal();
        appState.currentClassId = 'class-1';
        appState.currentPeriod = 'T2';
        appState.classes = [{ id: 'class-1', name: '3ème A', analyses: {} }];

        vi.spyOn(UI, 'checkAPIKeyPresence').mockReturnValue(true);
        vi.spyOn(UI, 'showInlineSpinner').mockImplementation(() => {});
        vi.spyOn(UI, 'hideInlineSpinner').mockImplementation(() => {});
        vi.spyOn(UI, 'animateHtmlReveal').mockImplementation(async (el, html) => { el.innerHTML = html; });
        vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});
        vi.spyOn(AIService, 'callAIWithFallback').mockResolvedValue({
            text: JSON.stringify({
                synthesis: 'Bilan très concis de la classe.',
                strengths: ['Participation active'],
                vigilances: ['Attention aux bavardages'],
                recommendations: ['Maintenir le rythme']
            })
        });

        const btn = document.getElementById('btnSummarize');
        await ClassDashboardManager.handleClassAnalysisActions(btn);

        const content = document.getElementById('aiSynthesisContent');
        expect(content.querySelector('.synthesis-intro-card')).not.toBeNull();
        expect(content.querySelector('.synthesis-section--success')).not.toBeNull();
        expect(content.textContent).toContain('Bilan très concis de la classe.');
        expect(content.textContent).toContain('Participation active');
    });

    it('devrait copier un texte structuré avec titres et puces dans copySynthesis', async () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent">
                    <div class="ai-synthesis-text">
                        <div class="synthesis-section synthesis-intro-card">
                            <div class="synthesis-intro-header"><span>Synthèse Globale</span></div>
                            <p class="synthesis-intro-text">Classe agréable.</p>
                        </div>
                        <div class="synthesis-section synthesis-section--success">
                            <div class="synthesis-section-header"><span>Points forts</span></div>
                            <div class="synthesis-section-content"><ul class="synthesis-list"><li>Bonne participation</li></ul></div>
                        </div>
                    </div>
                </div>
                <button id="copyDashboardSynthesisBtn"></button>
            </div>
        `;
        ClassDashboardManager._ensureModal();

        const writeTextMock = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
        vi.spyOn(UI, 'showNotification').mockImplementation(() => {});

        ClassDashboardManager.copySynthesis();
        await Promise.resolve();

        expect(writeTextMock).toHaveBeenCalledTimes(1);
        const copiedText = writeTextMock.mock.calls[0][0];
        expect(copiedText).toContain('Synthèse Globale :\nClasse agréable.');
        expect(copiedText).toContain('Points forts :\n• Bonne participation');
    });

    it('devrait pseudonymiser les prénoms et nettoyer les noms dans buildAIPrompt quand anonymizeData est actif', () => {
        appState.anonymizeData = true;
        appState.currentPeriod = 'T2';

        const { userPrompt } = ClassDashboardManager.buildAIPrompt({
            count: 25,
            average: 12.5,
            median: 12.5,
            min: 8,
            max: 18,
            stdDev: 2.0,
            distribution: { '0-4': 0, '4-8': 2, '8-12': 10, '12-16': 10, '16-20': 3 },
            hasEvolutionData: true,
            avgEvolution: 0.8,
            progressCount: 14,
            stableCount: 8,
            regressionCount: 3,
            topProgressions: [{ prenom: 'Lucas', nom: 'Martin', evolution: 2.4 }],
            appreciationsList: [
                { prenom: 'Lucas', nom: 'Martin', text: 'Lucas Martin a bien progressé.' }
            ]
        });

        expect(userPrompt).toContain('Élève #1 (+2.4)');
        expect(userPrompt).toContain('• Élève #1 : Élève #1 a bien progressé.');
        expect(userPrompt).not.toMatch(/\bLucas\b/i);
        expect(userPrompt).not.toMatch(/\bMartin\b/i);
    });
});
