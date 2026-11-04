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
            <div id="statsPagination"></div>
            <div id="headerClassName"></div>
            <div id="classDropdownList"></div>

            <template id="empty-state-template">
                <div class="empty-state-header">
                    <div class="empty-state-class-pill" id="emptyStateClassPill">
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
        DOM.headerClassName = document.getElementById('headerClassName');
        DOM.classDropdownList = document.getElementById('classDropdownList');

        mockUI = {
            showNotification: vi.fn(),
            initTooltips: vi.fn(),
            updateStats: vi.fn(),
            updateControlButtons: vi.fn(),
            updateAIButtonsState: vi.fn(),
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
        appState.searchQuery = '';
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

    it('devrait sélectionner tout le texte au premier clic sur le titre, sans forcer la sélection au second clic en cours d\'édition', () => {
        const cls = ClassManager.createClass('Nouvelle classe');
        appState.currentClassId = cls.id;
        userSettings.academic.currentClassId = cls.id;

        ResultsUIManager.renderResults();

        const input = DOM.emptyStateCard.querySelector('#emptyStateClassInput');
        const selectSpy = vi.spyOn(input, 'select');

        // 1er clic (champ non focalisé au mousedown) -> sélection complète
        input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        input.focus();
        input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(selectSpy).toHaveBeenCalledTimes(1);

        // 2e clic (champ déjà focalisé au mousedown) -> placement libre du curseur sans re-sélectionner tout
        input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(selectSpy).toHaveBeenCalledTimes(1);
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
        expect(Array.from(DOM.resultsDiv.querySelectorAll('.student-row')).map(tr => tr.dataset.studentId))
            .toEqual(['big-plus', 'small-plus', 'minus', 'no-grade']);

        appState.sortState = { field: 'evolution', direction: 'asc', param: 'T2' };
        ResultsUIManager.renderResults();
        expect(appState.filteredResults.map(r => r.id)).toEqual(['minus', 'small-plus', 'big-plus', 'no-grade']);
        expect(Array.from(DOM.resultsDiv.querySelectorAll('.student-row')).map(tr => tr.dataset.studentId))
            .toEqual(['minus', 'small-plus', 'big-plus', 'no-grade']);
    });

    it('devrait filtrer les élèves via appState.searchQuery et gérer les filtres statistiques sans .output-toolbar', async () => {
        const { UI } = await import('./UIManager.js');
        const cls = ClassManager.createClass('3ème B');
        appState.currentClassId = cls.id;
        userSettings.academic.currentClassId = cls.id;
        appState.generatedResults = [
            { id: 'stu-1', nom: 'DUPONT', prenom: 'Alice', classId: cls.id, studentData: { periods: { T1: { grade: 15 } } } },
            { id: 'stu-2', nom: 'MARTIN', prenom: 'Bob', classId: cls.id, studentData: { periods: { T1: { grade: 9 } } } }
        ];

        appState.searchQuery = 'dupont';
        ResultsUIManager.renderResults();
        expect(appState.filteredResults.map(r => r.id)).toEqual(['stu-1']);

        appState.searchQuery = '';
        ResultsUIManager.renderResults();
        expect(appState.filteredResults.map(r => r.id)).toEqual(['stu-1', 'stu-2']);

        // Vérifier que UI.updateActiveFilterInfo restaure .active-filter et ajoute .filter-close-btn sans #activeFilterInfo
        DOM.statsContainer.innerHTML = '<div class="hist-bar-group" data-filter-id="gradeRange_12-16"></div>';
        appState.activeStatFilter = 'gradeRange_12-16';
        UI.updateActiveFilterInfo();

        const bar = DOM.statsContainer.querySelector('[data-filter-id="gradeRange_12-16"]');
        expect(bar.classList.contains('active-filter')).toBe(true);
        expect(bar.querySelector('.filter-close-btn')).not.toBeNull();

        appState.activeStatFilter = null;
        UI.updateActiveFilterInfo();
        expect(bar.querySelector('.filter-close-btn')).toBeNull();
    });

    it('devrait traiter regenerateDirty dans l\'ordre de tri visuel actif et non dans l\'ordre brut de generatedResults', async () => {
        const cls = ClassManager.createClass('3ème B');
        appState.currentClassId = cls.id;
        userSettings.academic.currentClassId = cls.id;
        appState.currentPeriod = 'T1';
        appState.sortState = { field: 'name', direction: 'asc' };

        // Ordre brut non alphabétique (simulant le tri par ID aléatoire au chargement IndexedDB)
        appState.generatedResults = [
            { id: 'stu-z', nom: 'PETIT', prenom: 'Emma', classId: cls.id, errorMessage: 'Erreur IA', errorPeriod: 'T1', studentData: { nom: 'PETIT', prenom: 'Emma', periods: { T1: { grade: 10 } } } },
            { id: 'stu-a', nom: 'BERNARD', prenom: 'Thomas', classId: cls.id, errorMessage: 'Erreur IA', errorPeriod: 'T1', studentData: { nom: 'BERNARD', prenom: 'Thomas', periods: { T1: { grade: 15 } } } },
            { id: 'stu-m', nom: 'DURAND', prenom: 'Sophie', classId: cls.id, errorMessage: 'Erreur IA', errorPeriod: 'T1', studentData: { nom: 'DURAND', prenom: 'Sophie', periods: { T1: { grade: 12 } } } }
        ];

        const { ListViewManager } = await import('./ListViewManager.js');
        vi.spyOn(ListViewManager, 'setRowStatus').mockImplementation(() => {});
        vi.spyOn(ListViewManager, 'updateRow').mockResolvedValue();

        const processedNames = [];
        mockAm.generateAppreciation = vi.fn().mockImplementation(async (sd) => {
            processedNames.push(sd.nom);
            return { nom: sd.nom, prenom: sd.prenom, appreciation: 'OK', studentData: sd };
        });
        mockUI.showHeaderProgress = vi.fn();
        mockUI.hideHeaderProgress = vi.fn();
        let confirmPromise;
        mockUI.showCustomConfirm = vi.fn((_msg, onConfirm) => {
            confirmPromise = onConfirm();
        });

        await ResultsUIManager.regenerateDirty();
        await confirmPromise;

        expect(processedNames).toEqual(['BERNARD', 'DURAND', 'PETIT']);
        vi.restoreAllMocks();
    });

    it('devrait conserver et atténuer le texte existant (.is-queued) lors du passage en file d\'attente (pending-skeleton)', async () => {
        const { ListViewManager } = await import('./ListViewManager.js');
        document.body.innerHTML = `
            <table>
                <tbody>
                    <tr class="student-row" data-student-id="s-with-text">
                        <td class="appreciation-cell">
                            <div class="appreciation-preview-wrapper">
                                <div class="appreciation-preview">Texte existant conservé</div>
                            </div>
                        </td>
                        <td><button class="btn-action-menu"></button></td>
                    </tr>
                    <tr class="student-row" data-student-id="s-empty">
                        <td class="appreciation-cell"><span class="status-badge pending">En attente</span></td>
                        <td><button class="btn-action-menu"></button></td>
                    </tr>
                </tbody>
            </table>
        `;

        ListViewManager.setRowStatus('s-with-text', 'pending-skeleton');
        const cellWithText = document.querySelector('[data-student-id="s-with-text"] .appreciation-cell');
        expect(cellWithText.querySelector('.appreciation-preview')?.textContent).toBe('Texte existant conservé');
        expect(cellWithText.querySelector('.appreciation-preview-wrapper')?.classList.contains('is-queued')).toBe(true);
        expect(cellWithText.querySelector('.generating-badge.pending')?.textContent).toContain('En file');
        expect(cellWithText.querySelector('.appreciation-skeleton')).toBeNull();

        ListViewManager.setRowStatus('s-empty', 'pending-skeleton');
        const cellEmpty = document.querySelector('[data-student-id="s-empty"] .appreciation-cell');
        expect(cellEmpty.querySelector('.appreciation-skeleton')).not.toBeNull();
    });
});


