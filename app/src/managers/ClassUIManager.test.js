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
            <div id="headerVirtualClassTag" style="display: none;"></div>
            <div id="headerStudentCount"></div>
        `;

        DOM.classDropdownTitle = document.getElementById('classDropdownTitle');
        DOM.toggleVirtualClassesBtn = document.getElementById('toggleVirtualClassesBtn');
        DOM.classDropdownVirtualSubbar = document.getElementById('classDropdownVirtualSubbar');
        DOM.classDropdownList = document.getElementById('classDropdownList');
        DOM.headerClassName = document.getElementById('headerClassName');
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

        it('devrait trier selon le cycle pédagogique officiel (4ᵉ avant 3ᵉ) avec les classes reconstituées', () => {
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

        // Ordre pédagogique officiel : 4ᵉ1 avant le niveau 3ᵉ
        expect(itemNames[0]).toContain('4ᵉ1');
        expect(itemNames[1]).toContain('3ᵉ1');
        expect(itemNames[1]).toContain('Reconstituée');
        expect(itemNames[2]).toContain('3ᵉG1');
        expect(itemNames[3]).toContain('3ᵉG2');
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

describe('ClassUIManager - Animations verticales directionnelles de changement de classe', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="headerClassChip"><span id="headerClassName"></span></div>
            <div id="classDropdown"><div id="classDropdownList"></div></div>
            <div id="outputList"></div>
        `;
        DOM.classDropdown = document.getElementById('classDropdown');
        DOM.classDropdownList = document.getElementById('classDropdownList');
        DOM.headerClassName = document.getElementById('headerClassName');
        DOM.headerClassChip = document.getElementById('headerClassChip');

        userSettings.academic.classes = [];
        userSettings.academic.classesCustomOrder = false;
        userSettings.academic.classesSortDirection = 'asc';
        userSettings.academic.currentClassId = null;
        appState.currentClassId = null;
        appState.generatedResults = [];
    });

    it('devrait retourner "down" (haut vers le bas) quand on sélectionne une classe située au-dessus dans la liste et "up" quand elle est en dessous', () => {
        const class6A = ClassManager.createClass('6 1');
        const class5A = ClassManager.createClass('5 1');
        const class4A = ClassManager.createClass('4 1');

        ClassUIManager.renderClassList();

        // De 5e vers 6e (au-dessus dans la liste) -> glisse du haut vers le bas ('down')
        expect(ClassUIManager._getClassSwitchDirection(class5A.id, class6A.id)).toBe('down');

        // De 5e vers 4e (en dessous dans la liste) -> glisse du bas vers le haut ('up')
        expect(ClassUIManager._getClassSwitchDirection(class5A.id, class4A.id)).toBe('up');
    });

    it('devrait appliquer les classes CSS directionnelles (out puis in) lors de handleClassSwitch', async () => {
        vi.useFakeTimers();
        const { AppreciationsManager } = await import('./AppreciationsManager.js');
        const renderSpy = vi.spyOn(AppreciationsManager, 'renderResults').mockImplementation(() => {});

        const class6A = ClassManager.createClass('6 1');
        const class5A = ClassManager.createClass('5 1');

        await ClassManager.switchClass(class5A.id);
        ClassUIManager.renderClassList();

        const outputList = document.getElementById('outputList');
        const crossResults = document.createElement('div');
        crossResults.id = 'crossClassResults';
        crossResults.className = 'cross-class-results visible';
        outputList.parentNode.appendChild(crossResults);

        const switchPromise = ClassUIManager.handleClassSwitch(class6A.id);

        // Phase 1 : sortie vers le bas (car 6e est au-dessus de 5e)
        expect(outputList.classList.contains('class-switch-out-down')).toBe(true);
        expect(crossResults.classList.contains('class-switch-out-down')).toBe(true);
        expect(DOM.headerClassName.classList.contains('header-class-out-down')).toBe(true);

        await vi.advanceTimersByTimeAsync(110);
        await switchPromise;

        // Phase 2 : entrée depuis le haut vers le bas, et #crossClassResults nettoyé de class-switch-out-down
        expect(outputList.classList.contains('class-switch-in-down')).toBe(true);
        expect(crossResults.classList.contains('visible')).toBe(false);
        expect(crossResults.classList.contains('class-switch-out-down')).toBe(false);
        expect(DOM.headerClassName.classList.contains('header-class-in-down')).toBe(true);

        // Nettoyage après la fin de l'animation
        await vi.advanceTimersByTimeAsync(260);
        expect(outputList.classList.contains('class-switch-in-down')).toBe(false);
        expect(DOM.headerClassName.classList.contains('header-class-in-down')).toBe(false);

        renderSpy.mockRestore();
        vi.useRealTimers();
    });
});

