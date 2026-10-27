/**
 * @fileoverview TrombiZoneEditor — Manipulation interactive des zones circulaires, contrôles de grille et historique Undo/Redo
 * Extrait de TrombinoscopeManager.js (Lot 12 — Découpage God Object #2)
 * @module managers/trombinoscope/TrombiZoneEditor
 */

import { appState } from '../../state/State.js';
import { ModalUI } from '../ModalUIManager.js';

export const TrombiZoneEditor = {
    setupControlPanel(manager) {
        if (manager._controlPanelAbortController) {
            manager._controlPanelAbortController.abort();
        }
        manager._controlPanelAbortController = new AbortController();
        const { signal } = manager._controlPanelAbortController;

        const container = document.querySelector('.trombi-image-panel');
        const hasExistingControls = Boolean(
            container?.querySelector('.grid-control-panel') || document.getElementById('toggleGridToolsBtn')
        );
        if (!container && !hasExistingControls) return;

        const isPdf = !!manager._parsedPdfData;
        const hasDetectedStudents = Boolean(manager._parsedPdfData?.students?.length > 0);

        if (isPdf) {
            const currentPage = manager._parsedPdfData.pages[manager._currentPageIndex];
            const count = currentPage?.studentsCount || manager._zones.length || 8;
            manager._gridCols = 4;
            manager._gridRows = Math.ceil(count / 4);
        } else {
            // Default values
            manager._gridCols = 4;
            manager._gridRows = Math.ceil((manager._getStudentsForImport().length || 8) / 4);
        }
        manager._gapH = 0;  // Horizontal spacing between zones (%)
        manager._gapV = 0;  // Vertical spacing between zones (%)
        manager._groupedDrag = true; // Grouped drag mode (default = true)

        const isAdvancedOpen = !hasDetectedStudents;
        const resetLabel = hasDetectedStudents ? 'Rétablir les détections d\'origine' : 'Réinitialiser la grille';

        if (!hasExistingControls && container) {
            const gridControlsHtml = `
                <div class="grid-advanced-controls ${isAdvancedOpen ? 'is-open' : ''}" id="gridAdvancedControls">
                    <div class="grid-advanced-controls-inner">
                        <div class="control-row-group">
                            <div class="control-row">
                                <label for="colsSlider">Colonnes</label>
                                <div class="slider-group">
                                    <div class="slider-track">
                                        <input type="range" class="control-slider" id="colsSlider" 
                                               min="1" max="12" value="${manager._gridCols}">
                                    </div>
                                    <span class="slider-value" id="colsValue">${manager._gridCols}</span>
                                </div>
                            </div>
                            <div class="control-row">
                                <label for="rowsSlider">Lignes</label>
                                <div class="slider-group">
                                    <div class="slider-track">
                                        <input type="range" class="control-slider" id="rowsSlider" 
                                               min="1" max="12" value="${manager._gridRows}">
                                    </div>
                                    <span class="slider-value" id="rowsValue">${manager._gridRows}</span>
                                </div>
                            </div>
                        </div>
                        <div class="control-row-group">
                            <div class="control-row">
                                <label for="gapHSlider">Écart H</label>
                                <div class="slider-group">
                                    <div class="slider-track">
                                        <input type="range" class="control-slider" id="gapHSlider" 
                                               min="-50" max="50" step="0.5" value="0">
                                    </div>
                                    <span class="slider-value" id="gapHValue">0</span>
                                </div>
                            </div>
                            <div class="control-row">
                                <label for="gapVSlider">Écart V</label>
                                <div class="slider-group">
                                    <div class="slider-track">
                                        <input type="range" class="control-slider" id="gapVSlider" 
                                               min="-50" max="50" step="0.5" value="0">
                                    </div>
                                    <span class="slider-value" id="gapVValue">0</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const panelHtml = `
                <div class="grid-control-panel">
                    ${gridControlsHtml}
                    <div class="grid-main-controls" role="toolbar" aria-label="Outils d'ajustement de la grille">
                        <div class="control-row control-row-size">
                            <label for="sizeSlider">Taille</label>
                            <div class="slider-group">
                                <div class="slider-track">
                                    <input type="range" class="control-slider" id="sizeSlider" 
                                           min="5" max="100" value="60">
                                </div>
                                <span class="slider-value" id="sizeValue">60%</span>
                            </div>
                        </div>
                        <span class="grid-toolbar-divider" aria-hidden="true"></span>
                        <div class="grid-toolbar-center">
                            <label class="sync-toggle-label" for="groupedDragToggle">
                                <span class="toggle-text">Groupé</span>
                                <span class="toggle-switch small">
                                    <input type="checkbox" id="groupedDragToggle" checked>
                                    <span class="slider"></span>
                                </span>
                            </label>
                            <button type="button" class="grid-tools-toggle-btn ${isAdvancedOpen ? 'active' : ''}" id="toggleGridToolsBtn" aria-expanded="${isAdvancedOpen}" data-tooltip="Afficher ou masquer les réglages avancés de grille et d'espacement">
                                <iconify-icon icon="solar:tuning-square-2-linear"></iconify-icon>
                                <span>Grille</span>
                                <iconify-icon icon="solar:alt-arrow-down-linear" class="toggle-chevron"></iconify-icon>
                            </button>
                        </div>
                        <div class="grid-control-actions">
                            <button type="button" class="grid-reset-btn" id="trombiUndoBtn" aria-label="Annuler (Ctrl+Z)" data-tooltip="Annuler (Ctrl+Z)" disabled>
                                <iconify-icon icon="solar:undo-left-round-linear"></iconify-icon>
                            </button>
                            <button type="button" class="grid-reset-btn" id="trombiRedoBtn" aria-label="Rétablir (Ctrl+Y)" data-tooltip="Rétablir (Ctrl+Y)" disabled>
                                <iconify-icon icon="solar:undo-right-round-linear"></iconify-icon>
                            </button>
                            <button type="button" class="grid-reset-btn" id="gridResetBtn" aria-label="${resetLabel}" data-tooltip="${resetLabel}">
                                <iconify-icon icon="solar:restart-linear"></iconify-icon>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', panelHtml);
        }

        // Bind slider events - instant grid update
        const colsSlider = document.getElementById('colsSlider');
        const rowsSlider = document.getElementById('rowsSlider');
        const sizeSlider = document.getElementById('sizeSlider');
        const gapHSlider = document.getElementById('gapHSlider');
        const gapVSlider = document.getElementById('gapVSlider');
        const groupedToggle = document.getElementById('groupedDragToggle');
        const colsValue = document.getElementById('colsValue');
        const rowsValue = document.getElementById('rowsValue');
        const sizeValue = document.getElementById('sizeValue');
        const gapHValue = document.getElementById('gapHValue');
        const gapVValue = document.getElementById('gapVValue');

        colsSlider?.addEventListener('input', e => {
            manager._gridCols = parseInt(e.target.value);
            if (colsValue) colsValue.textContent = manager._gridCols;
            manager._createGridSilent(manager._gridCols, manager._gridRows);
        }, { signal });

        rowsSlider?.addEventListener('input', e => {
            manager._gridRows = parseInt(e.target.value);
            if (rowsValue) rowsValue.textContent = manager._gridRows;
            manager._createGridSilent(manager._gridCols, manager._gridRows);
        }, { signal });

        sizeSlider?.addEventListener('input', e => {
            const percent = parseInt(e.target.value);
            if (sizeValue) sizeValue.textContent = percent + '%';
            manager._updateSizeFromPercent(percent);
        }, { signal });

        // Track focus on size slider for keyboard navigation
        sizeSlider?.addEventListener('focus', () => {
            manager._lastFocusedControl = 'size';
        }, { signal });
        sizeSlider?.addEventListener('mousedown', () => {
            manager._lastFocusedControl = 'size';
        }, { signal });

        gapHSlider?.addEventListener('input', e => {
            manager._gapH = parseFloat(e.target.value);
            if (gapHValue) gapHValue.textContent = Number.isInteger(manager._gapH) ? manager._gapH : manager._gapH.toFixed(1);
            manager._applyGaps();
        }, { signal });

        gapVSlider?.addEventListener('input', e => {
            manager._gapV = parseFloat(e.target.value);
            if (gapVValue) gapVValue.textContent = Number.isInteger(manager._gapV) ? manager._gapV : manager._gapV.toFixed(1);
            manager._applyGaps();
        }, { signal });

        // Track focus on gap sliders for keyboard navigation
        gapHSlider?.addEventListener('focus', () => {
            manager._lastFocusedControl = 'gaps';
        }, { signal });
        gapVSlider?.addEventListener('focus', () => {
            manager._lastFocusedControl = 'gaps';
        }, { signal });
        gapHSlider?.addEventListener('mousedown', () => {
            manager._lastFocusedControl = 'gaps';
        }, { signal });
        gapVSlider?.addEventListener('mousedown', () => {
            manager._lastFocusedControl = 'gaps';
        }, { signal });

        groupedToggle?.addEventListener('change', e => {
            manager._groupedDrag = e.target.checked;
            manager._restoreGroupedDrag = false;
        }, { signal });

        const toggleBtn = document.getElementById('toggleGridToolsBtn');
        const advancedDrawer = document.getElementById('gridAdvancedControls');

        toggleBtn?.addEventListener('click', () => {
            if (!advancedDrawer) return;
            const wrapper = document.querySelector('.trombi-content-wrapper');
            const rBefore = wrapper?.getBoundingClientRect?.() || null;

            if (manager._zoomAnimCleanup) {
                manager._zoomAnimCleanup();
                manager._zoomAnimCleanup = null;
            }

            const isOpen = advancedDrawer.classList.toggle('is-open');
            toggleBtn.classList.toggle('active', isOpen);
            toggleBtn.setAttribute('aria-expanded', String(isOpen));

            manager._applyZoom();
            if (rBefore && rBefore.width > 0) {
                manager._animateSheetFLIP(rBefore);
            }
        }, { signal });

        // Bind Undo slider drag listeners
        const bindSliderUndo = (slider) => {
            if (!slider) return;
            const handleStart = () => {
                manager._tempSliderSnapshot = manager._getCurrentStateSnapshot();
            };
            slider.addEventListener('mousedown', handleStart, { signal });
            slider.addEventListener('touchstart', handleStart, { signal });
            slider.addEventListener('change', () => {
                if (manager._tempSliderSnapshot) {
                    const hasChanged = manager._gridCols !== manager._tempSliderSnapshot.gridCols ||
                                     manager._gridRows !== manager._tempSliderSnapshot.gridRows ||
                                     manager._gapH !== manager._tempSliderSnapshot.gapH ||
                                     manager._gapV !== manager._tempSliderSnapshot.gapV ||
                                     manager._globalRadius !== manager._tempSliderSnapshot.globalRadius;
                    if (hasChanged) {
                        manager._saveState(manager._tempSliderSnapshot);
                    }
                    manager._tempSliderSnapshot = null;
                }
            }, { signal });
        };

        bindSliderUndo(colsSlider);
        bindSliderUndo(rowsSlider);
        bindSliderUndo(gapHSlider);
        bindSliderUndo(gapVSlider);
        bindSliderUndo(sizeSlider);

        document.getElementById('trombiUndoBtn')?.addEventListener('click', () => {
            manager._undo();
        }, { signal });

        document.getElementById('trombiRedoBtn')?.addEventListener('click', () => {
            manager._redo();
        }, { signal });

        document.getElementById('gridResetBtn')?.addEventListener('click', () => {
            manager._saveState();

            if (manager._parsedPdfData && hasDetectedStudents) {
                manager._parsedPdfData.pages.forEach(p => {
                    if (p.originalZones) {
                        p.zones = p.originalZones.map(z => ({ ...z }));
                    }
                });
                const currentPage = manager._parsedPdfData.pages[manager._currentPageIndex];
                if (currentPage && currentPage.zones) {
                    manager._zones = currentPage.zones.map(z => ({ ...z }));
                }
                if (manager._zones.length > 0 && manager._zones[0].r) {
                    manager._globalRadius = manager._zones[0].r;
                }
                manager._gapH = 0;
                manager._gapV = 0;
                if (gapHSlider) { gapHSlider.value = 0; if (gapHValue) gapHValue.textContent = '0'; }
                if (gapVSlider) { gapVSlider.value = 0; if (gapVValue) gapVValue.textContent = '0'; }
                manager._renderZones();
                manager._renderAssignmentGrid();
                manager._updateSizeSliderValue();
                return;
            }

            manager._zones = [];
            manager._createDefaultGrid();
        }, { signal });

        // Only create initial grid if we don't have any zones yet and no PDF data
        if (manager._zones.length === 0 && !manager._parsedPdfData) {
            manager._createDefaultGrid();
        } else {
            manager._syncSlidersToState();
        }
    },

    syncSlidersToState(manager) {
        const colsSlider = document.getElementById('colsSlider');
        const rowsSlider = document.getElementById('rowsSlider');
        const gapHSlider = document.getElementById('gapHSlider');
        const gapVSlider = document.getElementById('gapVSlider');
        const colsValue = document.getElementById('colsValue');
        const rowsValue = document.getElementById('rowsValue');
        const gapHValue = document.getElementById('gapHValue');
        const gapVValue = document.getElementById('gapVValue');

        if (colsSlider && manager._gridCols) {
            colsSlider.value = manager._gridCols;
            if (colsValue) colsValue.textContent = manager._gridCols;
        }
        if (rowsSlider && manager._gridRows) {
            rowsSlider.value = manager._gridRows;
            if (rowsValue) rowsValue.textContent = manager._gridRows;
        }
        if (gapHSlider) {
            gapHSlider.value = manager._gapH ?? 0;
            if (gapHValue) gapHValue.textContent = Number.isInteger(manager._gapH) ? manager._gapH : (manager._gapH ?? 0).toFixed(1);
        }
        if (gapVSlider) {
            gapVSlider.value = manager._gapV ?? 0;
            if (gapVValue) gapVValue.textContent = Number.isInteger(manager._gapV) ? manager._gapV : (manager._gapV ?? 0).toFixed(1);
        }
        manager._updateSizeSliderValue();
    },

    applyGaps(manager) {
        if (manager._zones.length === 0) return;

        const cols = manager._gridCols || 4;
        const w = manager._imageNaturalWidth;
        const h = manager._imageNaturalHeight;

        const currentPage = manager._parsedPdfData?.pages?.[manager._currentPageIndex];
        const hasOriginalZones = Boolean(currentPage?.originalZones && currentPage.originalZones.length === manager._zones.length);

        if (hasOriginalZones) {
            const baseCellW = w / cols;
            const baseCellH = h / Math.ceil(manager._zones.length / cols);
            const gapPxH = (manager._gapH / 100) * baseCellW;
            const gapPxV = (manager._gapV / 100) * baseCellH;
            const centerCol = (cols - 1) / 2;

            manager._zones.forEach((zone, idx) => {
                const orig = currentPage.originalZones[idx];
                if (!orig) return;
                const col = idx % cols;
                const row = Math.floor(idx / cols);

                zone.cx = orig.cx + (col - centerCol) * gapPxH;
                zone.cy = orig.cy + row * gapPxV;
            });

            if (manager._parsedPdfData?.pages && manager._groupedDrag) {
                manager._parsedPdfData.pages.forEach((p, pIdx) => {
                    if (pIdx === manager._currentPageIndex) return;
                    const pOrig = p.originalZones;
                    if (pOrig && p.zones && p.zones.length === pOrig.length) {
                        const pCellW = (p.width || w) / cols;
                        const pCellH = (p.height || h) / Math.ceil(p.zones.length / cols);
                        const pGapH = (manager._gapH / 100) * pCellW;
                        const pGapV = (manager._gapV / 100) * pCellH;

                        p.zones.forEach((z, idx) => {
                            const orig = pOrig[idx];
                            if (!orig) return;
                            const col = idx % cols;
                            const row = Math.floor(idx / cols);
                            z.cx = orig.cx + (col - centerCol) * pGapH;
                            z.cy = orig.cy + row * pGapV;
                        });
                    }
                });
            }
        } else {
            // Base cell size
            const baseCellW = w / cols;
            const baseCellH = h / Math.ceil(manager._zones.length / cols);

            // The first zone (index 0) is the reference - it stays fixed
            const refZone = manager._zones[0];
            const refCx = refZone.cx;
            const refCy = refZone.cy;

            // Gap adjustment (% of cell size) - affects spacing between zones
            const gapPxH = (manager._gapH / 100) * baseCellW;
            const gapPxV = (manager._gapV / 100) * baseCellH;

            manager._zones.forEach((zone, idx) => {
                if (idx === 0) return; // Skip first zone - it's the reference

                const col = idx % cols;
                const row = Math.floor(idx / cols);

                // Position relative to first zone with gap applied
                // Each column/row adds base cell size + gap adjustment
                zone.cx = refCx + (col * (baseCellW + gapPxH));
                zone.cy = refCy + (row * (baseCellH + gapPxV));
            });
        }

        manager._renderZones();
        manager._updateLivePreviews();
    },

    applyGapsInternal(manager, baseCellW, baseCellH) {
        if (manager._zones.length === 0) return;

        const cols = manager._gridCols;
        const refZone = manager._zones[0];
        const refCx = refZone.cx;
        const refCy = refZone.cy;

        // Gap adjustment (% of cell size)
        const gapPxH = (manager._gapH / 100) * baseCellW;
        const gapPxV = (manager._gapV / 100) * baseCellH;

        manager._zones.forEach((zone, idx) => {
            if (idx === 0) return;

            const col = idx % cols;
            const row = Math.floor(idx / cols);

            zone.cx = refCx + (col * (baseCellW + gapPxH));
            zone.cy = refCy + (row * (baseCellH + gapPxV));
        });
    },

    updateSizeFromPercent(manager, percent) {
        if (!manager._imageNaturalWidth) return;
        const minSize = Math.min(manager._imageNaturalWidth, manager._imageNaturalHeight);
        const minR = minSize * 0.03;
        const maxR = minSize * 0.25;
        manager._globalRadius = minR + (maxR - minR) * (percent / 100);
        manager._zones.forEach(z => {
            z.r = manager._globalRadius;
        });
        if (manager._parsedPdfData?.pages) {
            manager._parsedPdfData.pages.forEach(page => {
                page.zones?.forEach(z => {
                    z.r = manager._globalRadius;
                });
            });
        }
        manager._renderZones();
        manager._updateLivePreviews();
    },

    createGrid(manager, cols, rows, preserveReference = false, silent = false, initialRef = null) {
        // Save the reference zone position if we want to preserve it or apply initial calibration
        let refCx = initialRef?.refCx ?? null;
        let refCy = initialRef?.refCy ?? null;
        if (preserveReference && manager._zones.length > 0) {
            refCx = manager._zones[0].cx;
            refCy = manager._zones[0].cy;
        }

        manager._zones = [];
        manager._zoneIdCounter = 0;
        manager._selectedZoneIds.clear();

        const w = manager._imageNaturalWidth;
        const h = manager._imageNaturalHeight;

        // Cell dimensions
        const cellW = w / cols;
        const cellH = h / rows;

        // Global radius = 34.5% of the smaller cell dimension (fits portrait medallions without overlapping captions)
        manager._globalRadius = Math.min(cellW, cellH) * 0.345;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                manager._zones.push({
                    id: manager._zoneIdCounter++,
                    studentId: null,
                    cx: cellW * (col + 0.5),
                    cy: cellH * (row + 0.5)
                });
            }
        }

        // Apply reference position and/or gaps if present
        if (manager._zones.length > 0 && (refCx !== null || refCy !== null || manager._gapH || manager._gapV)) {
            if (refCx !== null) manager._zones[0].cx = refCx;
            if (refCy !== null) manager._zones[0].cy = refCy;
            manager._applyGapsInternal(cellW, cellH);
        }

        if (!silent) {
            manager._renderZones();
            manager._renderAssignmentGrid();
            manager._updateSizeSliderValue();
        }
    },

    createGridSilent(manager, cols, rows, initialRef = null) {
        const hasExistingZones = manager._zones.length > 0;
        manager._createGrid(cols, rows, hasExistingZones, true, initialRef);
        manager._autoAssignSilent(true);

        manager._renderZones();
        manager._renderAssignmentGrid();
        manager._updateSizeSliderValue();
    },

    updateSizeSliderValue(manager) {
        const sizeSlider = document.getElementById('sizeSlider');
        const sizeValue = document.getElementById('sizeValue');
        if (!sizeSlider || !manager._imageNaturalWidth) return;

        const minSize = Math.min(manager._imageNaturalWidth, manager._imageNaturalHeight);
        const minR = minSize * 0.03;
        const maxR = minSize * 0.25;
        const percent = Math.round(((manager._globalRadius - minR) / (maxR - minR)) * 100);
        sizeSlider.value = percent;
        if (sizeValue) sizeValue.textContent = percent + '%';
    },

    setupSizeSlider(manager) {
        const container = document.querySelector('.trombi-image-panel');
        if (!container || container.querySelector('.size-slider-container')) return;

        const minSize = Math.min(manager._imageNaturalWidth, manager._imageNaturalHeight);
        const minR = minSize * 0.03;
        const maxR = minSize * 0.25;
        const currentR = manager._globalRadius;

        const sliderHtml = `
            <div class="size-slider-container">
                <label>Taille</label>
                <input type="range" class="control-slider size-slider" 
                       min="${minR}" max="${maxR}" value="${currentR}" step="1">
            </div>
        `;
        container.insertAdjacentHTML('beforeend', sliderHtml);

        const slider = container.querySelector('.size-slider');
        slider.addEventListener('input', e => {
            manager._globalRadius = parseFloat(e.target.value);
            manager._renderZones();
            manager._updateLivePreviews();
        });
    },

    addZoneAtClick(manager, e) {
        manager._saveState();
        const overlay = document.getElementById('trombiZonesOverlay');
        const img = document.getElementById('trombiStep2Image');
        if (!overlay || !img) return;

        const rect = overlay.getBoundingClientRect();
        const clickX = (e.clientX - rect.left) / rect.width;
        const clickY = (e.clientY - rect.top) / rect.height;

        // Convert to natural pixels
        const cx = clickX * manager._imageNaturalWidth;
        const cy = clickY * manager._imageNaturalHeight;

        // Set default global radius if not yet set
        if (!manager._globalRadius) {
            manager._globalRadius = Math.min(manager._imageNaturalWidth, manager._imageNaturalHeight) * 0.08;
        }

        manager._zones.push({
            id: manager._zoneIdCounter++,
            studentId: null,
            cx, cy
        });

        manager._renderZones();
        manager._renderAssignmentGrid();
    },

    removeZone(manager, zoneId) {
        manager._closeStudentPopover();
        manager._saveState();
        manager._selectedZoneIds.delete(zoneId);
        if (manager._lastFocusedZoneId === zoneId) {
            manager._lastFocusedZoneId = null;
        }
        manager._zones = manager._zones.filter(z => z.id !== zoneId);
        manager._renderZones();
        manager._renderAssignmentGrid();
    },

    renderZones(manager, explicitW, explicitH) {
        const overlay = document.getElementById('trombiZonesOverlay');
        const img = document.getElementById('trombiStep2Image');
        const wrapper = document.querySelector('.trombi-content-wrapper');
        if (!overlay || !img) return;

        const displayedW = explicitW ?? (wrapper?.style.width ? parseFloat(wrapper.style.width) : null) ?? img.clientWidth;
        const displayedH = explicitH ?? (wrapper?.style.height ? parseFloat(wrapper.style.height) : null) ?? img.clientHeight;

        if (!displayedW || !displayedH || !manager._imageNaturalWidth || !manager._imageNaturalHeight) return;

        // Scale factor: displayed / natural
        const scaleX = displayedW / manager._imageNaturalWidth;
        const scaleY = displayedH / manager._imageNaturalHeight;
        const pageOffset = manager._getPageOffset();

        const targetInfo = manager._getTargetClassInfo();
        const studentById = new Map();
        (targetInfo.existingClassStudents || appState.filteredResults || []).forEach(s => {
            if (s?.id) studentById.set(s.id, s);
        });
        (manager._parsedPdfData?.students || []).forEach(s => {
            if (s?.id) studentById.set(s.id, s);
        });

        const getZoneMetrics = (zone, idx) => {
            const dispCx = zone.cx * scaleX;
            const dispCy = zone.cy * scaleY;
            const r = zone.r || manager._globalRadius;
            const diameter = r * scaleX * 2;
            const student = zone.studentId ? studentById.get(zone.studentId) : null;
            const label = student?.prenom ? student.prenom : `#${pageOffset + idx + 1}`;
            const labelScale = Math.max(0.5, Math.min(1, diameter / 50));
            return {
                dispCx,
                dispCy,
                diameter,
                label,
                labelFontSize: Math.max(8, Math.round(12 * labelScale)),
                labelHeight: Math.max(16, Math.round(28 * labelScale)),
                labelPadding: Math.max(2, Math.round(8 * labelScale)),
                deleteSize: Math.max(14, Math.round(22 * labelScale)),
                deleteFontSize: Math.max(7, Math.round(10 * labelScale)),
                borderWidth: diameter < 40 ? 2 : 3,
                isSel: Boolean(manager._selectedZoneIds?.has(zone.id)),
                isFocused: manager._lastFocusedZoneId === zone.id,
                isUnassigned: !zone.studentId
            };
        };

        const existingZoneEls = overlay.querySelectorAll('.trombi-zone');
        const canUpdateInPlace = existingZoneEls.length === manager._zones.length &&
            manager._zones.every((zone, idx) => existingZoneEls[idx]?.dataset?.zoneId === String(zone.id));

        if (canUpdateInPlace) {
            manager._zones.forEach((zone, idx) => {
                const zoneEl = existingZoneEls[idx];
                const m = getZoneMetrics(zone, idx);

                zoneEl.style.left = `${m.dispCx}px`;
                zoneEl.style.top = `${m.dispCy}px`;
                zoneEl.style.width = `${m.diameter}px`;
                zoneEl.style.height = `${m.diameter}px`;
                zoneEl.style.borderWidth = `${m.borderWidth}px`;
                zoneEl.classList.toggle('is-selected', m.isSel);
                zoneEl.classList.toggle('focused', m.isFocused);
                zoneEl.classList.toggle('is-unassigned', m.isUnassigned);

                const labelEl = zoneEl.querySelector('.zone-label');
                if (labelEl) {
                    if (labelEl.textContent !== m.label) labelEl.textContent = m.label;
                    labelEl.style.fontSize = `${m.labelFontSize}px`;
                    labelEl.style.height = `${m.labelHeight}px`;
                    labelEl.style.minWidth = `${m.labelHeight}px`;
                    labelEl.style.padding = `0 ${m.labelPadding}px`;
                    labelEl.style.borderRadius = `${m.labelHeight / 2}px`;
                }

                const deleteBtn = zoneEl.querySelector('.zone-delete');
                if (deleteBtn) {
                    deleteBtn.style.width = `${m.deleteSize}px`;
                    deleteBtn.style.height = `${m.deleteSize}px`;
                    deleteBtn.style.fontSize = `${m.deleteFontSize}px`;
                }
            });
            return;
        }

        overlay.innerHTML = manager._zones.map((zone, idx) => {
            const m = getZoneMetrics(zone, idx);
            return `
                <div class="trombi-zone ${m.isSel ? 'is-selected' : ''} ${m.isFocused ? 'focused' : ''} ${m.isUnassigned ? 'is-unassigned' : ''}" 
                     data-zone-id="${zone.id}"
                     style="left: ${m.dispCx}px; top: ${m.dispCy}px; 
                            width: ${m.diameter}px; height: ${m.diameter}px;
                            border-width: ${m.borderWidth}px;">
                    <span class="zone-label" style="
                        font-size: ${m.labelFontSize}px;
                        height: ${m.labelHeight}px;
                        min-width: ${m.labelHeight}px;
                        padding: 0 ${m.labelPadding}px;
                        border-radius: ${m.labelHeight / 2}px;
                    ">${m.label}</span>
                    <button class="zone-delete" data-zone-id="${zone.id}" style="
                        width: ${m.deleteSize}px;
                        height: ${m.deleteSize}px;
                        font-size: ${m.deleteFontSize}px;
                    ">
                        <iconify-icon icon="ph:x"></iconify-icon>
                    </button>
                </div>
            `;
        }).join('');

        // Bind events
        overlay.querySelectorAll('.trombi-zone').forEach(el => {
            el.addEventListener('mousedown', e => manager._handleZoneMouseDown(e));
        });

        overlay.querySelectorAll('.zone-delete').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                manager._removeZone(parseInt(btn.dataset.zoneId));
            });
        });
    },

    handleZoneMouseDown(manager, e) {
        if (e.target.closest('.zone-delete')) return;
        e.preventDefault();

        const el = e.currentTarget;
        const zoneId = parseInt(el.dataset.zoneId);
        const zone = manager._zones.find(z => z.id === zoneId);
        if (!zone) return;

        const overlay = document.getElementById('trombiZonesOverlay');
        if (!overlay) return;

        const rect = overlay.getBoundingClientRect();
        const scaleX = manager._imageNaturalWidth / rect.width;
        const scaleY = manager._imageNaturalHeight / rect.height;

        // Calculate offset in natural pixels
        const clickNatX = (e.clientX - rect.left) * scaleX;
        const clickNatY = (e.clientY - rect.top) * scaleY;

        let wasAlreadySingleSelected = false;
        // Manage selection on click
        if (e.shiftKey && manager._lastFocusedZoneId !== null) {
            const idxAnchor = manager._zones.findIndex(z => z.id === manager._lastFocusedZoneId);
            const idxNew = manager._zones.findIndex(z => z.id === zoneId);
            if (idxAnchor !== -1 && idxNew !== -1) {
                const keepExisting = e.ctrlKey || e.metaKey;
                if (!keepExisting) {
                    manager._selectedZoneIds.clear();
                    overlay.querySelectorAll('.trombi-zone').forEach(zEl => {
                        zEl.classList.remove('is-selected');
                    });
                }
                const startIdx = Math.min(idxAnchor, idxNew);
                const endIdx = Math.max(idxAnchor, idxNew);
                for (let i = startIdx; i <= endIdx; i++) {
                    const z = manager._zones[i];
                    manager._selectedZoneIds.add(z.id);
                    const zEl = overlay.querySelector(`.trombi-zone[data-zone-id="${z.id}"]`);
                    zEl?.classList.add('is-selected');
                }
            }
        } else if (e.ctrlKey || e.metaKey) {
            if (manager._selectedZoneIds.has(zoneId)) {
                manager._selectedZoneIds.delete(zoneId);
                el.classList.remove('is-selected');
            } else {
                manager._selectedZoneIds.add(zoneId);
                el.classList.add('is-selected');
            }
        } else {
            wasAlreadySingleSelected = manager._selectedZoneIds.size === 1 && manager._selectedZoneIds.has(zoneId);
            if (!manager._selectedZoneIds.has(zoneId)) {
                manager._selectedZoneIds.clear();
                overlay.querySelectorAll('.trombi-zone').forEach(zEl => {
                    zEl.classList.remove('is-selected');
                });
                manager._selectedZoneIds.add(zoneId);
                el.classList.add('is-selected');
            }
        }

        manager._updateGroupedDragState();

        // Store original positions of all zones for synchronized drag
        const originalPositions = new Map();
        manager._zones.forEach(z => {
            originalPositions.set(z.id, { cx: z.cx, cy: z.cy });
        });

        // If grouped drag in multi-page PDF, also capture original positions of other pages
        const otherPagesOriginalPositions = new Map();
        if (manager._groupedDrag && manager._parsedPdfData?.pages) {
            manager._parsedPdfData.pages.forEach((p, pIdx) => {
                if (pIdx !== manager._currentPageIndex && p.zones) {
                    p.zones.forEach(z => {
                        otherPagesOriginalPositions.set(z.id, { cx: z.cx, cy: z.cy });
                    });
                }
            });
        }

        manager._dragging = {
            zone,
            offsetX: clickNatX - zone.cx,
            offsetY: clickNatY - zone.cy,
            startCx: zone.cx,
            startCy: zone.cy,
            originalPositions,
            otherPagesOriginalPositions,
            wasAlreadySingleSelected
        };

        // Capture snapshot before dragging
        manager._tempDragSnapshot = manager._getCurrentStateSnapshot();

        // Track this zone for keyboard navigation
        manager._lastFocusedControl = 'zone';
        manager._lastFocusedZoneId = zoneId;

        el.classList.add('dragging');

        // Highlight corresponding row in assignment list
        manager._highlightAssignmentRow(zoneId);

        // Also ensure self is focused
        manager._highlightZone(zoneId);
    },

    handleMouseMove(manager, e) {
        if (manager._selectionBox) {
            manager._updateSelectionBox(e);
            return;
        }

        if (!manager._dragging) return;

        const overlay = document.getElementById('trombiZonesOverlay');
        if (!overlay) return;

        const rect = overlay.getBoundingClientRect();
        const scaleX = manager._imageNaturalWidth / rect.width;
        const scaleY = manager._imageNaturalHeight / rect.height;

        const { zone, offsetX, offsetY, startCx, startCy } = manager._dragging;
        const newCx = (e.clientX - rect.left) * scaleX - offsetX;
        const newCy = (e.clientY - rect.top) * scaleY - offsetY;

        const r = manager._globalRadius;

        if (manager._groupedDrag) {
            const deltaX = newCx - startCx;
            const deltaY = newCy - startCy;

            manager._zones.forEach(z => {
                const originalPos = manager._dragging.originalPositions.get(z.id);
                if (originalPos) {
                    z.cx = originalPos.cx + deltaX;
                    z.cy = originalPos.cy + deltaY;
                }
            });

            if (manager._dragging.otherPagesOriginalPositions && manager._parsedPdfData?.pages) {
                manager._parsedPdfData.pages.forEach((p, pIdx) => {
                    if (pIdx !== manager._currentPageIndex && p.zones) {
                        p.zones.forEach(z => {
                            const originalPos = manager._dragging.otherPagesOriginalPositions.get(z.id);
                            if (originalPos) {
                                z.cx = originalPos.cx + deltaX;
                                z.cy = originalPos.cy + deltaY;
                            }
                        });
                    }
                });
            }
        } else if (manager._selectedZoneIds.size > 1 && manager._selectedZoneIds.has(zone.id)) {
            const deltaX = newCx - startCx;
            const deltaY = newCy - startCy;

            manager._zones.forEach(z => {
                if (manager._selectedZoneIds.has(z.id)) {
                    const originalPos = manager._dragging.originalPositions.get(z.id);
                    if (originalPos) {
                        z.cx = Math.max(r, Math.min(manager._imageNaturalWidth - r, originalPos.cx + deltaX));
                        z.cy = Math.max(r, Math.min(manager._imageNaturalHeight - r, originalPos.cy + deltaY));
                    }
                }
            });
        } else if (e.shiftKey) {
            const deltaY = newCy - startCy;
            const rowZones = manager._zones.filter(z => Math.abs(z.cy - startCy) < r * 1.5);

            rowZones.forEach(z => {
                const originalPos = manager._dragging.originalPositions.get(z.id);
                if (originalPos) {
                    z.cy = Math.max(r, Math.min(manager._imageNaturalHeight - r, originalPos.cy + deltaY));
                }
            });
            zone.cx = Math.max(r, Math.min(manager._imageNaturalWidth - r, newCx));
        } else {
            zone.cx = Math.max(r, Math.min(manager._imageNaturalWidth - r, newCx));
            zone.cy = Math.max(r, Math.min(manager._imageNaturalHeight - r, newCy));
            zone.isPlaceholder = false;
        }

        manager._renderZones();
        manager._updateLivePreviews();
    },

    updateSelectionBox(manager, e) {
        const box = manager._selectionBox;
        if (!box) return;

        const imagePanel = document.getElementById('trombiImageWithZones');
        const viewport = imagePanel?.querySelector('.trombi-viewport');
        if (!viewport) return;

        const dx = e.clientX - box.startX;
        const dy = e.clientY - box.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (!box.isActive && distance > 5) {
            box.isActive = true;
            manager._selectionBoxDragActive = true;

            let boxEl = document.getElementById('trombiSelectionBox');
            if (!boxEl) {
                boxEl = document.createElement('div');
                boxEl.id = 'trombiSelectionBox';
                boxEl.className = 'trombi-selection-box';
                viewport.appendChild(boxEl);
            }
            boxEl.style.display = 'block';
        }

        if (!box.isActive) return;

        const boxEl = document.getElementById('trombiSelectionBox');
        if (!boxEl) return;

        const rect = box.viewportRect;
        const left = Math.min(box.startX, e.clientX) - rect.left;
        const top = Math.min(box.startY, e.clientY) - rect.top;
        const width = Math.abs(dx);
        const height = Math.abs(dy);

        boxEl.style.left = `${left}px`;
        boxEl.style.top = `${top}px`;
        boxEl.style.width = `${width}px`;
        boxEl.style.height = `${height}px`;

        const boxLeft = Math.min(box.startX, e.clientX);
        const boxRight = Math.max(box.startX, e.clientX);
        const boxTop = Math.min(box.startY, e.clientY);
        const boxBottom = Math.max(box.startY, e.clientY);

        const overlay = document.getElementById('trombiZonesOverlay');
        if (overlay) {
            manager._zones.forEach(zone => {
                const el = overlay.querySelector(`.trombi-zone[data-zone-id="${zone.id}"]`);
                if (el) {
                    const zRect = el.getBoundingClientRect();
                    const isOverlapping = !(zRect.left > boxRight || zRect.right < boxLeft || zRect.top > boxBottom || zRect.bottom < boxTop);
                    if (isOverlapping) {
                        manager._selectedZoneIds.add(zone.id);
                        el.classList.add('is-selected');
                    } else {
                        manager._selectedZoneIds.delete(zone.id);
                        el.classList.remove('is-selected');
                    }
                }
            });
        }
        manager._updateGroupedDragState();
    },

    handleMouseUp(manager) {
        if (manager._selectionBox) {
            const boxEl = document.getElementById('trombiSelectionBox');
            if (boxEl) {
                boxEl.style.display = 'none';
            }
            if (!manager._selectionBox.isActive) {
                manager._selectedZoneIds.clear();
                manager._lastFocusedZoneId = null;
                const overlay = document.getElementById('trombiZonesOverlay');
                overlay?.querySelectorAll('.trombi-zone').forEach(zEl => {
                    zEl.classList.remove('is-selected', 'focused');
                });
                const grid = document.getElementById('trombiAssignmentGrid');
                grid?.querySelectorAll('.assignment-row.focused').forEach(r => r.classList.remove('focused'));
                manager._updateGroupedDragState();
            }
            manager._selectionBox = null;
            setTimeout(() => {
                manager._selectionBoxDragActive = false;
            }, 50);
            return;
        }

        if (manager._dragging) {
            const { zone, startCx, startCy, wasAlreadySingleSelected } = manager._dragging;
            const el = document.querySelector(`[data-zone-id="${zone.id}"]`);
            el?.classList.remove('dragging');

            const hasMoved = Math.abs(zone.cx - startCx) > 0.01 || Math.abs(zone.cy - startCy) > 0.01;
            if (hasMoved && manager._tempDragSnapshot) {
                manager._saveState(manager._tempDragSnapshot);
            } else if (!hasMoved && wasAlreadySingleSelected) {
                manager._clearZoneSelection();
            }
            manager._tempDragSnapshot = null;
            manager._dragging = null;
        }
    },

    updateGroupedDragState(manager) {
        if (manager._selectedZoneIds.size > 1) {
            if (manager._groupedDrag) {
                manager._restoreGroupedDrag = true;
                manager._groupedDrag = false;
                const toggle = document.getElementById('groupedDragToggle');
                if (toggle) toggle.checked = false;
            }
        } else {
            if (manager._restoreGroupedDrag) {
                manager._groupedDrag = true;
                manager._restoreGroupedDrag = false;
                const toggle = document.getElementById('groupedDragToggle');
                if (toggle) toggle.checked = true;
            }
        }
    },

    handleKeyDown(manager, e) {
        // Close open student popover on Escape before any modal close handler
        if (manager._openPopoverZoneId !== null) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                manager._closeStudentPopover(true);
                return;
            }
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
                return;
            }
        }

        // Close modal on Escape when no overlay confirmation modal is open
        if (e.key === 'Escape') {
            const modal = document.getElementById('trombiWizardModal');
            if (modal?.classList.contains('visible') && !ModalUI.activeModal) {
                e.preventDefault();
                manager.close();
            }
            return;
        }

        // Handle Ctrl+Z / Cmd+Z (Undo) and Ctrl+Y / Cmd+Y / Ctrl+Shift+Z (Redo)
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            const modal = document.getElementById('trombiWizardModal');
            if (modal?.classList.contains('visible') && manager._currentStep === 2) {
                if ((key === 'z' && e.shiftKey) || key === 'y') {
                    e.preventDefault();
                    manager._redo();
                    return;
                }
                if (key === 'z') {
                    e.preventDefault();
                    manager._undo();
                    return;
                }
            }
        }

        // Only handle arrow keys
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

        // Only active on Step 2 and when modal is visible
        const modal = document.getElementById('trombiWizardModal');
        if (!modal?.classList.contains('visible') || manager._currentStep !== 2) return;

        // Must have a focused control
        if (!manager._lastFocusedControl) return;

        // Handle gap slider mode
        if (manager._lastFocusedControl === 'gaps') {
            e.preventDefault();
            manager._saveStateForNudge();
            const step = e.shiftKey ? 5 : 0.5;

            const gapHSlider = document.getElementById('gapHSlider');
            const gapVSlider = document.getElementById('gapVSlider');
            const gapHValue = document.getElementById('gapHValue');
            const gapVValue = document.getElementById('gapVValue');

            if (e.key === 'ArrowLeft') {
                manager._gapH = Math.max(-50, manager._gapH - step);
                if (gapHSlider) gapHSlider.value = manager._gapH;
                if (gapHValue) gapHValue.textContent = Number.isInteger(manager._gapH) ? manager._gapH : manager._gapH.toFixed(1);
            } else if (e.key === 'ArrowRight') {
                manager._gapH = Math.min(50, manager._gapH + step);
                if (gapHSlider) gapHSlider.value = manager._gapH;
                if (gapHValue) gapHValue.textContent = Number.isInteger(manager._gapH) ? manager._gapH : manager._gapH.toFixed(1);
            } else if (e.key === 'ArrowUp') {
                manager._gapV = Math.max(-50, manager._gapV - step);
                if (gapVSlider) gapVSlider.value = manager._gapV;
                if (gapVValue) gapVValue.textContent = Number.isInteger(manager._gapV) ? manager._gapV : manager._gapV.toFixed(1);
            } else if (e.key === 'ArrowDown') {
                manager._gapV = Math.min(50, manager._gapV + step);
                if (gapVSlider) gapVSlider.value = manager._gapV;
                if (gapVValue) gapVValue.textContent = Number.isInteger(manager._gapV) ? manager._gapV : manager._gapV.toFixed(1);
            }

            manager._applyGaps();
            return;
        }

        // Handle size slider mode
        if (manager._lastFocusedControl === 'size') {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                manager._saveStateForNudge();
                const step = e.shiftKey ? 10 : 2;

                const sizeSlider = document.getElementById('sizeSlider');
                const sizeValue = document.getElementById('sizeValue');
                let currentPercent = parseInt(sizeSlider?.value || 60);

                if (e.key === 'ArrowUp') {
                    currentPercent = Math.min(100, currentPercent + step);
                } else {
                    currentPercent = Math.max(5, currentPercent - step);
                }

                if (sizeSlider) sizeSlider.value = currentPercent;
                if (sizeValue) sizeValue.textContent = currentPercent + '%';
                manager._updateSizeFromPercent(currentPercent);
            }
            return;
        }

        // Handle zone positioning mode
        if (manager._lastFocusedControl === 'zone' && manager._lastFocusedZoneId !== null) {
            e.preventDefault();
            manager._saveStateForNudge();

            const zone = manager._zones.find(z => z.id === manager._lastFocusedZoneId);
            if (!zone) return;

            const baseStep = Math.min(manager._imageNaturalWidth, manager._imageNaturalHeight) * 0.003;
            const step = e.shiftKey ? baseStep * 5 : baseStep;
            const r = manager._globalRadius;

            if (manager._groupedDrag) {
                let deltaX = 0, deltaY = 0;
                if (e.key === 'ArrowLeft') deltaX = -step;
                else if (e.key === 'ArrowRight') deltaX = step;
                else if (e.key === 'ArrowUp') deltaY = -step;
                else if (e.key === 'ArrowDown') deltaY = step;

                manager._zones.forEach(z => {
                    z.cx += deltaX;
                    z.cy += deltaY;
                });

                if (manager._parsedPdfData?.pages) {
                    manager._parsedPdfData.pages.forEach((p, pIdx) => {
                        if (pIdx !== manager._currentPageIndex && p.zones) {
                            p.zones.forEach(z => {
                                z.cx += deltaX;
                                z.cy += deltaY;
                            });
                        }
                    });
                }
            } else if (manager._selectedZoneIds.size > 1 && manager._selectedZoneIds.has(manager._lastFocusedZoneId)) {
                let deltaX = 0, deltaY = 0;
                if (e.key === 'ArrowLeft') deltaX = -step;
                else if (e.key === 'ArrowRight') deltaX = step;
                else if (e.key === 'ArrowUp') deltaY = -step;
                else if (e.key === 'ArrowDown') deltaY = step;

                manager._zones.forEach(z => {
                    if (manager._selectedZoneIds.has(z.id)) {
                        z.cx = Math.max(r, Math.min(manager._imageNaturalWidth - r, z.cx + deltaX));
                        z.cy = Math.max(r, Math.min(manager._imageNaturalHeight - r, z.cy + deltaY));
                    }
                });
            } else {
                if (e.key === 'ArrowLeft') {
                    zone.cx = Math.max(r, zone.cx - step);
                } else if (e.key === 'ArrowRight') {
                    zone.cx = Math.min(manager._imageNaturalWidth - r, zone.cx + step);
                } else if (e.key === 'ArrowUp') {
                    zone.cy = Math.max(r, zone.cy - step);
                } else if (e.key === 'ArrowDown') {
                    zone.cy = Math.min(manager._imageNaturalHeight - r, zone.cy + step);
                }
            }

            manager._renderZones();
            manager._updateLivePreviews();

            manager._highlightAssignmentRow(manager._lastFocusedZoneId);
            manager._highlightZone(manager._lastFocusedZoneId);
        }
    },

    clearZoneSelection(manager) {
        manager._selectedZoneIds.clear();
        manager._lastFocusedZoneId = null;
        if (typeof document !== 'undefined') {
            const overlay = document.getElementById('trombiZonesOverlay');
            overlay?.querySelectorAll('.trombi-zone').forEach(zEl => {
                zEl.classList.remove('is-selected', 'focused');
            });
            const grid = document.getElementById('trombiAssignmentGrid');
            grid?.querySelectorAll('.assignment-row.focused').forEach(r => r.classList.remove('focused'));
        }
        manager._updateGroupedDragState();
    },

    selectSingleZone(manager, zoneId, scroll = false) {
        manager._lastFocusedControl = 'zone';
        manager._lastFocusedZoneId = zoneId;
        manager._selectedZoneIds.clear();
        manager._selectedZoneIds.add(zoneId);

        const overlay = document.getElementById('trombiZonesOverlay');
        if (overlay) {
            overlay.querySelectorAll('.trombi-zone').forEach(zEl => {
                const isTarget = parseInt(zEl.dataset.zoneId, 10) === zoneId;
                zEl.classList.toggle('is-selected', isTarget);
                zEl.classList.toggle('focused', isTarget);
            });
        }
        manager._updateGroupedDragState();
        manager._highlightAssignmentRow(zoneId, scroll);
    },

    highlightZone(_manager, zoneId) {
        const overlay = document.getElementById('trombiZonesOverlay');
        if (!overlay) return;

        overlay.querySelectorAll('.trombi-zone').forEach(zone => {
            zone.classList.remove('focused');
        });

        const zone = overlay.querySelector(`.trombi-zone[data-zone-id="${zoneId}"]`);
        if (zone) {
            zone.classList.add('focused');
        }
    },

    getCurrentStateSnapshot(manager) {
        return {
            zones: manager._zones.map(z => ({ ...z })),
            pages: manager._parsedPdfData?.pages?.map((p, idx) => ({
                zones: (idx === manager._currentPageIndex ? manager._zones : (p.zones || [])).map(z => ({ ...z }))
            })),
            gridCols: manager._gridCols,
            gridRows: manager._gridRows,
            gapH: manager._gapH,
            gapV: manager._gapV,
            globalRadius: manager._globalRadius
        };
    },

    saveState(manager, snapshot = manager._getCurrentStateSnapshot()) {
        if (!manager._history) manager._history = [];
        manager._history.push(snapshot);
        if (manager._history.length > manager._maxHistoryLevels) {
            manager._history.shift();
        }
        manager._redoHistory = [];
        manager._updateUndoButton();
    },

    undo(manager) {
        if (!manager._history || manager._history.length === 0) return;
        if (!manager._redoHistory) manager._redoHistory = [];
        manager._redoHistory.push(manager._getCurrentStateSnapshot());
        if (manager._redoHistory.length > manager._maxHistoryLevels) {
            manager._redoHistory.shift();
        }
        const prevState = manager._history.pop();
        manager._applyHistorySnapshot(prevState);
    },

    redo(manager) {
        if (!manager._redoHistory || manager._redoHistory.length === 0) return;
        if (!manager._history) manager._history = [];
        manager._history.push(manager._getCurrentStateSnapshot());
        if (manager._history.length > manager._maxHistoryLevels) {
            manager._history.shift();
        }
        const nextState = manager._redoHistory.pop();
        manager._applyHistorySnapshot(nextState);
    },

    applyHistorySnapshot(manager, state) {
        if (!state) return;
        if (manager._nudgeTimer) {
            clearTimeout(manager._nudgeTimer);
            manager._nudgeTimer = null;
        }
        manager._selectedZoneIds.clear();
        manager._zones = state.zones.map(z => ({ ...z }));
        if (state.pages && manager._parsedPdfData?.pages) {
            manager._parsedPdfData.pages.forEach((p, idx) => {
                if (state.pages[idx]?.zones) {
                    p.zones = state.pages[idx].zones.map(z => ({ ...z }));
                }
            });
        }
        manager._gridCols = state.gridCols;
        manager._gridRows = state.gridRows;
        manager._gapH = state.gapH;
        manager._gapV = state.gapV;
        manager._globalRadius = state.globalRadius;

        manager._syncSlidersToState();
        manager._renderZones();
        manager._renderAssignmentGrid();
        manager._updateUndoButton();
    },

    updateUndoButton(manager) {
        const undoBtn = document.getElementById('trombiUndoBtn');
        if (undoBtn) {
            undoBtn.disabled = !manager._history || manager._history.length === 0;
        }
        const redoBtn = document.getElementById('trombiRedoBtn');
        if (redoBtn) {
            redoBtn.disabled = !manager._redoHistory || manager._redoHistory.length === 0;
        }
    },

    saveStateForNudge(manager) {
        if (manager._nudgeTimer) {
            clearTimeout(manager._nudgeTimer);
        } else {
            manager._saveState();
        }
        manager._nudgeTimer = setTimeout(() => {
            manager._nudgeTimer = null;
        }, 1000);
    }
};
