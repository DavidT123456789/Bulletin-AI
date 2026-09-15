import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrombinoscopeManager } from './TrombinoscopeManager.js';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        filteredResults: [],
        generatedResults: []
    },
    userSettings: {
        academic: {
            classes: []
        }
    }
}));

vi.mock('./StudentPhotoManager.js', () => ({
    StudentPhotoManager: {
        bulkAssignPhotos: vi.fn().mockResolvedValue(2)
    }
}));

vi.mock('./UIManager.js', () => ({
    UI: {
        showNotification: vi.fn(),
        showLoadingOverlay: vi.fn(),
        hideLoadingOverlay: vi.fn(),
        initTooltips: vi.fn()
    }
}));

vi.mock('./ClassManager.js', () => ({
    ClassManager: {
        getCurrentClass: vi.fn(),
        getAllClasses: vi.fn().mockReturnValue([]),
        createClass: vi.fn().mockReturnValue({ id: 'class-123', name: '5 1' }),
        switchClass: vi.fn().mockResolvedValue(undefined),
        _filterResultsByClass: vi.fn().mockResolvedValue(undefined)
    }
}));

vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn().mockResolvedValue(true)
    }
}));

vi.mock('./StudentDataManager.js', () => ({
    StudentDataManager: {
        createPendingResult: vi.fn((data) => ({
            id: 'mock-student-' + (data.nom || 'id'),
            ...data
        }))
    }
}));

vi.mock('../utils/PronoteTrombiParser.js', () => ({
    parsePronoteTrombiPdf: vi.fn()
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {}
}));

