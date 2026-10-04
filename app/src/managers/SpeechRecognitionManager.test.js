import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeechRecognitionManager, SpeechPunctuation } from './SpeechRecognitionManager';
import { FocusPanelManager } from './FocusPanelManager.js';
import { FocusPanelHistory } from './FocusPanelHistory.js';
import { appState } from '../state/State.js';
import { UI } from './UIManager.js';

// Mock DOM module — SpeechRecognitionManager no longer uses DOM.negativeInstructions.
// It now targets elements directly via _activeTarget / _insertTranscript.
vi.mock('../utils/DOM', () => ({
    DOM: {}
}));

vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
}));

const finalResult = (text) => ({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: true }] });
const interimResult = (text) => ({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: false }] });

describe('SpeechRecognitionManager', () => {
    let mockRecognition;
    let originalStudentId;

    /** Monte les champs/boutons du Focus Panel et démarre une dictée sur la cible demandée */
    const startDictation = (target = 'context') => {
        document.body.innerHTML = `
            <button id="focusMicBtn"></button>
            <textarea id="focusContextInput"></textarea>
            <button id="focusAppreciationMicBtn"></button>
            <div id="focusAppreciationText" class="empty" contenteditable="true"></div>
            <button id="focusGenerateBtn"></button>
        `;
        SpeechRecognitionManager.init();
        const btnId = target === 'appreciation' ? 'focusAppreciationMicBtn' : 'focusMicBtn';
        document.getElementById(btnId).click();
        mockRecognition.onstart();
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        originalStudentId = FocusPanelManager.currentStudentId;

        // Mock SpeechRecognition
        mockRecognition = {
            start: vi.fn(),
            stop: vi.fn(),
            abort: vi.fn(),
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
        vi.useRealTimers();
        SpeechRecognitionManager.abort();
        FocusPanelManager.currentStudentId = originalStudentId;
        delete window.SpeechRecognition;
        delete window.webkitSpeechRecognition;
        document.body.innerHTML = '';
        SpeechRecognitionManager._recognition = null;
        SpeechRecognitionManager._isRecording = false;
        SpeechRecognitionManager._isSupported = false;
        vi.restoreAllMocks();
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

        mockRecognition.onstart();
        mockRecognition.onresult(finalResult('Élève très motivé'));

        expect(journalNoteInput.value).toBe('Élève très motivé');
    });

    it('should truncate journal dictation to the note limit', () => {
        document.body.innerHTML = `
            <button id="journalMicBtn"></button>
            <textarea id="journalNoteInput"></textarea>
        `;
        const journalMicBtn = document.getElementById('journalMicBtn');

        SpeechRecognitionManager.init();
        SpeechRecognitionManager.setupButton(journalMicBtn, 'journal');
        journalMicBtn.click();
        mockRecognition.onstart();
        mockRecognition.onresult(finalResult('a'.repeat(400)));

        expect(document.getElementById('journalNoteInput').value).toHaveLength(280);
    });

    it('should stream interim ghost-text and commit final text in context input', () => {
        startDictation('context');
        const focusContextInput = document.getElementById('focusContextInput');

        expect(SpeechRecognitionManager.isRecording()).toBe(true);

        // Interim result arrives
        mockRecognition.onresult(interimResult('en progrès'));
        expect(focusContextInput.value).toBe('En progrès');

        // Final result arrives
        mockRecognition.onresult(finalResult('en progrès régulier point'));
        expect(focusContextInput.value).toBe('En progrès régulier.');

        // Stop recording
        SpeechRecognitionManager.stop();
        expect(mockRecognition.stop).toHaveBeenCalled();
        expect(SpeechRecognitionManager.isRecording()).toBe(false);
    });

    it('should not capitalize a segment that continues the current sentence', () => {
        document.body.innerHTML = '<button id="focusMicBtn"></button><textarea id="focusContextInput">Élève sérieux</textarea>';
        SpeechRecognitionManager.init();
        document.getElementById('focusMicBtn').click();
        mockRecognition.onstart();

        mockRecognition.onresult(finalResult('et appliqué point'));
        mockRecognition.onresult(finalResult('bon trimestre'));

        expect(document.getElementById('focusContextInput').value).toBe('Élève sérieux et appliqué. Bon trimestre');
    });

    it('should keep the last words that arrive after stop()', () => {
        startDictation('context');
        const input = document.getElementById('focusContextInput');

        SpeechRecognitionManager.stop();
        mockRecognition.onresult(finalResult('dernier mot'));
        mockRecognition.onend();

        expect(input.value).toBe('Dernier mot');
        expect(UI.showNotification).toHaveBeenCalledWith('Dictée vocale enregistrée', 'success');
    });

    it('should commit pending interim text when the session ends', () => {
        startDictation('context');
        const input = document.getElementById('focusContextInput');

        mockRecognition.onresult(interimResult('mots en cours'));
        SpeechRecognitionManager.stop();
        mockRecognition.onend();

        expect(input.value).toBe('Mots en cours');
    });

    it('should force-close the session if onend never fires after stop()', () => {
        vi.useFakeTimers();
        startDictation('context');
        const btn = document.getElementById('focusMicBtn');
        expect(btn.classList.contains('recording')).toBe(true);

        SpeechRecognitionManager.stop();
        expect(btn.classList.contains('recording')).toBe(true);

        vi.advanceTimersByTime(1500);
        expect(btn.classList.contains('recording')).toBe(false);
    });

    it('should abort immediately and discard interim text', () => {
        startDictation('context');
        const input = document.getElementById('focusContextInput');
        const btn = document.getElementById('focusMicBtn');

        mockRecognition.onresult(interimResult('mots perdus'));
        SpeechRecognitionManager.abort();

        expect(mockRecognition.abort).toHaveBeenCalled();
        expect(input.value).toBe('');
        expect(btn.classList.contains('recording')).toBe(false);
        expect(SpeechRecognitionManager.isRecording()).toBe(false);
    });

    it('should preserve manual edits made while dictating', () => {
        startDictation('context');
        const input = document.getElementById('focusContextInput');

        mockRecognition.onresult(finalResult('bonjour'));
        input.value = 'Bonjour tout le monde';
        mockRecognition.onresult(finalResult('merci'));

        expect(input.value).toBe('Bonjour tout le monde merci');
    });

    it('should never write dictated text to another student', () => {
        FocusPanelManager.currentStudentId = 'student-a';
        startDictation('context');
        const input = document.getElementById('focusContextInput');

        FocusPanelManager.currentStudentId = 'student-b';
        mockRecognition.onresult(finalResult('texte égaré'));

        expect(input.value).toBe('');
        expect(mockRecognition.abort).toHaveBeenCalled();
    });

    it('should stream and commit dictation in the appreciation field', () => {
        startDictation('appreciation');
        const field = document.getElementById('focusAppreciationText');
        const onInput = vi.fn();
        field.addEventListener('input', onInput);

        mockRecognition.onresult(interimResult('très bon'));
        expect(field.querySelector('.dictation-interim')?.textContent).toBe('Très bon');

        mockRecognition.onresult(finalResult('très bon trimestre'));
        expect(field.querySelector('.dictation-interim')).toBeNull();
        expect(field.textContent).toBe('Très bon trimestre');
        expect(field.classList.contains('empty')).toBe(false);
        expect(onInput).toHaveBeenCalled();
    });

    it('should purge phantom br tags and whitespace in empty appreciation field so interim text starts on first line', () => {
        startDictation('appreciation');
        const field = document.getElementById('focusAppreciationText');
        field.innerHTML = '<br>'; // Simulate browser contenteditable bogus BR

        mockRecognition.onresult(interimResult('salut tout le monde'));
        expect(field.querySelector('br')).toBeNull();
        expect(field.firstChild?.className).toBe('dictation-interim');
        expect(field.querySelector('.dictation-interim')?.textContent).toBe('Salut tout le monde');
    });

    it('should switch target only once the previous session has ended', () => {
        startDictation('context');
        const appreciationBtn = document.getElementById('focusAppreciationMicBtn');

        appreciationBtn.click();
        expect(mockRecognition.stop).toHaveBeenCalled();
        expect(mockRecognition.start).toHaveBeenCalledTimes(1);

        mockRecognition.onend();
        expect(mockRecognition.start).toHaveBeenCalledTimes(2);

        mockRecognition.onstart();
        expect(appreciationBtn.classList.contains('recording')).toBe(true);
        expect(document.getElementById('focusMicBtn').classList.contains('recording')).toBe(false);
    });

    describe('microphone errors', () => {
        it.each([
            ['not-allowed', 'Accès au microphone refusé'],
            ['audio-capture', 'Aucun microphone détecté'],
            ['service-not-allowed', "n'est pas autorisée"],
            ['network', 'Erreur réseau'],
            ['unexpected', 'Erreur de reconnaissance vocale']
        ])('should notify the user on "%s"', (error, expected) => {
            startDictation('context');

            mockRecognition.onerror({ error });

            expect(UI.showNotification).toHaveBeenCalledWith(expect.stringContaining(expected), 'error');
            expect(SpeechRecognitionManager.isRecording()).toBe(false);
            expect(document.getElementById('focusMicBtn').classList.contains('recording')).toBe(false);
        });

        it('should ignore the "aborted" error', () => {
            startDictation('context');

            mockRecognition.onerror({ error: 'aborted' });

            expect(UI.showNotification).not.toHaveBeenCalled();
            expect(SpeechRecognitionManager.isRecording()).toBe(true);
        });

        it('should tolerate short pauses but stop the microphone after prolonged silence', () => {
            startDictation('context');

            for (let i = 0; i < 3; i++) mockRecognition.onerror({ error: 'no-speech' });
            expect(SpeechRecognitionManager.isRecording()).toBe(true);
            expect(mockRecognition.stop).not.toHaveBeenCalled();

            mockRecognition.onerror({ error: 'no-speech' });
            expect(mockRecognition.stop).toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalledWith('Dictée arrêtée : aucune voix détectée.', 'info');
        });

        it('should restart listening on onend while the user has not stopped', () => {
            startDictation('context');

            mockRecognition.onend();

            expect(mockRecognition.start).toHaveBeenCalledTimes(2);
            expect(SpeechRecognitionManager.isRecording()).toBe(true);
        });
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

        it('should leave decimal numbers and times untouched', () => {
            expect(SpeechPunctuation.format('moyenne de 12,5 ce trimestre')).toBe('Moyenne de 12,5 ce trimestre');
            expect(SpeechPunctuation.format('moyenne de 12.5')).toBe('Moyenne de 12.5');
            expect(SpeechPunctuation.format('rendez-vous à 10:30')).toBe('Rendez-vous à 10:30');
            expect(SpeechPunctuation.format('12,5 virgule bon travail')).toBe('12,5, bon travail');
        });

        it('should only capitalize the start when the segment begins a sentence', () => {
            expect(SpeechPunctuation.format('régulier point', { capitalizeStart: false })).toBe('régulier.');
            expect(SpeechPunctuation.format('bon travail point félicitations', { capitalizeStart: false })).toBe('bon travail. Félicitations');
        });

        it('should not convert the word point in phrases like point fort or point faible', () => {
            expect(SpeechPunctuation.format('un point fort en calcul point')).toBe('Un point fort en calcul.');
            expect(SpeechPunctuation.format('point faible en rédaction virgule faire le point point')).toBe('Point faible en rédaction, faire le point.');
        });
    });

    describe('Button Icon Toggle (Stop / Mic)', () => {
        it('should swap the button icon to a STOP icon while recording and restore it when stopped', () => {
            startDictation('context');
            const btn = document.getElementById('focusMicBtn');
            expect(btn.innerHTML).toContain('<rect');
            expect(btn.classList.contains('recording')).toBe(true);

            SpeechRecognitionManager.stop();
            mockRecognition.onend();
            expect(btn.innerHTML).not.toContain('<rect');
        });
    });

    describe('Page Visibility', () => {
        it('should stop recording when the document becomes hidden', () => {
            startDictation('context');
            expect(SpeechRecognitionManager.isRecording()).toBe(true);

            // Simulate tab change
            Object.defineProperty(document, 'hidden', { value: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));

            expect(mockRecognition.stop).toHaveBeenCalled();
            // Restore document.hidden
            Object.defineProperty(document, 'hidden', { value: false, configurable: true });
        });
    });

    describe('Generate Button State During Dictation', () => {
        it('should disable and grey out focusGenerateBtn during appreciation dictation and restore it when stopped', () => {
            startDictation('appreciation');
            const genBtn = document.getElementById('focusGenerateBtn');
            expect(genBtn.disabled).toBe(true);
            expect(genBtn.classList.contains('disabled')).toBe(true);

            SpeechRecognitionManager.stop();
            mockRecognition.onend();
            expect(genBtn.disabled).toBe(false);
            expect(genBtn.classList.contains('disabled')).toBe(false);
        });

        it('should not disable focusGenerateBtn when dictating in context field', () => {
            startDictation('context');
            const genBtn = document.getElementById('focusGenerateBtn');
            expect(genBtn.disabled).toBe(false);
        });
    });

    describe('Sticky Punctuation After Pause', () => {
        it('should attach a delayed period directly to preceding text without leading space', () => {
            startDictation('context');
            const input = document.getElementById('focusContextInput');

            // User dictates first segment, then pauses
            mockRecognition.onresult(finalResult('très bon trimestre'));
            expect(input.value).toBe('Très bon trimestre');

            // After a pause, user says "point"
            mockRecognition.onresult(finalResult('point'));
            expect(input.value).toBe('Très bon trimestre.');
        });

        it('should attach a delayed comma directly to preceding text without leading space', () => {
            startDictation('context');
            const input = document.getElementById('focusContextInput');

            mockRecognition.onresult(finalResult('attention aux bavardages'));
            expect(input.value).toBe('Attention aux bavardages');

            mockRecognition.onresult(finalResult('virgule des progrès sont attendus'));
            expect(input.value).toBe('Attention aux bavardages, des progrès sont attendus');
        });

        it('should attach interim punctuation without space in appreciation field', () => {
            startDictation('appreciation');
            const field = document.getElementById('focusAppreciationText');

            mockRecognition.onresult(finalResult('bon investissement'));
            expect(field.textContent).toBe('Bon investissement');

            mockRecognition.onresult(interimResult('point'));
            expect(field.textContent).toBe('Bon investissement.');

            mockRecognition.onresult(finalResult('point'));
            expect(field.textContent).toBe('Bon investissement.');
        });
    });

    describe('Dictation History & Error State Management', () => {
        let testStudent;

        beforeEach(() => {
            testStudent = {
                id: 'student-123',
                errorMessage: 'Clé API Mistral manquante. Veuillez la configurer dans les paramètres.',
                errorPeriod: 'T1',
                appreciation: '',
                wasGenerated: false,
                appreciationSource: null,
                studentData: {
                    periods: {
                        T1: { appreciation: '', grade: 14 }
                    }
                }
            };
            appState.generatedResults = [testStudent];
            appState.currentPeriod = 'T1';
            FocusPanelManager.currentStudentId = 'student-123';
            vi.spyOn(FocusPanelHistory, 'push').mockImplementation(() => {});
        });

        it('should clear errorMessage and errorPeriod when dictating into appreciation field', () => {
            startDictation('appreciation');
            expect(testStudent.errorMessage).toBe('Clé API Mistral manquante. Veuillez la configurer dans les paramètres.');

            mockRecognition.onresult(finalResult('très bon travail'));
            expect(testStudent.errorMessage).toBeNull();
            expect(testStudent.errorPeriod).toBeNull();
            expect(testStudent.appreciationSource).toBe('manual');
            expect(testStudent.appreciation).toBe('Très bon travail');
            expect(testStudent.studentData.periods.T1.appreciation).toBe('Très bon travail');
        });

        it('should NOT push each intermediate phrase to history, but push ONCE when dictation stops', () => {
            startDictation('appreciation');

            // User dictates 3 separate phrases with pauses in between
            mockRecognition.onresult(finalResult('première phrase'));
            expect(FocusPanelHistory.push).not.toHaveBeenCalled();

            mockRecognition.onresult(finalResult('deuxième phrase'));
            expect(FocusPanelHistory.push).not.toHaveBeenCalled();

            mockRecognition.onresult(finalResult('troisième phrase'));
            expect(FocusPanelHistory.push).not.toHaveBeenCalled();

            // When dictation session finishes, history is committed exactly once
            SpeechRecognitionManager.stop();
            mockRecognition.onend();

            expect(FocusPanelHistory.push).toHaveBeenCalledTimes(1);
            expect(FocusPanelHistory.push).toHaveBeenCalledWith(
                'Première phrase deuxième phrase troisième phrase',
                'dictation'
            );
        });

        it('should clear errorMessage and push history even if student is switched without pressing stop (abort)', () => {
            startDictation('appreciation');

            mockRecognition.onresult(finalResult('élève sérieux et impliqué point'));
            expect(testStudent.errorMessage).toBeNull();

            // Simulate student change triggering abort()
            SpeechRecognitionManager.abort();

            expect(testStudent.errorMessage).toBeNull();
            expect(testStudent.errorPeriod).toBeNull();
            expect(FocusPanelHistory.push).toHaveBeenCalledTimes(1);
            expect(FocusPanelHistory.push).toHaveBeenCalledWith('Élève sérieux et impliqué.', 'dictation');
        });
    });
});
