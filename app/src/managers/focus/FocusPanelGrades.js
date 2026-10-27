/**
 * @fileoverview Focus Panel Grades — Rendu des notes, flèches d'évolution, contexte et timeline élève
 * Extrait de FocusPanelManager.js (Lot 11 — Découpage God Object #1)
 * @module managers/focus/FocusPanelGrades
 */

import { appState } from '../../state/State.js';
import { Utils } from '../../utils/Utils.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { FocusPanelStatus } from '../FocusPanelStatus.js';

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

        const maxHeight = 200;
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
     * Génère l'infobulle d'une pastille de note
     * @param {string} period
     * @param {number|string|null} gradeVal
     * @param {number|undefined} evalCount
     * @param {boolean} [isCurrent=false]
     * @returns {string}
     */
    getTooltipText(period, gradeVal, evalCount, isCurrent = false) {
        const periodLabel = Utils.getPeriodLabel(period, true);
        const hasGrade = (gradeVal !== undefined && gradeVal !== null && gradeVal !== '');
        const displayGrade = hasGrade
            ? parseFloat(gradeVal).toFixed(1).replace('.', ',')
            : (isCurrent ? '--' : 'NC');
        const suffix = isCurrent ? ' (Période actuelle)' : '';
        let tooltip = `${periodLabel}${suffix} : ${hasGrade ? displayGrade : (isCurrent ? 'En attente de note' : 'Non communiqué')}`;
        if (typeof evalCount === 'number') {
            tooltip += ` (Moyenne sur ${evalCount} évaluation${evalCount > 1 ? 's' : ''})`;
        }
        return tooltip;
    },

    /**
     * Rafraîchit l'affichage des notes et champs en mode création d'élève
     * @param {Object} panel - Instance FocusPanelManager
     * @param {string} currentPeriod
     */
    renderCreationModePeriod(panel, currentPeriod) {
        panel._renderStudentDetailsTimeline(null, true);

        const gradeLabel = document.getElementById('focusCurrentGradeLabel');
        if (gradeLabel) gradeLabel.textContent = Utils.getPeriodLabel(currentPeriod, false);

        const appreciationTitle = document.getElementById('focusAppreciationTitle');
        if (appreciationTitle) appreciationTitle.textContent = `Appréciation ${Utils.getPeriodLabel(currentPeriod, false)}`;

        const gradeInput = document.getElementById('focusCurrentGradeInput');
        if (gradeInput) gradeInput.value = '';

        const contextInput = document.getElementById('focusContextInput');
        if (contextInput) contextInput.value = '';

        const generateBtn = document.getElementById('focusGenerateBtn');
        if (generateBtn) {
            generateBtn.innerHTML = '<iconify-icon icon="solar:magic-stick-3-bold-duotone"></iconify-icon> Générer';
        }

        const prevGradesEl = document.getElementById('focusPreviousGrades');
        if (prevGradesEl) {
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
        }
    },

    /**
     * Rend la timeline compacte des périodes dans le menu rétractable (lecture et création)
     * @param {Object} panel - Instance FocusPanelManager
     * @param {Object|null} studentData - Données élève (null en mode création)
     * @param {boolean} [isEditable=false]
     */
    renderStudentDetailsTimeline(panel, studentData, isEditable = false) {
        const container = document.getElementById('studentDetailsTimeline');
        if (!container) return;

        container.innerHTML = '';
        const periods = Utils.getPeriods();
        const currentPeriod = appState.currentPeriod;

        periods.forEach(periodKey => {
            if (isEditable && periodKey === currentPeriod) return;

            let grade = '-';
            let appreciation = '';

            if (isEditable) {
                if (!panel._newStudentHistory) panel._newStudentHistory = {};
                const savedData = panel._newStudentHistory[periodKey] || {};
                grade = savedData.grade !== undefined ? savedData.grade : '';
                appreciation = savedData.appreciation || '';
            } else {
                const periodData = studentData?.studentData?.periods?.[periodKey] || {};
                grade = periodData.grade !== undefined ? periodData.grade : '-';
                appreciation = periodData.appreciation || '';
            }

            const shortPeriod = Utils.getPeriodLabel(periodKey, false);
            const item = document.createElement('div');
            item.className = 'timeline-compact-item';
            if (isEditable) {
                item.classList.add('editing');
                item.innerHTML = `
                    <div class="timeline-compact-badge">${shortPeriod}</div>
                    <div class="timeline-compact-content" style="width:100%;">
                        <div class="timeline-compact-header" style="justify-content: space-between; margin-bottom: 8px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-weight: 600; color: var(--text-primary);">Moyenne :</span>
                                <input type="text" class="history-grade-input-creation" data-period="${periodKey}" 
                                    value="${Utils.escapeHtml(grade)}" 
                                    placeholder="--" style="width:50px; text-align:center; padding:4px; border:1px solid var(--border-color); border-radius:4px; background: var(--bg-primary);">
                            </div>
                        </div>
                        <textarea class="history-appreciation-input-creation" data-period="${periodKey}"
                            placeholder="Saisissez l'appréciation pour le trimestre ${shortPeriod}..." 
                            style="width:100%; min-height:80px; padding:8px; border:1px solid var(--border-color); border-radius:4px; font-size:0.9rem; resize:vertical; background: var(--bg-primary); line-height: 1.5;">${Utils.escapeHtml(appreciation)}</textarea>
                    </div>
                `;
            } else {
                item.innerHTML = `
                    <div class="timeline-compact-badge">${shortPeriod}</div>
                    <div class="timeline-compact-content">
                        <div class="timeline-compact-header">
                            <span>Moyenne : ${Utils.escapeHtml(grade)}</span>
                        </div>
                        ${appreciation ? `<div class="timeline-compact-appreciation">"${Utils.escapeHtml(appreciation)}"</div>` : ''}
                    </div>
                `;
            }
            container.appendChild(item);
        });

        if (isEditable) {
            container.querySelectorAll('.history-grade-input-creation').forEach(input => {
                input.addEventListener('input', (e) => {
                    const period = e.target.dataset.period;
                    const val = e.target.value.replace(',', '.');
                    if (!panel._newStudentHistory[period]) panel._newStudentHistory[period] = {};
                    panel._newStudentHistory[period].grade = val;
                });
            });

            container.querySelectorAll('.history-appreciation-input-creation').forEach(input => {
                input.addEventListener('input', (e) => {
                    const period = e.target.dataset.period;
                    if (!panel._newStudentHistory[period]) panel._newStudentHistory[period] = {};
                    panel._newStudentHistory[period].appreciation = e.target.value;
                });
            });
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
        const prevGradesEl = document.getElementById('focusPreviousGrades');

        if (prevGradesEl) {
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
                const hasGrade = (grade !== undefined && grade !== null && grade !== '');
                const displayGrade = hasGrade
                    ? parseFloat(grade).toFixed(1).replace('.', ',')
                    : 'NC';

                const gradeClass = hasGrade
                    ? Utils.getGradeClass(parseFloat(grade))
                    : '';

                const tooltipText = this.getTooltipText(period, grade, evalCount, false);
                chip.classList.add('tooltip');
                chip.setAttribute('data-tooltip', tooltipText);

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

                    const pastGradeNum = (grade !== undefined && grade !== null && grade !== '') ? parseFloat(grade) : null;
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

            gradeInput.value = (currentGrade !== undefined && currentGrade !== null)
                ? parseFloat(currentGrade).toFixed(1).replace('.', ',')
                : '';

            const initialGradeClass = (currentGrade !== undefined && currentGrade !== null)
                ? Utils.getGradeClass(currentGrade)
                : '';
            gradeInput.className = `context-grade-input custom-input grade-value ${initialGradeClass}`;

            const gradeWrapper = gradeInput.closest('.grade-input-wrapper') || gradeInput.parentElement;
            if (gradeWrapper) {
                gradeWrapper.classList.add('tooltip');
                gradeWrapper.setAttribute('data-tooltip', this.getTooltipText(currentPeriod, currentGrade, evalCount, true));
            }

            gradeInput.oninput = () => {
                panel._isGradeEdited = true;
                const val = gradeInput.value.replace(',', '.');
                const grade = parseFloat(val);

                gradeInput.className = 'context-grade-input custom-input grade-value';

                let gradeToSave = null;
                if (!isNaN(grade)) {
                    const gradeClass = Utils.getGradeClass(grade);
                    if (gradeClass) {
                        gradeInput.classList.add(gradeClass);
                    }
                    gradeToSave = grade;
                }

                if (panel.currentStudentId) {
                    const r = appState.generatedResults.find(item => item.id === panel.currentStudentId);
                    if (r) {
                        if (!r.studentData.periods[currentPeriod]) {
                            r.studentData.periods[currentPeriod] = {};
                        }
                        r.studentData.periods[currentPeriod].grade = gradeToSave;
                        FocusPanelStatus.checkIfDataModified();

                        const arrowEl = document.getElementById('focusCurrentEvolutionArrow');
                        if (arrowEl) {
                            const periods = Utils.getPeriods();
                            const currentIdx = periods.indexOf(currentPeriod);
                            if (currentIdx > 0) {
                                const prevPeriod = periods[currentIdx - 1];
                                const prevGradeVal = r.studentData.periods?.[prevPeriod]?.grade;
                                const prevGradeNum = (prevGradeVal !== undefined && prevGradeVal !== null && prevGradeVal !== '')
                                    ? parseFloat(prevGradeVal)
                                    : null;

                                arrowEl.innerHTML = this.getEvolutionHtml(prevGradeNum, gradeToSave);
                            }
                        }

                        if (gradeWrapper) {
                            TooltipsUI.updateTooltip(gradeWrapper, this.getTooltipText(currentPeriod, gradeToSave, evalCount, true));
                        }
                    }
                }
            };
            gradeInput.onchange = gradeInput.oninput;
        }

        const contextInput = document.getElementById('focusContextInput');
        if (contextInput) {
            const periodContext = result.studentData.periods?.[currentPeriod]?.context || '';
            contextInput.value = periodContext;
            panel._autoResizeTextarea(contextInput);
        }
    }
};
