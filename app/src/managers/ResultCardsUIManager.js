/**
 * @fileoverview Gestionnaire de l'affichage des cartes de résultats.
 * 
 * Ce module gère le rendu et la mise à jour des cartes de résultats d'élèves,
 * y compris les animations, l'affichage des notes, et les indicateurs d'IA.
 * 
 * @module managers/ResultCardsUIManager
 */

import { appState } from '../state/State.js';
import { CONFIG, DEFAULT_IA_CONFIG } from '../config/Config.js';
import { MODEL_SHORT_NAMES } from '../config/models.js'; // Import ajouté
import { Utils } from '../utils/Utils.js';
import { DOM } from '../utils/DOM.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { StorageManager } from './StorageManager.js';

/** @type {import('./UIManager.js').UI} */
let UI;

/**
 * Module de gestion des cartes de résultats.
 * @namespace ResultCardsUI
 */
export const ResultCardsUI = {
    /**
     * Initialise le module avec une référence au UIManager.
     * @param {Object} uiInstance - Instance du UIManager
     */
    init(uiInstance) {
        UI = uiInstance;
    },

    /**
     * Retourne les informations sur le mode de génération (icône, tooltip).
     * @param {Object} result - Résultat de l'élève
     * @returns {{icon: string, tooltip: string}}
     */
    getGenerationModeInfo(result) {
        const sd = result.studentData || {};
        const modelKey = sd.currentAIModel || appState.currentAIModel;
        // Utiliser le nom court s'il existe, sinon la clé brute
        const modelName = MODEL_SHORT_NAMES[modelKey] || modelKey;

        // Construire le tooltip selon les données disponibles
        const parts = [modelName];

        // Ajouter les tokens seulement s'ils sont disponibles et > 0
        const tokens = result.tokenUsage?.appreciation?.total_tokens;
        if (tokens && tokens > 0) {
            parts.push(`${tokens} tokens`);
        }

        // Ajouter le temps seulement s'il est disponible et > 0
        // Note: generationTimeMs est toujours mesuré côté client, indépendamment des tokens API
        const timeMs = result.tokenUsage?.generationTimeMs;
        if (timeMs && timeMs > 0) {
            const timeStr = timeMs >= 1000
                ? `${(timeMs / 1000).toFixed(1)}s`
                : `${timeMs}ms`;
            parts.push(timeStr);
        }

        // Fallback si aucune métadonnée disponible
        const tip = parts.length > 1 ? parts.join(' • ') : `${modelName} • Généré par IA`;

        return { icon: '✨', tooltip: tip };
    },

    /**
     * Détermine la classe CSS associée à une note, alignée sur l'histogramme.
     * @param {number} grade - La note (0-20)
     * @returns {string} Classe CSS ('grade-range-0-4', 'grade-range-4-8', etc.)
     */
    getGradeClass(grade) {
        if (typeof grade !== 'number' || isNaN(grade)) return '';
        if (grade < 4) return 'grade-range-0-4';
        if (grade < 8) return 'grade-range-4-8';
        if (grade < 12) return 'grade-range-8-12';
        if (grade < 16) return 'grade-range-12-16';
        return 'grade-range-16-20';
    },

    /**
     * Determines the evolution type dynamically based on current thresholds.
     * @param {number} diff - Evolution value
     * @returns {string} 'positive', 'negative', 'stable', etc.
     */
    _getEvolutionType(diff) {
        if (diff === null || isNaN(diff)) return 'stable';
        const t = appState.evolutionThresholds;

        if (diff >= t.veryPositive) return 'very-positive';
        if (diff >= t.positive) return 'positive';

        if (diff <= t.veryNegative) return 'very-negative';
        if (diff <= t.negative) return 'negative';

        return 'stable';
    },

    /**
     * Génère le HTML pour l'affichage des notes et évolutions.
     * @param {Object} result - Résultat de l'élève
     * @returns {string} HTML des bulles de notes
     */
    _getGradesHTML(result) {
        const sd = result.studentData || {};
        let html = '';
        const periods = Utils.getPeriods();
        const currentPeriodIndex = periods.indexOf(sd.currentPeriod);

        periods.forEach((p, index) => {
            if (index <= currentPeriodIndex) {
                const grade = sd.periods[p]?.grade;
                const gradeText = typeof grade === 'number' ? grade.toFixed(1).replace('.', ',') : 'NC';

                const isCurrentPeriodForView = (p === sd.currentPeriod);
                const bubbleClasses = ['grade-bubble'];
                if (isCurrentPeriodForView) {
                    bubbleClasses.push('current-period-grade');
                }
                const gradeClass = this.getGradeClass(grade);
                if (gradeClass) {
                    bubbleClasses.push(gradeClass);
                }

                // Note : pas de tooltip sur les notes car elles s'atténuent au survol du container
                html += `<div class="${bubbleClasses.join(' ')}" data-period="${p}">${gradeText}</div>`;

                if (index < periods.length - 1 && index < currentPeriodIndex) {
                    const nextPeriod = periods[index + 1];
                    let evo = Utils.getRelevantEvolution(result.evolutions, nextPeriod);

                    // FALLBACK: Si pas d'évolution stockée, calculer depuis les notes
                    if (!evo && sd.periods) {
                        const currentGrade = sd.periods[p]?.grade;
                        const nextGrade = sd.periods[nextPeriod]?.grade;
                        if (typeof currentGrade === 'number' && typeof nextGrade === 'number') {
                            evo = { valeur: nextGrade - currentGrade };
                        }
                    }

                    if (evo) {
                        const evoType = this._getEvolutionType(evo.valeur);
                        const arrowMap = {
                            'very-positive': { class: 'evolution-very-positive' },
                            'positive': { class: 'evolution-positive' },
                            'stable': { class: 'evolution-stable' },
                            'negative': { class: 'evolution-negative' },
                            'very-negative': { class: 'evolution-very-negative' }
                        };
                        const { class: arrowClass } = arrowMap[evoType] || arrowMap['stable'];
                        // Pas de tooltip sur les flèches non plus
                        html += `<span class="grade-arrow ${arrowClass}"><i class="fas fa-arrow-right"></i></span>`;
                    }
                }
            }
        });
        return html;
    },

    /**
     * Crée et peuple un élément DOM pour une carte résultat.
     * @param {Object} result - Données du résultat
     * @returns {HTMLElement} Élément de la carte
     */
    populateResultCard(result) {
        const template = document.getElementById('student-result-template');
        if (!template) {
            console.error("Le template de carte de résultat est introuvable.");
            return document.createElement('div');
        }
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.appreciation-result');

        const evo = Utils.getRelevantEvolution(result.evolutions, result.studentData.currentPeriod);
        let evoClass = 'evo-stable';
        if (evo) {
            const evoType = this._getEvolutionType(evo.valeur);
            if (['very-positive', 'positive'].includes(evoType)) evoClass = 'evo-positive';
            else if (['very-negative', 'negative'].includes(evoType)) evoClass = 'evo-negative';
        }
        card.classList.add(evoClass);

        const elements = {
            nameContainer: card.querySelector('.student-name-container'),
            name: card.querySelector('[data-template="name"]'),
            grades: card.querySelector('[data-template="grades"]'),
            appreciation: card.querySelector('[data-template="appreciation"]'),
            subject: card.querySelector('[data-template="subject"]'),
            wordCount: card.querySelector('[data-template="wordCount"]'),
            copyBtn: card.querySelector('[data-action="copy"]'),
            regenerateBtn: card.querySelector('[data-action="regenerate"]'),
            toggleVersionBtn: card.querySelector('[data-action="toggle-version"]')
        };

        const sd = result.studentData || {};
        card.dataset.id = result.id;
        card.classList.toggle('has-error', !!result.errorMessage);
        card.classList.toggle('is-editing', result.id === appState.currentEditingId);
        card.classList.toggle('is-placeholder-for-period', result.isPlaceholderForPeriod);

        // aiGenerationPeriod existe dans le résultat transformé (renderResults),
        // sinon on utilise sd.currentPeriod (stocké dans appState.generatedResults)
        const aiGenPeriod = result.aiGenerationPeriod ?? sd.currentPeriod;
        const isOriginalAIGeneration = (appState.currentPeriod === aiGenPeriod);

        elements.name.innerHTML = `<span class="student-identity">${result.prenom} ${result.nom}</span>`;

        // Indicateur Technique (Coin)
        if (isOriginalAIGeneration) {
            const techInfo = this.getGenerationModeInfo(result);
            const techCorner = document.createElement('div');
            techCorner.className = 'ai-tech-corner tooltip';
            techCorner.dataset.tooltip = techInfo.tooltip;
            techCorner.innerHTML = techInfo.icon;

            // Insérer dans le wrapper principal pour positionnement absolu
            const wrapper = card.querySelector('.card-content-wrapper');
            if (wrapper) wrapper.appendChild(techCorner);
        }

        // Get the parent .student-name div for appending status chips
        if (sd.statuses && sd.statuses.length > 0 && studentNameDiv) {
            sd.statuses.forEach(statut => {
                const badgeInfo = Utils.getStatusBadgeInfo(statut);
                const statutChip = document.createElement('span');
                // Use the classes from Utils but ensure tooltip class is added if needed, 
                // though Utils classes are sufficient for styling.
                // We'll map the Utils classes to the chip.
                statutChip.className = `statut-chip tooltip ${badgeInfo.className}`;
                // Note: badgeInfo.className returns 'tag-badge tag-warning' etc.
                // The CSS for .statut-chip might conflict or redundant with .tag-badge.
                // Let's check CSS. .statut-chip has base styles. .tag-badge has similar.
                // To be safe and consistent, let's use the Utils class for color
                // and keep statut-chip for layout if needed, OR swtich to tag-badge entirely.
                // Given the screenshot showing colored pills, tag-badge styles (from ListView) seem to be what we want.
                // But we are in a card header.
                // Let's rely on the color classes (tag-warning, tag-info) which likely work with tag-badge.
                // ResultCards expects .statut-chip specifically for some potential layout rules?
                // Let's assign the specific color classes directly based on Utils logic return.

                // Construct styles based on Utils return:
                if (badgeInfo.className.includes('tag-warning')) statutChip.classList.add('statut-warning'); // Mapping to existing card css if any or just use the color class
                else if (badgeInfo.className.includes('tag-info')) statutChip.classList.add('statut-nouveau');
                else if (badgeInfo.className.includes('tag-danger')) statutChip.classList.add('statut-depart');

                // Actuellement ResultCardsUI utilise .statut-nouveau et .statut-depart.
                // Utils renvoie tag-info et tag-danger.
                // On va adaptor pour utiliser les classes de Utils SUR le span, en gardant statut-chip pour la structure

                statutChip.className = `statut-chip tooltip ${badgeInfo.className}`;

                const statutShort = statut.split(' ')[0];
                let statutTooltip = `Statut : ${statut}`;
                if (statut.startsWith('Nouveau')) {
                    statutTooltip = `Nouvel élève à la période ${statut.split(' ')[1] || ''}`;
                } else if (statut.startsWith('Départ')) {
                    statutTooltip = `Élève parti à la période ${statut.split(' ')[1] || ''}`;
                }
                statutChip.textContent = statutShort;
                statutChip.dataset.tooltip = statutTooltip;
                studentNameDiv.appendChild(statutChip);
            });
        }

        elements.grades.innerHTML = this._getGradesHTML(result);

        if (result.errorMessage) {
            elements.appreciation.innerHTML = `<p class="error-text">⚠️ ${result.errorMessage}</p>`;
        } else if (result.isPending || (!result.appreciation && !result.isPlaceholderForPeriod)) {
            // État "en attente" - pas encore d'appréciation générée
            elements.appreciation.innerHTML = `
                <div class="pending-appreciation">
                    <i class="fas fa-hourglass-half"></i>
                    <span>Appréciation non générée</span>
                    <button class="btn btn-small btn-primary generate-single-btn" data-id="${result.id}">
                        <i class="fas fa-wand-magic-sparkles"></i> Générer
                    </button>
                </div>
            `;
            card.classList.add('is-pending');
        } else if (result.appreciation) {
            elements.appreciation.innerHTML = Utils.decodeHtmlEntities(Utils.cleanMarkdown(result.appreciation));
        } else {
            elements.appreciation.innerHTML = `<p class="appreciation-placeholder-text">Pas d'appréciation pour cette période.</p>`;
        }

        elements.subject.textContent = sd.subject || 'Générique';
        elements.subject.dataset.tooltip = `Matière : ${sd.subject || 'Générique'}`;

        const appreciationText = result.appreciation || '';
        const wordCount = Utils.countWords(appreciationText);
        const charCount = Utils.countCharacters(appreciationText);
        const subjectData = appState.subjects[sd.subject || 'Générique'];
        const targetLength = subjectData?.iaConfig?.length || DEFAULT_IA_CONFIG.length;
        const isOverLimit = wordCount > targetLength * (1 + CONFIG.WORD_COUNT_TOLERANCE);

        elements.wordCount.textContent = `${wordCount} mot${wordCount > 1 ? 's' : ''}`;
        elements.wordCount.classList.toggle('over-limit', isOverLimit);
        elements.wordCount.dataset.tooltip = isOverLimit
            ? `${charCount} car. — Dépasse la cible de ~${targetLength} mots`
            : `${charCount} caractères`;

        elements.copyBtn.classList.toggle('was-copied', result.copied);
        elements.copyBtn.querySelector('i').className = `fas ${result.copied ? 'fa-check' : 'fa-copy'}`;

        if (elements.regenerateBtn) {
            elements.regenerateBtn.classList.toggle('warning', !!result.errorMessage);
            elements.regenerateBtn.style.display = (isOriginalAIGeneration && !result.isPlaceholderForPeriod) ? 'flex' : 'none';
        }

        // Afficher le bouton toggle-version si un historique existe
        if (elements.toggleVersionBtn) {
            const hasHistory = result.history && result.history.length > 0;
            elements.toggleVersionBtn.style.display = hasHistory ? 'flex' : 'none';
            elements.toggleVersionBtn.classList.toggle('showing-original', !!result.isShowingOriginal);
            elements.toggleVersionBtn.dataset.tooltip = result.isShowingOriginal
                ? 'Revenir à la nouvelle version'
                : 'Voir version précédente';
        }

        if (elements.nameContainer) {
            elements.nameContainer.style.cursor = (isOriginalAIGeneration && !result.isPlaceholderForPeriod) ? 'pointer' : 'default';
            if (!isOriginalAIGeneration || result.isPlaceholderForPeriod) {
                elements.nameContainer.removeAttribute('data-action');
            }
        }

        return card;
    },

    /**
     * Met à jour une carte résultat existante, avec animation optionnelle.
     * @param {string} id - ID du résultat
     * @param {Object} options - Options d'animation
     */
    async updateResultCard(id, options = { animate: false }) {
        const result = appState.generatedResults.find(r => r.id === id);
        if (!result) return;
        const card = DOM.resultsDiv.querySelector(`.appreciation-result[data-id="${id}"]`);
        if (card) {
            await this._updateCardContent(card, result, options);

            UI.updateStats();
            UI.updateControlButtons();
            UI.updateAIButtonsState();
            UI.updateCopyAllButton();
            StorageManager.saveAppState();

            UI.initTooltips();
        } else {
            AppreciationsManager.renderResults(id, 'edit');
        }
    },

    /**
     * Met à jour le contenu d'une carte (interne).
     * @param {HTMLElement} card - Élément carte
     * @param {Object} result - Données du résultat
     * @param {Object} options - Options
     */
    async _updateCardContent(card, result, options = { animate: false }) {
        const cardContentWrapper = card.querySelector('.card-content-wrapper');
        if (!cardContentWrapper) return;

        // Mettre à jour l'état d'erreur de la carte
        card.classList.toggle('has-error', !!result.errorMessage);

        const sd = result.studentData || {};
        const activePeriod = appState.currentPeriod;
        const periodData = sd.periods[activePeriod] || {};
        const isNowPlaceholder = !periodData.appreciation && typeof periodData.grade !== 'number' && !result.errorMessage;
        card.classList.toggle('is-placeholder-for-period', isNowPlaceholder);

        const animationPromises = [];

        const updateTextWithHighlight = (selector, newText, isHTML = false) => {
            const element = card.querySelector(selector);
            if (!element) return;

            const hasChanged = isHTML ? element.innerHTML !== newText : element.textContent !== newText;
            if (hasChanged && options.animate) {
                if (isHTML) element.innerHTML = newText;
                else element.textContent = newText;

                element.classList.add('flash-bg');
                element.addEventListener('animationend', () => element.classList.remove('flash-bg'), { once: true });
            } else if (hasChanged) {
                if (isHTML) element.innerHTML = newText;
                else element.textContent = newText;
            }
        };

        const { icon, tooltip } = this.getGenerationModeInfo(result);
        const newNameHTML = `<span class="student-identity">${result.prenom} ${result.nom}</span>`;
        updateTextWithHighlight('[data-template="name"]', newNameHTML, true);

        // Update Tech Corner
        let techCorner = cardContentWrapper.querySelector('.ai-tech-corner');
        // aiGenerationPeriod existe dans le résultat transformé (renderResults),
        // sinon on utilise sd.currentPeriod (stocké dans appState.generatedResults)
        const aiGenPeriod = result.aiGenerationPeriod ?? sd.currentPeriod;
        const isOriginalAIGeneration = (appState.currentPeriod === aiGenPeriod);

        if (isOriginalAIGeneration) {
            if (!techCorner) {
                techCorner = document.createElement('div');
                techCorner.className = 'ai-tech-corner tooltip';
                cardContentWrapper.appendChild(techCorner);
            }
            if (techCorner.innerHTML !== icon) techCorner.innerHTML = icon;
            techCorner.dataset.tooltip = tooltip;
        } else if (techCorner) {
            techCorner.remove();
        }

        // Append status chips to .student-name div (parent), not the name span
        const studentNameDiv = card.querySelector('.student-name');
        if (studentNameDiv) {
            studentNameDiv.querySelectorAll('.statut-chip').forEach(chip => chip.remove());
            if (sd.statuses && sd.statuses.length > 0) {
                sd.statuses.forEach(statut => {
                    const badgeInfo = Utils.getStatusBadgeInfo(statut);
                    const statutChip = document.createElement('span');
                    statutChip.className = `statut-chip tooltip ${badgeInfo.className}`;

                    const statutShort = statut.split(' ')[0];
                    let statutTooltip = `Statut : ${statut}`;
                    if (statut.startsWith('Nouveau')) {
                        statutTooltip = `Nouvel élève à la période ${statut.split(' ')[1] || ''}`;
                    } else if (statut.startsWith('Départ')) {
                        statutTooltip = `Élève parti à la période ${statut.split(' ')[1] || ''}`;
                    }
                    statutChip.textContent = statutShort;
                    statutChip.dataset.tooltip = statutTooltip;
                    studentNameDiv.appendChild(statutChip);
                });
            }
        }

        const gradesContainer = card.querySelector('[data-template="grades"]');
        if (gradesContainer) {
            const oldBubbles = new Map();
            gradesContainer.querySelectorAll('.grade-bubble').forEach(b => {
                oldBubbles.set(b.dataset.period, parseFloat(b.textContent.replace(',', '.')) || 0);
            });

            gradesContainer.innerHTML = this._getGradesHTML(result);

            gradesContainer.querySelectorAll('.grade-bubble').forEach(newBubble => {
                const period = newBubble.dataset.period;
                const oldValue = oldBubbles.get(period) ?? 0;
                const newValue = parseFloat(newBubble.textContent.replace(',', '.')) || 0;
                if (oldValue !== newValue) {
                    animationPromises.push(UI.animateValue(newBubble, oldValue, newValue, 800));
                }
            });
        }

        const appreciationEl = card.querySelector('[data-template="appreciation"]');
        if (appreciationEl) {
            let newAppreciationHTML;
            if (result.errorMessage) {
                newAppreciationHTML = `<p class="error-text">⚠️ ${result.errorMessage}</p>`;
            } else if (result.appreciation) {
                newAppreciationHTML = Utils.decodeHtmlEntities(Utils.cleanMarkdown(result.appreciation));
            } else {
                newAppreciationHTML = `<p class="appreciation-placeholder-text">Pas d'appréciation pour cette période.</p>`;
            }
            if (appreciationEl.innerHTML !== newAppreciationHTML || options.animate) {

                if (options.animate) {
                    animationPromises.push(UI.animateTextTyping(appreciationEl, newAppreciationHTML));
                } else {
                    appreciationEl.innerHTML = newAppreciationHTML;
                }
            }
        }

        updateTextWithHighlight('[data-template="subject"]', sd.subject || 'Générique');

        const wordCountEl = card.querySelector('[data-template="wordCount"]');
        if (wordCountEl) {
            const appreciationText = result.appreciation || '';
            const newCount = Utils.countWords(appreciationText);
            const newCharCount = Utils.countCharacters(appreciationText);
            const subjectData = appState.subjects[sd.subject || 'Générique'];
            const targetLength = subjectData?.iaConfig?.length || DEFAULT_IA_CONFIG.length;
            const isOverLimit = newCount > targetLength * (1 + CONFIG.WORD_COUNT_TOLERANCE);

            const oldCount = parseInt(wordCountEl.textContent) || 0;
            if (newCount !== oldCount) {
                animationPromises.push(UI.animateNumberWithText(wordCountEl, oldCount, newCount, 500,
                    (val) => `${val} mot${val !== 1 ? 's' : ''}`
                ));
            } else {
                wordCountEl.textContent = `${newCount} mot${newCount !== 1 ? 's' : ''}`;
            }

            wordCountEl.classList.toggle('over-limit', isOverLimit);
            wordCountEl.dataset.tooltip = isOverLimit
                ? `${newCharCount} car. — Dépasse la cible de ~${targetLength} mots`
                : `${newCharCount} caractères`;
        }

        const copyBtn = card.querySelector('[data-action="copy"]');
        if (copyBtn) {
            copyBtn.classList.remove('copied');
            copyBtn.classList.toggle('was-copied', result.copied);
            copyBtn.querySelector('i').className = `fas ${result.copied ? 'fa-check' : 'fa-copy'}`;
        }

        // Mettre à jour la visibilité du bouton toggle-version
        const toggleVersionBtn = card.querySelector('[data-action="toggle-version"]');
        if (toggleVersionBtn) {
            const hasHistory = result.history && result.history.length > 0;
            toggleVersionBtn.style.display = hasHistory ? 'flex' : 'none';
            toggleVersionBtn.classList.toggle('showing-original', !!result.isShowingOriginal);
            toggleVersionBtn.dataset.tooltip = result.isShowingOriginal
                ? 'Revenir à la nouvelle version'
                : 'Voir version précédente';
        }

        await Promise.all(animationPromises);

        if (options.animate) {
            cardContentWrapper.classList.add('is-updating');
            cardContentWrapper.addEventListener('animationend', () => cardContentWrapper.classList.remove('is-updating'), { once: true });
        }
    },
};
