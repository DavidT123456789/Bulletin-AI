/**
 * @fileoverview Focus Panel Grades — Rendu des notes, flèches d'évolution, contexte et timeline élève
 * Extrait de FocusPanelManager.js (Lot 11 — Découpage God Object #1)
 * @module managers/focus/FocusPanelGrades
 */

import { appState } from '../../state/State.js';
import { Utils } from '../../utils/Utils.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { FocusPanelStatus } from '../FocusPanelStatus.js';
import { FocusPanelGenerator } from './FocusPanelGenerator.js';

export const FocusPanelGrades = {
    /**
     * Ajuste automatiquement la hauteur d'un textarea selon son contenu
     * @param {Object} panel - Instance FocusPanelManager
     * @param {HTMLTextAreaElement|null} textarea
     */
    autoResizeTextarea(panel, textarea) {
        if (!textarea) return;
        textarea.rows = 1;
        textarea.style.height = 'auto';

        const maxHeight = 140;
        const targetHeight = textarea.scrollHeight;

        if (targetHeight > maxHeight) {
            textarea.style.height = maxHeight + 'px';
            textarea.style.overflowY = 'auto';
        } else {
            const computedStyle = window.getComputedStyle(textarea);
            const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;
            const borderBottom = parseFloat(computedStyle.borderBottomWidth) || 0;
            textarea.style.height = (targetHeight + borderTop + borderBottom) + 'px';
            textarea.style.overflowY = 'hidden';
        }
        panel.updateScrollAffordances();
    },

    /**
     * Génère le HTML de la flèche d'évolution entre deux moyennes
     * @param {number|string|null} gradeA
     * @param {number|string|null} gradeB
     * @returns {string}
     */
    getEvolutionHtml(gradeA, gradeB) {
        if (gradeA === null || gradeA === undefined || gradeA === '' ||
            gradeB === null || gradeB === undefined || gradeB === '') {
            return '<span class="grade-evolution neutral"><iconify-icon icon="ph:arrow-right-bold"></iconify-icon></span>';
        }
        const valA = parseFloat(gradeA);
        const valB = parseFloat(gradeB);
        if (isNaN(valA) || isNaN(valB)) {
            return '<span class="grade-evolution neutral"><iconify-icon icon="ph:arrow-right-bold"></iconify-icon></span>';
        }

        const diff = valB - valA;
        const diffText = diff >= 0 ? `+${diff.toFixed(1).replace('.', ',')}` : diff.toFixed(1).replace('.', ',');
        const unit = Math.abs(diff) >= 2 ? 'pts' : 'pt';
        const evoType = Utils.getEvolutionType(diff);

        let arrowIcon = 'ph:arrow-right-bold';
        let evoClass = 'stable';
        if (['very-positive', 'positive'].includes(evoType)) {
            arrowIcon = 'ph:arrow-up-right-bold';
            evoClass = 'positive';
        } else if (['very-negative', 'negative'].includes(evoType)) {
            arrowIcon = 'ph:arrow-down-right-bold';
            evoClass = 'negative';
        }

        return `<span class="grade-evolution ${evoClass} tooltip" data-tooltip="${diffText} ${unit}"><iconify-icon icon="${arrowIcon}"></iconify-icon></span>`;
    },

    /**
     * Analyse et normalise une saisie manuelle de moyenne (0 à 20, virgule ou point, 1 décimale)
     * @param {string|number|null|undefined} rawValue
     * @returns {{ empty: boolean, valid: boolean, value: number|null, clamped: boolean }}
     */
    parseGradeInput(rawValue) {
        if (rawValue === null || rawValue === undefined) {
            return { empty: true, valid: true, value: null, clamped: false };
        }
        const trimmed = String(rawValue).trim();
        if (trimmed === '') {
            return { empty: true, valid: true, value: null, clamped: false };
        }
        if (!/^(\d+(?:[.,]\d*)?|[.,]\d+)$/.test(trimmed)) {
            return { empty: false, valid: false, value: null, clamped: false };
        }
        const parsed = parseFloat(trimmed.replace(',', '.'));
        if (!Number.isFinite(parsed)) {
            return { empty: false, valid: false, value: null, clamped: false };
        }
        const clamped = parsed < 0 || parsed > 20;
        const bounded = Math.min(20, Math.max(0, parsed));
        const rounded = Math.round(bounded * 10) / 10;
        return { empty: false, valid: true, value: rounded, clamped };
    },

    /**
     * Formate une moyenne numérique au format français (ex. 12 -> "12,0")
     * @param {number|null|undefined} grade
     * @returns {string}
     */
    formatGradeValue(grade) {
        if (typeof grade !== 'number' || !Number.isFinite(grade)) return '';
        return grade.toFixed(1).replace('.', ',');
    },

    /**
     * Synchronise les classes couleur, la flèche d'évolution et le tooltip de la moyenne courante
     * @param {Object} panel - Instance FocusPanelManager
     * @param {HTMLInputElement|null} gradeInput
     * @param {number|null} gradeVal
     * @param {string} currentPeriod
     */
    syncCurrentGradeUI(panel, gradeInput, gradeVal, currentPeriod) {
        if (!gradeInput) return;
        gradeInput.className = 'context-grade-input custom-input grade-value';
        if (typeof gradeVal === 'number' && Number.isFinite(gradeVal)) {
            const gradeClass = Utils.getGradeClass(gradeVal);
            if (gradeClass) {
                gradeInput.classList.add(gradeClass);
            }
        }

        const r = panel?.currentStudentId
            ? appState.generatedResults.find(item => item.id === panel.currentStudentId)
            : null;
        const evalCount = r?.studentData?.periods?.[currentPeriod]?.evaluationCount;

        const arrowEl = document.getElementById('focusCurrentEvolutionArrow');
        if (arrowEl && r) {
            const periods = Utils.getPeriods();
            const currentIdx = periods.indexOf(currentPeriod);
            if (currentIdx > 0) {
                const prevPeriod = periods[currentIdx - 1];
                const prevGradeVal = r.studentData.periods?.[prevPeriod]?.grade;
                const prevGradeNum = (prevGradeVal !== undefined && prevGradeVal !== null && prevGradeVal !== '')
                    ? parseFloat(prevGradeVal)
                    : null;
                TooltipsUI.cleanupTooltipsIn(arrowEl);
                arrowEl.innerHTML = this.getEvolutionHtml(prevGradeNum, gradeVal);
                TooltipsUI.initTooltips(arrowEl);
            }
        }

        const gradeWrapper = gradeInput.closest('.grade-input-wrapper') || gradeInput.parentElement;
        if (gradeWrapper) {
            TooltipsUI.updateTooltip(gradeWrapper, this.getTooltipText(currentPeriod, gradeVal, evalCount, true));
        }
    },

    /**
     * Traite une saisie en direct sur #focusCurrentGradeInput (source unique de vérité)
     * @param {Object} panel - Instance FocusPanelManager
     * @param {HTMLInputElement|null} gradeInput
     * @returns {Object|null} Résultat élève mis à jour, ou null (mode création / saisie invalide)
     */
    handleGradeInput(panel, gradeInput) {
        if (!gradeInput) return null;
        panel._isGradeEdited = true;
        const parsed = this.parseGradeInput(gradeInput.value);
        if (!parsed.valid) return null;

        const currentPeriod = appState.currentPeriod;
        const gradeToSave = parsed.value;
        let updatedResult = null;

        if (panel.currentStudentId) {
            const r = appState.generatedResults.find(item => item.id === panel.currentStudentId);
            if (r) {
                if (!r.studentData.periods[currentPeriod]) {
                    r.studentData.periods[currentPeriod] = {};
                }
                Utils.markStudentModified(r, currentPeriod);
                r.studentData.periods[currentPeriod].grade = gradeToSave;
                FocusPanelStatus.checkIfDataModified();
                updatedResult = r;
            }
        }

        this.syncCurrentGradeUI(panel, gradeInput, gradeToSave, currentPeriod);
        return updatedResult;
    },

    /**
     * Valide, borne [0, 20] et reformate le champ de note au blur si édité
     * @param {Object} panel - Instance FocusPanelManager
     * @param {HTMLInputElement|null} gradeInput
     */
    commitGradeInput(panel, gradeInput) {
        if (!gradeInput || !panel?._isGradeEdited) return;

        const currentPeriod = appState.currentPeriod;
        const parsed = this.parseGradeInput(gradeInput.value);
        if (!parsed.valid) {
            this.revertGradeInput(panel, gradeInput);
            return;
        }

        gradeInput.value = parsed.value !== null ? this.formatGradeValue(parsed.value) : '';
        if (panel.currentStudentId) {
            const r = appState.generatedResults.find(item => item.id === panel.currentStudentId);
            if (r) {
                if (!r.studentData.periods[currentPeriod]) {
                    r.studentData.periods[currentPeriod] = {};
                }
                r.studentData.periods[currentPeriod].grade = parsed.value;
            }
        }
        this.syncCurrentGradeUI(panel, gradeInput, parsed.value, currentPeriod);
    },

    /**
     * Annule la saisie en cours dans le champ de note et restaure la valeur d'origine
     * @param {Object} panel - Instance FocusPanelManager
     * @param {HTMLInputElement|null} gradeInput
     */
    revertGradeInput(panel, gradeInput) {
        if (!gradeInput) return;

        const currentPeriod = appState.currentPeriod;
        const hasOriginal = Boolean(panel?._hasGradeBeforeFocus);
        const restoredGrade = hasOriginal ? panel._gradeBeforeFocus : null;
        gradeInput.value = gradeInput.dataset.prevValue ?? this.formatGradeValue(restoredGrade);

        if (panel?._uiUpdateTimeout) {
            clearTimeout(panel._uiUpdateTimeout);
            panel._uiUpdateTimeout = null;
        }

        if (panel?.currentStudentId && hasOriginal) {
            const r = appState.generatedResults.find(item => item.id === panel.currentStudentId);
            if (r) {
                if (!r.studentData.periods[currentPeriod]) {
                    r.studentData.periods[currentPeriod] = {};
                }
                r.studentData.periods[currentPeriod].grade = restoredGrade;
                if (panel._gradeFocusMeta) {
                    if (panel._gradeFocusMeta.studentLastModified === undefined) {
                        delete r._lastModified;
                    } else {
                        r._lastModified = panel._gradeFocusMeta.studentLastModified;
                    }
                    if (panel._gradeFocusMeta.periodLastModified === undefined) {
                        delete r.studentData.periods[currentPeriod]._lastModified;
                    } else {
                        r.studentData.periods[currentPeriod]._lastModified = panel._gradeFocusMeta.periodLastModified;
                    }
                }
                panel._updateListRow?.(r);
            }
        }

        if (panel) {
            panel._isGradeEdited = false;
        }
        this.syncCurrentGradeUI(panel, gradeInput, restoredGrade, currentPeriod);
        FocusPanelStatus.checkIfDataModified();
    },

    /**
     * Génère l'infobulle d'une pastille de note
     * @param {string} period
     * @param {number|string|null} gradeVal
     * @param {number|undefined} evalCount
     * @param {boolean} [isCurrent=false]
     * @param {string} [appreciation='']
     * @returns {string}
     */
    getTooltipText(period, gradeVal, evalCount, isCurrent = false, appreciation = '') {
        const periodLabel = Utils.getPeriodLabel(period, true);
        const parsedGrade = (gradeVal !== undefined && gradeVal !== null && gradeVal !== '') ? parseFloat(gradeVal) : NaN;
        const hasGrade = Number.isFinite(parsedGrade);
        const displayGrade = hasGrade
            ? this.formatGradeValue(parsedGrade)
            : (isCurrent ? '--' : 'NC');
        const suffix = isCurrent ? ' (Période actuelle)' : '';
        let tooltip = `${periodLabel}${suffix} : ${hasGrade ? displayGrade : (isCurrent ? 'En attente de note' : 'Non communiqué')}`;
        if (typeof evalCount === 'number') {
            tooltip += ` (Moyenne sur ${evalCount} évaluation${evalCount > 1 ? 's' : ''})`;
        }
        if (isCurrent) {
            tooltip += '<br><span class="grade-tooltip-hint">Cliquer pour modifier</span>';
        }
        if (!isCurrent && typeof appreciation === 'string' && appreciation.trim()) {
            const rawText = typeof Utils.stripMarkdown === 'function'
                ? Utils.stripMarkdown(appreciation.trim())
                : appreciation.trim();
            const normalized = rawText.replace(/\s+/g, ' ').trim();
            if (normalized) {
                const maxLen = 180;
                const preview = normalized.length > maxLen
                    ? `${normalized.slice(0, maxLen).trimEnd()}…`
                    : normalized;
                tooltip += `<br><span class="grade-tooltip-appreciation">« ${Utils.escapeHtml(preview)} »</span>`;
            }
        }
        return tooltip;
    },

    /**
     * Réinitialise le snapshot de focus du champ de note au changement d'élève/période
     * @param {Object} panel - Instance FocusPanelManager
     * @private
     */
    _resetGradeFocusSnapshot(panel) {
        if (!panel) return;
        panel._hasGradeBeforeFocus = false;
        panel._gradeBeforeFocus = null;
        panel._gradeFocusMeta = null;
    },

    /**
     * Rafraîchit l'affichage des notes et champs en mode création d'élève
     * @param {Object} panel - Instance FocusPanelManager
     * @param {string} currentPeriod
     */
    renderCreationModePeriod(panel, currentPeriod) {
        this._resetGradeFocusSnapshot(panel);
        const gradeLabel = document.getElementById('focusCurrentGradeLabel');
        if (gradeLabel) gradeLabel.textContent = Utils.getPeriodLabel(currentPeriod, false);

        const appreciationTitle = document.getElementById('focusAppreciationTitle');
        if (appreciationTitle) appreciationTitle.textContent = `Bulletin ${Utils.getPeriodLabel(currentPeriod, false)}`;

        const gradeInput = document.getElementById('focusCurrentGradeInput');
        if (gradeInput) {
            gradeInput.value = '';
            gradeInput.className = 'context-grade-input custom-input grade-value';
        }

        const contextInput = document.getElementById('focusContextInput');
        if (contextInput) contextInput.value = '';

        FocusPanelGenerator.updateGenerateButton(null);

        const prevGradesEl = document.getElementById('focusPreviousGrades');
        if (prevGradesEl) {
            TooltipsUI.cleanupTooltipsIn(prevGradesEl);
            prevGradesEl.innerHTML = '';
            const periods = Utils.getPeriods();
            const currentIdx = periods.indexOf(currentPeriod);

            periods.forEach((p, idx) => {
                if (idx >= currentIdx) return;

                const chip = document.createElement('span');
                chip.className = 'previous-grade-chip tooltip';
                const periodLabel = Utils.getPeriodLabel(p, true);
                chip.setAttribute('data-tooltip', `${periodLabel} : Non communiqué`);
                const shortPeriod = Utils.getPeriodLabel(p, false);
                chip.innerHTML = `<span class="period-prefix">${shortPeriod}</span><span class="prev-grade-value grade-value">NC</span>`;
                prevGradesEl.appendChild(chip);

                const nextPeriod = periods[idx + 1];
                if (nextPeriod) {
                    const evoEl = document.createElement('span');
                    evoEl.className = 'evolution-container-inline';
                    if (nextPeriod === currentPeriod) {
                        evoEl.id = 'focusCurrentEvolutionArrow';
                    }
                    evoEl.innerHTML = '<span class="grade-evolution neutral"><iconify-icon icon="ph:arrow-right-bold"></iconify-icon></span>';
                    prevGradesEl.appendChild(evoEl);
                }
            });
            TooltipsUI.initTooltips(prevGradesEl);
        }
    },

    /**
     * Rend les notes (historiques et courante) et le contexte pour la période spécifiée
     * @param {Object} panel - Instance FocusPanelManager
     * @param {Object} result - Données de l'élève
     * @param {string} currentPeriod - Période active
     */
    renderGradesAndContext(panel, result, currentPeriod) {
        panel._isGradeEdited = false;
        panel._isContextEdited = false;
        this._resetGradeFocusSnapshot(panel);
        const prevGradesEl = document.getElementById('focusPreviousGrades');

        if (prevGradesEl) {
            TooltipsUI.cleanupTooltipsIn(prevGradesEl);
            prevGradesEl.innerHTML = '';
            const periods = Utils.getPeriods();
            const currentIdx = periods.indexOf(currentPeriod);

            periods.forEach((period, idx) => {
                if (idx >= currentIdx) return;
                const periodData = result.studentData.periods?.[period] || {};
                const grade = periodData.grade;
                const evalCount = periodData.evaluationCount;

                const chip = document.createElement('span');
                chip.className = 'previous-grade-chip';
                const parsedPastGrade = (grade !== undefined && grade !== null && grade !== '') ? parseFloat(grade) : NaN;
                const hasGrade = Number.isFinite(parsedPastGrade);
                const displayGrade = hasGrade ? this.formatGradeValue(parsedPastGrade) : 'NC';
                const gradeClass = hasGrade ? Utils.getGradeClass(parsedPastGrade) : '';

                const tooltipText = this.getTooltipText(period, grade, evalCount, false, periodData.appreciation);
                const hasAppreciation = Boolean(typeof periodData.appreciation === 'string' && periodData.appreciation.trim());
                chip.classList.add('tooltip');
                chip.classList.toggle('has-appreciation', hasAppreciation);
                chip.setAttribute('data-tooltip', tooltipText);

                if (hasAppreciation) {
                    const fullPeriodLabel = Utils.getPeriodLabel(period, true);
                    chip.tabIndex = 0;
                    chip.setAttribute('role', 'button');
                    chip.setAttribute('aria-label', `Consulter l'appréciation de ${fullPeriodLabel} (${displayGrade})`);
                    chip.addEventListener('keydown', (e) => {
                        const tip = chip._tippy;
                        if (!tip) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (tip.state?.isVisible) {
                                tip.hide();
                            } else {
                                tip.show();
                            }
                        } else if (e.key === 'Escape' && tip.state?.isVisible) {
                            e.preventDefault();
                            e.stopPropagation();
                            tip.hide();
                        }
                    });
                }

                const shortPeriod = Utils.getPeriodLabel(period, false);
                chip.innerHTML = `<span class="period-prefix">${shortPeriod}</span><span class="prev-grade-value grade-value ${gradeClass}">${displayGrade}</span>`;
                prevGradesEl.appendChild(chip);

                const nextPeriod = periods[idx + 1];
                if (nextPeriod) {
                    let nextGrade = null;
                    if (nextPeriod === currentPeriod) {
                        const currentGradeVal = result.studentData.periods?.[currentPeriod]?.grade;
                        nextGrade = (currentGradeVal !== undefined && currentGradeVal !== null && currentGradeVal !== '')
                            ? parseFloat(currentGradeVal)
                            : null;
                    } else {
                        const nextPeriodData = result.studentData.periods?.[nextPeriod] || {};
                        nextGrade = (nextPeriodData.grade !== undefined && nextPeriodData.grade !== null && nextPeriodData.grade !== '')
                            ? parseFloat(nextPeriodData.grade)
                            : null;
                    }

                    const pastGradeNum = hasGrade ? parsedPastGrade : null;
                    const evoHtml = this.getEvolutionHtml(pastGradeNum, nextGrade);

                    const evoEl = document.createElement('span');
                    evoEl.className = 'evolution-container-inline';
                    if (nextPeriod === currentPeriod) {
                        evoEl.id = 'focusCurrentEvolutionArrow';
                    }
                    evoEl.innerHTML = evoHtml;
                    prevGradesEl.appendChild(evoEl);
                }
            });
            TooltipsUI.initTooltips(prevGradesEl);
            prevGradesEl.querySelectorAll('.previous-grade-chip.has-appreciation').forEach((chip) => {
                chip._tippy?.setProps?.({ trigger: 'mouseenter focus click', touch: true });
            });
        }

        const gradeLabel = document.getElementById('focusCurrentGradeLabel');
        if (gradeLabel) {
            gradeLabel.textContent = Utils.getPeriodLabel(currentPeriod, false);
        }

        const gradeInput = document.getElementById('focusCurrentGradeInput');
        if (gradeInput) {
            const currentPeriodData = result.studentData.periods?.[currentPeriod] || {};
            const currentGrade = currentPeriodData.grade;
            const evalCount = currentPeriodData.evaluationCount;
            const parsedCurrentGrade = (currentGrade !== undefined && currentGrade !== null && currentGrade !== '')
                ? parseFloat(currentGrade)
                : NaN;
            const hasCurrentGrade = Number.isFinite(parsedCurrentGrade);

            gradeInput.value = hasCurrentGrade ? this.formatGradeValue(parsedCurrentGrade) : '';
            const initialGradeClass = hasCurrentGrade ? Utils.getGradeClass(parsedCurrentGrade) : '';
            gradeInput.className = `context-grade-input custom-input grade-value ${initialGradeClass}`;

            const gradeWrapper = gradeInput.closest('.grade-input-wrapper') || gradeInput.parentElement;
            if (gradeWrapper) {
                gradeWrapper.classList.add('tooltip');
                gradeWrapper.setAttribute('data-tooltip', this.getTooltipText(currentPeriod, hasCurrentGrade ? parsedCurrentGrade : null, evalCount, true));
            }
        }

        const contextInput = document.getElementById('focusContextInput');
        if (contextInput) {
            const periodContext = result.studentData.periods?.[currentPeriod]?.context || '';
            contextInput.value = periodContext;
            panel._autoResizeTextarea(contextInput);
        }
    }
};