describe('ClassUIManager - Modale Mes classes (UX/UI)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        userSettings.academic.classes = [];
        userSettings.academic.classesCustomOrder = false;
        userSettings.academic.classesSortDirection = 'asc';
        userSettings.academic.currentClassId = null;
        appState.currentClassId = null;
        appState.generatedResults = [];
    });

    it('devrait marquer la ligne active (.active-switch), mutualiser l\'année dans le sous-titre et épurer les classes vides', async () => {
        const class5A = ClassManager.createClass('5 1', '2026-2027');
        const emptyClass = ClassManager.createClass('Nouvelle classe', '2026-2027');

        await ClassManager.switchClass(class5A.id);
        appState.generatedResults = [
            { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: class5A.id, appreciation: 'Très bon trimestre.', generationPeriod: appState.currentPeriod }
        ];

        ClassUIManager.showManageClassesModal();

        const modal = document.getElementById('classManagementModal');
        expect(modal).not.toBeNull();

        const subtitle = modal.querySelector('.modal-subtitle');
        expect(subtitle.textContent).toBe('2 classes • 1 élève • 2026-2027');

        const activeRow = modal.querySelector(`.class-management-item[data-class-id="${class5A.id}"]`);
        expect(activeRow.classList.contains('active-switch')).toBe(true);
        expect(activeRow.getAttribute('aria-selected')).toBe('true');
        expect(activeRow.querySelector('.class-active-badge')).toBeNull();
        expect(activeRow.querySelector('.class-management-meta').textContent).toContain('1/1 appréciation');

        const emptyRow = modal.querySelector(`.class-management-item[data-class-id="${emptyClass.id}"]`);
        expect(emptyRow.classList.contains('active-switch')).toBe(false);
        expect(emptyRow.querySelector('.class-stat-badge')).toBeNull();
        expect(emptyRow.querySelector('.meta-empty-state')?.textContent.trim()).toBe('Aucun élève');
    });

    it('devrait utiliser .inline-field-input sans .custom-input lors du renommage in-situ', async () => {
        const class5A = ClassManager.createClass('5 1', '2026-2027');
        await ClassManager.switchClass(class5A.id);

        ClassUIManager.showManageClassesModal();

        const modal = document.getElementById('classManagementModal');
        const renameBtn = modal.querySelector(`.manage-rename-btn[data-class-id="${class5A.id}"]`);
        renameBtn.click();

        const renameInput = modal.querySelector('.in-situ-rename-input');
        expect(renameInput).not.toBeNull();
        expect(renameInput.classList.contains('inline-field-input')).toBe(true);
        expect(renameInput.classList.contains('custom-input')).toBe(false);
    });

    it('devrait basculer dynamiquement le bouton de tri entre (3ᵉ → 6ᵉ) et (6ᵉ → 3ᵉ)', () => {
        const class51 = ClassManager.createClass('5 1', '2026-2027');
        const class52 = ClassManager.createClass('5 2', '2026-2027');
        const class41 = ClassManager.createClass('4 1', '2026-2027');

        ClassUIManager.showManageClassesModal();
        const modal = document.getElementById('classManagementModal');

        // Par défaut, la liste est déjà en ordre croissant (5e1, 5e2, 4e1) : le bouton propose l'ordre inverse (3e -> 6e)
        let sortBtn = modal.querySelector('#sortClassesPedagogicalBtn');
        expect(sortBtn).not.toBeNull();
        expect(sortBtn.textContent).toContain('Trier par niveau (3ᵉ → 6ᵉ)');

        // Clic pour trier en sens décroissant (4e1, 5e1, 5e2)
        sortBtn.click();

        let renderedIds = [...modal.querySelectorAll('.class-management-item')].map(el => el.dataset.classId);
        expect(renderedIds).toEqual([class41.id, class51.id, class52.id]);
        expect(userSettings.academic.classesSortDirection).toBe('desc');

        // Le menu propose désormais de revenir au tri croissant (6e -> 3e)
        sortBtn = modal.querySelector('#sortClassesPedagogicalBtn');
        expect(sortBtn.textContent).toContain('Trier par niveau (6ᵉ → 3ᵉ)');

        sortBtn.click();

        renderedIds = [...modal.querySelectorAll('.class-management-item')].map(el => el.dataset.classId);
        expect(renderedIds).toEqual([class51.id, class52.id, class41.id]);
        expect(userSettings.academic.classesSortDirection).toBe('asc');
    });
});

