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
import { FocusPanelStatus } from '../FocusPanelStatus.js';
import { SpeechRecognitionManager } from '../SpeechRecognitionManager.js';

const COPY_FEEDBACK_MS = 1500;
const COPY_BUTTON_ICON = 'solar:copy-linear';
const COPY_BUTTON_LABEL = 'Copier';

export const FocusPanelGenerator = {
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
                    const generateBtn = document.getElementById('focusGenerateBtn');
                    if (generateBtn) UI.hideInlineSpinner(generateBtn);

                    if (result) {
                        FocusPanelStatus.updateAppreciationStatus(result, { animate: false });
                        panel._renderAppreciationText(result);
                        panel._updateGenerateButton(result);
                        FocusPanelStatus.updateSourceIndicator(result);
                    }

                    document.querySelectorAll('#focusRefinementOptions .is-generating').forEach(b => {
                        b.classList.remove('is-generating');
                    });
                }

                if (result) {
                    panel._updateListRow(result);
                }
                UI.updateControlButtons();
            }
        }
    },

    /**
     * Affiche une prévisualisation du prompt qui serait envoyé à l'IA
     * @param {Object} panel - Instance FocusPanelManager
     */
    async showPromptPreview(panel) {
        if (!panel.currentStudentId) return;

        const result = appState.generatedResults.find(r => r.id === panel.currentStudentId);
        if (!result) return;

        const currentPeriod = appState.currentPeriod;
        const studentData = panel._prepareStudentData(panel.currentStudentId, currentPeriod, result);
        studentData.generatedAppreciation = '';

        const prompts = panel.appreciationsManager?.getAllPrompts(studentData) || {};
        const promptText = prompts.appreciation || '';

        await panel._displayPromptModal(promptText, 'Prévisualisation du Prompt');
    },

    /**
     * Copie directement le prompt dans le presse-papier (sans modale)
     * @param {Object} panel - Instance FocusPanelManager
     */
    async copyPromptToClipboard(panel) {
        if (!panel.currentStudentId) {
            UI.showNotification('Aucun élève sélectionné', 'warning');
            return;
        }

        const result = appState.generatedResults.find(r => r.id === panel.currentStudentId);
        if (!result) return;

        const currentPeriod = appState.currentPeriod;
        const studentData = panel._prepareStudentData(panel.currentStudentId, currentPeriod, result);
        studentData.generatedAppreciation = '';

        const prompts = panel.appreciationsManager?.getAllPrompts(studentData) || {};
        const promptText = prompts.appreciation || '';

        if (!promptText) {
            UI.showNotification('Impossible de générer le prompt', 'warning');
            return;
        }

        try {
            await navigator.clipboard.writeText(promptText);
            panel._flashCopyFeedback('copied-prompt', 'Prompt copié !');
            UI.showNotification('Prompt copié dans le presse-papier', 'prompt');
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
        if (!panel.currentStudentId || panel._isCancellingGeneration) return;

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

            Object.assign(result, {
                evolutions: newResult.evolutions,
                errorMessage: newResult.errorMessage,
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

            if (!result.studentData.periods[generatingForPeriod]) {
                result.studentData.periods[generatingForPeriod] = {};
            }
            result.studentData.periods[generatingForPeriod].appreciation = newResult.appreciation;

            const stillOnSameView =
                panel.currentStudentId === generatingForStudentId &&
                appState.currentPeriod === generatingForPeriod &&
                appState.currentClassId === generatingForClassId;

            if (newResult.errorMessage) {
                if (stillOnSameView) {
                    panel._renderAppreciationText(result);
                    UI?.showNotification?.(`Erreur : ${newResult.errorMessage}`, 'error');
                }
            } else if (newResult.appreciation) {
                if (!result.historyPerPeriod) result.historyPerPeriod = {};
                FocusPanelHistory.load(generatingForStudentId, generatingForPeriod);
                const hasExistingVersions = FocusPanelHistory.getVersionCount(generatingForPeriod, generatingForStudentId) > 0;
                FocusPanelHistory.push(newResult.appreciation, hasExistingVersions ? 'regenerate' : 'original', {
                    studentId: generatingForStudentId,
                    period: generatingForPeriod
                });

                if (stillOnSameView) {
                    const appreciationEl = document.getElementById('focusAppreciationText');
                    if (appreciationEl) {
                        appreciationEl.classList.remove('empty');

                        const targetWordCount = Utils.countWords(newResult.appreciation);
                        FocusPanelStatus.updateWordCount(true, 0, targetWordCount);

                        const htmlHtml = Utils.cleanMarkdown(newResult.appreciation);
                        if (typeof UI?.animateHtmlReveal === 'function') {
                            await UI.animateHtmlReveal(appreciationEl, htmlHtml, { speed: 'fast' });
                        } else {
                            appreciationEl.innerHTML = htmlHtml;
                        }
                        panel._initialAppreciationHtml = htmlHtml;
                        panel._isAppreciationEdited = false;
                    }

                    FocusPanelStatus.updateAppreciationStatus(result, { state: 'generated' });
                    FocusPanelStatus.updateSourceIndicator(result);
                    panel._updateGenerateButton(result);
                } else {
                    UI?.showNotification?.(`Appréciation générée pour ${result.prenom || result.studentData?.prenom || ''}`, 'info');
                }

                panel._updateListRow(result);
                StorageManager.saveAppState();
            }
        } catch (error) {
            if (signal.aborted || error.name === 'AbortError') {
                return;
            }

            if (panel._activeGenerations.has(generatingForStudentId)) {
                const currentController = panel._activeGenerations.get(generatingForStudentId);
                if (currentController && currentController.signal === signal) {
                    panel._activeGenerations.delete(generatingForStudentId);
                }
            }

            result.errorMessage = error.message;
            result.errorPeriod = generatingForPeriod;

            const stillOnSameView =
                panel.currentStudentId === generatingForStudentId &&
                appState.currentPeriod === generatingForPeriod &&
                appState.currentClassId === generatingForClassId;

            if (stillOnSameView) {
                UI?.showNotification?.(`Erreur : ${error.message}`, 'error');
                panel._renderAppreciationText(result);
            } else {
                UI?.showNotification?.(`Échec pour ${result.prenom || result.studentData?.prenom || ''} : ${error.message}`, 'error');
            }

            panel._updateListRow(result);
            StorageManager.saveAppState();
        } finally {
            if (panel._activeGenerations.has(generatingForStudentId)) {
                const currentController = panel._activeGenerations.get(generatingForStudentId);
                if (currentController && currentController.signal === signal) {
                    panel._activeGenerations.delete(generatingForStudentId);
                }
            }

            if (!panel._activeGenerations.has(generatingForStudentId)) {
                const stillOnSameView =
                    panel.currentStudentId === generatingForStudentId &&
                    appState.currentPeriod === generatingForPeriod &&
                    appState.currentClassId === generatingForClassId;

                if (panel.currentStudentId === generatingForStudentId && generateBtn) {
                    UI?.hideInlineSpinner?.(generateBtn);
                }

                if (stillOnSameView && result) {
                    FocusPanelStatus.updateAppreciationStatus(result, { animate: false });
                    panel._renderAppreciationText(result);
                    panel._updateGenerateButton(result);
                }

                panel._updateListRow(result);
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
     */
    async handleExternalGenerationComplete(panel, studentId, result, animate = true) {
        if (panel.currentStudentId !== studentId || !result) return;
        const generateBtn = document.getElementById('focusGenerateBtn');
        if (generateBtn) UI.hideInlineSpinner(generateBtn);

        const appreciationEl = document.getElementById('focusAppreciationText');
        const period = appState.currentPeriod;
        const periodApp = result.studentData?.periods?.[period]?.appreciation;
        const effectiveApp = periodApp || ((result.generationPeriod === period) ? result.appreciation : '');

        if (result.errorMessage && result.errorPeriod === period) {
            panel._renderAppreciationText(result);
            FocusPanelStatus.updateAppreciationStatus(result, { animate: false });
            panel._updateGenerateButton(result);
            return;
        }

        if (effectiveApp) {
            if (appreciationEl && animate) {
                appreciationEl.classList.remove('empty');
                const targetWordCount = Utils.countWords(effectiveApp);
                FocusPanelStatus.updateWordCount(true, 0, targetWordCount);
                const htmlHtml = Utils.cleanMarkdown(effectiveApp);
                await UI.animateHtmlReveal(appreciationEl, htmlHtml, { speed: 'fast' });
                panel._initialAppreciationHtml = htmlHtml;
                panel._isAppreciationEdited = false;
            } else if (appreciationEl) {
                panel._renderAppreciationText(result);
            }

            if (!result.historyPerPeriod) result.historyPerPeriod = {};
            FocusPanelHistory.load(studentId);
            const hasExistingVersions = FocusPanelHistory.getVersionCount() > 0;
            FocusPanelHistory.push(effectiveApp, hasExistingVersions ? 'regenerate' : 'original');

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

        appreciationEl.classList.remove('empty');
        appreciationEl.innerHTML = Utils.getSkeletonHTML(false, '', false, false);

        const wordCountEl = document.getElementById('focusWordCount');
        if (wordCountEl) wordCountEl.innerHTML = '';

        const sourceIndicator = document.getElementById('focusAiIndicator');
        if (sourceIndicator) sourceIndicator.style.display = 'none';

        const refinementOptions = document.getElementById('focusRefinementOptions');
        if (refinementOptions) {
            refinementOptions.querySelectorAll('[data-refine-type]').forEach(btn => {
                btn.classList.add('disabled');
            });
        }

        const copyBtn = document.getElementById('focusCopyBtn');
        if (copyBtn) copyBtn.classList.add('disabled');

        const speakBtn = document.getElementById('focusAppreciationSpeakBtn');
        if (speakBtn) speakBtn.classList.add('disabled');

        const micBtn = document.getElementById('focusAppreciationMicBtn');
        if (micBtn) micBtn.classList.add('disabled');
    },

    /**
     * Met à jour l'état du bouton Générer (Générer / Mettre à jour / Régénérer)
     * @param {Object} result - Données de l'élève
     */
    updateGenerateButton(result) {
        const generateBtn = document.getElementById('focusGenerateBtn');
        if (!generateBtn) return;

        if (generateBtn.classList.contains('is-loading')) return;

        if (SpeechRecognitionManager.isRecording?.() && SpeechRecognitionManager.getActiveTarget?.() === 'appreciation') {
            generateBtn.disabled = true;
            generateBtn.classList.add('disabled');
            const tooltipText = 'Génération indisponible pendant la dictée vocale';
            generateBtn.setAttribute('data-tooltip', tooltipText);
            if (generateBtn._tippy) generateBtn._tippy.setContent(tooltipText);
            return;
        }

        generateBtn.classList.remove('btn-ai', 'btn-ai-outline', 'btn-regenerate-warning', 'btn-neutral', 'btn-warning');
        generateBtn.disabled = false;
        generateBtn.classList.remove('disabled');

        const currentPeriod = appState.currentPeriod;
        const periodAppreciation = result?.studentData?.periods?.[currentPeriod]?.appreciation;
        const hasAppreciation = periodAppreciation && periodAppreciation.trim().length > 0;
        const wasGenerated = result?.wasGenerated === true;
        const isCurrentPeriodGenerated = result?.generationPeriod === currentPeriod;
        const isRegenerate = hasAppreciation && (wasGenerated && isCurrentPeriodGenerated);
        const isDirty = hasAppreciation && isRegenerate && FocusPanelStatus.checkDirtyState(result);

        const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.platform || '');
        const shortcutKbd = `<kbd class="kbd-hint">${isMac ? '⌘↵' : 'Ctrl ↵'}</kbd>`;

        let tooltipAction = 'Générer';
        if (!hasAppreciation) {
            generateBtn.classList.add('btn-ai');
            generateBtn.innerHTML = `<iconify-icon icon="solar:magic-stick-3-bold-duotone"></iconify-icon> Générer ${shortcutKbd}`;
            tooltipAction = 'Générer';
        } else if (isDirty) {
            generateBtn.classList.add('btn-warning');
            generateBtn.innerHTML = `<iconify-icon icon="solar:refresh-bold"></iconify-icon> Mettre à jour ${shortcutKbd}`;
            tooltipAction = 'Mettre à jour';
        } else {
            generateBtn.classList.add('btn-neutral');
            generateBtn.innerHTML = `<iconify-icon icon="solar:refresh-bold"></iconify-icon> Régénérer ${shortcutKbd}`;
            tooltipAction = 'Régénérer';
        }

        const tooltipText = `${tooltipAction} l'appréciation (Ctrl + Entrée)<br><i style='opacity:0.7'>Clic droit : prévisualiser le prompt</i>`;
        generateBtn.setAttribute('data-tooltip', tooltipText);
        if (generateBtn._tippy) {
            generateBtn._tippy.setContent(tooltipText);
        }
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
        if (labelEl) labelEl.textContent = COPY_BUTTON_LABEL;
    }
};
