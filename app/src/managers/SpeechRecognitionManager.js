/**
 * @fileoverview Gestionnaire de la reconnaissance vocale moderne (Web Speech API).
 * 
 * Ce module gère la dictée vocale continue, le streaming temps réel (ghost-text)
 * et le formatage intelligent de la ponctuation en français pour le Focus Panel
 * (champ Contexte élève, zone Appréciation et Journal de bord).
 * 
 * @module managers/SpeechRecognitionManager
 */

import { UI } from './UIManager.js';
import { appState } from '../state/State.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { FocusPanelHistory } from './FocusPanelHistory.js';
import { FocusPanelStatus } from './FocusPanelStatus.js';
import { PromptService } from '../services/PromptService.js';

/**
 * Moteur de ponctuation et formatage naturel pour la dictée vocale en français
 */
export const SpeechPunctuation = {
    /**
     * Formate et ponctue le texte transcrit
     * @param {string} text - Texte brut transcrit
     * @returns {string} - Texte formaté et ponctué
     */
    format(text) {
        if (!text) return '';

        let formatted = text;

        // Commandes orales courantes et utiles en français
        const rules = [
            // Retours à la ligne et paragraphes
            [/(?<!\p{L})(?:nouveau paragraphe)(?!\p{L})/giu, '\n\n'],
            [/(?<!\p{L})(?:retour à la ligne|à la ligne|nouvelle ligne)(?!\p{L})/giu, '\n'],

            // Ponctuations complexes
            [/(?<!\p{L})(?:point d'exclamation|points d'exclamation)(?!\p{L})/giu, ' !'],
            [/(?<!\p{L})(?:point d'interrogation|points d'interrogation)(?!\p{L})/giu, ' ?'],
            [/(?<!\p{L})(?:point-virgule|points-virgules|point virgule)(?!\p{L})/giu, ' ;'],
            [/(?<!\p{L})(?:deux-points|deux points)(?!\p{L})/giu, ' :'],
            [/(?<!\p{L})(?:points de suspension|trois petits points)(?!\p{L})/giu, '...'],

            // Ponctuations simples
            [/(?<!\p{L})(?:virgule)(?!\p{L})/giu, ','],
            [/(?<!\p{L})(?:point)(?!\p{L})/giu, '.']
        ];

        for (const [regex, rep] of rules) {
            formatted = formatted.replace(regex, rep);
        }

        // Nettoyer les espaces avant virgules, points et points de suspension
        formatted = formatted.replace(/\s+(\.{3})/g, '$1');
        formatted = formatted.replace(/\s+([,\.])/g, '$1');

        // Typographie française : un espace simple avant les signes doubles (; : ! ?)
        formatted = formatted.replace(/\s*([;:!\?])/g, ' $1');

        // Assurer un espace après les signes de ponctuation (sauf au sein de ...)
        formatted = formatted.replace(/(?<!\.)([,;:!\?]|(?<!\.)\.(?!\.))(?!\s|\n|$)/g, '$1 ');
        formatted = formatted.replace(/(?<=\.{3})(?!\s|\n|$)/g, ' ');

        // Nettoyer les espaces autour des sauts de ligne
        formatted = formatted.replace(/[ \t]*\n/g, '\n').replace(/\n[ \t]*/g, '\n');

        // Nettoyer les espaces multiples
        formatted = formatted.replace(/[ \t]+/g, ' ');

        // Majuscule en début de chaîne ou après un point, !, ? ou saut de ligne
        formatted = formatted.replace(/(?:^|[.!?\n]\s*)(\p{Ll})/gu, (match, letter) => {
            return match.slice(0, match.length - letter.length) + letter.toUpperCase();
        });

        return formatted.trim();
    }
};

