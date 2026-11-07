/**
 * @fileoverview Cross-Class Search Manager
 * Recherche des élèves dans toutes les classes hors classe active
 * et orchestre le debounce / la réinitialisation de la barre de recherche unifiée.
 *
 * @module managers/CrossClassSearchManager
 */

import { appState } from '../state/State.js';
import { ClassManager } from './ClassManager.js';
import { EventHandlersManager } from './EventHandlersManager.js';
import { HistoryManager } from './HistoryManager.js';
import { Utils } from '../utils/Utils.js';

/**
 * Gestionnaire de la recherche inter-classes
 * @namespace CrossClassSearchManager
 */
export const CrossClassSearchManager = {
    _debounceTimer: null,

    /**
     * Planifie le filtrage du tableau en vue Liste avec debounce
     * @param {string} _term - Terme de recherche
     * @param {Function} [onFilterTable] - Callback de filtrage du tableau principal
     * @param {number} [delay=180] - Délai de debounce en ms
     */
    scheduleSearch(_term, onFilterTable, delay = 180) {
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
        }
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            onFilterTable?.();
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

            if (!Utils.matchesStudent(result, searchTerm)) return;
            const originClass = result.studentData?.classe || result.classe || '';

            const classInfo = ClassManager.getClassById(result.classId);
            if (!classInfo) return;

            if (!resultsByClass.has(result.classId)) {
                resultsByClass.set(result.classId, {
                    classId: result.classId,
                    className: classInfo.name,
                    students: []
                });
            }

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
     * Masque et vide le popover de suggestions inter-classes
     * @param {HTMLElement|null} [sugEl] - Élément DOM optionnel déjà résolu
     */
    hideSuggestions(sugEl = document.getElementById('scFloatingSearchSuggestions')) {
        if (sugEl) {
            sugEl.classList.remove('visible');
            sugEl.style.display = 'none';
            sugEl.innerHTML = '';
        }
    },

    /**
     * Réinitialise le DOM et l'historique mobile de la barre de recherche unifiée
     * @param {Object} [options={}]
     * @param {boolean} [options.fromHistory=false] - Si true, ne déclenche pas handleManualClose sur HistoryManager
     */
    resetHeaderSearchUI({ fromHistory = false } = {}) {
        const headerInput = document.getElementById('scFloatingSearchInput');
        const headerContainer = document.getElementById('scFloatingSearch');
        const headerTrigger = document.getElementById('scFloatingSearchBtn');
        const headerClear = document.getElementById('scFloatingSearchClear');
        const headerCount = document.getElementById('scFloatingSearchCount');

        if (headerInput) {
            headerInput.value = '';
            headerInput.blur?.();
        }
        if (headerContainer) {
            headerContainer.classList.remove('open', 'has-value');
        }
        headerClear?.classList.remove('visible');
        if (headerCount) {
            headerCount.textContent = '';
            headerCount.classList.remove('sc-count-zero');
            headerCount.style.display = 'none';
        }
        this.hideSuggestions();
        headerTrigger?._tippy?.enable?.();

        if (!fromHistory && HistoryManager?.isOpen?.('inlineSearch')) {
            HistoryManager.handleManualClose('inlineSearch');
        }
    },

    /**
     * Réinitialise proprement toute la recherche (état, barre unifiée du header,
     * historique mobile et popover inter-classes)
     * @param {Object} [options={}]
     * @param {boolean} [options.renderList=false] - Si true et qu'une recherche filtrait la liste, relance le rendu de la classe
     */
    clearListSearch({ renderList = false } = {}) {
        this.cancelPendingSearch();

        const headerInput = document.getElementById('scFloatingSearchInput');
        const hadSearchValue = Boolean(
            appState.searchQuery ||
            headerInput?.value
        );

        appState.searchQuery = '';
        this.resetHeaderSearchUI();

        if (renderList && hadSearchValue) {
            EventHandlersManager?.handleSearchInput?.();
        }
    },

    /**
     * Réinitialise l'état des suggestions inter-classes et les timers
     */
    reset() {
        this.cancelPendingSearch();
        this.hideSuggestions();
    }
};
