/**
 * @fileoverview Unit tests for the progressive import reveal of the List View
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListViewManager } from '../ListViewManager.js';
import { appState } from '../../state/State.js';

vi.mock('../../state/State.js', () => ({
    appState: {
        isAppreciationFullView: false,
        currentPeriod: 'S1',
        currentClassId: 'c1',
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
        updateTooltip: vi.fn()
    }
}));

vi.mock('../StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
}));

const buildResults = () => [
    {
        id: 's1',
        nom: 'BERNARD',
        prenom: 'Lucas',
        studentPhoto: { data: 'data:image/jpeg;base64,abc' },
        studentData: { periods: { S1: { grade: 14 } } }
    },
    {
        id: 's2',
        nom: 'PETIT',
        prenom: 'Emma',
        studentPhoto: { data: 'data:image/jpeg;base64,def' },
        studentData: { periods: { S1: { grade: 16 } } }
    }
];

describe('ListView - Progressive import reveal', () => {
    let container;

    beforeEach(() => {
        vi.clearAllMocks();
        appState.currentPeriod = 'S1';
        appState.currentClassId = 'c1';
        ListViewManager._lastRenderedClassId = 'c1';
        ListViewManager._lastRenderedPeriod = 'S1';
        ListViewManager._pendingImportReveal = null;
        ListViewManager._activeImportRenderGuard = false;
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    it('should stagger rows after the start delay and pop avatars of imported photos', () => {
        ListViewManager.prepareImportReveal({ newIds: ['s1', 's2'], photoIds: ['s1', 's2'] });
        ListViewManager.render(buildResults(), container);

        const rows = container.querySelectorAll('.student-row');
        expect(rows).toHaveLength(2);
        rows.forEach(row => expect(row.classList.contains('row-animate-in')).toBe(true));

        const delay0 = parseInt(rows[0].style.getPropertyValue('--row-delay'), 10);
        const delay1 = parseInt(rows[1].style.getPropertyValue('--row-delay'), 10);
        expect(delay0).toBeGreaterThanOrEqual(40);
        expect(delay1).toBeGreaterThan(delay0);

        container.querySelectorAll('.student-avatar').forEach(avatar => {
            expect(avatar.classList.contains('avatar-import-pop')).toBe(true);
        });
    });

    it('should not add the skeleton table fade, whose nth-child rules override the row stagger', () => {
        ListViewManager.prepareImportReveal({ newIds: ['s1', 's2'] });
        ListViewManager.render(buildResults(), container);

        expect(container.querySelector('.student-list-view').classList.contains('table-fade-in')).toBe(false);
    });

    it('should ignore a synchronous duplicate render so the cascade is not cancelled', () => {
        ListViewManager.prepareImportReveal({ newIds: ['s1', 's2'] });
        ListViewManager.render(buildResults(), container);
        const firstRow = container.querySelector('.student-row');

        ListViewManager.render(buildResults(), container);

        expect(container.querySelector('.student-row')).toBe(firstRow);
        expect(firstRow.classList.contains('row-animate-in')).toBe(true);
    });

    it('should not animate a plain render when no import was announced', () => {
        ListViewManager.render(buildResults(), container);

        expect(container.querySelectorAll('.row-animate-in')).toHaveLength(0);
        expect(container.querySelector('.student-list-view').classList.contains('table-fade-in')).toBe(false);
    });

    it('should expire an unconsumed request at the end of the tick instead of animating a later render', async () => {
        ListViewManager.prepareImportReveal({ newIds: ['s1'] });
        expect(ListViewManager.getPendingImportReveal()).not.toBeNull();

        await Promise.resolve();

        expect(ListViewManager.getPendingImportReveal()).toBeNull();
        ListViewManager.render(buildResults(), container);
        expect(container.querySelectorAll('.row-animate-in')).toHaveLength(0);
    });
});
