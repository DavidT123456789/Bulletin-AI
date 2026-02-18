import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeechRecognitionManager } from './SpeechRecognitionManager';

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
    });

    it('should initialize correctly when supported', () => {
        SpeechRecognitionManager.init();
        expect(window.SpeechRecognition).toHaveBeenCalled();
        expect(mockRecognition.lang).toBe('fr-FR');
        expect(mockRecognition.continuous).toBe(false);
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
});

