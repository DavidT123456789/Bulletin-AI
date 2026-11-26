import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    SpeechSynthesisManager,
    scoreFrenchVoice,
    selectBestFrenchVoice,
    normalizeTextForSpeech,
    splitIntoSpeechChunks
} from './SpeechSynthesisManager.js';
import { SpeechRecognitionManager } from './SpeechRecognitionManager.js';
import { UI } from './UIManager.js';

describe('SpeechSynthesisManager helpers', () => {
    describe('selectBestFrenchVoice / scoreFrenchVoice', () => {
        it('privilégie une voix neurale Microsoft Edge fr-FR devant Microsoft Hortense (même par défaut)', () => {
            const voices = [
                { name: 'Microsoft Hortense - French (France)', lang: 'fr-FR', localService: true, default: true },
                { name: 'Microsoft Sylvie Online (Natural) - French (Canada)', lang: 'fr-CA', localService: false },
                { name: 'Microsoft Denise Online (Natural) - French (France)', lang: 'fr-FR', localService: false }
            ];

            const best = selectBestFrenchVoice(voices);
            expect(best?.name).toBe('Microsoft Denise Online (Natural) - French (France)');
        });

        it('privilégie Google français devant les anciennes voix SAPI5 sur Chrome Windows', () => {
            const voices = [
                { name: 'Microsoft Hortense - French (France)', lang: 'fr-FR', localService: true, default: true },
                { name: 'Google français', lang: 'fr-FR', localService: false },
                { name: 'Google US English', lang: 'en-US', localService: false }
            ];

            const best = selectBestFrenchVoice(voices);
            expect(best?.name).toBe('Google français');
        });

        it('privilégie les voix Enhanced/Premium fr-FR sur macOS/iOS devant Compact et fr-CA', () => {
            const voices = [
                { name: 'Thomas (Compact)', lang: 'fr-FR', localService: true },
                { name: 'Amélie (Enhanced)', lang: 'fr-CA', localService: true },
                { name: 'Audrey (Enhanced)', lang: 'fr-FR', localService: true }
            ];

            const best = selectBestFrenchVoice(voices);
            expect(best?.name).toBe('Audrey (Enhanced)');
        });

        it('gère les locales avec underscore (fr_FR) et retourne null sans voix française', () => {
            const androidVoices = [
                { name: 'French France local', lang: 'fr_FR', localService: true },
                { name: 'French France network', lang: 'fr_FR', localService: false }
            ];
            expect(selectBestFrenchVoice(androidVoices)?.name).toBe('French France network');

            expect(selectBestFrenchVoice([{ name: 'English', lang: 'en-US' }])).toBeNull();
            expect(selectBestFrenchVoice([])).toBeNull();
            expect(scoreFrenchVoice(null)).toBe(-Infinity);
        });
    });

    describe('normalizeTextForSpeech', () => {
        it('normalise les notes, points, civilités, périodes et sauts de ligne sans altérer les dates', () => {
            const input = [
                '- M. Dupont obtient 14,5/20 au T2 (+2,5 pts depuis le T1).',
                'Progrès constatés le 12/03/2026 avec Mme Martin (1 pt de bonus).'
            ].join('\n');

            const out = normalizeTextForSpeech(input);
            expect(out).toBe(
                'Monsieur Dupont obtient 14,5 sur 20 au trimestre 2 (+2,5 points depuis le trimestre 1). Progrès constatés le 12/03/2026 avec Madame Martin (1 point de bonus).'
            );
        });

        it('ajoute une pause propre entre des lignes sans ponctuation finale et gère les entrées vides', () => {
            expect(normalizeTextForSpeech('Élève sérieux\nTrès bon investissement')).toBe(
                'Élève sérieux. Très bon investissement'
            );
            expect(normalizeTextForSpeech('')).toBe('');
            expect(normalizeTextForSpeech(null)).toBe('');
        });
    });

    describe('splitIntoSpeechChunks', () => {
        it('découpe par phrases en préservant la ponctuation, les décimaux et etc.', () => {
            const text = 'Moyenne de 14.5 sur 20. Bon travail en classe, exercices, etc. Continue ainsi !';
            expect(splitIntoSpeechChunks(text)).toEqual([
                'Moyenne de 14.5 sur 20.',
                'Bon travail en classe, exercices, etc. Continue ainsi !'
            ]);
        });

        it('sous-découpe les phrases très longues sur une clause ou un espace', () => {
            const longSentence = 'Un trimestre très satisfaisant avec une participation régulière, des méthodes de travail de plus en plus solides, et une réelle autonomie face aux exercices complexes proposés en classe.';
            const chunks = splitIntoSpeechChunks(longSentence, 90);

            expect(chunks.length).toBeGreaterThan(1);
            for (const chunk of chunks) {
                expect(chunk.length).toBeLessThanOrEqual(90);
            }
        });

        it('retourne un tableau vide pour un texte vide ou blanc', () => {
            expect(splitIntoSpeechChunks('   ')).toEqual([]);
            expect(splitIntoSpeechChunks(null)).toEqual([]);
        });
    });
});

