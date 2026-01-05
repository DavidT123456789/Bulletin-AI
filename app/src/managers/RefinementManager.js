/**
 * @fileoverview Gestionnaire du raffinement d'appréciations.
 * 
 * Ce module gère toutes les fonctionnalités liées au raffinement d'appréciations :
 * - Génération de suggestions de raffinement (concise, détaillée, encourageante, etc.)
 * - Application et acceptation des suggestions
 * - Affichage de la modale de raffinement
 * 
 * @module managers/RefinementManager
 */

import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { AIService } from '../services/AIService.js';
import { PromptService } from '../services/PromptService.js';
import { StorageManager } from './StorageManager.js';

/**
 * Helper interne pour créer le HTML du titre de modale
 * @private
 */
const _createModalTitleHTML = (result, mode) => {
    const sd = result.studentData || {};
    const periods = Utils.getPeriods();
    const tooltipText = periods.map(p => {
        const grade = sd.periods[p]?.grade;
        return typeof grade === 'number' ? `${Utils.getPeriodLabel(p)} : ${String(grade).replace('.', ',')}` : null;
    }).filter(Boolean).join(' | ');

    const icons = { details: '<i class="fas fa-chart-line"></i>', refine: '✨' };
    const titles = { details: 'Analyse', refine: 'Raffinement' };
    const periodLabel = Utils.getPeriodLabel(sd.currentPeriod, true);
    const statusesHTML = sd.statuses && sd.statuses.length > 0 ? sd.statuses.map(s => `<span class="statut-chip statut-in-title">${s.split(' ')[0]}</span>`).join('') : '';

    return `<span class="modal-title-icon">${icons[mode]}</span>
            <div class="modal-title-text">
               ${titles[mode]} : <span class="student-name-in-title">${result.prenom} ${result.nom}</span>
            </div>
            <div class="modal-title-details">
                ${statusesHTML}
                <span class="detail-chip tooltip" data-tooltip="${tooltipText}">${periodLabel}</span>
            </div>`;
};

/** @type {import('./AppManager.js').App|null} */
let App = null;

/**
 * Module de gestion du raffinement d'appréciations.
 * @namespace RefinementManager
 */
