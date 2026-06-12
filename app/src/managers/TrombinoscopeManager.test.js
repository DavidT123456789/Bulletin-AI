import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrombinoscopeManager } from './TrombinoscopeManager.js';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        filteredResults: []
    }
}));

vi.mock('./StudentPhotoManager.js', () => ({
    StudentPhotoManager: {}
}));

vi.mock('./UIManager.js', () => ({
    UI: {
        showNotification: vi.fn()
    }
}));

vi.mock('./ClassManager.js', () => ({
    ClassManager: {}
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {}
}));

vi.mock('../utils/Utils.js', () => ({
    Utils: {
        debounce: (fn) => fn
    }
}));

describe('TrombinoscopeManager Selection & Multi-Drag', () => {
    beforeEach(() => {
        // Reset properties
        TrombinoscopeManager._reset();
        TrombinoscopeManager._zones = [
            { id: 1, cx: 100, cy: 100, studentId: null },
            { id: 2, cx: 200, cy: 200, studentId: null },
            { id: 3, cx: 300, cy: 300, studentId: null }
        ];
        TrombinoscopeManager._imageNaturalWidth = 1000;
        TrombinoscopeManager._imageNaturalHeight = 1000;
        TrombinoscopeManager._globalRadius = 40;
    });

    it('should initialize selected zone set and selection box', () => {
        expect(TrombinoscopeManager._selectedZoneIds).toBeInstanceOf(Set);
        expect(TrombinoscopeManager._selectedZoneIds.size).toBe(0);
        expect(TrombinoscopeManager._selectionBox).toBeNull();
    });

    it('should clear selected zones on _reset', () => {
        TrombinoscopeManager._selectedZoneIds.add(1);
        TrombinoscopeManager._selectedZoneIds.add(2);
        TrombinoscopeManager._reset();
        expect(TrombinoscopeManager._selectedZoneIds.size).toBe(0);
    });

    it('should clear selection on _createGrid', () => {
        // Create mock DOM elements needed inside _createGrid
        document.body.innerHTML = `
            <input type="range" id="colsSlider" />
            <input type="range" id="rowsSlider" />
            <input type="range" id="gapHSlider" />
            <input type="range" id="gapVSlider" />
            <span id="colsValue"></span>
            <span id="rowsValue"></span>
            <span id="gapHValue"></span>
            <span id="gapVValue"></span>
            <div class="size-slider-container"></div>
            <input type="range" class="size-slider" />
        `;

        TrombinoscopeManager._selectedZoneIds.add(1);
        TrombinoscopeManager._createGrid(4, 5, false, true);
        expect(TrombinoscopeManager._selectedZoneIds.size).toBe(0);
    });

    it('should clear selection on _undo', () => {
        TrombinoscopeManager._selectedZoneIds.add(1);
        TrombinoscopeManager._history = [
            {
                zones: [{ id: 1, cx: 90, cy: 90, studentId: null }],
                gridCols: 4,
                gridRows: 5,
                gapH: 0,
                gapV: 0,
                globalRadius: 40
            }
        ];
        TrombinoscopeManager._undo();
        expect(TrombinoscopeManager._selectedZoneIds.size).toBe(0);
    });

    it('should remove selected zone from selection list when deleted', () => {
        TrombinoscopeManager._selectedZoneIds.add(2);
        TrombinoscopeManager._selectedZoneIds.add(3);

        TrombinoscopeManager._removeZone(2);
        expect(TrombinoscopeManager._selectedZoneIds.has(2)).toBe(false);
        expect(TrombinoscopeManager._selectedZoneIds.has(3)).toBe(true);
    });

    it('should nudge all selected zones when multiple zones are selected using keyboard', () => {
        // Mock document structure for rendering/UI updates
        document.body.innerHTML = `
            <div id="trombiWizardModal" class="visible"></div>
            <div id="trombiZonesOverlay"></div>
            <div id="trombiAssignmentGrid"></div>
            <img id="trombiStep2Image" style="width: 500px; height: 500px;" />
            <input type="range" class="size-slider" />
        `;

        TrombinoscopeManager._currentStep = 2;
        TrombinoscopeManager._lastFocusedControl = 'zone';
        TrombinoscopeManager._lastFocusedZoneId = 1;
        TrombinoscopeManager._selectedZoneIds.add(1);
        TrombinoscopeManager._selectedZoneIds.add(2);

        // Key down arrow right
        const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
        
        // Initial coordinates
        const initialCx1 = TrombinoscopeManager._zones.find(z => z.id === 1).cx;
        const initialCx2 = TrombinoscopeManager._zones.find(z => z.id === 2).cx;
        const initialCx3 = TrombinoscopeManager._zones.find(z => z.id === 3).cx;

        TrombinoscopeManager._handleKeyDown(event);

        // Selected zones should move right
        expect(TrombinoscopeManager._zones.find(z => z.id === 1).cx).toBeGreaterThan(initialCx1);
        expect(TrombinoscopeManager._zones.find(z => z.id === 2).cx).toBeGreaterThan(initialCx2);
        
        // Unselected zone should remain at same cx
        expect(TrombinoscopeManager._zones.find(z => z.id === 3).cx).toBe(initialCx3);
    });

    it('should select a range of zones on Shift + Click', () => {
        document.body.innerHTML = `
            <div id="trombiZonesOverlay">
                <div class="trombi-zone" data-zone-id="1"></div>
                <div class="trombi-zone" data-zone-id="2"></div>
                <div class="trombi-zone" data-zone-id="3"></div>
            </div>
            <div id="trombiAssignmentGrid"></div>
            <input type="range" class="size-slider" />
        `;

        TrombinoscopeManager._lastFocusedZoneId = 1;
        TrombinoscopeManager._selectedZoneIds.add(1);

        const el3 = document.querySelector('.trombi-zone[data-zone-id="3"]');
        const event = {
            currentTarget: el3,
            clientX: 100,
            clientY: 100,
            shiftKey: true,
            preventDefault: vi.fn(),
            target: el3
        };

        TrombinoscopeManager._handleZoneMouseDown(event);

        expect(TrombinoscopeManager._selectedZoneIds.has(1)).toBe(true);
        expect(TrombinoscopeManager._selectedZoneIds.has(2)).toBe(true);
        expect(TrombinoscopeManager._selectedZoneIds.has(3)).toBe(true);
    });

    it('should temporarily disable grouped drag when a sub-group is selected, and restore it when cleared', () => {
        document.body.innerHTML = `
            <input type="checkbox" id="groupedDragToggle" checked />
            <div id="trombiZonesOverlay">
                <div class="trombi-zone" data-zone-id="1"></div>
                <div class="trombi-zone" data-zone-id="2"></div>
                <div class="trombi-zone" data-zone-id="3"></div>
            </div>
            <div id="trombiAssignmentGrid"></div>
            <input type="range" class="size-slider" />
        `;

        TrombinoscopeManager._groupedDrag = true;
        TrombinoscopeManager._restoreGroupedDrag = false;

        // Select a sub-group (zones 1 and 2)
        TrombinoscopeManager._selectedZoneIds.add(1);
        TrombinoscopeManager._selectedZoneIds.add(2);
        
        TrombinoscopeManager._updateGroupedDragState();

        // Checkbox should be unchecked, _groupedDrag false, restore flag true
        const toggle = document.getElementById('groupedDragToggle');
        expect(toggle.checked).toBe(false);
        expect(TrombinoscopeManager._groupedDrag).toBe(false);
        expect(TrombinoscopeManager._restoreGroupedDrag).toBe(true);

        // Clear selection
        TrombinoscopeManager._selectedZoneIds.clear();
        TrombinoscopeManager._updateGroupedDragState();

        // Checkbox should be checked again, _groupedDrag true, restore flag false
        expect(toggle.checked).toBe(true);
        expect(TrombinoscopeManager._groupedDrag).toBe(true);
        expect(TrombinoscopeManager._restoreGroupedDrag).toBe(false);
    });
});
