/**
 * @fileoverview Cross-Class Search Manager
 * Permet de rechercher des élèves dans toutes les classes
 * et d'afficher les résultats des autres classes sous le tableau principal.
 * 
 * @module managers/CrossClassSearchManager
 */

import { appState } from '../state/State.js';
import { ClassManager } from './ClassManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';

/**
 * Gestionnaire de la recherche cross-classes
 * @namespace CrossClassSearchManager
 */
export const CrossClassSearchManager = {
    _container: null,
    _lastTerm: '',
    _debounceTimer: null,

    /**
     * Recherche des élèves dans toutes les classes sauf la courante
     * @param {string} term - Terme de recherche
     * @returns {Array<{classId: string, className: string, students: Array}>} Résultats groupés par classe
     */
    searchAcrossClasses(term) {
        if (!term || term.length < 2) return [];

        const currentClassId = appState.currentClassId;
        const allResults = appState.generatedResults || [];
        const searchTerm = term.toLowerCase().trim();

        // Groupe les résultats par classe
        const resultsByClass = new Map();

        allResults.forEach(result => {
            // Ignorer la classe courante
            if (result.classId === currentClassId || !result.classId) return;

            // Recherche sur nom, prénom
            const fullName = `${result.nom || ''} ${result.prenom || ''}`.toLowerCase();
            if (!fullName.includes(searchTerm)) return;

            // Récupérer les infos de la classe
            const classInfo = ClassManager.getClassById(result.classId);
            if (!classInfo) return;

            if (!resultsByClass.has(result.classId)) {
                resultsByClass.set(result.classId, {
                    classId: result.classId,
                    className: classInfo.name,
                    students: []
                });
            }

            // Note de la période courante
            const currentPeriod = appState.currentPeriod;
            const grade = result.studentData?.periods?.[currentPeriod]?.grade;

            resultsByClass.get(result.classId).students.push({
                id: result.id,
                nom: result.nom,
                prenom: result.prenom,
                grade: grade,
                studentPhoto: result.studentPhoto
            });
        });

        // Convertir en array et limiter le nombre total de résultats
        const grouped = Array.from(resultsByClass.values());

        // Limiter à 5 résultats total pour éviter la surcharge
        let count = 0;
        const maxResults = 5;

        return grouped.map(group => ({
            ...group,
            students: group.students.filter(() => {
                if (count >= maxResults) return false;
                count++;
                return true;
            })
        })).filter(group => group.students.length > 0);
    },

    /**
     * Met à jour l'affichage des résultats cross-classes
     * @param {string} term - Terme de recherche
     */
    updateCrossClassResults(term) {
        const trimmedTerm = (term || '').trim();

        // Éviter les appels redondants
        if (trimmedTerm === this._lastTerm) return;
        this._lastTerm = trimmedTerm;

        // Si pas assez de caractères, masquer la section
        if (trimmedTerm.length < 2) {
            this._hideResults();
            return;
        }

        // Rechercher
        const results = this.searchAcrossClasses(trimmedTerm);

        // Afficher ou masquer selon les résultats
        if (results.length === 0) {
            this._hideResults();
        } else {
            this._renderResults(results);
        }
    },

    /**
     * Génère et affiche les résultats
     * @param {Array} results - Résultats groupés par classe
     * @private
     */
    _renderResults(results) {
        // Créer ou récupérer le container
        let container = document.getElementById('crossClassResults');

        if (!container) {
            container = document.createElement('div');
            container.id = 'crossClassResults';
            container.className = 'cross-class-results';

            // Insérer après le outputList et avant le FAB
            const outputList = document.getElementById('outputList');
            if (outputList && outputList.parentNode) {
                outputList.parentNode.insertBefore(container, outputList.nextSibling);
            } else {
                return; // Pas de conteneur valide
            }
        }

        // Générer le HTML
        let html = `
            <div class="cross-class-header">
                <span class="cross-class-divider-line"></span>
                <span class="cross-class-divider-text">
                    <i class="fas fa-search"></i>
                    Autres classes
                </span>
                <span class="cross-class-divider-line"></span>
            </div>
            <div class="cross-class-list">
        `;

        results.forEach(group => {
            html += `
                <div class="cross-class-group">
                    <span class="cross-class-group-badge">
                        <i class="fas fa-users"></i>
                        ${this._escapeHtml(group.className)}
                    </span>
            `;

            group.students.forEach(student => {
                // Utiliser le système d'avatar existant
                const avatarHtml = StudentPhotoManager.getAvatarHTML(student, 'sm');

                html += `
                    <div class="cross-class-result" 
                         data-class-id="${group.classId}" 
                         data-student-id="${student.id}"
                         role="button"
                         tabindex="0">
                        ${avatarHtml}
                        <span class="cross-class-name">
                            ${this._escapeHtml(student.nom)} 
                            <span class="cross-class-prenom">${this._escapeHtml(student.prenom)}</span>
                        </span>
                        <div class="cross-class-overlay">
                            <i class="fas fa-arrow-right"></i>
                            <span>Voir dans ${this._escapeHtml(group.className)}</span>
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
        });

        html += `</div>`;

        container.innerHTML = html;
        container.classList.add('visible');

        // Attacher les événements
        this._attachEventListeners(container);
    },

    /**
     * Masque la section des résultats
     * @private
     */
    _hideResults() {
        const container = document.getElementById('crossClassResults');
        if (container) {
            container.classList.remove('visible');
            // Nettoyer après l'animation
            setTimeout(() => {
                if (!container.classList.contains('visible')) {
                    container.innerHTML = '';
                }
            }, 300);
        }
        this._lastTerm = '';
    },

    /**
     * Attache les gestionnaires d'événements
     * @param {HTMLElement} container 
     * @private
     */
    _attachEventListeners(container) {
        const results = container.querySelectorAll('.cross-class-result');

        results.forEach(resultEl => {
            const handleClick = () => {
                const classId = resultEl.dataset.classId;
                const studentId = resultEl.dataset.studentId;
                this._handleResultClick(classId, studentId);
            };

            resultEl.addEventListener('click', handleClick);
            resultEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick();
                }
            });
        });
    },

    /**
     * Gère le clic sur un résultat cross-class
     * @param {string} classId - ID de la classe cible
     * @param {string} studentId - ID de l'élève
     * @private
     */
    async _handleResultClick(classId, studentId) {
        // Récupérer le nom de la classe pour le feedback
        const classInfo = ClassManager.getClassById(classId);
        const className = classInfo?.name || 'Classe';

        // Masquer la section cross-class avant le switch
        this._hideResults();

        // Vider la recherche
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Switch de classe
        await ClassManager.switchClass(classId);

        // Mettre à jour immédiatement l'affichage du header
        ClassUIManager.updateHeaderDisplay();

        // Attendre un tick pour que le rendu se fasse
        await new Promise(resolve => setTimeout(resolve, 100));

        // Ouvrir le Focus Panel sur l'élève
        FocusPanelManager.open(studentId);

        // Notification de feedback
        const { UI } = await import('./UIManager.js');
        UI?.showNotification(`Basculé vers ${className}`, 'info');
    },

    /**
     * Échappe les caractères HTML
     * @param {string} text 
     * @returns {string}
     * @private
     */
    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Réinitialise l'état (appelé lors du changement de classe)
     */
    reset() {
        this._hideResults();
        this._lastTerm = '';
    }
};
