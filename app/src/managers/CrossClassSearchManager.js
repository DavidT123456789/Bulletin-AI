/**
 * @fileoverview Cross-Class Search Manager
 * Permet de rechercher des élèves dans toutes les classes,
 * d'afficher les résultats des autres classes sous le tableau principal
 * et d'orchestrer le cycle de vie de la recherche en vue Liste.
 *
 * @module managers/CrossClassSearchManager
 */

import { appState } from '../state/State.js';
import { ClassManager } from './ClassManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { EventHandlersManager } from './EventHandlersManager.js';
import { HistoryManager } from './HistoryManager.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
import { UI } from './UIManager.js';
import { Utils } from '../utils/Utils.js';

const TRANSITION_ANIM_CLASSES = [
    'class-switch-out-down', 'class-switch-out-up',
    'class-switch-in-down', 'class-switch-in-up',
    'view-slide-out-left', 'view-slide-in-left'
];

/**
 * Gestionnaire de la recherche cross-classes
 * @namespace CrossClassSearchManager
 */
export const CrossClassSearchManager = {
    _lastTerm: '',
    _debounceTimer: null,
    _hideTimer: null,

    /**
     * Planifie le filtrage du tableau et la recherche inter-classes de façon synchronisée (debounce unique)
     * @param {string} term - Terme de recherche
     * @param {Function} [onFilterTable] - Callback de filtrage du tableau principal
     * @param {number} [delay=180] - Délai de debounce en ms
     */
    scheduleSearch(term, onFilterTable, delay = 180) {
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
        }
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            onFilterTable?.();
            this.updateCrossClassResults(term);
        }, delay);
    },

    /**
     * Annule tout timer de recherche en attente
     */
    cancelPendingSearch() {
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }
        if (this._hideTimer) {
            clearTimeout(this._hideTimer);
            this._hideTimer = null;
        }
    },

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
            // Ignorer la classe courante (physique ou virtuelle)
            if (currentClassId?.startsWith('virtual_')) {
                const normVirtual = currentClassId.replace('virtual_', '');
                const studentOriginNorm = Utils.normalizeClassName(result.studentData?.classe || result.classe || '');
                if (studentOriginNorm === normVirtual) return;
            } else if (result.classId === currentClassId || !result.classId) {
                return;
            }

            // Recherche flexible sur nom, prénom et classe d'origine (accent-insensitive & word-order agnostic)
            if (!Utils.matchesStudent(result, searchTerm)) return;
            const originClass = result.studentData?.classe || result.classe || '';

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
                originClass: originClass,
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
        const { groups, totalMatches, remainingMatches } = resultsData;

        if (this._hideTimer) {
            clearTimeout(this._hideTimer);
            this._hideTimer = null;
        }

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

        const displayTotal = totalMatches || groups.reduce((acc, g) => acc + g.students.length, 0);

        // Générer le HTML
        let html = `
            <div class="cross-class-results-inner">
                <div class="cross-class-header">
                    <span class="cross-class-divider-line"></span>
                    <span class="cross-class-divider-text">
                        <iconify-icon icon="solar:magnifer-linear"></iconify-icon>
                        <span>Autres classes</span>
                        <span class="cross-class-total-count">${displayTotal}</span>
                    </span>
                    <span class="cross-class-divider-line"></span>
                </div>
                <div class="cross-class-list">
        `;

        groups.forEach(group => {
            const countLabel = `${group.students.length} élève${group.students.length > 1 ? 's' : ''}`;
            const escapedClassName = Utils.escapeHtml(group.className);
            html += `
                <div class="cross-class-group">
                    <div class="cross-class-group-header">
                        <span class="cross-class-group-badge">${escapedClassName}</span>
                        <span class="cross-class-group-count" aria-label="${countLabel}">
                            <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                            <span>${group.students.length}</span>
                        </span>
                    </div>
            `;

            group.students.forEach(student => {
                const avatarHtml = StudentPhotoManager.getAvatarHTML(student, 'sm');
                const nomUpper = (student.nom || '').trim().toUpperCase();
                const nomHighlighted = Utils.highlightMatch(nomUpper, this._lastTerm);
                const prenomHighlighted = Utils.highlightMatch((student.prenom || '').trim(), this._lastTerm);
                const displayClass = student.originClass ? Utils.formatClassDisplayName(student.originClass) : '';
                const escapedOriginClass = displayClass ? Utils.escapeHtml(displayClass) : '';
                const originClassTag = (displayClass && Utils.normalizeClassName(student.originClass) !== Utils.normalizeClassName(group.className))
                    ? ` <span class="student-origin-class-tag" title="Classe d'origine : ${escapedOriginClass}">${escapedOriginClass}</span>`
                    : '';

                html += `
                    <div class="cross-class-result" 
                         data-class-id="${group.classId}" 
                         data-student-id="${student.id}"
                         role="button"
                         tabindex="0">
                        ${avatarHtml}
                        <span class="cross-class-name">
                            <span class="cross-class-nom">${nomHighlighted}</span>
                            <span class="cross-class-prenom">${prenomHighlighted}</span>${originClassTag}
                        </span>
                        <div class="cross-class-overlay">
                            <span>Voir dans ${escapedClassName}</span>
                            <iconify-icon icon="solar:alt-arrow-right-linear"></iconify-icon>
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

        html += `</div></div>`;

        container.innerHTML = html;
        container.classList.remove(...TRANSITION_ANIM_CLASSES);
        container.classList.add('visible');

        this._ensureListenersBound(container);
    },

    /**
     * Masque la section des résultats
     * @param {boolean} [immediate=false] - Si true, vide immédiatement le DOM sans attendre la transition
     * @private
     */
    _hideResults(immediate = false) {
        if (this._hideTimer) {
            clearTimeout(this._hideTimer);
            this._hideTimer = null;
        }
        const container = document.getElementById('crossClassResults');
        if (container) {
            container.classList.remove('visible', ...TRANSITION_ANIM_CLASSES);
            if (immediate) {
                container.innerHTML = '';
            } else {
                this._hideTimer = setTimeout(() => {
                    this._hideTimer = null;
                    if (!container.classList.contains('visible')) {
                        container.innerHTML = '';
                    }
                }, 300);
            }
        }
        this._lastTerm = '';
    },

    /**
     * Attache une seule fois les écouteurs délégués (clic, Entrée/Espace, flèches Haut/Bas) sur le conteneur
     * @param {HTMLElement} container
     * @private
     */
    _ensureListenersBound(container) {
        if (container.dataset.bound === 'true') return;
        container.dataset.bound = 'true';

        container.addEventListener('click', (e) => {
            const resultEl = e.target.closest('.cross-class-result');
            if (!resultEl || !container.contains(resultEl)) return;
            this._handleResultClick(resultEl.dataset.classId, resultEl.dataset.studentId);
        });

        container.addEventListener('keydown', (e) => {
            const resultEl = e.target.closest('.cross-class-result');
            if (!resultEl || !container.contains(resultEl)) return;

            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._handleResultClick(resultEl.dataset.classId, resultEl.dataset.studentId);
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const results = Array.from(container.querySelectorAll('.cross-class-result'));
                const idx = results.indexOf(resultEl);
                if (idx === -1) return;

                if (e.key === 'ArrowDown') {
                    results[idx + 1]?.focus();
                } else if (idx > 0) {
                    results[idx - 1]?.focus();
                } else {
                    const inlineInput = document.getElementById('inlineSearchInput');
                    if (inlineInput && inlineInput.offsetParent !== null) {
                        inlineInput.focus();
                    } else {
                        document.getElementById('searchInput')?.focus();
                    }
                }
            }
        });
    },

    /**
     * Déclenche la bascule vers le premier résultat cross-classe visible (ex: touche Entrée depuis l'input)
     * @returns {Promise<boolean>} true si un résultat a été déclenché
     */
    async triggerFirstResult() {
        const container = document.getElementById('crossClassResults');
        if (!container || !container.classList.contains('visible')) return false;

        const firstResult = container.querySelector('.cross-class-result');
        if (!firstResult) return false;

        const { classId, studentId } = firstResult.dataset;
        if (!classId) return false;

        await this._handleResultClick(classId, studentId);
        return true;
    },

    /**
     * Gère le clic sur un résultat cross-class
     * @param {string} classId - ID de la classe cible
     * @param {string} studentId - ID de l'élève
     * @private
     */
    async _handleResultClick(classId, studentId) {
        const classInfo = ClassManager.getClassById(classId);
        const className = classInfo?.name || 'Classe';

        // Annuler tout timer de recherche en attente pour éviter un re-rendu parasite après la bascule
        this.cancelPendingSearch();

        // Utiliser handleClassSwitch de ClassUIManager (qui anime la sortie unifiée,
        // réinitialise la recherche et met en surbrillance l'élève cible)
        await ClassUIManager.handleClassSwitch(classId, studentId);

        // Filet de sécurité idempotent (ex: si handleClassSwitch est mocké en test)
        this.clearListSearch({ renderList: false, immediate: true });

        // Notification de feedback
        UI?.showNotification(`Basculé vers ${className}`, 'info');
    },

    /**
     * Réinitialise proprement toute la recherche de la vue Liste (input toolbar, input inline,
     * historique mobile et résultats inter-classes)
     * @param {Object} [options={}]
     * @param {boolean} [options.renderList=false] - Si true et qu'une recherche filtrait la liste, relance le rendu de la classe
     * @param {boolean} [options.immediate=false] - Si true, vide immédiatement le DOM des résultats inter-classes
     */
    clearListSearch({ renderList = false, immediate = false } = {}) {
        this.cancelPendingSearch();

        const searchInput = document.getElementById('searchInput');
        const inlineInput = document.getElementById('inlineSearchInput');
        const inlineContainer = document.getElementById('inlineSearchContainer');
        const inlineTrigger = document.getElementById('inlineSearchTrigger');

        const hadSearchValue = Boolean(
            this._lastTerm ||
            searchInput?.value ||
            inlineInput?.value
        );

        if (searchInput) {
            searchInput.value = '';
            searchInput.parentElement?.classList.remove('has-value');
        }

        if (inlineInput) {
            inlineInput.value = '';
        }

        if (inlineContainer) {
            inlineContainer.classList.remove('active', 'has-value');
        }

        inlineTrigger?._tippy?.enable?.();

        if (HistoryManager?.isOpen?.('inlineSearch')) {
            HistoryManager.handleManualClose('inlineSearch');
        }

        this._hideResults(immediate);

        if (renderList && hadSearchValue) {
            EventHandlersManager?.handleSearchInput?.();
        }
    },

    /**
     * Réinitialise l'état des résultats inter-classes
     * @param {boolean} [immediate=false]
     */
    reset(immediate = false) {
        this.cancelPendingSearch();
        this._hideResults(immediate);
    }
};
