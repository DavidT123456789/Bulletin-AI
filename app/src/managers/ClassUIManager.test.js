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
            <div id="classDropdownTitle"></div>
            <div id="classDropdownVirtualSubbar" class="class-dropdown-subbar" style="display: none;"></div>
            <div id="classDropdownList" class="class-dropdown-list"></div>
            <div id="headerClassName"></div>
            <div id="headerClassTag" style="display: none;"></div>
            <div id="headerVirtualClassTag" style="display: none;"></div>
            <div id="headerStudentCount"></div>
        `;

        DOM.classDropdownTitle = document.getElementById('classDropdownTitle');
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

    it('devrait afficher la sous-barre avec le bouton de filtre lorsque des classes reconstituées existent', () => {
        const group1 = ClassManager.createClass('3 TECHNOLOGIE G1');
        const group2 = ClassManager.createClass('3 TECHNOLOGIE G2');

        appState.generatedResults = [
            { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: group1.id, studentData: { classe: '3 1' } },
            { id: 's2', nom: 'MARTIN', prenom: 'Bob', classId: group2.id, studentData: { classe: '3 1' } }
        ];

        ClassUIManager.renderClassList();

        expect(DOM.classDropdownVirtualSubbar.style.display).toBe('flex');
        const toggleBtn = document.getElementById('toggleVirtualClassesBtn');
        expect(toggleBtn).not.toBeNull();
        expect(toggleBtn.textContent).toContain('Reconstituées');
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

    it('devrait harmoniser le badge des effectifs avec le format "X él."', () => {
        const class1 = ClassManager.createClass('4 1');
        appState.generatedResults = [
            { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: class1.id }
        ];

        ClassUIManager.renderClassList();

        const badge = DOM.classDropdownList.querySelector(`.class-progress-badge[data-class-id="${class1.id}"]`);
        expect(badge.innerHTML).toContain('1 él.');
    });
});
