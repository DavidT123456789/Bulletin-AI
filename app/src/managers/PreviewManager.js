/**
 * @fileoverview Gestionnaire de l'aperçu des paramètres pour Bulletin AI.
 * 
 * Ce module gère les fonctionnalités de prévisualisation dans les paramètres,
 * notamment les profils de test et l'affichage des résultats d'aperçu.
 * 
 * @module managers/PreviewManager
 */

import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { UI } from './UIManager.js';
import { DropdownManager } from './DropdownManager.js';
import { DEMO_STUDENT_PROFILES } from '../config/defaults.js';

/**
 * Module de gestion de l'aperçu des paramètres.
 * @namespace PreviewManager
 */
export const PreviewManager = {
    /**
     * Retourne les profils de test disponibles pour la prévisualisation.
     * @returns {Object} Dictionnaire des profils avec grade et contexte
     */
    getTestProfiles() {
        return {
            'excellent': { grade: 18, context: "Élève moteur, participation active." },
            'average': { grade: 12, context: "Élève discret, travail sérieux mais irrégulier." },
            'struggling': { grade: 8, context: "Difficultés, bavardages, manque de travail." },
            'progressing': { grade: 13, context: "En nette progression, efforts payants." }
        };
    },

    /**
     * Retourne les données d'un élève fictif pour la prévisualisation.
     * @returns {Object} Données de l'élève de test
     */
    getPreviewStudentData() {
        const profileKey = DOM.previewStudentSelect.value;
        const profiles = this.getTestProfiles();
        const profile = profiles[profileKey];

        return {
            nom: "TEST",
            prenom: "Élève",
            periods: { [appState.currentPeriod]: { grade: profile.grade, appreciation: '', context: profile.context } },
            currentPeriod: appState.currentPeriod,
            subject: appState.currentSettingsSubject,
            statuses: [],
            prompts: {}
        };
    },

    /**
     * Affiche les données de résultat de prévisualisation.
     * @param {Object} result - Résultat contenant appreciation et prompt
     */
    displayPreviewStudentData(result) {
        const resultEl = document.getElementById('previewAppreciationResult');
        const promptEl = document.getElementById('previewPromptUsed');

        if (resultEl) {
            resultEl.innerHTML = result.appreciation;
            UI.updateWordCount('settingsPreviewWordCount', result.appreciation);
        }
        if (promptEl) {
            promptEl.textContent = result.prompt;
        }
    },

    /**
     * Réinitialise l'affichage de prévisualisation.
     */
    resetSettingsPreview() {
        const resultEl = document.getElementById('previewAppreciationResult');
        if (resultEl) {
            resultEl.innerHTML = '<span style="color:var(--text-secondary);font-style:italic;">Cliquez sur "Actualiser" pour voir un exemple...</span>';
        }
        const wordCountEl = document.getElementById('settingsPreviewWordCount');
        if (wordCountEl) {
            wordCountEl.textContent = '0 mots • 0 car.';
        }
    },

    /**
     * Remplit le sélecteur d'élèves pour la prévisualisation.
     * Utilise les profils de démonstration pour des tests fiables et cohérents.
     */
    populatePreviewStudentSelect() {
        const select = DOM.previewStudentSelect;
        if (!select) return;

        select.innerHTML = '';

        // Add demo profiles with optgroup label
        const optgroup = document.createElement('optgroup');
        optgroup.label = '📋 Profils de test';

        DEMO_STUDENT_PROFILES.forEach(student => {
            const option = document.createElement('option');
            option.value = student.id;
            option.text = `${student.prenom} ${student.nom}`;
            optgroup.appendChild(option);
        });

        select.appendChild(optgroup);

        // Select first if not selected or invalid
        const currentVal = select.value;
        const exists = DEMO_STUDENT_PROFILES.some(r => r.id === currentVal);
        if (!currentVal || !exists) {
            select.value = DEMO_STUDENT_PROFILES[0].id;
        }

        // Refresh custom dropdown if enhanced
        // DropdownManager.refresh('previewStudentSelect'); // Disabled for Custom Pill Navigation
    }
};
