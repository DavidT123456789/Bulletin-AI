/**
 * @fileoverview Trombinoscope Manager - Photo extraction from class photos
 * Refactored with clean coordinate system (natural pixels)
 * @module managers/TrombinoscopeManager
 */

import { appState } from '../state/State.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
import { UI } from './UIManager.js';

/**
 * Manages the trombinoscope photo import workflow
 * 
 * Coordinate System:
 * - All zone positions (cx, cy, radius) are stored in NATURAL PIXELS of the image
 * - This ensures consistency between display and extraction
 * - When rendering, we scale to the displayed image size
 * - When extracting, we use the natural pixel values directly
 * 
 * @namespace TrombinoscopeManager
 */
export const TrombinoscopeManager = {
    /** Current step in the wizard (1 = Upload, 2 = Selection & Association) */
    _currentStep: 1,

    /** Loaded image source (URL or base64) */
    _imageSrc: null,

    /** Natural image dimensions */
    _imageNaturalWidth: 0,
    _imageNaturalHeight: 0,

    /** 
     * Photo zones array. Each zone has:
     * - id: number - unique identifier
     * - studentId: string|null - assigned student or null
     * - cx: number - center X in natural pixels
     * - cy: number - center Y in natural pixels  
     * - r: number - radius in natural pixels
     */
    _zones: [],

    /** Counter for zone IDs */
    _zoneIdCounter: 0,

    /** Global radius for all zones (in natural pixels) */
    _globalRadius: 0,

    /** Drag state */
    _dragging: null, // { zone, offsetX, offsetY }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    init() {
        this._setupEventListeners();
    },

    _setupEventListeners() {
        // Hub card click to open wizard
        document.querySelector('[data-action="photos"]')?.addEventListener('click', () => {
            document.getElementById('importHubBackdrop')?.classList.remove('visible');
            this.open();
        });

        // Close buttons
        document.getElementById('closeTrombiWizardBtn')?.addEventListener('click', () => this.close());
        document.getElementById('trombiWizardBackdrop')?.addEventListener('click', () => this.close());
        document.getElementById('trombiStep1CancelBtn')?.addEventListener('click', () => this.close());

        // File input
        const dropZone = document.getElementById('trombiDropZone');
        const fileInput = document.getElementById('trombiFileInput');

        dropZone?.addEventListener('click', () => fileInput?.click());
        dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone?.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const file = e.dataTransfer?.files[0];
            if (file?.type.startsWith('image/')) this._loadFile(file);
        });

        fileInput?.addEventListener('change', e => {
            const file = e.target.files?.[0];
            if (file) this._loadFile(file);
        });

        // Sample button
        document.getElementById('trombiSampleBtn')?.addEventListener('click', () => {
            this._loadImageFromUrl('/images/sample-trombinoscope.png');
        });

        // Navigation buttons
        document.getElementById('trombiStep1NextBtn')?.addEventListener('click', () => this._goToStep(2));
        document.getElementById('trombiStep2PrevBtn')?.addEventListener('click', () => this._goToStep(1));
        document.getElementById('trombiStep2NextBtn')?.addEventListener('click', () => this._goToStep(3));
        document.getElementById('trombiStep3PrevBtn')?.addEventListener('click', () => this._goToStep(2));
        document.getElementById('trombiConfirmBtn')?.addEventListener('click', () => this._confirmImport());

        // Global mouse events for drag/resize
        document.addEventListener('mousemove', e => this._handleMouseMove(e));
        document.addEventListener('mouseup', () => this._handleMouseUp());
    },

    // ========================================================================
    // MODAL CONTROL
    // ========================================================================

    open() {
        this._reset();
        const modal = document.getElementById('trombiWizardModal');
        if (modal) modal.classList.add('visible');
    },

    close() {
        const modal = document.getElementById('trombiWizardModal');
        if (modal) modal.classList.remove('visible');
        this._reset();
    },

    _reset() {
        this._currentStep = 1;
        this._imageSrc = null;
        this._imageNaturalWidth = 0;
        this._imageNaturalHeight = 0;
        this._zones = [];
        this._zoneIdCounter = 0;
        this._dragging = null;
        this._resizing = null;

        const preview = document.getElementById('trombiPreview');
        if (preview) preview.innerHTML = '';

        const nextBtn = document.getElementById('trombiStep1NextBtn');
        if (nextBtn) nextBtn.disabled = true;

        this._updateStepperUI();
    },

    // ========================================================================
    // STEP NAVIGATION
    // ========================================================================

    _goToStep(step) {
        this._currentStep = step;

        // Show/hide step content
        document.querySelectorAll('.trombi-step-content').forEach(el => {
            el.style.display = 'none';
        });
        document.getElementById(`trombiStep${step}`)?.style.setProperty('display', 'block');

        this._updateStepperUI();

        // Initialize step content
        if (step === 2) {
            this._initStep2();
        } else if (step === 3) {
            this._initStep3();
        }
    },

    _updateStepperUI() {
        document.querySelectorAll('.trombi-wizard-step').forEach(el => {
            const stepNum = parseInt(el.dataset.step);
            el.classList.toggle('active', stepNum === this._currentStep);
            el.classList.toggle('completed', stepNum < this._currentStep);
        });
    },

    // ========================================================================
    // STEP 1: IMAGE UPLOAD
    // ========================================================================

    _loadFile(file) {
        const reader = new FileReader();
        reader.onload = e => {
            this._loadImageFromUrl(e.target.result);
        };
        reader.readAsDataURL(file);
    },

    _loadImageFromUrl(url) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            this._imageSrc = url;
            this._imageNaturalWidth = img.naturalWidth;
            this._imageNaturalHeight = img.naturalHeight;
            this._displayImagePreview();
            document.getElementById('trombiStep1NextBtn').disabled = false;
        };
        img.onerror = () => {
            UI.showNotification('Erreur de chargement de l\'image', 'error');
        };
        img.src = url;
    },

    _displayImagePreview() {
        const preview = document.getElementById('trombiPreview');
        if (!preview) return;

        preview.innerHTML = `
            <div class="trombi-image-container">
                <img src="${this._imageSrc}" alt="Trombinoscope" class="trombi-image">
            </div>
            <p class="trombi-image-info">
                <i class="fas fa-check-circle"></i> 
                Image chargée (${this._imageNaturalWidth} × ${this._imageNaturalHeight} px)
            </p>
        `;
    },

    // ========================================================================
    // STEP 2: SELECTION & ASSOCIATION
    // ========================================================================

    _initStep2() {
        const imagePanel = document.getElementById('trombiImageWithZones');
        if (!imagePanel) return;

        // Setup image with overlay
        imagePanel.innerHTML = `
            <img src="${this._imageSrc}" alt="Trombinoscope" class="trombi-image" id="trombiStep2Image">
            <div class="trombi-zones-overlay" id="trombiZonesOverlay"></div>
        `;

        const img = document.getElementById('trombiStep2Image');
        img.onload = () => {
            // Create default grid if no zones exist
            if (this._zones.length === 0) {
                this._createDefaultGrid();
            }
            this._renderZones();
        };

        // Click on overlay to add zone
        const overlay = document.getElementById('trombiZonesOverlay');
        overlay?.addEventListener('click', e => {
            if (e.target === overlay) {
                this._addZoneAtClick(e);
            }
        });

        // Render student assignment grid
        this._renderAssignmentGrid();

        // Setup control panel with sliders
        this._setupControlPanel();
    },

    _setupControlPanel() {
        const container = document.querySelector('.trombi-image-panel');
        if (!container || container.querySelector('.grid-control-panel')) return;

        // Default values
        this._gridCols = 4;
        this._gridRows = Math.ceil((appState.filteredResults?.length || 8) / 4);

        const panelHtml = `
            <div class="grid-control-panel">
                <div class="control-row">
                    <label><i class="fas fa-columns"></i> Colonnes</label>
                    <div class="slider-group">
                        <input type="range" class="control-slider" id="colsSlider" 
                               min="1" max="8" value="${this._gridCols}">
                        <span class="slider-value" id="colsValue">${this._gridCols}</span>
                    </div>
                </div>
                <div class="control-row">
                    <label><i class="fas fa-bars"></i> Lignes</label>
                    <div class="slider-group">
                        <input type="range" class="control-slider" id="rowsSlider" 
                               min="1" max="10" value="${this._gridRows}">
                        <span class="slider-value" id="rowsValue">${this._gridRows}</span>
                    </div>
                </div>
                <div class="control-row">
                    <label><i class="fas fa-expand-alt"></i> Taille</label>
                    <div class="slider-group">
                        <input type="range" class="control-slider" id="sizeSlider" 
                               min="20" max="100" value="60">
                        <span class="slider-value" id="sizeValue">60%</span>
                    </div>
                </div>
                <div class="control-actions">
                    <button class="btn-auto-order" id="autoOrderBtn" title="Attribution automatique">
                        <i class="fas fa-sort-alpha-down"></i> Auto
                    </button>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', panelHtml);

        // Bind slider events - instant grid update
        const colsSlider = document.getElementById('colsSlider');
        const rowsSlider = document.getElementById('rowsSlider');
        const sizeSlider = document.getElementById('sizeSlider');
        const colsValue = document.getElementById('colsValue');
        const rowsValue = document.getElementById('rowsValue');
        const sizeValue = document.getElementById('sizeValue');

        colsSlider?.addEventListener('input', e => {
            this._gridCols = parseInt(e.target.value);
            colsValue.textContent = this._gridCols;
            this._createGridSilent(this._gridCols, this._gridRows);
        });

        rowsSlider?.addEventListener('input', e => {
            this._gridRows = parseInt(e.target.value);
            rowsValue.textContent = this._gridRows;
            this._createGridSilent(this._gridCols, this._gridRows);
        });

        sizeSlider?.addEventListener('input', e => {
            const percent = parseInt(e.target.value);
            sizeValue.textContent = percent + '%';
            this._updateSizeFromPercent(percent);
        });

        document.getElementById('autoOrderBtn')?.addEventListener('click', () => {
            this._autoAssignInOrder();
        });

        // Create initial grid
        this._createGridSilent(this._gridCols, this._gridRows);
    },

    _updateSizeFromPercent(percent) {
        if (!this._imageNaturalWidth) return;
        const minSize = Math.min(this._imageNaturalWidth, this._imageNaturalHeight);
        const minR = minSize * 0.03;
        const maxR = minSize * 0.25;
        this._globalRadius = minR + (maxR - minR) * (percent / 100);
        this._renderZones();
        this._updateLivePreviews();
    },

    // ========================================================================
    // ZONE MANAGEMENT
    // ========================================================================

    _createDefaultGrid() {
        const students = appState.filteredResults || [];
        const count = Math.min(students.length, 12);

        if (count <= 4) {
            this._createGrid(count, 1);
        } else if (count <= 8) {
            this._createGrid(4, 2);
        } else {
            this._createGrid(4, 3);
        }
    },

    _createGrid(cols, rows) {
        this._zones = [];
        this._zoneIdCounter = 0;

        const w = this._imageNaturalWidth;
        const h = this._imageNaturalHeight;

        // Cell dimensions
        const cellW = w / cols;
        const cellH = h / rows;

        // Global radius = 40% of the smaller cell dimension
        this._globalRadius = Math.min(cellW, cellH) * 0.4;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                this._zones.push({
                    id: this._zoneIdCounter++,
                    studentId: null,
                    cx: cellW * (col + 0.5),
                    cy: cellH * (row + 0.5)
                });
            }
        }

        this._renderZones();
        this._renderAssignmentGrid();
        this._updateSizeSliderValue();
    },

    /**
     * Create grid silently (without notification) for instant slider feedback
     */
    _createGridSilent(cols, rows) {
        this._createGrid(cols, rows);
        this._updateLivePreviews();
    },

    _updateSizeSliderValue() {
        // Update size slider to reflect current globalRadius
        const sizeSlider = document.getElementById('sizeSlider');
        const sizeValue = document.getElementById('sizeValue');
        if (!sizeSlider || !this._imageNaturalWidth) return;

        const minSize = Math.min(this._imageNaturalWidth, this._imageNaturalHeight);
        const minR = minSize * 0.03;
        const maxR = minSize * 0.25;
        const percent = Math.round(((this._globalRadius - minR) / (maxR - minR)) * 100);
        sizeSlider.value = percent;
        if (sizeValue) sizeValue.textContent = percent + '%';
    },

    _addZoneAtClick(e) {
        const overlay = document.getElementById('trombiZonesOverlay');
        const img = document.getElementById('trombiStep2Image');
        if (!overlay || !img) return;

        const rect = overlay.getBoundingClientRect();
        const clickX = (e.clientX - rect.left) / rect.width;
        const clickY = (e.clientY - rect.top) / rect.height;

        // Convert to natural pixels
        const cx = clickX * this._imageNaturalWidth;
        const cy = clickY * this._imageNaturalHeight;

        // Set default global radius if not yet set
        if (!this._globalRadius) {
            this._globalRadius = Math.min(this._imageNaturalWidth, this._imageNaturalHeight) * 0.08;
        }

        this._zones.push({
            id: this._zoneIdCounter++,
            studentId: null,
            cx, cy
        });

        this._renderZones();
        this._renderAssignmentGrid();
    },

    _removeZone(zoneId) {
        this._zones = this._zones.filter(z => z.id !== zoneId);
        this._renderZones();
        this._renderAssignmentGrid();
    },

    _autoAssignInOrder() {
        const students = appState.filteredResults || [];
        this._zones.forEach((zone, idx) => {
            zone.studentId = students[idx]?.id || null;
        });
        this._renderZones();
        this._renderAssignmentGrid();
        UI.showNotification('Attribution automatique effectuée', 'success');
    },

    // ========================================================================
    // ZONE RENDERING
    // ========================================================================

    _renderZones() {
        const overlay = document.getElementById('trombiZonesOverlay');
        const img = document.getElementById('trombiStep2Image');
        if (!overlay || !img) return;

        const displayedW = img.clientWidth;
        const displayedH = img.clientHeight;

        if (!displayedW || !displayedH) return;

        // Scale factor: displayed / natural
        const scaleX = displayedW / this._imageNaturalWidth;

        const students = appState.filteredResults || [];
        const r = this._globalRadius;
        const dispR = r * scaleX;
        const diameter = dispR * 2;

        overlay.innerHTML = this._zones.map((zone, idx) => {
            // Convert natural pixels to displayed pixels
            const dispCx = zone.cx * scaleX;
            const dispCy = zone.cy * (displayedH / this._imageNaturalHeight);

            // Find student name if assigned
            const student = students.find(s => s.id === zone.studentId);
            const label = student ? student.prenom : (idx + 1);

            return `
                <div class="trombi-zone" 
                     data-zone-id="${zone.id}"
                     style="left: ${dispCx}px; top: ${dispCy}px; 
                            width: ${diameter}px; height: ${diameter}px;">
                    <span class="zone-label">${label}</span>
                    <button class="zone-delete" data-zone-id="${zone.id}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');

        // Bind events
        overlay.querySelectorAll('.trombi-zone').forEach(el => {
            el.addEventListener('mousedown', e => this._handleZoneMouseDown(e));
        });

        overlay.querySelectorAll('.zone-delete').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this._removeZone(parseInt(btn.dataset.zoneId));
            });
        });
    },

    // ========================================================================
    // DRAG
    // ========================================================================

    _handleZoneMouseDown(e) {
        if (e.target.closest('.zone-delete')) return;
        e.preventDefault();

        const el = e.currentTarget;
        const zoneId = parseInt(el.dataset.zoneId);
        const zone = this._zones.find(z => z.id === zoneId);
        if (!zone) return;

        const overlay = document.getElementById('trombiZonesOverlay');
        const rect = overlay.getBoundingClientRect();

        const scaleX = this._imageNaturalWidth / rect.width;
        const scaleY = this._imageNaturalHeight / rect.height;

        // Calculate offset in natural pixels
        const clickNatX = (e.clientX - rect.left) * scaleX;
        const clickNatY = (e.clientY - rect.top) * scaleY;

        this._dragging = {
            zone,
            offsetX: clickNatX - zone.cx,
            offsetY: clickNatY - zone.cy
        };

        el.classList.add('dragging');
    },

    _handleMouseMove(e) {
        if (!this._dragging) return;

        const overlay = document.getElementById('trombiZonesOverlay');
        if (!overlay) return;

        const rect = overlay.getBoundingClientRect();
        const scaleX = this._imageNaturalWidth / rect.width;
        const scaleY = this._imageNaturalHeight / rect.height;

        const { zone, offsetX, offsetY } = this._dragging;
        const newCx = (e.clientX - rect.left) * scaleX - offsetX;
        const newCy = (e.clientY - rect.top) * scaleY - offsetY;

        // Clamp to image bounds
        const r = this._globalRadius;
        zone.cx = Math.max(r, Math.min(this._imageNaturalWidth - r, newCx));
        zone.cy = Math.max(r, Math.min(this._imageNaturalHeight - r, newCy));

        this._renderZones();
        this._updateLivePreviews();
    },

    _handleMouseUp() {
        if (this._dragging) {
            const el = document.querySelector(`[data-zone-id="${this._dragging.zone.id}"]`);
            el?.classList.remove('dragging');
            this._dragging = null;
        }
    },

    // ========================================================================
    // SIZE SLIDER
    // ========================================================================

    _setupSizeSlider() {
        const container = document.querySelector('.trombi-image-panel');
        if (!container || container.querySelector('.size-slider-container')) return;

        const minSize = Math.min(this._imageNaturalWidth, this._imageNaturalHeight);
        const minR = minSize * 0.03;
        const maxR = minSize * 0.25;
        const currentR = this._globalRadius;
        const percent = ((currentR - minR) / (maxR - minR)) * 100;

        const sliderHtml = `
            <div class="size-slider-container">
                <label><i class="fas fa-expand-alt"></i> Taille</label>
                <input type="range" class="size-slider" 
                       min="${minR}" max="${maxR}" value="${currentR}" step="1">
            </div>
        `;
        container.insertAdjacentHTML('beforeend', sliderHtml);

        const slider = container.querySelector('.size-slider');
        slider.addEventListener('input', e => {
            this._globalRadius = parseFloat(e.target.value);
            this._renderZones();
            this._updateLivePreviews();
        });
    },

    // ========================================================================
    // ASSIGNMENT GRID
    // ========================================================================

    _renderAssignmentGrid() {
        const container = document.getElementById('trombiAssignmentGrid');
        if (!container) return;

        const students = appState.filteredResults || [];

        if (this._zones.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-hand-pointer"></i>
                    <p>Cliquez sur l'image pour ajouter des zones</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="assignment-header">
                <span></span>
                <span>Élève</span>
                <span>Zone</span>
            </div>
            ${students.map(student => {
            return `
                    <div class="assignment-row" data-student-id="${student.id}">
                        <div class="assignment-preview">
                            <canvas class="live-preview-canvas" 
                                    data-student-id="${student.id}" 
                                    width="40" height="40"></canvas>
                        </div>
                        <div class="assignment-student">
                            <span>${student.prenom} ${student.nom}</span>
                        </div>
                        <select class="assignment-select" data-student-id="${student.id}">
                            <option value="">—</option>
                            ${this._zones.map((z, i) => `
                                <option value="${z.id}" ${z.studentId === student.id ? 'selected' : ''}>
                                    Zone ${i + 1}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                `;
        }).join('')}
            <div class="assignment-summary">
                ${this._zones.filter(z => z.studentId).length} / ${this._zones.length} zones assignées
            </div>
        `;

        // Bind select events
        container.querySelectorAll('.assignment-select').forEach(select => {
            select.addEventListener('change', e => {
                const studentId = select.dataset.studentId;
                const zoneId = e.target.value ? parseInt(e.target.value) : null;

                // Remove student from any existing zone
                this._zones.forEach(z => {
                    if (z.studentId === studentId) z.studentId = null;
                });

                // Assign to new zone
                if (zoneId !== null) {
                    const zone = this._zones.find(z => z.id === zoneId);
                    if (zone) zone.studentId = studentId;
                }

                this._renderZones();
                this._renderAssignmentGrid();
            });
        });

        // Initial preview render
        this._updateLivePreviews();
    },

    /**
     * Update all live preview canvases with current zone positions
     * @private
     */
    async _updateLivePreviews() {
        const canvases = document.querySelectorAll('.live-preview-canvas');
        if (canvases.length === 0) return;

        // Load image if not cached
        if (!this._cachedImage) {
            try {
                this._cachedImage = await this._loadImage(this._imageSrc);
            } catch {
                return;
            }
        }

        const img = this._cachedImage;

        canvases.forEach(canvas => {
            const studentId = canvas.dataset.studentId;
            const zone = this._zones.find(z => z.studentId === studentId);
            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, 40, 40);

            if (!zone) {
                // Draw placeholder circle
                ctx.fillStyle = 'rgba(255,255,255,0.05)';
                ctx.beginPath();
                ctx.arc(20, 20, 18, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.lineWidth = 1;
                ctx.stroke();
                return;
            }

            // Draw cropped zone using global radius
            const { cx, cy } = zone;
            const r = this._globalRadius;
            const diameter = r * 2;
            const sx = Math.max(0, cx - r);
            const sy = Math.max(0, cy - r);
            const sw = Math.min(diameter, this._imageNaturalWidth - sx);
            const sh = Math.min(diameter, this._imageNaturalHeight - sy);

            // Draw circular clip
            ctx.save();
            ctx.beginPath();
            ctx.arc(20, 20, 18, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 40, 40);
            ctx.restore();

            // Add border
            ctx.strokeStyle = '#6c5ce7';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(20, 20, 18, 0, Math.PI * 2);
            ctx.stroke();
        });
    },

    // ========================================================================
    // STEP 3: PREVIEW & CONFIRM
    // ========================================================================

    _initStep3() {
        const container = document.getElementById('trombiPreviewGrid');
        if (!container) return;

        const students = appState.filteredResults || [];
        const assignedZones = this._zones.filter(z => z.studentId);

        if (assignedZones.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Aucune photo assignée. Retournez à l'étape précédente.</p>
                </div>
            `;
            return;
        }

        // Create preview canvas for each assigned zone
        container.innerHTML = '<div class="preview-list"></div>';
        const list = container.querySelector('.preview-list');

        for (const zone of assignedZones) {
            const student = students.find(s => s.id === zone.studentId);
            if (!student) continue;

            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            previewItem.innerHTML = `
                <canvas class="preview-canvas" width="80" height="80"></canvas>
                <span>${student.prenom} ${student.nom}</span>
            `;
            list.appendChild(previewItem);

            // Draw preview
            this._drawPreview(previewItem.querySelector('canvas'), zone);
        }
    },

    async _drawPreview(canvas, zone) {
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            const { cx, cy } = zone;
            const r = this._globalRadius;
            const diameter = r * 2;

            // Crop square from natural image
            const sx = cx - r;
            const sy = cy - r;

            ctx.clearRect(0, 0, 80, 80);
            ctx.drawImage(img, sx, sy, diameter, diameter, 0, 0, 80, 80);
        };

        img.src = this._imageSrc;
    },

    // ========================================================================
    // IMPORT EXECUTION
    // ========================================================================

    async _confirmImport() {
        const assignedZones = this._zones.filter(z => z.studentId);

        if (assignedZones.length === 0) {
            UI.showNotification('Aucune photo à importer', 'warning');
            return;
        }

        UI.showLoadingOverlay('Extraction des photos...');

        try {
            // Load image
            const img = await this._loadImage(this._imageSrc);

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const targetSize = 200;
            canvas.width = targetSize;
            canvas.height = targetSize;

            const assignments = [];

            for (const zone of assignedZones) {
                const { studentId, cx, cy } = zone;
                const r = this._globalRadius;
                const diameter = r * 2;

                // Crop from natural image (already in natural pixels!)
                const sx = Math.max(0, cx - r);
                const sy = Math.max(0, cy - r);
                const sw = Math.min(diameter, this._imageNaturalWidth - sx);
                const sh = Math.min(diameter, this._imageNaturalHeight - sy);

                ctx.clearRect(0, 0, targetSize, targetSize);
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetSize, targetSize);

                const photoData = canvas.toDataURL('image/jpeg', 0.85);
                assignments.push({ studentId, photoData });
            }

            const count = await StudentPhotoManager.bulkAssignPhotos(assignments);

            if (count > 0) {
                UI.showNotification(`${count} photos importées avec succès`, 'success');
                window.dispatchEvent(new CustomEvent('studentsUpdated'));
            }

            this.close();
        } catch (error) {
            console.error('Photo extraction failed:', error);
            UI.showNotification('Erreur lors de l\'extraction', 'error');
        } finally {
            UI.hideLoadingOverlay();
        }
    },

    _loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = src;
        });
    }
};
