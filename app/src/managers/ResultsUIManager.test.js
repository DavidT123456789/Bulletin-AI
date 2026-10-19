/**
 * @fileoverview Tests unitaires pour ResultsUIManager.js (Empty State et renommage in-situ)
 * @module managers/ResultsUIManager.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DOM } from '../utils/DOM.js';
import { appState, userSettings } from '../state/State.js';
import { ClassManager } from './ClassManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { StorageManager } from './StorageManager.js';
import { ResultsUIManager } from './ResultsUIManager.js';

describe('ResultsUIManager - Empty State & In-Situ Class Renaming', () => {
    let mockUI;
    let mockAm;

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="results"></div>
            <div id="empty-state-card" style="display: none;"></div>
            <p id="noResultsMessage" style="display: none;"></p>
            <div id="statsContainer"></div>
            <div id="outputHeader"></div>
            <div id="statsPagination"></div>
            <div id="headerClassName"></div>
            <div id="classDropdownList"></div>
            <input id="searchInput" value="">

            <template id="empty-state-template">
                <div class="empty-state-header">
                    <div class="empty-state-class-pill" id="emptyStateClassPill">
                        <iconify-icon icon="solar:users-group-rounded-linear" class="empty-state-pill-icon"></iconify-icon>
                        <input type="text"
                               class="empty-state-class-input" 
                               id="emptyStateClassInput"
                               value="Nouvelle classe">
                        <button type="button" class="empty-state-edit-btn" id="emptyStateEditBtn"></button>
                    </div>
                    <p class="empty-state-subtitle" id="emptyStateSubtitle">Comment souhaitez-vous ajouter vos élèves ?</p>
                </div>
                <div class="empty-state-hub">
                    <div class="empty-state-hub-card" data-action="individual"></div>
                    <div class="empty-state-hub-card" data-action="mass"></div>
                    <div class="empty-state-hub-card" data-action="photos"></div>
                </div>
            </template>
        `;

        DOM.resultsDiv = document.getElementById('results');
        DOM.emptyStateCard = document.getElementById('empty-state-card');
        DOM.noResultsMessage = document.getElementById('noResultsMessage');
        DOM.statsContainer = document.getElementById('statsContainer');
        DOM.outputHeader = document.getElementById('outputHeader');
        DOM.searchInput = document.getElementById('searchInput');
        DOM.headerClassName = document.getElementById('headerClassName');
        DOM.classDropdownList = document.getElementById('classDropdownList');

        mockUI = {
            showNotification: vi.fn(),
            initTooltips: vi.fn(),
            updateStats: vi.fn(),
            updateControlButtons: vi.fn(),
            updateAIButtonsState: vi.fn(),
            populateLoadStudentSelect: vi.fn(),
            updateActiveFilterInfo: vi.fn(),
            updateHeaderContext: vi.fn()
        };
        mockAm = {};

        ResultsUIManager.init(mockAm, mockUI);

        userSettings.academic.classes = [];
        userSettings.academic.currentClassId = null;
        appState.currentClassId = null;
        appState.generatedResults = [];
        appState.filteredResults = [];
        appState.activeStatFilter = null;
        appState.currentPeriod = 'T1';

        vi.spyOn(StorageManager, 'saveAppState').mockImplementation(() => {});
    });

    it('devrait afficher l\'Empty State avec le nom de la classe active prérempli', () => {
        const cls = ClassManager.createClass('Nouvelle classe');
        appState.currentClassId = cls.id;
        userSettings.academic.currentClassId = cls.id;

        ResultsUIManager.renderResults();

        expect(DOM.emptyStateCard.style.display).toBe('flex');
        const input = DOM.emptyStateCard.querySelector('#emptyStateClassInput');
        expect(input).not.toBeNull();
        expect(input.value).toBe('Nouvelle classe');
    });

    it('devrait mettre à jour le nom de la classe lors de l\'appui sur Entrée', () => {
        const cls = ClassManager.createClass('Nouvelle classe');
        appState.currentClassId = cls.id;
        userSettings.academic.currentClassId = cls.id;

        const updateSpy = vi.spyOn(ClassManager, 'updateClass');
        const headerSpy = vi.spyOn(ClassUIManager, 'updateHeaderDisplay').mockImplementation(() => {});

        ResultsUIManager.renderResults();

        const input = DOM.emptyStateCard.querySelector('#emptyStateClassInput');
        input.value = '6ème B';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        expect(updateSpy).toHaveBeenCalledWith(cls.id, expect.objectContaining({ name: '6ème B' }));
        expect(headerSpy).toHaveBeenCalled();

        updateSpy.mockRestore();
        headerSpy.mockRestore();
    });

    it('devrait mettre à jour le nom de la classe lors du blur si modifié', () => {
        const cls = ClassManager.createClass('Nouvelle classe');
        appState.currentClassId = cls.id;
        userSettings.academic.currentClassId = cls.id;

        const updateSpy = vi.spyOn(ClassManager, 'updateClass');
        ResultsUIManager.renderResults();

        const input = DOM.emptyStateCard.querySelector('#emptyStateClassInput');
        input.value = '4ème 3';
        input.dispatchEvent(new Event('blur'));

        expect(updateSpy).toHaveBeenCalledWith(cls.id, expect.objectContaining({ name: '4ème 3' }));
        updateSpy.mockRestore();
    });

    it('devrait réinitialiser avec le nom courant si le champ est vidé au blur', () => {
        const cls = ClassManager.createClass('3ème 1');
        appState.currentClassId = cls.id;
        userSettings.academic.currentClassId = cls.id;

        const updateSpy = vi.spyOn(ClassManager, 'updateClass');
        ResultsUIManager.renderResults();

        const input = DOM.emptyStateCard.querySelector('#emptyStateClassInput');
        input.value = '   ';
        input.dispatchEvent(new Event('blur'));

        expect(updateSpy).not.toHaveBeenCalled();
        expect(input.value).toBe('3ème 1');
        updateSpy.mockRestore();
    });

    it('devrait annuler les modifications et restaurer le nom lors de l\'appui sur Échap', () => {
        const cls = ClassManager.createClass('5ème A');
        appState.currentClassId = cls.id;
        userSettings.academic.currentClassId = cls.id;

        const updateSpy = vi.spyOn(ClassManager, 'updateClass');
        ResultsUIManager.renderResults();

        const input = DOM.emptyStateCard.querySelector('#emptyStateClassInput');
        input.value = 'NomAnnulé';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(updateSpy).not.toHaveBeenCalled();
        expect(input.value).toBe('5ème A');
        updateSpy.mockRestore();
    });

    it('devrait synchroniser le titre du header en direct lors de la saisie (input event)', () => {
        const cls = ClassManager.createClass('Nouvelle classe');
        appState.currentClassId = cls.id;
        userSettings.academic.currentClassId = cls.id;

        ResultsUIManager.renderResults();

        const input = DOM.emptyStateCard.querySelector('#emptyStateClassInput');
        input.value = '3°1';
        input.dispatchEvent(new Event('input'));

        expect(DOM.headerClassName.textContent).toBe('3ᵉ1');
    });

    it('devrait appliquer highlight-new sur la ligne cible (même après recréation DOM) et nettoyer les classes concurrentes', () => {
        vi.useFakeTimers();
        try {
            const cls = ClassManager.createClass('3ème B');
            appState.currentClassId = cls.id;
            userSettings.academic.currentClassId = cls.id;
            appState.generatedResults = [
                { id: 'stu-1', nom: 'CABAUP', prenom: 'Jean', classId: cls.id, studentData: { periods: { T1: {} } } }
            ];

            ResultsUIManager.renderResults('stu-1', 'new');

            // Simuler un remplacement DOM de la ligne pendant le délai de 100ms (ligne initiale détachée)
            const tbody = DOM.resultsDiv.querySelector('tbody');
            tbody.innerHTML = '<tr class="student-row row-animate-in focus-closed-flash" data-student-id="stu-1" style="--row-delay: 120ms;"><td>CABAUP</td></tr>';
            const liveRow = tbody.querySelector('.student-row');
            liveRow.scrollIntoView = vi.fn();

            vi.advanceTimersByTime(100);

            expect(liveRow.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
            expect(liveRow.classList.contains('highlight-new')).toBe(true);
            expect(liveRow.classList.contains('row-animate-in')).toBe(false);
            expect(liveRow.classList.contains('focus-closed-flash')).toBe(false);
            expect(liveRow.style.getPropertyValue('--row-delay')).toBe('');

            vi.advanceTimersByTime(2200);
            expect(liveRow.classList.contains('highlight-new')).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it('devrait trier par évolution selon l\'écart exact de points et garder les élèves sans note en fin de liste (asc et desc)', () => {
        const cls = ClassManager.createClass('3ème B');
        appState.currentClassId = cls.id;
        userSettings.academic.currentClassId = cls.id;
        appState.currentPeriod = 'T2';
        appState.generatedResults = [
            { id: 'small-plus', nom: 'ALPHA', prenom: 'A', classId: cls.id, studentData: { periods: { T1: { grade: 10 }, T2: { grade: 10.6 } } } },
            { id: 'no-grade', nom: 'BETA', prenom: 'B', classId: cls.id, studentData: { periods: { T1: { grade: 12 }, T2: { grade: null } } } },
            { id: 'big-plus', nom: 'GAMMA', prenom: 'C', classId: cls.id, studentData: { periods: { T1: { grade: 10 }, T2: { grade: 12.4 } } } },
            { id: 'minus', nom: 'DELTA', prenom: 'D', classId: cls.id, studentData: { periods: { T1: { grade: 14 }, T2: { grade: 12.5 } } } }
        ];

        appState.sortState = { field: 'evolution', direction: 'desc', param: 'T2' };
        ResultsUIManager.renderResults();
        expect(appState.filteredResults.map(r => r.id)).toEqual(['big-plus', 'small-plus', 'minus', 'no-grade']);

        appState.sortState = { field: 'evolution', direction: 'asc', param: 'T2' };
        ResultsUIManager.renderResults();
        expect(appState.filteredResults.map(r => r.id)).toEqual(['minus', 'small-plus', 'big-plus', 'no-grade']);
    });
});


