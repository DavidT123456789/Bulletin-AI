/**
 * @fileoverview Gestionnaire de la reconnaissance vocale.
 * 
 * Ce module gère l'intégration de l'API Web Speech pour la dictée vocale
 * dans les champs de texte (ex: instructions négatives).
 * 
 * @module managers/SpeechRecognitionManager
 */

import { DOM } from '../utils/DOM.js';
import { UI } from './UIManager.js';

export const SpeechRecognitionManager = {
    /**
     * Initialise et configure la reconnaissance vocale.
     */
    init() {
        const micBtn = document.getElementById('micInputBtn');
        const textarea = DOM.negativeInstructions;

        if (!micBtn || !textarea) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            micBtn.style.display = 'none'; // Cacher si pas supporté
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR';
        recognition.continuous = false;
        recognition.interimResults = false;

        let isRecording = false;

        micBtn.addEventListener('click', () => {
            if (isRecording) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });

        recognition.onstart = () => {
            isRecording = true;
            micBtn.classList.add('recording');
        };

        recognition.onend = () => {
            isRecording = false;
            micBtn.classList.remove('recording');
        };

        recognition.onresult = (event) => {
            // Get the last result only
            const lastResultIndex = event.resultIndex;
            const result = event.results[lastResultIndex];

            // Only process final results to avoid duplicates/stuttering
            if (result.isFinal) {
                const transcript = result[0].transcript;
                const currentVal = textarea.value;
                const prefix = currentVal.length > 0 && !/\s$/.test(currentVal) ? ' ' : '';
                textarea.value += prefix + transcript;
                textarea.dispatchEvent(new Event('input'));
                textarea.focus();
            }
        };

        recognition.onerror = (event) => {
            console.error("Erreur micro:", event.error);
            isRecording = false;
            micBtn.classList.remove('recording');
            UI.showNotification("Erreur micro. Vérifiez les permissions.", 'error');
        };
    }
};
