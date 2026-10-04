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

const JOURNAL_NOTE_MAX_LENGTH = 280;

/** Nombre de redémarrages silencieux consécutifs (~8 s chacun) avant arrêt automatique du micro */
const MAX_SILENT_RESTARTS = 4;

/** Délai maximal d'attente des derniers résultats après stop() avant clôture forcée */
const STOP_FLUSH_TIMEOUT_MS = 1500;

/** Champs ciblables par la dictée */
const TARGETS = {
    context: { elementId: 'focusContextInput' },
    appreciation: { elementId: 'focusAppreciationText', isRichText: true },
    journal: { elementId: 'journalNoteInput', maxLength: JOURNAL_NOTE_MAX_LENGTH }
};

const ERROR_MESSAGES = {
    'not-allowed': "Accès au microphone refusé. Autorisez l'accès dans les paramètres du navigateur.",
    'service-not-allowed': "La dictée vocale n'est pas autorisée par le navigateur.",
    'audio-capture': "Aucun microphone détecté. Branchez un micro puis réessayez.",
    'network': "Erreur réseau. Vérifiez votre connexion."
};

const STOP_MIC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2"></rect>
</svg>`;

const isDigitAt = (str, index) => /\d/.test(str[index] ?? '');

/**
 * Moteur de ponctuation et formatage naturel pour la dictée vocale en français
 */
export const SpeechPunctuation = {
    /**
     * Formate et ponctue le texte transcrit
     * @param {string} text - Texte brut transcrit
     * @param {Object} [options]
     * @param {boolean} [options.capitalizeStart=true] - Majuscule sur la première lettre (faux quand le segment prolonge une phrase en cours)
     * @returns {string} - Texte formaté et ponctué
     */
    format(text, { capitalizeStart = true } = {}) {
        if (!text) return '';

        let formatted = text;

        // Préserver les expressions courantes contenant le mot "point" pour éviter
        // qu'elles ne soient transformées en "." (ex: point fort, point faible, faire le point)
        const protectedExpressions = [];
        formatted = formatted.replace(
            /(?<!\p{L})(?:points?\s+(?:forts?|faibles?|d'appui|d'attention|positifs?|négatifs?|de\s+vue|de\s+vigilance|d'amélioration|clés?|cruciaux|culminants?|communs?|morts?)|(?:faire\s+le\s+point|au\s+point|à\s+ce\s+point|mettre\s+au\s+point))(?!\p{L})/giu,
            (match) => {
                const placeholder = `__TKPF_${protectedExpressions.length}__`;
                protectedExpressions.push(match);
                return placeholder;
            }
        );

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
        // Un séparateur collé entre deux chiffres (12:30) fait partie du nombre ou de l'heure : on n'y touche pas.
        formatted = formatted.replace(/\s*([;:!\?])/g, (match, sign, offset, str) =>
            match === sign && sign === ':' && isDigitAt(str, offset - 1) && isDigitAt(str, offset + 1)
                ? match
                : ` ${sign}`
        );

        // Assurer un espace après les signes de ponctuation (sauf au sein de ... et des nombres 12,5 / 12.5)
        formatted = formatted.replace(/(?<!\.)([,;:!\?]|(?<!\.)\.(?!\.))(?!\s|\n|$)/g, (match, sign, offset, str) =>
            /[,.:]/.test(sign) && isDigitAt(str, offset - 1) && isDigitAt(str, offset + 1)
                ? match
                : `${sign} `
        );
        formatted = formatted.replace(/(?<=\.{3})(?!\s|\n|$)/g, ' ');

        // Restaurer les expressions contenant "point" protégées
        protectedExpressions.forEach((original, idx) => {
            formatted = formatted.replace(new RegExp(`__TKPF_${idx}__`, 'g'), original);
        });

        // Nettoyer les espaces autour des sauts de ligne
        formatted = formatted.replace(/[ \t]*\n/g, '\n').replace(/\n[ \t]*/g, '\n');

        // Nettoyer les espaces multiples
        formatted = formatted.replace(/[ \t]+/g, ' ');

        // Majuscule après un point, !, ? ou saut de ligne (et en début de chaîne si demandé)
        const capitalizeRegex = capitalizeStart ? /(?:^|[.!?\n]\s*)(\p{Ll})/gu : /(?:[.!?\n]\s*)(\p{Ll})/gu;
        formatted = formatted.replace(capitalizeRegex, (match, letter) => {
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

    /** @type {string} - Texte validé de la cible (base + segments finaux déjà insérés) */
    _baseText: '',

    /** @type {string} - Dernier texte écrit par la dictée dans le champ (détecte les éditions manuelles) */
    _lastWritten: '',

    /** @type {string} - Transcription provisoire en cours (non encore finale) */
    _interimRaw: '',

    /** @type {string|null} - Élève concerné au démarrage de la dictée */
    _studentId: null,

    /** @type {string} - Contenu initial de l'appréciation avant le début de la dictée */
    _initialAppreciationContent: '',

    /** @type {number} - Redémarrages consécutifs sans parole détectée */
    _silentRestarts: 0,

    /** @type {Function|null} - Démarrage différé d'une autre cible, exécuté à la clôture de la session en cours */
    _pendingStart: null,

    /** @type {number|null} - Minuteur de clôture forcée après stop() */
    _flushTimer: null,

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
                    if (this._activeButton.dataset.originalSvg === undefined) {
                        this._activeButton.dataset.originalSvg = this._activeButton.innerHTML;
                    }
                    this._activeButton.innerHTML = STOP_MIC_SVG;
                    this._setButtonTooltip(this._activeButton, 'Arrêter la dictée<br><span class="kbd-hint">Échap ou clic</span>');
                }

                if (this._activeTarget === 'appreciation') {
                    this._setAppreciationBadge('dictating');

                    // Griser le bouton Générer pendant la dictée vocale
                    const generateBtn = document.getElementById('focusGenerateBtn');
                    if (generateBtn) {
                        generateBtn.disabled = true;
                        generateBtn.classList.add('disabled');
                        generateBtn.setAttribute('data-tooltip', 'Génération indisponible pendant la dictée vocale');
                        generateBtn._tippy?.setContent('Génération indisponible pendant la dictée vocale');
                    }
                }
            };

            this._recognition.onend = () => {
                // En mode continu, Chrome peut déclencher onend après un silence prolongé.
                // Si l'utilisateur n'a pas arrêté manuellement et que l'onglet est toujours visible, on redémarre.
                if (this._isRecording && this._activeButton && this._activeTarget && !document?.hidden) {
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

                this._silentRestarts = 0;

                if (finalTranscript) {
                    this._gotResult = true;
                    this._insertTranscript(finalTranscript);
                }

                if (interimTranscript) {
                    this._renderInterim(interimTranscript);
                }
            };

            this._recognition.onerror = (event) => {
                // Arrêt volontaire (abort) : rien à signaler
                if (event.error === 'aborted') return;

                // 'no-speech' en mode continu est normal lors des pauses de réflexion de l'utilisateur.
                // Au-delà de quelques pauses consécutives, on coupe le micro plutôt que de l'écouter indéfiniment.
                if (event.error === 'no-speech' && this._isRecording) {
                    this._silentRestarts += 1;
                    if (this._silentRestarts >= MAX_SILENT_RESTARTS) {
                        this.stop();
                        UI.showNotification("Dictée arrêtée : aucune voix détectée.", 'info');
                    }
                    return;
                }

                this._isRecording = false;
                this._pendingStart = null;
                this._finalizeSession();

                UI.showNotification(ERROR_MESSAGES[event.error] ?? "Erreur de reconnaissance vocale.", 'error');
            };
        }

        this.setupButton(contextMicBtn, 'context');
        this.setupButton(appreciationMicBtn, 'appreciation');

        if (!this._visibilityListenerAttached && typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && this._isRecording) {
                    this.stop();
                }
            });
            this._visibilityListenerAttached = true;
        }
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

            // Une autre session est active ou se termine : on enchaîne dès qu'elle est clôturée
            // (relancer start() avant la fin de la session précédente lèverait InvalidStateError)
            if (this._activeButton) {
                this._pendingStart = () => this._startRecording(btn, target);
                if (this._isRecording) this.stop();
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
            const field = this._getField();
            this._baseText = field ? this._readCommitted(field) : '';
            this._lastWritten = this._baseText;
            this._initialAppreciationContent = target === 'appreciation' ? this._baseText : '';
            this._interimRaw = '';
            this._silentRestarts = 0;
            this._studentId = FocusPanelManager.currentStudentId ?? null;

            // Pour un champ richText (contenteditable) vide : éliminer les <br> ou espaces résiduels
            if (TARGETS[target]?.isRichText && field && !this._baseText.trim()) {
                field.innerHTML = '';
                this._baseText = '';
                this._lastWritten = '';
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
     * Arrête l'enregistrement en cours. La session est clôturée à la fin de la reconnaissance
     * (onend), ce qui laisse le temps aux derniers mots prononcés d'être validés.
     */
    stop() {
        if (!this._isRecording && !this._activeButton) return;
        this._isRecording = false;

        if (!this._recognition) {
            this._finalizeSession();
            return;
        }

        try {
            this._recognition.stop();
        } catch (_) {
            this._finalizeSession();
            return;
        }

        this._flushTimer = setTimeout(() => this._finalizeSession(), STOP_FLUSH_TIMEOUT_MS);
    },

    /**
     * Interrompt immédiatement la dictée et abandonne la transcription provisoire.
     * À utiliser quand la cible disparaît (fermeture du panneau, changement d'élève).
     */
    abort() {
        if (!this._isRecording && !this._activeButton) return;
        this._isRecording = false;
        this._pendingStart = null;

        try {
            this._recognition?.abort();
        } catch (_) {
            // Reconnaissance déjà arrêtée
        }

        this._finalizeSession({ commitInterim: false });
    },

    /**
     * Champ DOM de la cible active
     * @returns {HTMLElement|null}
     * @private
     */
    _getField() {
        const config = TARGETS[this._activeTarget];
        return config ? document.getElementById(config.elementId) : null;
    },

    /**
     * Texte validé d'un champ (hors aperçu provisoire)
     * @param {HTMLElement} field
     * @returns {string}
     * @private
     */
    _readCommitted(field) {
        if (!TARGETS[this._activeTarget]?.isRichText) return field.value ?? '';

        const clone = field.cloneNode(true);
        clone.querySelector('.dictation-interim')?.remove();
        return clone.textContent ?? '';
    },

    /**
     * Écrit un texte dans le champ de la cible active
     * @param {HTMLElement} field
     * @param {string} text
     * @private
     */
    _writeField(field, text) {
        if (TARGETS[this._activeTarget]?.isRichText) {
            field.textContent = text;
        } else {
            field.value = text;
        }
        this._lastWritten = text;
    },

    /**
     * Adopte le contenu du champ comme nouvelle base si l'utilisateur l'a modifié pendant la dictée
     * @param {HTMLElement} field
     * @private
     */
    _syncBaseText(field) {
        const current = this._readCommitted(field);
        if (current !== this._lastWritten) {
            this._baseText = current;
            this._lastWritten = current;
        }
    },

    /**
     * Espace à insérer avant un nouveau segment
     * @returns {string}
    /**
     * Espace à insérer avant un nouveau segment
     * @param {string} [nextSegment=''] - Segment à concaténer
     * @returns {string}
     * @private
     */
    _separator(nextSegment = '') {
        if (!this._baseText.length) return '';
        // Si le segment commence par une ponctuation simple (. , ...) ou saut de ligne : jamais d'espace avant
        if (/^[\n,\.]/u.test(nextSegment.trimStart())) return '';
        // Si la base se termine déjà par un espace ou un saut de ligne : pas d'espace supplémentaire
        if (/\s$/.test(this._baseText)) return '';
        return ' ';
    },

    /**
     * Formate un segment, avec majuscule seulement s'il démarre une phrase
     * @param {string} text
     * @returns {string}
     * @private
     */
    _format(text) {
        const startsSentence = !this._baseText.trim() || /[.!?\n]\s*$/.test(this._baseText);
        return SpeechPunctuation.format(text, { capitalizeStart: startsSentence });
    },

    /**
     * Applique la longueur maximale propre à la cible
     * @param {string} text
     * @returns {string}
     * @private
     */
    _clamp(text) {
        const max = TARGETS[this._activeTarget]?.maxLength;
        return max ? text.slice(0, max) : text;
    },

    /**
     * Affiche l'aperçu streaming des mots en cours de prononciation
     * @param {string} interimText
     * @private
     */
    _renderInterim(interimText) {
        const field = this._getField();
        if (!field || !interimText) return;

        this._syncBaseText(field);
        this._interimRaw = interimText;

        const formatted = this._format(interimText);
        const text = this._separator(formatted) + formatted;

        if (TARGETS[this._activeTarget].isRichText) {
            field.classList.remove('empty');

            let interimSpan = field.querySelector('.dictation-interim');
            if (!this._baseText.trim()) {
                if (!interimSpan) {
                    field.innerHTML = '';
                    interimSpan = document.createElement('span');
                    interimSpan.className = 'dictation-interim';
                    field.appendChild(interimSpan);
                } else {
                    while (field.firstChild && field.firstChild !== interimSpan) {
                        field.removeChild(field.firstChild);
                    }
                }
            } else {
                if (!interimSpan) {
                    interimSpan = document.createElement('span');
                    interimSpan.className = 'dictation-interim';
                    field.appendChild(interimSpan);
                }
            }
            interimSpan.textContent = text;
            field.scrollTop = field.scrollHeight;
            return;
        }

        this._writeField(field, this._clamp(this._baseText + text));
        field.scrollTop = field.scrollHeight;
    },

    /**
     * Retire l'aperçu streaming. La transcription provisoire restante est validée
     * (sauf abandon explicite) pour ne perdre aucun mot.
     * @param {boolean} commit - Valider la transcription provisoire restante
     * @private
     */
    _cleanInterim(commit) {
        const pending = this._interimRaw.trim();
        this._interimRaw = '';

        if (commit && pending) {
            this._insertTranscript(pending);
            return;
        }

        const field = this._getField();
        if (!field) return;

        this._syncBaseText(field);
        if (this._readCommitted(field) !== this._baseText) {
            this._writeField(field, this._baseText);
        }
        field.querySelector('.dictation-interim')?.remove();

        if (TARGETS[this._activeTarget]?.isRichText && !field.textContent?.trim()) {
            field.innerHTML = '';
            field.classList.add('empty');
        }
    },

    /**
     * Insère et valide un bloc de texte transcrit définitif
     * @param {string} transcript - Le texte reconnu
     * @private
     */
    _insertTranscript(transcript) {
        const field = this._getField();
        if (!field || !transcript) return;

        // Le panneau a changé d'élève : ne jamais écrire sur un autre élève
        if (this._studentId !== (FocusPanelManager.currentStudentId ?? null)) {
            this.abort();
            return;
        }

        this._syncBaseText(field);
        this._interimRaw = '';

        const formatted = this._format(transcript);
        if (/^[\n,\.]/u.test(formatted.trimStart())) {
            this._baseText = this._baseText.trimEnd();
        }
        this._baseText = this._clamp(this._baseText + this._separator(formatted) + formatted);
        this._writeField(field, this._baseText);
        field.dispatchEvent(new Event('input', { bubbles: true }));

        if (!TARGETS[this._activeTarget].isRichText) {
            field.focus();
            return;
        }

        field.classList.remove('empty');

        // Placer le curseur à la fin
        try {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(field);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        } catch (_) {}

        this._saveAppreciationAndUpdateList(this._baseText);
    },

    /**
     * Clôture proprement la session d'enregistrement
     * @param {Object} [options]
     * @param {boolean} [options.commitInterim=true] - Valider la transcription provisoire restante
     * @private
     */
    _finalizeSession({ commitInterim = true } = {}) {
        clearTimeout(this._flushTimer);
        this._flushTimer = null;

        this._cleanInterim(commitInterim);

        if (this._activeButton) {
            this._activeButton.classList.remove('recording');
            if (this._activeButton.dataset.originalSvg !== undefined) {
                this._activeButton.innerHTML = this._activeButton.dataset.originalSvg;
                delete this._activeButton.dataset.originalSvg;
            }
            this._setButtonTooltip(this._activeButton, 'Dictée vocale<br><span class="kbd-hint">Démarrer</span>');
        }

        if (this._activeTarget === 'appreciation') {
            const generateBtn = document.getElementById('focusGenerateBtn');
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.classList.remove('disabled');
            }

            const studentId = this._studentId ?? FocusPanelManager.currentStudentId;
            const result = appState.generatedResults?.find(r => r.id === studentId);
            if (result) {
                result.errorMessage = null;
                result.errorPeriod = null;

                if (studentId === FocusPanelManager.currentStudentId && generateBtn) {
                    FocusPanelManager._updateGenerateButton?.(result);
                }
            }

            if (this._gotResult) {
                // Si le contenu a effectivement changé, on n'ajoute qu'une SEULE entrée propre dans l'historique
                if (this._baseText && this._baseText !== this._initialAppreciationContent) {
                    FocusPanelHistory.push(this._baseText, 'dictation');
                }
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

        const next = this._pendingStart;

        this._activeButton = null;
        this._activeTarget = null;
        this._baseText = '';
        this._lastWritten = '';
        this._initialAppreciationContent = '';
        this._studentId = null;
        this._gotResult = false;
        this._pendingStart = null;

        next?.();
    },

    /**
     * Cible active de l'enregistrement en cours
     * @returns {'context'|'appreciation'|'journal'|null}
     */
    getActiveTarget() {
        return this._activeTarget;
    },

    /**
     * Met à jour le tooltip d'un bouton micro (attribut + instance Tippy)
     * @param {HTMLElement} btn
     * @param {string} html
     * @private
     */
    _setButtonTooltip(btn, html) {
        btn.setAttribute('data-tooltip', html);
        btn._tippy?.setContent(html);
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
     * Met à jour le badge de statut de l'appréciation
     * @param {'dictating'|'saved'|'none'} state
     * @private
     */
    _setAppreciationBadge(state) {
        const studentId = this._studentId ?? FocusPanelManager.currentStudentId;
        const result = studentId ? appState.generatedResults?.find(r => r.id === studentId) : null;
        FocusPanelStatus.updateAppreciationStatus(result, { state: state });
    },

    /**
     * Sauvegarde l'appréciation et met à jour la ligne du tableau
     * @param {string} content - Le texte de l'appréciation
     * @private
     */
    _saveAppreciationAndUpdateList(content) {
        const studentId = this._studentId ?? FocusPanelManager.currentStudentId;
        if (!studentId) return;

        const result = appState.generatedResults?.find(r => r.id === studentId);
        if (!result) return;

        result.appreciation = content;
        if (result.studentData) {
            if (!result.studentData.periods) result.studentData.periods = {};
            if (!result.studentData.periods[appState.currentPeriod]) result.studentData.periods[appState.currentPeriod] = {};
            result.studentData.periods[appState.currentPeriod].appreciation = content;
        }
        result.wasGenerated = false;
        result.appreciationSource = 'manual';
        result.errorMessage = null;
        result.errorPeriod = null;
        result.tokenUsage = null;
        result.promptHash = PromptService.getPromptHash({
            ...result.studentData,
            id: result.id,
            currentPeriod: appState.currentPeriod
        });
        result.generationPeriod = appState.currentPeriod;
        result.generationSnapshot = null;

        const aiIndicator = document.getElementById('focusAiIndicator');
        if (aiIndicator) {
            aiIndicator.style.display = 'inline-flex';
            aiIndicator.innerHTML = '<iconify-icon icon="solar:pen-linear"></iconify-icon>';
            aiIndicator.className = 'source-indicator source-manual';
            aiIndicator.setAttribute('data-tooltip', 'Rédigé manuellement');
        }

        // NOTE : On ne pousse PAS dans l'historique sur chaque segment intermédiaire.
        // L'historique n'enregistrera qu'une seule entrée consolidée à la clôture de la dictée.

        FocusPanelManager._isAppreciationEdited = true;
        FocusPanelManager._saveContext();
        FocusPanelManager._updateListRow?.(result);
        FocusPanelStatus.updateSourceIndicator?.(result);
        FocusPanelStatus.updateAppreciationStatus(result, { state: 'saved' });
    }
};
