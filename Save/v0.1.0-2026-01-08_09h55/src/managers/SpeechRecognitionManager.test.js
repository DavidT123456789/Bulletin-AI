import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeechRecognitionManager } from './SpeechRecognitionManager';
import { DOM } from '../utils/DOM';

// Mock DOM module
vi.mock('../utils/DOM', () => ({
    DOM: {
        negativeInstructions: {
            value: '',
            focus: vi.fn(),
            dispatchEvent: vi.fn(),
        }
    }
}));

describe('SpeechRecognitionManager', () => {
    let mockRecognition;
    let micBtn;

    beforeEach(() => {
        // Setup text area mock value reset
        DOM.negativeInstructions.value = '';
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

    it('should toggle recording on click', () => {
        SpeechRecognitionManager.init();

        // Initial state: not recording. Click starts it.
        micBtn.click();
        expect(mockRecognition.start).toHaveBeenCalled();

        // Simulate onstart to update internal state (isRecording = true)
        if (mockRecognition.onstart) mockRecognition.onstart();

        // Click again stops it.
        micBtn.click();
        expect(mockRecognition.stop).toHaveBeenCalled();
    });

    it('should update textarea on final result', () => {
        SpeechRecognitionManager.init();

        // Helper to simulate result event
        const simulateResult = (transcript, isFinal) => {
            const event = {
                resultIndex: 0,
                results: {
                    0: { 0: { transcript }, isFinal },
                    length: 1
                }
            };
            if (mockRecognition.onresult) mockRecognition.onresult(event);
        };

        // Simulate final result
        simulateResult('Bonjour', true);

        expect(DOM.negativeInstructions.value).toBe('Bonjour');
        expect(DOM.negativeInstructions.dispatchEvent).toHaveBeenCalled();
    });

    it('should prepend space if textarea not empty', () => {
        DOM.negativeInstructions.value = 'Hello';
        SpeechRecognitionManager.init();

        const simulateResult = (transcript, isFinal) => {
            const event = {
                resultIndex: 0,
                results: {
                    0: { 0: { transcript }, isFinal },
                    length: 1
                }
            };
            if (mockRecognition.onresult) mockRecognition.onresult(event);
        };

        simulateResult('World', true);

        expect(DOM.negativeInstructions.value).toBe('Hello World');
    });

    it('should hide button if not supported', () => {
        delete window.SpeechRecognition;
        delete window.webkitSpeechRecognition;

        SpeechRecognitionManager.init();

        expect(micBtn.style.display).toBe('none');
    });
});
