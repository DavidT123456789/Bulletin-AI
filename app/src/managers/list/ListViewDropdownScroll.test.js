/**
 * @fileoverview Unit tests for List View dropdown menus auto-dismiss on scroll, dropup auto-flip & ARIA states
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

describe('ListView - Dropdown menus auto-dismiss, ARIA sync and dropup auto-flip', () => {
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

    it('should close row action dropdown menu and sync aria-expanded when scrolling outside', () => {
        const rowDropdown = listContainer.querySelector('.action-dropdown');
        const rowMenu = listContainer.querySelector('.action-dropdown-menu');
        const toggleBtn = listContainer.querySelector('[data-action="toggle-menu"]');

        expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

        // Open menu via trigger button
        toggleBtn.click();
        expect(rowMenu.classList.contains('open')).toBe(true);
        expect(rowDropdown.classList.contains('open')).toBe(true);
        expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');

        // Dispatch scroll event on window (simulating mobile viewport scroll)
        window.dispatchEvent(new Event('scroll'));

        // Menu should be closed and aria-expanded reset
        expect(rowMenu.classList.contains('open')).toBe(false);
        expect(rowDropdown.classList.contains('open')).toBe(false);
        expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    });

    it('should close global header action dropdown menu and sync aria-expanded when scrolling list container', () => {
        const globalDropdown = listContainer.querySelector('.global-actions-dropdown');
        const globalMenu = listContainer.querySelector('.global-actions-dropdown-menu');
        const globalToggleBtn = listContainer.querySelector('.btn-action-menu-header');

        expect(globalToggleBtn.getAttribute('aria-expanded')).toBe('false');

        // Open global menu via trigger button
        globalToggleBtn.click();
        expect(globalMenu.classList.contains('open')).toBe(true);
        expect(globalDropdown.classList.contains('open')).toBe(true);
        expect(globalToggleBtn.getAttribute('aria-expanded')).toBe('true');

        // Dispatch scroll event on listContainer
        listContainer.dispatchEvent(new Event('scroll'));

        // Menu should be closed and aria-expanded reset
        expect(globalMenu.classList.contains('open')).toBe(false);
        expect(globalDropdown.classList.contains('open')).toBe(false);
        expect(globalToggleBtn.getAttribute('aria-expanded')).toBe('false');
    });

    it('should NOT close menu if scroll event originates from inside the menu itself', () => {
        const rowDropdown = listContainer.querySelector('.action-dropdown');
        const rowMenu = listContainer.querySelector('.action-dropdown-menu');
        const toggleBtn = listContainer.querySelector('[data-action="toggle-menu"]');

        toggleBtn.click();
        expect(rowMenu.classList.contains('open')).toBe(true);

        // Dispatch scroll event targeting the menu itself
        const scrollInsideEvent = new Event('scroll', { bubbles: false });
        Object.defineProperty(scrollInsideEvent, 'target', { value: rowMenu, writable: false });

        window.dispatchEvent(scrollInsideEvent);

        // Menu should remain open
        expect(rowMenu.classList.contains('open')).toBe(true);
        expect(rowDropdown.classList.contains('open')).toBe(true);
        expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
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

        // Close menu
        window.dispatchEvent(new Event('scroll'));
        expect(rowDropdown.classList.contains('dropup')).toBe(false);
        expect(rowDropdown.classList.contains('open')).toBe(false);
    });

    it('should handle scroll safely when no menus are open and listener is detached', () => {
        const rowMenu = listContainer.querySelector('.action-dropdown-menu');
        const globalMenu = listContainer.querySelector('.global-actions-dropdown-menu');

        expect(rowMenu.classList.contains('open')).toBe(false);
        expect(globalMenu.classList.contains('open')).toBe(false);

        // Triggering scroll when closed should not throw errors
        expect(() => {
            window.dispatchEvent(new Event('scroll'));
            listContainer.dispatchEvent(new Event('scroll'));
        }).not.toThrow();

        expect(rowMenu.classList.contains('open')).toBe(false);
        expect(globalMenu.classList.contains('open')).toBe(false);
    });

    it('should clean up listeners when container is re-attached or aborted', () => {
        const firstController = listContainer._eventsAbortController;
        expect(firstController).toBeDefined();

        // Attach again (e.g. on period switch or view refresh)
        ListViewEvents.attachEventListeners(listContainer);

        expect(firstController.signal.aborted).toBe(true);
        expect(listContainer._eventsAbortController.signal.aborted).toBe(false);
    });
});
