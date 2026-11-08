import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appState } from '../state/State.js';
import { FocusPanelRefinement } from './FocusPanelRefinement.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { FocusPanelHistory } from './FocusPanelHistory.js';
import { FocusPanelStatus } from './FocusPanelStatus.js';
import { AIService } from '../services/AIService.js';

vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn().mockResolvedValue(undefined)
    }
}));

vi.mock('./ListViewManager.js', () => ({
    ListViewManager: {
        render: vi.fn(),
        updateRowStatus: vi.fn()
    }
}));

vi.mock('./UIManager.js', () => ({
    UI: {
        showNotification: vi.fn(),
        initTooltips: vi.fn()
    }
}));

vi.mock('../services/AIService.js', () => ({
    AIService: {
        callAIWithFallback: vi.fn()
    }
}));

describe('FocusPanel — Concurrence IA lors d\'un changement de période ou d\'élève (T-06 / Bug C-01)', () => {
    let studentA;
    let studentB;

    beforeEach(() => {
        vi.clearAllMocks();

        document.body.innerHTML = `
            <div id="focusPanel">
                <div id="focusAppreciationText">Appréciation initiale A (T1)</div>
                <span id="focusWordCount">4 mots</span>
                <span id="focusCharCount">28 car.</span>
                <div id="focusStatusPill"></div>
                <button id="focusGenerateBtn"></button>
                <div id="focusAiToolsTrigger"></div>
                <div id="focusAiMenuPopover"></div>
                <input id="focusCustomInstructionInput" value="" />
            </div>
        `;

        studentA = {
            id: 'student-A',
            classId: 'c1',
            appreciation: 'Appréciation initiale A (T1)',
            status: 'generated',
            studentData: {
                prenom: 'Alice',
                nom: 'Martin',
                currentPeriod: 'T1',
                periods: {
                    T1: { grade: 14, appreciation: 'Appréciation initiale A (T1)' },
                    T2: { grade: 15, appreciation: 'Appréciation initiale A (T2)' }
                }
            },
            historyPerPeriod: {
                T1: {
                    versions: [{ content: 'Appréciation initiale A (T1)', timestamp: '2026-01-01T00:00:00.000Z', type: 'initial' }],
                    currentIndex: 0
                },
                T2: {
                    versions: [{ content: 'Appréciation initiale A (T2)', timestamp: '2026-03-01T00:00:00.000Z', type: 'initial' }],
                    currentIndex: 0
                }
            }
        };

        studentB = {
            id: 'student-B',
            classId: 'c1',
            appreciation: 'Appréciation initiale B (T2)',
            status: 'generated',
            studentData: {
                prenom: 'Bob',
                nom: 'Dupont',
                currentPeriod: 'T2',
                periods: {
                    T1: { grade: 11, appreciation: 'Appréciation initiale B (T1)' },
                    T2: { grade: 12, appreciation: 'Appréciation initiale B (T2)' }
                }
            },
            historyPerPeriod: {
                T1: {
                    versions: [{ content: 'Appréciation initiale B (T1)', timestamp: '2026-01-01T00:00:00.000Z', type: 'initial' }],
                    currentIndex: 0
                },
                T2: {
                    versions: [{ content: 'Appréciation initiale B (T2)', timestamp: '2026-03-01T00:00:00.000Z', type: 'initial' }],
                    currentIndex: 0
                }
            }
        };

        appState.currentClassId = 'c1';
        appState.currentPeriod = 'T1';
        appState.generatedResults = [studentA, studentB];
        appState.filteredResults = [studentA, studentB];
    });

    it('T-06 (Bug C-01a) : FocusPanelRefinement.apply enregistre le texte raffiné dans la période d\'origine (T1 de A) sans écraser T2 ni le DOM de l\'élève B après navigation', async () => {
        let resolveRefinement;
        AIService.callAIWithFallback.mockReturnValue(
            new Promise((resolve) => {
                resolveRefinement = resolve;
            })
        );

        const mockPanel = {
            currentStudentId: 'student-A',
            _getCurrentStudent() {
                return appState.generatedResults.find(r => r.id === this.currentStudentId);
            },
            _updateGeneratingState: vi.fn(),
            _updateCounters: vi.fn(),
            _refreshStatus: vi.fn(),
            _syncToMainView: vi.fn()
        };

        FocusPanelHistory.init(mockPanel, { showNotification: vi.fn() });
        FocusPanelRefinement.init(mockPanel, {}, { showNotification: vi.fn() });

        // 1. Lancer le raffinement sur l'élève A en T1
        const applyPromise = FocusPanelRefinement.apply('concise');

        // 2. Pendant l'appel réseau IA, l'utilisateur bascule en T2 et sélectionne l'élève B
        appState.currentPeriod = 'T2';
        mockPanel.currentStudentId = 'student-B';
        const textEl = document.getElementById('focusAppreciationText');
        textEl.textContent = 'Appréciation initiale B (T2)';

        // 3. Résoudre la promesse IA
        resolveRefinement({ text: 'Appréciation A raffinée (T1)' });
        await applyPromise;

        // Vérifications cibles :
        // - T1 de A a bien reçu le texte raffiné
        expect(studentA.studentData.periods.T1.appreciation).toBe('Appréciation A raffinée (T1)');
        // - T2 de A est strictement intact
        expect(studentA.studentData.periods.T2.appreciation).toBe('Appréciation initiale A (T2)');
        // - Le DOM actuellement affiché pour l'élève B (T2) n'a pas été écrasé par le résultat de A (T1)
        expect(textEl.textContent).toBe('Appréciation initiale B (T2)');
    });

    it('T-06 (Bug C-01b) : FocusPanelManager.generate n\'écrase ni l\'historique de T2 ni le DOM de T2 si l\'utilisateur change de période (T1 -> T2) sur le même élève pendant la génération', async () => {
        let resolveGeneration;
        const mockAm = {
            generateAppreciation: vi.fn().mockReturnValue(
                new Promise((resolve) => {
                    resolveGeneration = resolve;
                })
            )
        };

        FocusPanelManager.init(mockAm, { showNotification: vi.fn() });
        FocusPanelManager.isOpen = true;
        FocusPanelManager.currentStudentId = 'student-A';
        FocusPanelManager._saveAllFields = vi.fn();
        FocusPanelManager._updateGeneratingState = vi.fn();
        FocusPanelManager._updateCounters = vi.fn();
        FocusPanelManager._refreshStatus = vi.fn();
        FocusPanelManager._syncToMainView = vi.fn();

        // 1. Lancer la génération pour l'élève A en T1
        const genPromise = FocusPanelManager.generate();

        // 2. Pendant l'appel IA, l'utilisateur bascule sur l'onglet T2 du même élève A
        appState.currentPeriod = 'T2';
        const textEl = document.getElementById('focusAppreciationText');
        textEl.textContent = 'Appréciation initiale A (T2)';

        // 3. Résoudre la promesse de génération T1
        resolveGeneration({
            appreciation: 'Nouvelle appréciation générée pour T1',
            studentData: {
                periods: {
                    T1: { grade: 14, appreciation: 'Nouvelle appréciation générée pour T1' }
                }
            },
            evolutions: []
        });
        await genPromise;

        // Vérifications cibles :
        // - L'historique de T2 ne doit pas contenir l'appréciation de T1
        expect(studentA.historyPerPeriod.T2.versions.map(v => v.content)).toEqual(['Appréciation initiale A (T2)']);
        // - Le texte affiché dans l'éditeur (qui montre T2) ne doit pas être écrasé par le texte de T1
        expect(textEl.textContent).toBe('Appréciation initiale A (T2)');
    });

    it('préserve l\'alerte dirty (promptHash intact) lorsqu\'on raffine une appréciation dont la note a été modifiée', async () => {
        const { PromptService } = await import('../services/PromptService.js');
        const initialHash = PromptService.getPromptHash({
            ...studentA.studentData,
            id: studentA.id,
            currentPeriod: 'T1'
        });
        studentA.promptHash = initialHash;
        studentA.generationPeriod = 'T1';
        studentA.wasGenerated = true;
        studentA.appreciationSource = 'ai';

        // La note change après génération : l'élève passe en état dirty
        studentA.studentData.periods.T1.grade = 8;
        expect(FocusPanelStatus.checkDirtyState(studentA)).toBe(true);

        AIService.callAIWithFallback.mockResolvedValue({ text: 'Version raccourcie (basée sur ancien texte)' });

        const mockPanel = {
            currentStudentId: 'student-A',
            _getCurrentStudent: () => studentA
        };
        FocusPanelHistory.init(mockPanel, {});
        FocusPanelRefinement.init(mockPanel, {}, { showNotification: vi.fn() });

        await FocusPanelRefinement.apply('concise');

        // Le promptHash ne doit pas avoir été recalculé sur la note 8/20 : l'alerte dirty reste active
        expect(studentA.promptHash).toBe(initialHash);
        expect(FocusPanelStatus.checkDirtyState(studentA)).toBe(true);
        expect(FocusPanelStatus.isBulkRefreshable(studentA, 'T1')).toBe(true);
    });

    it('protège une appréciation manuelle/dictée ou importée contre l\'actualisation de masse après un raffinement', async () => {
        const { PromptService } = await import('../services/PromptService.js');
        studentA.promptHash = PromptService.getPromptHash({
            ...studentA.studentData,
            id: studentA.id,
            currentPeriod: 'T1'
        });
        studentA.generationPeriod = 'T1';
        studentA.wasGenerated = false;
        studentA.appreciationSource = 'manual';

        AIService.callAIWithFallback.mockResolvedValue({
            text: 'Appréciation dictée puis peaufinée.',
            modelUsed: 'gemini-2.5-flash'
        });

        const mockPanel = {
            currentStudentId: 'student-A',
            _getCurrentStudent: () => studentA
        };
        FocusPanelHistory.init(mockPanel, {});
        FocusPanelRefinement.init(mockPanel, {}, { showNotification: vi.fn() });

        await FocusPanelRefinement.apply('polish');

        expect(studentA.appreciation).toBe('Appréciation dictée puis peaufinée.');
        expect(studentA.appreciationSource).toBe('manual');
        expect(studentA.wasGenerated).toBe(false);

        // Même si une note change ensuite, une saisie manuelle peaufinée ne doit jamais être écrasée en masse
        studentA.studentData.periods.T1.grade = 9;
        expect(FocusPanelStatus.checkDirtyState(studentA)).toBe(true);
        expect(FocusPanelStatus.isBulkRefreshable(studentA, 'T1')).toBe(false);
    });
});
