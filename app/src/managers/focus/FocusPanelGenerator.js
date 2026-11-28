/**
 * @fileoverview Focus Panel Generator — Orchestration de la génération IA, annulation, copie et aperçu de prompt
 * Extrait de FocusPanelManager.js (Lot 11 — Découpage God Object #1)
 * @module managers/focus/FocusPanelGenerator
 */

import { appState } from '../../state/State.js';
import { Utils } from '../../utils/Utils.js';
import { UI } from '../UIManager.js';
import { StorageManager } from '../StorageManager.js';
import { PromptService } from '../../services/PromptService.js';
import { ListViewManager } from '../ListViewManager.js';
import { FocusPanelHistory } from '../FocusPanelHistory.js';
import { FocusPanelHeader } from '../FocusPanelHeader.js';
import { FocusPanelStatus } from '../FocusPanelStatus.js';
import { FocusPanelRefinement } from '../FocusPanelRefinement.js';
import { SpeechRecognitionManager } from '../SpeechRecognitionManager.js';

const COPY_FEEDBACK_MS = 1500;
const COPY_BUTTON_ICON = 'solar:copy-linear';
const GENERATE_TOOLTIPS = {
    idle: 'Rédiger l\'appréciation avec l\'IA',
    dirty: 'Données modifiées · Mettre à jour l\'appréciation',
    done: 'Proposer une nouvelle version'
};

