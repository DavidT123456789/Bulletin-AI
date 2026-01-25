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

    /** Cached Image object for canvas operations */
    _cachedImage: null,

    /** Counter for zone IDs */
    _zoneIdCounter: 0,

    /** Global radius for all zones (in natural pixels) */
    _globalRadius: 0,

    /** Drag state */
    _dragging: null, // { zone, offsetX, offsetY }

    /** Last focused control for keyboard navigation: 'gaps' | 'zone' | null */
    _lastFocusedControl: null,

    /** Last focused zone ID for keyboard positioning */
    _lastFocusedZoneId: null,

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
        document.getElementById('trombiSampleBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
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

        // Keyboard navigation for gap sliders and zone positioning
        document.addEventListener('keydown', e => this._handleKeyDown(e));

        // Global paste event for image
        document.addEventListener('paste', e => {
            const modal = document.getElementById('trombiWizardModal');
            if (!modal || !modal.classList.contains('visible') || this._currentStep !== 1) return;

            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (const item of items) {
                if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    this._loadFile(file);
                    break;
                }
            }
        });
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
        if (!modal || !modal.classList.contains('visible')) return;

        // Add closing animation
        modal.classList.add('closing');

        // Wait for animation to complete, then hide
        setTimeout(() => {
            modal.classList.remove('visible', 'closing');
            this._reset();
        }, 250); // Match CSS transition duration
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
        this._cachedImage = null;
        this._lastFocusedControl = null;
        this._lastFocusedZoneId = null;

        // Cleanup observer
        if (this._imgResizeObserver) {
            this._imgResizeObserver.disconnect();
            this._imgResizeObserver = null;
        }

        // Reset file input so the same file can be re-imported
        const fileInput = document.getElementById('trombiFileInput');
        if (fileInput) fileInput.value = '';

        // Reset dropzone state
        const placeholder = document.getElementById('trombiDropPlaceholder');
        const preview = document.getElementById('trombiDropPreview');
        const previewImg = document.getElementById('trombiPreviewImg');
        const dropZone = document.getElementById('trombiDropZone');
        const sampleBtn = document.getElementById('trombiSampleBtn');

        if (placeholder) placeholder.style.display = '';
        if (preview) preview.style.display = 'none';
        if (previewImg) previewImg.src = '';
        dropZone?.classList.remove('has-image');
        if (sampleBtn) sampleBtn.style.display = '';

        document.getElementById('trombiImageInfo')?.replaceChildren();

        const nextBtn = document.getElementById('trombiStep1NextBtn');
        if (nextBtn) nextBtn.disabled = true;

        // Reset step content & footer visibility to initial state
        [1, 2, 3].forEach(n => {
            const step = document.getElementById(`trombiStep${n}`);
            const footer = document.getElementById(`trombiStep${n}Footer`);
            if (step) {
                step.style.cssText = '';
                step.style.display = n === 1 ? 'block' : 'none';
            }
            if (footer) footer.style.display = n === 1 ? 'flex' : 'none';
        });

        // Clean up dynamically added content
        document.querySelector('.grid-control-panel')?.remove();
        document.getElementById('trombiImageWithZones')?.replaceChildren();
        document.getElementById('trombiAssignmentGrid')?.replaceChildren();
        document.getElementById('trombiPreviewGrid')?.replaceChildren();

        this._updateStepperUI();
    },

    // ========================================================================
    // STEP NAVIGATION
    // ========================================================================

    _goToStep(step) {
        const previousStep = this._currentStep;
        this._currentStep = step;

        // Animate transition based on direction
        if (step > previousStep) {
            this._animateStepTransition(previousStep, step, 'forward');
        } else {
            this._animateStepTransition(previousStep, step, 'backward');
        }

        this._updateStepperUI();

        // Initialize step content (after animation starts)
        if (step === 2) {
            setTimeout(() => this._initStep2(), 50);
        } else if (step === 3) {
            setTimeout(() => this._initStep3(), 50);
        }
    },

    _animateStepTransition(fromStep, toStep, direction) {
        const fromContent = document.getElementById(`trombiStep${fromStep}`);
        const toContent = document.getElementById(`trombiStep${toStep}`);
        const fromFooter = document.getElementById(`trombiStep${fromStep}Footer`);
        const toFooter = document.getElementById(`trombiStep${toStep}Footer`);

        if (!fromContent || !toContent) return;

        // Switch footers immediately (no animation - content is the same)
        if (fromFooter) fromFooter.style.display = 'none';
        if (toFooter) toFooter.style.display = 'flex';

        // Special FLIP animation for Step 1 ↔ Step 2
        if (fromStep === 1 && toStep === 2) {
            this._animateFLIPTransition(fromContent, toContent, 'forward');
            return;
        }
        if (fromStep === 2 && toStep === 1) {
            this._animateFLIPTransition(fromContent, toContent, 'backward');
            return;
        }

        // Generic animation for other transitions
        this._animateGenericTransition(fromContent, toContent, direction);
    },

    _animateFLIPTransition(fromContent, toContent, direction) {
        // Determine source and target image elements based on direction
        let sourceImageEl, targetImageEl;

        if (direction === 'forward') {
            // Step 1 → Step 2: from dropzone to image panel
            sourceImageEl = fromContent.querySelector('.drop-zone-image');
            targetImageEl = null; // Will get trombi-image-wrapper after toContent is visible
        } else {
            // Step 2 → Step 1: from image panel to dropzone
            sourceImageEl = fromContent.querySelector('.trombi-image-wrapper img, .trombi-image');
            targetImageEl = toContent.querySelector('.drop-zone-image');
        }

        if (!sourceImageEl || !sourceImageEl.src) {
            // Fallback to generic if no image
            this._animateGenericTransition(fromContent, toContent, direction);
            return;
        }

        // FIRST: Capture source position
        const sourceRect = sourceImageEl.getBoundingClientRect();

        // Create ghost element for FLIP animation
        const ghost = document.createElement('div');
        ghost.className = 'trombi-flip-ghost';
        ghost.style.cssText = `
            top: ${sourceRect.top}px;
            left: ${sourceRect.left}px;
            width: ${sourceRect.width}px;
            height: ${sourceRect.height}px;
        `;
        ghost.innerHTML = `<img src="${this._imageSrc || sourceImageEl.src}" alt="">`;
        document.body.appendChild(ghost);

        // Hide source immediately
        sourceImageEl.style.opacity = '0';

        // Prepare destination
        toContent.style.display = 'flex';
        toContent.style.opacity = '0';

        // Fade out fromContent
        fromContent.style.transition = 'opacity 0.25s ease';
        fromContent.style.opacity = '0';

        // Setup target panels for reveal animation (forward only)
        const imagePanel = toContent.querySelector('.trombi-image-panel');
        const assignmentPanel = toContent.querySelector('.trombi-assignment-panel');
        const dropZone = toContent.querySelector('.trombi-drop-zone');

        if (direction === 'forward') {
            if (imagePanel) imagePanel.classList.add('morph-target');
            if (assignmentPanel) assignmentPanel.classList.add('slide-in');
        } else {
            // Backward: prepare dropzone for reveal
            if (dropZone) {
                dropZone.style.opacity = '0';
                dropZone.style.transform = 'scale(0.95)';
            }
        }

        setTimeout(() => {
            fromContent.style.display = 'none';
            fromContent.style.opacity = '';
            fromContent.style.transition = '';
            sourceImageEl.style.opacity = '';

            // Show destination content
            toContent.style.opacity = '1';

            // LAST: Get target position after content is visible
            requestAnimationFrame(() => {
                let targetRect;

                if (direction === 'forward') {
                    const targetWrapper = toContent.querySelector('.trombi-image-wrapper');
                    if (targetWrapper) {
                        targetRect = targetWrapper.getBoundingClientRect();
                    }
                } else {
                    // Backward: target is the dropzone preview
                    const targetPreview = toContent.querySelector('.drop-zone-image');
                    if (targetPreview) {
                        targetRect = targetPreview.parentElement.getBoundingClientRect();
                    }
                }

                if (targetRect) {
                    // INVERT & PLAY: Animate ghost to target position
                    ghost.style.transition = 'all 0.6s cubic-bezier(0.32, 0.72, 0, 1)';
                    ghost.style.top = `${targetRect.top}px`;
                    ghost.style.left = `${targetRect.left}px`;
                    ghost.style.width = `${targetRect.width}px`;
                    ghost.style.height = `${targetRect.height}px`;
                    ghost.style.borderRadius = direction === 'forward' ? 'var(--radius-md)' : 'var(--radius-lg)';
                    ghost.style.boxShadow = direction === 'forward'
                        ? '0 4px 20px rgba(0, 0, 0, 0.15)'
                        : '0 8px 32px rgba(0, 0, 0, 0.2)';
                }

                // Reveal panels with delay
                setTimeout(() => {
                    if (direction === 'forward') {
                        if (imagePanel) imagePanel.classList.add('revealed');
                        if (assignmentPanel) assignmentPanel.classList.add('revealed');
                    } else {
                        // Backward: reveal dropzone
                        if (dropZone) {
                            dropZone.style.transition = 'opacity 0.4s cubic-bezier(0.32, 0.72, 0, 1), transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)';
                            dropZone.style.opacity = '1';
                            dropZone.style.transform = 'scale(1)';
                        }
                    }
                }, 150);

                // Cleanup ghost after animation
                setTimeout(() => {
                    ghost.style.opacity = '0';
                    ghost.style.transition = 'opacity 0.2s ease';
                    setTimeout(() => {
                        ghost.remove();
                        // Remove animation classes/styles
                        if (direction === 'forward') {
                            if (imagePanel) imagePanel.classList.remove('morph-target', 'revealed');
                            if (assignmentPanel) assignmentPanel.classList.remove('slide-in', 'revealed');
                        } else {
                            if (dropZone) {
                                dropZone.style.transition = '';
                                dropZone.style.transform = '';
                            }
                        }
                    }, 200);
                }, 550);
            });
        }, 200);
    },

    _animateGenericTransition(fromContent, toContent, direction) {
        // Prepare the incoming step
        toContent.style.display = 'flex';
        toContent.style.opacity = '0';
        toContent.style.transform = direction === 'forward' ? 'translateX(30px)' : 'translateX(-30px)';

        // Animate out the current step
        fromContent.style.transition = 'opacity 0.3s cubic-bezier(0.32, 0.72, 0, 1), transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
        fromContent.style.opacity = '0';
        fromContent.style.transform = direction === 'forward' ? 'translateX(-30px)' : 'translateX(30px)';

        // After outgoing animation, animate in the new step
        setTimeout(() => {
            fromContent.style.display = 'none';
            fromContent.style.transform = '';
            fromContent.style.opacity = '';
            fromContent.style.transition = '';

            // Animate in the new step
            toContent.style.transition = 'opacity 0.4s cubic-bezier(0.32, 0.72, 0, 1), transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)';

            requestAnimationFrame(() => {
                toContent.style.opacity = '1';
                toContent.style.transform = 'translateX(0)';

                // Animate child elements sequentially for premium feel
                this._animateStepChildren(toContent, this._currentStep);
            });

            // Cleanup after animation
            setTimeout(() => {
                toContent.style.transition = '';
                toContent.style.transform = '';
            }, 500);

        }, 250);
    },

    _animateStepChildren(container, step) {
        // Step 3: Animate preview grid items with stagger
        if (step === 3) {
            const gridItems = container.querySelectorAll('.trombi-preview-item');
            gridItems.forEach((item, index) => {
                item.classList.add('stagger-in');
                item.style.transitionDelay = `${index * 40}ms`;

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        item.classList.add('revealed');
                    });
                });

                setTimeout(() => {
                    item.classList.remove('stagger-in', 'revealed');
                    item.style.transitionDelay = '';
                }, 600 + index * 40);
            });
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
        this._cachedImage = null; // Clear cache
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
        const placeholder = document.getElementById('trombiDropPlaceholder');
        const preview = document.getElementById('trombiDropPreview');
        const previewImg = document.getElementById('trombiPreviewImg');
        const dropZone = document.getElementById('trombiDropZone');
        const sampleBtn = document.getElementById('trombiSampleBtn');

        if (!placeholder || !preview || !previewImg) return;

        // Show preview, hide placeholder
        placeholder.style.display = 'none';
        preview.style.display = 'flex';
        previewImg.src = this._imageSrc;

        // Add loaded state to dropzone for styling
        dropZone?.classList.add('has-image');

        // Hide sample button when image is loaded
        if (sampleBtn) sampleBtn.style.display = 'none';

        // Display info message in footer
        const footerInfo = document.getElementById('trombiImageInfo');
        if (footerInfo) {
            footerInfo.innerHTML = `<i class="fas fa-check-circle"></i> Image chargée (${this._imageNaturalWidth} × ${this._imageNaturalHeight} px)`;
        }
    },

    // ========================================================================
    // STEP 2: SELECTION & ASSOCIATION
    // ========================================================================

    _initStep2() {
        const imagePanel = document.getElementById('trombiImageWithZones');
        if (!imagePanel) return;

        // Setup image with overlay
        // Setup image with overlay - wrapped in a container for correct aspect ratio positioning
        imagePanel.innerHTML = `
            <div class="trombi-viewport">
                <div class="trombi-content-wrapper" style="aspect-ratio: ${this._imageNaturalWidth} / ${this._imageNaturalHeight}">
                    <img src="${this._imageSrc}" alt="Trombinoscope" class="trombi-image" id="trombiStep2Image">
                    <div class="trombi-zones-overlay" id="trombiZonesOverlay"></div>
                </div>
            </div>
        `;

        const img = document.getElementById('trombiStep2Image');
        img.onload = () => {
            // Create default grid if no zones exist
            if (this._zones.length === 0) {
                this._createDefaultGrid();
            }
            this._renderZones();
        };

        // Fix: Observer for layout changes (aspect-ratio reflow)
        // This ensures zones are re-calculated when the image size changes
        if (this._imgResizeObserver) this._imgResizeObserver.disconnect();

        this._imgResizeObserver = new ResizeObserver(() => {
            // Debounce slightly or just call render (it's cheap enough)
            window.requestAnimationFrame(() => this._renderZones());
        });
        this._imgResizeObserver.observe(img);

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

        // Bind Auto button (now in HTML, not generated by _setupControlPanel)
        document.getElementById('autoOrderBtn')?.addEventListener('click', () => {
            this._autoAssignInOrder();
        });
    },

    _setupControlPanel() {
        const container = document.querySelector('.trombi-image-panel');
        if (!container || container.querySelector('.grid-control-panel')) return;

        // Default values
        this._gridCols = 4;
        this._gridRows = Math.ceil((appState.filteredResults?.length || 8) / 4);
        this._gapH = 0;  // Horizontal spacing between zones (%)
        this._gapV = 0;  // Vertical spacing between zones (%)
        this._groupedDrag = true; // Grouped drag mode (default = true)

        const panelHtml = `
            <div class="grid-control-panel">
                <div class="control-row-group">
                    <div class="control-row">
                        <label><i class="fas fa-columns"></i> Colonnes</label>
                        <div class="slider-group">
                            <div class="slider-track">
                                <input type="range" class="control-slider" id="colsSlider" 
                                       min="1" max="8" value="${this._gridCols}">
                            </div>
                            <span class="slider-value" id="colsValue">${this._gridCols}</span>
                        </div>
                    </div>
                    <div class="control-row">
                        <label><i class="fas fa-bars"></i> Lignes</label>
                        <div class="slider-group">
                            <div class="slider-track">
                                <input type="range" class="control-slider" id="rowsSlider" 
                                       min="1" max="10" value="${this._gridRows}">
                            </div>
                            <span class="slider-value" id="rowsValue">${this._gridRows}</span>
                        </div>
                    </div>
                </div>
                <div class="control-row-group">
                    <div class="control-row">
                        <label><i class="fas fa-arrows-left-right-to-line"></i> Écart H</label>
                        <div class="slider-group">
                            <div class="slider-track">
                                <input type="range" class="control-slider" id="gapHSlider" 
                                       min="-50" max="50" step="0.5" value="0">
                            </div>
                            <span class="slider-value" id="gapHValue">0</span>
                        </div>
                    </div>
                    <div class="control-row">
                        <label><i class="fas fa-arrows-up-down-left-right"></i> Écart V</label>
                        <div class="slider-group">
                            <div class="slider-track">
                                <input type="range" class="control-slider" id="gapVSlider" 
                                       min="-50" max="50" step="0.5" value="0">
                            </div>
                            <span class="slider-value" id="gapVValue">0</span>
                        </div>
                    </div>
                </div>
                <div class="control-row-group">
                    <div class="control-row">
                        <label><i class="fas fa-expand-alt"></i> Taille</label>
                        <div class="slider-group">
                            <div class="slider-track">
                                <input type="range" class="control-slider" id="sizeSlider" 
                                       min="5" max="100" value="60">
                            </div>
                            <span class="slider-value" id="sizeValue">60%</span>
                        </div>
                    </div>
                    <div class="control-row">
                        <label class="sync-toggle-label">
                            <span class="toggle-text"><i class="fas fa-object-group"></i> Groupé</span>
                            <span class="toggle-wrapper">
                                <input type="checkbox" id="groupedDragToggle" class="sync-toggle-checkbox" checked>
                                <span class="sync-toggle-switch"></span>
                            </span>
                        </label>
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', panelHtml);

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

        // Track focus on size slider for keyboard navigation
        sizeSlider?.addEventListener('focus', () => {
            this._lastFocusedControl = 'size';
        });
        sizeSlider?.addEventListener('mousedown', () => {
            this._lastFocusedControl = 'size';
        });

        gapHSlider?.addEventListener('input', e => {
            this._gapH = parseFloat(e.target.value);
            gapHValue.textContent = Number.isInteger(this._gapH) ? this._gapH : this._gapH.toFixed(1);
            this._applyGaps();
        });

        gapVSlider?.addEventListener('input', e => {
            this._gapV = parseFloat(e.target.value);
            gapVValue.textContent = Number.isInteger(this._gapV) ? this._gapV : this._gapV.toFixed(1);
            this._applyGaps();
        });

        // Track focus on gap sliders for keyboard navigation
        gapHSlider?.addEventListener('focus', () => {
            this._lastFocusedControl = 'gaps';
        });
        gapVSlider?.addEventListener('focus', () => {
            this._lastFocusedControl = 'gaps';
        });
        // Also track mousedown for touch-like interactions
        gapHSlider?.addEventListener('mousedown', () => {
            this._lastFocusedControl = 'gaps';
        });
        gapVSlider?.addEventListener('mousedown', () => {
            this._lastFocusedControl = 'gaps';
        });

        groupedToggle?.addEventListener('change', e => {
            this._groupedDrag = e.target.checked;
        });

        // Create initial grid with auto-assignment
        this._createGridSilent(this._gridCols, this._gridRows);
    },

    /**
     * Apply gap values to all zones relative to the FIRST zone (0,0)
     * The first zone stays fixed as the reference point.
     */
    _applyGaps() {
        if (this._zones.length === 0) return;

        const cols = this._gridCols;
        const w = this._imageNaturalWidth;
        const h = this._imageNaturalHeight;

        // Base cell size
        const baseCellW = w / cols;
        const baseCellH = h / Math.ceil(this._zones.length / cols);

        // The first zone (index 0) is the reference - it stays fixed
        const refZone = this._zones[0];
        const refCx = refZone.cx;
        const refCy = refZone.cy;

        // Gap adjustment (% of cell size) - affects spacing between zones
        const gapPxH = (this._gapH / 100) * baseCellW;
        const gapPxV = (this._gapV / 100) * baseCellH;

        this._zones.forEach((zone, idx) => {
            if (idx === 0) return; // Skip first zone - it's the reference

            const col = idx % cols;
            const row = Math.floor(idx / cols);

            // Position relative to first zone with gap applied
            // Each column/row adds base cell size + gap adjustment
            zone.cx = refCx + (col * (baseCellW + gapPxH));
            zone.cy = refCy + (row * (baseCellH + gapPxV));
        });

        this._renderZones();
        this._updateLivePreviews();
    },

    /**
     * Internal gap application with explicit cell dimensions (used during grid rebuild)
     */
    _applyGapsInternal(baseCellW, baseCellH) {
        if (this._zones.length === 0) return;

        const cols = this._gridCols;
        const refZone = this._zones[0];
        const refCx = refZone.cx;
        const refCy = refZone.cy;

        // Gap adjustment (% of cell size)
        const gapPxH = (this._gapH / 100) * baseCellW;
        const gapPxV = (this._gapV / 100) * baseCellH;

        this._zones.forEach((zone, idx) => {
            if (idx === 0) return;

            const col = idx % cols;
            const row = Math.floor(idx / cols);

            zone.cx = refCx + (col * (baseCellW + gapPxH));
            zone.cy = refCy + (row * (baseCellH + gapPxV));
        });
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

    _createGrid(cols, rows, preserveReference = false) {
        // Save the reference zone position if we want to preserve it
        let refCx = null, refCy = null;
        if (preserveReference && this._zones.length > 0) {
            refCx = this._zones[0].cx;
            refCy = this._zones[0].cy;
        }

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

        // If we had a reference position stored, restore it and rebuild positions
        if (refCx !== null && refCy !== null) {
            // Move zone 0 back to its original position
            this._zones[0].cx = refCx;
            this._zones[0].cy = refCy;

            // Recalculate other zone positions relative to zone 0 with gaps
            this._applyGapsInternal(cellW, cellH);
        }

        this._renderZones();
        this._renderAssignmentGrid();
        this._updateSizeSliderValue();
    },

    /**
     * Create grid silently (without notification) for instant slider feedback
     * Also auto-assigns students to zones
     * Preserves reference zone position when zones already exist
     */
    _createGridSilent(cols, rows) {
        // Preserve reference position if zones already exist (user has adjusted positions)
        const hasExistingZones = this._zones.length > 0;
        this._createGrid(cols, rows, hasExistingZones);
        // Auto-assign students to zones automatically
        this._autoAssignSilent();
        this._updateLivePreviews();
    },

    /**
     * Auto-assign students to zones silently (no notification)
     */
    _autoAssignSilent() {
        const students = appState.filteredResults || [];
        this._zones.forEach((zone, idx) => {
            zone.studentId = students[idx]?.id || null;
        });
        this._renderZones();
        this._renderAssignmentGrid();
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

            // Calculate label scale based on diameter (shrink when zone is small)
            // Label full size at 50px+, starts shrinking below that
            const labelScale = Math.max(0.5, Math.min(1, diameter / 50));
            const labelFontSize = Math.max(8, Math.round(12 * labelScale));
            const labelHeight = Math.max(16, Math.round(28 * labelScale));
            const labelPadding = Math.max(2, Math.round(8 * labelScale));

            // Scale delete button and border for small zones
            const deleteSize = Math.max(14, Math.round(22 * labelScale));
            const deleteFontSize = Math.max(7, Math.round(10 * labelScale));
            const borderWidth = diameter < 40 ? 2 : 3;

            return `
                <div class="trombi-zone" 
                     data-zone-id="${zone.id}"
                     style="left: ${dispCx}px; top: ${dispCy}px; 
                            width: ${diameter}px; height: ${diameter}px;
                            border-width: ${borderWidth}px;">
                    <span class="zone-label" style="
                        font-size: ${labelFontSize}px;
                        height: ${labelHeight}px;
                        min-width: ${labelHeight}px;
                        padding: 0 ${labelPadding}px;
                        border-radius: ${labelHeight / 2}px;
                    ">${label}</span>
                    <button class="zone-delete" data-zone-id="${zone.id}" style="
                        width: ${deleteSize}px;
                        height: ${deleteSize}px;
                        font-size: ${deleteFontSize}px;
                    ">
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

        // Store original positions of all zones for synchronized drag
        const originalPositions = new Map();
        this._zones.forEach(z => {
            originalPositions.set(z.id, { cx: z.cx, cy: z.cy });
        });

        this._dragging = {
            zone,
            offsetX: clickNatX - zone.cx,
            offsetY: clickNatY - zone.cy,
            startCx: zone.cx,
            startCy: zone.cy,
            originalPositions
        };

        // Track this zone for keyboard navigation
        this._lastFocusedControl = 'zone';
        this._lastFocusedZoneId = zoneId;

        el.classList.add('dragging');

        // Highlight corresponding row in assignment list
        this._highlightAssignmentRow(zoneId);

        // Also ensure self is focused
        this._highlightZone(zoneId);
    },

    _handleMouseMove(e) {
        if (!this._dragging) return;

        const overlay = document.getElementById('trombiZonesOverlay');
        if (!overlay) return;

        const rect = overlay.getBoundingClientRect();
        const scaleX = this._imageNaturalWidth / rect.width;
        const scaleY = this._imageNaturalHeight / rect.height;

        const { zone, offsetX, offsetY, startCx, startCy } = this._dragging;
        const newCx = (e.clientX - rect.left) * scaleX - offsetX;
        const newCy = (e.clientY - rect.top) * scaleY - offsetY;

        if (this._groupedDrag) {
            // Grouped mode: move ALL zones by the same delta
            const deltaX = newCx - startCx;
            const deltaY = newCy - startCy;

            this._zones.forEach(z => {
                const originalPos = this._dragging.originalPositions.get(z.id);
                if (originalPos) {
                    z.cx = originalPos.cx + deltaX;
                    z.cy = originalPos.cy + deltaY;
                }
            });
        } else {
            // Individual mode: move only this zone
            const r = this._globalRadius;
            zone.cx = Math.max(r, Math.min(this._imageNaturalWidth - r, newCx));
            zone.cy = Math.max(r, Math.min(this._imageNaturalHeight - r, newCy));
        }

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

    /**
     * Handle keyboard navigation for gap sliders and zone positioning
     * - When gap sliders are focused: ←/→ adjust H gap, ↑/↓ adjust V gap
     * - When zone select is focused: all 4 arrows move the zone position
     */
    _handleKeyDown(e) {
        // Only handle arrow keys
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

        // Only active on Step 2 and when modal is visible
        const modal = document.getElementById('trombiWizardModal');
        if (!modal?.classList.contains('visible') || this._currentStep !== 2) return;

        // Must have a focused control
        if (!this._lastFocusedControl) return;

        // Handle gap slider mode
        if (this._lastFocusedControl === 'gaps') {
            e.preventDefault();
            const step = e.shiftKey ? 5 : 0.5; // Shift for bigger steps

            const gapHSlider = document.getElementById('gapHSlider');
            const gapVSlider = document.getElementById('gapVSlider');
            const gapHValue = document.getElementById('gapHValue');
            const gapVValue = document.getElementById('gapVValue');

            if (e.key === 'ArrowLeft') {
                this._gapH = Math.max(-50, this._gapH - step);
                if (gapHSlider) gapHSlider.value = this._gapH;
                if (gapHValue) gapHValue.textContent = Number.isInteger(this._gapH) ? this._gapH : this._gapH.toFixed(1);
            } else if (e.key === 'ArrowRight') {
                this._gapH = Math.min(50, this._gapH + step);
                if (gapHSlider) gapHSlider.value = this._gapH;
                if (gapHValue) gapHValue.textContent = Number.isInteger(this._gapH) ? this._gapH : this._gapH.toFixed(1);
            } else if (e.key === 'ArrowUp') {
                this._gapV = Math.max(-50, this._gapV - step);
                if (gapVSlider) gapVSlider.value = this._gapV;
                if (gapVValue) gapVValue.textContent = Number.isInteger(this._gapV) ? this._gapV : this._gapV.toFixed(1);
            } else if (e.key === 'ArrowDown') {
                this._gapV = Math.min(50, this._gapV + step);
                if (gapVSlider) gapVSlider.value = this._gapV;
                if (gapVValue) gapVValue.textContent = Number.isInteger(this._gapV) ? this._gapV : this._gapV.toFixed(1);
            }

            this._applyGaps();
            return;
        }

        // Handle size slider mode
        if (this._lastFocusedControl === 'size') {
            // Only ↑/↓ adjust size (←/→ are ignored for size)
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const step = e.shiftKey ? 10 : 2; // Shift for bigger steps

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
                this._updateSizeFromPercent(currentPercent);
            }
            return;
        }

        // Handle zone positioning mode
        if (this._lastFocusedControl === 'zone' && this._lastFocusedZoneId !== null) {
            e.preventDefault();

            const zone = this._zones.find(z => z.id === this._lastFocusedZoneId);
            if (!zone) return;

            // Move step in natural pixels (relative to image size)
            const baseStep = Math.min(this._imageNaturalWidth, this._imageNaturalHeight) * 0.003;
            const step = e.shiftKey ? baseStep * 5 : baseStep; // Shift for bigger steps
            const r = this._globalRadius;

            if (this._groupedDrag) {
                // Grouped mode: move ALL zones
                let deltaX = 0, deltaY = 0;
                if (e.key === 'ArrowLeft') deltaX = -step;
                else if (e.key === 'ArrowRight') deltaX = step;
                else if (e.key === 'ArrowUp') deltaY = -step;
                else if (e.key === 'ArrowDown') deltaY = step;

                this._zones.forEach(z => {
                    z.cx += deltaX;
                    z.cy += deltaY;
                });
            } else {
                // Individual mode: move only this zone
                if (e.key === 'ArrowLeft') {
                    zone.cx = Math.max(r, zone.cx - step);
                } else if (e.key === 'ArrowRight') {
                    zone.cx = Math.min(this._imageNaturalWidth - r, zone.cx + step);
                } else if (e.key === 'ArrowUp') {
                    zone.cy = Math.max(r, zone.cy - step);
                } else if (e.key === 'ArrowDown') {
                    zone.cy = Math.min(this._imageNaturalHeight - r, zone.cy + step);
                }
            }

            this._renderZones();
            this._updateLivePreviews();

            // Highlight corresponding row in assignment list when moving via keyboard
            this._highlightAssignmentRow(this._lastFocusedZoneId);
            this._highlightZone(this._lastFocusedZoneId);
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

        // Sort zones by ID to keep order stable
        const sortedZones = [...this._zones].sort((a, b) => a.id - b.id);

        container.innerHTML = `
            ${sortedZones.map((zone, index) => {
            return `
                    <div class="assignment-row" data-zone-id="${zone.id}">
                        <div class="assignment-preview">
                            <canvas class="live-preview-canvas" 
                                    data-zone-id="${zone.id}" 
                                    width="80" height="80"></canvas>
                        </div>
                        <div class="assignment-id">
                            #${index + 1}
                        </div>
                        <div class="assignment-student-select">
                            <select class="assignment-select" data-zone-id="${zone.id}">
                                <option value="">Choisir un élève...</option>
                                ${students.map(s => {
                // Check if this student is assigned to ANOTHER zone
                const assignedToOther = this._zones.some(z => z.studentId === s.id && z.id !== zone.id);
                // If assigned to other, maybe disabled or show (assigned)
                const label = assignedToOther ? `${s.prenom} ${s.nom} (déjà assigné)` : `${s.prenom} ${s.nom}`;

                return `
                                        <option value="${s.id}" ${zone.studentId === s.id ? 'selected' : ''}>
                                            ${label}
                                        </option>
                                    `;
            }).join('')}
                            </select>
                        </div>
                    </div>
                `;
        }).join('')}
        `;

        // Update zones count in footer
        const assignedCount = this._zones.filter(z => z.studentId).length;
        const zonesInfo = document.getElementById('trombiZonesInfo');
        if (zonesInfo) {
            zonesInfo.textContent = `${assignedCount} / ${this._zones.length} zones assignées`;
        }

        // Bind select events
        container.querySelectorAll('.assignment-select').forEach(select => {
            select.addEventListener('change', e => {
                const zoneId = parseInt(select.dataset.zoneId);
                const studentId = e.target.value || null;

                // Find the zone
                const zone = this._zones.find(z => z.id === zoneId);
                if (!zone) return;

                // If we are selecting a student, check if they were already assigned elsewhere
                // (Though the UI disables them, it's good safety)
                if (studentId) {
                    const existingZone = this._zones.find(z => z.studentId === studentId && z.id !== zoneId);
                    if (existingZone) {
                        existingZone.studentId = null; // Unassign from previous
                    }
                }

                zone.studentId = studentId;

                this._renderZones();
                this._renderAssignmentGrid(); // Re-render to update other dropdowns (disabled states)
            });

            // Track focus/interaction for keyboard zone positioning
            const trackZoneFocus = () => {
                const zoneId = parseInt(select.dataset.zoneId);
                this._lastFocusedControl = 'zone';
                this._lastFocusedZoneId = zoneId;
            };
            select.addEventListener('focus', trackZoneFocus);
            select.addEventListener('mousedown', trackZoneFocus);

            // Also highlight row on focus
            select.addEventListener('focus', () => this._highlightAssignmentRow(parseInt(select.dataset.zoneId), false));
        });

        // Add click listeners for rows to highlight zones
        container.querySelectorAll('.assignment-row').forEach(row => {
            row.addEventListener('click', (e) => {
                // Ignore if clicked on select (already handled)
                if (e.target.closest('select')) return;

                const zoneId = parseInt(row.dataset.zoneId);
                this._highlightZone(zoneId);
                this._highlightAssignmentRow(zoneId, false); // Keep row highlighted but don't scroll
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
            const zoneId = parseInt(canvas.dataset.zoneId);
            const zone = this._zones.find(z => z.id === zoneId);
            const ctx = canvas.getContext('2d');

            // Canvas buffer is 80x80, displayed at 40x40 CSS for HiDPI sharpness
            const size = 80;

            ctx.clearRect(0, 0, size, size);

            if (!zone) return;

            // Draw cropped zone using global radius
            const { cx, cy } = zone;
            const r = this._globalRadius;
            const diameter = r * 2;
            const sx = Math.max(0, cx - r);
            const sy = Math.max(0, cy - r);
            const sw = Math.min(diameter, this._imageNaturalWidth - sx);
            const sh = Math.min(diameter, this._imageNaturalHeight - sy);

            // Draw full image - CSS handles circular shape and border
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
        });
    },

    /**
     * Highlights the zone corresponding to the given ID
     * @param {number} zoneId 
     */
    _highlightZone(zoneId) {
        const overlay = document.getElementById('trombiZonesOverlay');
        if (!overlay) return;

        // Remove focus from all zones
        overlay.querySelectorAll('.trombi-zone').forEach(zone => {
            zone.classList.remove('focused');
        });

        // Add focus to target zone
        const zone = overlay.querySelector(`.trombi-zone[data-zone-id="${zoneId}"]`);
        if (zone) {
            zone.classList.add('focused');
        }
    },

    /**
     * Highlights the assignment row corresponding to the given zone ID
     * @param {number} zoneId - The ID of the zone to highlight
     * @param {boolean} scroll - Whether to scroll the row into view (default: true)
     */
    _highlightAssignmentRow(zoneId, scroll = true) {
        const container = document.getElementById('trombiAssignmentGrid');
        if (!container) return;

        // Remove focus from all rows
        container.querySelectorAll('.assignment-row').forEach(row => {
            row.classList.remove('focused');
        });

        // Add focus to target row
        const row = container.querySelector(`.assignment-row[data-zone-id="${zoneId}"]`);
        if (row) {
            row.classList.add('focused');

            if (scroll) {
                row.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }
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
            // Buffer 160x160 for HiDPI, displayed at 80x80 CSS
            previewItem.innerHTML = `
                <canvas class="preview-canvas" width="160" height="160"></canvas>
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
            const sx = Math.max(0, cx - r);
            const sy = Math.max(0, cy - r);
            const sw = Math.min(diameter, this._imageNaturalWidth - sx);
            const sh = Math.min(diameter, this._imageNaturalHeight - sy);

            // Draw at 160x160 for HiDPI sharpness
            const size = 160;
            ctx.clearRect(0, 0, size, size);
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
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