export const RefinementManager = {
    /**
     * Initialise le module avec une référence à l'application principale.
     * @param {Object} appInstance - Instance de l'application principale
     */
    init(appInstance) {
        App = appInstance;
    },

    /**
     * Génère une appréciation raffinée selon le type demandé.
     * @param {'polish'|'variations'|'context'|'detailed'|'concise'|'encouraging'|'formal'} type - Type de raffinement
     * @param {HTMLElement} button - Bouton qui a déclenché l'action
     */
    async generateRefinedAppreciation(type, button) {
        const targetStudentId = appState.currentRefiningAppreciationId; // Capture ID at start
        const result = appState.generatedResults.find(r => r.id === targetStudentId);
        if (!result || !UI.checkAPIKeyPresence()) return;

        if (button.closest('.options-group, .refinement-section')?.querySelector('.loading-spinner')) return;

        // Store pending generation info for UX tracking
        appState.pendingRefinementGeneration = {
            studentId: targetStudentId,
            studentName: `${result.prenom} ${result.nom}`,
            type: type,
            buttonRef: button
        };

        UI.resetCopyButtonState(DOM.refinementModal.querySelector('[data-action="copy-suggested"]'));

        UI.showInlineSpinner(button);

        // Show elegant loading feedback in right zone
        DOM.suggestedAppreciationText.innerHTML = '<span class="loading-text">✨ Génération en cours...</span>';
        DOM.suggestedAppreciationText.classList.add('placeholder', 'is-loading');

        const context = type === 'context' ? DOM.refinementContext.value.trim() : null;
        if (type === 'context' && !context) {
            UI.showNotification("Entrez un contexte.", "warning");
            UI.hideInlineSpinner(button);
            DOM.suggestedAppreciationText.textContent = 'Action requise.';
            DOM.suggestedAppreciationText.classList.remove('is-loading');
            DOM.suggestedAppreciationText.classList.add('placeholder');
            appState.pendingRefinementGeneration = null;
            return;
        }

        const prompt = PromptService.getRefinementPrompt(type, DOM.originalAppreciationText.textContent.trim(), context);

        try {
            const resp = await AIService.callAIWithFallback(prompt);
            let text = resp.text.trim();
            if ((text.startsWith('"') && text.endsWith('"'))) {
                text = text.slice(1, -1);
            }

            // Check if user navigated away during generation
            if (appState.currentRefiningAppreciationId !== targetStudentId) {
                // User is on a different student - store result and show notification
                const pendingInfo = appState.pendingRefinementGeneration;
                if (pendingInfo && pendingInfo.studentId === targetStudentId) {
                    // Store the generated result for later viewing
                    pendingInfo.generatedText = text;

                    // Show actionable notification
                    UI.showActionableNotification(
                        `<strong>${pendingInfo.studentName}</strong> : génération terminée. <u>Cliquer pour voir</u>`,
                        'success',
                        () => {
                            // Navigate back to that student
                            this.refineAppreciation(targetStudentId, false);
                            // Apply the generated text
                            setTimeout(() => {
                                if (pendingInfo.generatedText) {
                                    DOM.suggestedAppreciationText.classList.remove('placeholder', 'is-loading');
                                    DOM.suggestedAppreciationText.textContent = Utils.decodeHtmlEntities(pendingInfo.generatedText);
                                    UI.updateWordCount('suggestedWordCount', pendingInfo.generatedText);
                                }
                            }, 100);
                        },
                        6000 // Longer duration for actionable notifications
                    );
                }
                appState.pendingRefinementGeneration = null;
                return; // Don't touch current UI - it's for a different student now
            }

            DOM.suggestedAppreciationText.classList.remove('placeholder', 'is-loading');
            await UI.animateTextTyping(DOM.suggestedAppreciationText, Utils.decodeHtmlEntities(text));
            UI.updateWordCount('suggestedWordCount', text);
        } catch (e) {
            console.error("Erreur lors du raffinement:", e);
            // Only show error if still on same student
            if (appState.currentRefiningAppreciationId === targetStudentId) {
                UI.showNotification(`Erreur : ${Utils.translateErrorMessage(e.message)}`, 'error');
                DOM.suggestedAppreciationText.textContent = 'Erreur lors de la génération.';
                DOM.suggestedAppreciationText.classList.remove('is-loading');
                DOM.suggestedAppreciationText.classList.add('placeholder');
            } else {
                // User navigated away - show error notification with student name
                const pendingInfo = appState.pendingRefinementGeneration;
                if (pendingInfo) {
                    UI.showNotification(`Erreur pour ${pendingInfo.studentName} : ${Utils.translateErrorMessage(e.message)}`, 'error');
                }
            }
        } finally {
            // Only hide spinner if still on same student
            if (appState.currentRefiningAppreciationId === targetStudentId) {
                UI.hideInlineSpinner(button);
                DOM.suggestedAppreciationText.classList.remove('is-loading');
            }
            appState.pendingRefinementGeneration = null;
        }
    },

    /**
     * Applique l'appréciation de la zone gauche (source de vérité).
     */
    applyRefinedAppreciation() {
        const id = appState.currentRefiningAppreciationId;
        const resultIndex = appState.generatedResults.findIndex(r => r.id === id);

        if (resultIndex > -1) {
            const result = appState.generatedResults[resultIndex];

            // Always use left zone text (single source of truth)
            const newAppreciation = DOM.originalAppreciationText.textContent.trim();

            // Update both result.appreciation and periodData.appreciation for consistency
            result.appreciation = newAppreciation;
            const activePeriod = appState.currentPeriod;
            if (result.studentData.periods[activePeriod]) {
                result.studentData.periods[activePeriod].appreciation = newAppreciation;
            }

            result.copied = false;
            delete appState.refinementEdits[id];

            UI.closeModal(DOM.refinementModal);
            UI.showNotification('Mise à jour réussie !', 'success');

            UI.updateResultCard(id, { animate: true });
            StorageManager.saveAppState();
        } else {
            UI.showNotification('Erreur : appréciation introuvable.', 'error');
        }
    },

    /**
     * Accepte la suggestion proposée avec une animation fluide de transfert.
     */
    acceptRefinedSuggestion() {
        const suggestedText = DOM.suggestedAppreciationText.textContent.trim();

        if (suggestedText && !DOM.suggestedAppreciationText.classList.contains('placeholder')) {

            // 1. Setup Animation Elements
            const src = DOM.suggestedAppreciationText;
            const dest = DOM.originalAppreciationText;
            const rectSrc = src.getBoundingClientRect();
            const rectDest = dest.getBoundingClientRect();

            // Clone styling
            const computedStyle = window.getComputedStyle(src);
            const clone = document.createElement('div');
            clone.textContent = suggestedText;
            clone.style.position = 'fixed';
            clone.style.top = rectSrc.top + 'px';
            clone.style.left = rectSrc.left + 'px';
            clone.style.width = rectSrc.width + 'px';
            clone.style.height = rectSrc.height + 'px';
            clone.style.background = 'rgba(var(--surface-color-rgb), 0.65)';
            clone.style.backdropFilter = 'blur(6px)';
            clone.style.webkitBackdropFilter = 'blur(6px)';
            clone.style.color = computedStyle.color;
            clone.style.fontFamily = computedStyle.fontFamily;
            clone.style.fontSize = computedStyle.fontSize;
            clone.style.lineHeight = computedStyle.lineHeight;
            clone.style.padding = computedStyle.padding;
            clone.style.borderRadius = computedStyle.borderRadius;
            clone.style.boxShadow = '0 10px 25px rgba(0,0,0,0.15)';
            clone.style.zIndex = '9999';
            clone.style.transition = 'all 0.5s cubic-bezier(0.2, 0, 0.2, 1)';
            clone.style.transformOrigin = 'top left';
            clone.style.pointerEvents = 'none';
            clone.style.overflow = 'hidden';

            document.body.appendChild(clone);

            // Hide source slightly
            src.style.opacity = '0';

            // 2. Trigger Animation
            requestAnimationFrame(() => {
                const dx = rectDest.left - rectSrc.left;
                const dy = rectDest.top - rectSrc.top;

                // Animate position AND dimensions to match destination
                clone.style.transform = `translate(${dx}px, ${dy}px)`;
                clone.style.width = rectDest.width + 'px';
                clone.style.height = rectDest.height + 'px';

                // Visual cue on destination
                dest.style.opacity = '0.5';
            });

            // 3. Cleanup & Finalize
            setTimeout(() => {
                // Apply Text
                DOM.originalAppreciationText.textContent = suggestedText;

                // Reset States
                DOM.suggestedAppreciationText.textContent = 'Cliquez sur un bouton d\'amélioration pour générer un aperçu.';
                DOM.suggestedAppreciationText.classList.add('placeholder');
                src.style.opacity = '';
                dest.style.opacity = '';

                // Cleanup Clone
                clone.remove();

                // Logic Updates
                if (App && App.saveRefinementEdit) App.saveRefinementEdit();
                UI.updateWordCount('originalWordCount', suggestedText);
                UI.updateWordCount('suggestedWordCount', '');
                this.updateValidateButtonState();

                // Success Feedback on the container ("refinement-box-container" or parent wrapper?)
                // dest is .refinement-box.editable. 
                // Let's add the pulse to dest itself.
                dest.classList.remove('anim-success-pulse');
                void dest.offsetWidth;
                dest.classList.add('anim-success-pulse');

                UI.showNotification("Suggestion appliquée !", "info");
                DOM.originalAppreciationText.focus();

            }, 500);

        } else {
            UI.showNotification("Aucune suggestion valide à accepter.", "warning");
        }
    },

    /**
     * Met à jour l'état du bouton Valider selon si le texte gauche a changé.
     */
    updateValidateButtonState() {
        if (!DOM.applyRefinedAppreciationBtn) return;

        const id = appState.currentRefiningAppreciationId;
        const result = appState.generatedResults.find(r => r.id === id);
        if (!result) return;

        const currentText = DOM.originalAppreciationText.textContent.trim();
        const originalText = result.appreciation || '';
        const hasChanged = currentText !== originalText;

        if (hasChanged) {
            DOM.applyRefinedAppreciationBtn.innerHTML = '<i class="fas fa-check"></i> Valider';
            DOM.applyRefinedAppreciationBtn.classList.add('btn-success');
            DOM.applyRefinedAppreciationBtn.classList.remove('btn-primary');
            DOM.applyRefinedAppreciationBtn.disabled = false;
        } else {
            DOM.applyRefinedAppreciationBtn.innerHTML = '<i class="fas fa-check"></i> Valider';
            DOM.applyRefinedAppreciationBtn.classList.remove('btn-success');
            DOM.applyRefinedAppreciationBtn.classList.add('btn-primary');
            DOM.applyRefinedAppreciationBtn.disabled = true;
        }
    },

    /**
     * Ouvre la modale de raffinement pour un élève donné.
     * @param {string} id - Identifiant de l'appréciation à raffiner
     * @param {boolean} [fromNav=false] - Si true, la modale est déjà ouverte (navigation)
     */
    refineAppreciation(id, fromNav = false) {
        const result = appState.generatedResults.find(r => r.id === id);
        if (!result) {
            console.error("Élève introuvable:", id);
            UI.closeModal(DOM.refinementModal);
            return;
        }

        // Set currentId on modal content for navigation to work
        const content = DOM.refinementModal.querySelector('.modal-content');
        content.dataset.currentId = id;

        appState.currentRefiningAppreciationId = id;
        appState.modalNav.currentIndex = appState.filteredResults.findIndex(r => r.id === id);

        DOM.refinementModalTitle.innerHTML = _createModalTitleHTML(result, 'refine');

        const activePeriod = appState.currentPeriod;
        const periodData = result.studentData.periods[activePeriod] || {};

        // Use result.appreciation (current version) instead of periodData.appreciation (original)
        // This ensures we always work with the latest validated version
        const currentAppreciation = result.appreciation;

        // Store original for reset functionality (only once)
        if (!result.originalAppreciation && periodData.appreciation) {
            result.originalAppreciation = periodData.appreciation;
        }

        if (!currentAppreciation) {
            UI.showNotification("Erreur : impossible de trouver le texte de l'appréciation.", "error");
            UI.closeModal(DOM.refinementModal);
            return;
        }

        const edited = appState.refinementEdits[id];
        DOM.originalAppreciationText.textContent = edited ? edited.originalText : currentAppreciation;

        DOM.refinementContext.value = edited ? edited.context : '';
        DOM.refinementContext.style.height = 'auto';
        DOM.refinementContext.style.height = (DOM.refinementContext.scrollHeight) + 'px';

        DOM.suggestedAppreciationText.textContent = 'Cliquez sur un bouton d\'amélioration pour générer un aperçu.';
        DOM.suggestedAppreciationText.classList.add('placeholder');
        DOM.suggestedAppreciationText.classList.remove('is-loading');

        // Reset any active spinners on refinement buttons
        DOM.refinementModal.querySelectorAll('.options-group button').forEach(btn => {
            if (btn.dataset.originalContent) {
                btn.innerHTML = btn.dataset.originalContent;
                btn.disabled = false;
                delete btn.dataset.originalContent;
            }
        });

        // Initialize validate button in disabled state (gray)
        if (DOM.applyRefinedAppreciationBtn) {
            DOM.applyRefinedAppreciationBtn.innerHTML = '<i class="fas fa-check"></i> Valider';
            DOM.applyRefinedAppreciationBtn.classList.remove('btn-success');
            DOM.applyRefinedAppreciationBtn.classList.add('btn-primary');
            DOM.applyRefinedAppreciationBtn.disabled = true;
        }

        const isOriginalAIGeneration = (activePeriod === result.studentData.currentPeriod);
        const regenBtn = `<button class="btn btn-warning btn-small" data-action="regenerate" data-id="${id}">Régénérer l'original</button>`;
        DOM.refinementErrorActions.innerHTML = result.errorMessage && isOriginalAIGeneration ? regenBtn : '';
        DOM.refinementErrorActions.style.display = result.errorMessage && isOriginalAIGeneration ? 'flex' : 'none';

        UI.updateWordCount('originalWordCount', DOM.originalAppreciationText.textContent);
        UI.updateWordCount('suggestedWordCount', '');

        DOM.prevRefinementStudentBtn.disabled = appState.modalNav.currentIndex <= 0;
        DOM.nextRefinementStudentBtn.disabled = appState.modalNav.currentIndex >= appState.filteredResults.length - 1;

        if (!fromNav) {
            UI.openModal(DOM.refinementModal);
        }

        UI.initTooltips();
    }
};
