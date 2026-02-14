/**
 * @fileoverview Gestionnaire de l'interface d'importation de masse.
 * 
 * Ce module gère les fonctionnalités liées à l'importation de données (CSV/Excel),
 * y compris la prévisualisation, le mapping des colonnes et l'état de traitement.
 * 
 * @module managers/ImportUIManager
 */

import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { ModalUI } from './ModalUIManager.js';

/** @type {import('./UIManager.js').UI} */
let UI;
/** @type {import('./AppManager.js').App} */
let App;

/**
 * Module de gestion de l'UI d'importation.
 * @namespace ImportUI
 */
export const ImportUI = {
    /**
     * Initialise le module avec les références nécessaires.
     * @param {Object} uiInstance - Instance du UIManager
     * @param {Object} appInstance - Instance de l'AppManager
     */
    init(uiInstance, appInstance) {
        UI = uiInstance;
        App = appInstance;
    },

    /**
     * Retourne les options de mapping disponibles pour les colonnes.
     * @returns {Array<{v: string, t: string}>} Liste des options
     */
    _getMappingOptions() {
        return [
            { v: 'IGNORE', t: 'Ignorer' },
            { v: 'NOM_PRENOM', t: 'Nom & Prénom' },
            { v: 'STATUT', t: 'Statut' },
            { v: 'INSTRUCTIONS', t: 'Contexte (global)' },
            ...Utils.getPeriods().flatMap(p => [
                { v: `MOY_${p}`, t: `Moy. ${p}` },
                { v: `DEV_${p}`, t: `Nb éval. ${p}` },
                { v: `APP_${p}`, t: `Appr. ${p}` },
                { v: `CTX_${p}`, t: `Contexte ${p}` }
            ])
        ];
    },

    /**
     * Tente de deviner le mapping initial des colonnes basé sur les en-têtes ou le contenu.
     * @param {NodeListOf<HTMLSelectElement>} selects - Liste des sélecteurs de colonnes
     * @param {string[]} firstLineData - Données de la première ligne
     * @param {Array<{v: string, t: string}>} availableOptions - Options disponibles
     */
    _guessInitialMapping(selects, firstLineData, availableOptions) {
        const userSavedFormatString = appState.massImportFormats[appState.periodSystem]?.[appState.currentPeriod];
        if (userSavedFormatString) {
            const savedFormat = userSavedFormatString.split(' | ').map(tag => tag.trim().replace(/[{}]/g, ''));
            selects.forEach((select, i) => {
                const savedTag = savedFormat[i];
                if (savedTag && availableOptions.some(o => o.v === savedTag)) {
                    select.value = savedTag;
                } else {
                    select.value = 'IGNORE';
                }
            });
            return;
        }

        const isHeaderLike = firstLineData.some(cell => /[a-zA-Z]{3,}/.test(cell)) && !firstLineData.some(cell => Utils.isNumeric(cell));
        if (isHeaderLike) {
            const headerKeywordMap = {
                'NOM_PRENOM': ['nom', 'prénom', 'eleve', 'élève'],
                'STATUT': ['statut'],
                'INSTRUCTIONS': ['instructions', 'contexte', 'remarque'],
            };
            const periodKeywordMap = {
                'MOY_': ['moy', 'note', 'moyenne'],
                'DEV_': ['dev', 'nb', 'eval', 'devoir', 'devoirs'],
                'APP_': ['app', 'appréciation', 'commentaire'],
                'CTX_': ['contexte', 'ctx', 'observation', 'remarque']
            };
            const guesses = Array(selects.length).fill('IGNORE');
            const assigned = new Set();

            firstLineData.forEach((header, index) => {
                const h = header.toLowerCase().replace(/[éèêë]/g, 'e');
                for (const [tag, keywords] of Object.entries(headerKeywordMap)) {
                    if (keywords.some(kw => h.includes(kw)) && !assigned.has(tag)) {
                        guesses[index] = tag;
                        assigned.add(tag);
                        return;
                    }
                }
                for (const [tagPrefix, keywords] of Object.entries(periodKeywordMap)) {
                    const periodMatch = h.match(/(t|s)\s?(\d)/);
                    if (periodMatch && keywords.some(kw => h.includes(kw))) {
                        const tag = tagPrefix + periodMatch[1].toUpperCase() + periodMatch[2];
                        if (!assigned.has(tag) && availableOptions.some(o => o.v === tag)) {
                            guesses[index] = tag;
                            assigned.add(tag);
                            return;
                        }
                    }
                }
            });

            if (guesses.includes('NOM_PRENOM')) {
                selects.forEach((select, i) => select.value = guesses[i]);
                return;
            }
        }

        const guesses = Array(selects.length).fill('IGNORE');
        const assignedIndices = new Set();

        const isLikelyGrade = (d) => Utils.isNumeric(d);
        const isLongText = (d) => typeof d === 'string' && d.length > 5;
        const isShortTextOrEmpty = (d) => typeof d === 'string' && d.length <= 10 && !isLikelyGrade(d);

        const nomIndex = firstLineData.findIndex(d => typeof d === 'string' && d.split(' ').length >= 2 && /[a-zA-Z]/.test(d));
        if (nomIndex !== -1) {
            guesses[nomIndex] = 'NOM_PRENOM';
            assignedIndices.add(nomIndex);
        }

        let instrIndex = -1;
        for (let i = guesses.length - 1; i >= 0; i--) {
            if (!assignedIndices.has(i) && typeof firstLineData[i] === 'string' && firstLineData[i].trim() !== '' && !isLikelyGrade(firstLineData[i])) {
                instrIndex = i;
                guesses[i] = 'INSTRUCTIONS';
                assignedIndices.add(i);
                break;
            }
        }

        const nomColIndex = guesses.indexOf('NOM_PRENOM');
        if (nomColIndex !== -1) {
            for (let i = nomColIndex + 1; i < guesses.length; i++) {
                if (!assignedIndices.has(i) && isShortTextOrEmpty(firstLineData[i])) {
                    guesses[i] = 'STATUT';
                    assignedIndices.add(i);
                    break;
                }
            }
        }

        const availablePeriods = Utils.getPeriods().filter(p => availableOptions.some(o => o.v === `MOY_${p}`));
        let periodIdx = 0;

        // Helper: detect small integer (1-20) that could be evaluation count
        const isSmallInt = (d) => {
            const num = parseInt(d, 10);
            return !isNaN(num) && num >= 1 && num <= 20 && String(num) === String(d).trim();
        };

        for (let i = 0; i < guesses.length; i++) {
            if (assignedIndices.has(i)) continue;

            const currentPeriod = availablePeriods[periodIdx];
            if (!currentPeriod) break;

            const devTag = `DEV_${currentPeriod}`;
            const moyTag = `MOY_${currentPeriod}`;
            const appTag = `APP_${currentPeriod}`;

            const currentData = firstLineData[i];
            const nextData = firstLineData[i + 1];

            // Pattern: small int (count) followed by a grade → detect as DEV + MOY pair
            if (isSmallInt(currentData) && nextData && isLikelyGrade(nextData)) {
                guesses[i] = devTag;
                assignedIndices.add(i);
                guesses[i + 1] = moyTag;
                assignedIndices.add(i + 1);

                // Look for appreciation after the grade
                let nextUnassignedIndex = -1;
                for (let j = i + 2; j < guesses.length; j++) {
                    if (!assignedIndices.has(j)) {
                        nextUnassignedIndex = j;
                        break;
                    }
                }
                if (nextUnassignedIndex !== -1 && isLongText(firstLineData[nextUnassignedIndex])) {
                    guesses[nextUnassignedIndex] = appTag;
                    assignedIndices.add(nextUnassignedIndex);
                }
                periodIdx++;
                i++; // Skip the grade we just assigned
                continue;
            }

            // Fallback: just a grade without preceding count
            if (isLikelyGrade(currentData)) {
                guesses[i] = moyTag;
                assignedIndices.add(i);

                let nextUnassignedIndex = -1;
                for (let j = i + 1; j < guesses.length; j++) {
                    if (!assignedIndices.has(j)) {
                        nextUnassignedIndex = j;
                        break;
                    }
                }

                if (nextUnassignedIndex !== -1 && isLongText(firstLineData[nextUnassignedIndex])) {
                    guesses[nextUnassignedIndex] = appTag;
                    assignedIndices.add(nextUnassignedIndex);
                }
                periodIdx++;
            }
        }

        selects.forEach((select, i) => select.value = guesses[i]);
    },

    /**
     * Met à jour la prévisualisation des données brutes collées pour l'import.
     * Version wizard avec nouveau design premium.
     */
    updateMassImportPreview() {
        // Guard: DOM element may not exist if import wizard is not open
        if (!DOM.massData) return;

        const text = DOM.massData.value;
        const hasText = text.trim() !== '';

        // Manage action buttons visibility
        const actionsContainer = document.getElementById('massImportActions');
        if (actionsContainer) {
            actionsContainer.style.display = hasText ? 'flex' : 'none';
        }

        // Manage import button state
        if (DOM.importGenerateBtn) {
            DOM.importGenerateBtn.disabled = !hasText;
        }

        if (!hasText) {
            DOM.massImportPreview.style.display = 'none';
            this.setWizardStep(1);
            return;
        }

        const lines = text.split('\n').filter(l => l.trim());

        if (lines.length === 0) {
            DOM.massImportPreview.style.display = 'none';
            return;
        }

        const separator = Utils.detectSeparator(text);
        const separatorName = { '\t': 'Tabulation', '|': 'Pipe', ';': 'Point-virgule', ',': 'Virgule' }[separator] || `'${separator}'`;

        const firstLineParts = lines[0].split(separator);
        const columnCount = firstLineParts.length;

        // Update student count
        const countEl = document.getElementById('previewStudentCount');
        if (countEl) countEl.textContent = lines.length;

        // Update separator name
        const sepNameEl = document.getElementById('previewSeparatorName');
        if (sepNameEl) sepNameEl.textContent = separatorName;

        // Generate mapping pills preview
        const pillsContainer = document.getElementById('previewMappingPills');
        if (pillsContainer) {
            const guessedTypes = this._guessColumnTypes(firstLineParts);
            pillsContainer.innerHTML = guessedTypes.map((type, i) =>
                `<div class="mapping-pill ${type.cssClass}">
                    <span class="mapping-pill-col">${i + 1}</span>
                    <span>${type.label}</span>
                </div>`
            ).join('');
        }

        // Show preview with animation
        DOM.massImportPreview.style.display = 'block';
        DOM.massImportPreview.style.animation = 'none';
        DOM.massImportPreview.offsetHeight; // Trigger reflow
        DOM.massImportPreview.style.animation = 'welcome-slide-in-right 0.3s ease forwards';

        // Warning for single column
        if (columnCount === 1 && lines.length > 1) {
            const warningEl = document.createElement('div');
            warningEl.className = 'generic-info-box warning';
            warningEl.innerHTML = `<iconify-icon icon="solar:danger-triangle-bold"></iconify-icon> Une seule colonne détectée. Vérifiez le séparateur.`;
            warningEl.style.marginTop = '8px';
            DOM.massImportPreview.appendChild(warningEl);
        }

        if (UI && UI.initTooltips) UI.initTooltips();
    },

    /**
     * Devine le type probable de chaque colonne pour l'affichage des pills.
     * @param {string[]} firstLineData - Données de la première ligne
     * @returns {Array<{label: string, cssClass: string}>}
     */
    _guessColumnTypes(firstLineData) {
        const isLikelyGrade = (d) => Utils.isNumeric(d);
        const isLikelyName = (d) => typeof d === 'string' && d.split(' ').length >= 2 && /[a-zA-Z]/.test(d);
        const isLongText = (d) => typeof d === 'string' && d.length > 15;
        const isSmallInt = (d) => {
            const num = parseInt(d, 10);
            return !isNaN(num) && num >= 1 && num <= 20 && String(num) === d.trim();
        };

        let foundGrade = false;
        return firstLineData.map((data, index) => {
            if (index === 0 || isLikelyName(data)) {
                return { label: 'Nom', cssClass: 'type-name' };
            }
            // Detect evaluation count: small int (1-20) just after a grade column
            if (isSmallInt(data) && foundGrade) {
                return { label: 'Nb éval.', cssClass: 'type-eval-count' };
            }
            if (isLikelyGrade(data)) {
                foundGrade = true;
                return { label: 'Note', cssClass: 'type-grade' };
            }
            if (isLongText(data)) {
                return { label: 'Contexte', cssClass: 'type-context' };
            }
            return { label: 'Ignoré', cssClass: 'type-ignored' };
        });
    },

    /**
     * Met à jour l'état visuel du wizard stepper.
     * @param {number} step - Numéro de l'étape active (1, 2 ou 3)
     */
    setWizardStep(step) {
        const stepper = document.getElementById('importWizardStepper');
        if (!stepper) return;

        const steps = stepper.querySelectorAll('.wizard-step');
        const connectors = stepper.querySelectorAll('.wizard-step-connector');

        steps.forEach((stepEl, index) => {
            const stepNum = index + 1;
            stepEl.classList.remove('active', 'completed');
            if (stepNum < step) {
                stepEl.classList.add('completed');
            } else if (stepNum === step) {
                stepEl.classList.add('active');
            }
        });

        connectors.forEach((conn, index) => {
            conn.classList.toggle('active', index < step - 1);
        });

        // Show/hide step content
        for (let i = 1; i <= 3; i++) {
            const content = document.getElementById(`wizardStep${i}`);
            if (content) {
                content.style.display = i === step ? 'block' : 'none';
            }
        }
    },

    // Note: openImportPreviewModal has been removed - use ImportWizardManager.openWithData() instead

    /**
     * Définit l'état visuel de traitement (chargement) pour l'import.
     * @param {boolean} isProcessing - Vrai si en cours de traitement
     */
    setMassImportProcessingState(isProcessing) {
        const elementsToToggle = [DOM.importGenerateBtn, DOM.clearImportBtn, DOM.massData, DOM.importFileBtn, DOM.loadSampleDataLink];
        elementsToToggle.forEach(el => { if (el) el.disabled = isProcessing; });

        if (DOM.dropZone) DOM.dropZone.classList.toggle('processing', isProcessing);

        if (DOM.importGenerateBtn) {
            if (isProcessing) {
                DOM.importGenerateBtn.dataset.originalContent = DOM.importGenerateBtn.innerHTML;
                DOM.importGenerateBtn.innerHTML = `<div class="loading-spinner" style="border-width: 2px; width: 16px; height: 16px;"></div> Traitement...`;
            } else {
                if (DOM.importGenerateBtn.dataset.originalContent) {
                    DOM.importGenerateBtn.innerHTML = DOM.importGenerateBtn.dataset.originalContent;
                } else {
                    DOM.importGenerateBtn.innerHTML = `<iconify-icon icon="solar:bolt-bold-duotone"></iconify-icon> Générer`;
                }
            }
        }
    }
};
