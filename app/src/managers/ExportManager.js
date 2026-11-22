/**
 * @fileoverview Gestionnaire des exports de données.
 * 
 * Ce module gère toutes les fonctionnalités d'export :
 * - Copie d'appréciations individuelles
 * - Copie de toutes les appréciations visibles
 * - Export CSV
 * - Export PDF (impression)
 * 
 * @module managers/ExportManager
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { DOMHelper } from '../utils/DOMHelper.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';
import { ClassManager } from './ClassManager.js';
import { StatsService } from '../services/StatsService.js';
import { SvgCharts } from '../utils/SvgCharts.js';
import { isGdprSensitiveStatus } from '../config/academicConstants.js';

/** @type {import('./AppManager.js').App|null} */
let App = null;

/**
 * Module de gestion des exports.
 * @namespace ExportManager
 */
export const ExportManager = {
    /**
     * Initialise le module avec une référence à l'application principale.
     * @param {Object} appInstance - Instance de l'application principale
     */
    init(appInstance) {
        App = appInstance;
    },

    /**
     * Copie une appréciation dans le presse-papiers.
     * @param {string} id - Identifiant de l'appréciation
     * @param {HTMLElement|null} [buttonEl=null] - Bouton qui a déclenché l'action
     * @param {Function|null} [onAfterCopy=null] - Callback appelé après copie (ou fin du flash bouton)
     * @returns {Promise<boolean>}
     */
    copyAppreciation(id, buttonEl = null, onAfterCopy = null) {
        const resultIndex = appState.generatedResults.findIndex(r => r.id === id);
        if (resultIndex === -1) return Promise.resolve(false);

        const result = appState.generatedResults[resultIndex];
        const currentPeriod = appState.currentPeriod;
        const appreciationToCopy = Utils.getPeriodAppreciation(result, currentPeriod);

        if (!appreciationToCopy?.trim()) {
            UI.showNotification('Appréciation vide.', 'error');
            return Promise.resolve(false);
        }

        return navigator.clipboard.writeText(Utils.stripMarkdown(Utils.decodeHtmlEntities(appreciationToCopy))).then(() => {
            Utils.setAppreciationCopied(appState.generatedResults[resultIndex], currentPeriod, true);
            StorageManager.saveAppState();
            UI?.recordSupportMilestone?.('bulletin-export');

            if (buttonEl) {
                if (buttonEl._copyResetTimer) {
                    clearTimeout(buttonEl._copyResetTimer);
                }
                const originalIcon = buttonEl._copyOriginalHtml ?? buttonEl.innerHTML;
                const hasText = buttonEl._copyHasText ?? (buttonEl.textContent.trim().length > 0);
                buttonEl._copyOriginalHtml = originalIcon;
                buttonEl._copyHasText = hasText;

                // Si le bouton contient du texte (ex: menu contextuel), on affiche "Copié !"
                // Sinon (ex: icône seule), on change juste l'icône
                buttonEl.innerHTML = hasText
                    ? '<iconify-icon icon="ph:check-bold"></iconify-icon> Copié !'
                    : '<iconify-icon icon="ph:check-bold"></iconify-icon>';

                buttonEl.classList.add('copied', 'copy-success');
                buttonEl._copyResetTimer = setTimeout(() => {
                    buttonEl.classList.remove('copied', 'copy-success');
                    // Restore original content
                    buttonEl.innerHTML = originalIcon;
                    delete buttonEl._copyOriginalHtml;
                    delete buttonEl._copyHasText;
                    delete buttonEl._copyResetTimer;
                    onAfterCopy?.(id);
                }, 1500);
            } else {
                onAfterCopy?.(id);
            }
            return true;
        }).catch(err => {
            UI.showNotification('Échec copie.', 'error');
            console.error('Erreur :', err);
            return false;
        });
    },

    /**
     * Copie toutes les appréciations visibles dans le presse-papiers.
     * @param {HTMLElement} [buttonEl] - Bouton ayant déclenché l'action pour feedback
     */
    copyAllResults(buttonEl = null) {
        const button = buttonEl || document.getElementById('copyAllBtn-shortcut');

        if (appState.filteredResults.length === 0) {
            UI.showNotification("Rien à copier.", "warning");
            return;
        }

        const currentPeriod = appState.currentPeriod;
        const items = appState.filteredResults
            .map(r => {
                const appreciation = Utils.getPeriodAppreciation(r, currentPeriod);
                return appreciation?.trim() ? `${Utils.formatStudentName(r.nom, r.prenom)}\n${Utils.stripMarkdown(Utils.decodeHtmlEntities(appreciation))}` : null;
            })
            .filter(Boolean);
        const text = items.join('\n\n');

        if (!text) {
            UI.showNotification("Aucune appréciation à copier pour cette période.", "warning");
            return;
        }

        navigator.clipboard.writeText(text).then(() => {
            if (button) {
                const originalIcon = button.innerHTML;
                button.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon>';
                button.disabled = true;
                setTimeout(() => {
                    button.innerHTML = originalIcon;
                    button.disabled = false;
                }, 2000);
            }
            UI.showNotification(`${items.length} appréciation${items.length > 1 ? 's' : ''} copiée${items.length > 1 ? 's' : ''} !`, 'success');
            UI?.recordSupportMilestone?.('bulletin-export');
        });
    },

    /**
     * Copie uniquement la liste des élèves (Nom Prénom) dans le presse-papiers.
     * S'adapte intelligemment : si des élèves sont sélectionnés, copie uniquement la sélection,
     * sinon copie tous les élèves actuellement visibles (filtrés).
     * @param {HTMLElement} [buttonEl] - Bouton ayant déclenché l'action pour feedback
     */
    copyStudentList(buttonEl = null) {
        const selectedRows = document.querySelectorAll('.student-row.selected');
        const selectedIds = Array.from(selectedRows).map(row => row.dataset.studentId);
        
        let studentsToCopy = appState.filteredResults;
        
        if (selectedIds.length > 0) {
            studentsToCopy = appState.filteredResults.filter(r => selectedIds.includes(r.id));
        }

        if (!studentsToCopy || studentsToCopy.length === 0) {
            UI.showNotification("Aucun élève à copier.", "warning");
            return;
        }

        // Format: NOM Prénom (un élève par ligne, trié selon l'affichage actif)
        const text = studentsToCopy.map(r => Utils.formatStudentName(r.nom, r.prenom)).join('\n');

        return navigator.clipboard.writeText(text).then(() => {
            const count = studentsToCopy.length;
            const selectionMsg = selectedIds.length > 0 ? " de la sélection" : "";
            UI.showNotification(`${count} élève${count > 1 ? 's' : ''}${selectionMsg} copié${count > 1 ? 's' : ''} dans le presse-papiers !`, 'success');

            if (buttonEl) {
                const originalIcon = buttonEl.innerHTML;
                buttonEl.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon>';
                buttonEl.disabled = true;
                setTimeout(() => {
                    buttonEl.innerHTML = originalIcon;
                    buttonEl.disabled = false;
                }, 2000);
            }
        }).catch(err => {
            UI.showNotification("Échec de la copie.", "error");
            console.error("Erreur de copie de la liste :", err);
        });
    },


    /**
     * Exporte les appréciations visibles au format CSV.
     * Scope : classe active, périodes actuelles et précédentes uniquement.
     */
    exportToCsv() {
        const results = appState.filteredResults;

        if (!results || results.length === 0) {
            UI.showNotification('Aucune donnée à exporter.', 'warning');
            return;
        }

        const allPeriods = Utils.getPeriods();
        const currentPeriod = appState.currentPeriod;

        const headers = [
            "Nom", "Prénom", "Statuts",
            ...allPeriods.flatMap(p => [`Moy ${p}`, `Évo ${p}`, `App ${p}`]),
            "Matière", "Instructions", "Forces/Faiblesses", "Pistes", "Date"
        ];

        const clean = (txt) => {
            if (txt == null) return '';
            let str = Utils.stripMarkdown(String(txt));
            str = str.replace(/[\n\r]+/g, ' ').trim();
            str = str.replace(/"/g, '""');
            return (/[",;]/).test(str) ? `"${str}"` : str;
        };

        const rows = results.map(r => {
            const sd = r.studentData || {};
            let row = [r.nom, r.prenom, (sd.statuses || []).join(', ')];

            allPeriods.forEach(p => {
                const d = sd.periods?.[p];
                const gradeRaw = d?.grade;
                const grade = typeof gradeRaw === 'number' ? gradeRaw : parseFloat(String(gradeRaw || '').replace(',', '.'));
                
                // Calcul de l'évolution
                let evolutionStr = '';
                const evo = Utils.getRelevantEvolution(r.evolutions, p);
                if (evo && typeof evo.delta === 'number') {
                    const sign = evo.delta > 0 ? '+' : '';
                    evolutionStr = `${sign}${String(evo.delta).replace('.', ',')}`;
                }

                // SINGLE SOURCE OF TRUTH:
                // 1. If an appreciation is actively assigned to this period in periods[p], use it.
                // 2. Fallback: If AI generated an appreciation for *this* period but hasn't synced to periods[p] yet, use it.
                let targetApp = d?.appreciation || '';
                if (!targetApp && r.generationPeriod === p && r.appreciation) {
                    targetApp = r.appreciation;
                }

                row.push(
                    !isNaN(grade) ? String(grade).replace('.', ',') : '',
                    evolutionStr,
                    targetApp
                );
            });

            const periodAnalysis = Utils.getStudentAnalysisForPeriod(r, currentPeriod);
            const forcesAndWeaknessesStr = periodAnalysis
                ? [
                    periodAnalysis.strengths.length > 0 ? `Forces : ${periodAnalysis.strengths.join('; ')}` : '',
                    periodAnalysis.weaknesses.length > 0 ? `Vigilances : ${periodAnalysis.weaknesses.join('; ')}` : ''
                ].filter(Boolean).join(' | ')
                : '';

            const configuredDiscipline = (
                appState.subjects?.[appState.currentSubject]?.iaConfig?.discipline ||
                appState.subjects?.MonStyle?.iaConfig?.discipline ||
                ''
            ).trim();
            const sanitizeSubject = (raw) => {
                const val = String(raw || '').trim();
                return val && val !== 'MonStyle' && val !== 'Générique' ? val : '';
            };
            const csvSubject = configuredDiscipline || sanitizeSubject(sd.subject) || sanitizeSubject(appState.currentSubject);

            row.push(
                csvSubject,
                sd.periods?.[currentPeriod]?.context || '',
                forcesAndWeaknessesStr,
                periodAnalysis?.nextSteps?.join('; ') ?? '',
                r.timestamp ? new Date(r.timestamp).toLocaleString() : ''
            );

            return row.map(clean).join(';');
        });

        const csvContent = "\uFEFF" + headers.join(';') + '\n' + rows.join('\n');

        const classLabel = Utils.getCurrentClassName(appState.currentClassId) || '';
        const safeName = classLabel ? `_${classLabel.replace(/[^a-zA-Z0-9À-ÿ\-_ ]/g, '').trim().replace(/\s+/g, '-')}` : '';
        const filename = `bulletin-ai${safeName}_${currentPeriod}_${new Date().toISOString().slice(0, 10)}.csv`;

        StorageManager._downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');

        const count = results.length;
        UI.showNotification(`CSV exporté (${count} élève${count > 1 ? 's' : ''}, ${Utils.getPeriodLabel(currentPeriod, true)}).`, 'success');
        UI?.recordSupportMilestone?.('bulletin-export');
    },

    /**
     * Orchestre le cycle d'impression navigateur (titre, attribut body[data-print-mode], style @page et nettoyage).
     * @param {Object} config
     * @param {'list'|'report'|'seating'} config.mode
     * @param {string} config.title
     * @param {string} [config.pageCss='']
     * @param {Function} [config.setup]
     * @param {Function} [config.cleanup]
     * @private
     */
    _runPrintSession(config) {
        return DOMHelper.runPrintSession(config);
    },

    /**
     * Injecte un rapport HTML/SVG autonome dans #print-report-root et déclenche l'impression PDF.
     * @param {Object} config
     * @param {string} config.title
     * @param {string} config.htmlContent
     * @param {string} [config.pageCss]
     * @private
     */
    _printHtmlReport({ title, htmlContent, pageCss = '@page { size: A4 portrait; margin: 12mm 14mm; }' }) {
        document.getElementById('print-report-root')?.remove();

        const reportRoot = document.createElement('div');
        reportRoot.id = 'print-report-root';
        reportRoot.className = 'print-report-root';
        reportRoot.innerHTML = htmlContent;

        this._runPrintSession({
            mode: 'report',
            title,
            pageCss,
            setup: () => {
                document.body.appendChild(reportRoot);
            },
            cleanup: () => {
                reportRoot.remove();
            }
        });
    },

    /**
     * Formate un nombre sur 20 ou un delta à la française.
     * @param {number|null|undefined} val
     * @param {boolean} [signed=false]
     * @returns {string}
     * @private
     */
    _normalizeDisplayNumber(val) {
        if (typeof val !== 'number' || !Number.isFinite(val)) return NaN;
        const rounded = Math.round(val * 10) / 10;
        return rounded === 0 ? 0 : rounded;
    },

    _formatNumberFr(val, signed = false) {
        const clean = this._normalizeDisplayNumber(val);
        if (Number.isNaN(clean)) return '--';
        const formatted = clean.toFixed(1).replace('.', ',');
        return signed && clean > 0 ? `+${formatted}` : formatted;
    },

    _getDeltaToneClass(val) {
        const clean = this._normalizeDisplayNumber(val);
        if (Number.isNaN(clean) || clean === 0) return '';
        return clean > 0 ? 'is-pos' : 'is-neg';
    },

    /**
     * Filtre les libellés internes de style IA qui ne doivent pas apparaître sur un document imprimé.
     * @param {string|null|undefined} subject
     * @returns {string}
     * @private
     */
    _sanitizeSubjectLabel(subject) {
        return (subject && subject !== 'Générique' && subject !== 'MonStyle') ? subject : '';
    },

    /**
     * Formate un texte Markdown pour l'impression en évitant les deux-points orphelins en début de ligne.
     * @param {string} text
     * @returns {string}
     * @private
     */
    _formatPrintRichText(text) {
        const html = Utils.cleanMarkdown(text);
        return typeof html === 'string' ? html.replace(/ :/g, '\u00A0:') : html;
    },

    /**
     * Résout le libellé de classe actif et de matière active pour les en-têtes d'impression.
     * @param {string|null} [classId=appState.currentClassId]
     * @returns {{ classLabel: string, subjectLabel: string, periodLabel: string, dateStr: string }}
     * @private
     */
    _getReportContextMeta(classId = appState.currentClassId) {
        const classLabel = Utils.getCurrentClassName(classId) || '';
        const subjectLabel = this._sanitizeSubjectLabel(appState.currentSubject);
        const periodLabel = Utils.getPeriodLabel(appState.currentPeriod, true) || appState.currentPeriod;
        const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        return { classLabel, subjectLabel, periodLabel, dateStr };
    },

    /**
     * Extrait les sections structurées de la synthèse IA depuis le DOM du ClassDashboardModal.
     * @returns {Array<{title: string, isIntro: boolean, text?: string, items?: string[], tone?: string}>}
     * @private
     */
    _extractDomSynthesisSections() {
        const container = document.querySelector('#classDashboardModal #aiSynthesisContent');
        if (!container) return [];
        const taggedClassId = container.dataset.classId;
        const taggedPeriod = container.dataset.period;
        if (taggedClassId !== undefined && taggedClassId !== String(appState.currentClassId || '')) return [];
        if (taggedPeriod !== undefined && taggedPeriod !== String(appState.currentPeriod || '')) return [];
        const content = container.querySelector('.ai-synthesis-text');
        if (!content) return [];

        const sections = [];
        content.querySelectorAll('.synthesis-section').forEach(sec => {
            const headerEl = sec.querySelector('.synthesis-intro-header span, .synthesis-section-header span');
            const introTextEl = sec.querySelector('.synthesis-intro-text');
            const listItems = sec.querySelectorAll('.synthesis-list li');
            const title = headerEl ? headerEl.textContent.trim() : '';

            let tone = 'info';
            if (sec.classList.contains('synthesis-section--success')) tone = 'success';
            else if (sec.classList.contains('synthesis-section--warning')) tone = 'warning';

            if (introTextEl) {
                const body = introTextEl.textContent.trim();
                if (body) sections.push({ title: title || 'Appréciation de classe', isIntro: true, text: body });
            } else if (listItems.length > 0) {
                const items = Array.from(listItems).map(li => li.textContent.trim()).filter(Boolean);
                if (items.length > 0) sections.push({ title, isIntro: false, items, tone });
            }
        });
        return sections;
    },

    /**
     * Calcule un repli statistique minimal si exportClassDashboardPdf est appelé hors ClassDashboardModal.
     * @returns {Object|null}
     * @private
     */
    _computeFallbackClassStats() {
        const period = appState.currentPeriod;
        const allPeriods = Utils.getPeriods();
        const currentIdx = allPeriods.indexOf(period);
        const relevantPeriods = currentIdx >= 0 ? allPeriods.slice(0, currentIdx + 1) : [period];
        const prevPeriod = currentIdx > 0 ? allPeriods[currentIdx - 1] : null;

        const fullRoster = (appState.currentClassId && Array.isArray(appState.generatedResults) && appState.generatedResults.length > 0)
            ? ClassManager.getStudentsForClass(appState.currentClassId)
            : (appState.filteredResults || []);
        const roster = fullRoster.filter(r => !Utils.isStudentDepartedBeforePeriod?.(r, period));

        const students = roster
            .map(r => {
                const grade = StatsService.parseGrade(r.studentData?.periods?.[period]?.grade);
                if (Number.isNaN(grade)) return null;
                const prevGrade = prevPeriod ? StatsService.parseGrade(r.studentData?.periods?.[prevPeriod]?.grade) : NaN;
                const evolution = !Number.isNaN(prevGrade) ? StatsService.computeEvolutionDiff(grade, prevGrade) : null;
                return {
                    id: r.id,
                    fullName: Utils.formatStudentName(r.nom, r.prenom),
                    grade,
                    evolution
                };
            })
            .filter(Boolean);

        const cohort = StatsService.computeCohortStats(students, { topLimit: 10 });
        if (!cohort) return null;

        const periodAverages = StatsService.computePeriodAverages(fullRoster, relevantPeriods);

        return {
            ...cohort,
            periodAverages
        };
    },

    /**
     * Lance l'impression de la page pour générer un PDF de la liste des appréciations.
     * Injecte un en-tête imprimable avec classe, période et date.
     */
    exportToPdf() {
        if (appState.filteredResults.length === 0) {
            UI.showNotification('Aucune donnée à exporter.', 'warning');
            return;
        }

        UI.showNotification("Préparation de l'export PDF...", 'info');

        const { classLabel, subjectLabel, periodLabel, dateStr } = this._getReportContextMeta();
        const title = `Appréciations${subjectLabel ? ` ${subjectLabel}` : ''}${classLabel ? ` - ${classLabel}` : ''} - ${periodLabel}`;

        const printHeader = document.createElement('div');
        printHeader.id = 'print-header';
        printHeader.setAttribute('style',
            'display:none; padding: 12px 0 8px; margin-bottom: 12px; border-bottom: 2px solid #111;'
        );
        printHeader.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:baseline;">
                <h1 style="margin:0; font-size:16pt; font-weight:700; color:#111;">
                    ${Utils.escapeHtml(classLabel || 'Appréciations')}
                    <span style="font-weight:400; font-size:12pt; color:#525252; margin-left:8px;">${Utils.escapeHtml(periodLabel)}</span>
                </h1>
                <span style="font-size:9pt; color:#737373;">${dateStr}</span>
            </div>
        `;

        const mainContent = document.querySelector('.main-content');
        const printStyle = document.createElement('style');
        printStyle.id = 'print-header-style';
        printStyle.textContent = '@media print { #print-header { display: block !important; } }';

        this._runPrintSession({
            mode: 'list',
            title,
            setup: () => {
                mainContent?.insertBefore(printHeader, mainContent.firstChild);
                document.head.appendChild(printStyle);
            },
            cleanup: () => {
                printHeader.remove();
                printStyle.remove();
            }
        });
        UI?.recordSupportMilestone?.('bulletin-export');
    },

    /**
     * Exporte une synthèse A4 mise en page pour le Conseil de classe (KPIs, graphiques SVG, listes et synthèse IA).
     * @param {Object|null} [dashboardData=null] - Données optionnelles transmises par ClassDashboardManager
     * @param {Object} [dashboardData.stats]
     * @param {Array} [dashboardData.synthesisSections]
     * @param {string} [dashboardData.subject]
     */
    exportClassDashboardPdf(dashboardData = null) {
        const stats = dashboardData?.stats || this._computeFallbackClassStats();
        if (!stats || !stats.count) {
            UI.showNotification('Aucune donnée à exporter pour la classe.', 'warning');
            return;
        }

        UI.showNotification("Préparation du bilan de classe...", 'info');

        const { classLabel, subjectLabel: defaultSubject, periodLabel, dateStr } = this._getReportContextMeta();
        const subjectLabel = dashboardData?.subject || defaultSubject;
        const synthesisSections = Array.isArray(dashboardData?.synthesisSections)
            ? dashboardData.synthesisSections
            : this._extractDomSynthesisSections();

        const avgEvoHtml = typeof stats.avgEvolution === 'number' && !Number.isNaN(stats.avgEvolution)
            ? `<span class="pr-kpi-sub ${this._getDeltaToneClass(stats.avgEvolution)}">${this._formatNumberFr(stats.avgEvolution, true)} pt vs préc.</span>`
            : '';

        const hetLabel = stats.heterogeneity?.label ? `${stats.heterogeneity.label} (σ ${this._formatNumberFr(stats.stdDev)})` : `σ ${this._formatNumberFr(stats.stdDev)}`;
        const successRounded = Math.round(stats.successRate ?? 0);

        const histogramSvg = SvgCharts.renderDistributionHistogramSvg(stats.distribution);

        const hasTrajectory = Array.isArray(stats.periodAverages) && stats.periodAverages.length >= 2;
        const rightChartHtml = hasTrajectory
            ? `
                <div class="pr-card">
                    <h2 class="pr-section-title">Évolution de la moyenne de classe</h2>
                    ${SvgCharts.renderTrajectorySvg({
                        periods: stats.periodAverages.map(p => p.period),
                        classAverages: stats.periodAverages.map(p => p.average)
                    })}
                </div>
            `
            : `
                <div class="pr-card">
                    <h2 class="pr-section-title">Dynamique de la classe</h2>
                    ${stats.hasEvolutionData
                        ? `
                            <div class="pr-dynamics-grid">
                                <div class="pr-dyn-item is-pos"><strong>${stats.progressCount}</strong><span>En progrès</span></div>
                                <div class="pr-dyn-item"><strong>${stats.stableCount}</strong><span>Stables</span></div>
                                <div class="pr-dyn-item is-neg"><strong>${stats.regressionCount}</strong><span>En baisse</span></div>
                            </div>
                        `
                        : `<p class="pr-muted-note">La comparaison inter-périodes et la courbe d'évolution seront disponibles dès la 2ᵉ période notée.</p>`
                    }
                </div>
            `;

        let synthesisHtml = '';
        if (synthesisSections.length > 0) {
            const introSec = synthesisSections.find(s => s?.isIntro && typeof s.text === 'string' && s.text.trim());
            const gridSecs = synthesisSections.filter(s => s && !s.isIntro && Array.isArray(s.items) && s.items.length > 0);
            if (introSec || gridSecs.length > 0) {
                synthesisHtml = `
                    <section class="pr-section">
                        <h2 class="pr-section-title">Bilan</h2>
                        ${introSec ? `<div class="pr-intro-box"><strong>${Utils.escapeHtml(String(introSec.title || 'Appréciation de classe'))}</strong><p>${Utils.escapeHtml(String(introSec.text || ''))}</p></div>` : ''}
                        ${gridSecs.length > 0 ? `
                            <div class="pr-grid-3">
                                ${gridSecs.map(sec => `
                                    <div class="pr-subcard pr-tone-${Utils.escapeHtml(String(sec.tone || 'info'))}">
                                        <h3>${Utils.escapeHtml(String(sec.title || ''))}</h3>
                                        <ul>${sec.items.map(item => `<li>${Utils.escapeHtml(String(item ?? ''))}</li>`).join('')}</ul>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </section>
                `;
            }
        }

        const renderStudentMetricList = (items, emptyMsg, isProgression) => {
            if (!Array.isArray(items) || items.length === 0) {
                return `<p class="pr-muted-note">${emptyMsg}</p>`;
            }
            return `
                <ul class="pr-student-list">
                    ${items.slice(0, 10).map(s => {
                        const gradeStr = `${this._formatNumberFr(s.grade)}/20`;
                        const evoBadge = (typeof s.evolution === 'number' && !Number.isNaN(s.evolution))
                            ? `<span class="pr-delta ${this._getDeltaToneClass(s.evolution)}">${this._formatNumberFr(s.evolution, true)} pt</span>`
                            : '';
                        return `
                            <li>
                                <span class="pr-student-name">${Utils.escapeHtml(String(s.fullName || ''))}</span>
                                <span class="pr-student-metrics">
                                    <strong>${gradeStr}</strong>
                                    ${isProgression || evoBadge ? evoBadge : ''}
                                </span>
                            </li>
                        `;
                    }).join('')}
                </ul>
            `;
        };

        const htmlContent = `
            <article class="pr-document">
                <header class="pr-header">
                    <div>
                        <p class="pr-eyebrow">Bilan de classe</p>
                        <h1 class="pr-title">${Utils.escapeHtml(classLabel || 'Classe')} — ${Utils.escapeHtml(periodLabel)}</h1>
                        <p class="pr-subtitle">
                            ${subjectLabel ? `<span>${Utils.escapeHtml(subjectLabel)}</span> · ` : ''}
                            <span>${stats.count} élève${stats.count > 1 ? 's' : ''} évalué${stats.count > 1 ? 's' : ''}</span>
                        </p>
                    </div>
                    <div class="pr-meta-right">
                        <span class="pr-date">${Utils.escapeHtml(dateStr)}</span>
                        <span class="pr-brand">Bulletin AI</span>
                    </div>
                </header>

                <section class="pr-kpi-strip">
                    <div class="pr-kpi">
                        <span class="pr-kpi-label">Moyenne</span>
                        <strong class="pr-kpi-val">${this._formatNumberFr(stats.average)}<small>/20</small></strong>
                        ${avgEvoHtml}
                    </div>
                    <div class="pr-kpi">
                        <span class="pr-kpi-label">Médiane</span>
                        <strong class="pr-kpi-val">${this._formatNumberFr(stats.median)}<small>/20</small></strong>
                        <span class="pr-kpi-sub">${Utils.escapeHtml(hetLabel)}</span>
                    </div>
                    <div class="pr-kpi">
                        <span class="pr-kpi-label">Min / Max</span>
                        <strong class="pr-kpi-val">${this._formatNumberFr(stats.min)} – ${this._formatNumberFr(stats.max)}</strong>
                    </div>
                    <div class="pr-kpi">
                        <span class="pr-kpi-label">Réussite (≥ 10)</span>
                        <strong class="pr-kpi-val">${successRounded}%</strong>
                        <span class="pr-kpi-sub">${stats.aboveTenCount ?? 0} / ${stats.count} élèves</span>
                    </div>
                </section>

                <section class="pr-grid-2">
                    <div class="pr-card">
                        <h2 class="pr-section-title">Répartition des notes</h2>
                        ${histogramSvg}
                    </div>
                    ${rightChartHtml}
                </section>

                ${synthesisHtml}

                <section class="pr-grid-2 pr-keep-together">
                    <div class="pr-card">
                        <h2 class="pr-section-title">Progressions</h2>
                        ${renderStudentMetricList(stats.topProgressions, 'Aucune progression marquante relevée.', true)}
                    </div>
                    <div class="pr-card">
                        <h2 class="pr-section-title">Élèves en vigilance</h2>
                        ${renderStudentMetricList(stats.atRisk, 'Aucun élève en vigilance à ce stade.', false)}
                    </div>
                </section>
            </article>
        `;

        const title = `Bilan-de-classe${classLabel ? `_${classLabel}` : ''}_${appState.currentPeriod}`;
        this._printHtmlReport({ title, htmlContent });
        UI?.recordSupportMilestone?.('bulletin-export');
    },

    /**
     * Exporte une fiche bilan individuelle A4 mise en page pour un rendez-vous parents / PP.
     * Exclut par défaut les dispositifs médicaux/administratifs sensibles (Art. 9 RGPD) et le journal interne.
     * @param {string|null} studentId - ID de l'élève
     * @param {Object} [options={}]
     * @param {string} [options.period=appState.currentPeriod] - Période de référence
     * @param {boolean} [options.includeSensitive=false] - Inclure les statuts RGPD sensibles
     */
    exportStudentReportPdf(studentId, options = {}) {
        const result = studentId ? appState.generatedResults.find(r => r.id === studentId) : null;
        if (!result) {
            UI.showNotification('Élève introuvable pour l\'export PDF.', 'warning');
            return;
        }

        UI.showNotification("Préparation de la fiche bilan élève...", 'info');

        const currentPeriod = options.period || appState.currentPeriod;
        const includeSensitive = Boolean(options.includeSensitive);
        const { classLabel: defaultClass, subjectLabel: defaultSubject, dateStr } = this._getReportContextMeta(result.classId || appState.currentClassId);
        const periodLabel = Utils.getPeriodLabel(currentPeriod, true) || currentPeriod;
        const subjectLabel = this._sanitizeSubjectLabel(result.studentData?.subject) || defaultSubject;

        // Statuts filtrés RGPD (exclut PPRE/PAP/PAI/AESH/ULIS/GEVA-Sco et tout statut libre/composite sensible par défaut sur fiche famille)
        const visibleStatuses = (Utils.getActiveStatuses?.(result, currentPeriod) || result.studentData?.statuses || [])
            .filter(status => includeSensitive || !isGdprSensitiveStatus(status));

        const allPeriods = Utils.getPeriods();
        const currentIdx = allPeriods.indexOf(currentPeriod);
        const relevantPeriods = currentIdx >= 0 ? allPeriods.slice(0, currentIdx + 1) : [currentPeriod];

        // Calcul des moyennes de classe par période pour contextualiser la trajectoire de l'élève
        const targetClassId = result.classId || appState.currentClassId;
        const classRoster = targetClassId
            ? ClassManager.getStudentsForClass(targetClassId)
            : appState.generatedResults;
        const periodAvgMap = new Map(
            StatsService.computePeriodAverages(classRoster, relevantPeriods).map(entry => [entry.period, entry.average])
        );

        const periodRows = relevantPeriods.map((p, idx) => {
            const studentGrade = StatsService.parseGrade(result.studentData?.periods?.[p]?.grade);
            const validStudentGrade = Number.isNaN(studentGrade) ? null : studentGrade;

            const prevGrade = idx > 0
                ? StatsService.parseGrade(result.studentData?.periods?.[relevantPeriods[idx - 1]]?.grade)
                : NaN;
            const delta = (validStudentGrade !== null && !Number.isNaN(prevGrade))
                ? StatsService.computeEvolutionDiff(validStudentGrade, prevGrade)
                : null;

            const classAvg = periodAvgMap.has(p) ? periodAvgMap.get(p) : null;

            const diffClass = (validStudentGrade !== null && classAvg !== null)
                ? parseFloat((validStudentGrade - classAvg).toFixed(1))
                : null;

            return {
                period: p,
                label: Utils.getPeriodLabel(p, true) || p,
                studentGrade: validStudentGrade,
                delta,
                classAvg,
                diffClass
            };
        });

        const hasTrajectoryPoints = periodRows.length >= 2 && periodRows.some(r => r.studentGrade !== null);
        const trajectorySvg = hasTrajectoryPoints
            ? SvgCharts.renderTrajectorySvg({
                periods: periodRows.map(r => r.period),
                studentGrades: periodRows.map(r => r.studentGrade),
                classAverages: periodRows.map(r => r.classAvg)
            })
            : '';

        // Avatar (photo base64 validée ou initiales)
        const fullName = Utils.formatStudentName(result.nom, result.prenom);
        const photo = result.studentPhoto || result.studentData?.photo;
        const hasValidPhoto = typeof photo?.data === 'string' && /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(photo.data);
        const initials = `${(result.prenom || '').charAt(0)}${(result.nom || '').charAt(0)}`.toUpperCase() || '?';
        const avatarHtml = hasValidPhoto
            ? `<img class="pr-avatar-img" src="${photo.data}" alt="${Utils.escapeHtml(fullName)}" />`
            : `<div class="pr-avatar-initials">${Utils.escapeHtml(initials)}</div>`;

        // Appréciation de la période active
        const rawAppreciation = result.studentData?.periods?.[currentPeriod]?.appreciation
            || (result.generationPeriod === currentPeriod ? result.appreciation : '')
            || '';
        const appreciationHtml = rawAppreciation.trim()
            ? `<div class="pr-appreciation-box">${this._formatPrintRichText(rawAppreciation).replace(/\n/g, '<br>')}</div>`
            : `<p class="pr-muted-note">Appréciation non encore rédigée pour cette période.</p>`;

        // Analyse pédagogique (Forces / Vigilances / Pistes) cloisonnée sur la période active
        const periodAnalysis = Utils.getStudentAnalysisForPeriod(result, currentPeriod);
        const forcesItems = periodAnalysis?.strengths || [];
        const weaknessItems = periodAnalysis?.weaknesses || [];
        const nextStepsItems = periodAnalysis?.nextSteps || [];
        const hasAnalysis = Utils.hasStudentAnalysisContent(periodAnalysis);

        const analysisHtml = hasAnalysis ? `
            <section class="pr-section pr-keep-together">
                <h2 class="pr-section-title">Analyse pédagogique</h2>
                <div class="pr-grid-3">
                    ${forcesItems.length > 0 ? `
                        <div class="pr-subcard pr-tone-success">
                            <h3>Points forts</h3>
                            <ul>${forcesItems.map(item => `<li>${this._formatPrintRichText(item)}</li>`).join('')}</ul>
                        </div>
                    ` : ''}
                    ${weaknessItems.length > 0 ? `
                        <div class="pr-subcard pr-tone-warning">
                            <h3>Points de vigilance</h3>
                            <ul>${weaknessItems.map(item => `<li>${this._formatPrintRichText(item)}</li>`).join('')}</ul>
                        </div>
                    ` : ''}
                    ${nextStepsItems.length > 0 ? `
                        <div class="pr-subcard pr-tone-info">
                            <h3>Pistes de progrès</h3>
                            <ul>${nextStepsItems.map(item => `<li>${this._formatPrintRichText(item)}</li>`).join('')}</ul>
                        </div>
                    ` : ''}
                </div>
            </section>
        ` : '';

        const htmlContent = `
            <article class="pr-document">
                <header class="pr-header">
                    <div class="pr-student-identity">
                        ${avatarHtml}
                        <div>
                            <p class="pr-eyebrow">Fiche bilan élève — Entretien parents / PP</p>
                            <h1 class="pr-title">${Utils.escapeHtml(fullName)}</h1>
                            <p class="pr-subtitle">
                                ${defaultClass ? `<span>${Utils.escapeHtml(defaultClass)}</span> · ` : ''}
                                ${subjectLabel ? `<span>${Utils.escapeHtml(subjectLabel)}</span> · ` : ''}
                                <span>${Utils.escapeHtml(periodLabel)}</span>
                            </p>
                            ${visibleStatuses.length > 0 ? `
                                <div class="pr-status-pills">
                                    ${visibleStatuses.map(s => `<span class="pr-status-pill">${Utils.escapeHtml(String(s))}</span>`).join('')}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="pr-meta-right">
                        <span class="pr-date">${Utils.escapeHtml(dateStr)}</span>
                        <span class="pr-brand">Bulletin AI</span>
                    </div>
                </header>

                <section class="pr-section">
                    <h2 class="pr-section-title">Résultats &amp; positionnement dans la classe</h2>
                    <div class="${hasTrajectoryPoints ? 'pr-student-perf-split' : ''}">
                        <table class="pr-table">
                            <thead>
                                <tr>
                                    <th>Période</th>
                                    <th>Moyenne élève</th>
                                    <th>Évolution</th>
                                    <th>Moyenne classe</th>
                                    <th>Écart classe</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${periodRows.map(row => `
                                    <tr class="${row.period === currentPeriod ? 'is-current-period' : ''}">
                                        <td><strong>${Utils.escapeHtml(row.period)}</strong></td>
                                        <td>${row.studentGrade !== null ? `<strong>${this._formatNumberFr(row.studentGrade)}/20</strong>` : '--'}</td>
                                        <td>${row.delta !== null ? `<span class="pr-delta ${this._getDeltaToneClass(row.delta)}">${this._formatNumberFr(row.delta, true)} pt</span>` : '--'}</td>
                                        <td>${row.classAvg !== null ? `${this._formatNumberFr(row.classAvg)}/20` : '--'}</td>
                                        <td>${row.diffClass !== null ? `${this._formatNumberFr(row.diffClass, true)} pt` : '--'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        ${hasTrajectoryPoints ? `<div class="pr-card pr-chart-box">${trajectorySvg}</div>` : ''}
                    </div>
                </section>

                <section class="pr-section pr-keep-together">
                    <h2 class="pr-section-title">Appréciation — ${Utils.escapeHtml(periodLabel)}</h2>
                    ${appreciationHtml}
                </section>

                ${analysisHtml}

                <section class="pr-section pr-notes-section pr-keep-together">
                    <h2 class="pr-section-title">Notes d'entretien &amp; objectifs fixés</h2>
                    <div class="pr-writing-lines">
                        <div class="pr-writing-line"></div>
                        <div class="pr-writing-line"></div>
                        <div class="pr-writing-line"></div>
                    </div>
                </section>

                <footer class="pr-footer">
                    <span>Extrait pédagogique établi avec Bulletin AI</span>
                    <span>Document confidentiel à usage scolaire</span>
                </footer>
            </article>
        `;

        const safeStudentName = fullName.replace(/[^a-zA-Z0-9À-ÿ\-_ ]/g, '').trim().replace(/\s+/g, '-');
        const title = `Bilan_${safeStudentName}_${currentPeriod}`;
        this._printHtmlReport({ title, htmlContent });
        UI?.recordSupportMilestone?.('bulletin-export');
    },

    /**
     * Copie les appréciations de plusieurs élèves
     * @param {Array<string>} ids - Liste des IDs
     * @returns {Promise<number>} Nombre d'appréciations copiées
     */
    async copyBulkAppreciations(ids) {
        if (!ids || ids.length === 0) return 0;

        const currentPeriod = appState.currentPeriod;
        const idSet = new Set(ids);
        const resultsToCopy = Utils.sortResults(appState.generatedResults.filter(r => idSet.has(r.id)));
        const activeResults = resultsToCopy.filter(r => {
            const appreciation = Utils.getPeriodAppreciation(r, currentPeriod);
            return appreciation?.trim();
        });

        if (activeResults.length === 0) {
            UI.showNotification('Aucune appréciation à copier parmi la sélection.', 'warning');
            return 0;
        }

        const text = activeResults.map(r => {
            const appreciation = Utils.getPeriodAppreciation(r, currentPeriod);
            return `${Utils.formatStudentName(r.nom, r.prenom)}\n${Utils.stripMarkdown(Utils.decodeHtmlEntities(appreciation))}`;
        }).join('\n\n');

        try {
            await navigator.clipboard.writeText(text);

            // Marquer comme copiés pour la période active
            activeResults.forEach(r => {
                Utils.setAppreciationCopied(r, currentPeriod, true);
            });

            StorageManager.saveAppState();
            UI?.recordSupportMilestone?.('bulletin-export');
            return activeResults.length;
        } catch (err) {
            console.error('Erreur bulk copy:', err);
            UI.showNotification('Échec de la copie groupée.', 'error');
            return 0;
        }
    }
};
