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
import { FocusPanelRefinement } from './FocusPanelRefinement.js';

describe('ClassDashboardManager - Safe DOM handling & Analytics', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        ClassDashboardManager.cancelAllGenerations?.();
        ClassDashboardManager._activeGenerations.clear();
        ClassDashboardManager.modal = null;
        ClassDashboardManager._listenersBound = false;
        ClassDashboardManager.cachedStats = null;
        ClassDashboardManager.cachedSynthesisHTML = null;
        ClassDashboardManager.originalSynthesisHTML = null;
        ClassDashboardManager.cachedSynthesisRawText = null;
        ClassDashboardManager.originalSynthesisRawText = null;
        ClassDashboardManager.cachedSynthesisClassId = null;
        ClassDashboardManager.cachedSynthesisPeriod = null;
        ClassDashboardManager.cachedSynthesisDataHash = null;
        ClassDashboardManager.cachedSynthesisModel = null;
        ClassDashboardManager.cachedSynthesisSubject = null;
        ClassDashboardManager.previousSynthesisState = null;
        ClassDashboardManager._expandedHighlights = { progress: false, risk: false };
        ClassDashboardManager._introHistoryState = { versions: [], currentIndex: -1 };
        ClassDashboardManager._endIntroEditSession?.();
        ClassDashboardManager.closeIntroHistoryPopover?.();
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

    it('devrait affiner uniquement la Synthèse globale et préserver intactes les cartes de puces (handleClassAnalysisActions)', async () => {
        const initialJson = JSON.stringify({
            synthesis: 'Classe sérieuse mais résultats encore un peu hétérogènes au second semestre.',
            strengths: ['Participation active', 'Puce ajoutée par le professeur'],
            vigilances: ['Attention aux bavardages'],
            recommendations: ['Instaurer des rituels de début de séance']
        });
        const initialHtml = `<div class="ai-synthesis-text">${ClassDashboardManager._formatSynthesisText(initialJson)}</div>`;

        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent">${initialHtml}</div>
                <button id="generateSynthesisBtn"></button>
                <div id="aiRefinementToolbar">
                    <button id="btnConcise" class="btn-refinement" data-refine-type="concise">Concise</button>
                </div>
                <button id="revertSynthesisBtn" style="display: none;"></button>
                <button id="copyDashboardSynthesisBtn"></button>
            </div>
        `;
        ClassDashboardManager._ensureModal();
        ClassDashboardManager.cachedSynthesisHTML = initialHtml;
        ClassDashboardManager.originalSynthesisHTML = initialHtml;
        ClassDashboardManager.cachedSynthesisRawText = initialJson;
        ClassDashboardManager.originalSynthesisRawText = initialJson;
        appState.currentClassId = 'class-1';
        appState.currentPeriod = 'T2';
        appState.classes = [{ id: 'class-1', name: '3ème A', analyses: {} }];

        vi.spyOn(UI, 'checkAPIKeyPresence').mockReturnValue(true);
        vi.spyOn(UI, 'showInlineSpinner').mockImplementation(() => {});
        vi.spyOn(UI, 'hideInlineSpinner').mockImplementation(() => {});
        vi.spyOn(UI, 'animateHtmlReveal').mockImplementation(async (el, html) => { el.innerHTML = html; });
        vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});
        const aiSpy = vi.spyOn(AIService, 'callAIWithFallback').mockResolvedValue({
            text: 'Bilan très concis de la classe.'
        });

        const btn = document.getElementById('btnConcise');
        await ClassDashboardManager.handleClassAnalysisActions(btn);

        // L'IA ne reçoit que le paragraphe de synthèse globale, jamais les puces éditées
        expect(aiSpy).toHaveBeenCalledTimes(1);
        expect(aiSpy.mock.calls[0][0]).toContain('Classe sérieuse mais résultats encore un peu hétérogènes');
        expect(aiSpy.mock.calls[0][0]).not.toContain('Puce ajoutée par le professeur');

        const content = document.getElementById('aiSynthesisContent');
        expect(content.querySelector('.synthesis-intro-text').textContent).toBe('Bilan très concis de la classe.');
        expect(content.textContent).toContain('Puce ajoutée par le professeur');
        expect(content.textContent).toContain('Attention aux bavardages');
        expect(content.textContent).toContain('Instaurer des rituels de début de séance');
        expect(JSON.parse(ClassDashboardManager.cachedSynthesisRawText).strengths).toEqual([
            'Participation active',
            'Puce ajoutée par le professeur'
        ]);
        // Retouche d'intro uniquement : le stepper < 2/2 > s'affiche et #revertSynthesisBtn reste masqué (réservé aux puces)
        const historyGroup = content.querySelector('.synthesis-intro-history-group');
        expect(historyGroup.style.display).toBe('inline-flex');
        expect(historyGroup.querySelector('.history-count').textContent).toBe('2/2');
        expect(document.getElementById('revertSynthesisBtn').style.display).toBe('none');
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

    it('devrait copier uniquement le texte pur de la synthèse globale (sans titre ni puces) via le bouton dédié', async () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent"></div>
                <button id="generateSynthesisBtn"></button>
                <div id="aiRefinementToolbar"></div>
                <button id="revertSynthesisBtn"></button>
                <button id="copyDashboardSynthesisBtn"></button>
            </div>
        `;
        ClassDashboardManager._ensureModal();

        const rawJson = JSON.stringify({
            synthesis: 'Classe dynamique et investie tout au long du trimestre.',
            strengths: ['Participation orale régulière'],
            vigilances: ['Quelques bavardages en fin de séance'],
            recommendations: ['Maintenir cette implication au prochain trimestre']
        });
        const html = `<div class="ai-synthesis-text">${ClassDashboardManager._formatSynthesisText(rawJson)}</div>`;
        await ClassDashboardManager._applySynthesisToUI(html, false);

        const writeTextMock = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
        const notifySpy = vi.spyOn(UI, 'showNotification').mockImplementation(() => {});

        const introCopyBtn = document.querySelector('.synthesis-intro-copy-btn');
        expect(introCopyBtn).not.toBeNull();

        introCopyBtn.click();
        await new Promise(r => setTimeout(r, 0));

        expect(writeTextMock).toHaveBeenCalledTimes(1);
        expect(writeTextMock).toHaveBeenCalledWith('Classe dynamique et investie tout au long du trimestre.');
        expect(notifySpy).not.toHaveBeenCalled();
        expect(introCopyBtn.classList.contains('copied')).toBe(true);
    });

    it('devrait persister l\'édition manuelle directe, mettre à jour rawText et afficher le bouton Rétablir', async () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent"></div>
                <button id="generateSynthesisBtn"></button>
                <div id="aiRefinementToolbar"></div>
                <button id="revertSynthesisBtn" style="display: none;"></button>
                <button id="copyDashboardSynthesisBtn"></button>
            </div>
        `;
        ClassDashboardManager._ensureModal();

        const saveSpy = vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});
        vi.spyOn(UI, 'animateHtmlReveal').mockImplementation(async (el, html) => { el.innerHTML = html; });
        vi.spyOn(UI, 'showNotification').mockImplementation(() => {});

        const initialJson = JSON.stringify({
            synthesis: 'Bilan initial de la classe.',
            strengths: ['Travail sérieux', 'Bonne écoute'],
            vigilances: ['Devoirs parfois oubliés'],
            recommendations: ['Consolider les acquis']
        });
        const initialHtml = `<div class="ai-synthesis-text">${ClassDashboardManager._formatSynthesisText(initialJson)}</div>`;

        appState.currentClassId = 'class-1';
        appState.currentPeriod = 'T2';
        appState.classes = [{
            id: 'class-1',
            name: '3ème A',
            analyses: {
                T2: {
                    content: initialHtml,
                    originalContent: initialHtml,
                    rawText: initialJson,
                    originalRawText: initialJson,
                    dataHash: 'hash1'
                }
            }
        }];

        ClassDashboardManager.restoreOrResetAISection();

        const revertBtn = document.getElementById('revertSynthesisBtn');
        expect(revertBtn.style.display).toBe('none');

        const introTextEl = document.querySelector('.synthesis-intro-text');
        expect(introTextEl.getAttribute('contenteditable')).toBe('true');

        // 1. Focus and blur WITHOUT changing text -> no save, revert stays hidden
        introTextEl.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        introTextEl.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        expect(saveSpy).not.toHaveBeenCalled();
        expect(revertBtn.style.display).toBe('none');

        // 2. Focus, modify intro text, and blur -> persists to storage, updates JSON rawText, activates < 2/2 > (footer revert stays hidden until bullets change)
        introTextEl.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        introTextEl.textContent = 'Bilan personnalisé par le professeur.';
        introTextEl.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

        expect(saveSpy).toHaveBeenCalledTimes(1);
        expect(revertBtn.style.display).toBe('none');
        expect(document.querySelector('.synthesis-intro-history-group').style.display).toBe('inline-flex');
        expect(document.querySelector('.synthesis-intro-history-group .history-count').textContent).toBe('2/2');

        const savedAnalysis = appState.classes[0].analyses.T2;
        expect(savedAnalysis.content).toContain('Bilan personnalisé par le professeur.');
        expect(JSON.parse(savedAnalysis.rawText).synthesis).toBe('Bilan personnalisé par le professeur.');
        expect(JSON.parse(savedAnalysis.originalRawText).synthesis).toBe('Bilan initial de la classe.');
        expect(savedAnalysis.introHistory.versions).toHaveLength(2);

        // 3. Clearing the intro paragraph restores the previous text instead of leaving an empty card
        introTextEl.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        introTextEl.textContent = '   ';
        introTextEl.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        expect(introTextEl.textContent).toBe('Bilan personnalisé par le professeur.');

        // 4. Clearing one bullet in a multi-bullet list removes that bullet, persists, and reveals #revertSynthesisBtn
        const strengthItems = document.querySelectorAll('.synthesis-section--success .synthesis-list li');
        expect(strengthItems).toHaveLength(2);
        strengthItems[1].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        strengthItems[1].textContent = '';
        strengthItems[1].dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        expect(document.querySelectorAll('.synthesis-section--success .synthesis-list li')).toHaveLength(1);
        expect(JSON.parse(appState.classes[0].analyses.T2.rawText).strengths).toEqual(['Travail sérieux']);
        expect(revertBtn.style.display).toBe('inline-flex');

        // 5. Clearing the LAST bullet removes it, switches to interactive placeholder, and persists []
        const lastStrength = document.querySelector('.synthesis-section--success .synthesis-list li');
        lastStrength.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        lastStrength.textContent = '';
        lastStrength.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        expect(document.querySelectorAll('.synthesis-section--success .synthesis-list li')).toHaveLength(0);
        expect(document.querySelector('.synthesis-section--success .analysis-placeholder')).not.toBeNull();
        expect(JSON.parse(appState.classes[0].analyses.T2.rawText).strengths).toEqual([]);

        // 6. Clicking "+" adds a bullet; Escape cancels without polluting storage; committing persists
        const addStrengthBtn = document.querySelector('.synthesis-section--success [data-synthesis-add="strengths"]');
        expect(addStrengthBtn).not.toBeNull();
        addStrengthBtn.click();
        const draftLi = document.querySelector('.synthesis-section--success .synthesis-list li');
        expect(draftLi).not.toBeNull();
        draftLi.textContent = 'Brouillon annulé';
        draftLi.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.querySelectorAll('.synthesis-section--success .synthesis-list li')).toHaveLength(0);
        expect(document.querySelector('.synthesis-section--success .analysis-placeholder')).not.toBeNull();
        expect(JSON.parse(appState.classes[0].analyses.T2.rawText).strengths).toEqual([]);

        addStrengthBtn.click();
        const newLi = document.querySelector('.synthesis-section--success .synthesis-list li');
        newLi.textContent = 'Solidarité entre élèves';
        newLi.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        expect(JSON.parse(appState.classes[0].analyses.T2.rawText).strengths).toEqual(['Solidarité entre élèves']);

        // 7. Reverting restores the original synthesis and hides the revert button
        await ClassDashboardManager.revertSynthesis();
        expect(document.querySelector('.synthesis-intro-text').textContent).toBe('Bilan initial de la classe.');
        expect(document.querySelectorAll('.synthesis-section--success .synthesis-list li')).toHaveLength(2);
        expect(revertBtn.style.display).toBe('none');
    });

    it('devrait afficher un placeholder interactif lorsqu\'une section de liste (ex. vigilances) est vide', () => {
        const html = ClassDashboardManager._formatSynthesisText(JSON.stringify({
            synthesis: 'Groupe investi et homogène.',
            strengths: ['Participation dynamique'],
            vigilances: [],
            recommendations: ['Mettre en place des défis hebdomadaires']
        }));
        const container = document.createElement('div');
        container.innerHTML = html;

        expect(container.querySelector('.synthesis-intro-header span')?.textContent).toBe('Appréciation de classe');
        expect(container.querySelector('.synthesis-section--info .synthesis-section-header span')?.textContent).toBe('Pistes pédagogiques');
        expect(container.querySelector('.synthesis-section--warning .analysis-placeholder')).not.toBeNull();
        expect(container.querySelectorAll('.synthesis-section--warning .synthesis-list li')).toHaveLength(0);
    });

    it('migre silencieusement les anciens titres en cache (Synthèse globale / Recommandations) lors de l\'hydratation DOM', () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent">
                    <div class="ai-synthesis-text">
                        <div class="synthesis-section synthesis-intro-card">
                            <div class="synthesis-intro-header">
                                <iconify-icon icon="solar:stars-bold-duotone"></iconify-icon>
                                <span>Synthèse globale</span>
                            </div>
                            <p class="synthesis-intro-text">Classe dynamique.</p>
                        </div>
                        <div class="synthesis-section synthesis-section--info">
                            <div class="synthesis-section-header">
                                <iconify-icon icon="solar:lightbulb-linear"></iconify-icon>
                                <span>Recommandations</span>
                                <button type="button" class="analysis-add-item-btn" data-tooltip="Ajouter une recommandation" aria-label="Ajouter une recommandation"></button>
                            </div>
                            <div class="synthesis-section-content">
                                <button type="button" class="analysis-placeholder"><span>Aucune recommandation renseignée — cliquez pour ajouter</span></button>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="aiRefinementToolbar"></div>
            </div>
        `;
        ClassDashboardManager._ensureModal();

        const container = document.getElementById('aiSynthesisContent');
        ClassDashboardManager._enhanceSynthesisDOM(container);

        expect(container.querySelector('.synthesis-intro-header > span')?.textContent).toBe('Appréciation de classe');
        expect(container.querySelector('.synthesis-intro-copy-btn')?.getAttribute('aria-label')).toBe("Copier l'appréciation de classe");
        expect(container.querySelector('.synthesis-section--info .synthesis-section-header > span')?.textContent).toBe('Pistes pédagogiques');
        expect(container.querySelector('.synthesis-section--info .analysis-add-item-btn')?.dataset.tooltip).toBe('Ajouter une piste pédagogique');
        expect(container.querySelector('.synthesis-section--info .analysis-placeholder span')?.textContent).toBe('Aucune piste pédagogique renseignée — cliquez pour ajouter');
        expect(container.querySelector('.synthesis-intro-text')?.textContent).toBe('Classe dynamique.');
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

    it('devrait exploiter le contexte et le journal de suivi en repli avant la génération des bulletins et agréger les tendances du journal', () => {
        appState.currentClassId = 'class-1';
        appState.currentPeriod = 'T2';
        appState.anonymizeData = true;
        appState.journalThreshold = 2;

        appState.generatedResults = [
            {
                id: 's1',
                classId: 'class-1',
                nom: 'Dupont',
                prenom: 'Alice',
                journal: [
                    { id: 'j1', period: 'T2', tags: ['participation+'], note: 'Alice participe activement.' },
                    { id: 'j2', period: 'T2', tags: ['participation+', 'travail+'], note: '' }
                ],
                studentData: {
                    periods: {
                        T1: { grade: 12 },
                        T2: { grade: 14, appreciation: '', context: 'Très investie à l\'oral.' }
                    }
                }
            },
            {
                id: 's2',
                classId: 'class-1',
                nom: 'Martin',
                prenom: 'Bob',
                journal: [
                    { id: 'j3', period: 'T2', tags: ['participation+'], note: '' },
                    { id: 'j4', period: 'T2', tags: ['participation+', 'bavardage'], note: '' },
                    { id: 'j5', period: 'T2', tags: ['bavardage'], note: 'Bob bavarde souvent.' }
                ],
                studentData: {
                    periods: {
                        T1: { grade: 11 },
                        T2: { grade: 10, appreciation: '' }
                    }
                }
            }
        ];

        const students = ClassDashboardManager.getStudentsData();
        const stats = ClassDashboardManager.calculateStatistics(students);

        // Tendances du journal : Participe (2 élèves), Bavardage (1 élève) — travail+ (1 occurrence < seuil 2) est ignoré
        expect(stats.journalTrends).toEqual([
            expect.objectContaining({ id: 'participation+', label: 'Participe', count: 2 }),
            expect.objectContaining({ id: 'bavardage', label: 'Bavardage', count: 1 })
        ]);

        // Repli qualitatif automatique (context + journalSynthesis) alors qu'aucune appréciation finale n'est rédigée
        expect(stats.appreciationsList).toHaveLength(2);
        expect(stats.appreciationsList[0].text).toContain('Très investie à l\'oral.');
        expect(stats.appreciationsList[0].text).toContain('Observations: Participe');

        // Le prompt IA inclut les tendances du journal et les observations anonymisées
        const { userPrompt } = ClassDashboardManager.buildAIPrompt(stats);
        expect(userPrompt).toContain('• Tendances du journal de suivi : Participe (2 élèves), Bavardage (1 élève)');
        expect(userPrompt).toContain('Très investie à l\'oral.');
        expect(userPrompt).not.toMatch(/\bAlice\b/i);
        expect(userPrompt).not.toMatch(/\bBob\b/i);

        // Les tendances Attitude - utilisent le libellé court en UI et le promptLabel explicite dans le prompt IA (et excluent remarque)
        appState.generatedResults[0].journal.push(
            { id: 'j6', period: 'T2', tags: ['attitude-'], note: '' },
            { id: 'j7', period: 'T2', tags: ['attitude-'], note: '' },
            { id: 'j8', period: 'T2', tags: ['remarque'], note: 'Note libre 1' },
            { id: 'j9', period: 'T2', tags: ['remarque'], note: 'Note libre 2' }
        );
        const updatedStats = ClassDashboardManager.calculateStatistics(ClassDashboardManager.getStudentsData());
        expect(updatedStats.journalTrends).toContainEqual(
            expect.objectContaining({ id: 'attitude-', label: 'Attitude -', promptLabel: 'Attitude à revoir', count: 1 })
        );
        expect(updatedStats.journalTrends.some(t => t.id === 'remarque')).toBe(false);
        const { userPrompt: updatedPrompt } = ClassDashboardManager.buildAIPrompt(updatedStats);
        expect(updatedPrompt).toContain('Attitude à revoir (1 élève)');
        expect(updatedPrompt).not.toContain('Attitude - (');
        expect(updatedPrompt).not.toContain('Remarque (');

        // Le dataHash change même si l'appréciation garde la même longueur ou si seul le contexte change
        const hashBefore = stats.dataHash;
        appState.generatedResults[0].studentData.periods.T2.context = 'Autre observation de même taille';
        const statsAfter = ClassDashboardManager.calculateStatistics(ClassDashboardManager.getStudentsData());
        expect(statsAfter.dataHash).not.toBe(hashBefore);
    });

    it('devrait calculer la trajectoire annuelle multi-périodes (T1 -> T2 -> T3), l\'afficher dans le tooltip de Moyenne et l\'injecter au T3', () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <span id="cohortHeaderMetric"></span>
                <div id="cohortStatAverageItem"><span id="cohortStatAverage"></span></div>
                <div id="cohortStatMedianItem"><span id="cohortStatMedian"></span></div>
                <div id="cohortStatMinItem"><span id="cohortStatMin"></span></div>
                <div id="cohortStatMaxItem"><span id="cohortStatMax"></span></div>
                <span id="highlightProgressCount"></span>
                <span id="highlightRiskCount"></span>
                <div id="highlightProgressList"></div>
                <div id="highlightRiskList"></div>
            </div>
        `;
        ClassDashboardManager._ensureModal();

        appState.currentClassId = 'class-1';
        appState.currentPeriod = 'T3';
        appState.periodSystem = 'trimestres';
        appState.generatedResults = [
            {
                id: 's1',
                classId: 'class-1',
                nom: 'Dupont',
                prenom: 'Alice',
                studentData: {
                    periods: {
                        T1: { grade: 11 },
                        T2: { grade: 13 },
                        T3: { grade: 15 }
                    }
                }
            },
            {
                id: 's2',
                classId: 'class-1',
                nom: 'Martin',
                prenom: 'Bob',
                studentData: {
                    periods: {
                        T1: { grade: 9 },
                        T2: { grade: 11 },
                        T3: { grade: 13 }
                    }
                }
            }
        ];

        const students = ClassDashboardManager.getStudentsData();
        const stats = ClassDashboardManager.calculateStatistics(students);

        expect(stats.periodAverages).toEqual([
            { period: 'T1', average: 10, count: 2 },
            { period: 'T2', average: 12, count: 2 },
            { period: 'T3', average: 14, count: 2 }
        ]);

        ClassDashboardManager.renderDashboard(stats, students);

        const avgItem = document.getElementById('cohortStatAverageItem');
        expect(avgItem.getAttribute('data-tooltip')).toContain('Trajectoire : T1 : 10,0/20 → T2 : 12,0/20 → T3 : 14,0/20');
        expect(avgItem.getAttribute('data-tooltip')).toContain('Évolution récente : +2,0 pts');

        const { systemPrompt, userPrompt } = ClassDashboardManager.buildAIPrompt(stats);
        expect(systemPrompt).toContain('bilan de fin d\'année');
        expect(userPrompt).toContain('• Trajectoire annuelle des moyennes : T1 : 10.0/20 → T2 : 12.0/20 → T3 : 14.0/20');
    });

    it('reconstruit la synthèse depuis rawText et neutralise toute charge XSS injectée dans analyses[period].content ou originalContent', () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent"></div>
                <button id="generateSynthesisBtn" style="display: none;"></button>
                <button id="copyDashboardSynthesisBtn" style="display: none;"></button>
                <button id="revertSynthesisBtn" style="display: none;"></button>
                <div id="aiRefinementToolbar" style="display: none;"></div>
            </div>
        `;
        ClassDashboardManager.modal = document.getElementById('classDashboardModal');
        appState.currentClassId = 'class-xss';
        appState.currentPeriod = 'T2';

        // 1. Avec rawText présent : content malveillant est entièrement ignoré et reconstruit depuis rawText
        const rawPayload = JSON.stringify({
            synthesis: 'Bilan sain <script>alert(1)</script>',
            strengths: ['Sérieux <img src=x onerror=alert(2)>'],
            vigilances: [],
            recommendations: []
        });
        appState.classes = [{
            id: 'class-xss',
            name: '3ème XSS',
            analyses: {
                T2: {
                    content: '<img src=x onerror=alert(99)><script>window.__xss=1</script>',
                    originalContent: '<svg onload=alert(100)></svg>',
                    rawText: rawPayload,
                    originalRawText: rawPayload
                }
            }
        }];

        ClassDashboardManager.restoreOrResetAISection();
        const content = document.getElementById('aiSynthesisContent');
        expect(content.querySelector('script')).toBeNull();
        expect(content.querySelector('img')).toBeNull();
        expect(content.querySelector('svg')).toBeNull();
        expect(content.querySelector('.synthesis-intro-text').textContent).toContain('Bilan sain <script>alert(1)</script>');
        expect(content.querySelector('.synthesis-list li').textContent).toContain('Sérieux <img src=x onerror=alert(2)>');

        // 2. Sauvegarde legacy sans rawText : les balises/attributs dangereux sont purgés, le texte sûr est préservé
        ClassDashboardManager.cachedSynthesisHTML = null;
        appState.classes[0].analyses.T2 = {
            content: '<p onclick="alert(1)">Synthèse legacy sûre</p><img src=x onerror=alert(2)><script>alert(3)</script><iframe src="javascript:alert(4)"></iframe>',
            originalContent: '<p onmouseover="alert(5)">Origine legacy</p><svg onload="alert(6)"></svg>'
        };

        ClassDashboardManager.restoreOrResetAISection();
        expect(content.querySelector('script')).toBeNull();
        expect(content.querySelector('img')).toBeNull();
        expect(content.querySelector('iframe')).toBeNull();
        expect(content.querySelector('p').getAttribute('onclick')).toBeNull();
        expect(content.querySelector('p').textContent).toBe('Synthèse legacy sûre');
        expect(ClassDashboardManager.originalSynthesisHTML).not.toContain('onmouseover');
        expect(ClassDashboardManager.originalSynthesisHTML).not.toContain('<svg');
        expect(ClassDashboardManager.originalSynthesisHTML).toContain('Origine legacy');
    });

    it('ne fait pas fuiter l\'appréciation T1 dans T2 quand T2 n\'a qu\'une note', () => {
        appState.currentClassId = 'class-1';
        appState.currentPeriod = 'T2';
        appState.generatedResults = [
            {
                id: 's-t1-leak',
                classId: 'class-1',
                nom: 'Durand',
                prenom: 'Lina',
                appreciation: 'Appréciation du T1',
                generationPeriod: 'T1',
                studentData: {
                    periods: {
                        T1: { grade: 12, appreciation: 'Appréciation du T1' },
                        T2: { grade: 15 }
                    }
                }
            }
        ];

        const students = ClassDashboardManager.getStudentsData();
        expect(students).toHaveLength(1);
        expect(students[0].appreciation).toBe('');
    });

    it('persiste et restaure la synthèse IA d\'une classe virtuelle (virtual_*) et enregistre response.modelUsed en fallback', async () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent"></div>
                <button id="generateSynthesisBtn"></button>
                <div id="aiRefinementToolbar"></div>
                <button id="revertSynthesisBtn"></button>
                <button id="copyDashboardSynthesisBtn"></button>
                <span id="dashboardClassBadge"></span>
            </div>
        `;
        appState.currentClassId = 'virtual_3e1';
        appState.currentPeriod = 'T2';
        appState.currentAIModel = 'primary-model';
        appState.virtualClassAnalyses = {};
        appState.classes = [
            { id: 'grp-1', name: '3e1 Gr1', isGroup: true },
            { id: 'grp-2', name: '3e1 Gr2', isGroup: true }
        ];
        appState.generatedResults = [
            { id: 's1', classId: 'grp-1', nom: 'A', prenom: 'One', studentData: { classe: '3e1', periods: { T2: { grade: 14 } } } },
            { id: 's2', classId: 'grp-2', nom: 'B', prenom: 'Two', studentData: { classe: '3e1', periods: { T2: { grade: 12 } } } }
        ];

        vi.spyOn(UI, 'checkAPIKeyPresence').mockReturnValue(true);
        vi.spyOn(UI, 'animateHtmlReveal').mockImplementation(async (el, html) => { el.innerHTML = html; });
        vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});
        vi.spyOn(AIService, 'callAIWithFallback').mockResolvedValueOnce({
            text: JSON.stringify({ synthesis: 'Bilan 3e1 complet', strengths: ['Dynamisme'], vigilances: [], recommendations: [] }),
            modelUsed: 'fallback-model'
        });

        ClassDashboardManager._ensureModal();
        const students = ClassDashboardManager.getStudentsData();
        expect(students).toHaveLength(2);
        ClassDashboardManager.cachedStats = ClassDashboardManager.calculateStatistics(students, ClassDashboardManager._getFullClassRoster());

        await ClassDashboardManager.generateAISynthesis();

        expect(appState.virtualClassAnalyses.virtual_3e1?.T2).toBeDefined();
        expect(appState.virtualClassAnalyses.virtual_3e1.T2.model).toBe('fallback-model');
        expect(ClassDashboardManager.cachedSynthesisModel).toBe('fallback-model');
        expect(StorageManager.saveAppState).toHaveBeenCalled();

        // Vide le cache mémoire et vérifie la restauration depuis appState.virtualClassAnalyses
        ClassDashboardManager.cachedSynthesisHTML = null;
        ClassDashboardManager.restoreOrResetAISection();
        expect(document.getElementById('aiSynthesisContent').textContent).toContain('Bilan 3e1 complet');
    });

    it('masque les camarades et mentions Art. 9 dans buildAIPrompt ainsi que lors du raffinement de synthèse de classe', async () => {
        appState.anonymizeData = true;
        appState.currentClassId = 'class-rgpd';
        appState.currentPeriod = 'T2';
        appState.classes = [{ id: 'class-rgpd', name: '3ème B', analyses: {} }];
        appState.generatedResults = [
            { id: 's1', classId: 'class-rgpd', prenom: 'Lucas', nom: 'Martin' },
            { id: 's2', classId: 'class-rgpd', prenom: 'Chloé', nom: 'Bernard' },
            { id: 's3', classId: 'class-rgpd', prenom: 'Théo', nom: 'Petit' }
        ];

        // 1. buildAIPrompt : camarades et termes Art. 9 masqués, mot courant "petit" préservé
        const { userPrompt } = ClassDashboardManager.buildAIPrompt({
            count: 3,
            average: 13.0,
            median: 13.0,
            min: 10,
            max: 16,
            stdDev: 2.0,
            distribution: { '0-4': 0, '4-8': 0, '8-12': 1, '12-16': 1, '16-20': 1 },
            appreciationsList: [
                {
                    prenom: 'Lucas',
                    nom: 'Martin',
                    text: 'Lucas bavarde avec Chloé Bernard et Théo P. Un petit effort est attendu malgré son PAP dyslexique.'
                }
            ]
        });

        expect(userPrompt).not.toMatch(/\b(Lucas|Martin|Chloé|Bernard|Théo|PAP)\b/i);
        expect(userPrompt).not.toMatch(/dyslexi/i);
        expect(userPrompt).toContain('[CAMARADE]');
        expect(userPrompt).toContain('[MASQUÉ]');
        expect(userPrompt).toContain('Un petit effort');

        // 2. handleClassAnalysisActions : synthèse éditée par l'enseignant nettoyée avant envoi IA
        const editedJson = JSON.stringify({
            synthesis: 'Classe portée par Lucas Martin et Chloé, malgré un petit relâchement et un élève ULIS dyslexique.',
            strengths: ['Dynamisme'],
            vigilances: [],
            recommendations: []
        });
        const editedHtml = `<div class="ai-synthesis-text">${ClassDashboardManager._formatSynthesisText(editedJson)}</div>`;

        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent">${editedHtml}</div>
                <button id="generateSynthesisBtn"></button>
                <div id="aiRefinementToolbar">
                    <button id="btnConciseRgpd" class="btn-refinement" data-refine-type="concise">Concise</button>
                </div>
                <button id="revertSynthesisBtn" style="display: none;"></button>
                <button id="copyDashboardSynthesisBtn"></button>
            </div>
        `;
        ClassDashboardManager._ensureModal();
        ClassDashboardManager.cachedSynthesisHTML = editedHtml;
        ClassDashboardManager.originalSynthesisHTML = editedHtml;
        ClassDashboardManager.cachedSynthesisRawText = editedJson;
        ClassDashboardManager.originalSynthesisRawText = editedJson;
        ClassDashboardManager.cachedSynthesisClassId = 'class-rgpd';
        ClassDashboardManager.cachedSynthesisPeriod = 'T2';

        vi.spyOn(UI, 'checkAPIKeyPresence').mockReturnValue(true);
        vi.spyOn(UI, 'showInlineSpinner').mockImplementation(() => {});
        vi.spyOn(UI, 'hideInlineSpinner').mockImplementation(() => {});
        vi.spyOn(UI, 'animateHtmlReveal').mockImplementation(async (el, html) => { el.innerHTML = html; });
        vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});
        const aiSpy = vi.spyOn(AIService, 'callAIWithFallback').mockResolvedValue({
            text: 'Classe dynamique malgré un léger relâchement.'
        });

        await ClassDashboardManager.handleClassAnalysisActions(document.getElementById('btnConciseRgpd'));

        expect(aiSpy).toHaveBeenCalledTimes(1);
        const sentPrompt = aiSpy.mock.calls[0][0];
        expect(sentPrompt).not.toMatch(/\b(Lucas|Martin|Chloé|ULIS)\b/i);
        expect(sentPrompt).not.toMatch(/dyslexi/i);
        expect(sentPrompt).toContain('[ÉLÈVE]');
        expect(sentPrompt).toContain('[MASQUÉ]');
        expect(sentPrompt).toContain('un petit relâchement');
    });

    it('valide et persiste une retouche contenteditable encore focalisée via flushPendingEdit lors de la copie ou fermeture', async () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent"></div>
                <button id="generateSynthesisBtn"></button>
                <div id="aiRefinementToolbar"></div>
                <button id="revertSynthesisBtn" style="display: none;"></button>
                <button id="copyDashboardSynthesisBtn"></button>
            </div>
        `;
        ClassDashboardManager._ensureModal();
        appState.currentClassId = 'class-flush';
        appState.currentPeriod = 'T2';
        appState.classes = [{ id: 'class-flush', name: '3ème Flush', analyses: {} }];

        const saveSpy = vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});
        vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        vi.spyOn(UI, 'closeModal').mockImplementation(() => {});
        const writeTextMock = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

        const rawJson = JSON.stringify({
            synthesis: 'Synthèse initiale.',
            strengths: ['Travail régulier'],
            vigilances: [],
            recommendations: []
        });
        const html = `<div class="ai-synthesis-text">${ClassDashboardManager._formatSynthesisText(rawJson)}</div>`;
        ClassDashboardManager.cachedSynthesisHTML = html;
        ClassDashboardManager.originalSynthesisHTML = html;
        ClassDashboardManager.cachedSynthesisRawText = rawJson;
        ClassDashboardManager.originalSynthesisRawText = rawJson;
        ClassDashboardManager.cachedSynthesisClassId = 'class-flush';
        ClassDashboardManager.cachedSynthesisPeriod = 'T2';
        await ClassDashboardManager._applySynthesisToUI(html, false);

        const introEl = document.querySelector('.synthesis-intro-text');
        introEl.focus();
        introEl.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        introEl.textContent = 'Synthèse modifiée en direct avant copie.';

        // Copie sans blur préalable : flushPendingEdit doit valider et copier la version modifiée
        await ClassDashboardManager.copyIntroSynthesis();
        expect(writeTextMock).toHaveBeenCalledWith('Synthèse modifiée en direct avant copie.');
        expect(saveSpy).toHaveBeenCalled();
        expect(JSON.parse(appState.classes[0].analyses.T2.rawText).synthesis).toBe('Synthèse modifiée en direct avant copie.');

        // Idem lors de la fermeture de la modale sur une puce encore focalisée
        const bulletEl = document.querySelector('.synthesis-section--success .synthesis-list li');
        bulletEl.focus();
        bulletEl.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        bulletEl.textContent = 'Travail régulier et participatif';
        ClassDashboardManager.closeDashboard();
        expect(JSON.parse(appState.classes[0].analyses.T2.rawText).strengths).toEqual(['Travail régulier et participatif']);
    });

    it('protège la synthèse existante en cas d\'erreur réseau, propose Réessayer à vide, et permet Rétablir après retouche', async () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div class="dashboard-panel panel-left">
                    <div id="aiSynthesisContent"></div>
                    <div id="aiRefinementToolbar" style="display: none;">
                        <button type="button" class="btn-refinement" data-refine-type="concise">Concise</button>
                        <button type="button" id="revertSynthesisBtn" style="display: none;">Rétablir</button>
                    </div>
                    <div id="aiSynthesisMeta" style="display: none;"><span id="aiSynthesisSourceInfo"></span></div>
                </div>
                <button id="generateSynthesisBtn" style="display: none;"></button>
                <button id="copyDashboardSynthesisBtn" style="display: none;"></button>
            </div>
        `;
        ClassDashboardManager._ensureModal();
        appState.currentClassId = 'class-safe';
        appState.currentPeriod = 'T2';
        appState.classes = [{ id: 'class-safe', name: '4ème B', analyses: {} }];
        ClassDashboardManager.cachedStats = {
            count: 2, average: 13, median: 13, min: 10, max: 16, stdDev: 2,
            distribution: [0, 0, 1, 1, 0], dataHash: 'cd_safe',
            writtenAppreciationsCount: 2, qualitativeContextCount: 2, appreciationsList: []
        };

        vi.spyOn(UI, 'checkAPIKeyPresence').mockReturnValue(true);
        vi.spyOn(UI, 'animateHtmlReveal').mockImplementation(async (el, html) => { el.innerHTML = html; });
        vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});
        const notifySpy = vi.spyOn(UI, 'showNotification').mockImplementation(() => {});

        // 1. Aucune synthèse existante + échec IA -> placeholder d'erreur avec bouton Réessayer et bouton header masqué
        vi.spyOn(AIService, 'callAIWithFallback').mockRejectedValueOnce(new Error('Timeout réseau'));
        await ClassDashboardManager.generateAISynthesis();

        expect(document.querySelector('#aiSynthesisContent [data-action="retry-synthesis"]')).not.toBeNull();
        expect(document.getElementById('generateSynthesisBtn').style.display).toBe('none');
        expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining('Timeout réseau'), 'error');

        // 2. Synthèse retouchée existante + échec de régénération -> restauration intacte (zéro perte)
        const originalJson = JSON.stringify({ synthesis: 'Bilan IA initial.', strengths: ['Sérieux'], vigilances: [], recommendations: [] });
        const manualJson = JSON.stringify({ synthesis: 'Bilan personnalisé par le prof.', strengths: ['Sérieux'], vigilances: [], recommendations: [] });
        const originalHtml = `<div class="ai-synthesis-text">${ClassDashboardManager._formatSynthesisText(originalJson)}</div>`;
        const manualHtml = `<div class="ai-synthesis-text">${ClassDashboardManager._formatSynthesisText(manualJson)}</div>`;

        ClassDashboardManager.originalSynthesisHTML = originalHtml;
        ClassDashboardManager.originalSynthesisRawText = originalJson;
        ClassDashboardManager.cachedSynthesisHTML = manualHtml;
        ClassDashboardManager.cachedSynthesisRawText = manualJson;
        ClassDashboardManager.cachedSynthesisClassId = 'class-safe';
        ClassDashboardManager.cachedSynthesisPeriod = 'T2';
        ClassDashboardManager.cachedSynthesisDataHash = 'cd_safe';
        await ClassDashboardManager._applySynthesisToUI(manualHtml, false);

        vi.spyOn(AIService, 'callAIWithFallback').mockRejectedValueOnce(new Error('Quota dépassé'));
        await ClassDashboardManager.generateAISynthesis();

        expect(document.querySelector('.synthesis-intro-text').textContent).toBe('Bilan personnalisé par le prof.');
        expect(document.querySelector('#aiSynthesisContent [data-action="retry-synthesis"]')).toBeNull();
        expect(document.getElementById('aiRefinementToolbar').style.display).toBe('flex');

        // 3. Régénération réussie après retouche manuelle -> toast avec action Rétablir qui restaure la version manuelle
        const newJson = JSON.stringify({ synthesis: 'Nouvelle synthèse IA.', strengths: ['Calme'], vigilances: [], recommendations: [] });
        vi.spyOn(AIService, 'callAIWithFallback').mockResolvedValueOnce({ text: newJson, modelUsed: 'test-model' });
        await ClassDashboardManager.generateAISynthesis();

        expect(document.querySelector('.synthesis-intro-text').textContent).toBe('Nouvelle synthèse IA.');
        const undoCall = notifySpy.mock.calls.find(call => call[3]?.action?.label === 'Rétablir');
        expect(undoCall).toBeDefined();

        await undoCall[3].action.onClick();
        expect(document.querySelector('.synthesis-intro-text').textContent).toBe('Bilan personnalisé par le prof.');
        expect(JSON.parse(appState.classes[0].analyses.T2.rawText).synthesis).toBe('Bilan personnalisé par le prof.');
    });

    it('parque #aiRefinementToolbar hors #aiSynthesisContent lors d\'un reset/régénération pour ne jamais le détruire du DOM', async () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div class="dashboard-panel panel-left">
                    <div id="aiSynthesisContent"></div>
                    <div id="aiRefinementToolbar" style="display: none;">
                        <button type="button" class="btn-refinement" data-refine-type="concise">Concise</button>
                    </div>
                    <div id="aiSynthesisMeta" style="display: none;"><span id="aiSynthesisSourceInfo"></span></div>
                </div>
                <button id="generateSynthesisBtn"></button>
                <button id="copyDashboardSynthesisBtn"></button>
                <button id="revertSynthesisBtn" style="display: none;"></button>
            </div>
        `;
        ClassDashboardManager._ensureModal();

        const rawJson = JSON.stringify({ synthesis: 'Bilan complet.', strengths: ['Actif'], vigilances: [], recommendations: [] });
        const html = `<div class="ai-synthesis-text">${ClassDashboardManager._formatSynthesisText(rawJson)}</div>`;

        await ClassDashboardManager._applySynthesisToUI(html, false);
        const toolbar = document.getElementById('aiRefinementToolbar');
        expect(toolbar).not.toBeNull();
        expect(toolbar.closest('.synthesis-intro-card')).not.toBeNull();
        expect(toolbar.classList.contains('is-embedded')).toBe(true);

        // Reset vide le contenu mais doit avoir parqué la toolbar avant d'écraser innerHTML
        ClassDashboardManager.resetAISection();
        expect(document.getElementById('aiRefinementToolbar')).toBe(toolbar);
        expect(toolbar.isConnected).toBe(true);
        expect(toolbar.classList.contains('is-embedded')).toBe(false);
        expect(toolbar.style.display).toBe('none');

        // Ré-application ré-intègre la toolbar sans perte
        await ClassDashboardManager._applySynthesisToUI(html, false);
        expect(document.getElementById('aiRefinementToolbar').closest('.synthesis-intro-card')).not.toBeNull();
    });

    it('affiche la barre de répartition, les KPI enrichis, les tendances du journal (>= 2 élèves) et la pagination Top 5', () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <span id="dashboardTitlePrefix">Analyse de la classe</span>
                <span id="dashboardTitleSep" hidden>·</span>
                <span id="dashboardClassBadge" hidden></span>
                <span id="dashboardSubjectBadge" hidden></span>
                <span id="dashboardPeriodBadge"></span>
                <span id="dashboardStudentCount"></span>
                <span id="cohortHeaderMetric"></span>
                <div id="cohortStatAverageItem">
                    <span id="cohortStatAverage"></span>
                    <span id="cohortStatAverageDelta" hidden></span>
                </div>
                <div id="cohortStatMedianItem">
                    <span id="cohortStatMedian"></span>
                    <span id="cohortStatMedianSub" hidden></span>
                </div>
                <div id="cohortStatMinItem"><span id="cohortStatMin"></span></div>
                <div id="cohortStatMaxItem"><span id="cohortStatMax"></span></div>
                <div id="cohortDistributionSection" hidden>
                    <span id="cohortDistributionSummary"></span>
                    <div id="cohortDistributionBar"></div>
                </div>
                <div id="cohortJournalTrends" hidden>
                    <div id="cohortJournalChips"></div>
                </div>
                <div id="highlightProgressGroup">
                    <span id="highlightProgressCount"></span>
                    <div id="highlightProgressList"></div>
                </div>
                <div id="highlightRiskGroup">
                    <span id="highlightRiskCount"></span>
                    <div id="highlightRiskList"></div>
                </div>
                <div id="aiSynthesisContent"></div>
                <button id="generateSynthesisBtn"></button>
                <div id="aiRefinementToolbar"></div>
                <div id="aiSynthesisMeta"><span id="aiSynthesisSourceInfo"></span></div>
            </div>
        `;
        ClassDashboardManager._ensureModal();
        appState.currentPeriod = 'T2';

        const students = Array.from({ length: 7 }, (_, idx) => ({
            id: `p${idx + 1}`,
            nom: `Nom${idx + 1}`,
            prenom: `Prenom${idx + 1}`,
            fullName: `Prenom${idx + 1} Nom${idx + 1}`,
            grade: 14 + idx * 0.5,
            previousGrade: 11,
            evolution: 3 + idx * 0.5,
            appreciation: 'Très bien.',
            journalTags: idx < 3 ? ['participation+'] : (idx === 6 ? ['bavardage'] : [])
        }));
        students.push({
            id: 'r1',
            nom: 'Fragile',
            prenom: 'Léo',
            fullName: 'Léo Fragile',
            grade: 8.5,
            previousGrade: 8.5,
            evolution: 0,
            appreciation: '',
            journalTags: []
        });

        const stats = ClassDashboardManager.calculateStatistics(students);
        ClassDashboardManager.renderDashboard(stats, students);

        // Titre principal intègre le nom de la classe (ou repli "Analyse de la classe" sans classe)
        appState.classes = [{ id: 'class-1', name: '3ème B' }];
        ClassDashboardManager.renderDashboard(stats, students);
        expect(document.getElementById('dashboardTitlePrefix').textContent).toBe('Analyse');
        expect(document.getElementById('dashboardTitleSep').hidden).toBe(false);
        expect(document.getElementById('dashboardClassBadge').textContent).toBe('3ème B');

        // Micro-barre de répartition & KPI enrichis
        expect(document.getElementById('cohortDistributionSection').hidden).toBe(false);
        expect(document.getElementById('cohortDistributionSummary').textContent).toBe('7/8 ≥ 10');
        expect(document.querySelectorAll('#cohortDistributionBar .cohort-dist-seg').length).toBeGreaterThan(0);
        expect(document.getElementById('cohortStatAverageDelta').hidden).toBe(false);
        expect(document.getElementById('cohortStatMedianSub').hidden).toBe(false);

        // Journal trends : uniquement >= 2 élèves ('participation+' = 3, 'bavardage' = 1 exclu)
        expect(document.getElementById('cohortJournalTrends').hidden).toBe(false);
        const chips = document.querySelectorAll('#cohortJournalChips .cohort-journal-chip');
        expect(chips).toHaveLength(1);
        expect(chips[0].textContent).toContain('Participe');
        expect(chips[0].textContent).toContain('3');

        // Masque la section journal si aucune tendance >= 2
        ClassDashboardManager._renderJournalTrends({ journalTrends: [{ id: 'bavardage', label: 'Bavardage', category: 'negative', count: 1 }] });
        expect(document.getElementById('cohortJournalTrends').hidden).toBe(true);

        // Pagination Top 5 (7 progressions -> 5 affichées + bouton pour les 2 autres)
        expect(document.querySelectorAll('#highlightProgressList .highlight-item')).toHaveLength(5);
        const toggleBtn = document.querySelector('#highlightProgressList [data-highlight-toggle="progress"]');
        expect(toggleBtn).not.toBeNull();
        expect(toggleBtn.textContent).toContain('Afficher les 2 autres');
        toggleBtn.click();
        expect(document.querySelectorAll('#highlightProgressList .highlight-item')).toHaveLength(7);
        expect(document.querySelector('#highlightProgressList [data-highlight-toggle="progress"]').textContent).toContain('Réduire');

        // Alignement strict et accessibilité clavier sur Élèves à surveiller
        const riskItem = document.querySelector('#highlightRiskList .highlight-item');
        expect(riskItem.getAttribute('role')).toBe('button');
        expect(riskItem.getAttribute('tabindex')).toBe('0');
        const riskGrade = riskItem.querySelector('.highlight-grade');
        expect(riskGrade).not.toBeNull();
        expect(riskGrade.classList.contains('is-below-average')).toBe(true);
        expect(riskItem.querySelector('.highlight-evolution.neutral')).not.toBeNull();
    });

    it('gère les 4 retouches harmonisées, le verrou anti-concurrence + annulation, le compteur de mots, le clic droit aperçu et undoIntroSynthesis sans perdre les puces', async () => {
        const initialJson = JSON.stringify({
            synthesis: 'La classe progresse régulièrement malgré quelques bavardages en fin de séance.',
            strengths: ['Participation orale active', 'Puce personnalisée conservée'],
            vigilances: ['Concentration à maintenir'],
            recommendations: ['Instaurer un rituel de début de séance']
        });
        const initialHtml = `<div class="ai-synthesis-text">${ClassDashboardManager._formatSynthesisText(initialJson)}</div>`;

        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div class="dashboard-panel panel-left">
                    <div id="aiSynthesisContent"></div>
                    <div id="aiRefinementToolbar" style="display: none;">
                        <div class="refinement-pills-group">
                            <button type="button" class="btn-refinement" data-refine-type="concise">Concise</button>
                            <button type="button" class="btn-refinement" data-refine-type="encouraging">Encourageante</button>
                            <button type="button" class="btn-refinement" data-refine-type="demanding">Exigeante</button>
                            <button type="button" class="btn-refinement" data-refine-type="polish">Peaufiner</button>
                        </div>
                    </div>
                    <div id="aiSynthesisMeta" style="display: none;">
                        <span id="aiSynthesisSourceInfo"></span>
                        <button type="button" id="revertSynthesisBtn" style="display: none;">Rétablir le bilan</button>
                    </div>
                </div>
                <button id="generateSynthesisBtn"></button>
                <button id="copyDashboardSynthesisBtn"></button>
            </div>
        `;

        ClassDashboardManager._ensureModal();
        appState.currentClassId = 'class-refine';
        appState.currentPeriod = 'T2';
        appState.classes = [{ id: 'class-refine', name: '3ème C', analyses: {} }];
        ClassDashboardManager.cachedSynthesisHTML = initialHtml;
        ClassDashboardManager.originalSynthesisHTML = initialHtml;
        ClassDashboardManager.cachedSynthesisRawText = initialJson;
        ClassDashboardManager.originalSynthesisRawText = initialJson;
        ClassDashboardManager.cachedSynthesisClassId = 'class-refine';
        ClassDashboardManager.cachedSynthesisPeriod = 'T2';

        vi.spyOn(UI, 'checkAPIKeyPresence').mockReturnValue(true);
        vi.spyOn(UI, 'animateHtmlReveal').mockImplementation(async (el, html) => { el.innerHTML = html; });
        vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});
        const previewSpy = vi.spyOn(FocusPanelRefinement, 'displayPromptModal').mockResolvedValue(undefined);

        await ClassDashboardManager._applySynthesisToUI(initialHtml, false);

        // 1. Compteur de mots initial + stepper d'historique masqué (1 seule version)
        const wordCountEl = document.querySelector('.synthesis-intro-word-count');
        const historyGroup = document.querySelector('.synthesis-intro-history-group');
        expect(wordCountEl.textContent).toBe('11 mots');
        expect(historyGroup.style.display).toBe('none');

        // 2. Clic droit sur "Exigeante" -> prévisualisation du prompt de raffinement
        const demandingBtn = document.querySelector('[data-refine-type="demanding"]');
        const polishBtn = document.querySelector('[data-refine-type="polish"]');
        demandingBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        await Promise.resolve();
        expect(previewSpy).toHaveBeenCalledTimes(1);
        expect(previewSpy.mock.calls[0][0]).toContain('plus ferme, direct et exigeant');

        // 3. Raffinement "Exigeante" : verrouille les autres chips via .disabled (jamais native disabled), anime le chip actif, puis met à jour le texte, le compteur et le stepper < 2/2 >
        let resolveFirst;
        const aiSpy = vi.spyOn(AIService, 'callAIWithFallback').mockImplementationOnce(() => new Promise(resolve => {
            resolveFirst = resolve;
        }));

        const pendingRefine = ClassDashboardManager.handleClassAnalysisActions(demandingBtn);
        expect(demandingBtn.classList.contains('is-generating')).toBe(true);
        expect(polishBtn.classList.contains('disabled')).toBe(true);
        expect(polishBtn.disabled).toBe(false);

        // Un clic concurrent sur "Peaufiner" pendant la génération doit être ignoré
        await ClassDashboardManager.handleClassAnalysisActions(polishBtn);
        expect(aiSpy).toHaveBeenCalledTimes(1);

        resolveFirst({ text: 'Le groupe doit redoubler de rigueur et cesser les bavardages.' });
        await pendingRefine;

        expect(demandingBtn.classList.contains('is-generating')).toBe(false);
        expect(polishBtn.classList.contains('disabled')).toBe(false);
        expect(document.querySelector('.synthesis-intro-text').textContent).toBe('Le groupe doit redoubler de rigueur et cesser les bavardages.');
        expect(wordCountEl.textContent).toBe('10 mots');
        expect(historyGroup.style.display).toBe('inline-flex');
        expect(historyGroup.querySelector('.history-count').textContent).toBe('2/2');

        // 4. undoIntroSynthesis restaure UNIQUEMENT l'appréciation précédente (1/2) et garde les puces intactes, puis redoIntroSynthesis la rétablit (2/2)
        await ClassDashboardManager.undoIntroSynthesis();
        expect(document.querySelector('.synthesis-intro-text').textContent).toBe('La classe progresse régulièrement malgré quelques bavardages en fin de séance.');
        expect(document.querySelector('#aiSynthesisContent').textContent).toContain('Puce personnalisée conservée');
        expect(wordCountEl.textContent).toBe('11 mots');
        expect(historyGroup.style.display).toBe('inline-flex');
        expect(historyGroup.querySelector('.history-count').textContent).toBe('1/2');

        await ClassDashboardManager.redoIntroSynthesis();
        expect(document.querySelector('.synthesis-intro-text').textContent).toBe('Le groupe doit redoubler de rigueur et cesser les bavardages.');
        expect(historyGroup.querySelector('.history-count').textContent).toBe('2/2');

        // 4b. Popover d'historique unifié ouvrable et cliquable
        ClassDashboardManager.showIntroHistoryPopover();
        const popover = document.getElementById('synthesisHistoryPopover');
        expect(popover).not.toBeNull();
        expect(popover.querySelectorAll('.history-version-item')).toHaveLength(2);
        ClassDashboardManager.closeIntroHistoryPopover();
        expect(document.getElementById('synthesisHistoryPopover')).toBeNull();

        // 5. Re-clic sur le bouton actif >= 350ms annule la requête en cours via AbortController
        let capturedSignal = null;
        vi.spyOn(AIService, 'callAIWithFallback').mockImplementationOnce((_u, opts) => {
            capturedSignal = opts.signal;
            return new Promise((_res, rej) => {
                opts.signal.addEventListener('abort', () => {
                    const err = new Error('Annulé');
                    err.name = 'AbortError';
                    rej(err);
                });
            });
        });

        const cancelPromise = ClassDashboardManager.handleClassAnalysisActions(polishBtn);
        ClassDashboardManager._activeGenerations.get(ClassDashboardManager._getContextKey()).startedAt = Date.now() - 500;
        await ClassDashboardManager.handleClassAnalysisActions(polishBtn);
        await cancelPromise;

        expect(capturedSignal?.aborted).toBe(true);
        expect(polishBtn.classList.contains('is-generating')).toBe(false);
        expect(demandingBtn.classList.contains('disabled')).toBe(false);
    });

    it('permet d\'annuler la génération de synthèse via #generateSynthesisBtn ou cancelAllGenerations (pilule dynamique), masque Copier et restaure sans erreur', async () => {
        const existingJson = JSON.stringify({
            synthesis: 'Synthèse existante à préserver.',
            strengths: ['Sérieux'],
            vigilances: [],
            recommendations: ['Poursuivre']
        });
        const existingHtml = `<div class="ai-synthesis-text">${ClassDashboardManager._formatSynthesisText(existingJson)}</div>`;

        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent">${existingHtml}</div>
                <button id="generateSynthesisBtn"></button>
                <button id="copyDashboardSynthesisBtn" style="display: inline-flex;"></button>
                <div id="aiRefinementToolbar"></div>
                <div id="aiSynthesisMeta"><span id="aiSynthesisSourceInfo"></span></div>
                <button id="revertSynthesisBtn"></button>
            </div>
        `;
        ClassDashboardManager._ensureModal();
        ClassDashboardManager.cachedStats = { count: 10, average: 13, median: 13, min: 9, max: 18, stdDev: 2, distribution: {}, dataHash: 'h1' };
        ClassDashboardManager.cachedSynthesisHTML = existingHtml;
        ClassDashboardManager.originalSynthesisHTML = existingHtml;
        ClassDashboardManager.cachedSynthesisRawText = existingJson;
        ClassDashboardManager.originalSynthesisRawText = existingJson;
        ClassDashboardManager.cachedSynthesisClassId = 'class-1';
        ClassDashboardManager.cachedSynthesisPeriod = 'T2';
        ClassDashboardManager.cachedSynthesisDataHash = 'h1';
        ClassDashboardManager._introHistoryState = {
            versions: [
                { content: 'Version précédente avant retouche', source: 'original', appreciationSource: 'ai' },
                { content: 'Synthèse existante à préserver.', source: 'concise', appreciationSource: 'ai' }
            ],
            currentIndex: 1
        };

        vi.spyOn(UI, 'checkAPIKeyPresence').mockReturnValue(true);
        const notifSpy = vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});

        let capturedSignal = null;
        vi.spyOn(AIService, 'callAIWithFallback').mockImplementation((_prompt, opts) => {
            capturedSignal = opts?.signal;
            return new Promise((_resolve, reject) => {
                opts?.signal?.addEventListener('abort', () => {
                    reject(new DOMException('Annulé', 'AbortError'));
                });
            });
        });

        const genPromise = ClassDashboardManager.generateAISynthesis();

        const generateBtn = document.getElementById('generateSynthesisBtn');
        const copyBtn = document.getElementById('copyDashboardSynthesisBtn');
        expect(generateBtn.classList.contains('is-cancellable')).toBe(true);
        expect(generateBtn.textContent).toContain('Annuler');
        expect(copyBtn.style.display).toBe('none');

        // Réouverture de la modale pendant la génération : le skeleton & le bouton Annuler sont préservés
        ClassDashboardManager.restoreOrResetAISection();
        expect(document.getElementById('aiSynthesisContent').innerHTML).toContain('synthesis-skeleton-grid');
        expect(generateBtn.classList.contains('is-cancellable')).toBe(true);

        // Annulation via cancelAllGenerations (croix pilule dynamique)
        expect(ClassDashboardManager.cancelAllGenerations()).toBe(true);
        await genPromise;

        expect(capturedSignal?.aborted).toBe(true);
        expect(notifSpy).not.toHaveBeenCalled();
        expect(document.getElementById('aiSynthesisContent').textContent).toContain('Synthèse existante à préserver.');
        expect(ClassDashboardManager._introHistoryState.versions.map(v => v.content)).toEqual([
            'Version précédente avant retouche',
            'Synthèse existante à préserver.'
        ]);
        expect(copyBtn.style.display).toBe('inline-flex');
        expect(generateBtn.classList.contains('is-loading')).toBe(false);
    });

    it('rejette un JSON tronqué (ex. `{ "synthesis": "...`) sans écraser la synthèse existante ni afficher le JSON brut', async () => {
        const existingJson = JSON.stringify({
            synthesis: 'Synthèse valide précédente.',
            strengths: ['Bonne ambiance'],
            vigilances: [],
            recommendations: ['Continuer']
        });
        const existingHtml = `<div class="ai-synthesis-text">${ClassDashboardManager._formatSynthesisText(existingJson)}</div>`;

        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent">${existingHtml}</div>
                <button id="generateSynthesisBtn"></button>
                <button id="copyDashboardSynthesisBtn" style="display: inline-flex;"></button>
                <div id="aiRefinementToolbar"></div>
                <div id="aiSynthesisMeta"><span id="aiSynthesisSourceInfo"></span></div>
                <button id="revertSynthesisBtn"></button>
            </div>
        `;
        ClassDashboardManager._ensureModal();
        ClassDashboardManager.cachedStats = { count: 10, average: 13, median: 13, min: 9, max: 18, stdDev: 2, distribution: {}, dataHash: 'h1' };
        ClassDashboardManager.cachedSynthesisHTML = existingHtml;
        ClassDashboardManager.originalSynthesisHTML = existingHtml;
        ClassDashboardManager.cachedSynthesisRawText = existingJson;
        ClassDashboardManager.originalSynthesisRawText = existingJson;
        ClassDashboardManager.cachedSynthesisClassId = 'class-1';
        ClassDashboardManager.cachedSynthesisPeriod = 'T2';
        ClassDashboardManager.cachedSynthesisDataHash = 'h1';
        ClassDashboardManager._introHistoryState = {
            versions: [
                { content: 'Version précédente avant retouche', source: 'original', appreciationSource: 'ai' },
                { content: 'Synthèse existante à préserver.', source: 'concise', appreciationSource: 'ai' }
            ],
            currentIndex: 1
        };

        vi.spyOn(UI, 'checkAPIKeyPresence').mockReturnValue(true);
        const notifSpy = vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        const saveSpy = vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});
        vi.spyOn(AIService, 'callAIWithFallback').mockResolvedValue({
            text: '{ "synthesis": "Au terme de l\'année scolaire, la classe affiche une dynamique positive. La majorité des élèves témoigne d'
        });

        await ClassDashboardManager.generateAISynthesis();

        expect(saveSpy).not.toHaveBeenCalled();
        expect(notifSpy).toHaveBeenCalledWith(expect.stringMatching(/tronquée|incomplet/i), 'error');
        expect(document.getElementById('aiSynthesisContent').textContent).toContain('Synthèse valide précédente.');
        expect(document.getElementById('aiSynthesisContent').textContent).not.toContain('"synthesis"');
    });

    it('notifie avec bouton Voir quand la synthèse se termine modale fermée et bloque hors-ligne pour les modèles cloud', async () => {
        document.body.innerHTML = `
            <div id="classDashboardModal" class="modal" style="display: none;">
                <div id="aiSynthesisContent"></div>
                <button id="generateSynthesisBtn"></button>
                <button id="copyDashboardSynthesisBtn"></button>
                <div id="aiRefinementToolbar"></div>
                <div id="aiSynthesisMeta"><span id="aiSynthesisSourceInfo"></span></div>
                <button id="revertSynthesisBtn"></button>
            </div>
        `;
        ClassDashboardManager._ensureModal();
        ClassDashboardManager.cachedStats = { count: 10, average: 14, median: 14, min: 10, max: 18, stdDev: 2, distribution: {}, dataHash: 'h2' };
        appState.classes = [{ id: 'class-1', name: '3ème A', analyses: {} }];
        appState.currentAIModel = 'gemini-4-hydrogen';

        vi.spyOn(UI, 'checkAPIKeyPresence').mockReturnValue(true);
        const notifSpy = vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});
        const aiSpy = vi.spyOn(AIService, 'callAIWithFallback').mockResolvedValue({
            text: JSON.stringify({
                synthesis: 'Excellente année.',
                strengths: ['Travail régulier'],
                vigilances: [],
                recommendations: ['Approfondir']
            })
        });

        // 1. Hors-ligne sur modèle cloud -> bloqué avant tout appel IA
        const onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        await ClassDashboardManager.generateAISynthesis();
        expect(aiSpy).not.toHaveBeenCalled();
        expect(notifSpy).toHaveBeenCalledWith(expect.stringMatching(/hors-ligne/i), 'warning');

        // 2. Retour en ligne, modale fermée -> génération silencieuse + toast actionnable "Voir"
        onLineSpy.mockReturnValue(true);
        notifSpy.mockClear();
        await ClassDashboardManager.generateAISynthesis();
        expect(aiSpy).toHaveBeenCalledTimes(1);
        expect(notifSpy).toHaveBeenCalledWith(
            'Analyse de la classe prête.',
            'success',
            5000,
            expect.objectContaining({
                action: expect.objectContaining({ label: 'Voir' })
            })
        );
    });

    it('préserve les retouches manuelles des puces faites pendant un affinage en cours et permet d\'annuler via #generateSynthesisBtn', async () => {
        const initialJson = JSON.stringify({
            synthesis: 'Synthèse initiale.',
            strengths: ['Point fort initial'],
            vigilances: ['Vigilance initiale'],
            recommendations: ['Conseil initial']
        });
        const initialHtml = `<div class="ai-synthesis-text">${ClassDashboardManager._formatSynthesisText(initialJson)}</div>`;

        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent">${initialHtml}</div>
                <button id="generateSynthesisBtn" style="display: inline-flex;"></button>
                <button id="copyDashboardSynthesisBtn" style="display: inline-flex;"></button>
                <div id="aiRefinementToolbar">
                    <button id="btnConcise" class="btn-refinement" data-refine-type="concise">Concise</button>
                </div>
                <div id="aiSynthesisMeta"><span id="aiSynthesisSourceInfo"></span></div>
                <button id="revertSynthesisBtn"></button>
            </div>
        `;
        ClassDashboardManager._ensureModal();
        ClassDashboardManager.cachedSynthesisHTML = initialHtml;
        ClassDashboardManager.originalSynthesisHTML = initialHtml;
        ClassDashboardManager.cachedSynthesisRawText = initialJson;
        ClassDashboardManager.originalSynthesisRawText = initialJson;
        ClassDashboardManager.cachedSynthesisClassId = 'class-1';
        ClassDashboardManager.cachedSynthesisPeriod = 'T2';
        appState.classes = [{ id: 'class-1', name: '3ème A', analyses: {} }];

        vi.spyOn(UI, 'checkAPIKeyPresence').mockReturnValue(true);
        vi.spyOn(UI, 'animateHtmlReveal').mockImplementation(async (el, html) => { el.innerHTML = html; });
        vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});

        let resolveRefine;
        vi.spyOn(AIService, 'callAIWithFallback').mockImplementation(() => new Promise(res => { resolveRefine = res; }));

        const refineBtn = document.getElementById('btnConcise');
        const refinePromise = ClassDashboardManager.handleClassAnalysisActions(refineBtn);

        // Pendant l'affinage : #generateSynthesisBtn passe en mode Annuler, Copier est neutralisé
        expect(document.getElementById('generateSynthesisBtn').classList.contains('is-cancellable')).toBe(true);
        expect(document.getElementById('copyDashboardSynthesisBtn').classList.contains('disabled')).toBe(true);

        // L'enseignant retouche une puce pendant l'appel réseau
        const firstStrengthLi = document.querySelector('.synthesis-section--success .synthesis-list li');
        firstStrengthLi.textContent = 'Puce modifiée en cours de route';

        resolveRefine({ text: 'Synthèse raccourcie.' });
        await refinePromise;

        const savedRaw = JSON.parse(ClassDashboardManager.cachedSynthesisRawText);
        expect(savedRaw.synthesis).toBe('Synthèse raccourcie.');
        expect(savedRaw.strengths).toEqual(['Puce modifiée en cours de route']);
        expect(document.getElementById('copyDashboardSynthesisBtn').classList.contains('disabled')).toBe(false);
    });

    it('annule proprement un affinage en cours d\'animation de révélation sans sauvegarder, restaure le texte/tooltip et préserve les guillemets internes', async () => {
        const initialJson = JSON.stringify({
            synthesis: 'Synthèse d\'origine stable.',
            strengths: ['Travail sérieux'],
            vigilances: [],
            recommendations: []
        });
        const initialHtml = `<div class="ai-synthesis-text">${ClassDashboardManager._formatSynthesisText(initialJson)}</div>`;

        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent">${initialHtml}</div>
                <button id="generateSynthesisBtn" style="display: inline-flex;"></button>
                <button id="copyDashboardSynthesisBtn" style="display: inline-flex;"></button>
                <div id="aiRefinementToolbar">
                    <button id="btnPolish" class="btn-refinement tooltip" data-refine-type="polish" data-tooltip="Corriger et fluidifier la rédaction">Peaufiner</button>
                </div>
                <div id="aiSynthesisMeta">
                    <span id="aiSynthesisSourceInfo"></span>
                    <span class="synthesis-meta-hint">Clic sur un texte pour retoucher</span>
                    <button id="revertSynthesisBtn" style="display: none;"></button>
                </div>
            </div>
        `;
        ClassDashboardManager._ensureModal();
        ClassDashboardManager.cachedSynthesisHTML = initialHtml;
        ClassDashboardManager.originalSynthesisHTML = initialHtml;
        ClassDashboardManager.cachedSynthesisRawText = initialJson;
        ClassDashboardManager.originalSynthesisRawText = initialJson;
        ClassDashboardManager.cachedSynthesisClassId = 'class-1';
        ClassDashboardManager.cachedSynthesisPeriod = 'T2';
        appState.classes = [{ id: 'class-1', name: '3ème A', analyses: {} }];

        vi.spyOn(UI, 'checkAPIKeyPresence').mockReturnValue(true);
        vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        const saveSpy = vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});

        // 1. Annulation pendant animateHtmlReveal -> aucune persistance, texte d'origine et tooltip restaurés
        let resolveReveal;
        vi.spyOn(UI, 'animateHtmlReveal').mockImplementationOnce((el, _html, { signal } = {}) => new Promise(resolve => {
            el.innerHTML = '<span class="reveal-word">Début...</span>';
            resolveReveal = resolve;
            signal?.addEventListener('abort', () => resolve(), { once: true });
        }));
        vi.spyOn(AIService, 'callAIWithFallback').mockResolvedValueOnce({
            text: 'Nouvelle version interrompue.'
        });

        const polishBtn = document.getElementById('btnPolish');
        const abortedPromise = ClassDashboardManager.handleClassAnalysisActions(polishBtn);
        await Promise.resolve();
        await Promise.resolve();

        expect(polishBtn.dataset.tooltip).toBe('Cliquer pour annuler');
        ClassDashboardManager.cancelGeneration('class-1', 'T2');
        resolveReveal?.();
        await abortedPromise;

        expect(saveSpy).not.toHaveBeenCalled();
        expect(document.querySelector('.synthesis-intro-text').textContent).toBe('Synthèse d\'origine stable.');
        expect(polishBtn.dataset.tooltip).toBe('Corriger et fluidifier la rédaction');

        // 2. Raffinement terminé avec guillemets internes légitimes -> guillemets conservés intacts
        vi.spyOn(UI, 'animateHtmlReveal').mockImplementationOnce(async (el, html) => { el.innerHTML = html; });
        vi.spyOn(AIService, 'callAIWithFallback').mockResolvedValueOnce({
            text: 'La classe adopte une attitude « très constructive »'
        });

        await ClassDashboardManager.handleClassAnalysisActions(polishBtn);
        expect(document.querySelector('.synthesis-intro-text').textContent).toBe('La classe adopte une attitude « très constructive »');
        expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    it('affiche toujours la bonne version et ne crée aucune version fantôme lors de changements rapides pendant l\'animation d\'apparition', async () => {
        vi.useFakeTimers();
        try {
            appState.currentClassId = 'class-race';
            appState.currentPeriod = 'T2';
            const classObj = { id: 'class-race', name: '4ème B', analyses: {} };
            appState.classes = [classObj];

            const v1Text = 'Première version initiale de la classe.';
            const v2Text = 'Deuxième version plus concise et structurée pour le conseil.';
            const v3Text = 'Troisième version encourageante pour l ensemble du groupe.';
            const initialPayload = {
                synthesis: v3Text,
                strengths: ['Bonne ambiance'],
                vigilances: ['Attention en fin de séance'],
                recommendations: ['Poursuivre les efforts']
            };
            const initialRaw = JSON.stringify(initialPayload);
            const initialHtml = `<div class="ai-synthesis-text">${ClassDashboardManager._formatSynthesisText(initialRaw)}</div>`;

            document.body.innerHTML = `
                <div id="classDashboardModal" class="modal active">
                    <div id="aiSynthesisContent">${initialHtml}</div>
                    <div id="aiRefinementToolbar" style="display:flex;"></div>
                    <button id="revertSynthesisBtn" style="display:none;"></button>
                </div>
            `;

            ClassDashboardManager._ensureModal();
            ClassDashboardManager.cachedSynthesisHTML = initialHtml;
            ClassDashboardManager.originalSynthesisHTML = initialHtml;
            ClassDashboardManager.cachedSynthesisRawText = initialRaw;
            ClassDashboardManager.originalSynthesisRawText = initialRaw;
            ClassDashboardManager.cachedSynthesisClassId = 'class-race';
            ClassDashboardManager.cachedSynthesisPeriod = 'T2';
            ClassDashboardManager._introHistoryState = {
                versions: [
                    { content: v1Text, source: 'original', appreciationSource: 'ai', timestamp: 1000 },
                    { content: v2Text, source: 'concise', appreciationSource: 'ai', timestamp: 2000 },
                    { content: v3Text, source: 'encouraging', appreciationSource: 'ai', timestamp: 3000 }
                ],
                currentIndex: 2
            };
            ClassDashboardManager._enhanceSynthesisDOM(document.getElementById('aiSynthesisContent'));

            vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});
            vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
            const writeTextMock = vi.fn().mockResolvedValue(undefined);
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: writeTextMock },
                configurable: true
            });

            // 1. Retour vers v2 (démarre la VRAIE animation animateHtmlReveal)
            const pUndo1 = ClassDashboardManager.undoIntroSynthesis();
            await Promise.resolve();
            await Promise.resolve();
            expect(document.querySelector('.synthesis-intro-history-group .history-count').textContent).toBe('2/3');

            // 2. Pendant l'animation de v2, on recule encore vers v1 puis on revient vers v2
            const pUndo2 = ClassDashboardManager.undoIntroSynthesis();
            const pRedo = ClassDashboardManager.redoIntroSynthesis();

            // 3. Ouverture du popover pendant l'animation : ne doit pas injecter de fausse modification manuelle
            ClassDashboardManager.showIntroHistoryPopover();
            expect(ClassDashboardManager._introHistoryState.versions).toHaveLength(3);
            ClassDashboardManager.closeIntroHistoryPopover();

            // 4. Copie pendant l'animation : copie la version cible (v2), pas une version périmée
            await ClassDashboardManager.copyIntroSynthesis();
            expect(writeTextMock).toHaveBeenLastCalledWith(v2Text);

            await vi.runAllTimersAsync();
            await Promise.all([pUndo1, pUndo2, pRedo]);

            // 5. État final strictement cohérent sur v2 (2/3) : DOM, cache, stockage, compteur de mots et historique
            expect(document.querySelector('.synthesis-intro-text').textContent).toBe(v2Text);
            expect(document.querySelector('.synthesis-intro-history-group .history-count').textContent).toBe('2/3');
            expect(document.querySelector('.synthesis-intro-word-count').textContent).toBe('9 mots');
            expect(ClassDashboardManager._introHistoryState.versions).toHaveLength(3);
            expect(ClassDashboardManager._introHistoryState.currentIndex).toBe(1);
            expect(JSON.parse(ClassDashboardManager.cachedSynthesisRawText).synthesis).toBe(v2Text);
            expect(JSON.parse(classObj.analyses.T2.rawText).synthesis).toBe(v2Text);
        } finally {
            ClassDashboardManager._cancelIntroReveal();
            vi.useRealTimers();
        }
    });
});
