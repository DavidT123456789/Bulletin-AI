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
});

