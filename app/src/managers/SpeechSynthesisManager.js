/**
 * @fileoverview Gestionnaire de la synthèse vocale (Text-To-Speech).
 * 
 * Ce module gère la lecture vocale des appréciations générées ou saisies
 * dans le Focus Panel en utilisant l'API Web Speech speechSynthesis.
 * 
 * @module managers/SpeechSynthesisManager
 */

import { UI } from './UIManager.js';
import { TooltipsUI } from './TooltipsManager.js';

const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
</svg>`;

const STOP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em">
    <rect x="5" y="5" width="14" height="14" rx="2" ry="2"></rect>
</svg>`;

export const SpeechSynthesisManager = {
    /** @type {SpeechSynthesisUtterance|null} */
    _utterance: null,

    /** @type {boolean} */
    _isPlaying: false,

    /** @type {boolean} */
    _isSupported: false,

    /**
     * Initialise et configure la synthèse vocale.
     */
    init() {
        const speakBtn = document.getElementById('focusAppreciationSpeakBtn');
        if (!('speechSynthesis' in window)) {
            if (speakBtn) speakBtn.style.display = 'none';
            this._isSupported = false;
            return;
        }

        this._isSupported = true;

        if (speakBtn) {
            speakBtn.addEventListener('click', () => {
                this.toggleSpeak();
            });
        }
    },

    /**
     * Indique si la synthèse vocale est en cours de lecture.
     * @returns {boolean}
     */
    isPlaying() {
        return this._isPlaying;
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

            const text = (appreciationText.textContent || '').trim();
            if (!text) return;

            this.speak(text);
        }
    },

    /**
     * Lit un texte donné en français.
     * @param {string} text - Le texte brut à lire
     */
    speak(text) {
        if (!this._isSupported) return;

        // Arrêter toute lecture en cours
        this.cancel();

        try {
            this._utterance = new SpeechSynthesisUtterance(text);
            this._utterance.lang = 'fr-FR';

            // Sélectionner la meilleure voix française disponible (neuronale / online / premium)
            const voices = window.speechSynthesis.getVoices();
            const frVoices = voices.filter(voice => voice.lang.startsWith('fr-FR') || voice.lang.startsWith('fr'));
            
            const bestVoice = frVoices.find(v => v.name.toLowerCase().includes('natural')) ||
                              frVoices.find(v => v.name.toLowerCase().includes('online')) ||
                              frVoices.find(v => v.name.toLowerCase().includes('premium')) ||
                              frVoices.find(v => v.name.toLowerCase().includes('google')) ||
                              frVoices.find(v => v.name.toLowerCase().includes('siri')) ||
                              frVoices.find(v => v.lang.startsWith('fr-FR')) ||
                              frVoices[0];

            if (bestVoice) {
                this._utterance.voice = bestVoice;
            }

            this._utterance.onstart = () => {
                this._isPlaying = true;
                this._updateButtonState(true);
            };

            this._utterance.onend = () => {
                this._isPlaying = false;
                this._updateButtonState(false);
                this._utterance = null;
            };

            this._utterance.onerror = (e) => {
                // 'interrupted' et 'canceled' sont normales lors d'un arrêt manuel
                if (e.error !== 'interrupted' && e.error !== 'canceled') {
                    UI.showNotification("Erreur lors de la lecture audio.", "error");
                }
                this._isPlaying = false;
                this._updateButtonState(false);
                this._utterance = null;
            };

            window.speechSynthesis.speak(this._utterance);
        } catch (e) {
            UI.showNotification("Impossible de lancer la lecture audio.", "error");
            this._isPlaying = false;
            this._updateButtonState(false);
            this._utterance = null;
        }
    },

    /**
     * Interrompt proprement la synthèse vocale en cours.
     */
    cancel() {
        if (!this._isSupported) return;

        window.speechSynthesis.cancel();
        this._isPlaying = false;
        this._updateButtonState(false);
        this._utterance = null;
    },

    /**
     * Met à jour l'état visuel du bouton de lecture vocale (icône, tooltip, classe playing).
     * @param {boolean} isPlaying - Indique si la lecture est active
     * @private
     */
    _updateButtonState(isPlaying) {
        const speakBtn = document.getElementById('focusAppreciationSpeakBtn');
        if (!speakBtn) return;

        speakBtn.innerHTML = isPlaying ? STOP_SVG : PLAY_SVG;

        if (isPlaying) {
            speakBtn.classList.add('playing');
        } else {
            speakBtn.classList.remove('playing');
        }

        // Rafraîchir le tooltip via le gestionnaire global
        TooltipsUI.updateTooltip(speakBtn, isPlaying ? 'Arrêter la lecture' : 'Écouter l\'appréciation');
    }
};
