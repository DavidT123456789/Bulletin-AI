/**
 * @fileoverview Tests unitaires pour FocusPanelAnalysis
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FocusPanelAnalysis } from './FocusPanelAnalysis.js';
import { appState } from '../state/State.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';

describe('FocusPanelAnalysis - État du bouton Générer / Régénérer / Actualiser', () => {
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
                    <div class="analysis-card"><div class="analysis-card-header"></div><div id="analysisForcesContent"></div></div>
                    <div class="analysis-card"><div class="analysis-card-header"></div><div id="analysisWeaknessesContent"></div></div>
                    <div class="analysis-card"><div class="analysis-card-header"></div><div id="analysisSuggestionsContent"></div></div>
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
                strengthsWeaknesses: { strengths: ['Participation active'], weaknesses: ['Rigueur à consolider'] },
                nextSteps: ['Poursuivre les efforts'],
                analysisSnapshot: {
                    appreciation: 'Excellent trimestre.',
                    statuses: [],
                    context: '',
                    grade: 16,
                    journalCount: 0,
                    period: 'T1'
                }
            }
        ];

        mockAppreciationsManager = {
            generateStrengthsWeaknesses: vi.fn(async (id) => {
                const res = appState.generatedResults.find(r => r.id === id);
                if (res) {
                    res.strengthsWeaknesses = {
                        strengths: ['Progression notable'],
                        weaknesses: ['Besoin de consolider']
                    };
                }
            }),
            generateNextSteps: vi.fn(async (id) => {
                const res = appState.generatedResults.find(r => r.id === id);
                if (res) {
                    res.nextSteps = ['Continuer ainsi'];
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

        expect(btn.textContent.trim()).toBe('Régénérer');
        expect(btn.classList.contains('btn-neutral')).toBe(true);
        expect(btn.disabled).toBe(false);
    });

    it('affiche "Actualiser" (btn-warning) lorsque les données de l\'élève ont changé depuis l\'analyse', () => {
        currentStudentId = 'student-2';
        appState.generatedResults[1].studentData.periods.T1.grade = 14; // Modifié par rapport au snapshot (16)

        const btn = document.getElementById('focusGenerateAnalysisBtn');
        FocusPanelAnalysis.show();

        expect(btn.textContent.trim()).toBe('Actualiser');
        expect(btn.classList.contains('btn-warning')).toBe(true);
    });

    it('n\'écrase pas le bouton ni les cartes d\'un élève déjà analysé quand on change d\'élève pendant une génération', async () => {
        let resolveGeneration;
        mockAppreciationsManager.generateStrengthsWeaknesses = vi.fn(() => new Promise(resolve => {
            resolveGeneration = resolve;
        }));

        const btn = document.getElementById('focusGenerateAnalysisBtn');
        FocusPanelAnalysis.show();

        const genPromise = FocusPanelAnalysis.generate();
        expect(btn.classList.contains('is-loading')).toBe(true);

        // Changement vers student-2 qui a déjà une analyse à jour
        currentStudentId = 'student-2';
        FocusPanelAnalysis.show();

        expect(btn.classList.contains('is-loading')).toBe(false);
        expect(btn.textContent.trim()).toBe('Régénérer');
        expect(btn.classList.contains('btn-neutral')).toBe(true);

        // Fin de la génération en arrière-plan de student-1
        resolveGeneration();
        await genPromise;

        // Le bouton de student-2 doit rester en "Régénérer"
        expect(btn.textContent.trim()).toBe('Régénérer');
        expect(btn.classList.contains('btn-neutral')).toBe(true);
        expect(document.getElementById('analysisForcesContent').textContent).toContain('Participation active');
    });

    it('préserve l\'analyse existante et affiche un toast si la régénération échoue côté réseau/API', async () => {
        currentStudentId = 'student-2';
        const notifSpy = vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        mockAppreciationsManager.generateStrengthsWeaknesses = vi.fn(async () => {
            throw new Error('Quota API dépassé');
        });
        mockAppreciationsManager.generateNextSteps = vi.fn(async () => {
            throw new Error('Quota API dépassé');
        });

        const btn = document.getElementById('focusGenerateAnalysisBtn');
        FocusPanelAnalysis.show();
        expect(btn.textContent.trim()).toBe('Régénérer');

        await FocusPanelAnalysis.generate();

        // L'analyse précédente de Léon est préservée et réaffichée
        expect(appState.generatedResults[1].strengthsWeaknesses).toEqual({
            strengths: ['Participation active'],
            weaknesses: ['Rigueur à consolider']
        });
        expect(document.getElementById('analysisForcesContent').textContent).toContain('Participation active');
        expect(btn.textContent.trim()).toBe('Régénérer');
        expect(notifSpy).toHaveBeenCalledWith(expect.stringContaining('Erreur'), 'error');
    });

    it('passe en état "Actualiser" quand on change de période (T1 -> T2) et permet de relancer via le badge modifié', () => {
        currentStudentId = 'student-2';
        appState.currentPeriod = 'T2';
        appState.generatedResults[1].studentData.periods.T2 = {
            appreciation: 'Excellent trimestre.',
            grade: 16,
            context: ''
        };

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

    it('affiche le bouton "Annuler" avec icône stop pendant la génération et annule au clic suivant', async () => {
        currentStudentId = 'student-2';
        let capturedSignal = null;
        mockAppreciationsManager.generateStrengthsWeaknesses = vi.fn((_id, _silent, signal) => new Promise((_resolve, reject) => {
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

        // Deuxième clic sur le bouton -> annule la génération en cours
        await FocusPanelAnalysis.generate();
        await genPromise;

        expect(capturedSignal?.aborted).toBe(true);
        expect(btn.classList.contains('is-loading')).toBe(false);
        expect(btn.textContent.trim()).toBe('Régénérer');
        expect(document.getElementById('analysisForcesContent').textContent).toContain('Participation active');
    });
});
