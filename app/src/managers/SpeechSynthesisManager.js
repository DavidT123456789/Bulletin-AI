/**
 * @fileoverview Gestionnaire de la synthèse vocale (Text-To-Speech).
 *
 * Ce module gère la lecture vocale des appréciations générées ou saisies
 * dans le Focus Panel en utilisant l'API Web Speech speechSynthesis :
 * - Sélection automatique par score de la meilleure voix française disponible
 *   (voix neurales/améliorées Edge, macOS/iOS, Chrome > voix système anciennes)
 * - Chargement asynchrone des voix via l'événement voiceschanged
 * - Normalisation phonétique légère dédiée aux appréciations scolaires
 * - Découpage par phrases + jeton de session (anti-coupure Chrome 15 s et anti-race condition)
 * - Arrêt mutuel avec la dictée vocale (SpeechRecognitionManager)
 *
 * @module managers/SpeechSynthesisManager
 */

import { UI } from './UIManager.js';
import { TooltipsUI } from './TooltipsManager.js';
import { SpeechRecognitionManager } from './SpeechRecognitionManager.js';

const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
</svg>`;

const STOP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2.5"></rect>
</svg>`;

const MAX_CHUNK_LENGTH = 200;

const PERIOD_LABELS = Object.freeze({
    T1: 'trimestre 1',
    T2: 'trimestre 2',
    T3: 'trimestre 3',
    S1: 'semestre 1',
    S2: 'semestre 2'
});

/**
 * Calcule un score de qualité pour une voix française afin de privilégier
 * automatiquement les voix neurales / améliorées disponibles sur l'appareil.
 * @param {SpeechSynthesisVoice} voice
 * @returns {number} Score (-Infinity si la voix n'est pas francophone)
 */
export function scoreFrenchVoice(voice) {
    if (!voice || typeof voice.lang !== 'string') return -Infinity;

    const lang = voice.lang.toLowerCase().replace('_', '-');
    if (!lang.startsWith('fr')) return -Infinity;

    const name = (voice.name || '').toLowerCase();
    let score = 0;

    // Priorité à la locale fr-FR avant les variantes régionales (fr-CA, fr-CH, fr-BE)
    if (lang === 'fr-fr') {
        score += 40;
    } else if (lang === 'fr') {
        score += 25;
    } else {
        score += 10;
    }

    // Voix neurales / améliorées selon les plateformes
    const isNeuralMicrosoft = /\b(natural|neural)\b/.test(name)
        || (name.includes('microsoft') && name.includes('online'));
    const isAppleHighQuality = /\b(premium|enhanced|siri)\b/.test(name);
    const isGoogle = /^google\b/.test(name);

    if (isNeuralMicrosoft) {
        score += 100;
        if (/\b(denise|henri)\b/.test(name)) score += 5;
    } else if (isAppleHighQuality) {
        score += 85;
    } else if (isGoogle) {
        score += 70;
    } else if (voice.localService === false) {
        score += 30;
    }

    // Voix Apple standard (hors Compact) de bonne qualité sur macOS/iOS
    if (/\b(audrey|thomas|am[ée]lie|aur[ée]lie)\b/.test(name) && !/\bcompact\b/.test(name)) {
        score += 25;
    }

    // Pénalités pour les voix robotiques ou compressées d'ancienne génération
    if (/\b(compact|espeak|festival|mbrola)\b/.test(name)) {
        score -= 40;
    }
    if (!isNeuralMicrosoft && /microsoft\s+(hortense|paul|julie|claude)\b/.test(name)) {
        score -= 30;
    }

    if (voice.default) {
        score += 1;
    }

    return score;
}

/**
 * Sélectionne la meilleure voix française dans la liste exposée par le navigateur.
 * @param {SpeechSynthesisVoice[]} voices
 * @returns {SpeechSynthesisVoice|null}
 */
export function selectBestFrenchVoice(voices) {
    if (!Array.isArray(voices) || voices.length === 0) return null;

    let bestVoice = null;
    let bestScore = -Infinity;

    for (const voice of voices) {
        const score = scoreFrenchVoice(voice);
        if (score > bestScore) {
            bestScore = score;
            bestVoice = voice;
        }
    }

    return bestVoice;
}

