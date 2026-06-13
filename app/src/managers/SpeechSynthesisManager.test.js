import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeechSynthesisManager } from './SpeechSynthesisManager.js';

describe('SpeechSynthesisManager', () => {
    let mockSpeechSynthesis;
    let mockUtteranceInstance;

    beforeEach(() => {
        vi.clearAllMocks();

        // Create speak button in DOM
        document.body.innerHTML = `
            <button id="focusAppreciationSpeakBtn">
                <svg viewBox="0 0 24 24"></svg>
            </button>
            <div id="focusAppreciationText">Test appreciation text</div>
        `;

        // Mock window.speechSynthesis
        mockSpeechSynthesis = {
            speak: vi.fn(),
            cancel: vi.fn(),
            getVoices: vi.fn(() => [
                { lang: 'fr-FR', name: 'Voix Française' }
            ])
        };

        // Mock SpeechSynthesisUtterance
        mockUtteranceInstance = {};
        window.SpeechSynthesisUtterance = vi.fn(() => mockUtteranceInstance);
        Object.defineProperty(window, 'speechSynthesis', {
            value: mockSpeechSynthesis,
            writable: true,
            configurable: true
        });
    });

    afterEach(() => {
        delete window.SpeechSynthesisUtterance;
        delete window.speechSynthesis;
        document.body.innerHTML = '';
    });

    it('should initialize and check support correctly', () => {
        SpeechSynthesisManager.init();
        expect(SpeechSynthesisManager.isPlaying()).toBe(false);
    });

    it('should invoke window.speechSynthesis.speak on speak()', () => {
        SpeechSynthesisManager.init();
        SpeechSynthesisManager.speak('Texte test');
        expect(window.SpeechSynthesisUtterance).toHaveBeenCalledWith('Texte test');
        expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
    });

    it('should cancel active speech when calling cancel()', () => {
        SpeechSynthesisManager.init();
        SpeechSynthesisManager.cancel();
        expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
        expect(SpeechSynthesisManager.isPlaying()).toBe(false);
    });
});
