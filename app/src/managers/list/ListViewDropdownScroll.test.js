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
});