/**
 * Normalise un texte d'appréciation scolaire pour une lecture orale naturelle
 * (sans jamais modifier le texte affiché dans l'éditeur).
 * @param {string} text
 * @returns {string}
 */
export function normalizeTextForSpeech(text) {
    if (!text || typeof text !== 'string') return '';

    let normalized = text
        .replace(/\r\n?/g, '\n')
        // Retirer les puces en début de ligne pour éviter qu'elles soient épelées
        .replace(/^[ \t]*[•◦▪▫–—*-][ \t]+/gm, '')
        // Transformer les sauts de ligne en pauses naturelles
        .replace(/([^\n.!?:;…])[ \t]*\n+/g, '$1. ')
        .replace(/\n+/g, ' ');

    // Notes sur barème courant (ex. 14,5/20 -> 14,5 sur 20) sans toucher aux dates (12/03/2026)
    normalized = normalized.replace(
        /(?<!\/)\b(\d+(?:[.,]\d+)?)\s*\/\s*(5|10|15|20|25|30|40|50|100)\b(?!\/)/g,
        '$1 sur $2'
    );

    // Points / écarts chiffrés (ex. +2,5 pts -> +2,5 points, 1 pt -> 1 point)
    normalized = normalized
        .replace(/\b(\d+(?:[.,]\d+)?)\s*pts\.?(?=$|[\s,.;:!?)])/gi, '$1 points')
        .replace(/\b(\d+(?:[.,]\d+)?)\s*pt\.?(?=$|[\s,.;:!?)])/gi, '$1 point');

    // Civilités et abréviations courantes
    normalized = normalized
        .replace(/\bMmes\.?(?=\s)/g, 'Mesdames')
        .replace(/\bMme\.?(?=\s)/g, 'Madame')
        .replace(/\bMlle\.?(?=\s)/g, 'Mademoiselle')
        .replace(/\b(?:M|Mr)\.(?=\s+[A-ZÀ-ÖØ-Þ])/g, 'Monsieur')
        .replace(/\b[Nn]°\s*(\d+)/g, 'numéro $1');

    // Périodes scolaires (T1, T2, T3, S1, S2)
    normalized = normalized.replace(
        /\b(T[123]|S[12])\b/g,
        (code) => PERIOD_LABELS[code] || code
    );

    return normalized.replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * Découpe un texte normalisé en segments adaptés à la synthèse vocale
 * (évite le gel Chrome ~15 s et crée des respirations naturelles par phrase).
 * @param {string} text
 * @param {number} [maxLength=200]
 * @returns {string[]}
 */
export function splitIntoSpeechChunks(text, maxLength = MAX_CHUNK_LENGTH) {
    if (!text || typeof text !== 'string') return [];

    const trimmed = text.trim();
    if (!trimmed) return [];

    // Découpage par phrases en préservant la ponctuation finale (intonation ? / !),
    // sans couper dans les nombres décimaux (14.5) ni juste après une abréviation courte (etc., cf., ex., p.)
    const rawSentences = [];
    const sentenceRegex = /(?:[^.!?…]|\.(?=\d))+(?:[.!?…]+|$)/g;
    let match;

    while ((match = sentenceRegex.exec(trimmed)) !== null) {
        const part = match[0].trim();
        if (!part) continue;

        const prev = rawSentences[rawSentences.length - 1];
        if (prev && /\b(?:etc|cf|ex|pp?|vol|ch|art)\.$/i.test(prev)) {
            rawSentences[rawSentences.length - 1] = `${prev} ${part}`;
        } else {
            rawSentences.push(part);
        }
    }

    const chunks = [];
    for (const sentence of rawSentences) {
        if (sentence.length <= maxLength) {
            chunks.push(sentence);
            continue;
        }

        // Sous-découpage propre des très longues phrases sur ponctuation interne ou espace
        let remaining = sentence;
        while (remaining.length > maxLength) {
            const slice = remaining.slice(0, maxLength);
            let splitAt = -1;

            const clauseMatch = slice.match(/^(.+[,;:—–])\s+[^,;:—–]*$/);
            if (clauseMatch && clauseMatch[1].length >= Math.floor(maxLength * 0.4)) {
                splitAt = clauseMatch[1].length;
            } else {
                splitAt = slice.lastIndexOf(' ');
            }

            if (splitAt <= 0) {
                splitAt = maxLength;
            }

            const head = remaining.slice(0, splitAt).trim();
            if (head) chunks.push(head);
            remaining = remaining.slice(splitAt).trim();
        }

        if (remaining) chunks.push(remaining);
    }

    return chunks;
}

