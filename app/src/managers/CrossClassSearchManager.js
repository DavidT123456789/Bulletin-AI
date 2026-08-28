/**
 * @fileoverview Cross-Class Search Manager
 * Permet de rechercher des élèves dans toutes les classes
 * et d'afficher les résultats des autres classes sous le tableau principal.
 * 
 * @module managers/CrossClassSearchManager
 */

import { appState } from '../state/State.js';
import { ClassManager } from './ClassManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
import { UI } from './UIManager.js';
import { Utils } from '../utils/Utils.js';

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
     * @returns {{groups: Array<{classId: string, className: string, students: Array}>, totalMatches: number, remainingMatches: number}} Résultats groupés par classe
     */
    searchAcrossClasses(term) {
        if (!term || term.trim().length < 2) {
            return { groups: [], totalMatches: 0, remainingMatches: 0 };
        }

        const currentClassId = appState.currentClassId;
        const allResults = appState.generatedResults || [];
        const searchTerm = term.trim();

        // Groupe les résultats par classe
        const resultsByClass = new Map();
        let totalCount = 0;

        allResults.forEach(result => {
            // Ignorer la classe courante
            if (result.classId === currentClassId || !result.classId) return;

            // Recherche flexible sur nom, prénom (accent-insensitive & word-order agnostic)
            if (!Utils.matchesSearch([result.nom, result.prenom], searchTerm)) return;

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
            totalCount++;
        });

        // Limiter à 8 résultats max affichés pour garder une vue ergonomique
        let count = 0;
        const maxResults = 8;

        const grouped = Array.from(resultsByClass.values());
        const limitedGroups = grouped.map(group => ({
            ...group,
            students: group.students.filter(() => {
                if (count >= maxResults) return false;
                count++;
                return true;
            })
        })).filter(group => group.students.length > 0);

        return {
            groups: limitedGroups,
            totalMatches: totalCount,
            remainingMatches: Math.max(0, totalCount - count)
        };
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
        if (!results.groups || results.groups.length === 0) {
            this._hideResults();
        } else {
            this._renderResults(results);
        }
    },

    /**
     * Génère et affiche les résultats
     * @param {{groups: Array, totalMatches: number, remainingMatches: number}} resultsData - Données des résultats
     * @private
     */
    _renderResults(resultsData) {
        const { groups, remainingMatches } = resultsData;

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
                    <iconify-icon icon="ph:magnifying-glass-bold"></iconify-icon>
                    Autres classes
                </span>
                <span class="cross-class-divider-line"></span>
            </div>
            <div class="cross-class-list">
        `;

        groups.forEach(group => {
            html += `
                <div class="cross-class-group">
                    <span class="cross-class-group-badge">
                        <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                        ${this._escapeHtml(group.className)}
                    </span>
            `;

            group.students.forEach(student => {
                // Utiliser le système d'avatar existant
                const avatarHtml = StudentPhotoManager.getAvatarHTML(student, 'sm');
                const nomHighlighted = Utils.highlightMatch(student.nom, this._lastTerm);
                const prenomHighlighted = Utils.highlightMatch(student.prenom, this._lastTerm);

                html += `
                    <div class="cross-class-result" 
                         data-class-id="${group.classId}" 
                         data-student-id="${student.id}"
                         role="button"
                         tabindex="0">
                        ${avatarHtml}
                        <span class="cross-class-name">
                            ${nomHighlighted} 
                            <span class="cross-class-prenom">${prenomHighlighted}</span>
                        </span>
                        <div class="cross-class-overlay">
                            <iconify-icon icon="ph:arrow-right-bold"></iconify-icon>
                            <span>Voir dans ${this._escapeHtml(group.className)}</span>
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
        });

        if (remainingMatches > 0) {
            html += `
                <div class="cross-class-more">
                    <iconify-icon icon="solar:info-circle-linear"></iconify-icon>
                    <span>+ ${remainingMatches} autre${remainingMatches > 1 ? 's' : ''} élève${remainingMatches > 1 ? 's' : ''} trouvé${remainingMatches > 1 ? 's' : ''}</span>
                </div>
            `;
        }

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

        // Utiliser handleClassSwitch de ClassUIManager et lui passer l'ID de l'élève
        // pour déclencher le re-rendu avec scroll automatique et mise en surbrillance
        await ClassUIManager.handleClassSwitch(classId, studentId);

        // Notification de feedback
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
