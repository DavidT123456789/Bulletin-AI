/**
 * @fileoverview Unit tests for the touch long-press shortcut opening the student card actions menu
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ListViewEvents } from './ListViewEvents.js';
import { FocusPanelManager } from '../FocusPanelManager.js';

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

vi.mock('../FocusPanelManager.js', () => ({
    FocusPanelManager: { open: vi.fn() }
}));

const dispatchTouch = (target, type, { x = 0, y = 0, fingers = 1 } = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const touches = type === 'touchend' || type === 'touchcancel'
        ? []
        : Array.from({ length: fingers }, () => ({ clientX: x, clientY: y }));
    Object.defineProperty(event, 'touches', { value: touches });
    target.dispatchEvent(event);
    return event;
};

describe('ListView - Touch long-press opens the row actions menu', () => {
    let listContainer;
    let row;
    let menu;
    let toggleBtn;
    let nameCell;

    beforeEach(() => {
        vi.useFakeTimers();
        listContainer = document.createElement('div');
        listContainer.className = 'student-list-view';
        listContainer.innerHTML = `
            <table>
                <tbody>
                    <tr class="student-row" data-student-id="student-1">
                        <td class="student-name-cell"><span class="student-nom-prenom">DOE Jane</span></td>
                        <td class="action-cell">
                            <div class="action-dropdown">
                                <button class="btn-action-menu" data-action="toggle-menu" aria-expanded="false">...</button>
                                <div class="action-dropdown-menu">
                                    <button class="action-dropdown-item">Row Action</button>
                                </div>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        `;
        document.body.appendChild(listContainer);
        ListViewEvents.attachEventListeners(listContainer);

        row = listContainer.querySelector('.student-row');
        menu = listContainer.querySelector('.action-dropdown-menu');
        toggleBtn = listContainer.querySelector('[data-action="toggle-menu"]');
        nameCell = listContainer.querySelector('.student-nom-prenom');
    });

    afterEach(() => {
        listContainer._eventsAbortController?.abort();
        listContainer.remove();
        vi.useRealTimers();
    });

    it('opens the menu anchored to the 3-dots button after a stationary hold and swallows the following click', () => {
        dispatchTouch(nameCell, 'touchstart', { x: 50, y: 50 });
        vi.advanceTimersByTime(449);
        expect(menu.classList.contains('open')).toBe(false);

        vi.advanceTimersByTime(1);
        expect(menu.classList.contains('open')).toBe(true);
        expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
        expect(menu.style.position).toBe('');

        const touchEnd = dispatchTouch(nameCell, 'touchend');
        expect(touchEnd.defaultPrevented).toBe(true);
    });

    it('does not open the menu on a short tap, and lets the tap through', () => {
        dispatchTouch(nameCell, 'touchstart', { x: 50, y: 50 });
        vi.advanceTimersByTime(200);
        const touchEnd = dispatchTouch(nameCell, 'touchend');
        vi.advanceTimersByTime(500);

        expect(menu.classList.contains('open')).toBe(false);
        expect(touchEnd.defaultPrevented).toBe(false);
    });

    it('cancels the long-press when the finger moves (scroll gesture)', () => {
        dispatchTouch(nameCell, 'touchstart', { x: 50, y: 50 });
        dispatchTouch(nameCell, 'touchmove', { x: 50, y: 70 });
        vi.advanceTimersByTime(500);

        expect(menu.classList.contains('open')).toBe(false);
    });

    it('tolerates small finger jitter below the move threshold', () => {
        dispatchTouch(nameCell, 'touchstart', { x: 50, y: 50 });
        dispatchTouch(nameCell, 'touchmove', { x: 54, y: 53 });
        vi.advanceTimersByTime(450);

        expect(menu.classList.contains('open')).toBe(true);
    });

    it('ignores multi-touch gestures (pinch)', () => {
        dispatchTouch(nameCell, 'touchstart', { x: 50, y: 50, fingers: 2 });
        vi.advanceTimersByTime(500);

        expect(menu.classList.contains('open')).toBe(false);
    });

    it('ignores presses starting on the 3-dots button itself (handled by its own click)', () => {
        dispatchTouch(toggleBtn, 'touchstart', { x: 300, y: 20 });
        vi.advanceTimersByTime(500);

        expect(menu.classList.contains('open')).toBe(false);
    });

    it('opens the menu immediately on a short tap/click on the 3-dots button or action cell without opening FocusPanel', () => {
        FocusPanelManager.open.mockClear();

        dispatchTouch(toggleBtn, 'touchstart', { x: 300, y: 20 });
        const touchEnd = dispatchTouch(toggleBtn, 'touchend');
        expect(touchEnd.defaultPrevented).toBe(false);

        toggleBtn.click();
        expect(menu.classList.contains('open')).toBe(true);
        expect(FocusPanelManager.open).not.toHaveBeenCalled();

        // Clicking the action-cell padding toggles the menu closed without opening FocusPanel
        const actionCell = row.querySelector('.action-cell');
        actionCell.click();
        expect(menu.classList.contains('open')).toBe(false);
        expect(FocusPanelManager.open).not.toHaveBeenCalled();
    });

    it('anchors the menu and swallows the synthetic click if Android fires contextmenu while holding the 3-dots button', () => {
        dispatchTouch(toggleBtn, 'touchstart', { x: 300, y: 20 });
        const ctx = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 20 });
        toggleBtn.dispatchEvent(ctx);

        expect(ctx.defaultPrevented).toBe(true);
        expect(menu.classList.contains('open')).toBe(true);
        expect(menu.style.position).toBe('');

        const touchEnd = dispatchTouch(toggleBtn, 'touchend');
        expect(touchEnd.defaultPrevented).toBe(true);
        expect(menu.classList.contains('open')).toBe(true);
    });

    it('handles the Android native contextmenu fired during the hold without cursor positioning', () => {
        dispatchTouch(nameCell, 'touchstart', { x: 50, y: 50 });
        vi.advanceTimersByTime(300);

        const ctx = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 });
        nameCell.dispatchEvent(ctx);

        expect(ctx.defaultPrevented).toBe(true);
        expect(menu.classList.contains('open')).toBe(true);
        expect(menu.style.position).toBe('');

        // Pending timer was cleared: no double toggle
        vi.advanceTimersByTime(500);
        expect(menu.classList.contains('open')).toBe(true);
    });

    it('keeps mouse right-click positioning at the cursor when no touch is involved', () => {
        const ctx = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 });
        nameCell.dispatchEvent(ctx);

        expect(ctx.defaultPrevented).toBe(true);
        expect(menu.classList.contains('open')).toBe(true);
        expect(menu.style.position).toBe('absolute');
    });

    it('resets state after a long-press so the next right-click uses cursor positioning', () => {
        dispatchTouch(nameCell, 'touchstart', { x: 50, y: 50 });
        vi.advanceTimersByTime(450);
        dispatchTouch(nameCell, 'touchend');

        const ctx = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 });
        nameCell.dispatchEvent(ctx);
        expect(menu.style.position).toBe('absolute');
        expect(row.querySelector('.action-dropdown').classList.contains('open')).toBe(true);
    });

    it('flips and clamps the right-click context menu inside the viewport when clicking near the bottom-right edge', () => {
        Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true });

        const dropdown = row.querySelector('.action-dropdown');
        dropdown.getBoundingClientRect = () => ({ left: 900, top: 640, right: 940, bottom: 676, width: 40, height: 36 });
        menu.getBoundingClientRect = () => ({ left: 950, top: 680, right: 1140, bottom: 920, width: 190, height: 240 });

        const ctx = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 950, clientY: 680 });
        nameCell.dispatchEvent(ctx);

        // targetX clamped to 1000 - 190 - 12 = 798 -> relX = 798 - 900 = -102px
        // targetY flipped above cursor: 680 - 240 = 440 -> relY = 440 - 640 = -200px
        expect(menu.style.left).toBe('-102px');
        expect(menu.style.top).toBe('-200px');
    });
});
