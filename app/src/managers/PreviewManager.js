/**
 * @fileoverview Gestionnaire de l'aperçu des paramètres pour Bulletin AI.
 * 
 * Ce module gère les fonctionnalités de prévisualisation dans les paramètres,
 * notamment les profils de test et l'affichage des résultats d'aperçu.
 * 
 * @module managers/PreviewManager
 */

import { DOM } from '../utils/DOM.js';
import { DEMO_STUDENT_PROFILES } from '../config/defaults.js';

/**
 * Module de gestion de l'aperçu des paramètres.
 * @namespace PreviewManager
 */
export const PreviewManager = {
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
