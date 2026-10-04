/**
 * @fileoverview Tests unitaires pour FocusPanelHistory
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FocusPanelHistory } from './FocusPanelHistory.js';
import { appState } from '../state/State.js';

vi.mock('../state/State.js', () => ({
    appState: {
        currentPeriod: 'T1',
        generatedResults: []
    }
}));

vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
}));

describe('FocusPanelHistory', () => {
    let mockResult;

    beforeEach(() => {
        appState.currentPeriod = 'T1';
        mockResult = {
            id: 'student-1',
            appreciation: 'Version 1',
            studentData: {
                currentAIModel: 'gemini-2.5-flash',
                periods: {
                    T1: {
                        appreciation: 'Version 1'
                    },
                    T2: {
                        appreciation: ''
                    }
                }
            },
            historyPerPeriod: {}
        };
        appState.generatedResults = [mockResult];

        document.body.innerHTML = `
            <div id="focusHistoryIndicator" class="history-indicator-btn">
                <span class="history-count">0</span>
            </div>
            <div id="focusAppreciationText" class="focus-appreciation-text filled">Version 1</div>
        `;

        FocusPanelHistory.init({
            onContentChange: vi.fn(),
            onHistoryChange: vi.fn()
        });
    });

    afterEach(() => {
        const popover = document.getElementById('historyPopover');
        if (popover) popover.remove();
        document.body.innerHTML = '';
        vi.clearAllMocks();
    });

    it('devrait charger un élève et retourner les infos de version', () => {
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('Version 1', 'original');
        FocusPanelHistory.push('Version 2', 'edit');

        const info = FocusPanelHistory.getCurrentVersionInfo();
        expect(info.total).toBe(2);
        expect(info.current).toBe(2);
        expect(FocusPanelHistory.canUndo()).toBe(true);
        expect(FocusPanelHistory.canRedo()).toBe(false);
    });

    it('ne devrait JAMAIS détruire l\'historique si l\'appréciation est temporairement vide', () => {
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('Version 1', 'original');
        FocusPanelHistory.push('Version 2', 'edit');

        // Simuler que l'utilisateur a effacé le texte
        mockResult.studentData.periods.T1.appreciation = '';
        mockResult.appreciation = '';

        const info = FocusPanelHistory.getCurrentVersionInfo();
        expect(info.total).toBe(2);
        expect(FocusPanelHistory.getVersionCount()).toBe(2);
    });

    it('devrait restaurer la version courante lors d\'un Undo si l\'éditeur a été vidé', () => {
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('Version 1', 'original');
        FocusPanelHistory.push('Version 2', 'edit');

        const textEl = document.getElementById('focusAppreciationText');
        textEl.textContent = '';
        textEl.classList.add('empty');

        FocusPanelHistory.undo();

        // Le texte est restauré et les périodes synchronisées
        expect(mockResult.appreciation).toBe('Version 2');
        expect(mockResult.studentData.periods.T1.appreciation).toBe('Version 2');
    });

    it('devrait basculer l\'affichage du popover (toggle) lors de clics successifs', () => {
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('Version 1', 'original');
        FocusPanelHistory.push('Version 2', 'edit');

        FocusPanelHistory.showPopover();
        expect(document.getElementById('historyPopover')).not.toBeNull();
        const indicator = document.getElementById('focusHistoryIndicator');
        expect(indicator.classList.contains('active')).toBe(true);

        // Deuxième appel : ferme le popover
        FocusPanelHistory.showPopover();
        expect(document.getElementById('historyPopover')).toBeNull();
        expect(indicator.classList.contains('active')).toBe(false);
    });

    it('devrait isoler l\'historique par période', () => {
        mockResult.studentData.periods.T1.appreciation = '';
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('T1 Version 1', 'original');
        FocusPanelHistory.push('T1 Version 2', 'edit');

        expect(FocusPanelHistory.getCurrentVersionInfo().total).toBe(2);

        // Bascule vers T2
        appState.currentPeriod = 'T2';
        FocusPanelHistory.load('student-1');

        expect(FocusPanelHistory.getCurrentVersionInfo().total).toBe(0);

        // Ajout d'une version en T2
        FocusPanelHistory.push('T2 Version 1', 'original');
        expect(FocusPanelHistory.getCurrentVersionInfo().total).toBe(1);

        // Revenir en T1
        appState.currentPeriod = 'T1';
        FocusPanelHistory.load('student-1');
        expect(FocusPanelHistory.getCurrentVersionInfo().total).toBe(2);
    });
});
