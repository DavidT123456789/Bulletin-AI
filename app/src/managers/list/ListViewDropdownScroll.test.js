/**
 * @fileoverview Unit tests for List View dropdown menus tap-outside dismiss with click absorption, dropup auto-flip & ARIA states
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ListViewEvents } from './ListViewEvents.js';

vi.mock('../../state/State.js', () => ({
    appState: {
        isAppreciationFullView: false,
        currentPeriod: 'S1',
        sortState: { field: null, direction: 'asc', param: null },
        generatedResults: []
    },
    userSettings: {
        academic: {
            classes: [{ id: 'c1', name: '6A' }],
            currentClassId: 'c1'
        }
    }
}));

vi.mock('../TooltipsManager.js', () => ({
    TooltipsUI: {
        updateTooltip: vi.fn(),
        initTooltips: vi.fn()
    }
}));

vi.mock('../StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
}));

describe('ListView - Dropdown menus tap-outside dismiss, absorption, ARIA sync and dropup auto-flip', () => {
    let container;
    let listContainer;

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);

        listContainer = document.createElement('div');
        listContainer.className = 'student-list-view';
        listContainer.innerHTML = `
            <div class="header-content-wrapper global-actions-dropdown">
                <button class="btn-action-menu-header" id="tableActionsBtnToggle" aria-haspopup="menu" aria-expanded="false">Actions</button>
                <div class="global-actions-dropdown-menu" id="tableActionsDropdown">
                    <button class="action-dropdown-item">Global Action</button>
                </div>
            </div>
            <table>
                <tbody>
                    <tr class="student-row" data-student-id="student-1">
                        <td>
                            <div class="action-dropdown">
                                <button class="btn-action-menu" data-action="toggle-menu" aria-haspopup="menu" aria-expanded="false">...</button>
                                <div class="action-dropdown-menu">
                                    <button class="action-dropdown-item">Row Action</button>
                                </div>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        `;
        container.appendChild(listContainer);
        ListViewEvents.attachEventListeners(listContainer);
    });

    afterEach(() => {
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }
    });

    it('should close row action dropdown menu and sync aria-expanded when tapping outside with absorption', () => {
        const rowDropdown = listContainer.querySelector('.action-dropdown');
        const rowMenu = listContainer.querySelector('.action-dropdown-menu');
        const toggleBtn = listContainer.querySelector('[data-action="toggle-menu"]');

        expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

        // Open menu via trigger button
        toggleBtn.click();
        expect(rowMenu.classList.contains('open')).toBe(true);
        expect(rowDropdown.classList.contains('open')).toBe(true);
        expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');

        // Tap outside on document body
        document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        // Menu should be closed and aria-expanded reset
        expect(rowMenu.classList.contains('open')).toBe(false);
        expect(rowDropdown.classList.contains('open')).toBe(false);
        expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    });

    it('should close global header action dropdown menu and sync aria-expanded when tapping outside', () => {
        const globalDropdown = listContainer.querySelector('.global-actions-dropdown');
        const globalMenu = listContainer.querySelector('.global-actions-dropdown-menu');
        const globalToggleBtn = listContainer.querySelector('.btn-action-menu-header');

        expect(globalToggleBtn.getAttribute('aria-expanded')).toBe('false');

        // Open global menu via trigger button
        globalToggleBtn.click();
        expect(globalMenu.classList.contains('open')).toBe(true);
        expect(globalDropdown.classList.contains('open')).toBe(true);
        expect(globalToggleBtn.getAttribute('aria-expanded')).toBe('true');

        // Tap outside
        document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        // Menu should be closed and aria-expanded reset
        expect(globalMenu.classList.contains('open')).toBe(false);
        expect(globalDropdown.classList.contains('open')).toBe(false);
        expect(globalToggleBtn.getAttribute('aria-expanded')).toBe('false');
    });

    it('should NOT close menu when clicking inside the menu itself', () => {
        const rowDropdown = listContainer.querySelector('.action-dropdown');
        const rowMenu = listContainer.querySelector('.action-dropdown-menu');
        const toggleBtn = listContainer.querySelector('[data-action="toggle-menu"]');
        const actionItem = listContainer.querySelector('.action-dropdown-item');

        toggleBtn.click();
        expect(rowMenu.classList.contains('open')).toBe(true);

        // Click inside the menu
        actionItem.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

        // Menu should remain open on pointerdown (click on action item will execute action)
        expect(rowMenu.classList.contains('open')).toBe(true);
        expect(rowDropdown.classList.contains('open')).toBe(true);
        expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    });

    it('should absorb outside click to dismiss menu without triggering click handlers on table rows, even with human click delay', async () => {
        const rowMenu = listContainer.querySelector('.action-dropdown-menu');
        const toggleBtn = listContainer.querySelector('[data-action="toggle-menu"]');
        const studentRow = listContainer.querySelector('.student-row');

        // Open menu
        toggleBtn.click();
        expect(rowMenu.classList.contains('open')).toBe(true);

        const rowClickSpy = vi.fn();
        studentRow.addEventListener('click', rowClickSpy);

        // Click outside on the student row with human delay between pointerdown and click (>200ms)
        studentRow.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 250));
        studentRow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        // Menu should be closed
        expect(rowMenu.classList.contains('open')).toBe(false);

        // Underlying row should NOT receive the click
        expect(rowClickSpy).not.toHaveBeenCalled();

        // Subsequent click on the row now that menu is closed SHOULD trigger the row click handler
        studentRow.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
        studentRow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(rowClickSpy).toHaveBeenCalledTimes(1);
    });

    it('should activate dropup class when near bottom of viewport and reset on close', () => {
        const rowDropdown = listContainer.querySelector('.action-dropdown');
        const toggleBtn = listContainer.querySelector('[data-action="toggle-menu"]');

        // Simulate button located near bottom of viewport (e.g. bottom: 750px in an 800px window)
        vi.spyOn(toggleBtn, 'getBoundingClientRect').mockReturnValue({
            bottom: 750,
            top: 710,
            left: 100,
            right: 144,
            width: 44,
            height: 44
        });
        window.innerHeight = 800;

        // Open menu
        toggleBtn.click();
        expect(rowDropdown.classList.contains('dropup')).toBe(true);
        expect(rowDropdown.classList.contains('open')).toBe(true);

        // Close menu via outside tap
        document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(rowDropdown.classList.contains('dropup')).toBe(false);
        expect(rowDropdown.classList.contains('open')).toBe(false);
    });

    it('should close open menus when scrolling outside the menu, but not when scrolling inside the menu', () => {
        const rowMenu = listContainer.querySelector('.action-dropdown-menu');
        const toggleBtn = listContainer.querySelector('[data-action="toggle-menu"]');

        toggleBtn.click();
        expect(rowMenu.classList.contains('open')).toBe(true);

        // Scroll inside menu -> stays open
        rowMenu.dispatchEvent(new Event('scroll'));
        expect(rowMenu.classList.contains('open')).toBe(true);

        // Scroll on window / main content -> closes menu
        window.dispatchEvent(new Event('scroll'));
        expect(rowMenu.classList.contains('open')).toBe(false);
    });

    it('should clean up listeners when container is re-attached or aborted', () => {
        const firstController = listContainer._eventsAbortController;
        expect(firstController).toBeDefined();

        // Attach again (e.g. on period switch or view refresh)
        ListViewEvents.attachEventListeners(listContainer);

        expect(firstController.signal.aborted).toBe(true);
        expect(listContainer._eventsAbortController.signal.aborted).toBe(false);
    });

    it('should close main header 3-dots menu (#headerMenuDropdown), sync body.header-menu-open, and absorb click on student row', async () => {
        const { DOM } = await import('../../utils/DOM.js');
        const { GeneralListeners } = await import('../listeners/GeneralListeners.js');

        const headerWrapper = document.createElement('div');
        headerWrapper.innerHTML = `
            <button id="headerMenuBtn"></button>
            <div id="headerMenuDropdown" class="header-dropdown-menu">
                <button class="menu-item">Item</button>
            </div>
        `;
        container.appendChild(headerWrapper);

        DOM.headerMenuBtn = headerWrapper.querySelector('#headerMenuBtn');
        DOM.headerMenuDropdown = headerWrapper.querySelector('#headerMenuDropdown');

        GeneralListeners.init({ handleGenerateClick: vi.fn(), handleClearClick: vi.fn() });
        vi.spyOn(GeneralListeners, '_onMenuOpen').mockImplementation(() => {});
        vi.spyOn(GeneralListeners, 'setupCloudListeners').mockImplementation(() => {});

        GeneralListeners.setup((el, fn) => {
            if (el) el.addEventListener('click', fn);
        });

        const studentRow = listContainer.querySelector('.student-row');
        const rowClickSpy = vi.fn();
        studentRow.addEventListener('click', rowClickSpy);

        // Open main header 3-dots menu
        DOM.headerMenuBtn.click();
        expect(DOM.headerMenuDropdown.classList.contains('open')).toBe(true);
        expect(DOM.headerMenuBtn.getAttribute('aria-expanded')).toBe('true');
        expect(document.body.classList.contains('header-menu-open')).toBe(true);

        // Click on a student card while header menu is open -> must close menu AND absorb click
        studentRow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(DOM.headerMenuDropdown.classList.contains('open')).toBe(false);
        expect(DOM.headerMenuBtn.getAttribute('aria-expanded')).toBe('false');
        expect(document.body.classList.contains('header-menu-open')).toBe(false);
        expect(rowClickSpy).not.toHaveBeenCalled();

        // Re-open and test scroll dismissal
        DOM.headerMenuBtn.click();
        expect(DOM.headerMenuDropdown.classList.contains('open')).toBe(true);
        window.dispatchEvent(new Event('scroll'));
        expect(DOM.headerMenuDropdown.classList.contains('open')).toBe(false);
        expect(document.body.classList.contains('header-menu-open')).toBe(false);
    });

    it('should trigger header sort and close global menu when clicking mobile sort option', async () => {
        const { EventHandlersManager } = await import('../EventHandlersManager.js');
        const { ListViewRenderer } = await import('./ListViewRenderer.js');
        const { appState } = await import('../../state/State.js');

        const sortSpy = vi.spyOn(EventHandlersManager, 'handleHeaderSortClick').mockImplementation(() => {});

        listContainer.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th class="sortable-header" data-sort-field="name">Nom <span class="sort-icon-placeholder"></span></th>
                        <th class="sortable-header" data-sort-field="grade" data-sort-param="S1">S1 <span class="sort-icon-placeholder"></span></th>
                        <th class="action-header">
                            <div class="header-content-wrapper global-actions-dropdown">
                                <button class="btn-action-menu-header" id="tableActionsBtnToggle" aria-expanded="false">Actions</button>
                                <div class="global-actions-dropdown-menu" id="tableActionsDropdown">
                                    <div class="mobile-sort-section">
                                        <button type="button" class="action-dropdown-item mobile-sort-btn" data-mobile-sort="grade" data-sort-param="S1">
                                            <span>Moyenne (S1)</span>
                                            <span class="mobile-sort-indicator"></span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </th>
                    </tr>
                </thead>
            </table>
        `;

        ListViewEvents.attachEventListeners(listContainer);

        const globalToggle = listContainer.querySelector('#tableActionsBtnToggle');
        const globalMenu = listContainer.querySelector('#tableActionsDropdown');
        const mobileSortGradeBtn = listContainer.querySelector('[data-mobile-sort="grade"]');
        const gradeHeader = listContainer.querySelector('.sortable-header[data-sort-field="grade"]');

        globalToggle.click();
        expect(globalMenu.classList.contains('open')).toBe(true);

        mobileSortGradeBtn.click();
        expect(globalMenu.classList.contains('open')).toBe(false);
        expect(sortSpy).toHaveBeenCalledWith(gradeHeader);

        appState.sortState = { field: 'grade', direction: 'desc', param: 'S1' };
        ListViewRenderer.updateHeaderSortIcons(listContainer);
        expect(mobileSortGradeBtn.classList.contains('active-sort')).toBe(true);
        expect(mobileSortGradeBtn.querySelector('.mobile-sort-indicator iconify-icon')).not.toBeNull();

        sortSpy.mockRestore();
    });

    it('should morph #addStudentFab between add mode and scroll-top mode at 180px threshold and guard click behavior', async () => {
        const { GlobalListeners } = await import('../listeners/GlobalListeners.js');

        const mainContent = document.createElement('main');
        mainContent.id = 'main-content';
        mainContent.className = 'main-content';
        mainContent.scrollTo = vi.fn();
        window.scrollTo = vi.fn();
        const fab = document.createElement('button');
        fab.id = 'addStudentFab';
        fab.className = 'fab-add-student';
        fab.dataset.mode = 'add';

        container.appendChild(mainContent);
        container.appendChild(fab);

        GlobalListeners._setupScrollListeners();

        const hubOpenSpy = vi.fn();
        fab.addEventListener('click', () => {
            if (fab.classList.contains('is-scroll-top') || fab.dataset.mode === 'scroll-top') return;
            hubOpenSpy();
        });

        // Below threshold (<= 180px) -> stays in 'add' mode
        mainContent.scrollTop = 120;
        mainContent.dispatchEvent(new Event('scroll'));
        expect(fab.classList.contains('is-scroll-top')).toBe(false);
        expect(fab.dataset.mode).toBe('add');

        // Click in 'add' mode -> opens hub, does not scroll to top
        fab.click();
        expect(hubOpenSpy).toHaveBeenCalledTimes(1);
        expect(mainContent.scrollTo).not.toHaveBeenCalled();

        // Scroll past 180px -> morphs on the spot into 'scroll-top' mode
        mainContent.scrollTop = 260;
        mainContent.dispatchEvent(new Event('scroll'));
        expect(fab.classList.contains('is-scroll-top')).toBe(true);
        expect(fab.dataset.mode).toBe('scroll-top');
        expect(fab.getAttribute('aria-label')).toBe('Retour en haut');
        expect(fab.getAttribute('data-tooltip')).toBe('Retour en haut');

        // Click in 'scroll-top' mode -> scrolls to top and blocks hub opening
        fab.click();
        expect(mainContent.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
        expect(hubOpenSpy).toHaveBeenCalledTimes(1);

        // Scroll back to <= 180px -> morphs back to 'add' mode
        mainContent.scrollTop = 180;
        mainContent.dispatchEvent(new Event('scroll'));
        expect(fab.classList.contains('is-scroll-top')).toBe(false);
        expect(fab.dataset.mode).toBe('add');
        expect(fab.getAttribute('aria-label')).toBe('Compléter la classe');
        expect(fab.getAttribute('data-tooltip')).toBe('Compléter la classe');
    });

    it('should update can-scroll-top and can-scroll-bottom affordances on .main-content-wrapper during scroll and disable them in plan view', async () => {
        const { GlobalListeners } = await import('../listeners/GlobalListeners.js');

        // Safe when DOM is empty
        document.body.innerHTML = '';
        expect(() => GlobalListeners.updateMainScrollAffordances()).not.toThrow();

        const wrapper = document.createElement('div');
        wrapper.className = 'main-content-wrapper';
        wrapper.dataset.view = 'list';

        const mainContent = document.createElement('main');
        mainContent.id = 'main-content';
        mainContent.className = 'main-content';
        wrapper.appendChild(mainContent);
        document.body.appendChild(wrapper);

        Object.defineProperty(mainContent, 'scrollHeight', { value: 1000, configurable: true });
        Object.defineProperty(mainContent, 'clientHeight', { value: 500, configurable: true });

        // 1. At top (scrollTop = 0) with overflow -> only bottom scrim active
        mainContent.scrollTop = 0;
        GlobalListeners._setupScrollListeners();
        expect(wrapper.classList.contains('can-scroll-top')).toBe(false);
        expect(wrapper.classList.contains('can-scroll-bottom')).toBe(true);

        // 2. Scrolled down in middle -> both top and bottom scrims active
        mainContent.scrollTop = 100;
        mainContent.dispatchEvent(new Event('scroll'));
        expect(wrapper.classList.contains('can-scroll-top')).toBe(true);
        expect(wrapper.classList.contains('can-scroll-bottom')).toBe(true);

        // 3. Reached bottom (remaining <= 4) -> only top scrim active
        mainContent.scrollTop = 498;
        mainContent.dispatchEvent(new Event('scroll'));
        expect(wrapper.classList.contains('can-scroll-top')).toBe(true);
        expect(wrapper.classList.contains('can-scroll-bottom')).toBe(false);

        // 4. Plan view -> both scrims disabled
        wrapper.dataset.view = 'plan';
        GlobalListeners.updateMainScrollAffordances();
        expect(wrapper.classList.contains('can-scroll-top')).toBe(false);
        expect(wrapper.classList.contains('can-scroll-bottom')).toBe(false);

        // 5. No overflow in list view (scrollHeight <= clientHeight) -> both scrims disabled
        wrapper.dataset.view = 'list';
        mainContent.scrollTop = 0;
        Object.defineProperty(mainContent, 'scrollHeight', { value: 500, configurable: true });
        GlobalListeners.updateMainScrollAffordances();
        expect(wrapper.classList.contains('can-scroll-top')).toBe(false);
        expect(wrapper.classList.contains('can-scroll-bottom')).toBe(false);
    });

    it('should trigger toggleAppreciationColumn when clicking #mobileCompactToggleBtn inside .appreciation-header-actions', () => {
        const toggleSpy = vi.fn();
        ListViewEvents.init({ toggleAppreciationColumn: toggleSpy });

        listContainer.innerHTML = `
            <table class="student-list-table">
                <thead>
                    <tr>
                        <th class="appreciation-header appreciation-toggle-header">
                            <div class="header-content-wrapper">
                                <div class="appreciation-header-actions" id="appreciationHeaderActions">
                                    <button type="button" id="mobileCompactToggleBtn">
                                        <iconify-icon icon="solar:maximize-square-linear"></iconify-icon>
                                    </button>
                                    <button type="button" id="generateBtnInline">19</button>
                                </div>
                            </div>
                        </th>
                    </tr>
                </thead>
            </table>
        `;

        ListViewEvents.attachEventListeners(listContainer);

        const mobileToggleBtn = listContainer.querySelector('#mobileCompactToggleBtn iconify-icon');
        mobileToggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(toggleSpy).toHaveBeenCalledTimes(1);
        expect(toggleSpy).toHaveBeenCalledWith(listContainer);
    });

    it('should close open list menus on Back button (popstate via HistoryManager) and clean up HistoryManager on manual close', async () => {
        const { HistoryManager } = await import('../HistoryManager.js');
        HistoryManager.destroy();

        const globalMenu = listContainer.querySelector('.global-actions-dropdown-menu');
        const globalToggleBtn = listContainer.querySelector('.btn-action-menu-header');
        const rowMenu = listContainer.querySelector('.action-dropdown-menu');
        const rowToggleBtn = listContainer.querySelector('[data-action="toggle-menu"]');

        // 1. Open global menu -> pushes 'listActionMenu' to HistoryManager
        globalToggleBtn.click();
        expect(globalMenu.classList.contains('open')).toBe(true);
        expect(HistoryManager.isOpen('listActionMenu')).toBe(true);

        // Press mobile Back button (popstate) -> closes global menu
        window.dispatchEvent(new PopStateEvent('popstate'));
        expect(globalMenu.classList.contains('open')).toBe(false);
        expect(globalToggleBtn.getAttribute('aria-expanded')).toBe('false');
        expect(HistoryManager.isOpen('listActionMenu')).toBe(false);

        // 2. Open row menu -> pushes 'listActionMenu' to HistoryManager
        rowToggleBtn.click();
        expect(rowMenu.classList.contains('open')).toBe(true);
        expect(HistoryManager.isOpen('listActionMenu')).toBe(true);

        // Close manually via outside tap -> cleans up HistoryManager stack
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(rowMenu.classList.contains('open')).toBe(false);
        expect(HistoryManager.isOpen('listActionMenu')).toBe(false);
    });

    it('should close #headerMenuDropdown on Back button (popstate via HistoryManager)', async () => {
        const { DOM } = await import('../../utils/DOM.js');
        const { GeneralListeners } = await import('../listeners/GeneralListeners.js');
        const { HistoryManager } = await import('../HistoryManager.js');
        HistoryManager.destroy();

        const headerWrapper = document.createElement('div');
        headerWrapper.innerHTML = `
            <button id="headerMenuBtn"></button>
            <div id="headerMenuDropdown" class="header-dropdown-menu">
                <button class="menu-item">Item</button>
            </div>
        `;
        container.appendChild(headerWrapper);

        DOM.headerMenuBtn = headerWrapper.querySelector('#headerMenuBtn');
        DOM.headerMenuDropdown = headerWrapper.querySelector('#headerMenuDropdown');

        GeneralListeners.init({ handleGenerateClick: vi.fn(), handleClearClick: vi.fn() });
        vi.spyOn(GeneralListeners, '_onMenuOpen').mockImplementation(() => {});
        vi.spyOn(GeneralListeners, 'setupCloudListeners').mockImplementation(() => {});

        GeneralListeners.setup((el, fn) => {
            if (el) el.addEventListener('click', fn);
        });

        DOM.headerMenuBtn.click();
        expect(DOM.headerMenuDropdown.classList.contains('open')).toBe(true);
        expect(HistoryManager.isOpen('headerMenu')).toBe(true);

        window.dispatchEvent(new PopStateEvent('popstate'));
        expect(DOM.headerMenuDropdown.classList.contains('open')).toBe(false);
        expect(DOM.headerMenuBtn.getAttribute('aria-expanded')).toBe('false');
        expect(HistoryManager.isOpen('headerMenu')).toBe(false);
    });

    it('should constrain menu maxHeight to available viewport space when opened and keep menu open during touch-scroll inside menu', () => {
        const globalMenu = listContainer.querySelector('.global-actions-dropdown-menu');
        const globalToggleBtn = listContainer.querySelector('.btn-action-menu-header');
        const actionItem = globalMenu.querySelector('.action-dropdown-item');

        vi.spyOn(globalToggleBtn, 'getBoundingClientRect').mockReturnValue({
            bottom: 240,
            top: 196,
            left: 300,
            right: 344,
            width: 44,
            height: 44
        });
        window.innerHeight = 640;

        globalToggleBtn.click();
        expect(globalMenu.classList.contains('open')).toBe(true);
        // 640 - 240 - 16 = 384px
        expect(globalMenu.style.maxHeight).toBe('384px');

        // Start touch gesture inside the menu, then fire a scroll event on window -> menu must NOT close
        actionItem.dispatchEvent(new Event('touchstart', { bubbles: true }));
        window.dispatchEvent(new Event('scroll'));
        expect(globalMenu.classList.contains('open')).toBe(true);

        // End touch gesture -> subsequent scroll outside closes the menu
        actionItem.dispatchEvent(new Event('touchend', { bubbles: true }));
        window.dispatchEvent(new Event('scroll'));
        expect(globalMenu.classList.contains('open')).toBe(false);
    });
});