vi.mock('../utils/Utils.js', () => ({
    Utils: {
        debounce: (fn) => fn,
        normalizeName: (nom, prenom) => `${nom || ''} ${prenom || ''}`.trim().toLowerCase(),
        formatStudentName: (nom, prenom) => `${nom} ${prenom}`
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

describe('TrombinoscopeManager PDF Import & Multi-Page Flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = `
            <div id="trombiWizardModal" class="visible"></div>
            <div id="trombiClassBadge"></div>
            <div id="trombiImageInfo"></div>
            <button id="trombiQuickImportBtn" style="display:none;"><span id="trombiQuickImportLabel"></span></button>
            <div id="trombiPageSelectorBar" style="display:none;"></div>
            <button id="trombiStep1NextBtn" disabled></button>
            <div id="trombiDropPlaceholder"></div>
            <div id="trombiDropPreview" style="display:none;"></div>
            <img id="trombiPreviewImg" />
            <div id="trombiDropZone"></div>
            <div id="trombiSampleBtn"></div>
            <div id="trombiStep1"></div>
            <div id="trombiStep2"></div>
            <div id="trombiStep3"></div>
            <div id="trombiStep1Footer"></div>
            <div id="trombiStep2Footer"></div>
            <div id="trombiStep3Footer"></div>
            <div id="trombiImageWithZones"></div>
            <div id="trombiAssignmentGrid"></div>
            <div id="trombiPreviewGrid"></div>
        `;
        TrombinoscopeManager._reset();
    });

    it('should reset PDF-specific state on _reset', () => {
        TrombinoscopeManager._parsedPdfData = { className: '6 2', students: [] };
        TrombinoscopeManager._currentPageIndex = 1;

        const pageBar = document.getElementById('trombiPageSelectorBar');
        pageBar.style.display = 'flex';
        pageBar.innerHTML = '<button>Page 1</button>';

        TrombinoscopeManager._reset();

        expect(TrombinoscopeManager._parsedPdfData).toBeNull();
        expect(TrombinoscopeManager._currentPageIndex).toBe(0);
        expect(pageBar.style.display).toBe('none');
        expect(pageBar.innerHTML).toBe('');
    });

    it('should load PDF and configure UI for quick import and manual adjustment', async () => {
        const { parsePronoteTrombiPdf } = await import('../utils/PronoteTrombiParser.js');
        const mockCanvas = {
            toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,canvasdata')
        };
        parsePronoteTrombiPdf.mockResolvedValueOnce({
            className: '5 1',
            schoolYear: '2024-2025',
            studentsCount: 2,
            students: [
                { id: 's1', nom: 'DUPONT', prenom: 'Jean', photoData: 'data:photo1' },
                { id: 's2', nom: 'MARTIN', prenom: 'Sophie', photoData: 'data:photo2' }
            ],
            numPages: 2,
            pages: [
                {
                    width: 1000,
                    height: 1400,
                    studentsCount: 1,
                    canvas: mockCanvas,
                    zones: [{ id: 1, cx: 200, cy: 300, r: 60, studentId: 's1' }]
                },
                {
                    width: 1000,
                    height: 1400,
                    studentsCount: 1,
                    canvas: mockCanvas,
                    zones: [{ id: 2, cx: 200, cy: 300, r: 60, studentId: 's2' }]
                }
            ]
        });

        const mockFile = new File(['fake pdf content'], 'trombi.pdf', { type: 'application/pdf' });
        await TrombinoscopeManager._loadPdf(mockFile);

        expect(TrombinoscopeManager._parsedPdfData).toBeDefined();
        expect(TrombinoscopeManager._parsedPdfData.className).toBe('5 1');
        expect(document.getElementById('trombiClassBadge').textContent).toBe('Classe 5 1');
        expect(document.getElementById('trombiImageInfo').textContent).toContain('2 élèves détectés • Classe 5 1 (2 pages)');
        
        const nextBtn = document.getElementById('trombiStep1NextBtn');
        expect(nextBtn.disabled).toBe(false);
        expect(nextBtn.innerHTML).toContain('Suivant');
    });

    it('should perform 1-click quick import creating class, students, photos and saving', async () => {
        const { appState } = await import('../state/State.js');
        const { ClassManager } = await import('./ClassManager.js');
        const { StudentPhotoManager } = await import('./StudentPhotoManager.js');
        const { StorageManager } = await import('./StorageManager.js');

        appState.generatedResults = [];
        ClassManager.getAllClasses.mockReturnValue([]);
        ClassManager.createClass.mockReturnValue({ id: 'class-new-5-1', name: '5 1' });
        StudentPhotoManager.bulkAssignPhotos.mockResolvedValue(2);

        const mockCtx = {
            clearRect: vi.fn(),
            drawImage: vi.fn()
        };
        const mockCanvas = {
            width: 1000,
            height: 1400,
            getContext: vi.fn(() => mockCtx)
        };

        TrombinoscopeManager._parsedPdfData = {
            className: '5 1',
            schoolYear: '2024-2025',
            students: [
                { id: 'pdf-1', nom: 'BERNARD', prenom: 'Lucas', photoData: 'data:lucas' },
                { id: 'pdf-2', nom: 'PETIT', prenom: 'Emma', photoData: 'data:emma' }
            ],
            pages: [
                {
                    width: 1000,
                    height: 1400,
                    canvas: mockCanvas,
                    zones: [
                        { id: 1, cx: 100, cy: 100, r: 50, studentId: 'pdf-1' },
                        { id: 2, cx: 200, cy: 100, r: 50, studentId: 'pdf-2' }
                    ]
                }
            ]
        };
        TrombinoscopeManager._zones = TrombinoscopeManager._parsedPdfData.pages[0].zones;

        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

        await TrombinoscopeManager._handleImport();

        expect(ClassManager.createClass).toHaveBeenCalledWith('5 1', '2024-2025');
        expect(ClassManager.switchClass).toHaveBeenCalledWith('class-new-5-1');
        expect(appState.generatedResults.length).toBe(2);
        expect(StudentPhotoManager.bulkAssignPhotos).toHaveBeenCalledWith([
            { studentId: expect.any(String), photoData: expect.any(String) },
            { studentId: expect.any(String), photoData: expect.any(String) }
        ]);
        expect(StorageManager.saveAppState).toHaveBeenCalled();
        expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'studentsUpdated' }));
        expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'classChanged' }));
    });

    it('should switch PDF pages in Step 2 preserving zone changes', () => {
        const canvas1 = { toDataURL: () => 'data:page1' };
        const canvas2 = { toDataURL: () => 'data:page2' };

        TrombinoscopeManager._parsedPdfData = {
            className: '5 1',
            numPages: 2,
            pages: [
                {
                    width: 1000,
                    height: 1400,
                    canvas: canvas1,
                    zones: [{ id: 1, cx: 100, cy: 100, r: 50, studentId: 's1' }]
                },
                {
                    width: 1000,
                    height: 1400,
                    canvas: canvas2,
                    zones: [{ id: 2, cx: 200, cy: 200, r: 50, studentId: 's2' }]
                }
            ]
        };

        TrombinoscopeManager._currentPageIndex = 0;
        TrombinoscopeManager._zones = [{ id: 1, cx: 120, cy: 130, r: 50, studentId: 's1' }]; // modified by user

        // Create Step 2 image
        const panel = document.getElementById('trombiImageWithZones');
        panel.innerHTML = '<div class="trombi-content-wrapper"><img id="trombiStep2Image" /></div>';

        TrombinoscopeManager._switchPdfPage(1);

        // Previous page zones should be saved
        expect(TrombinoscopeManager._parsedPdfData.pages[0].zones[0].cx).toBe(120);
        expect(TrombinoscopeManager._parsedPdfData.pages[0].zones[0].cy).toBe(130);

        // Current page should be page 1 (index 1)
        expect(TrombinoscopeManager._currentPageIndex).toBe(1);
        expect(TrombinoscopeManager._zones.length).toBe(1);
        expect(TrombinoscopeManager._zones[0].id).toBe(2);
        expect(TrombinoscopeManager._zones[0].cx).toBe(200);
    });

    it('should switch preview image in Step 1 when multiple pages exist', () => {
        const canvas1 = { toDataURL: () => 'data:page1' };
        const canvas2 = { toDataURL: () => 'data:page2' };

        document.body.innerHTML += `
            <div id="trombiStep1PageSelectorBar">
                <button class="page-tab-btn active" data-step1-page="0">Page 1</button>
                <button class="page-tab-btn" data-step1-page="1">Page 2</button>
            </div>
            <img id="trombiPreviewImg" src="data:page1" />
        `;

        TrombinoscopeManager._parsedPdfData = {
            className: '5 1',
            numPages: 2,
            pages: [
                { width: 800, height: 1100, canvas: canvas1, studentsCount: 20 },
                { width: 800, height: 1100, canvas: canvas2, studentsCount: 8 }
            ]
        };

        TrombinoscopeManager._previewPdfPageInStep1(1);

        expect(TrombinoscopeManager._currentPageIndex).toBe(1);
        expect(TrombinoscopeManager._imageSrc).toBe('data:page2');
        expect(document.getElementById('trombiPreviewImg').src).toContain('data:page2');

        const tabs = document.querySelectorAll('#trombiStep1PageSelectorBar .page-tab-btn');
        expect(tabs[0].classList.contains('active')).toBe(false);
        expect(tabs[1].classList.contains('active')).toBe(true);
    });

    it('should initialize Step 2 synchronously with parsed PDF zones without wiping them out', () => {
        const canvas = { toDataURL: () => 'data:image/jpeg;base64,...' };
        TrombinoscopeManager._parsedPdfData = {
            className: '6 3',
            numPages: 2,
            pages: [
                {
                    width: 1000,
                    height: 1400,
                    canvas,
                    studentsCount: 20,
                    zones: [
                        { id: 1, cx: 150, cy: 250, r: 48, studentId: 's1' },
                        { id: 2, cx: 350, cy: 250, r: 48, studentId: 's2' }
                    ]
                },
                {
                    width: 1000,
                    height: 1400,
                    canvas,
                    studentsCount: 8,
                    zones: [
                        { id: 21, cx: 150, cy: 250, r: 48, studentId: 's21' }
                    ]
                }
            ],
            students: [
                { id: 's1', nom: 'MARTIN', prenom: 'Léa' },
                { id: 's2', nom: 'BERNARD', prenom: 'Tom' }
            ]
        };
        TrombinoscopeManager._currentPageIndex = 0;
        TrombinoscopeManager._imageSrc = 'data:page1';
        TrombinoscopeManager._imageNaturalWidth = 1000;
        TrombinoscopeManager._imageNaturalHeight = 1400;

        TrombinoscopeManager._initStep2();

        // Zones should be preserved from page 0
        expect(TrombinoscopeManager._zones.length).toBe(2);
        expect(TrombinoscopeManager._zones[0].studentId).toBe('s1');
        expect(TrombinoscopeManager._zones[1].studentId).toBe('s2');

        // Page bar should render 2 buttons
        const pageBar = document.getElementById('trombiPageSelectorBar');
        expect(pageBar.style.display).toBe('flex');
        const buttons = pageBar.querySelectorAll('.page-tab-btn');
        expect(buttons.length).toBe(2);
        expect(buttons[0].classList.contains('active')).toBe(true);
        expect(buttons[1].classList.contains('active')).toBe(false);
    });

    it('should properly synchronize sliders to state in _syncSlidersToState', () => {
        document.body.innerHTML += `
            <input type="range" id="colsSlider" min="1" max="12" value="4" />
            <input type="range" id="rowsSlider" min="1" max="12" value="5" />
            <input type="range" id="gapHSlider" min="-50" max="50" value="0" />
            <input type="range" id="gapVSlider" min="-50" max="50" value="0" />
            <input type="range" id="sizeSlider" min="5" max="100" value="60" />
            <span id="colsValue">4</span>
            <span id="rowsValue">5</span>
            <span id="gapHValue">0</span>
            <span id="gapVValue">0</span>
            <span id="sizeValue">60%</span>
        `;

        TrombinoscopeManager._imageNaturalWidth = 1000;
        TrombinoscopeManager._imageNaturalHeight = 1400;
        TrombinoscopeManager._gridCols = 6;
        TrombinoscopeManager._gridRows = 3;
        TrombinoscopeManager._gapH = 2.5;
        TrombinoscopeManager._gapV = -1;

        TrombinoscopeManager._syncSlidersToState();

        expect(document.getElementById('colsSlider').value).toBe('6');
        expect(document.getElementById('colsValue').textContent).toBe('6');
        expect(document.getElementById('rowsSlider').value).toBe('3');
        expect(document.getElementById('rowsValue').textContent).toBe('3');
        expect(document.getElementById('gapHSlider').value).toBe('2.5');
        expect(document.getElementById('gapHValue').textContent).toBe('2.5');
        expect(document.getElementById('gapVSlider').value).toBe('-1');
        expect(document.getElementById('gapVValue').textContent).toBe('-1');
    });

    it('should compute cumulative page offset across multi-page PDF', () => {
        TrombinoscopeManager._parsedPdfData = {
            numPages: 3,
            pages: [
                { studentsCount: 20, zones: new Array(20).fill({}) },
                { studentsCount: 8, zones: new Array(8).fill({}) },
                { studentsCount: 5, zones: new Array(5).fill({}) }
            ]
        };

        expect(TrombinoscopeManager._getPageOffset(0)).toBe(0);
        expect(TrombinoscopeManager._getPageOffset(1)).toBe(20);
        expect(TrombinoscopeManager._getPageOffset(2)).toBe(28);
    });

    it('should handle zoom operations correctly', () => {
        document.body.innerHTML = `
            <div class="trombi-content-wrapper" style="width: 100%;">
                <div id="trombiZonesOverlay"></div>
                <img id="trombiStep2Image" src="" />
            </div>
            <span id="trombiZoomLevel">100%</span>
        `;

        TrombinoscopeManager._zoomLevel = 1.0;

        TrombinoscopeManager._zoomIn();
        expect(TrombinoscopeManager._zoomLevel).toBe(1.25);
        expect(document.getElementById('trombiZoomLevel').textContent).toBe('125%');

        TrombinoscopeManager._zoomOut();
        expect(TrombinoscopeManager._zoomLevel).toBe(1.0);
        expect(document.getElementById('trombiZoomLevel').textContent).toBe('100%');

        TrombinoscopeManager._zoomToggleFit();
        expect(TrombinoscopeManager._zoomLevel).toBe(1.5);
        expect(document.getElementById('trombiZoomLevel').textContent).toBe('150%');

        TrombinoscopeManager._zoomReset();
        expect(TrombinoscopeManager._zoomLevel).toBe(1.0);
        expect(document.getElementById('trombiZoomLevel').textContent).toBe('100%');
    });

    it('should strictly preserve natural aspect ratio across zoom levels with zero distortion', () => {
        document.body.innerHTML = `
            <div class="trombi-viewport" style="width: 800px; height: 600px;">
                <div class="trombi-content-wrapper">
                    <img id="trombiStep2Image" src="" />
                    <div id="trombiZonesOverlay"></div>
                </div>
            </div>
            <span id="trombiZoomLevel">100%</span>
            <button id="trombiZoomOutBtn"></button>
        `;

        const viewport = document.querySelector('.trombi-viewport');
        Object.defineProperty(viewport, 'offsetWidth', { value: 800, configurable: true });
        Object.defineProperty(viewport, 'offsetHeight', { value: 600, configurable: true });
        Object.defineProperty(viewport, 'clientWidth', { value: 800, configurable: true });
        Object.defineProperty(viewport, 'clientHeight', { value: 600, configurable: true });

        // Natural A4 dimensions (1190 x 1684 px)
        TrombinoscopeManager._imageNaturalWidth = 1190;
        TrombinoscopeManager._imageNaturalHeight = 1684;
        const naturalRatio = 1190 / 1684;

        const wrapper = document.querySelector('.trombi-content-wrapper');

        // Test at 100% (Fit)
        TrombinoscopeManager._zoomLevel = 1.0;
        TrombinoscopeManager._applyZoom();
        const w100 = parseFloat(wrapper.style.width);
        const h100 = parseFloat(wrapper.style.height);
        expect(w100 / h100).toBeCloseTo(naturalRatio, 2);

        // Test at 150%
        TrombinoscopeManager._zoomLevel = 1.5;
        TrombinoscopeManager._applyZoom();
        const w150 = parseFloat(wrapper.style.width);
        const h150 = parseFloat(wrapper.style.height);
        expect(w150 / h150).toBeCloseTo(naturalRatio, 2);
        expect(Math.abs(w150 - w100 * 1.5)).toBeLessThanOrEqual(1);
        expect(Math.abs(h150 - h100 * 1.5)).toBeLessThanOrEqual(1);

        // Test at 200%
        TrombinoscopeManager._zoomLevel = 2.0;
        TrombinoscopeManager._applyZoom();
        const w200 = parseFloat(wrapper.style.width);
        const h200 = parseFloat(wrapper.style.height);
        expect(w200 / h200).toBeCloseTo(naturalRatio, 2);
        expect(Math.abs(w200 - w100 * 2.0)).toBeLessThanOrEqual(1);
        expect(Math.abs(h200 - h100 * 2.0)).toBeLessThanOrEqual(1);
    });

    it('should update radius on all active zones when size slider changes in _updateSizeFromPercent', () => {
        TrombinoscopeManager._imageNaturalWidth = 1000;
        TrombinoscopeManager._imageNaturalHeight = 1000;
        TrombinoscopeManager._zones = [
            { id: 1, cx: 100, cy: 100, r: 30 },
            { id: 2, cx: 200, cy: 100, r: 30 }
        ];
        TrombinoscopeManager._parsedPdfData = {
            pages: [
                { zones: [{ id: 1, r: 30 }, { id: 2, r: 30 }] }
            ]
        };
        TrombinoscopeManager._currentPageIndex = 0;

        TrombinoscopeManager._updateSizeFromPercent(50);

        expect(TrombinoscopeManager._globalRadius).toBeGreaterThan(0);
        expect(TrombinoscopeManager._zones[0].r).toBe(TrombinoscopeManager._globalRadius);
        expect(TrombinoscopeManager._zones[1].r).toBe(TrombinoscopeManager._globalRadius);
        expect(TrombinoscopeManager._parsedPdfData.pages[0].zones[0].r).toBe(TrombinoscopeManager._globalRadius);
    });

    it('should render correct continuous indices on page 2 in assignment grid', () => {
        document.body.innerHTML = `
            <div id="trombiAssignmentGrid"></div>
            <span id="trombiZonesInfo"></span>
        `;

        TrombinoscopeManager._parsedPdfData = {
            numPages: 2,
            pages: [
                { studentsCount: 20, zones: new Array(20).fill({ id: 1, studentId: null }) },
                {
                    studentsCount: 2,
                    zones: [
                        { id: 21, studentId: 'trombi-student-1-0' },
                        { id: 22, studentId: 'trombi-student-1-1' }
                    ]
                }
            ],
            students: [
                { id: 'trombi-student-1-0', nom: 'MOREAU', prenom: 'Greatness' },
                { id: 'trombi-student-1-1', nom: 'MUNIER BOIVIN', prenom: 'Louis' }
            ]
        };
        TrombinoscopeManager._currentPageIndex = 1;
        TrombinoscopeManager._zones = [
            { id: 21, studentId: 'trombi-student-1-0' },
            { id: 22, studentId: 'trombi-student-1-1' }
        ];

        TrombinoscopeManager._renderAssignmentGrid();

        const grid = document.getElementById('trombiAssignmentGrid');
        const ids = grid.querySelectorAll('.assignment-id');
        expect(ids[0].textContent.trim()).toBe('#21');
        expect(ids[1].textContent.trim()).toBe('#22');

        const selects = grid.querySelectorAll('.assignment-select');
        expect(selects[0].value).toBe('trombi-student-1-0');
        expect(selects[1].value).toBe('trombi-student-1-1');
    });

    it('should clamp zoom to minimum 1.0 (100%) and update zoomOutBtn disabled state', () => {
        document.body.innerHTML = `
            <div class="trombi-content-wrapper" style="width: 100%;">
                <div id="trombiZonesOverlay"></div>
                <img id="trombiStep2Image" src="" />
            </div>
            <button id="trombiZoomOutBtn"></button>
            <span id="trombiZoomLevel">100%</span>
        `;

        TrombinoscopeManager._zoomLevel = 1.0;
        TrombinoscopeManager._zoomOut();
        expect(TrombinoscopeManager._zoomLevel).toBe(1.0);
        expect(document.getElementById('trombiZoomOutBtn').disabled).toBe(true);

        TrombinoscopeManager._zoomIn();
        expect(TrombinoscopeManager._zoomLevel).toBe(1.25);
        expect(document.getElementById('trombiZoomOutBtn').disabled).toBe(false);

        TrombinoscopeManager._zoomOut();
        expect(TrombinoscopeManager._zoomLevel).toBe(1.0);
        expect(document.getElementById('trombiZoomOutBtn').disabled).toBe(true);
    });

    it('should protect PDF mode by hiding grid sliders and restoring pristine originalZones on reset', () => {
        document.body.innerHTML = `
            <div class="trombi-image-panel"></div>
            <div id="trombiZonesOverlay"></div>
            <img id="trombiStep2Image" src="" />
            <div id="trombiAssignmentGrid"></div>
        `;

        const originalZones = [
            { id: 1, cx: 120, cy: 150, r: 40, studentId: 's1' },
            { id: 2, cx: 240, cy: 150, r: 40, studentId: 's2' }
        ];

        TrombinoscopeManager._parsedPdfData = {
            numPages: 1,
            pages: [
                {
                    studentsCount: 2,
                    zones: originalZones.map(z => ({ ...z })),
                    originalZones: originalZones.map(z => ({ ...z }))
                }
            ],
            students: [{ id: 's1', nom: 'DUPONT', prenom: 'Alice' }, { id: 's2', nom: 'DURAND', prenom: 'Bob' }]
        };
        TrombinoscopeManager._currentPageIndex = 0;
        TrombinoscopeManager._zones = originalZones.map(z => ({ ...z }));

        TrombinoscopeManager._setupControlPanel();

        // In PDF mode with detected students, advanced grid controls are in a collapsed drawer by default
        const advancedDrawer = document.getElementById('gridAdvancedControls');
        expect(advancedDrawer).not.toBeNull();
        expect(advancedDrawer.classList.contains('is-open')).toBe(false);

        // Toggle button is rendered
        const toggleBtn = document.getElementById('toggleGridToolsBtn');
        expect(toggleBtn).not.toBeNull();

        // Clicking toggle button opens the drawer
        toggleBtn.click();
        expect(advancedDrawer.classList.contains('is-open')).toBe(true);

        // Sliders exist inside drawer
        expect(document.getElementById('colsSlider')).not.toBeNull();
        expect(document.getElementById('rowsSlider')).not.toBeNull();
        expect(document.getElementById('gapHSlider')).not.toBeNull();
        expect(document.getElementById('gapVSlider')).not.toBeNull();

        // But sizeSlider, groupedDragToggle, gridResetBtn ARE rendered
        expect(document.getElementById('sizeSlider')).not.toBeNull();
        expect(document.getElementById('gridResetBtn')).not.toBeNull();

        // Simulate user moving a zone
        TrombinoscopeManager._zones[0].cx = 999;
        expect(TrombinoscopeManager._zones[0].cx).toBe(999);

        // Click Reset
        document.getElementById('gridResetBtn').click();

        // Verify original coordinates are restored
        expect(TrombinoscopeManager._zones[0].cx).toBe(120);
        expect(TrombinoscopeManager._zones[0].cy).toBe(150);
        expect(TrombinoscopeManager._zones.length).toBe(2);
    });

    it('should open advanced grid controls by default if PDF has no detected students (e.g. scanned/non-Pronote)', () => {
        document.body.innerHTML = `
            <div class="trombi-image-panel"></div>
            <div id="trombiZonesOverlay"></div>
            <img id="trombiStep2Image" src="" />
            <div id="trombiAssignmentGrid"></div>
        `;
        TrombinoscopeManager._parsedPdfData = {
            numPages: 1,
            pages: [{ studentsCount: 0, zones: [], originalZones: [] }],
            students: []
        };
        TrombinoscopeManager._currentPageIndex = 0;
        TrombinoscopeManager._zones = [];

        TrombinoscopeManager._setupControlPanel();

        const advancedDrawer = document.getElementById('gridAdvancedControls');
        expect(advancedDrawer).not.toBeNull();
        expect(advancedDrawer.classList.contains('is-open')).toBe(true);
    });

    it('should synchronize grouped drag offset and radius across all PDF pages', () => {
        const page1Zones = [
            { id: 1, cx: 100, cy: 100, r: 30 },
            { id: 2, cx: 200, cy: 100, r: 30 }
        ];
        const page2Zones = [
            { id: 21, cx: 100, cy: 100, r: 30 },
            { id: 22, cx: 200, cy: 100, r: 30 }
        ];

        TrombinoscopeManager._imageNaturalWidth = 1000;
        TrombinoscopeManager._imageNaturalHeight = 1000;
        TrombinoscopeManager._globalRadius = 30;
        TrombinoscopeManager._groupedDrag = true;
        TrombinoscopeManager._currentPageIndex = 0;
        TrombinoscopeManager._zones = page1Zones.map(z => ({ ...z }));
        TrombinoscopeManager._parsedPdfData = {
            numPages: 2,
            pages: [
                {
                    zones: page1Zones.map(z => ({ ...z })),
                    originalZones: page1Zones.map(z => ({ ...z }))
                },
                {
                    zones: page2Zones.map(z => ({ ...z })),
                    originalZones: page2Zones.map(z => ({ ...z }))
                }
            ],
            students: []
        };

        // 1. Test radius synchronization across all pages
        TrombinoscopeManager._updateSizeFromPercent(50);
        expect(TrombinoscopeManager._zones[0].r).toBe(TrombinoscopeManager._globalRadius);
        expect(TrombinoscopeManager._parsedPdfData.pages[0].zones[0].r).toBe(TrombinoscopeManager._globalRadius);
        expect(TrombinoscopeManager._parsedPdfData.pages[1].zones[0].r).toBe(TrombinoscopeManager._globalRadius);

        // 2. Test grouped drag delta propagation across pages via mouse events
        document.body.innerHTML = `
            <div id="trombiZonesOverlay" style="width: 500px; height: 500px;">
                <div class="trombi-zone" data-zone-id="1"></div>
                <div class="trombi-zone" data-zone-id="2"></div>
            </div>
            <div id="trombiAssignmentGrid"></div>
        `;
        const overlay = document.getElementById('trombiZonesOverlay');
        overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 500 });

        // Simulate mousedown on zone 1
        const mockTarget = overlay.querySelector('[data-zone-id="1"]');
        const downEvent = {
            currentTarget: mockTarget,
            clientX: 50,
            clientY: 50,
            preventDefault: () => {},
            target: { closest: () => null }
        };
        TrombinoscopeManager._handleZoneMouseDown(downEvent);

        // Simulate mousemove by +20px in natural coordinates (+10px clientX)
        const moveEvent = {
            clientX: 60,
            clientY: 55
        };
        TrombinoscopeManager._handleMouseMove(moveEvent);

        // Page 1 zones moved
        expect(TrombinoscopeManager._zones[0].cx).toBeGreaterThan(100);
        const deltaX = TrombinoscopeManager._zones[0].cx - 100;
        const deltaY = TrombinoscopeManager._zones[0].cy - 100;

        // Page 2 zones ALSO moved by the same delta!
        expect(TrombinoscopeManager._parsedPdfData.pages[1].zones[0].cx).toBeCloseTo(100 + deltaX, 2);
        expect(TrombinoscopeManager._parsedPdfData.pages[1].zones[0].cy).toBeCloseTo(100 + deltaY, 2);
    });
});