export const SpeechRecognitionManager = {
    /** @type {SpeechRecognition|null} */
    _recognition: null,

    /** @type {boolean} */
    _isRecording: false,

    /** @type {boolean} */
    _isSupported: false,

    /** @type {'context'|'appreciation'|'journal'|null} - Cible active */
    _activeTarget: null,

    /** @type {HTMLElement|null} - Bouton actif */
    _activeButton: null,

    /** @type {boolean} - Indique si un résultat a été reçu */
    _gotResult: false,

    /** @type {string} - Texte de base avant dictée */
    _baseText: '',

    /**
     * Initialise et configure la reconnaissance vocale pour le Focus Panel.
     * Supporte trois cibles : Contexte, Appréciation et Journal de bord.
     */
    init() {
        const contextMicBtn = document.getElementById('focusMicBtn');
        const appreciationMicBtn = document.getElementById('focusAppreciationMicBtn');

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            if (contextMicBtn) contextMicBtn.style.display = 'none';
            if (appreciationMicBtn) appreciationMicBtn.style.display = 'none';
            this._isSupported = false;
            return;
        }

        this._isSupported = true;

        if (!this._recognition) {
            this._recognition = new SpeechRecognition();
            this._recognition.lang = 'fr-FR';
            this._recognition.continuous = true;
            this._recognition.interimResults = true;

            this._recognition.onstart = () => {
                this._isRecording = true;
                this._gotResult = false;

                if (this._activeButton) {
                    this._activeButton.classList.add('recording');
                    const tooltipText = 'Dictée continue en cours...<br><span class="kbd-hint">Arrêter (Échap)</span>';
                    this._activeButton.setAttribute('data-tooltip', tooltipText);
                    if (this._activeButton._tippy) {
                        this._activeButton._tippy.setContent(tooltipText);
                    }
                }

                if (this._activeTarget === 'appreciation') {
                    this._setAppreciationBadge('dictating');
                }
            };

            this._recognition.onend = () => {
                // En mode continu, Chrome peut déclencher onend après un silence prolongé.
                // Si l'utilisateur n'a pas arrêté manuellement, on redémarre de manière fluide.
                if (this._isRecording && this._activeButton && this._activeTarget) {
                    try {
                        this._recognition.start();
                        return;
                    } catch (_) {
                        // Si le redémarrage échoue, terminer proprement
                    }
                }

                this._isRecording = false;
                this._finalizeSession();
            };

            this._recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const res = event.results[i];
                    const text = res?.[0]?.transcript ?? res?.transcript ?? '';
                    if (res.isFinal) {
                        finalTranscript += (finalTranscript ? ' ' : '') + text;
                    } else {
                        interimTranscript += (interimTranscript ? ' ' : '') + text;
                    }
                }

                if (finalTranscript) {
                    this._gotResult = true;
                    this._insertTranscript(finalTranscript);
                }

                if (interimTranscript) {
                    this._renderInterim(interimTranscript);
                }
            };

            this._recognition.onerror = (event) => {
                // 'no-speech' en mode continu est normal lors des pauses de réflexion de l'utilisateur
                if (event.error === 'no-speech' && this._isRecording) {
                    return;
                }

                this._isRecording = false;
                this._finalizeSession();

                let message = "Erreur de reconnaissance vocale.";
                if (event.error === 'not-allowed') {
                    message = "Accès au microphone refusé. Autorisez l'accès dans les paramètres du navigateur.";
                } else if (event.error === 'network') {
                    message = "Erreur réseau. Vérifiez votre connexion.";
                }
                UI.showNotification(message, 'error');
            };
        }

        this.setupButton(contextMicBtn, 'context');
        this.setupButton(appreciationMicBtn, 'appreciation');
    },

    /**
     * Configure un bouton micro pour une cible spécifique
     * @param {HTMLElement|null} btn - Le bouton micro
     * @param {'context'|'appreciation'|'journal'} target - La cible
     */
    setupButton(btn, target) {
        if (!btn) return;
        if (!this._isSupported) {
            btn.style.display = 'none';
            return;
        }

        const handlerKey = `_handleClick_${target}`;
        if (this[handlerKey]) {
            btn.removeEventListener('click', this[handlerKey]);
        }

        this[handlerKey] = () => {
            if (!this._recognition) return;

            // Clic sur le bouton en cours d'enregistrement -> Arrêter
            if (this._isRecording && this._activeTarget === target) {
                this.stop();
                return;
            }

            // Si un autre bouton enregistrait déjà, l'arrêter d'abord
            if (this._isRecording) {
                this.stop();
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
     * @param {'context'|'appreciation'|'journal'} target - La cible
     * @private
     */
    _startRecording(btn, target) {
        try {
            this._activeTarget = target;
            this._activeButton = btn;

            // Capturer le texte actuel de base pour y concaténer les flux
            if (target === 'context') {
                const textarea = document.getElementById('focusContextInput');
                this._baseText = textarea?.value || '';
            } else if (target === 'appreciation') {
                const appreciationEl = document.getElementById('focusAppreciationText');
                this._baseText = appreciationEl?.textContent || '';
            } else if (target === 'journal') {
                const textarea = document.getElementById('journalNoteInput');
                this._baseText = textarea?.value || '';
            } else {
                this._baseText = '';
            }

            this._isRecording = true;
            this._recognition.start();
        } catch (e) {
            if (e.name !== 'InvalidStateError') {
                UI.showNotification("Impossible de démarrer la dictée vocale.", 'error');
            }
            this._activeButton = null;
            this._activeTarget = null;
            this._isRecording = false;
        }
    },

    /**
     * Arrête proprement l'enregistrement en cours et valide le texte
     */
    stop() {
        if (!this._isRecording && !this._activeButton) return;
        this._isRecording = false;
        try {
            this._recognition?.stop();
        } catch (_) {}
        this._finalizeSession();
    },

    /** Alias de compatibilité */
    stopRecording() {
        this.stop();
    },

    /**
     * Affiche l'aperçu streaming des mots en cours de prononciation
     * @param {string} interimText
     * @private
     */
    _renderInterim(interimText) {
        if (!interimText) return;
        const formatted = SpeechPunctuation.format(interimText);

        if (this._activeTarget === 'appreciation') {
            const appreciationEl = document.getElementById('focusAppreciationText');
            if (!appreciationEl) return;
            appreciationEl.classList.remove('empty');

            let interimSpan = appreciationEl.querySelector('.dictation-interim');
            if (!interimSpan) {
                interimSpan = document.createElement('span');
                interimSpan.className = 'dictation-interim';
                appreciationEl.appendChild(interimSpan);
            }
            const prefix = this._baseText.length > 0 && !/\s$/.test(this._baseText) ? ' ' : '';
            interimSpan.textContent = prefix + formatted;
        } else if (this._activeTarget === 'context') {
            const textarea = document.getElementById('focusContextInput');
            if (!textarea) return;
            const prefix = this._baseText.length > 0 && !/\s$/.test(this._baseText) ? ' ' : '';
            textarea.value = this._baseText + prefix + formatted;
            textarea.scrollTop = textarea.scrollHeight;
        } else if (this._activeTarget === 'journal') {
            const textarea = document.getElementById('journalNoteInput');
            if (!textarea) return;
            const prefix = this._baseText.length > 0 && !/\s$/.test(this._baseText) ? ' ' : '';
            textarea.value = (this._baseText + prefix + formatted).slice(0, 280);
        }
    },

    /**
     * Nettoie les éléments d'aperçu streaming
     * @private
     */
    _cleanInterim() {
        if (this._activeTarget === 'appreciation') {
            const appreciationEl = document.getElementById('focusAppreciationText');
            const interimSpan = appreciationEl?.querySelector('.dictation-interim');
            if (interimSpan) {
                const remaining = interimSpan.textContent?.trim();
                interimSpan.remove();
                if (remaining && !this._baseText.includes(remaining)) {
                    this._insertTranscript(remaining);
                }
            }
        } else if (this._activeTarget === 'context') {
            const textarea = document.getElementById('focusContextInput');
            if (textarea) textarea.value = this._baseText;
        } else if (this._activeTarget === 'journal') {
            const textarea = document.getElementById('journalNoteInput');
            if (textarea) textarea.value = this._baseText;
        }
    },

    /**
     * Insère et valide un bloc de texte transcrit définitif
     * @param {string} transcript - Le texte reconnu
     * @private
     */
    _insertTranscript(transcript) {
        if (!transcript) return;
        const formatted = SpeechPunctuation.format(transcript);

        if (this._activeTarget === 'context') {
            const textarea = document.getElementById('focusContextInput');
            if (!textarea) return;

            const prefix = this._baseText.length > 0 && !/\s$/.test(this._baseText) ? ' ' : '';
            this._baseText += prefix + formatted;
            textarea.value = this._baseText;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.focus();

        } else if (this._activeTarget === 'appreciation') {
            const appreciationEl = document.getElementById('focusAppreciationText');
            if (!appreciationEl) return;

            appreciationEl.classList.remove('empty');
            const interimSpan = appreciationEl.querySelector('.dictation-interim');
            if (interimSpan) interimSpan.remove();

            const prefix = this._baseText.length > 0 && !/\s$/.test(this._baseText) ? ' ' : '';
            this._baseText += prefix + formatted;
            appreciationEl.textContent = this._baseText;

            appreciationEl.dispatchEvent(new Event('input', { bubbles: true }));

            // Placer le curseur à la fin
            try {
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(appreciationEl);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            } catch (_) {}

            this._saveAppreciationAndUpdateList(this._baseText);

        } else if (this._activeTarget === 'journal') {
            const textarea = document.getElementById('journalNoteInput');
            if (!textarea) return;

            const prefix = this._baseText.length > 0 && !/\s$/.test(this._baseText) ? ' ' : '';
            this._baseText = (this._baseText + prefix + formatted).slice(0, 280);
            textarea.value = this._baseText;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.focus();
        }
    },

    /**
     * Clôture proprement la session d'enregistrement
     * @private
     */
    _finalizeSession() {
        this._cleanInterim();

        if (this._activeButton) {
            this._activeButton.classList.remove('recording');
            const tooltipText = 'Dictée vocale<br><span class="kbd-hint">Démarrer</span>';
            this._activeButton.setAttribute('data-tooltip', tooltipText);
            if (this._activeButton._tippy) {
                this._activeButton._tippy.setContent(tooltipText);
            }
        }

        if (this._activeTarget === 'appreciation') {
            if (this._gotResult) {
                this._setAppreciationBadge('saved');
            } else {
                const badge = document.getElementById('focusAppreciationBadge');
                if (badge && (badge.classList.contains('is-dictating') || badge.classList.contains('dictating'))) {
                    this._setAppreciationBadge('none');
                }
            }
        }

        if (this._gotResult) {
            UI.showNotification('Dictée vocale enregistrée', 'success');
        }

        this._activeButton = null;
        this._activeTarget = null;
        this._baseText = '';
        this._gotResult = false;
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
     * @returns {'context'|'appreciation'|'journal'|null}
     */
    getActiveTarget() {
        return this._activeTarget;
    },

    /**
     * Met à jour le badge de statut de l'appréciation
     * @param {'dictating'|'saved'|'none'} state
     * @private
     */
    _setAppreciationBadge(state) {
        FocusPanelStatus.updateAppreciationStatus(null, { state: state });
    },

    /**
     * Sauvegarde l'appréciation et met à jour la ligne du tableau
     * @param {string} content - Le texte de l'appréciation
     * @private
     */
    _saveAppreciationAndUpdateList(content) {
        const studentId = FocusPanelManager.currentStudentId;
        if (!studentId) return;

        const result = appState.generatedResults.find(r => r.id === studentId);
        if (!result) return;

        result.appreciation = content;
        result.wasGenerated = false;
        result.appreciationSource = 'manual';
        result.tokenUsage = null;
        result.promptHash = PromptService.getPromptHash({
            ...result.studentData,
            id: result.id,
            currentPeriod: appState.currentPeriod
        });
        result.generationPeriod = appState.currentPeriod;
        result.generationSnapshot = null;

        const aiIndicator = document.getElementById('focusAiIndicator');
        if (aiIndicator) aiIndicator.style.display = 'none';

        FocusPanelHistory.push(content);

        FocusPanelManager._isAppreciationEdited = true;
        FocusPanelManager._saveContext();
        FocusPanelManager._updateListRow(result);
        FocusPanelStatus.updateAppreciationStatus(null, { state: 'saved' });
    }
};