export const SpeechSynthesisManager = {
    /** @type {SpeechSynthesisUtterance|null} */
    _utterance: null,

    /** @type {boolean} */
    _isPlaying: false,

    /** @type {boolean} */
    _isSupported: false,

    /** @type {SpeechSynthesisVoice[]} */
    _voices: [],

    /** @type {SpeechSynthesisVoice|null} */
    _selectedVoice: null,

    /** @type {number} */
    _sessionId: 0,

    /** @type {string[]} */
    _queue: [],

    /** @type {number} */
    _queueIndex: 0,

    /** @type {SpeechSynthesis|null} */
    _boundSynthesis: null,

    /** @type {boolean} */
    _pagehideListenerAttached: false,

    /** @type {Function|null} */
    _handleSpeakClick: null,

    /** @type {HTMLElement|null} */
    _boundSpeakBtn: null,

    /**
     * Initialise et configure la synthèse vocale.
     */
    init() {
        const speakBtn = document.getElementById('focusAppreciationSpeakBtn');
        if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis) {
            if (speakBtn) speakBtn.style.display = 'none';
            this._isSupported = false;
            this._boundSynthesis = null;
            this._voices = [];
            this._selectedVoice = null;
            return;
        }

        this._isSupported = true;

        if (this._boundSynthesis !== window.speechSynthesis) {
            this._voices = [];
            this._selectedVoice = null;
            const onVoicesChanged = () => this._refreshVoices();
            if (typeof window.speechSynthesis.addEventListener === 'function') {
                window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
            } else {
                window.speechSynthesis.onvoiceschanged = onVoicesChanged;
            }
            this._boundSynthesis = window.speechSynthesis;
        }

        this._refreshVoices();

        if (!this._pagehideListenerAttached) {
            window.addEventListener('pagehide', () => {
                if (this._isPlaying) this.cancel();
            });
            this._pagehideListenerAttached = true;
        }

        if (speakBtn) {
            if (this._boundSpeakBtn && this._handleSpeakClick) {
                this._boundSpeakBtn.removeEventListener('click', this._handleSpeakClick);
            }
            this._handleSpeakClick = () => this.toggleSpeak();
            speakBtn.addEventListener('click', this._handleSpeakClick);
            this._boundSpeakBtn = speakBtn;
        }
    },

    /**
     * Indique si l'API Web Speech Synthesis est disponible.
     * @returns {boolean}
     */
    isSupported() {
        return this._isSupported;
    },

    /**
     * Indique si la synthèse vocale est en cours de lecture.
     * @returns {boolean}
     */
    isPlaying() {
        return this._isPlaying;
    },

    /**
     * Met à jour le cache des voix disponibles et la meilleure voix française.
     * @private
     */
    _refreshVoices() {
        if (!this._isSupported || typeof window.speechSynthesis?.getVoices !== 'function') return;
        const voices = window.speechSynthesis.getVoices() || [];
        if (voices.length > 0) {
            this._voices = voices;
            this._selectedVoice = selectBestFrenchVoice(voices);
        }
    },

    /**
     * Retourne la meilleure voix française disponible (en relançant getVoices si le cache est vide).
     * @returns {SpeechSynthesisVoice|null}
     * @private
     */
    _getPreferredVoice() {
        if (!this._selectedVoice || this._voices.length === 0) {
            this._refreshVoices();
        }
        return this._selectedVoice;
    },

    /**
     * Extrait le texte validé de la zone d'appréciation (sans éventuel ghost-text de dictée).
     * @param {HTMLElement} element
     * @returns {string}
     * @private
     */
    _extractAppreciationText(element) {
        if (!element) return '';
        if (element.querySelector?.('.dictation-interim')) {
            const clone = element.cloneNode(true);
            clone.querySelectorAll('.dictation-interim').forEach(el => el.remove());
            return (clone.textContent || '').trim();
        }
        return (element.textContent || '').trim();
    },

    /**
     * Bascule entre la lecture et l'arrêt.
     */
    toggleSpeak() {
        if (!this._isSupported) return;

        if (this._isPlaying) {
            this.cancel();
        } else {
            const appreciationText = document.getElementById('focusAppreciationText');
            if (!appreciationText) return;

            const text = this._extractAppreciationText(appreciationText);
            if (!text) return;

            this.speak(text);
        }
    },

    /**
     * Lit un texte donné en français avec normalisation et découpage par phrases.
     * @param {string} text - Le texte brut à lire
     */
    speak(text) {
        if (!this._isSupported) return;

        const normalized = normalizeTextForSpeech(text);
        const chunks = splitIntoSpeechChunks(normalized);
        if (chunks.length === 0) return;

        // Coupe-circuit mutuel avec la dictée vocale (évite que le micro n'enregistre le haut-parleur)
        if (SpeechRecognitionManager.isRecording?.()) {
            SpeechRecognitionManager.stop();
        }

        const needsCancel = this._isPlaying
            || Boolean(window.speechSynthesis.speaking)
            || Boolean(window.speechSynthesis.pending);

        const sessionId = ++this._sessionId;
        if (needsCancel) {
            window.speechSynthesis.cancel();
        }

        this._queue = chunks;
        this._queueIndex = 0;
        this._isPlaying = true;
        // Retour visuel immédiat dès le clic (important pour les voix distantes avec latence de démarrage)
        this._updateButtonState(true);

        this._speakNextChunk(sessionId);
    },

    /**
     * Lance la lecture du segment courant de la file.
     * @param {number} sessionId - Jeton de session pour ignorer les callbacks obsolètes
     * @private
     */
    _speakNextChunk(sessionId) {
        if (sessionId !== this._sessionId || !this._isPlaying) return;

        if (this._queueIndex >= this._queue.length) {
            this._resetState();
            return;
        }

        const chunk = this._queue[this._queueIndex];

        try {
            const utterance = new SpeechSynthesisUtterance(chunk);
            const voice = this._getPreferredVoice();

            utterance.lang = voice?.lang || 'fr-FR';
            if (voice) {
                utterance.voice = voice;
            }
            utterance.rate = 1.0;
            utterance.pitch = 1.0;

            utterance.onend = () => {
                if (sessionId !== this._sessionId) return;
                this._queueIndex += 1;
                this._speakNextChunk(sessionId);
            };

            utterance.onerror = (e) => {
                if (sessionId !== this._sessionId) return;
                // 'interrupted' et 'canceled' sont normales lors d'un arrêt manuel
                if (e?.error !== 'interrupted' && e?.error !== 'canceled') {
                    UI.showNotification("Erreur lors de la lecture audio.", "error");
                }
                this._resetState();
            };

            // Conserver une référence forte (contourne le bug GC de Chrome/Safari)
            this._utterance = utterance;
            window.speechSynthesis.speak(utterance);
        } catch (_) {
            UI.showNotification("Impossible de lancer la lecture audio.", "error");
            this._resetState();
        }
    },

    /**
     * Interrompt proprement la synthèse vocale en cours.
     */
    cancel() {
        if (!this._isSupported) return;

        this._sessionId += 1;
        window.speechSynthesis.cancel();
        this._resetState();
    },

    /**
     * Réinitialise l'état interne et le bouton de lecture.
     * @private
     */
    _resetState() {
        this._isPlaying = false;
        this._utterance = null;
        this._queue = [];
        this._queueIndex = 0;
        this._updateButtonState(false);
    },

    /**
     * Met à jour l'état visuel du bouton de lecture vocale (icône, tooltip, ARIA, classe playing).
     * @param {boolean} isPlaying - Indique si la lecture est active
     * @private
     */
    _updateButtonState(isPlaying) {
        const speakBtn = document.getElementById('focusAppreciationSpeakBtn');
        if (!speakBtn) return;

        const label = isPlaying ? 'Arrêter la lecture' : "Écouter l'appréciation";
        speakBtn.innerHTML = isPlaying ? STOP_SVG : PLAY_SVG;
        speakBtn.classList.toggle('playing', isPlaying);
        speakBtn.setAttribute('aria-label', label);
        speakBtn.setAttribute('aria-pressed', String(isPlaying));

        // Rafraîchir le tooltip via le gestionnaire global
        TooltipsUI.updateTooltip(speakBtn, label);
    }
};
