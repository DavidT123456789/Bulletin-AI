/**
 * @fileoverview Unit tests for the touch long-press shortcut opening the student card actions menu
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
});
