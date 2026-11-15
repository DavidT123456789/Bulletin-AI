/**
 * @fileoverview Seating Chart Random Student Picker — Tirage au sort sans remise intégré à la capsule flottante
 * @module managers/seating/SeatingRandomPicker
 */

import { appState } from '../../state/State.js';
import { HistoryManager } from '../HistoryManager.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { UI } from '../UIManager.js';

const REST_TOOLTIP = 'Tirer un élève au sort';
const ACTIVE_TOOLTIP = 'Tirer un autre élève (Espace)';
const HOP_DELAYS_MANY = [65, 65, 70, 75, 85, 95, 110, 125, 145, 170, 200, 240, 290, 355, 420];
const HOP_DELAYS_THREE = [90, 100, 115, 135, 165, 205, 260, 340];
const HOP_DELAYS_TWO = [140, 180, 240, 320];

export const SeatingRandomPicker = {
    /**
     * Indique si le mode tirage au sort est actuellement actif sur le plan.
     * @returns {boolean}
     */
    _isRandomPickerActive() {
        return Boolean(this._randomPickerState?.active);
    },

    /**
     * Nettoie les minuteurs liés à l'animation de suspense et de révélation.
     */
    _clearRandomTimers() {
        if (this._randomSuspenseTimer) {
            clearTimeout(this._randomSuspenseTimer);
            this._randomSuspenseTimer = null;
        }
        if (this._randomRevealTimer) {
            clearTimeout(this._randomRevealTimer);
            this._randomRevealTimer = null;
        }
        if (this._randomRollAnimTimer) {
            clearTimeout(this._randomRollAnimTimer);
            this._randomRollAnimTimer = null;
        }
    },

    /**
     * Retourne la liste des élèves actifs (non partis) placés sur le plan courant.
     * @returns {Array<Object>}
     */
    _getRandomPickerPool() {
        const placedIds = this._getPlacedIds?.() || new Set();
        if (placedIds.size === 0) return [];

        const pool = [];
        for (const id of placedIds) {
            const student = this._studentMap?.get(id) || this._students?.find(s => s?.id === id);
            if (!student || this._isStudentDeparted?.(student)) continue;
            pool.push(student);
        }
        return pool;
    },

    /**
     * Mélange une liste d'identifiants (Fisher-Yates) en évitant de répéter immédiatement
     * le dernier élève tiré lors d'un nouveau tour si la classe compte plusieurs élèves.
     * @param {string[]} ids
     * @param {string|null} [previousId=null]
     * @returns {string[]}
     */
    _shuffleStudentIds(ids, previousId = null) {
        const copy = [...ids];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        if (previousId && copy.length > 1 && copy[0] === previousId) {
            const swapIdx = 1 + Math.floor(Math.random() * (copy.length - 1));
            [copy[0], copy[swapIdx]] = [copy[swapIdx], copy[0]];
        }
        return copy;
    },

    /**
     * Construit une courte séquence de candidats intermédiaires pour le ricochet visuel
     * avant de s'arrêter sur l'élève gagnant.
     * @param {Array<Object>} pool
     * @param {string} winnerId
     * @returns {{ hops: Array<Object>, delays: number[] }}
     */
    _buildSuspenseSequence(pool, winnerId) {
        if (pool.length <= 1) return { hops: [], delays: [] };

        const delays = pool.length >= 4
            ? HOP_DELAYS_MANY
            : (pool.length === 3 ? HOP_DELAYS_THREE : HOP_DELAYS_TWO);

        const hops = [];
        let lastHopId = null;

        for (let i = 0; i < delays.length; i++) {
            const isFinalHop = i === delays.length - 1;
            const candidates = pool.filter(s =>
                s.id !== lastHopId && (!isFinalHop || s.id !== winnerId)
            );
            const fallback = candidates.length > 0 ? candidates : pool.filter(s => s.id !== winnerId);
            const picked = fallback[Math.floor(Math.random() * fallback.length)] || pool[0];
            hops.push(picked);
            lastHopId = picked.id;
        }

        return { hops, delays };
    },

    /**
     * Libellé court d'un élève pour la capsule (respecte les règles d'homonymie du plan).
     * @param {Object} student
     * @returns {string}
     */
    _getRandomPickerDisplayName(student) {
        const nameInfo = this._getStudentCellNameInfo?.(student);
        return nameInfo?.plain || (student?.prenom || student?.nom || '').trim();
    },

    /**
     * Tire l'élève suivant sans remise et lance le suspense visuel dans la capsule et sur le plan.
     * Quand le tour complet est terminé, redémarre automatiquement un nouveau tour mélangé.
     * @param {{ animate?: boolean }} [options]
     * @returns {Object|null}
     */
    _drawNextRandomStudent({ animate = true } = {}) {
        if (!this._isActive || !this._isLocked) return null;

        this._clearRandomTimers();

        if (this._isSearchOpen?.() || this._activeSearchTerm) {
            this._closeSearch?.();
        }
        this._closeContextMenu?.();
        this._closeMobileSheet?.(true);

        const pool = this._getRandomPickerPool();
        if (pool.length === 0) {
            this._closeRandomPicker();
            UI?.showNotification?.('Aucun élève actif placé sur le plan.', 'info');
            return null;
        }

        const validIds = new Set(pool.map(s => s.id));
        const sessionKey = `${appState.currentClassId || 'default'}:${this._planMode || 'course'}`;
        const prev = this._randomPickerState;
        const canReuseSession = prev && prev.active && prev.sessionKey === sessionKey;

        let drawnIds = canReuseSession ? prev.drawnIds.filter(id => validIds.has(id)) : [];
        let remainingIds = canReuseSession ? prev.remainingIds.filter(id => validIds.has(id)) : [];

        // Intégrer d'éventuels élèves ajoutés en cours de session sans perdre l'ordre déjà tiré
        if (canReuseSession) {
            const knownIds = new Set([...drawnIds, ...remainingIds]);
            const missingIds = [...validIds].filter(id => !knownIds.has(id));
            if (missingIds.length > 0) {
                remainingIds = this._shuffleStudentIds([...remainingIds, ...missingIds]);
            }
        }

        if (remainingIds.length === 0) {
            const lastDrawnId = canReuseSession ? prev.currentStudentId : null;
            drawnIds = [];
            remainingIds = this._shuffleStudentIds([...validIds], lastDrawnId);
        }

        const nextId = remainingIds.shift();
        drawnIds.push(nextId);

        this._randomPickerState = {
            active: true,
            sessionKey,
            currentStudentId: nextId,
            drawnIds,
            remainingIds
        };

        if (!HistoryManager.isOpen('scRandomPicker')) {
            HistoryManager.pushState('scRandomPicker', () => {
                this._closeRandomPicker({ fromHistory: true });
            });
        }

        const winner = this._studentMap?.get(nextId) || pool.find(s => s.id === nextId) || null;
        const prefersReducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
        const shouldSuspense = animate && !prefersReducedMotion && pool.length > 1;

        if (shouldSuspense) {
            this._runRandomSuspense(pool, winner);
        } else {
            this._syncRandomPickerUI({ triggerReveal: animate && !prefersReducedMotion });
            this._haptic?.(12);
        }

        return winner;
    },

    /**
     * Retourne les éléments DOM de la capsule flottante dédiés au tirage au sort.
     * @returns {{ view: HTMLElement|null, actionsCapsule: HTMLElement|null, readout: HTMLElement|null, nameEl: HTMLElement|null, counterEl: HTMLElement|null, randomBtn: HTMLElement|null }}
     */
    _getRandomPickerElements() {
        return {
            view: document.getElementById('seatingChartView'),
            actionsCapsule: document.getElementById('scFloatingActions'),
            readout: document.getElementById('scRandomReadout'),
            nameEl: document.getElementById('scRandomStudentName'),
            counterEl: document.getElementById('scRandomCounter'),
            randomBtn: document.getElementById('scFloatingRandomBtn')
        };
    },

    /**
     * Synchronise l'infobulle et l'étiquette ARIA du bouton dé.
     * @param {HTMLElement|null} randomBtn
     * @param {string} tooltip
     */
    _setRandomBtnTooltip(randomBtn, tooltip) {
        if (!randomBtn) return;
        randomBtn.setAttribute('aria-label', tooltip);
        randomBtn.setAttribute('data-tooltip', tooltip);
        TooltipsUI?.updateTooltip?.(randomBtn, tooltip);
    },

    /**
     * Exécute le ricochet décélérant sur quelques tables puis verrouille la révélation sur le gagnant.
     * @param {Array<Object>} pool
     * @param {Object|null} winner
     */
    _runRandomSuspense(pool, winner) {
        if (!winner) {
            this._syncRandomPickerUI({ triggerReveal: false });
            return;
        }

        const { hops, delays } = this._buildSuspenseSequence(pool, winner.id);
        if (hops.length === 0) {
            this._syncRandomPickerUI({ triggerReveal: true });
            this._haptic?.(12);
            return;
        }

        const { view, actionsCapsule, readout, nameEl, counterEl, randomBtn } = this._getRandomPickerElements();
        const total = pool.length;
        const step = Math.min(this._randomPickerState.drawnIds.length, total);

        view?.classList.remove('sc-random-revealed');
        view?.classList.add('sc-random-active', 'sc-random-rolling');
        actionsCapsule?.classList.add('random-open');
        readout?.setAttribute('aria-hidden', 'false');
        if (counterEl) counterEl.textContent = `${step}/${total}`;

        this._setRandomBtnTooltip(randomBtn, ACTIVE_TOOLTIP);
        if (randomBtn) {
            randomBtn.classList.remove('rolling');
            void randomBtn.offsetWidth;
            randomBtn.classList.add('rolling');
        }

        let stepIdx = 0;
        const runStep = () => {
            if (!this._isRandomPickerActive() || !this._isActive || !this._isLocked) return;

            if (stepIdx >= hops.length) {
                this._syncRandomPickerUI({ triggerReveal: true });
                this._haptic?.(14);
                return;
            }

            const hopStudent = hops[stepIdx];
            if (nameEl) {
                nameEl.textContent = this._getRandomPickerDisplayName(hopStudent);
            }
            this._renderSpotlight?.(new Set([hopStudent.id]), {
                activeClass: 'sc-random-active',
                matchCount: 1,
                scrollToSingle: false,
                dimSidebar: false
            });

            const delay = delays[stepIdx];
            stepIdx += 1;
            this._randomSuspenseTimer = setTimeout(runStep, delay);
        };

        runStep();
    },

    /**
     * Met à jour la capsule flottante, les tooltips et le Spotlight sur le plan.
     * @param {{ triggerReveal?: boolean, skipScroll?: boolean }} [options]
     */
    _syncRandomPickerUI({ triggerReveal = false, skipScroll = false } = {}) {
        const state = this._randomPickerState;
        const { view, actionsCapsule, readout, nameEl, counterEl, randomBtn } = this._getRandomPickerElements();

        if (!state?.active || !this._isActive || !this._isLocked) {
            this._closeRandomPicker();
            return;
        }

        const pool = this._getRandomPickerPool();
        const student = pool.find(s => s.id === state.currentStudentId);
        if (!student) {
            this._closeRandomPicker();
            return;
        }

        const displayName = this._getRandomPickerDisplayName(student);
        const total = pool.length;
        const step = Math.min(state.drawnIds.length, total);

        view?.classList.remove('sc-random-rolling');
        view?.classList.add('sc-random-active');
        actionsCapsule?.classList.add('random-open');
        if (nameEl) nameEl.textContent = displayName;
        if (counterEl) counterEl.textContent = `${step}/${total}`;
        readout?.setAttribute('aria-hidden', 'false');

        randomBtn?.classList.remove('rolling');
        this._setRandomBtnTooltip(randomBtn, ACTIVE_TOOLTIP);

        this._renderSpotlight?.(new Set([student.id]), {
            activeClass: 'sc-random-active',
            matchCount: 1,
            scrollToSingle: !skipScroll,
            dimSidebar: false
        });

        if (triggerReveal) {
            view?.classList.remove('sc-random-revealed');
            if (view) void view.offsetWidth;
            view?.classList.add('sc-random-revealed');

            if (randomBtn) {
                randomBtn.classList.add('rolling');
                this._randomRollAnimTimer = setTimeout(() => {
                    randomBtn.classList.remove('rolling');
                    this._randomRollAnimTimer = null;
                }, 420);
            }

            this._randomRevealTimer = setTimeout(() => {
                view?.classList.remove('sc-random-revealed');
                this._randomRevealTimer = null;
            }, 1000);
        }
    },

    /**
     * Ré-applique le Spotlight après un re-rendu de la grille (ex: modification d'une fiche élève).
     */
    _syncRandomPickerAfterRefresh() {
        if (!this._isRandomPickerActive()) return;
        this._clearRandomTimers();
        if (!this._isActive || !this._isLocked) {
            this._closeRandomPicker();
            return;
        }
        const pool = this._getRandomPickerPool();
        const currentId = this._randomPickerState?.currentStudentId;
        if (!currentId || !pool.some(s => s.id === currentId)) {
            this._closeRandomPicker();
            return;
        }
        const validIds = new Set(pool.map(s => s.id));
        this._randomPickerState.drawnIds = this._randomPickerState.drawnIds.filter(id => validIds.has(id));
        this._randomPickerState.remainingIds = this._randomPickerState.remainingIds.filter(id => validIds.has(id));
        this._syncRandomPickerUI({ triggerReveal: false, skipScroll: true });
    },

    /**
     * Ferme le tirage au sort, nettoie le Spotlight et replie la capsule flottante.
     * @param {{ fromHistory?: boolean }} [options]
     */
    _closeRandomPicker({ fromHistory = false } = {}) {
        this._clearRandomTimers();

        const wasOpen = Boolean(this._randomPickerState?.active);
        this._randomPickerState = null;

        if (!fromHistory && HistoryManager.isOpen('scRandomPicker')) {
            HistoryManager.handleManualClose('scRandomPicker');
        }

        const { view, actionsCapsule, readout, nameEl, counterEl, randomBtn } = this._getRandomPickerElements();
        view?.classList.remove('sc-random-active', 'sc-random-rolling', 'sc-random-revealed');
        actionsCapsule?.classList.remove('random-open');

        readout?.setAttribute('aria-hidden', 'true');
        if (nameEl) nameEl.textContent = '';
        if (counterEl) counterEl.textContent = '';

        randomBtn?.classList.remove('rolling');
        this._setRandomBtnTooltip(randomBtn, REST_TOOLTIP);

        if (wasOpen) {
            this._clearSpotlight?.('sc-random-active');
        }
    }
};
