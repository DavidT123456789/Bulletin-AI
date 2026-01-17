/**
 * @fileoverview Gestionnaire du formulaire d'élève individuel.
 * 
 * Ce module gère les fonctionnalités du formulaire individuel :
 * - Validation du formulaire
 * - Génération et mise à jour d'appréciations individuelles
 * - Chargement d'élèves dans le formulaire
 * - Réinitialisation du formulaire
 * 
 * @module managers/SingleStudentManager
 */

import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';
import { StudentDataManager } from './StudentDataManager.js';

/** @type {import('./AppManager.js').App|null} */
let App = null;

/** @type {import('./AppreciationsManager.js').AppreciationsManager|null} */
let AppreciationsManager = null;

/**
 * Module de gestion du formulaire individuel.
 * @namespace SingleStudentManager
 */
export const SingleStudentManager = {
    /**
     * Initialise le module avec les références nécessaires.
     * @param {Object} appInstance - Instance de l'application principale
     * @param {Object} appreciationsManager - Référence à AppreciationsManager
     */
    init(appInstance, appreciationsManager = null) {
        App = appInstance;
        AppreciationsManager = appreciationsManager;
    },

    /**
     * Valide le formulaire d'élève individuel.
     * @returns {boolean} True si le formulaire est valide
     */
    validateForm() {
        // Sidebar form may have been removed (Liste + Focus UX) - early return if inputs don't exist
        if (!DOM.nomInput || !DOM.prenomInput) {
            return true; // No form to validate, allow pass-through
        }

        document.querySelectorAll('.error-message').forEach(el => el.style.display = 'none');
        let isValid = Utils.validateInput(DOM.nomInput) && Utils.validateInput(DOM.prenomInput);
        Utils.getPeriods().forEach(p => {
            const input = document.getElementById(`moy${p}`);
            if (input) isValid = Utils.validateGrade(input) && isValid;
        });

        const currentGradeInput = document.getElementById(`moy${appState.currentPeriod}`);
        if (currentGradeInput && currentGradeInput.value.trim() === '') {
            const errEl = document.getElementById(currentGradeInput.id + 'Error');
            if (errEl) {
                errEl.textContent = '⚠️ La note de la période actuelle est requise.';
                errEl.style.display = 'block';
            }
            currentGradeInput.classList.add('input-error');
            isValid = false;
        }
        return isValid;
    },

    /**
     * Récupère les données du formulaire.
     * @returns {Object} Données de l'élève
     */
    getFormData() {
        const statuses = Array.from(document.querySelectorAll('input[name="statuses"]:checked')).map(cb => cb.value);
        const currentPeriod = appState.currentPeriod;
        // Null checks for sidebar form elements (may have been removed - Liste + Focus UX)
        const contextValue = DOM.negativeInstructions?.value?.trim() || '';

        const data = {
            nom: DOM.nomInput?.value?.trim()?.toUpperCase() || '',
            prenom: DOM.prenomInput?.value?.trim() || '',
            statuses: statuses,
            // DEPRECATED: garder pour rétrocompatibilité mais utiliser periods.context
            negativeInstructions: contextValue,
            periods: {},
            currentPeriod: currentPeriod
        };

        Utils.getPeriods().forEach(p => {
            const isCurrent = (p === currentPeriod);

            // Option G: Utiliser currentPeriodGrade pour la période courante
            let gradeInput;
            if (isCurrent && DOM.currentPeriodGrade) {
                gradeInput = DOM.currentPeriodGrade;
            } else {
                gradeInput = document.getElementById(`moy${p}`);
            }

            const aInput = document.getElementById(`app${p}`);
            const gStr = gradeInput?.value.trim().replace(',', '.') || '';

            data.periods[p] = {
                grade: gStr === '' ? null : parseFloat(gStr),
                appreciation: aInput?.value.trim() ?? '',
                // NOUVEAU: Contexte par période (sauvé dans la période courante)
                context: isCurrent ? contextValue : undefined
            };
        });
        return data;
    },

    /**
     * Génère une appréciation pour un nouvel élève.
     */
    async generateAppreciation() {
        if (!this.validateForm()) {
            UI.showNotification('Corrigez les erreurs dans le formulaire.', 'error');
            return;
        }

        const loadingBtn = DOM.generateAndNextBtn;
        UI.showInlineSpinner(loadingBtn);

        const data = this.getFormData();

        const studentKey = Utils.normalizeName(data.nom, data.prenom);
        const existingStudentIndex = appState.generatedResults.findIndex(r => Utils.normalizeName(r.nom, r.prenom) === studentKey);

        // Détection automatique "Nouveau" si pas de données antérieures
        if (existingStudentIndex === -1 && data.statuses.length === 0) {
            const periods = Utils.getPeriods();
            const currentPeriodIndex = periods.indexOf(appState.currentPeriod);
            if (currentPeriodIndex > 0) {
                const hasPreviousData = periods.slice(0, currentPeriodIndex).some(p => {
                    const periodData = data.periods[p];
                    return periodData && (typeof periodData.grade === 'number' || (periodData.appreciation && periodData.appreciation.trim() !== ''));
                });
                if (!hasPreviousData) {
                    data.statuses.push(`Nouveau ${appState.currentPeriod}`);
                }
            }
        }

        try {
            const newResult = await AppreciationsManager.generateAppreciation(data, false, null, null, 'single-student');

            if (existingStudentIndex > -1) {
                const existingResult = appState.generatedResults[existingStudentIndex];
                Object.assign(existingResult.studentData.periods, newResult.studentData.periods);

                existingResult.appreciation = newResult.appreciation;
                existingResult.studentData.currentPeriod = newResult.studentData.currentPeriod;
                existingResult.studentData.subject = newResult.studentData.subject;
                existingResult.studentData.negativeInstructions = newResult.studentData.negativeInstructions;
                existingResult.studentData.statuses = newResult.studentData.statuses;
                existingResult.timestamp = newResult.timestamp;
                existingResult.errorMessage = newResult.errorMessage;
                existingResult.evolutions = newResult.evolutions;
                existingResult.tokenUsage = newResult.tokenUsage;
                existingResult.studentData.prompts = newResult.studentData.prompts;
                // Transfer all generation metadata for dirty detection
                StudentDataManager.transferGenerationMetadata(existingResult, newResult);
                newResult.id = existingResult.id;
            } else {
                appState.generatedResults.unshift(newResult);
            }

            UI.showNotification('Appréciation générée !', 'success');
            AppreciationsManager.renderResults(newResult.id, 'new');
            this.resetForm(true);

        } catch (error) {
            console.error('Erreur :', error);
            const msg = Utils.translateErrorMessage(error.message);
            UI.showNotification(`Erreur : ${msg}`, 'error');
        } finally {
            UI.hideInlineSpinner(loadingBtn);
            UI.hideHeaderProgress();
        }
    },

    /**
     * Met à jour l'appréciation d'un élève existant.
     */
    async updateAppreciation() {
        if (!this.validateForm() || !appState.currentEditingId) {
            UI.showNotification('Formulaire invalide ou aucun élève en cours d\'édition.', 'error');
            return;
        }

        const loadingBtn = DOM.generateAppreciationBtn;
        UI.showInlineSpinner(loadingBtn);

        const data = this.getFormData();

        data.subject = appState.useSubjectPersonalization ? appState.currentSubject : 'Générique';

        try {
            const newResult = await AppreciationsManager.generateAppreciation(data, false, null, null, 'single-student');
            const studentIndex = appState.generatedResults.findIndex(r => r.id === appState.currentEditingId);

            if (studentIndex > -1) {
                const existingResult = appState.generatedResults[studentIndex];

                for (const periodKey in newResult.studentData.periods) {
                    if (Object.prototype.hasOwnProperty.call(newResult.studentData.periods, periodKey)) {
                        if (!existingResult.studentData.periods[periodKey]) {
                            existingResult.studentData.periods[periodKey] = {};
                        }
                        Object.assign(existingResult.studentData.periods[periodKey], newResult.studentData.periods[periodKey]);
                    }
                }

                existingResult.appreciation = newResult.appreciation;
                existingResult.studentData.currentPeriod = newResult.studentData.currentPeriod;
                existingResult.studentData.subject = newResult.studentData.subject;
                existingResult.studentData.negativeInstructions = newResult.studentData.negativeInstructions;
                existingResult.studentData.statuses = newResult.studentData.statuses;
                existingResult.timestamp = newResult.timestamp;
                existingResult.errorMessage = newResult.errorMessage;
                existingResult.evolutions = newResult.evolutions;
                existingResult.tokenUsage = newResult.tokenUsage;
                existingResult.studentData.prompts = newResult.studentData.prompts;
                // Transfer all generation metadata for dirty detection
                StudentDataManager.transferGenerationMetadata(existingResult, newResult);

                newResult.id = appState.currentEditingId;

                UI.showNotification('Appréciation mise à jour !', 'success');
                const { ListViewManager } = await import('./ListViewManager.js');
                await ListViewManager.updateRow(newResult.id, newResult, true);
            }
        } catch (error) {
            console.error('Erreur de mise à jour:', error);
            const msg = Utils.translateErrorMessage(error.message);
            UI.showNotification(`Erreur : ${msg}`, 'error');
        } finally {
            UI.hideInlineSpinner(loadingBtn);
            UI.hideHeaderProgress();
        }
    },

    /**
     * Passe en mode création (annule l'édition).
     */
    switchToCreationMode() {
        if (appState.currentEditingId) {
            const card = document.querySelector(`.appreciation-result[data-id="${appState.currentEditingId}"]`);
            if (card) card.classList.remove('is-editing');
        }

        appState.currentEditingId = null;
        if (DOM.loadStudentSelect) DOM.loadStudentSelect.value = "";

        UI.switchToCreationModeUI();
    },

    /**
     * Réinitialise le formulaire.
     * @param {boolean} [forNext=false] - Si true, met le focus sur le champ nom
     */
    resetForm(forNext = false) {
        // Sidebar form may have been removed (Liste + Focus UX) - add null checks
        if (DOM.actualSingleStudentForm) {
            DOM.actualSingleStudentForm.reset();
        }

        if (DOM.nomInput) DOM.nomInput.value = '';
        if (DOM.prenomInput) DOM.prenomInput.value = '';
        if (DOM.negativeInstructions) DOM.negativeInstructions.value = '';

        // Option G: Clear current period grade field
        if (DOM.currentPeriodGrade) {
            DOM.currentPeriodGrade.value = '';
        }

        Utils.getPeriods().forEach(p => {
            const gInput = document.getElementById(`moy${p}`);
            const aInput = document.getElementById(`app${p}`);
            if (gInput) gInput.value = '';
            if (aInput) aInput.value = '';
        });
        document.querySelectorAll('input[name="statuses"]').forEach(checkbox => checkbox.checked = false);

        document.querySelectorAll('.error-message,.input-error').forEach(el => {
            if (el.style) el.style.display = 'none';
            el.classList.remove('input-error');
        });

        this.switchToCreationMode();

        if (forNext && DOM.nomInput) {
            DOM.nomInput.focus();
        }
    },

    /**
     * Charge un élève dans le formulaire pour édition.
     * @param {string} id - Identifiant de l'élève
     */
    loadIntoForm(id) {
        if (!id) {
            this.resetForm(false);
            return;
        }

        const result = appState.generatedResults.find(r => r.id === id);
        if (!result) return;

        appState.currentEditingId = id;

        document.querySelectorAll('.appreciation-result.is-editing').forEach(c => c.classList.remove('is-editing'));
        let card = document.querySelector(`.appreciation-result[data-id="${id}"]`);

        // Si la carte n'est pas visible (filtrée), réinitialiser les filtres
        if (!card) {
            // Réinitialiser recherche et filtres
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';

            // Réinitialiser les filtres actifs
            if (appState.activeStatFilter) {
                appState.activeStatFilter = null;
                document.querySelectorAll('.stat-card.active-filter, .legend-item.active-filter, .detail-item.active-filter')
                    .forEach(el => el.classList.remove('active-filter'));
            }

            // Re-render pour afficher tous les résultats
            const Am = window.AppreciationsManager;
            if (Am) Am.renderResults();

            // Retry trouver la carte après re-render
            card = document.querySelector(`.appreciation-result[data-id="${id}"]`);
        }

        if (card) {
            card.classList.add('is-editing');
            // Délai pour s'assurer que le DOM est prêt après le re-render
            setTimeout(() => {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }



        // Null checks for sidebar form elements (may have been removed - Liste + Focus UX)
        if (DOM.nomInput) DOM.nomInput.value = result.nom;
        if (DOM.prenomInput) DOM.prenomInput.value = result.prenom;
        const statuses = result.studentData.statuses || [];
        document.querySelectorAll('input[name="statuses"]').forEach(checkbox => {
            checkbox.checked = statuses.includes(checkbox.value);
        });
        // NOUVEAU: Charger le contexte de la période courante (fallback sur negativeInstructions pour rétrocompatibilité)
        const periodContext = result.studentData.periods?.[appState.currentPeriod]?.context;
        if (DOM.negativeInstructions) DOM.negativeInstructions.value = periodContext ?? result.studentData.negativeInstructions ?? '';

        Utils.getPeriods().forEach(p => {
            const d = result.studentData.periods[p];
            const isCurrent = (p === appState.currentPeriod);

            // Option G: Populate currentPeriodGrade for current period
            if (isCurrent && DOM.currentPeriodGrade) {
                DOM.currentPeriodGrade.value = typeof d?.grade === 'number' ? String(d.grade).replace('.', ',') : '';
            }

            // Also populate accordion fields
            const gInput = document.getElementById(`moy${p}`);
            const aInput = document.getElementById(`app${p}`);
            if (gInput) gInput.value = typeof d?.grade === 'number' ? String(d.grade).replace('.', ',') : '';
            if (aInput) aInput.value = d?.appreciation ?? '';
        });

        UI.switchToEditModeUI();

        UI.showNotification(`Modification de ${result.prenom} ${result.nom}.`, 'info');

        if (DOM.loadStudentSelect) {
            DOM.loadStudentSelect.value = id;
        }
    },

    /**
     * Édite une appréciation existante.
     * @param {string} id - Identifiant de l'élève
     */
    edit(id) {
        this.loadIntoForm(id);
        setTimeout(() => DOM.nomInput?.focus(), 450);
    },

    /**
     * Supprime une appréciation.
     * @param {string} id - Identifiant de l'élève
     */
    delete(id) {
        UI.showCustomConfirm('Supprimer cette appréciation ?', () => {
            const visibleIds = new Set(appState.filteredResults.map(r => r.id));

            if (id === appState.currentEditingId) { this.resetForm(false); }

            appState.generatedResults = appState.generatedResults.filter(r => r.id !== id);

            if (visibleIds.has(id)) {
                const deletedCard = document.querySelector(`.appreciation-result[data-id="${id}"]`);
                if (deletedCard) {
                    deletedCard.classList.add('fade-out');
                    setTimeout(() => {
                        deletedCard.remove();
                        UI.updateStats();
                    }, 300);
                } else {
                    AppreciationsManager.renderResults();
                }
            }

            StorageManager.saveAppState();
            UI.showNotification('Supprimée.', 'success');
        }, null, { compact: true });
    }
};
