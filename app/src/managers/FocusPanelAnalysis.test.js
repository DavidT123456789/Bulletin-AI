/**
 * @fileoverview Tests unitaires pour FocusPanelAnalysis
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FocusPanelAnalysis } from './FocusPanelAnalysis.js';
import { appState } from '../state/State.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';

describe('FocusPanelAnalysis - État du bouton, isolation par période et édition inline', () => {
    let currentStudentId = null;
    let mockAppreciationsManager;

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = `
            <div id="focusPagesContainer">
                <div id="focusMainPage"></div>
                <div id="focusAnalysisPage">
                    <div id="focusAnalysisAvatarContainer"></div>
                    <h3 id="focusAnalysisTitle"></h3>
                    <button id="focusGenerateAnalysisBtn" class="btn btn-small btn-ai"></button>
                    <div class="analysis-card"><div class="analysis-card-header"></div><div id="analysisForcesContent" class="analysis-card-body"></div></div>
                    <div class="analysis-card"><div class="analysis-card-header"></div><div id="analysisWeaknessesContent" class="analysis-card-body"></div></div>
                    <div class="analysis-card"><div class="analysis-card-header"></div><div id="analysisSuggestionsContent" class="analysis-card-body"></div></div>
                </div>
            </div>
        `;

        appState.currentPeriod = 'T1';
        appState.generatedResults = [
            {
                id: 'student-1',
                prenom: 'Hugo',
                nom: 'Martin',
                studentData: {
                    statuses: [],
                    periods: {
                        T1: { appreciation: 'Bon trimestre dans l\'ensemble.', grade: 12.5, context: '' }
                    },
                    prompts: {}
                },
                analysisPerPeriod: {},
                strengthsWeaknesses: null,
                nextSteps: null
            },
            {
                id: 'student-2',
                prenom: 'Léon',
                nom: 'Dupont',
                studentData: {
                    statuses: [],
                    periods: {
                        T1: { appreciation: 'Excellent trimestre.', grade: 16, context: '' }
                    },
                    prompts: {}
                },
                analysisPerPeriod: {
                    T1: {
                        strengths: ['Participation active'],
                        weaknesses: ['Rigueur à consolider'],
                        nextSteps: ['Poursuivre les efforts'],
                        source: 'ai',
                        _lastModified: 1000,
                        snapshot: {
                            appreciation: 'Excellent trimestre.',
                            statuses: [],
                            context: '',
                            grade: 16,
                            journalCount: 0,
                            period: 'T1'
                        }
                    }
                },
                strengthsWeaknesses: { strengths: ['Participation active'], weaknesses: ['Rigueur à consolider'] },
                nextSteps: ['Poursuivre les efforts'],
                analysisGenerationPeriod: 'T1'
            }
        ];

        mockAppreciationsManager = {
            getAllPrompts: vi.fn(() => ({ analysis: 'Mock prompt' })),
            generateStudentAnalysis: vi.fn(async (id, targetPeriod = 'T1') => {
                const res = appState.generatedResults.find(r => r.id === id);
                if (res) {
                    if (!res.analysisPerPeriod) res.analysisPerPeriod = {};
                    res.analysisPerPeriod[targetPeriod] = {
                        strengths: ['Progression notable'],
                        weaknesses: ['Besoin de consolider'],
                        nextSteps: ['Continuer ainsi'],
                        source: 'ai',
                        _lastModified: Date.now(),
                        snapshot: {
                            appreciation: res.studentData.periods[targetPeriod]?.appreciation || '',
                            statuses: [],
                            context: '',
                            grade: res.studentData.periods[targetPeriod]?.grade ?? null,
                            journalCount: 0,
                            period: targetPeriod
                        }
                    };
                }
            })
        };

        currentStudentId = 'student-1';
        FocusPanelAnalysis._activeGenerations.clear();
        if (FocusPanelAnalysis._autoGenerateTimer) {
            clearTimeout(FocusPanelAnalysis._autoGenerateTimer);
            FocusPanelAnalysis._autoGenerateTimer = null;
        }
        FocusPanelAnalysis.init({
            getCurrentStudentId: () => currentStudentId
        }, mockAppreciationsManager);

        vi.spyOn(UI, 'checkAPIKeyPresence').mockReturnValue(true);
        vi.spyOn(UI, 'animateHtmlReveal').mockImplementation((el, html) => {
            if (el) el.innerHTML = html;
        });
        vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('passe bien le bouton en "Régénérer" (btn-neutral) après la fin de la génération et non en "Générer"', async () => {
        const btn = document.getElementById('focusGenerateAnalysisBtn');

        FocusPanelAnalysis.show();
        expect(btn.textContent.trim()).toBe('Générer');
        expect(btn.classList.contains('btn-ai')).toBe(true);

        await FocusPanelAnalysis.generate();

        expect(mockAppreciationsManager.generateStudentAnalysis).toHaveBeenCalledWith(
            'student-1',
            'T1',
            true,
            expect.any(Object)
        );
        expect(btn.textContent.trim()).toBe('Régénérer');
        expect(btn.classList.contains('btn-neutral')).toBe(true);
        expect(btn.disabled).toBe(false);
        expect(document.querySelectorAll('#analysisForcesContent li[contenteditable="true"]').length).toBe(1);
    });

    it('affiche "Actualiser" (btn-warning) et permet de relancer via le badge modifié lorsque les données de la même période ont changé', () => {
        currentStudentId = 'student-2';
        appState.generatedResults[1].studentData.periods.T1.grade = 14; // Modifié par rapport au snapshot (16)

        const btn = document.getElementById('focusGenerateAnalysisBtn');
        const genSpy = vi.spyOn(FocusPanelAnalysis, 'generate').mockImplementation(async () => {});

        FocusPanelAnalysis.show();

        expect(btn.textContent.trim()).toBe('Actualiser');
        expect(btn.classList.contains('btn-warning')).toBe(true);

        const modifiedBadge = document.querySelector('.analysis-status-badge.modified');
        expect(modifiedBadge).not.toBeNull();
        expect(modifiedBadge.getAttribute('data-tooltip')).toContain('Cliquez pour actualiser');

        modifiedBadge.click();
        expect(genSpy).toHaveBeenCalledTimes(1);
    });

    it('isole strictement les analyses par période : T1 analysé ne fuit pas vers T2', () => {
        currentStudentId = 'student-2';
        appState.currentPeriod = 'T2';
        appState.generatedResults[1].studentData.periods.T2 = {
            appreciation: '',
            grade: 14,
            context: ''
        };

        const btn = document.getElementById('focusGenerateAnalysisBtn');
        FocusPanelAnalysis.show();

        expect(btn.textContent.trim()).toBe('Générer');
        expect(btn.classList.contains('btn-ai')).toBe(true);
        expect(document.getElementById('analysisForcesContent').textContent).not.toContain('Participation active');
        expect(document.getElementById('analysisForcesContent').querySelector('.analysis-placeholder')).not.toBeNull();
    });

    it('n\'écrase pas le bouton ni les cartes d\'un élève déjà analysé quand on change d\'élève pendant une génération', async () => {
        let resolveGeneration;
        mockAppreciationsManager.generateStudentAnalysis = vi.fn(() => new Promise(resolve => {
            resolveGeneration = resolve;
        }));

        const btn = document.getElementById('focusGenerateAnalysisBtn');
        FocusPanelAnalysis.show();

        const genPromise = FocusPanelAnalysis.generate();
        expect(btn.classList.contains('is-loading')).toBe(true);

        currentStudentId = 'student-2';
        FocusPanelAnalysis.show();

        expect(btn.classList.contains('is-loading')).toBe(false);
        expect(btn.textContent.trim()).toBe('Régénérer');
        expect(btn.classList.contains('btn-neutral')).toBe(true);

        resolveGeneration();
        await genPromise;

        expect(btn.textContent.trim()).toBe('Régénérer');
        expect(btn.classList.contains('btn-neutral')).toBe(true);
        expect(document.getElementById('analysisForcesContent').textContent).toContain('Participation active');
    });

    it('préserve l\'analyse existante et affiche un toast si la régénération échoue côté réseau/API', async () => {
        currentStudentId = 'student-2';
        mockAppreciationsManager.generateStudentAnalysis = vi.fn(async () => {
            throw new Error('Quota API dépassé');
        });

        const btn = document.getElementById('focusGenerateAnalysisBtn');
        FocusPanelAnalysis.show();
        expect(btn.textContent.trim()).toBe('Régénérer');

        await FocusPanelAnalysis.generate();

        expect(appState.generatedResults[1].analysisPerPeriod.T1.strengths).toEqual(['Participation active']);
        expect(document.getElementById('analysisForcesContent').textContent).toContain('Participation active');
        expect(btn.textContent.trim()).toBe('Régénérer');
        expect(UI.showNotification).toHaveBeenCalledWith(expect.stringContaining('Erreur'), 'error');
    });

    it('affiche le bouton "Annuler" avec icône stop pendant la génération et annule au clic suivant', async () => {
        currentStudentId = 'student-2';
        let capturedSignal = null;
        mockAppreciationsManager.generateStudentAnalysis = vi.fn((_id, _period, _silent, signal) => new Promise((_resolve, reject) => {
            capturedSignal = signal;
            signal?.addEventListener('abort', () => {
                const err = new Error('Aborted');
                err.name = 'AbortError';
                reject(err);
            });
        }));

        const btn = document.getElementById('focusGenerateAnalysisBtn');
        FocusPanelAnalysis.show();
        expect(btn.textContent.trim()).toBe('Régénérer');

        const genPromise = FocusPanelAnalysis.generate();
        expect(btn.classList.contains('is-loading')).toBe(true);
        expect(btn.classList.contains('is-cancellable')).toBe(true);
        expect(btn.disabled).toBe(false);
        expect(btn.textContent.trim()).toBe('Annuler');
        expect(btn.querySelector('.stop-square-svg')).not.toBeNull();

        await FocusPanelAnalysis.generate();
        await genPromise;

        expect(capturedSignal?.aborted).toBe(true);
        expect(btn.classList.contains('is-loading')).toBe(false);
        expect(btn.textContent.trim()).toBe('Régénérer');
        expect(document.getElementById('analysisForcesContent').textContent).toContain('Participation active');
    });

    it('permet d\'éditer, d\'ajouter, d\'annuler via Échap et de supprimer jusqu\'à la dernière puce avec persistance immédiate', () => {
        currentStudentId = 'student-2';
        FocusPanelAnalysis.show();

        // 1. Edition d'une puce existante
        const forceLi = document.querySelector('#analysisForcesContent li');
        forceLi._initialTextBeforeEdit = 'Participation active';
        forceLi.textContent = '  Participation   régulière et pertinente  ';
        FocusPanelAnalysis.commitEditableBlur(forceLi);

        expect(appState.generatedResults[1].analysisPerPeriod.T1.strengths).toEqual([
            'Participation régulière et pertinente'
        ]);
        expect(StorageManager.saveAppState).toHaveBeenCalled();

        // 2. Suppression de l'unique point de vigilance -> bascule en état vide sans restauration forcée
        const weaknessLi = document.querySelector('#analysisWeaknessesContent li');
        weaknessLi._initialTextBeforeEdit = 'Rigueur à consolider';
        weaknessLi.textContent = '   ';
        FocusPanelAnalysis.commitEditableBlur(weaknessLi);

        expect(appState.generatedResults[1].analysisPerPeriod.T1.weaknesses).toEqual([]);
        expect(document.querySelectorAll('#analysisWeaknessesContent li').length).toBe(0);
        expect(document.querySelector('#analysisWeaknessesContent .analysis-placeholder')).not.toBeNull();

        // 3. Ajout puis annulation via Échap d'une puce vierge -> ne pollue pas les données
        FocusPanelAnalysis.addEditableItem('weaknesses');
        const newLi = document.querySelector('#analysisWeaknessesContent li');
        expect(newLi).not.toBeNull();
        newLi.textContent = 'Texte abandonné';
        FocusPanelAnalysis.cancelEditableItem(newLi);
        FocusPanelAnalysis.commitEditableBlur(newLi);

        expect(appState.generatedResults[1].analysisPerPeriod.T1.weaknesses).toEqual([]);
        expect(document.querySelector('#analysisWeaknessesContent .analysis-placeholder')).not.toBeNull();
    });

    it('ne double-échappe pas les apostrophes ni les guillemets lors du rendu des cartes', () => {
        currentStudentId = 'student-2';
        appState.generatedResults[1].analysisPerPeriod.T1.strengths = ["Investissement et pertinence à l'oral"];
        FocusPanelAnalysis.show();

        const li = document.querySelector('#analysisForcesContent li');
        expect(li.innerHTML).not.toContain('&amp;#39;');
        expect(li.textContent).toBe("Investissement et pertinence à l'oral");
    });

    it('n\'affiche pas de badge vert permanent au repos, flash brièvement après génération puis propose Rétablir si des retouches manuelles existaient', async () => {
        currentStudentId = 'student-2';
        FocusPanelAnalysis.show();

        // Au repos sur une analyse existante à jour : aucun badge vert permanent
        expect(document.querySelector('.analysis-status-badge')).toBeNull();

        // Edition manuelle -> pose hasManualEdits
        const forceLi = document.querySelector('#analysisForcesContent li');
        forceLi._initialTextBeforeEdit = 'Participation active';
        forceLi.textContent = 'Point personnalisé enseignant';
        FocusPanelAnalysis.commitEditableBlur(forceLi);
        expect(appState.generatedResults[1].analysisPerPeriod.T1.hasManualEdits).toBe(true);

        // Régénération IA -> flash temporaire ✓ pendant 1.5s + toast Rétablir
        await FocusPanelAnalysis.generate();
        expect(document.querySelectorAll('.analysis-status-badge.done').length).toBe(3);

        vi.advanceTimersByTime(1500);
        expect(document.querySelector('.analysis-status-badge.done')).toBeNull();

        const restoreCall = UI.showNotification.mock.calls.find(c => c[3]?.action?.label === 'Rétablir');
        expect(restoreCall).toBeDefined();

        // Clic sur Rétablir -> restaure la puce manuelle
        restoreCall[3].action.onClick();
        expect(appState.generatedResults[1].analysisPerPeriod.T1.strengths).toEqual(['Point personnalisé enseignant']);
        expect(document.getElementById('analysisForcesContent').textContent).toContain('Point personnalisé enseignant');
    });

    it('affiche la période active dans le titre et flush une puce en cours d\'édition à la fermeture (hide)', () => {
        currentStudentId = 'student-2';
        FocusPanelAnalysis.show();
        expect(document.getElementById('focusAnalysisTitle').textContent).toBe('Analyse de Léon · T1');

        const forceLi = document.querySelector('#analysisForcesContent li');
        forceLi._initialTextBeforeEdit = 'Participation active';
        forceLi.focus();
        forceLi.textContent = 'Édition saisie juste avant fermeture';

        FocusPanelAnalysis.hide();
        expect(appState.generatedResults[1].analysisPerPeriod.T1.strengths).toEqual([
            'Édition saisie juste avant fermeture'
        ]);
    });
});
