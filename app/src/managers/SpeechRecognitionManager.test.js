import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeechRecognitionManager, SpeechPunctuation } from './SpeechRecognitionManager';

// Mock DOM module — SpeechRecognitionManager no longer uses DOM.negativeInstructions.
// It now targets elements directly via _activeTarget / _insertTranscript.
vi.mock('../utils/DOM', () => ({
    DOM: {}
}));

describe('SpeechRecognitionManager', () => {
    let mockRecognition;
    let micBtn;

    beforeEach(() => {
        vi.clearAllMocks();

        // Create mic button in DOM
        document.body.innerHTML = '<button id="micInputBtn"></button>';
        micBtn = document.getElementById('micInputBtn');

        // Mock SpeechRecognition
        mockRecognition = {
            start: vi.fn(),
            stop: vi.fn(),
            lang: '',
            continuous: false,
            interimResults: false,
            onstart: null,
            onend: null,
            onresult: null,
            onerror: null
        };

        // Mock Constructor
        window.SpeechRecognition = vi.fn(() => mockRecognition);
        window.webkitSpeechRecognition = window.SpeechRecognition;
    });

    afterEach(() => {
        delete window.SpeechRecognition;
        delete window.webkitSpeechRecognition;
        document.body.innerHTML = '';
        SpeechRecognitionManager._recognition = null;
        SpeechRecognitionManager._isRecording = false;
        SpeechRecognitionManager._isSupported = false;
    });

    it('should initialize correctly when supported', () => {
        SpeechRecognitionManager.init();
        expect(window.SpeechRecognition).toHaveBeenCalled();
        expect(mockRecognition.lang).toBe('fr-FR');
        expect(mockRecognition.continuous).toBe(true);
        expect(mockRecognition.interimResults).toBe(true);
    });

    it('should be supported when SpeechRecognition exists', () => {
        SpeechRecognitionManager.init();
        expect(SpeechRecognitionManager.isSupported()).toBe(true);
    });

    it('should not be recording initially', () => {
        SpeechRecognitionManager.init();
        expect(SpeechRecognitionManager.isRecording()).toBe(false);
    });

    it('should hide button if not supported', () => {
        delete window.SpeechRecognition;
        delete window.webkitSpeechRecognition;

        // init() now uses #focusMicBtn and #focusAppreciationMicBtn
        document.body.innerHTML = '<button id="focusMicBtn"></button><button id="focusAppreciationMicBtn"></button>';
        const focusMicBtn = document.getElementById('focusMicBtn');

        SpeechRecognitionManager.init();

        expect(focusMicBtn.style.display).toBe('none');
    });

    it('should support dynamic setupButton for journal note dictation', () => {
        document.body.innerHTML = `
            <button id="journalMicBtn"></button>
            <textarea id="journalNoteInput"></textarea>
        `;
        const journalMicBtn = document.getElementById('journalMicBtn');
        const journalNoteInput = document.getElementById('journalNoteInput');

        SpeechRecognitionManager.init();
        SpeechRecognitionManager.setupButton(journalMicBtn, 'journal');

        // Click to start recording
        journalMicBtn.click();
        expect(mockRecognition.start).toHaveBeenCalled();

        // Simulate voice result
        mockRecognition.onstart();
        mockRecognition.onresult({
            resultIndex: 0,
            results: [[{ transcript: 'Élève très motivé' }]]
        });
        mockRecognition.results = [[{ transcript: 'Élève très motivé' }]];
        // Call result directly with isFinal
        mockRecognition.onresult({
            resultIndex: 0,
            results: [{ 0: { transcript: 'Élève très motivé' }, isFinal: true }]
        });

        expect(journalNoteInput.value).toBe('Élève très motivé');
    });

    it('should stream interim ghost-text and commit final text in context input', () => {
        document.body.innerHTML = `
            <button id="focusMicBtn"></button>
            <textarea id="focusContextInput"></textarea>
        `;
        const focusMicBtn = document.getElementById('focusMicBtn');
        const focusContextInput = document.getElementById('focusContextInput');

        SpeechRecognitionManager.init();
        focusMicBtn.click();
        mockRecognition.onstart();

        expect(SpeechRecognitionManager.isRecording()).toBe(true);

        // Interim result arrives
        mockRecognition.onresult({
            resultIndex: 0,
            results: [{ 0: { transcript: 'en progrès' }, isFinal: false }]
        });

        expect(focusContextInput.value).toBe('En progrès');

        // Final result arrives
        mockRecognition.onresult({
            resultIndex: 0,
            results: [{ 0: { transcript: 'en progrès régulier point' }, isFinal: true }]
        });

        expect(focusContextInput.value).toBe('En progrès régulier.');

        // Stop recording
        SpeechRecognitionManager.stop();
        expect(mockRecognition.stop).toHaveBeenCalled();
        expect(SpeechRecognitionManager.isRecording()).toBe(false);
    });

    describe('SpeechPunctuation', () => {
        it('should format spoken punctuation commands properly', () => {
            expect(SpeechPunctuation.format('élève sérieux virgule bon travail point')).toBe('Élève sérieux, bon travail.');
            expect(SpeechPunctuation.format('attention aux bavardages point d\'exclamation')).toBe('Attention aux bavardages !');
            expect(SpeechPunctuation.format('quels sont les objectifs point d\'interrogation')).toBe('Quels sont les objectifs ?');
            expect(SpeechPunctuation.format('points forts deux points travail et rigueur')).toBe('Points forts : travail et rigueur');
            expect(SpeechPunctuation.format('titre à la ligne suite du texte')).toBe('Titre\nSuite du texte');
            expect(SpeechPunctuation.format('paragraphe un nouveau paragraphe paragraphe deux')).toBe('Paragraphe un\n\nParagraphe deux');
        });

        it('should format semicolons, ellipsis, and handle edge cases', () => {
            expect(SpeechPunctuation.format('premier trimestre point-virgule deuxième trimestre')).toBe('Premier trimestre ; deuxième trimestre');
            expect(SpeechPunctuation.format('à suivre points de suspension')).toBe('À suivre...');
            expect(SpeechPunctuation.format('test   virgule   encore point')).toBe('Test, encore.');
            expect(SpeechPunctuation.format('')).toBe('');
            expect(SpeechPunctuation.format(null)).toBe('');
        });
    });
});

