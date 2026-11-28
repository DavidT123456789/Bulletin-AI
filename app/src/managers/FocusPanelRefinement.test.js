/**
 * @fileoverview Tests unitaires pour FocusPanelRefinement (bascule réversible de ton, cache 0 ms, consigne libre et dossier)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FocusPanelRefinement } from './FocusPanelRefinement.js';
import { FocusPanelHistory } from './FocusPanelHistory.js';
import { FocusPanelStatus } from './FocusPanelStatus.js';
import { AIService } from '../services/AIService.js';
import { PromptService } from '../services/PromptService.js';
import { StorageManager } from './StorageManager.js';
import { HistoryManager } from './HistoryManager.js';
import { appState } from '../state/State.js';

describe('FocusPanelRefinement', () => {
    let mockPanel;
    let mockUI;
    let student;

    const mountDOM = (text = 'Travail sérieux et régulier ce semestre.') => {
        document.body.innerHTML = `
            <div class="focus-appreciation">
                <div id="focusAppreciationBadge" class="appreciation-status-badge"></div>
                <div id="historyNavigationGroup" style="display: none;">
                    <button type="button" id="focusHistoryPrevBtn"></button>
                    <button type="button" id="focusHistoryIndicator"><span class="history-count">0</span></button>
                    <button type="button" id="focusHistoryNextBtn"></button>
                </div>
                <span id="focusWordCount"></span>
                <span id="focusAiIndicator"></span>
                <div id="focusAppreciationText" contenteditable="true">${text}</div>
                <div class="focus-audio-group">
                    <button type="button" id="focusPolishBtn" class="focus-polish-btn" data-refine-type="polish">Peaufiner</button>
                    <button type="button" id="focusAppreciationSpeakBtn"></button>
                    <button type="button" id="focusAppreciationMicBtn"></button>
                </div>
                <div id="focusRefinementOptions" class="focus-refinement-options">
                    <div class="focus-refinement-chips">
                        <button type="button" class="btn btn-ai-outline" data-refine-type="concise">Raccourcir</button>
                        <button type="button" class="btn btn-ai-outline" data-refine-type="encouraging" aria-pressed="false">Encourageante</button>
                        <button type="button" class="btn btn-ai-outline" data-refine-type="demanding" aria-pressed="false">Exigeante</button>
                        <button type="button" id="focusCustomRefineTrigger" class="btn btn-ai-outline">Préciser…</button>
                    </div>
                    <div class="focus-custom-refine-bar" id="focusCustomRefineBar">
                        <input type="text" id="focusCustomRefineInput" />
                        <button type="button" id="focusCustomRefineSubmitBtn" class="disabled"></button>
                        <button type="button" id="focusCustomRefineCloseBtn"></button>
                    </div>
                </div>
                <button type="button" id="focusCopyBtn"><span class="btn-copy-label">Copier</span></button>
                <button type="button" id="focusGenerateBtn"></button>
            </div>
        `;
    };

    beforeEach(() => {
        appState.currentPeriod = 'S2';
        appState.currentClassId = 'class-1';
        appState.anonymizeData = true;

        const baseText = 'Sophie montre des progrès notables ce semestre.';
        student = {
            id: 'stu-1',
            classId: 'class-1',
            nom: 'DURAND',
            prenom: 'Sophie',
            appreciation: baseText,
            wasGenerated: true,
            appreciationSource: 'ai',
            generationPeriod: 'S2',
            historyPerPeriod: {},
            studentData: {
                nom: 'DURAND',
                prenom: 'Sophie',
                statuses: [],
                periods: {
                    S1: { grade: 11.5, appreciation: 'Trimestre correct.' },
                    S2: {
                        grade: 14.0,
                        context: 'Travail plus régulier, gagne en confiance à l\'oral.',
                        appreciation: baseText
                    }
                }
            }
        };
        appState.generatedResults = [student];

        mountDOM(baseText);

        mockUI = {
            checkAPIKeyPresence: vi.fn(() => true),
            showNotification: vi.fn(),
            showInlineSpinner: vi.fn(),
            hideInlineSpinner: vi.fn(),
            updateTooltip: vi.fn((el, text) => el?.setAttribute('data-tooltip', text)),
            initTooltips: vi.fn(),
            updateStats: vi.fn()
        };

        mockPanel = {
            currentStudentId: 'stu-1',
            _activeGenerations: new Map(),
            _activeGenerationStartTime: 0,
            _isAppreciationEdited: false,
            _initialAppreciationHtml: baseText,
            _cancelGenerationForStudent: vi.fn(),
            _updateGenerateButton: vi.fn(),
            _updateListRow: vi.fn(),
            _prepareStudentData: (id, period, res) => ({
                id,
                classId: res.classId,
                nom: res.nom,
                prenom: res.prenom,
                statuses: res.studentData.statuses,
                periods: res.studentData.periods,
                currentPeriod: period
            })
        };

        FocusPanelStatus.init({
            getCurrentStudentId: () => mockPanel.currentStudentId,
            getActiveGenerations: () => mockPanel._activeGenerations,
            onUpdateGenerateButton: mockPanel._updateGenerateButton,
            onUpdateListRow: mockPanel._updateListRow
        });

        FocusPanelHistory.init(mockPanel, {
            onContentChange: (content) => {
                document.getElementById('focusAppreciationText').textContent = content;
                FocusPanelStatus.updateWordCount();
                FocusPanelStatus.syncAppreciationToResult(content);
                FocusPanelStatus.syncRefinementStates(student);
            },
            onHistoryChange: () => {
                FocusPanelStatus.updateHistoryIndicator();
            }
        });
        FocusPanelHistory.load('stu-1', 'S2');

        FocusPanelRefinement.init(mockPanel, mockUI);

        vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});
    });

    afterEach(() => {
        FocusPanelHistory.reset();
        HistoryManager.destroy();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('bascule Encourageante ↔ Exigeante depuis le texte de base sans effet téléphone arabe et annule au re-clic sans appel API', async () => {
        vi.useFakeTimers();
        try {
            const callSpy = vi.spyOn(AIService, 'callAIWithFallback')
                .mockResolvedValueOnce({ text: '[PRÉNOM] réalise de très beaux progrès grâce à son sérieux.' })
                .mockResolvedValueOnce({ text: '[PRÉNOM] progresse mais doit encore gagner en rigueur.' });
            const promptSpy = vi.spyOn(PromptService, 'getRefinementPrompts');

            // 1. Clic sur Encourageante -> appel IA avec le texte de base + dossier élève
            await FocusPanelRefinement.apply('encouraging');
            expect(callSpy).toHaveBeenCalledTimes(1);
            expect(promptSpy).toHaveBeenLastCalledWith(
                'encouraging',
                'Sophie montre des progrès notables ce semestre.',
                expect.objectContaining({
                    studentData: expect.objectContaining({ id: 'stu-1' }),
                    currentPeriod: 'S2'
                })
            );
            expect(student.studentData.periods.S2.appreciation).toBe('Sophie réalise de très beaux progrès grâce à son sérieux.');

            const encouragingBtn = document.querySelector('[data-refine-type="encouraging"]');
            const demandingBtn = document.querySelector('[data-refine-type="demanding"]');
            expect(encouragingBtn.classList.contains('active')).toBe(true);
            expect(encouragingBtn.getAttribute('aria-pressed')).toBe('true');

            // 2. Clic sur Exigeante pendant qu'Encourageante est actif -> repart du texte de BASE (pas du texte encourageant !)
            await FocusPanelRefinement.apply('demanding');
            expect(callSpy).toHaveBeenCalledTimes(2);
            expect(promptSpy).toHaveBeenLastCalledWith(
                'demanding',
                'Sophie montre des progrès notables ce semestre.',
                expect.any(Object)
            );
            expect(student.studentData.periods.S2.appreciation).toBe('Sophie progresse mais doit encore gagner en rigueur.');
            expect(demandingBtn.classList.contains('active')).toBe(true);
            expect(encouragingBtn.classList.contains('active')).toBe(false);

            // 3. Re-clic sur Encourageante -> bascule instantanée depuis l'historique (0 appel API supplémentaire)
            await FocusPanelRefinement.apply('encouraging');
            vi.advanceTimersByTime(600);
            expect(callSpy).toHaveBeenCalledTimes(2);
            expect(student.studentData.periods.S2.appreciation).toBe('Sophie réalise de très beaux progrès grâce à son sérieux.');
            expect(encouragingBtn.classList.contains('active')).toBe(true);

            // 4. Re-clic sur Encourageante (déjà active) -> retour instantané à la version de base (0 appel API)
            await FocusPanelRefinement.apply('encouraging');
            vi.advanceTimersByTime(600);
            expect(callSpy).toHaveBeenCalledTimes(2);
            expect(student.studentData.periods.S2.appreciation).toBe('Sophie montre des progrès notables ce semestre.');
            expect(encouragingBtn.classList.contains('active')).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it('permet de cumuler Raccourcir par-dessus Encourageante sans écraser le ton', async () => {
        const callSpy = vi.spyOn(AIService, 'callAIWithFallback')
            .mockResolvedValueOnce({ text: '[PRÉNOM] réalise de très beaux progrès grâce à son sérieux.' })
            .mockResolvedValueOnce({ text: 'Beaux progrès grâce au sérieux de [PRÉNOM].' });
        const promptSpy = vi.spyOn(PromptService, 'getRefinementPrompts');

        await FocusPanelRefinement.apply('encouraging');
        await FocusPanelRefinement.apply('concise');

        expect(callSpy).toHaveBeenCalledTimes(2);
        // Raccourcir s'applique bien sur la version encourageante affichée
        expect(promptSpy).toHaveBeenLastCalledWith(
            'concise',
            'Sophie réalise de très beaux progrès grâce à son sérieux.',
            expect.any(Object)
        );
        expect(student.studentData.periods.S2.appreciation).toBe('Beaux progrès grâce au sérieux de Sophie.');
        expect(document.querySelector('[data-refine-type="encouraging"]').classList.contains('active')).toBe(false);
    });

    it('applique une consigne libre, enregistre son intitulé dans l\'historique et referme la barre en cas de succès (tout en préservant la saisie en cas d\'erreur)', async () => {
        const callSpy = vi.spyOn(AIService, 'callAIWithFallback')
            .mockRejectedValueOnce(new Error('Erreur réseau temporaire'))
            .mockResolvedValueOnce({ text: '[PRÉNOM] progresse en TP et gagne en confiance à l\'oral.' });

        FocusPanelRefinement.openCustomInput();
        const input = document.getElementById('focusCustomRefineInput');
        expect(FocusPanelRefinement.isCustomInputOpen()).toBe(true);

        input.value = 'Insister sur son sérieux en TP';
        FocusPanelRefinement._syncCustomSubmitState();

        // 1. En cas d'erreur -> la barre reste ouverte et la saisie est conservée
        await FocusPanelRefinement.applyCustom();
        expect(mockUI.showNotification).toHaveBeenCalledWith('Erreur réseau temporaire', 'error');
        expect(FocusPanelRefinement.isCustomInputOpen()).toBe(true);
        expect(input.value).toBe('Insister sur son sérieux en TP');
        expect(input.disabled).toBe(false);

        // 2. Au second essai réussi -> la barre se referme et se vide, l'historique garde l'intitulé
        await FocusPanelRefinement.applyCustom();
        expect(callSpy).toHaveBeenCalledTimes(2);
        expect(FocusPanelRefinement.isCustomInputOpen()).toBe(false);
        expect(input.value).toBe('');
        expect(student.studentData.periods.S2.appreciation).toBe('Sophie progresse en TP et gagne en confiance à l\'oral.');

        const latest = FocusPanelHistory.getCurrentVersion('S2', 'stu-1');
        expect(latest.source).toBe('custom');
        expect(latest.customInstruction).toBe('Insister sur son sérieux en TP');
    });

    it('referme la barre de consigne libre si l\'enseignant lance une autre retouche (ex. Peaufiner) tout en gardant le brouillon', async () => {
        vi.spyOn(AIService, 'callAIWithFallback')
            .mockResolvedValueOnce({ text: '[PRÉNOM] progresse régulièrement ce semestre.' });

        FocusPanelRefinement.openCustomInput();
        const input = document.getElementById('focusCustomRefineInput');
        input.value = 'Mentionner son exposé';
        expect(FocusPanelRefinement.isCustomInputOpen()).toBe(true);

        await FocusPanelRefinement.apply('polish');
        expect(FocusPanelRefinement.isCustomInputOpen()).toBe(false);
        expect(input.value).toBe('Mentionner son exposé');
        expect(HistoryManager.isOpen('focusCustomRefine')).toBe(false);
    });

    it('ferme la barre de consigne libre sur Retour mobile (popstate) sans fermer le Focus Panel et nettoie l\'historique à la fermeture manuelle', () => {
        const panelCloseCb = vi.fn();
        HistoryManager.pushState('focusPanel', panelCloseCb);

        FocusPanelRefinement.openCustomInput();
        const input = document.getElementById('focusCustomRefineInput');
        expect(FocusPanelRefinement.isCustomInputOpen()).toBe(true);
        expect(HistoryManager.isOpen('focusCustomRefine')).toBe(true);
        expect(document.activeElement).toBe(input);

        // 1. Retour mobile -> ferme uniquement la barre de consigne libre
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        expect(FocusPanelRefinement.isCustomInputOpen()).toBe(false);
        expect(HistoryManager.isOpen('focusCustomRefine')).toBe(false);
        expect(panelCloseCb).not.toHaveBeenCalled();
        expect(document.activeElement).not.toBe(input);

        // 2. Fermeture manuelle -> dépile proprement sans laisser d'entrée fantôme
        FocusPanelRefinement.openCustomInput();
        expect(HistoryManager.isOpen('focusCustomRefine')).toBe(true);
        const manualCloseSpy = vi.spyOn(HistoryManager, 'handleManualClose');
        FocusPanelRefinement.closeCustomInput({ restoreFocus: true });
        expect(manualCloseSpy).toHaveBeenCalledWith('focusCustomRefine');
        expect(HistoryManager.isOpen('focusCustomRefine')).toBe(false);

        // 3. Vidage manuel de l'appréciation -> nettoie aussi l'entrée HistoryManager
        FocusPanelRefinement.openCustomInput();
        expect(HistoryManager.isOpen('focusCustomRefine')).toBe(true);
        document.getElementById('focusAppreciationText').textContent = '';
        FocusPanelStatus.updateWordCount();
        expect(FocusPanelRefinement.isCustomInputOpen()).toBe(false);
        expect(HistoryManager.isOpen('focusCustomRefine')).toBe(false);
    });

    it('annule d\'abord la génération sur Retour mobile si une retouche libre est en cours, puis ferme la barre au second Retour', async () => {
        vi.spyOn(AIService, 'callAIWithFallback').mockImplementation((_prompt, { signal }) => new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
                const err = new Error('Annulé');
                err.name = 'AbortError';
                reject(err);
            });
        }));

        mockPanel._cancelGenerationForStudent = vi.fn((studentId, { restoreUI = true } = {}) => {
            const controller = mockPanel._activeGenerations.get(studentId);
            if (!controller) return;
            mockPanel._activeGenerations.delete(studentId);
            controller.abort();
            if (restoreUI) {
                const submitBtn = document.getElementById('focusCustomRefineSubmitBtn');
                submitBtn?.classList.remove('is-generating');
            }
        });

        FocusPanelRefinement.openCustomInput();
        const input = document.getElementById('focusCustomRefineInput');
        input.value = 'Parler des TP';

        const pendingApply = FocusPanelRefinement.applyCustom();
        expect(mockPanel._activeGenerations.has('stu-1')).toBe(true);
        expect(document.getElementById('focusCustomRefineSubmitBtn').classList.contains('is-generating')).toBe(true);

        // 1er Retour : annule la génération, garde la barre ouverte et la pile synchronisée
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        await pendingApply;
        expect(mockPanel._cancelGenerationForStudent).toHaveBeenCalledWith('stu-1');
        expect(FocusPanelRefinement.isCustomInputOpen()).toBe(true);
        expect(input.value).toBe('Parler des TP');
        expect(HistoryManager.isOpen('focusCustomRefine')).toBe(true);

        // 2e Retour : referme la barre de consigne libre
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        expect(FocusPanelRefinement.isCustomInputOpen()).toBe(false);
        expect(HistoryManager.isOpen('focusCustomRefine')).toBe(false);
    });
});