describe('SpeechSynthesisManager', () => {
    let mockSpeechSynthesis;
    let createdUtterances;
    let voicesChangedListeners;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(UI, 'showNotification').mockImplementation(() => {});

        createdUtterances = [];
        voicesChangedListeners = [];

        document.body.innerHTML = `
            <button id="focusAppreciationSpeakBtn" aria-label="Écouter l'appréciation">
                <svg viewBox="0 0 24 24"></svg>
            </button>
            <div id="focusAppreciationText">Bon trimestre. Poursuivez vos efforts !</div>
        `;

        mockSpeechSynthesis = {
            speaking: false,
            pending: false,
            speak: vi.fn(),
            cancel: vi.fn(),
            getVoices: vi.fn(() => [
                { lang: 'fr-FR', name: 'Microsoft Hortense - French (France)', localService: true },
                { lang: 'fr-FR', name: 'Microsoft Denise Online (Natural) - French (France)', localService: false }
            ]),
            addEventListener: vi.fn((event, handler) => {
                if (event === 'voiceschanged') voicesChangedListeners.push(handler);
            })
        };

        window.SpeechSynthesisUtterance = vi.fn((text) => {
            const instance = { text, lang: '', voice: null, rate: 1, pitch: 1, onend: null, onerror: null };
            createdUtterances.push(instance);
            return instance;
        });

        Object.defineProperty(window, 'speechSynthesis', {
            value: mockSpeechSynthesis,
            writable: true,
            configurable: true
        });
    });

    afterEach(() => {
        SpeechSynthesisManager.cancel();
        delete window.SpeechSynthesisUtterance;
        delete window.speechSynthesis;
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('masque le bouton et indique isSupported() = false si speechSynthesis est absent', () => {
        delete window.speechSynthesis;
        SpeechSynthesisManager.init();

        expect(SpeechSynthesisManager.isSupported()).toBe(false);
        expect(document.getElementById('focusAppreciationSpeakBtn').style.display).toBe('none');
    });

    it('sélectionne la meilleure voix après voiceschanged et enchaîne les segments jusqu’à la fin', () => {
        mockSpeechSynthesis.getVoices.mockReturnValueOnce([]);
        SpeechSynthesisManager.init();
        expect(SpeechSynthesisManager.isSupported()).toBe(true);

        // Simule le chargement asynchrone des voix navigateur
        mockSpeechSynthesis.getVoices.mockReturnValue([
            { lang: 'fr-FR', name: 'Microsoft Hortense - French (France)', localService: true },
            { lang: 'fr-FR', name: 'Google français', localService: false }
        ]);
        voicesChangedListeners.forEach(fn => fn());

        SpeechSynthesisManager.speak('Bon trimestre. Poursuivez vos efforts !');

        expect(SpeechSynthesisManager.isPlaying()).toBe(true);
        expect(createdUtterances).toHaveLength(1);
        expect(createdUtterances[0].text).toBe('Bon trimestre.');
        expect(createdUtterances[0].voice?.name).toBe('Google français');

        // Fin du segment 1 -> lancement du segment 2
        createdUtterances[0].onend();
        expect(createdUtterances).toHaveLength(2);
        expect(createdUtterances[1].text).toBe('Poursuivez vos efforts !');
        expect(SpeechSynthesisManager.isPlaying()).toBe(true);

        // Fin du dernier segment -> retour à l'état arrêté
        createdUtterances[1].onend();
        expect(SpeechSynthesisManager.isPlaying()).toBe(false);
    });

    it('ignore les callbacks obsolètes (onend/onerror) d’une session annulée', () => {
        SpeechSynthesisManager.init();

        SpeechSynthesisManager.speak('Première lecture.');
        const firstUtterance = createdUtterances[0];

        // Relance une nouvelle lecture immédiatement
        SpeechSynthesisManager.speak('Seconde lecture.');
        expect(mockSpeechSynthesis.cancel).toHaveBeenCalledTimes(1);
        expect(SpeechSynthesisManager.isPlaying()).toBe(true);

        // Un callback tardif de l'ancienne utterance ne doit ni arrêter ni notifier
        firstUtterance.onerror({ error: 'synthesis-failed' });
        firstUtterance.onend();

        expect(SpeechSynthesisManager.isPlaying()).toBe(true);
        expect(UI.showNotification).not.toHaveBeenCalled();
    });

    it('arrête la dictée vocale active au lancement de la lecture et ignore le ghost-text', () => {
        const isRecSpy = vi.spyOn(SpeechRecognitionManager, 'isRecording').mockReturnValue(true);
        const stopSpy = vi.spyOn(SpeechRecognitionManager, 'stop').mockImplementation(() => {});

        const field = document.getElementById('focusAppreciationText');
        field.innerHTML = 'Bon trimestre.<span class="dictation-interim"> en cours</span>';

        SpeechSynthesisManager.init();
        SpeechSynthesisManager.toggleSpeak();

        expect(isRecSpy).toHaveBeenCalled();
        expect(stopSpy).toHaveBeenCalledTimes(1);
        expect(createdUtterances[0].text).toBe('Bon trimestre.');
    });

    it('notifie en cas d’erreur réelle mais reste silencieux sur interrupted/canceled', () => {
        SpeechSynthesisManager.init();

        SpeechSynthesisManager.speak('Test erreur.');
        createdUtterances[0].onerror({ error: 'canceled' });
        expect(UI.showNotification).not.toHaveBeenCalled();
        expect(SpeechSynthesisManager.isPlaying()).toBe(false);

        SpeechSynthesisManager.speak('Test erreur réelle.');
        createdUtterances[1].onerror({ error: 'network' });
        expect(UI.showNotification).toHaveBeenCalledWith('Erreur lors de la lecture audio.', 'error');
        expect(SpeechSynthesisManager.isPlaying()).toBe(false);
    });
});