export const FocusPanelGenerator = {
    /**
     * Valide et quitte le mode édition de l'en-tête si actif (notamment en mode création d'élève)
     * @param {Object} panel - Instance FocusPanelManager
     * @returns {boolean} false si la validation de création a échoué
     * @private
     */
    _commitEditingHeaderIfNeeded(panel) {
        const header = document.querySelector('.focus-header');
        if (panel.isCreationMode || header?.classList.contains('editing')) {
            const saved = FocusPanelHeader.toggleEditMode(false, false);
            if (saved === false) return false;
        }
        return true;
    },
    /**
     * Annule toute génération en cours pour un élève donné
     * @param {Object} panel - Instance FocusPanelManager
     * @param {string} studentId - ID de l'élève
     * @param {Object} [options]
     * @param {boolean} [options.restoreUI=true]
     */
    cancelGenerationForStudent(panel, studentId, { restoreUI = true } = {}) {
        if (panel._activeGenerations.has(studentId)) {
            const controller = panel._activeGenerations.get(studentId);
            controller.abort();
            panel._activeGenerations.delete(studentId);
            panel._activeGenerationStartTime = 0;

            if (restoreUI) {
                const result = appState.generatedResults.find(r => r.id === studentId);
                if (panel.currentStudentId === studentId) {
                    const appreciationEl = document.getElementById('focusAppreciationText');
                    if (appreciationEl) UI?.cancelHtmlReveal?.(appreciationEl);

                    const generateBtn = document.getElementById('focusGenerateBtn');
                    if (generateBtn) UI.hideInlineSpinner(generateBtn);

                    if (result) {
                        FocusPanelStatus.updateAppreciationStatus(result, { animate: false });
                        panel._renderAppreciationText(result);
                        panel._updateGenerateButton(result);
                        FocusPanelStatus.updateSourceIndicator(result);
                        FocusPanelStatus.updateHistoryIndicator();
                    }

                    document.querySelectorAll('#focusRefinementOptions .is-generating, #focusPolishBtn.is-generating, #focusCustomRefineSubmitBtn.is-generating').forEach(b => {
                        b.classList.remove('is-generating');
                        if (b.dataset.baseTooltip !== undefined) {
                            const baseTooltip = b.dataset.baseTooltip;
                            delete b.dataset.baseTooltip;
                            if (typeof UI?.updateTooltip === 'function') {
                                UI.updateTooltip(b, baseTooltip);
                            } else {
                                b.setAttribute('data-tooltip', baseTooltip);
                            }
                        }
                    });
                    const customInput = document.getElementById('focusCustomRefineInput');
                    if (customInput) customInput.disabled = false;
                    const customCloseBtn = document.getElementById('focusCustomRefineCloseBtn');
                    if (customCloseBtn) {
                        customCloseBtn.disabled = false;
                        customCloseBtn.classList.remove('disabled');
                    }
                    FocusPanelRefinement._syncCustomSubmitState?.();
                    if (FocusPanelRefinement.isCustomInputOpen?.() && customInput && !window.matchMedia?.('(pointer: coarse)')?.matches) {
                        customInput.focus();
                    }
                    FocusPanelStatus.syncRefinementStates?.(result);
                }

                if (result) {
                    panel._updateListRow(result);
                }
                UI.updateControlButtons();
            }
        }
    },

    /**
     * Résout les données et le prompt d'appréciation de l'élève courant
     * @param {Object} panel - Instance FocusPanelManager
     * @param {Object} [options]
     * @param {boolean} [options.notifyIfMissingStudent=false]
     * @returns {{ studentData: Object, promptText: string }|null}
     * @private
     */
    _resolveCurrentPromptContext(panel, { notifyIfMissingStudent = false } = {}) {
        if (!this._commitEditingHeaderIfNeeded(panel)) return null;
        if (!panel.currentStudentId) {
            if (notifyIfMissingStudent) UI.showNotification('Aucun élève sélectionné', 'warning');
            return null;
        }

        const result = appState.generatedResults.find(r => r.id === panel.currentStudentId);
        if (!result) return null;

        const studentData = panel._prepareStudentData(panel.currentStudentId, appState.currentPeriod, result);
        studentData.generatedAppreciation = '';

        const prompts = panel.appreciationsManager?.getAllPrompts(studentData) || {};
        return {
            studentData,
            promptText: prompts.appreciation || ''
        };
    },

    /**
     * Construit le résumé HTML échappé des données réellement transmises à l'IA
     * @param {Object} summary - Sortie de PromptService.getPromptSummary()
     * @returns {string}
     * @private
     */
    _buildPromptSummaryHtml(summary) {
        if (!summary) return '';
        const esc = (v) => Utils.escapeHtml(String(v ?? ''));

        const genderLabels = {
            'féminin': 'Féminin',
            'masculin': 'Masculin',
            'non déterminé': 'Genre non déterminé'
        };
        const identityBadge = summary.identity.isAnonymous
            ? '<span class="ai-data-badge is-rgpd">Anonymisé · RGPD</span>'
            : '<span class="ai-data-badge is-included">Nom masqué</span>';
        const identityParts = [esc(summary.identity.label)];
        if (summary.identity.genderIncluded && summary.identity.gender) {
            identityParts.push(esc(genderLabels[summary.identity.gender] || summary.identity.gender));
        }
        if (summary.identity.className) identityParts.push(esc(summary.identity.className));
        if (summary.identity.levelLabel) identityParts.push(esc(summary.identity.levelLabel));

        const periodGradeParts = (summary.grades.items || []).map(item => {
            const val = item.gradeFormatted || 'Non renseignée';
            const evalSuffix = item.evalCount ? ` (${item.evalCount} éval.)` : '';
            return `${esc(item.periodLabel)} : <strong>${esc(val)}</strong>${esc(evalSuffix)}`;
        });
        const gradeMetaParts = [];
        const evolutions = summary.grades.evolutions;
        if (Array.isArray(evolutions) && evolutions.length === 1) {
            gradeMetaParts.push(esc(`${evolutions[0].description} (${evolutions[0].deltaLabel})`));
        } else if (Array.isArray(evolutions) && evolutions.length > 1) {
            gradeMetaParts.push(evolutions.map(ev => esc(`${ev.periode} (${ev.deltaLabel})`)).join(' · '));
        } else if (summary.grades.evolutionText) {
            gradeMetaParts.push(esc(summary.grades.evolutionText.replace(/->/g, '→').replace(/\n/g, ' · ')));
        }
        if (summary.grades.classStatsIncluded) {
            gradeMetaParts.push(summary.grades.classAverageFormatted
                ? `Moy. classe ${esc(summary.grades.classAverageFormatted)}`
                : 'Repères de classe inclus');
        }
        let gradesHtml = '<span class="ai-data-muted">Aucune moyenne renseignée</span>';
        if (periodGradeParts.length > 0 || gradeMetaParts.length > 0) {
            const topLine = periodGradeParts.length > 0 ? `<span>${periodGradeParts.join(' · ')}</span>` : '';
            const subLine = gradeMetaParts.length > 0 ? `<div class="ai-data-subitem">${gradeMetaParts.join(' · ')}</div>` : '';
            gradesHtml = `${topLine}${subLine}`;
        }

        const rows = [
            {
                label: 'Identité',
                valueHtml: `${identityBadge}<span>${identityParts.join(' · ')}</span>`
            },
            {
                label: 'Moyennes',
                valueHtml: gradesHtml
            }
        ];

        if (summary.previousAppreciations?.length > 0) {
            const prevAppsHtml = summary.previousAppreciations.map((a) => {
                const raw = a.preview.length > 180 ? `${a.preview.slice(0, 180).trimEnd()}…` : a.preview;
                const inner = `<strong>${esc(a.periodLabel)} :</strong> « ${esc(raw)} »`;
                return summary.previousAppreciations.length === 1
                    ? `<span>${inner}</span>`
                    : `<div class="ai-data-line">${inner}</div>`;
            }).join('');
            rows.push({ label: 'Précédent', valueHtml: prevAppsHtml });
        }

        if (summary.statuses?.length > 0) {
            const statusesHtml = `<div class="ai-data-status-list">${summary.statuses.map(st => `
                <div class="ai-data-status-item">
                    <span class="ai-data-badge ${st.isGdprSensitive ? 'is-rgpd' : 'is-included'}">${esc(st.label)}${st.isGdprSensitive ? ' masqué · RGPD' : ''}</span>
                    <span class="ai-data-status-desc">« ${esc(st.instruction)} »</span>
                </div>`).join('')}</div>`;
            rows.push({ label: 'Statuts', valueHtml: statusesHtml });
        }

        const j = summary.journal;
        const hasJournalContent = Boolean(
            !j?.includedInAI ||
            j?.totalCount > 0 ||
            j?.tags?.length > 0 ||
            j?.notes?.length > 0
        );
        if (j && hasJournalContent) {
            let journalHtml = '';
            const standaloneLabels = Array.isArray(j.standaloneLabels)
                ? j.standaloneLabels
                : (j.tags || []).map(t => t.label);
            const notes = j.notes || [];

            if (!j.includedInAI) {
                journalHtml = `<span class="ai-data-badge is-excluded">Hors IA</span> <span class="ai-data-muted">Journal personnel non transmis</span>`;
            } else if (standaloneLabels.length > 0 || notes.length > 0) {
                const privSuffix = j.privateCount > 0
                    ? ` <span class="ai-data-muted">(${j.privateCount} privée${j.privateCount > 1 ? 's' : ''} exclue${j.privateCount > 1 ? 's' : ''})</span>`
                    : '';
                const formattedNotes = notes.map(n => {
                    const tagLabels = n.uiTagLabels?.length ? n.uiTagLabels : (n.extraTagLabels || []);
                    const tagPrefix = tagLabels.length > 0 ? `${esc(tagLabels.join(', '))} : ` : '';
                    return `${tagPrefix}« ${esc(n.text)} »`;
                });

                if (standaloneLabels.length === 0 && formattedNotes.length === 1) {
                    journalHtml = `<span>${formattedNotes[0]}</span>${privSuffix}`;
                } else {
                    const parts = [];
                    if (standaloneLabels.length > 0) {
                        const tagsSuffix = formattedNotes.length === 0 ? privSuffix : '';
                        parts.push(`<div class="ai-data-line">${standaloneLabels.map(esc).join(' · ')}${tagsSuffix}</div>`);
                    }
                    formattedNotes.forEach((fn, idx) => {
                        const noteSuffix = idx === formattedNotes.length - 1 ? privSuffix : '';
                        parts.push(`<div class="ai-data-line">${fn}${noteSuffix}</div>`);
                    });
                    journalHtml = parts.join('');
                }
            } else if (j.totalCount > 0 && j.privateCount === j.totalCount) {
                const plural = j.privateCount > 1 ? 's' : '';
                journalHtml = `<span class="ai-data-muted">Aucune observation transmise (${j.privateCount} privée${plural} exclue${plural})</span>`;
            } else {
                journalHtml = `<span class="ai-data-muted">Aucune observation transmise · tags isolés (seuil ${esc(j.threshold)}×)</span>`;
            }
            rows.push({ label: 'Journal', valueHtml: journalHtml });
        }

        if (summary.context) {
            rows.push({ label: 'Indications', valueHtml: `« ${esc(summary.context)} »` });
        }

        const styleParts = [esc(summary.style.voiceLabel)];
        if (summary.style.discipline) styleParts.push(esc(summary.style.discipline));
        if (summary.style.maxChars) styleParts.push(`max ${esc(summary.style.maxChars)} car.`);
        else if (summary.style.length) styleParts.push(`~${esc(summary.style.length)} mots`);
        if (summary.style.hasCustomInstructions) styleParts.push('consigne personnalisée');

        const rowsHtml = rows.map(row => `
                <div class="ai-data-row">
                    <span class="ai-data-row-label">${esc(row.label)}</span>
                    <div class="ai-data-row-value">${row.valueHtml}</div>
                </div>`).join('');

        return `
            <div class="ai-data-summary">
                <div class="ai-data-card">${rowsHtml}
                </div>
                <div class="ai-data-style-bar">
                    <span class="ai-data-style-label">Style :</span>
                    <span>${styleParts.join(' · ')}</span>
                </div>
            </div>
        `;
    },

    /**
     * Affiche un récapitulatif clair des données transmises à l'IA et le prompt complet
     * @param {Object} panel - Instance FocusPanelManager
     */
    async showPromptPreview(panel) {
        const ctx = this._resolveCurrentPromptContext(panel);
        if (!ctx) return;

        const summary = PromptService.getPromptSummary?.(ctx.studentData) || null;
        const summaryHtml = summary ? this._buildPromptSummaryHtml(summary) : '';
        const title = summaryHtml
            ? (summary?.currentPeriodLabel
                ? `Données transmises à l'IA · ${summary.currentPeriodLabel}`
                : 'Données transmises à l\'IA')
            : 'Prévisualisation du prompt';

        await panel._displayPromptModal(ctx.promptText, title, summaryHtml ? { summaryHtml } : {});
    },

    /**
     * Copie directement le prompt dans le presse-papier (sans modale)
     * @param {Object} panel - Instance FocusPanelManager
     */
    async copyPromptToClipboard(panel) {
        const ctx = this._resolveCurrentPromptContext(panel, { notifyIfMissingStudent: true });
        if (!ctx) return;
        const { promptText } = ctx;

        if (!promptText) {
            UI.showNotification('Impossible de générer le prompt', 'warning');
            return;
        }

        try {
            await navigator.clipboard.writeText(promptText);
            panel._flashCopyFeedback('copied-prompt', 'Prompt copié !');
        } catch (err) {
            console.error('Failed to copy prompt:', err);
            UI.showNotification('Échec de la copie du prompt', 'error');
        }
    },

    /**
     * Prépare les données d'un élève pour la génération ou l'aperçu du prompt
     * @param {string} studentId
     * @param {string} period
     * @param {Object} result
     * @returns {Object}
     */
    prepareStudentData(studentId, period, result) {
        return {
            id: studentId,
            classId: result.classId ?? result.studentData?.classId ?? appState.currentClassId,
            nom: result.nom,
            prenom: result.prenom,
            statuses: result.studentData.statuses || [],
            periods: result.studentData.periods,
            currentPeriod: period
        };
    },

    /**
     * Génère l'appréciation pour l'élève courant avec verrouillage de concurrence { classId, studentId, period }
     * @param {Object} panel - Instance FocusPanelManager
     */
    async generate(panel) {
        if (panel._isCancellingGeneration) return;
        if (!this._commitEditingHeaderIfNeeded(panel)) return;
        if (!panel.currentStudentId) return;

        // Capture student ID, period AND class at the START of generation (Lot 5 concurrency lock)
        const generatingForStudentId = panel.currentStudentId;
        const generatingForPeriod = appState.currentPeriod;
        const generatingForClassId = appState.currentClassId;

        if (SpeechRecognitionManager.isRecording?.() && SpeechRecognitionManager.getActiveTarget?.() === 'appreciation') {
            return;
        }

        const result = appState.generatedResults.find(r => r.id === generatingForStudentId);
        if (!result) return;

        if (panel._activeGenerations.has(generatingForStudentId)) {
            const elapsed = Date.now() - (panel._activeGenerationStartTime || 0);
            if (elapsed < 350) return;

            panel._isCancellingGeneration = true;
            panel._cancelGenerationForStudent(generatingForStudentId);
            setTimeout(() => { panel._isCancellingGeneration = false; }, 300);
            return;
        }

        if (typeof UI?.checkAPIKeyPresence === 'function' && !UI.checkAPIKeyPresence()) {
            return;
        }

        panel._activeGenerationStartTime = Date.now();

        const abortController = new AbortController();
        panel._activeGenerations.set(generatingForStudentId, abortController);
        const signal = abortController.signal;

        result.errorMessage = null;
        result.errorPeriod = null;

        if (panel.listViewManager?.setRowStatus) {
            panel.listViewManager.setRowStatus(generatingForStudentId, 'generating');
        } else if (ListViewManager?.setRowStatus) {
            ListViewManager.setRowStatus(generatingForStudentId, 'generating');
        }

        panel._saveContext();

        const gradeInput = document.getElementById('focusCurrentGradeInput');
        const grade = gradeInput?.value.trim().replace(',', '.');

        if (grade) {
            if (!result.studentData.periods[generatingForPeriod]) {
                result.studentData.periods[generatingForPeriod] = {};
            }
            result.studentData.periods[generatingForPeriod].grade = parseFloat(grade);
        }

        const generateBtn = document.getElementById('focusGenerateBtn');
        const appreciationEl = document.getElementById('focusAppreciationText');
        const isStillOnSameView = () =>
            panel.currentStudentId === generatingForStudentId &&
            appState.currentPeriod === generatingForPeriod &&
            appState.currentClassId === generatingForClassId;
        const clearActiveGeneration = () => {
            if (panel._activeGenerations.get(generatingForStudentId)?.signal === signal) {
                panel._activeGenerations.delete(generatingForStudentId);
            }
        };

        if (generateBtn) {
            UI?.showInlineSpinner?.(generateBtn);
        }

        FocusPanelStatus.updateAppreciationStatus(null, { state: 'pending' });
        panel._showAppreciationSkeleton();

        try {
            const studentData = panel._prepareStudentData(generatingForStudentId, generatingForPeriod, result);
            const newResult = await panel.appreciationsManager.generateAppreciation(studentData, false, null, signal, 'single-student');

            if (signal.aborted) {
                return;
            }

            if (newResult.errorMessage) {
                Object.assign(result, {
                    evolutions: newResult.evolutions,
                    timestamp: newResult.timestamp,
                    isPending: false
                });
                throw new Error(newResult.errorMessage);
            }

            if (newResult.appreciation) {
                const htmlHtml = Utils.cleanMarkdown(newResult.appreciation);

                if (isStillOnSameView() && appreciationEl) {
                    appreciationEl.classList.remove('empty');

                    const targetWordCount = Utils.countWords(newResult.appreciation);
                    const targetCharCount = Utils.countCharacters(newResult.appreciation);
                    FocusPanelStatus.updateWordCount(true, 0, targetWordCount, targetCharCount);

                    if (typeof UI?.animateHtmlReveal === 'function') {
                        await UI.animateHtmlReveal(appreciationEl, htmlHtml, { speed: 'fast', signal });
                    } else {
                        appreciationEl.innerHTML = htmlHtml;
                    }
                }

                if (signal.aborted) {
                    return;
                }

                if (!result.historyPerPeriod) result.historyPerPeriod = {};
                if (panel.currentStudentId === generatingForStudentId && appState.currentPeriod === generatingForPeriod) {
                    FocusPanelHistory.load(generatingForStudentId, generatingForPeriod);
                }
                const hasExistingVersions = FocusPanelHistory.getVersionCount(generatingForPeriod, generatingForStudentId) > 0;

                Object.assign(result, {
                    evolutions: newResult.evolutions,
                    errorMessage: null,
                    errorPeriod: null,
                    timestamp: newResult.timestamp,
                    isPending: false,
                    wasGenerated: true,
                    appreciationSource: 'ai',
                    tokenUsage: newResult.tokenUsage
                });

                if (appState.currentPeriod === generatingForPeriod) {
                    result.appreciation = newResult.appreciation;
                }

                if (newResult.studentData?.currentAIModel) {
                    result.studentData.currentAIModel = newResult.studentData.currentAIModel;
                }

                result.promptHash = PromptService.getPromptHash({
                    ...result.studentData,
                    id: result.id,
                    currentPeriod: generatingForPeriod
                });
                result.generationPeriod = generatingForPeriod;

                Utils.markStudentModified(result, generatingForPeriod);
                result.studentData.periods[generatingForPeriod].appreciation = newResult.appreciation;

                FocusPanelHistory.push(newResult.appreciation, hasExistingVersions ? 'regenerate' : 'original', {
                    studentId: generatingForStudentId,
                    period: generatingForPeriod,
                    autoSeed: false
                });

                clearActiveGeneration();

                if (isStillOnSameView()) {
                    if (appreciationEl) {
                        if (appreciationEl.innerHTML !== htmlHtml) {
                            appreciationEl.innerHTML = htmlHtml;
                        }
                        appreciationEl.classList.remove('empty');
                        appreciationEl.classList.add('filled');
                        panel._initialAppreciationHtml = htmlHtml;
                        panel._isAppreciationEdited = false;
                    }

                    if (generateBtn) UI?.hideInlineSpinner?.(generateBtn);
                    FocusPanelStatus.updateWordCount();
                    FocusPanelStatus.updateAppreciationStatus(result, { state: 'generated' });
                    FocusPanelStatus.updateSourceIndicator(result);
                    panel._updateGenerateButton(result);
                } else {
                    if (panel.currentStudentId === generatingForStudentId && generateBtn) {
                        UI?.hideInlineSpinner?.(generateBtn);
                        panel._updateGenerateButton(result);
                    }
                    const studentLabel = result.prenom || result.studentData?.prenom || 'cet élève';
                    const isSameClass = appState.currentClassId === generatingForClassId;
                    const notifOptions = { bypassCoalescing: true };
                    if (isSameClass) {
                        notifOptions.action = {
                            label: 'Voir',
                            onClick: () => {
                                if (appState.currentClassId !== generatingForClassId) return;
                                if (appState.currentPeriod !== generatingForPeriod) {
                                    UI?.setPeriod?.(generatingForPeriod);
                                }
                                panel.open?.(generatingForStudentId);
                            }
                        };
                    }
                    UI?.showNotification?.(`Appréciation prête pour ${studentLabel}.`, 'success', 5000, notifOptions);
                }

                panel._updateListRow(result);
                StorageManager.saveAppState();
            }
        } catch (error) {
            if (signal.aborted || error.name === 'AbortError') {
                return;
            }

            clearActiveGeneration();

            result.errorMessage = error.message;
            result.errorPeriod = generatingForPeriod;

            if (isStillOnSameView()) {
                if (generateBtn) UI?.hideInlineSpinner?.(generateBtn);
                UI?.showNotification?.(`Erreur : ${error.message}`, 'error');
                panel._renderAppreciationText(result);
                panel._updateGenerateButton(result);
            } else {
                UI?.showNotification?.(`Échec pour ${result.prenom || result.studentData?.prenom || ''} : ${error.message}`, 'error');
            }

            panel._updateListRow(result);
            StorageManager.saveAppState();
        } finally {
            clearActiveGeneration();

            if (!panel._activeGenerations.has(generatingForStudentId)) {
                if (panel.currentStudentId === generatingForStudentId && generateBtn) {
                    UI?.hideInlineSpinner?.(generateBtn);
                    if (result) panel._updateGenerateButton(result);
                    FocusPanelStatus.updateHistoryIndicator();
                }
                UI?.updateControlButtons?.();
            }
        }
    },

    /**
     * Notifie le Focus Panel du démarrage d'une génération externe (tableau/lot)
     * @param {Object} panel - Instance FocusPanelManager
     * @param {string} studentId
     */
    handleExternalGenerationStart(panel, studentId) {
        if (panel.currentStudentId !== studentId) return;
        const generateBtn = document.getElementById('focusGenerateBtn');
        if (generateBtn) UI.showInlineSpinner(generateBtn);
        FocusPanelStatus.updateAppreciationStatus(null, { state: 'pending' });
        panel._showAppreciationSkeleton();
    },

    /**
     * Notifie le Focus Panel de la fin d'une génération externe
     * @param {Object} panel - Instance FocusPanelManager
     * @param {string} studentId
     * @param {Object} result
     * @param {boolean} [animate=true]
     * @param {Object} [options={}]
     * @param {boolean} [options.cancelled=false] - True si la génération externe a été annulée
     */
    async handleExternalGenerationComplete(panel, studentId, result, animate = true, { cancelled = false } = {}) {
        if (panel.currentStudentId !== studentId || !result) return;
        const generateBtn = document.getElementById('focusGenerateBtn');

        const appreciationEl = document.getElementById('focusAppreciationText');
        const period = appState.currentPeriod;
        const periodApp = result.studentData?.periods?.[period]?.appreciation;
        const effectiveApp = periodApp || ((result.generationPeriod === period) ? result.appreciation : '');

        if (cancelled || (result.errorMessage && result.errorPeriod === period) || !effectiveApp) {
            if (generateBtn) UI.hideInlineSpinner(generateBtn);
            if (appreciationEl) panel._renderAppreciationText(result);
            FocusPanelStatus.updateAppreciationStatus(result, { animate: false });
            FocusPanelStatus.updateSourceIndicator(result);
            FocusPanelStatus.updateHistoryIndicator();
            panel._updateGenerateButton(result);
            return;
        }

        if (effectiveApp) {
            if (appreciationEl && animate) {
                appreciationEl.classList.remove('empty');
                const targetWordCount = Utils.countWords(effectiveApp);
                const targetCharCount = Utils.countCharacters(effectiveApp);
                FocusPanelStatus.updateWordCount(true, 0, targetWordCount, targetCharCount);
                const htmlHtml = Utils.cleanMarkdown(effectiveApp);
                await UI.animateHtmlReveal(appreciationEl, htmlHtml, { speed: 'fast' });
                if (panel.currentStudentId !== studentId || appState.currentPeriod !== period) return;
                panel._initialAppreciationHtml = htmlHtml;
                panel._isAppreciationEdited = false;
            } else if (appreciationEl) {
                panel._renderAppreciationText(result);
            }

            if (generateBtn) UI.hideInlineSpinner(generateBtn);

            if (!result.historyPerPeriod) result.historyPerPeriod = {};
            FocusPanelHistory.load(studentId, period);
            const hasExistingVersions = FocusPanelHistory.getVersionCount(period, studentId) > 0;
            FocusPanelHistory.push(effectiveApp, hasExistingVersions ? 'regenerate' : 'original', {
                studentId,
                period
            });

            FocusPanelStatus.updateWordCount();
            FocusPanelStatus.updateAppreciationStatus(result, { state: 'generated' });
            FocusPanelStatus.updateSourceIndicator(result);
            panel._updateGenerateButton(result);
            try { navigator?.vibrate?.([15, 50, 20]); } catch (_) { }
        }
    },

    /**
     * Affiche le squelette de chargement dans la zone d'appréciation
     */
    showAppreciationSkeleton() {
        const appreciationEl = document.getElementById('focusAppreciationText');
        if (!appreciationEl) return;

        UI?.cancelHtmlReveal?.(appreciationEl);
        appreciationEl.classList.remove('empty');
        appreciationEl.innerHTML = Utils.getSkeletonHTML(false, '', false, false);

        const wordCountEl = document.getElementById('focusWordCount');
        if (wordCountEl) {
            wordCountEl.innerHTML = '';
            wordCountEl.classList.remove('is-limit-near', 'is-limit-over');
        }

        const sourceIndicator = document.getElementById('focusAiIndicator');
        if (sourceIndicator) sourceIndicator.style.display = 'none';

        const refinementOptions = document.getElementById('focusRefinementOptions');
        if (refinementOptions) {
            FocusPanelRefinement.closeCustomInput?.();
            refinementOptions.querySelectorAll('[data-refine-type], #focusCustomRefineTrigger').forEach(btn => {
                btn.classList.add('disabled');
            });
        }

        const polishBtn = document.getElementById('focusPolishBtn');
        if (polishBtn) polishBtn.classList.add('disabled');

        const copyBtn = document.getElementById('focusCopyBtn');
        if (copyBtn) {
            copyBtn.disabled = false;
            copyBtn.classList.add('disabled');
            copyBtn.setAttribute('aria-disabled', 'true');
        }

        const speakBtn = document.getElementById('focusAppreciationSpeakBtn');
        if (speakBtn) speakBtn.classList.add('disabled');

        const micBtn = document.getElementById('focusAppreciationMicBtn');
        if (micBtn) micBtn.classList.add('disabled');

        FocusPanelHistory.closePopover?.();
        FocusPanelStatus.updateHistoryIndicator();
    },

    /**
     * Met à jour l'état du bouton Générer (Générer / Actualiser / Régénérer)
     * @param {Object|null} result - Données de l'élève
     */
    updateGenerateButton(result) {
        const generateBtn = document.getElementById('focusGenerateBtn');
        if (!generateBtn || generateBtn.classList.contains('is-loading')) return;

        let tooltipText = GENERATE_TOOLTIPS.idle;

        if (SpeechRecognitionManager.isRecording?.() && SpeechRecognitionManager.getActiveTarget?.() === 'appreciation') {
            generateBtn.disabled = true;
            generateBtn.classList.add('disabled');
            tooltipText = 'Génération indisponible pendant la dictée vocale';
        } else {
            const currentPeriod = appState.currentPeriod;
            const periodAppreciation = result?.studentData?.periods?.[currentPeriod]?.appreciation;
            const hasAppreciation = Boolean(periodAppreciation && periodAppreciation.trim().length > 0);
            const isDirty = hasAppreciation && FocusPanelStatus.isBulkRefreshable(result, currentPeriod);

            const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.platform || '');
            const shortcutKbd = `<kbd class="kbd-hint">${isMac ? '⌘↵' : 'Ctrl ↵'}</kbd>`;

            const state = !hasAppreciation ? 'idle' : (isDirty ? 'dirty' : 'done');
            UI?.setGenerateButtonState?.(generateBtn, state, { suffixHtml: shortcutKbd });
            tooltipText = GENERATE_TOOLTIPS[state] || GENERATE_TOOLTIPS.idle;

            const copyBtn = document.getElementById('focusCopyBtn');
            if (copyBtn) {
                copyBtn.classList.toggle('is-primary-action', state === 'done' && !copyBtn.classList.contains('disabled'));
            }
        }

        generateBtn.setAttribute('data-tooltip', tooltipText);
        generateBtn._tippy?.setContent(tooltipText);
    },

    /**
     * Copie l'appréciation dans le presse-papier
     * @param {Object} panel - Instance FocusPanelManager
     */
    async copy(panel) {
        const result = appState.generatedResults.find(r => r.id === panel.currentStudentId);
        if (!result) return;

        const periodAppreciation = result.studentData.periods?.[appState.currentPeriod]?.appreciation;
        if (!periodAppreciation || !periodAppreciation.trim()) {
            UI.showNotification('Aucune appréciation à copier', 'warning');
            return;
        }

        try {
            const cleanText = Utils.stripMarkdown(Utils.decodeHtmlEntities(periodAppreciation));
            await navigator.clipboard.writeText(cleanText);
            Utils.setAppreciationCopied(result, appState.currentPeriod, true);
            StorageManager.saveAppState();
            ListViewManager.updateStudentRow?.(result.id, { copiedOnly: true });
            FocusPanelStatus.syncCopyButton({ isEmpty: false, isGenerating: false });
            UI?.recordSupportMilestone?.('bulletin-export');
            try { navigator?.vibrate?.(10); } catch (_) { }
            panel._flashCopyFeedback('copied', 'Copié !');
        } catch (error) {
            UI.showNotification('Erreur de copie', 'error');
        }
    },

    /**
     * Affiche brièvement l'état « copié » sur le bouton Copier puis le remet à zéro
     * @param {Object} panel - Instance FocusPanelManager
     * @param {'copied'|'copied-prompt'} stateClass
     * @param {string} label
     */
    flashCopyFeedback(panel, stateClass, label) {
        const copyBtn = document.getElementById('focusCopyBtn');
        if (!copyBtn) return;

        panel._resetCopyFeedback();

        copyBtn.querySelector('iconify-icon')?.setAttribute('icon', 'ph:check-bold');
        const labelEl = copyBtn.querySelector('.btn-copy-label');
        if (labelEl) labelEl.textContent = label;
        copyBtn.classList.add(stateClass);

        panel._copyTimeoutId = setTimeout(() => panel._resetCopyFeedback(), COPY_FEEDBACK_MS);
    },

    /**
     * Remet le bouton Copier dans son état neutre
     * @param {Object} panel - Instance FocusPanelManager
     */
    resetCopyFeedback(panel) {
        if (panel._copyTimeoutId) {
            clearTimeout(panel._copyTimeoutId);
            panel._copyTimeoutId = null;
        }

        const copyBtn = document.getElementById('focusCopyBtn');
        if (!copyBtn) return;

        copyBtn.classList.remove('copied', 'copied-prompt');
        copyBtn.querySelector('iconify-icon')?.setAttribute('icon', COPY_BUTTON_ICON);
        const labelEl = copyBtn.querySelector('.btn-copy-label');
        if (labelEl) labelEl.textContent = FocusPanelStatus.getCopyButtonDefaultLabel(copyBtn);
    }
};
