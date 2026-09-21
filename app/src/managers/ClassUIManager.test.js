/**
 * @fileoverview Tests unitaires pour ClassUIManager.js
 * @module managers/ClassUIManager.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DOM } from '../utils/DOM.js';
import { appState, userSettings } from '../state/State.js';
import { ClassManager } from './ClassManager.js';
import { ClassUIManager } from './ClassUIManager.js';

describe('ClassUIManager - Liste des classes et classes reconstituées', () => {
    beforeEach(() => {
        // Reset DOM elements
        document.body.innerHTML = `
            <div class="class-dropdown-title-group">
                <div id="classDropdownTitle"></div>
                <button type="button" class="class-virtual-filter-btn" id="toggleVirtualClassesBtn" style="display: none;">
                    <iconify-icon icon="solar:diploma-linear"></iconify-icon>
                    <span class="filter-count">0</span>
                </button>
            </div>
            <div id="classDropdownVirtualSubbar" class="class-dropdown-subbar" style="display: none;"></div>
            <div id="classDropdownList" class="class-dropdown-list"></div>
            <div id="headerClassName"></div>
            <div id="headerClassTag" style="display: none;"></div>
            <div id="headerVirtualClassTag" style="display: none;"></div>
            <div id="headerStudentCount"></div>
        `;

        DOM.classDropdownTitle = document.getElementById('classDropdownTitle');
        DOM.toggleVirtualClassesBtn = document.getElementById('toggleVirtualClassesBtn');
        DOM.classDropdownVirtualSubbar = document.getElementById('classDropdownVirtualSubbar');
        DOM.classDropdownList = document.getElementById('classDropdownList');
        DOM.headerClassName = document.getElementById('headerClassName');
        DOM.headerClassTag = document.getElementById('headerClassTag');
        DOM.headerVirtualClassTag = document.getElementById('headerVirtualClassTag');
        DOM.headerStudentCount = document.getElementById('headerStudentCount');

        // Reset state
        userSettings.academic.classes = [];
        userSettings.academic.currentClassId = null;
        appState.currentClassId = null;
        appState.generatedResults = [];
        appState.filteredResults = [];
        localStorage.clear();
        ClassUIManager._showVirtualClasses = true;
    });

    it('devrait afficher la pastille compacte de filtre dans l\'en-tête lorsque des classes reconstituées existent', () => {
        const group1 = ClassManager.createClass('3 TECHNOLOGIE G1');
        const group2 = ClassManager.createClass('3 TECHNOLOGIE G2');

        appState.generatedResults = [
            { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: group1.id, studentData: { classe: '3 1' } },
            { id: 's2', nom: 'MARTIN', prenom: 'Bob', classId: group2.id, studentData: { classe: '3 1' } }
        ];

        ClassUIManager.renderClassList();

        const toggleBtn = document.getElementById('toggleVirtualClassesBtn');
        expect(toggleBtn).not.toBeNull();
        expect(toggleBtn.style.display).toBe('inline-flex');
        expect(toggleBtn.textContent).toContain('1'); // 1 classe reconstituée (3ᵉ1)
    });

    it('devrait basculer automatiquement sur le groupe source si on masque les classes alors qu\'une classe reconstituée est active', async () => {
        const group1 = ClassManager.createClass('3 TECHNOLOGIE G1');
        appState.generatedResults = [
            { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: group1.id, studentData: { classe: '3 1' } }
        ];

        // Activer la classe virtuelle 3ᵉ1
        await ClassManager.switchClass('virtual_31');
        expect(appState.currentClassId).toBe('virtual_31');

        const switchSpy = vi.spyOn(ClassUIManager, 'handleClassSwitch').mockResolvedValue();

        ClassUIManager._showVirtualClasses = true;
        ClassUIManager.renderClassList();

        const toggleBtn = document.getElementById('toggleVirtualClassesBtn');
        toggleBtn.click();

        expect(switchSpy).toHaveBeenCalledWith(group1.id);
        switchSpy.mockRestore();
    });

    it('devrait trier naturellement les classes réelles et reconstituées par ordre alphabétique', () => {
        // Groupes en 3e et classe en 4e
        const group1 = ClassManager.createClass('3 TECHNOLOGIE G1');
        const group2 = ClassManager.createClass('3 TECHNOLOGIE G2');
        const class41 = ClassManager.createClass('4 1');

        appState.generatedResults = [
            { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: group1.id, studentData: { classe: '3 1' } },
            { id: 's2', nom: 'MARTIN', prenom: 'Bob', classId: group2.id, studentData: { classe: '3 1' } }
        ];

        ClassUIManager.renderClassList();

        const itemNames = Array.from(DOM.classDropdownList.querySelectorAll('.class-name'))
            .map(el => el.textContent.trim());

        // Doit avoir 3ᵉ1 (reconstituée), 3ᵉG1, 3ᵉG2, 4ᵉ1 dans l'ordre naturel
        expect(itemNames[0]).toContain('3ᵉ1');
        expect(itemNames[0]).toContain('Reconstituée');
        expect(itemNames[1]).toContain('3ᵉG1');
        expect(itemNames[2]).toContain('3ᵉG2');
        expect(itemNames[3]).toContain('4ᵉ1');
    });

    it('devrait masquer les classes reconstituées si le filtre est désactivé', () => {
        const group1 = ClassManager.createClass('3 G1');
        appState.generatedResults = [
            { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: group1.id, studentData: { classe: '3 1' } }
        ];

        ClassUIManager._showVirtualClasses = false;
        ClassUIManager.renderClassList();

        const virtualItems = DOM.classDropdownList.querySelectorAll('.class-dropdown-item--virtual');
        expect(virtualItems.length).toBe(1);
        expect(virtualItems[0].classList.contains('is-collapsed')).toBe(true);
        expect(virtualItems[0].getAttribute('tabindex')).toBe('-1');
        expect(virtualItems[0].getAttribute('aria-hidden')).toBe('true');

        const visibleVirtualItems = DOM.classDropdownList.querySelectorAll('.class-dropdown-item--virtual:not(.is-collapsed)');
        expect(visibleVirtualItems.length).toBe(0);

        const regularItems = DOM.classDropdownList.querySelectorAll('.class-dropdown-item:not(.class-dropdown-item--virtual)');
        expect(regularItems.length).toBe(1);
    });

    it('devrait animer le déploiement et le repli des classes reconstituées lors du clic sur le bouton filtre', () => {
        const group1 = ClassManager.createClass('3 G1');
        const group2 = ClassManager.createClass('3 G2');
        appState.generatedResults = [
            { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: group1.id, studentData: { classe: '3 1' } },
            { id: 's2', nom: 'MARTIN', prenom: 'Bob', classId: group2.id, studentData: { classe: '3 1' } }
        ];

        // Initialement masqué
        ClassUIManager._showVirtualClasses = false;
        ClassUIManager.renderClassList();

        const toggleBtn = document.getElementById('toggleVirtualClassesBtn');
        const virtualItem = DOM.classDropdownList.querySelector('.class-dropdown-item--virtual');
        expect(virtualItem.classList.contains('is-collapsed')).toBe(true);

        // 1. Déploiement (clic pour afficher)
        toggleBtn.click();
        expect(ClassUIManager._showVirtualClasses).toBe(true);
        expect(virtualItem.classList.contains('is-collapsed')).toBe(false);
        expect(virtualItem.getAttribute('tabindex')).toBe('0');
        expect(virtualItem.hasAttribute('aria-hidden')).toBe(false);
        expect(toggleBtn.classList.contains('active')).toBe(true);

        // 2. Rangement / Repli (clic pour masquer)
        toggleBtn.click();
        expect(ClassUIManager._showVirtualClasses).toBe(false);
        expect(virtualItem.classList.contains('is-collapsed')).toBe(true);
        expect(virtualItem.getAttribute('tabindex')).toBe('-1');
        expect(virtualItem.getAttribute('aria-hidden')).toBe('true');
        expect(toggleBtn.classList.contains('active')).toBe(false);
    });

    it('devrait afficher l\'icône de groupe et l\'effectif dans le badge', () => {
        const class1 = ClassManager.createClass('4 1');
        appState.generatedResults = [
            { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: class1.id }
        ];

        ClassUIManager.renderClassList();

        const badge = DOM.classDropdownList.querySelector(`.class-progress-badge[data-class-id="${class1.id}"]`);
        expect(badge.innerHTML).toContain('users-group-rounded-linear');
        expect(badge.textContent.trim()).toBe('1');
    });
});

describe('ClassUIManager - Création instantanée et renommage in-situ', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="classDropdown" class="class-dropdown"></div>
            <div id="classDropdownList" class="class-dropdown-list"></div>
            <div id="headerClassName"></div>
            <div id="headerClassChip"></div>
            <div id="empty-state-card" style="display: none;">
                <input id="emptyStateClassInput" value="Nouvelle classe">
                <button id="emptyStateEditBtn"></button>
                <div class="empty-state-class-pill"></div>
            </div>
            <template id="empty-state-template">
                <div class="empty-state-header">
                    <div class="empty-state-class-pill">
                        <input id="emptyStateClassInput" value="Nouvelle classe">
                        <button id="emptyStateEditBtn"></button>
                    </div>
                </div>
                <div class="empty-state-hub"></div>
            </template>
        `;
        DOM.classDropdown = document.getElementById('classDropdown');
        DOM.classDropdownList = document.getElementById('classDropdownList');
        DOM.headerClassName = document.getElementById('headerClassName');
        DOM.headerClassChip = document.getElementById('headerClassChip');
        DOM.emptyStateCard = document.getElementById('empty-state-card');

        userSettings.academic.classes = [];
        userSettings.academic.currentClassId = null;
        appState.currentClassId = null;
        appState.generatedResults = [];
    });

    it('devrait créer immédiatement une classe générique et basculer vers elle', async () => {
        const switchSpy = vi.spyOn(ClassUIManager, 'handleClassSwitch').mockResolvedValue();
        const focusSpy = vi.spyOn(ClassUIManager, 'focusEmptyStateInput').mockImplementation(() => {});

        const created = await ClassUIManager.createNewClassAndSwitch({ autoFocusInput: true });

        expect(created).not.toBeNull();
        expect(created.name).toBe('Nouvelle classe');
        expect(switchSpy).toHaveBeenCalledWith(created.id);
        expect(focusSpy).toHaveBeenCalled();

        switchSpy.mockRestore();
        focusSpy.mockRestore();
    });

    it('devrait réutiliser la classe courante si elle est déjà vide avec un nom par défaut', async () => {
        const emptyClass = ClassManager.createClass('Nouvelle classe');
        appState.currentClassId = emptyClass.id;
        userSettings.academic.currentClassId = emptyClass.id;

        const switchSpy = vi.spyOn(ClassUIManager, 'handleClassSwitch').mockResolvedValue();
        const focusSpy = vi.spyOn(ClassUIManager, 'focusEmptyStateInput').mockImplementation(() => {});

        const result = await ClassUIManager.createNewClassAndSwitch({ autoFocusInput: true });

        expect(result.id).toBe(emptyClass.id);
        // Ne doit pas avoir créé une 2e classe
        expect(ClassManager.getAllClasses().length).toBe(1);
        expect(switchSpy).not.toHaveBeenCalled();
        expect(focusSpy).toHaveBeenCalled();

        switchSpy.mockRestore();
        focusSpy.mockRestore();
    });

    it('devrait incrémenter le numéro si "Nouvelle classe" existe déjà avec des élèves', async () => {
        const class1 = ClassManager.createClass('Nouvelle classe');
        appState.generatedResults = [{ id: 's1', classId: class1.id }];

        const switchSpy = vi.spyOn(ClassUIManager, 'handleClassSwitch').mockResolvedValue();
        vi.spyOn(ClassUIManager, 'focusEmptyStateInput').mockImplementation(() => {});

        const result = await ClassUIManager.createNewClassAndSwitch();

        expect(result.name).toBe('Nouvelle classe 2');
        expect(ClassManager.getAllClasses().length).toBe(2);

        switchSpy.mockRestore();
    });

    it('devrait rediriger showNewClassPrompt vers createNewClassAndSwitch', async () => {
        const createSpy = vi.spyOn(ClassUIManager, 'createNewClassAndSwitch').mockResolvedValue({ id: 'c1' });

        await ClassUIManager.showNewClassPrompt();

        expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ autoFocusInput: false }));
        createSpy.mockRestore();
    });
});