describe('ClassUIManager - Cycle d\'ouverture/fermeture du dropdown et isolation des tooltips', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="headerWrapper" class="class-selector-wrapper">
                <button id="headerClassChip"><span id="headerClassName"></span></button>
                <div id="classDropdown" class="class-dropdown">
                    <div id="classDropdownList" class="class-dropdown-list"></div>
                </div>
            </div>
        `;
        DOM.headerClassChip = document.getElementById('headerClassChip');
        DOM.headerClassName = document.getElementById('headerClassName');
        DOM.classDropdown = document.getElementById('classDropdown');
        DOM.classDropdownList = document.getElementById('classDropdownList');

        ClassUIManager._isDropdownOpen = false;
        ClassUIManager._originalDropdownParent = null;
        if (ClassUIManager._closeDropdownTimer) {
            clearTimeout(ClassUIManager._closeDropdownTimer);
            ClassUIManager._closeDropdownTimer = null;
        }
        userSettings.academic.classes = [];
        userSettings.academic.currentClassId = null;
        appState.currentClassId = null;
        appState.generatedResults = [];
    });

    it('devrait préserver _originalDropdownParent lors d\'une réouverture rapide avant la fin du délai de fermeture (200ms)', () => {
        vi.useFakeTimers();
        const headerWrapper = document.getElementById('headerWrapper');
        ClassManager.createClass('3 1');

        // 1. Première ouverture -> téléporté dans body
        ClassUIManager.openDropdown();
        expect(DOM.classDropdown.parentElement).toBe(document.body);
        expect(ClassUIManager._originalDropdownParent).toBe(headerWrapper);

        // 2. Fermeture suivie d'une réouverture rapide à 50ms (< 200ms)
        ClassUIManager.closeDropdown();
        vi.advanceTimersByTime(50);
        ClassUIManager.openDropdown();

        // Après 250ms, le timer de la première fermeture a dû être annulé et _originalDropdownParent préservé
        vi.advanceTimersByTime(250);
        expect(ClassUIManager._isDropdownOpen).toBe(true);
        expect(DOM.classDropdown.style.display).toBe('block');
        expect(ClassUIManager._originalDropdownParent).toBe(headerWrapper);

        // 3. Fermeture complète -> retour dans son parent d'origine (#headerWrapper)
        ClassUIManager.closeDropdown();
        vi.advanceTimersByTime(250);
        expect(DOM.classDropdown.parentElement).toBe(headerWrapper);
        expect(DOM.classDropdown.style.display).toBe('none');

        vi.useRealTimers();
    });

    it('devrait restreindre TooltipsUI.initTooltips au conteneur DOM.classDropdown lors de renderClassList', async () => {
        const { TooltipsUI } = await import('./TooltipsManager.js');
        const initSpy = vi.spyOn(TooltipsUI, 'initTooltips').mockImplementation(() => {});

        ClassManager.createClass('4 2');
        ClassUIManager.renderClassList();

        expect(initSpy).toHaveBeenCalledWith(DOM.classDropdown);
        initSpy.mockRestore();
    });

    it('devrait mettre à jour les items et icônes en place sans détruire le DOM lors des appels successifs à renderClassList / openDropdown', async () => {
        const class1 = ClassManager.createClass('5 1');
        const class2 = ClassManager.createClass('5 2');
        appState.generatedResults = [
            { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: class1.id }
        ];

        ClassUIManager.renderClassList();

        const firstItemBefore = DOM.classDropdownList.querySelector(`.class-dropdown-item[data-class-id="${class1.id}"]`);
        const calendarIconBefore = firstItemBefore.querySelector('.class-meta-year iconify-icon');
        const seatingIconBefore = firstItemBefore.querySelector('.class-seating-badge iconify-icon');
        const progressIconBefore = firstItemBefore.querySelector('.class-progress-badge iconify-icon');

        // Changement de classe active et d'effectif, puis réouverture du menu
        await ClassManager.switchClass(class2.id);
        appState.generatedResults.push({ id: 's2', nom: 'MARTIN', prenom: 'Bob', classId: class1.id });
        ClassUIManager.openDropdown();

        const firstItemAfter = DOM.classDropdownList.querySelector(`.class-dropdown-item[data-class-id="${class1.id}"]`);
        const secondItemAfter = DOM.classDropdownList.querySelector(`.class-dropdown-item[data-class-id="${class2.id}"]`);

        // Les nœuds DOM et les Web Components <iconify-icon> sont strictement préservés (pas de réinitialisation innerHTML)
        expect(firstItemAfter).toBe(firstItemBefore);
        expect(firstItemAfter.querySelector('.class-meta-year iconify-icon')).toBe(calendarIconBefore);
        expect(firstItemAfter.querySelector('.class-seating-badge iconify-icon')).toBe(seatingIconBefore);
        expect(firstItemAfter.querySelector('.class-progress-badge iconify-icon')).toBe(progressIconBefore);

        // Les états et compteurs sont bien mis à jour en place
        expect(firstItemAfter.classList.contains('active')).toBe(false);
        expect(secondItemAfter.classList.contains('active')).toBe(true);
        expect(firstItemAfter.querySelector('.progress-count-value').textContent).toBe('2');
    });

    it('devrait préserver le Web Component <iconify-icon> du header et rafraîchir les compteurs du dropdown en place lors de updateHeaderDisplay / updateStudentCount', async () => {
        DOM.headerClassIcon = document.createElement('span');
        document.body.appendChild(DOM.headerClassIcon);

        const class1 = ClassManager.createClass('4 1');
        const class2 = ClassManager.createClass('4 2');
        await ClassManager.switchClass(class1.id);

        ClassUIManager.renderClassList();
        ClassUIManager.updateHeaderDisplay();

        const headerIconBefore = DOM.headerClassIcon.querySelector('iconify-icon');
        expect(headerIconBefore).not.toBeNull();
        expect(headerIconBefore.getAttribute('icon')).toBe('solar:users-group-rounded-linear');

        // Ajout d'élèves et bascule sur une autre classe régulière
        appState.generatedResults = [
            { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: class1.id },
            { id: 's2', nom: 'MARTIN', prenom: 'Bob', classId: class1.id },
            { id: 's3', nom: 'DURAND', prenom: 'Chloé', classId: class1.id }
        ];
        await ClassManager.switchClass(class2.id);
        ClassUIManager.updateHeaderDisplay();

        const headerIconAfter = DOM.headerClassIcon.querySelector('iconify-icon');
        expect(headerIconAfter).toBe(headerIconBefore);

        const countVal = DOM.classDropdownList.querySelector(
            `.class-progress-badge[data-class-id="${class1.id}"] .progress-count-value`
        );
        expect(countVal.textContent).toBe('3');
    });

    it('devrait positionner le dropdown en popover 320px ancré à gauche sur tablette verticale (601px–768px) et pleine largeur sur mobile (<= 600px)', () => {
        const originalInnerWidth = window.innerWidth;

        try {
            // 1. Mobile (<= 600px) -> feuille pleine largeur avec marges 12px
            Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 480 });
            ClassUIManager._positionDropdown();
            expect(DOM.classDropdown.style.left).toBe('12px');
            expect(DOM.classDropdown.style.right).toBe('12px');
            expect(DOM.classDropdown.style.width).toBe('auto');

            // 2. Tablette verticale (601px–768px) -> popover 320px ancré à gauche
            Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 768 });
            ClassUIManager._positionDropdown();
            expect(DOM.classDropdown.style.left).toBe('12px');
            expect(DOM.classDropdown.style.right).toBe('unset');
            expect(DOM.classDropdown.style.width).toBe('320px');

            // 3. Desktop (> 768px) -> popover 300px ancré à gauche
            Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 });
            ClassUIManager._positionDropdown();
            expect(DOM.classDropdown.style.left).toBe('16px');
            expect(DOM.classDropdown.style.right).toBe('unset');
            expect(DOM.classDropdown.style.width).toBe('300px');
        } finally {
            Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalInnerWidth });
        }
    });

    it('devrait mettre à jour dynamiquement les brumes can-scroll-top et can-scroll-bottom dans le menu classe et la modale Mes classes', () => {
        ClassManager.createClass('6 1');
        ClassManager.createClass('5 1');
        ClassManager.createClass('4 1');

        // 1. Menu déroulant des classes (#classDropdownList) avec débordement
        Object.defineProperty(DOM.classDropdownList, 'scrollHeight', { value: 600, configurable: true });
        Object.defineProperty(DOM.classDropdownList, 'clientHeight', { value: 250, configurable: true });
        DOM.classDropdownList.scrollTop = 0;

        ClassUIManager.renderClassList();
        expect(DOM.classDropdownList.classList.contains('can-scroll-top')).toBe(false);
        expect(DOM.classDropdownList.classList.contains('can-scroll-bottom')).toBe(true);

        // Scroll au milieu -> haut et bas actifs
        DOM.classDropdownList.scrollTop = 120;
        DOM.classDropdownList.dispatchEvent(new Event('scroll'));
        expect(DOM.classDropdownList.classList.contains('can-scroll-top')).toBe(true);
        expect(DOM.classDropdownList.classList.contains('can-scroll-bottom')).toBe(true);

        // Scroll en bas -> uniquement haut actif
        DOM.classDropdownList.scrollTop = 348;
        DOM.classDropdownList.dispatchEvent(new Event('scroll'));
        expect(DOM.classDropdownList.classList.contains('can-scroll-top')).toBe(true);
        expect(DOM.classDropdownList.classList.contains('can-scroll-bottom')).toBe(false);

        // 2. Modale Mes classes (#classManagementModal .modal-body)
        ClassUIManager.showManageClassesModal();
        const modalBody = document.querySelector('#classManagementModal .modal-body');
        expect(modalBody).not.toBeNull();

        // Sans débordement -> aucune brume
        Object.defineProperty(modalBody, 'scrollHeight', { value: 300, configurable: true });
        Object.defineProperty(modalBody, 'clientHeight', { value: 300, configurable: true });
        modalBody.scrollTop = 0;
        modalBody.dispatchEvent(new Event('scroll'));
        expect(modalBody.classList.contains('can-scroll-top')).toBe(false);
        expect(modalBody.classList.contains('can-scroll-bottom')).toBe(false);

        // Avec débordement et scroll intermédiaire -> haut et bas actifs
        Object.defineProperty(modalBody, 'scrollHeight', { value: 800, configurable: true });
        Object.defineProperty(modalBody, 'clientHeight', { value: 350, configurable: true });
        modalBody.scrollTop = 100;
        modalBody.dispatchEvent(new Event('scroll'));
        expect(modalBody.classList.contains('can-scroll-top')).toBe(true);
        expect(modalBody.classList.contains('can-scroll-bottom')).toBe(true);
    });
});


