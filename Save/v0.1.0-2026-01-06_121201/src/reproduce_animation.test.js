import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResultCardsUI } from './src/managers/ResultCardsUIManager.js';
import { appState } from './src/state/State.js';
import { DOM } from './src/utils/DOM.js';
import { UIManager } from './src/managers/UIManager.js'; // We need to mock UI.animateTextTyping

// Mock dependencies
vi.mock('./src/state/State.js', () => ({
    appState: {
        currentPeriod: 'T1',
        subjects: { 'Français': {} },
        generatedResults: []
    }
}));

vi.mock('./src/utils/Utils.js', () => ({
    Utils: {
        getPeriods: () => ['T1'],
        getPeriodLabel: () => 'T1',
        getRelevantEvolution: () => null,
        countWords: () => 10,
        countCharacters: () => 50,
        decodeHtmlEntities: (t) => t,
        cleanMarkdown: (t) => t
    }
}));

// Mock UI
const mockUI = {
    animateTextTyping: vi.fn(() => Promise.resolve()),
    animateValue: vi.fn(() => Promise.resolve()),
    animateNumberWithText: vi.fn(() => Promise.resolve()),
    updateStats: vi.fn(),
    updateControlButtons: vi.fn(),
    updateAIButtonsState: vi.fn(),
    updateCopyAllButton: vi.fn(),
    initTooltips: vi.fn()
};

ResultCardsUI.init(mockUI);

describe('ResultCardsUIManager Animation Issue', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="resultsGrid"></div>';
        DOM.resultsDiv = document.getElementById('resultsGrid');
        vi.clearAllMocks();
    });

    it('should trigger animation when text changes and animate: true is passed', async () => {
        // Setup initial card
        const id = 'student1';
        const initialResult = {
            id,
            prenom: 'Jean',
            nom: 'Dupont',
            appreciation: 'Texte original',
            studentData: {
                periods: { 'T1': { grade: 10 } },
                currentPeriod: 'T1',
                statuses: []
            }
        };
        appState.generatedResults = [initialResult];

        // Create DOM element manually as if it was already rendered
        const card = document.createElement('div');
        card.className = 'appreciation-result';
        card.dataset.id = id;
        card.innerHTML = `
            <div class="card-content-wrapper">
                <div data-template="name">Jean Dupont</div>
                <div data-template="grades"></div>
                <div data-template="appreciation">Texte original</div>
                <div data-template="subject">Français</div>
                <div data-template="wordCount">2 mots</div>
                <button data-action="copy"><i class="fas fa-copy"></i></button>
            </div>
        `;
        DOM.resultsDiv.appendChild(card);

        // Update result in state
        initialResult.appreciation = 'Texte modifié';

        // Call updateResultCard with animate: true
        await ResultCardsUI.updateResultCard(id, { animate: true });

        // Expect animateTextTyping to be called
        expect(mockUI.animateTextTyping).toHaveBeenCalled();
    });

    it('should NOT trigger animation if text is identical, even if animate: true is passed (Current Behavior)', async () => {
        // Setup initial card
        const id = 'student2';
        const text = 'Même texte';
        const result = {
            id,
            prenom: 'Jean',
            nom: 'Dupont',
            appreciation: text,
            studentData: {
                periods: { 'T1': { grade: 10 } },
                currentPeriod: 'T1',
                statuses: []
            }
        };
        appState.generatedResults = [result];

        const card = document.createElement('div');
        card.className = 'appreciation-result';
        card.dataset.id = id;
        card.innerHTML = `
             <div class="card-content-wrapper">
                 <div data-template="appreciation">${text}</div>
             </div>
         `;
        DOM.resultsDiv.appendChild(card);

        // Call updateResultCard with animate: true, but text is same
        await ResultCardsUI.updateResultCard(id, { animate: true });

        // Expect animateTextTyping NOT to be called (based on code analysis)
        expect(mockUI.animateTextTyping).not.toHaveBeenCalled();
    });
});
