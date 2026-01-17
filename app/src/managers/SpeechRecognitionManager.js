/**
 * @fileoverview Gestionnaire de la reconnaissance vocale.
 * 
 * Ce module gère l'intégration de l'API Web Speech pour la dictée vocale
 * dans le Focus Panel (champ Contexte élève ET zone Appréciation).
 * 
 * @module managers/SpeechRecognitionManager
 */

import { UI } from './UIManager.js';
import { appState } from '../state/State.js';

export const SpeechRecognitionManager = {
    /** @type {SpeechRecognition|null} */
    _recognition: null,

    /** @type {boolean} */
    _isRecording: false,

    /** @type {boolean} */
    _isSupported: false,

    /** @type {'context'|'appreciation'|null} - Currently active target */
    _activeTarget: null,

    /** @type {HTMLElement|null} - Currently active button */
    _activeButton: null,

    /** @type {boolean} - Whether we got a result in the current session */
    _gotResult: false,

    /**
     * Initialise et configure la reconnaissance vocale pour le Focus Panel.
     * Supporte deux cibles : Contexte (textarea) et Appréciation (contenteditable div)
     */
    init() {
        const contextMicBtn = document.getElementById('focusMicBtn');
        const appreciationMicBtn = document.getElementById('focusAppreciationMicBtn');

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            // Cacher les boutons si API non supportée
            if (contextMicBtn) contextMicBtn.style.display = 'none';
            if (appreciationMicBtn) appreciationMicBtn.style.display = 'none';
            this._isSupported = false;
            return;
        }

        this._isSupported = true;

        // Créer une seule instance de reconnaissance partagée
        if (!this._recognition) {
            this._recognition = new SpeechRecognition();
            this._recognition.lang = 'fr-FR';
            this._recognition.continuous = false;
            this._recognition.interimResults = false;

            this._recognition.onstart = () => {
                this._isRecording = true;
                this._gotResult = false; // Reset for new recording session

                // Audio feedback: subtle beep to confirm recording started
                this._playStartBeep();

                if (this._activeButton) {
                    this._activeButton.classList.add('recording');
                    // Dynamic tooltip
                    this._activeButton.setAttribute('data-tooltip', 'Dictée en cours<br><span class="kbd-hint">Arrêter</span>');
                }
                // Show "Dictée..." badge for appreciation
                if (this._activeTarget === 'appreciation') {
                    this._setAppreciationBadge('dictating');
                }
            };

            this._recognition.onend = () => {
                this._isRecording = false;
                if (this._activeButton) {
                    this._activeButton.classList.remove('recording');
                    // Restore tooltip
                    this._activeButton.setAttribute('data-tooltip', 'Dictée vocale<br><span class="kbd-hint">Démarrer</span>');
                }

                // If appreciation was dictating and NO result was received, clear the badge
                // If we got a result, _saveAppreciationAndUpdateList will handle showing 'saved'
                if (this._activeTarget === 'appreciation' && !this._gotResult) {
                    const badge = document.getElementById('focusAppreciationBadge');
                    if (badge && (badge.classList.contains('is-dictating') || badge.classList.contains('dictating'))) {
                        this._setAppreciationBadge('none');
                    }
                }

                this._activeButton = null;
                this._activeTarget = null;
            };

            this._recognition.onresult = (event) => {
                // Récupérer le dernier résultat uniquement
                const lastResultIndex = event.resultIndex;
                const result = event.results[lastResultIndex];

                // Traiter seulement les résultats finaux pour éviter les doublons
                if (result.isFinal) {
                    this._gotResult = true; // Mark that we got a valid result
                    const transcript = result[0].transcript;
                    this._insertTranscript(transcript);
                }
            };

            this._recognition.onerror = (event) => {
                this._isRecording = false;
                if (this._activeButton) {
                    this._activeButton.classList.remove('recording');
                }
                this._activeButton = null;
                this._activeTarget = null;

                // Messages d'erreur plus explicites
                let message = "Erreur de reconnaissance vocale.";
                if (event.error === 'not-allowed') {
                    message = "Accès au microphone refusé. Autorisez l'accès dans les paramètres du navigateur.";
                } else if (event.error === 'no-speech') {
                    message = "Aucune voix détectée. Réessayez.";
                } else if (event.error === 'network') {
                    message = "Erreur réseau. Vérifiez votre connexion.";
                }
                UI.showNotification(message, 'error');
            };
        }

        // Attacher les événements click aux deux boutons
        this._setupButton(contextMicBtn, 'context');
        this._setupButton(appreciationMicBtn, 'appreciation');
    },

    /**
     * Configure un bouton micro pour une cible spécifique
     * @param {HTMLElement|null} btn - Le bouton micro
     * @param {'context'|'appreciation'} target - La cible
     * @private
     */
    _setupButton(btn, target) {
        if (!btn) return;

        // Supprimer l'ancien handler s'il existe
        const handlerKey = `_handleClick_${target}`;
        if (this[handlerKey]) {
            btn.removeEventListener('click', this[handlerKey]);
        }

        // Créer et stocker le nouveau handler
        this[handlerKey] = () => {
            if (!this._recognition) return;

            // Si on clique sur le même bouton en cours d'enregistrement, on arrête
            if (this._isRecording && this._activeTarget === target) {
                this._recognition.stop();
                return;
            }

            // Si un autre enregistrement est en cours, l'arrêter d'abord
            if (this._isRecording) {
                this._recognition.stop();
                // Attendre un peu avant de redémarrer
                setTimeout(() => this._startRecording(btn, target), 100);
                return;
            }

            this._startRecording(btn, target);
        };

        btn.addEventListener('click', this[handlerKey]);
    },

    /**
     * Démarre l'enregistrement pour une cible
     * @param {HTMLElement} btn - Le bouton cliqué
     * @param {'context'|'appreciation'} target - La cible
     * @private
     */
    _startRecording(btn, target) {
        try {
            this._activeTarget = target;
            this._activeButton = btn;
            this._recognition.start();
        } catch (e) {
            // Peut échouer si déjà en cours
            if (e.name !== 'InvalidStateError') {
                UI.showNotification("Impossible de démarrer la dictée.", 'error');
            }
            this._activeButton = null;
            this._activeTarget = null;
        }
    },

    /**
     * Insère le texte transcrit dans la cible active
     * @param {string} transcript - Le texte reconnu
     * @private
     */
    _insertTranscript(transcript) {
        if (this._activeTarget === 'context') {
            // Cible : textarea classique
            const textarea = document.getElementById('focusContextInput');
            if (!textarea) return;

            const currentVal = textarea.value;
            const prefix = currentVal.length > 0 && !/\s$/.test(currentVal) ? ' ' : '';
            textarea.value += prefix + transcript;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.focus();

        } else if (this._activeTarget === 'appreciation') {
            // Cible : div contenteditable
            const appreciationEl = document.getElementById('focusAppreciationText');
            if (!appreciationEl) return;

            // Retirer la classe empty si présente
            appreciationEl.classList.remove('empty');

            // Récupérer le texte actuel (textContent pour éviter les problèmes HTML)
            const currentText = appreciationEl.textContent || '';
            const prefix = currentText.length > 0 && !/\s$/.test(currentText) ? ' ' : '';

            // Insérer le nouveau texte
            appreciationEl.textContent = currentText + prefix + transcript;

            // Déclencher les événements pour la mise à jour du compteur de mots
            appreciationEl.dispatchEvent(new Event('input', { bubbles: true }));

            // Placer le curseur à la fin
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(appreciationEl);
            range.collapse(false); // false = collapse to end
            selection.removeAllRanges();
            selection.addRange(range);

            // Trigger save and list update (simulates blur behavior)
            this._saveAppreciationAndUpdateList(appreciationEl.textContent);

            // Feedback visuel subtil
            UI.showNotification('Texte dicté ajouté', 'success');
        }
    },

    /**
     * Vérifie si l'API Speech Recognition est supportée
     * @returns {boolean}
     */
    isSupported() {
        return this._isSupported;
    },

    /**
     * Vérifie si un enregistrement est en cours
     * @returns {boolean}
     */
    isRecording() {
        return this._isRecording;
    },

    /**
     * Retourne la cible active de l'enregistrement
     * @returns {'context'|'appreciation'|null}
     */
    getActiveTarget() {
        return this._activeTarget;
    },

    /**
     * Set the appreciation status badge (delegates to FocusPanelManager)
     * @param {'dictating'|'saved'|'none'} state
     * @private
     */
    _setAppreciationBadge(state) {
        // Delegate to FocusPanelStatus unified status method
        import('./FocusPanelStatus.js').then(({ FocusPanelStatus }) => {
            FocusPanelStatus.updateAppreciationStatus(null, { state: state });
        });
    },

    /**
     * Save the appreciation and update the list view
     * This replicates the blur handler logic from FocusPanelManager
     * @param {string} content - The appreciation text
     * @private
     */
    _saveAppreciationAndUpdateList(content) {
        // Import modules dynamically to avoid circular dependency
        Promise.all([
            import('./FocusPanelManager.js'),
            import('./FocusPanelHistory.js'),
            import('./FocusPanelStatus.js')
        ]).then(([{ FocusPanelManager }, { FocusPanelHistory }, { FocusPanelStatus }]) => {
            const studentId = FocusPanelManager.currentStudentId;
            if (!studentId) return;

            const result = appState.generatedResults.find(r => r.id === studentId);
            if (!result) return;

            // Update the result logic to match FocusPanelManager
            result.appreciation = content; // Fix: was result.output
            result.wasGenerated = false; // Mark as manually edited (dictated)
            result.tokenUsage = null;

            // Hide AI indicator
            const aiIndicator = document.getElementById('focusAiIndicator');
            if (aiIndicator) aiIndicator.style.display = 'none';

            // Push to history
            FocusPanelHistory.push(content);

            // Save context (and appreciation via DOM)
            FocusPanelManager._saveContext();

            // Update list row
            FocusPanelManager._updateListRow(result);

            // Show saved badge
            FocusPanelStatus.updateAppreciationStatus(null, { state: 'saved' });
        });
    },

    /**
     * Plays a subtle beep sound to indicate recording has started.
     * Uses Web Audio API for a lightweight, dependency-free solution.
     * @private
     */
    _playStartBeep() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // Pleasant, subtle beep: 880Hz (A5 note), short duration
            oscillator.frequency.value = 880;
            oscillator.type = 'sine';

            // Fade in/out to avoid clicking artifacts
            const now = audioContext.currentTime;
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.15, now + 0.01); // Fade in
            gainNode.gain.linearRampToValueAtTime(0, now + 0.08);    // Fade out

            oscillator.start(now);
            oscillator.stop(now + 0.1);

            // Cleanup
            oscillator.onended = () => {
                oscillator.disconnect();
                gainNode.disconnect();
                audioContext.close();
            };
        } catch {
            // Silently fail if Web Audio API is not available
        }
    }
};
