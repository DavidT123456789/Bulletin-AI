/**
 * @fileoverview Trombinoscope Manager - Photo extraction from class photos
 * Refactored with clean coordinate system (natural pixels)
 * @module managers/TrombinoscopeManager
 */

import { appState, userSettings } from '../state/State.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
import { UI } from './UIManager.js';
import { ClassManager } from './ClassManager.js';
import { Utils } from '../utils/Utils.js';
import { parsePronoteTrombiPdf } from '../utils/PronoteTrombiParser.js';
import { StudentDataManager } from './StudentDataManager.js';
import { StorageManager } from './StorageManager.js';

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

    /** Parsed PDF data when loaded from a PDF */
    _parsedPdfData: null,

    /** Current page index for multi-page PDF */
    _currentPageIndex: 0,

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

    /** Current zoom level for the viewport (1.0 = 100%) */
    _zoomLevel: 1.0,

    /** Drag state */
    _dragging: null, // { zone, offsetX, offsetY }

    /** Last focused control for keyboard navigation: 'gaps' | 'zone' | null */
    _lastFocusedControl: null,

    /** Last focused zone ID for keyboard positioning */
    _lastFocusedZoneId: null,

    /** History stack for undo */
    _history: [],

    /** Max history levels */
    _maxHistoryLevels: 20,

    /** Temporary snapshot for slider dragging */
    _tempSliderSnapshot: null,

    /** Temporary snapshot for zone dragging */
    _tempDragSnapshot: null,

    /** Timer for grouping keyboard nudges */
    _nudgeTimer: null,

    /** Multi-selection properties */
    _selectedZoneIds: new Set(),
    _selectionBox: null,
    _selectionBoxDragActive: false,
    _restoreGroupedDrag: false,
    _isTransitioning: false,
    _drawerAnimRaf: null,
    _drawerAnimActive: false,
    _viewportResizeRaf: null,

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    init() {
        this._setupEventListeners();
    },

    _setupEventListeners() {
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
            if (file) {
                if (file.type.startsWith('image/') || file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                    this._loadFile(file);
                }
            }
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

        // Remove image button (× in corner)
        document.getElementById('trombiRemoveImageBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._removeImage();
        });

        // Navigation buttons
        document.getElementById('trombiStep1NextBtn')?.addEventListener('click', () => this._goToStep(2));
        document.getElementById('trombiStep2PrevBtn')?.addEventListener('click', () => this._goToStep(1));
        document.getElementById('trombiStep2NextBtn')?.addEventListener('click', () => this._goToStep(3));
        document.getElementById('trombiStep3PrevBtn')?.addEventListener('click', () => this._goToStep(2));
        document.getElementById('trombiConfirmBtn')?.addEventListener('click', () => this._handleImport());

        // Exclude students with photos toggle
        document.getElementById('trombiExcludeWithPhotos')?.addEventListener('change', () => {
            this._autoAssignSilent();
        });

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

        // Update class badge in header
        const classBadge = document.getElementById('trombiClassBadge');
        if (classBadge) {
            const currentClass = ClassManager.getCurrentClass();
            classBadge.textContent = currentClass?.name || 'Nouvelle classe';
        }
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
        this._parsedPdfData = null;
        this._currentPageIndex = 0;
        this._zoomLevel = 1.0;
        this._imageNaturalWidth = 0;
        this._imageNaturalHeight = 0;
        this._zones = [];
        this._zoneIdCounter = 0;
        this._dragging = null;
        this._resizing = null;
        this._cachedImage = null;
        this._lastFocusedControl = null;
        this._lastFocusedZoneId = null;
        this._history = [];
        this._tempSliderSnapshot = null;
        this._tempDragSnapshot = null;
        this._isNewUpload = false;
        if (this._nudgeTimer) {
            clearTimeout(this._nudgeTimer);
            this._nudgeTimer = null;
        }
        this._selectedZoneIds.clear();
        this._selectionBox = null;
        this._selectionBoxDragActive = false;
        this._restoreGroupedDrag = false;
        this._isTransitioning = false;
        this._drawerAnimActive = false;
        if (this._drawerAnimRaf) {
            cancelAnimationFrame(this._drawerAnimRaf);
            this._drawerAnimRaf = null;
        }
        if (this._viewportResizeRaf) {
            cancelAnimationFrame(this._viewportResizeRaf);
            this._viewportResizeRaf = null;
        }

        // Cleanup observers
        if (this._imgResizeObserver) {
            this._imgResizeObserver.disconnect();
            this._imgResizeObserver = null;
        }
        if (this._viewportResizeObserver) {
            this._viewportResizeObserver.disconnect();
            this._viewportResizeObserver = null;
        }

        if (typeof document === 'undefined') return;

        // Reset file input so the same file can be re-imported
        const fileInput = document.getElementById('trombiFileInput');
        if (fileInput) fileInput.value = '';

        // Reset Step 1 UI elements
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
        document.getElementById('trombiZonesInfo')?.replaceChildren();
        document.getElementById('trombiConfirmInfo')?.replaceChildren();

        const classBadge = document.getElementById('trombiClassBadge');
        if (classBadge) {
            const currentClass = ClassManager.getCurrentClass?.();
            classBadge.textContent = currentClass?.name || 'Nouvelle classe';
        }

        const confirmBtn = document.getElementById('trombiConfirmBtn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<iconify-icon icon="ph:check-bold"></iconify-icon> Importer les photos';
        }

        const pageBar = document.getElementById('trombiPageSelectorBar');
        if (pageBar) {
            pageBar.style.display = 'none';
            pageBar.innerHTML = '';
        }

        const step1PageBar = document.getElementById('trombiStep1PageSelectorBar');
        if (step1PageBar) {
            step1PageBar.style.display = 'none';
            step1PageBar.innerHTML = '';
        }

        const nextBtn = document.getElementById('trombiStep1NextBtn');
        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.innerHTML = 'Suivant <iconify-icon class="iconify-inline" icon="ph:arrow-right-bold"></iconify-icon>';
        }

        // Reset step content & footer visibility to initial state
        [1, 2, 3].forEach(n => {
            const step = document.getElementById(`trombiStep${n}`);
            const footer = document.getElementById(`trombiStep${n}Footer`);
            if (step) {
                step.style.cssText = '';
                step.style.display = n === 1 ? 'flex' : 'none';
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
        if (this._isTransitioning) return;

        const previousStep = this._currentStep;
        if (previousStep === step) return;
        this._currentStep = step;

        // Switch footers immediately (synchronized with stepper UI)
        const fromFooter = document.getElementById(`trombiStep${previousStep}Footer`);
        const toFooter = document.getElementById(`trombiStep${step}Footer`);
        if (fromFooter) fromFooter.style.display = 'none';
        if (toFooter) toFooter.style.display = 'flex';

        // Animate transition based on direction
        const direction = step > previousStep ? 'forward' : 'backward';
        this._animateStepTransition(previousStep, step, direction);

        this._updateStepperUI();
    },

    _animateStepTransition(fromStep, toStep, direction) {
        const fromContent = document.getElementById(`trombiStep${fromStep}`);
        const toContent = document.getElementById(`trombiStep${toStep}`);

        if (!fromContent || !toContent) {
            if (toStep === 2) this._initStep2();
            else if (toStep === 3) this._initStep3();
            return;
        }

        // Respect reduced motion preference
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
            fromContent.style.display = 'none';
            toContent.style.display = 'flex';
            toContent.style.opacity = '1';
            toContent.style.transform = '';
            if (toStep === 2) this._initStep2();
            else if (toStep === 3) this._initStep3();
            return;
        }

        // Seamless continuous image glide between Step 1 (Upload) and Step 2 (Association)
        if ((fromStep === 1 && toStep === 2) || (fromStep === 2 && toStep === 1)) {
            this._animateStep1Step2Transition(fromContent, toContent, direction);
            return;
        }

        // Standard lateral slide for other steps (Step 2 ↔ Step 3)
        this._animateGenericTransition(fromContent, toContent, direction, toStep);
    },

    _animateStep1Step2Transition(fromContent, toContent, direction) {
        if (direction === 'forward') {
            // STEP 1 -> STEP 2
            const sourceImageEl = fromContent.querySelector('#trombiPreviewImg, .drop-zone-image');
            if (!sourceImageEl || !this._imageSrc) {
                this._animateGenericTransition(fromContent, toContent, direction, 2);
                return;
            }

            const sourceRect = sourceImageEl.getBoundingClientRect();
            if (!sourceRect || sourceRect.width === 0 || sourceRect.height === 0) {
                this._animateGenericTransition(fromContent, toContent, direction, 2);
                return;
            }

            this._isTransitioning = true;

            // 1. Create ghost element exactly on the source image (6px radius, realistic drop shadow)
            const ghost = document.createElement('div');
            ghost.className = 'trombi-flip-ghost';
            ghost.style.cssText = `
                position: fixed;
                z-index: 9999;
                pointer-events: none;
                top: ${sourceRect.top}px;
                left: ${sourceRect.left}px;
                width: ${sourceRect.width}px;
                height: ${sourceRect.height}px;
                border-radius: var(--radius-sm, 6px);
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
                overflow: hidden;
                background: transparent;
                transition: none;
                will-change: top, left, width, height, opacity;
            `;
            ghost.innerHTML = `<img src="${this._imageSrc}" alt="" style="width: 100%; height: 100%; object-fit: contain; border-radius: inherit; display: block;">`;
            document.body.appendChild(ghost);

            // 2. Hide Step 1 completely so Step 2 receives 100% of the modal viewport height
            fromContent.style.display = 'none';

            // 3. Mount Step 2 and initialize content with true full height
            toContent.style.display = 'flex';
            toContent.style.opacity = '1';
            this._initStep2();
            this._applyZoom();

            // 4. Measure destination sheet (.trombi-content-wrapper)
            const targetWrapper = toContent.querySelector('.trombi-content-wrapper');
            const targetRect = targetWrapper?.getBoundingClientRect();

            if (!targetRect || targetRect.width === 0 || targetRect.height === 0) {
                ghost.remove();
                this._isTransitioning = false;
                return;
            }

            // Hide the real target wrapper while ghost is smoothly flying into position
            targetWrapper.style.opacity = '0';

            // Prepare the student list panel and toolbar for progressive entrance
            const assignmentPanel = toContent.querySelector('.trombi-assignment-panel');
            const zoomControls = toContent.querySelector('.trombi-zoom-controls');
            const pageBar = toContent.querySelector('#trombiPageSelectorBar');

            if (assignmentPanel) {
                assignmentPanel.style.transform = 'translateX(28px)';
                assignmentPanel.style.opacity = '0';
            }
            if (zoomControls) {
                zoomControls.style.opacity = '0';
            }
            if (pageBar && pageBar.style.display !== 'none') {
                pageBar.style.opacity = '0';
            }

            // 5. Animate ghost gliding to targetRect while student list appears on right
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const duration = '0.36s';
                    const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';

                    ghost.style.transition = `top ${duration} ${easing}, left ${duration} ${easing}, width ${duration} ${easing}, height ${duration} ${easing}`;
                    ghost.style.top = `${targetRect.top}px`;
                    ghost.style.left = `${targetRect.left}px`;
                    ghost.style.width = `${targetRect.width}px`;
                    ghost.style.height = `${targetRect.height}px`;

                    if (assignmentPanel) {
                        assignmentPanel.style.transition = `opacity ${duration} ${easing}, transform ${duration} ${easing}`;
                        assignmentPanel.style.transform = 'translateX(0)';
                        assignmentPanel.style.opacity = '1';
                    }
                    if (zoomControls) {
                        zoomControls.style.transition = 'opacity 0.28s ease 0.08s';
                        zoomControls.style.opacity = '1';
                    }
                    if (pageBar && pageBar.style.display !== 'none') {
                        pageBar.style.transition = 'opacity 0.28s ease 0.08s';
                        pageBar.style.opacity = '1';
                    }

                    setTimeout(() => {
                        targetWrapper.style.opacity = '1';
                        ghost.remove();

                        if (assignmentPanel) {
                            assignmentPanel.style.transition = '';
                            assignmentPanel.style.transform = '';
                            assignmentPanel.style.opacity = '';
                        }
                        if (zoomControls) {
                            zoomControls.style.transition = '';
                            zoomControls.style.opacity = '';
                        }
                        if (pageBar) {
                            pageBar.style.transition = '';
                            pageBar.style.opacity = '';
                        }
                        this._isTransitioning = false;
                    }, 380);
                });
            });
        } else {
            // STEP 2 -> STEP 1 (Backward)
            const sourceWrapper = fromContent.querySelector('.trombi-content-wrapper');
            if (!sourceWrapper || !this._imageSrc) {
                this._animateGenericTransition(fromContent, toContent, direction, 1);
                return;
            }

            const sourceRect = sourceWrapper.getBoundingClientRect();
            if (!sourceRect || sourceRect.width === 0 || sourceRect.height === 0) {
                this._animateGenericTransition(fromContent, toContent, direction, 1);
                return;
            }

            this._isTransitioning = true;

            // 1. Create ghost on Step 2 sheet
            const ghost = document.createElement('div');
            ghost.className = 'trombi-flip-ghost';
            ghost.style.cssText = `
                position: fixed;
                z-index: 9999;
                pointer-events: none;
                top: ${sourceRect.top}px;
                left: ${sourceRect.left}px;
                width: ${sourceRect.width}px;
                height: ${sourceRect.height}px;
                border-radius: var(--radius-sm, 6px);
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
                overflow: hidden;
                background: transparent;
                transition: none;
                will-change: top, left, width, height, opacity;
            `;
            ghost.innerHTML = `<img src="${this._imageSrc}" alt="" style="width: 100%; height: 100%; object-fit: contain; border-radius: inherit; display: block;">`;
            document.body.appendChild(ghost);

            // 2. Hide Step 2 completely so Step 1 gets 100% height
            fromContent.style.display = 'none';

            // 3. Mount Step 1
            toContent.style.display = 'flex';
            toContent.style.opacity = '1';

            // Target in Step 1
            const targetImageEl = toContent.querySelector('#trombiPreviewImg, .drop-zone-image');
            const targetRect = targetImageEl?.getBoundingClientRect();

            if (!targetRect || targetRect.width === 0 || targetRect.height === 0) {
                ghost.remove();
                this._isTransitioning = false;
                return;
            }

            targetImageEl.style.opacity = '0';

            const guidePanel = toContent.querySelector('.wizard-guide-panel');
            if (guidePanel) {
                guidePanel.style.transform = 'translateX(-24px)';
                guidePanel.style.opacity = '0';
            }

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const duration = '0.36s';
                    const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';

                    ghost.style.transition = `top ${duration} ${easing}, left ${duration} ${easing}, width ${duration} ${easing}, height ${duration} ${easing}`;
                    ghost.style.top = `${targetRect.top}px`;
                    ghost.style.left = `${targetRect.left}px`;
                    ghost.style.width = `${targetRect.width}px`;
                    ghost.style.height = `${targetRect.height}px`;

                    if (guidePanel) {
                        guidePanel.style.transition = `opacity ${duration} ${easing}, transform ${duration} ${easing}`;
                        guidePanel.style.transform = 'translateX(0)';
                        guidePanel.style.opacity = '1';
                    }

                    setTimeout(() => {
                        targetImageEl.style.opacity = '1';
                        ghost.remove();
                        if (guidePanel) {
                            guidePanel.style.transition = '';
                            guidePanel.style.transform = '';
                            guidePanel.style.opacity = '';
                        }
                        this._isTransitioning = false;
                    }, 380);
                });
            });
        }
    },

    _animateGenericTransition(fromContent, toContent, direction, toStep) {
        this._isTransitioning = true;
        const offset = direction === 'forward' ? -24 : 24;

        // Phase 1: Animate out outgoing step smoothly
        fromContent.style.transition = 'opacity 0.2s cubic-bezier(0.32, 0.72, 0, 1), transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)';
        fromContent.style.opacity = '0';
        fromContent.style.transform = `translateX(${offset}px)`;

        // Phase 2: Once outgoing is hidden, show incoming step and animate in
        setTimeout(() => {
            fromContent.style.display = 'none';
            fromContent.style.transform = '';
            fromContent.style.opacity = '';
            fromContent.style.transition = '';

            // Mount incoming step into layout - now it has 100% of the modal viewport height
            toContent.style.display = 'flex';
            toContent.style.opacity = '0';
            toContent.style.transform = `translateX(${-offset}px)`;

            // Initialize content when toContent has 100% of the modal viewport height
            if (toStep === 2) {
                this._initStep2();
            } else if (toStep === 3) {
                this._initStep3();
            }

            requestAnimationFrame(() => {
                toContent.style.transition = 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
                toContent.style.opacity = '1';
                toContent.style.transform = 'translateX(0)';

                if (toStep === 3) {
                    this._animateStepChildren(toContent, 3);
                }
            });

            setTimeout(() => {
                toContent.style.transition = '';
                toContent.style.transform = '';
                this._isTransitioning = false;
            }, 300);
        }, 200);
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
        document.querySelectorAll('#trombiWizardModal .ui-stepper-step').forEach(el => {
            const stepNum = parseInt(el.dataset.step);
            el.classList.toggle('active', stepNum === this._currentStep);
            el.classList.toggle('completed', stepNum < this._currentStep);
        });
    },

    // ========================================================================
    // STEP 1: IMAGE UPLOAD
    // ========================================================================

    _loadFile(file) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            this._loadPdf(file);
            return;
        }

        const reader = new FileReader();
        reader.onload = e => {
            this._loadImageFromUrl(e.target.result);
        };
        reader.readAsDataURL(file);
    },

    async _loadPdf(file) {
        const footerInfo = document.getElementById('trombiImageInfo');
        if (footerInfo) {
            footerInfo.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;"><iconify-icon icon="line-md:loading-loop"></iconify-icon> Analyse du trombinoscope PDF...</span>';
        }

        try {
            const parsed = await parsePronoteTrombiPdf(file);
            parsed.pages.forEach(page => {
                page.originalZones = page.zones.map(z => ({ ...z }));
            });
            this._parsedPdfData = parsed;

            const firstPage = parsed.pages[0];
            if (!firstPage) {
                throw new Error('Aucune page lisible dans le PDF');
            }

            this._imageSrc = firstPage.canvas.toDataURL('image/jpeg', 0.9);
            this._imageNaturalWidth = firstPage.width;
            this._imageNaturalHeight = firstPage.height;
            this._isNewUpload = true;
            this._currentPageIndex = 0;

            this._displayImagePreview();

            if (parsed.className) {
                const classBadge = document.getElementById('trombiClassBadge');
                if (classBadge) {
                    const displayClassName = Utils.formatClassDisplayName ? Utils.formatClassDisplayName(parsed.className) : parsed.className;
                    classBadge.textContent = `${parsed.isGroup ? 'Groupe' : 'Classe'} ${displayClassName}`;
                }
            }

            if (footerInfo) {
                const pagesCountText = parsed.numPages > 1 ? ` (${parsed.numPages} pages)` : '';
                const displayClassName = parsed.className ? (Utils.formatClassDisplayName ? Utils.formatClassDisplayName(parsed.className) : parsed.className) : 'Auto';
                footerInfo.textContent = `${parsed.students.length} élèves détectés • ${parsed.isGroup ? 'Groupe' : 'Classe'} ${displayClassName}${pagesCountText}`;
            }

            const step1PageBar = document.getElementById('trombiStep1PageSelectorBar');
            if (step1PageBar) {
                if (parsed.numPages > 1) {
                    step1PageBar.style.display = 'flex';
                    step1PageBar.innerHTML = parsed.pages.map((p, idx) => `
                        <button type="button" class="page-tab-btn ${idx === 0 ? 'active' : ''}" data-step1-page="${idx}">
                            <iconify-icon icon="solar:document-text-linear"></iconify-icon>
                            Page ${idx + 1} (${p.studentsCount} élèves)
                        </button>
                    `).join('');

                    step1PageBar.querySelectorAll('.page-tab-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const targetIdx = parseInt(btn.dataset.step1Page, 10);
                            if (targetIdx !== this._currentPageIndex) {
                                this._previewPdfPageInStep1(targetIdx);
                            }
                        });
                    });
                } else {
                    step1PageBar.style.display = 'none';
                    step1PageBar.innerHTML = '';
                }
            }

            const nextBtn = document.getElementById('trombiStep1NextBtn');
            if (nextBtn) {
                nextBtn.disabled = false;
                nextBtn.innerHTML = 'Suivant <iconify-icon class="iconify-inline" icon="ph:arrow-right-bold"></iconify-icon>';
            }
        } catch (err) {
            console.error('[TrombinoscopeManager] Échec parsing PDF:', err);
            UI.showNotification('Impossible de lire le trombinoscope PDF', 'error');
            this._removeImage();
        }
    },

    _previewPdfPageInStep1(pageIndex) {
        if (!this._parsedPdfData || !this._parsedPdfData.pages[pageIndex]) return;
        const isNext = pageIndex > this._currentPageIndex;
        this._currentPageIndex = pageIndex;
        const page = this._parsedPdfData.pages[pageIndex];
        this._imageSrc = page.canvas.toDataURL('image/jpeg', 0.9);
        this._imageNaturalWidth = page.width;
        this._imageNaturalHeight = page.height;

        const previewImg = document.getElementById('trombiPreviewImg');
        if (previewImg) {
            const animClass = isNext ? 'trombi-page-slide-next' : 'trombi-page-slide-prev';
            previewImg.classList.remove('trombi-page-slide-next', 'trombi-page-slide-prev');
            void previewImg.offsetWidth;
            previewImg.classList.add(animClass);
            previewImg.addEventListener('animationend', () => {
                previewImg.classList.remove(animClass);
            }, { once: true });
            previewImg.src = this._imageSrc;
        }

        document.querySelectorAll('#trombiStep1PageSelectorBar .page-tab-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.step1Page, 10) === pageIndex);
        });
    },

    _loadImageFromUrl(url) {
        this._cachedImage = null; // Clear cache
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            this._imageSrc = url;
            this._imageNaturalWidth = img.naturalWidth;
            this._imageNaturalHeight = img.naturalHeight;
            this._isNewUpload = true; // Mark as new upload
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
            footerInfo.textContent = `Image chargée (${this._imageNaturalWidth} × ${this._imageNaturalHeight} px)`;
        }
    },

    _removeImage() {
        this._imageSrc = null;
        this._parsedPdfData = null;
        this._currentPageIndex = 0;
        this._imageNaturalWidth = 0;
        this._imageNaturalHeight = 0;
        this._cachedImage = null;

        const placeholder = document.getElementById('trombiDropPlaceholder');
        const preview = document.getElementById('trombiDropPreview');
        const previewImg = document.getElementById('trombiPreviewImg');
        const dropZone = document.getElementById('trombiDropZone');
        const sampleBtn = document.getElementById('trombiSampleBtn');
        const fileInput = document.getElementById('trombiFileInput');
        const footerInfo = document.getElementById('trombiImageInfo');
        const quickBtn = document.getElementById('trombiQuickImportBtn');
        const nextBtn = document.getElementById('trombiStep1NextBtn');

        if (placeholder) placeholder.style.display = '';
        if (preview) preview.style.display = 'none';
        if (previewImg) previewImg.src = '';
        dropZone?.classList.remove('has-image');
        if (sampleBtn) sampleBtn.style.display = '';
        if (fileInput) fileInput.value = '';
        if (footerInfo) footerInfo.textContent = '';
        if (quickBtn) quickBtn.style.display = 'none';
        const step1PageBar = document.getElementById('trombiStep1PageSelectorBar');
        if (step1PageBar) {
            step1PageBar.style.display = 'none';
            step1PageBar.innerHTML = '';
        }
        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.innerHTML = 'Suivant <iconify-icon class="iconify-inline" icon="ph:arrow-right-bold"></iconify-icon>';
        }

        const currentClass = ClassManager.getCurrentClass?.();
        const classBadge = document.getElementById('trombiClassBadge');
        if (classBadge) {
            classBadge.textContent = currentClass?.name || 'Nouvelle classe';
        }
    },

    // ========================================================================
    // ZOOM & MULTI-PAGE HELPERS
    // ========================================================================

    _getPageOffset(pageIndex = this._currentPageIndex) {
        if (!this._parsedPdfData?.pages || pageIndex <= 0) return 0;
        let offset = 0;
        for (let i = 0; i < pageIndex; i++) {
            const page = this._parsedPdfData.pages[i];
            offset += (page.zones?.length ?? page.studentsCount ?? 0);
        }
        return offset;
    },

    _applyZoom() {
        const viewport = document.querySelector('.trombi-viewport');
        const wrapper = document.querySelector('.trombi-content-wrapper');
        const zoomLabel = document.getElementById('trombiZoomLevel');
        if (zoomLabel) {
            zoomLabel.textContent = `${Math.round(this._zoomLevel * 100)}%`;
        }
        const zoomOutBtn = document.getElementById('trombiZoomOutBtn');
        if (zoomOutBtn) {
            zoomOutBtn.disabled = this._zoomLevel <= 1.0;
            zoomOutBtn.classList.toggle('disabled', this._zoomLevel <= 1.0);
        }
        if (!viewport || !wrapper || !this._imageNaturalWidth || !this._imageNaturalHeight) return;

        // Toggle is-zoomed class: scrollbars are ONLY permitted when zoomed in > 100%
        viewport.classList.toggle('is-zoomed', this._zoomLevel > 1.0);

        // Stable viewport dimensions immune to scrollbar jitter
        const pad = 32;
        const vpW = viewport.clientWidth || viewport.offsetWidth || 600;
        const vpH = viewport.clientHeight || viewport.offsetHeight || 600;
        const availW = Math.max(100, vpW - pad);
        const availH = Math.max(100, vpH - pad);

        // Exact scalar to fit natural page inside available area (guarantees zero distortion)
        const scaleToFit = Math.min(availW / this._imageNaturalWidth, availH / this._imageNaturalHeight);
        const baseW = this._imageNaturalWidth * scaleToFit;
        const baseH = this._imageNaturalHeight * scaleToFit;

        // Use Math.floor when fitting to strictly ensure wrapper never exceeds available space
        const targetW = this._zoomLevel <= 1.0 ? Math.floor(baseW) : Math.round(baseW * this._zoomLevel);
        const targetH = this._zoomLevel <= 1.0 ? Math.floor(baseH) : Math.round(baseH * this._zoomLevel);

        wrapper.style.aspectRatio = `${this._imageNaturalWidth} / ${this._imageNaturalHeight}`;
        wrapper.style.width = `${targetW}px`;
        wrapper.style.height = `${targetH}px`;

        this._renderZones(targetW, targetH);
    },

    _zoomIn() {
        this._zoomLevel = Math.min(2.5, Math.round((this._zoomLevel + 0.25) * 100) / 100);
        this._applyZoom();
    },

    _zoomOut() {
        this._zoomLevel = Math.max(1.0, Math.round((this._zoomLevel - 0.25) * 100) / 100);
        this._applyZoom();
    },

    _zoomReset() {
        this._zoomLevel = 1.0;
        this._applyZoom();
    },

    _zoomToggleFit() {
        if (this._zoomLevel !== 1.0) {
            this._zoomLevel = 1.0;
        } else {
            const viewport = document.querySelector('.trombi-viewport');
            if (viewport && this._imageNaturalWidth && this._imageNaturalHeight) {
                const pad = 32;
                const vpW = viewport.offsetWidth || viewport.clientWidth || 600;
                const vpH = viewport.offsetHeight || viewport.clientHeight || 600;
                const availW = Math.max(100, vpW - pad);
                const availH = Math.max(100, vpH - pad);
                const scaleToFit = Math.min(availW / this._imageNaturalWidth, availH / this._imageNaturalHeight);
                const fitW = this._imageNaturalWidth * scaleToFit;
                // Si la page est en portrait, "Pleine largeur" permet d'occuper la largeur disponible
                if (availW > fitW * 1.1) {
                    this._zoomLevel = Math.min(2.5, Math.round((availW / fitW) * 100) / 100);
                } else {
                    this._zoomLevel = 1.5;
                }
            } else {
                this._zoomLevel = 1.5;
            }
        }
        this._applyZoom();
    },

    // ========================================================================
    // STEP 2: SELECTION & ASSOCIATION
    // ========================================================================

    _initStep2() {
        const imagePanel = document.getElementById('trombiImageWithZones');
        if (!imagePanel) return;

        // Invalidate cached preview image
        this._cachedImage = null;

        // Manage exclude-photos toggle visibility: hide during PDF trombinoscope import
        const excludeWrapper = document.getElementById('trombiExcludeToggleWrapper');
        if (excludeWrapper) {
            excludeWrapper.style.display = this._parsedPdfData ? 'none' : 'flex';
        }

        // Setup page selector bar if PDF has multiple pages
        const pageBar = document.getElementById('trombiPageSelectorBar');
        if (pageBar) {
            if (this._parsedPdfData && this._parsedPdfData.numPages > 1) {
                pageBar.style.display = 'flex';
                pageBar.innerHTML = this._parsedPdfData.pages.map((p, idx) => `
                    <button type="button" class="page-tab-btn ${idx === this._currentPageIndex ? 'active' : ''}" data-page-index="${idx}">
                        <iconify-icon icon="solar:document-text-linear"></iconify-icon>
                        Page ${idx + 1} (${p.studentsCount} élèves)
                    </button>
                `).join('');

                pageBar.querySelectorAll('.page-tab-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const targetIdx = parseInt(btn.dataset.pageIndex, 10);
                        if (targetIdx !== this._currentPageIndex) {
                            this._switchPdfPage(targetIdx);
                        }
                    });
                });
            } else {
                pageBar.style.display = 'none';
                pageBar.innerHTML = '';
            }
        }

        // Initialize zones synchronously if PDF data is present
        if (this._parsedPdfData) {
            const currentPage = this._parsedPdfData.pages[this._currentPageIndex];
            if (currentPage && currentPage.zones) {
                this._zones = currentPage.zones.map(z => ({ ...z }));
                if (this._zones.length > 0 && this._zones[0].r) {
                    this._globalRadius = this._zones[0].r;
                }
            }
            this._isNewUpload = false;
        }

        // Setup image with overlay - wrapped in a container for correct aspect ratio positioning
        imagePanel.innerHTML = `
            <div class="trombi-zoom-controls">
                <button type="button" class="zoom-btn" id="trombiZoomOutBtn" title="Dézoomer (-25%)">
                    <iconify-icon icon="solar:magnifer-zoom-out-linear"></iconify-icon>
                </button>
                <button type="button" class="zoom-btn zoom-value-btn" id="trombiZoomResetBtn" title="Réinitialiser le zoom (100%)">
                    <span id="trombiZoomLevel">${Math.round(this._zoomLevel * 100)}%</span>
                </button>
                <button type="button" class="zoom-btn" id="trombiZoomInBtn" title="Zoomer (+25%)">
                    <iconify-icon icon="solar:magnifer-zoom-in-linear"></iconify-icon>
                </button>
                <button type="button" class="zoom-btn" id="trombiZoomFitBtn" title="Pleine largeur / Vue complète">
                    <iconify-icon icon="solar:maximize-square-minimalistic-linear"></iconify-icon>
                </button>
            </div>
            <div class="trombi-viewport">
                <div class="trombi-content-wrapper" style="aspect-ratio: ${this._imageNaturalWidth} / ${this._imageNaturalHeight};">
                    <img src="${this._imageSrc}" alt="Trombinoscope" class="trombi-image" id="trombiStep2Image" draggable="false">
                    <div class="trombi-zones-overlay" id="trombiZonesOverlay"></div>
                </div>
            </div>
        `;

        // Bind zoom controls
        document.getElementById('trombiZoomInBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._zoomIn();
        });
        document.getElementById('trombiZoomOutBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._zoomOut();
        });
        document.getElementById('trombiZoomResetBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._zoomReset();
        });
        document.getElementById('trombiZoomFitBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._zoomToggleFit();
        });

        const img = document.getElementById('trombiStep2Image');
        const handleImageReady = () => {
            if (this._parsedPdfData) {
                const currentPage = this._parsedPdfData.pages[this._currentPageIndex];
                if (currentPage && currentPage.zones && this._zones.length === 0) {
                    this._zones = currentPage.zones.map(z => ({ ...z }));
                    if (this._zones.length > 0 && this._zones[0].r) {
                        this._globalRadius = this._zones[0].r;
                    }
                }
                this._isNewUpload = false;
            } else if (this._isNewUpload || this._zones.length === 0) {
                this._zones = []; // Clear previous zones
                this._createDefaultGrid();
                this._isNewUpload = false; // Reset upload flag
            }
            this._applyZoom();
        };

        if (img.complete && img.naturalWidth > 0) {
            handleImageReady();
        } else {
            img.onload = handleImageReady;
        }

        // Observer for layout changes on the viewport
        const viewport = imagePanel?.querySelector('.trombi-viewport');
        if (this._viewportResizeObserver) this._viewportResizeObserver.disconnect();

        this._viewportResizeObserver = new ResizeObserver(() => {
            if (this._drawerAnimActive) return;
            if (this._viewportResizeRaf) cancelAnimationFrame(this._viewportResizeRaf);
            this._viewportResizeRaf = window.requestAnimationFrame(() => {
                this._viewportResizeRaf = null;
                this._applyZoom();
            });
        });
        if (viewport) {
            this._viewportResizeObserver.observe(viewport);
        }

        // Click and drag selection / add zone on overlay/viewport
        const overlay = document.getElementById('trombiZonesOverlay');
        
        viewport?.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                if (e.deltaY < 0) {
                    this._zoomIn();
                } else {
                    this._zoomOut();
                }
            }
        }, { passive: false });

        viewport?.addEventListener('mousedown', e => {
            // Start selection box only if clicking background viewport or overlay (not a zone)
            if (!e.target.closest('.trombi-zone') && !e.target.closest('.zone-delete')) {
                e.preventDefault();
                this._selectionBox = {
                    startX: e.clientX,
                    startY: e.clientY,
                    isActive: false,
                    viewportRect: viewport.getBoundingClientRect()
                };
                this._selectionBoxDragActive = false;
            }
        });

        overlay?.addEventListener('click', e => {
            if (e.target === overlay) {
                if (this._selectionBoxDragActive) {
                    return;
                }
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

        this._updateUndoButton();
    },

    _switchPdfPage(pageIndex) {
        if (!this._parsedPdfData || !this._parsedPdfData.pages[pageIndex]) return;

        // Sauvegarder les zones de la page actuelle avant de changer
        if (this._parsedPdfData.pages[this._currentPageIndex]) {
            this._parsedPdfData.pages[this._currentPageIndex].zones = this._zones.map(z => ({ ...z }));
        }

        const isNext = pageIndex > this._currentPageIndex;
        this._currentPageIndex = pageIndex;
        const page = this._parsedPdfData.pages[pageIndex];

        this._cachedImage = null; // Invalidate cached preview image for new page
        this._imageSrc = page.canvas.toDataURL('image/jpeg', 0.9);
        this._imageNaturalWidth = page.width;
        this._imageNaturalHeight = page.height;

        const img = document.getElementById('trombiStep2Image');
        if (img) {
            img.src = this._imageSrc;
        }

        const contentWrapper = document.querySelector('.trombi-content-wrapper');
        if (contentWrapper) {
            const animClass = isNext ? 'trombi-page-slide-next' : 'trombi-page-slide-prev';
            contentWrapper.classList.remove('trombi-page-slide-next', 'trombi-page-slide-prev');
            void contentWrapper.offsetWidth;
            contentWrapper.classList.add(animClass);
            contentWrapper.addEventListener('animationend', () => {
                contentWrapper.classList.remove(animClass);
            }, { once: true });
        }

        document.querySelectorAll('#trombiPageSelectorBar .page-tab-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.pageIndex, 10) === pageIndex);
        });

        this._zones = page.zones.map(z => ({ ...z }));
        if (this._zones.length > 0 && this._zones[0].r) {
            this._globalRadius = this._zones[0].r;
        }

        this._gridCols = 4;
        this._gridRows = Math.ceil((page.studentsCount || this._zones.length || 8) / 4);
        this._syncSlidersToState();

        this._applyZoom();
        this._renderAssignmentGrid();
    },

    _setupControlPanel() {
        const container = document.querySelector('.trombi-image-panel');
        if (!container || container.querySelector('.grid-control-panel')) return;

        const isPdf = !!this._parsedPdfData;
        const hasDetectedStudents = Boolean(this._parsedPdfData?.students?.length > 0);

        if (isPdf) {
            const currentPage = this._parsedPdfData.pages[this._currentPageIndex];
            const count = currentPage?.studentsCount || this._zones.length || 8;
            this._gridCols = 4;
            this._gridRows = Math.ceil(count / 4);
        } else {
            // Default values
            this._gridCols = 4;
            this._gridRows = Math.ceil((this._getStudentsForImport().length || 8) / 4);
        }
        this._gapH = 0;  // Horizontal spacing between zones (%)
        this._gapV = 0;  // Vertical spacing between zones (%)
        this._groupedDrag = true; // Grouped drag mode (default = true)

        const isAdvancedOpen = !hasDetectedStudents;

        const gridControlsHtml = `
            <div class="grid-advanced-controls ${isAdvancedOpen ? 'is-open' : ''}" id="gridAdvancedControls">
                <div class="grid-advanced-controls-inner">
                    <div class="control-row-group">
                        <div class="control-row">
                            <label><iconify-icon icon="solar:gallery-vertical-linear"></iconify-icon> Colonnes</label>
                            <div class="slider-group">
                                <div class="slider-track">
                                    <input type="range" class="control-slider" id="colsSlider" 
                                           min="1" max="12" value="${this._gridCols}">
                                </div>
                                <span class="slider-value" id="colsValue">${this._gridCols}</span>
                            </div>
                        </div>
                        <div class="control-row">
                            <label><iconify-icon icon="solar:gallery-horizontal-linear"></iconify-icon> Lignes</label>
                            <div class="slider-group">
                                <div class="slider-track">
                                    <input type="range" class="control-slider" id="rowsSlider" 
                                           min="1" max="12" value="${this._gridRows}">
                                </div>
                                <span class="slider-value" id="rowsValue">${this._gridRows}</span>
                            </div>
                        </div>
                    </div>
                    <div class="control-row-group">
                        <div class="control-row">
                            <label><iconify-icon icon="solar:sort-horizontal-linear"></iconify-icon> Écart H</label>
                            <div class="slider-group">
                                <div class="slider-track">
                                    <input type="range" class="control-slider" id="gapHSlider" 
                                           min="-50" max="50" step="0.5" value="0">
                                </div>
                                <span class="slider-value" id="gapHValue">0</span>
                            </div>
                        </div>
                        <div class="control-row">
                            <label><iconify-icon icon="solar:sort-vertical-linear"></iconify-icon> Écart V</label>
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
                <div class="control-row-group">
                    <div class="control-row">
                        <label><iconify-icon icon="solar:maximize-square-3-linear"></iconify-icon> Taille</label>
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
                            <span class="toggle-text"><iconify-icon icon="solar:layers-linear"></iconify-icon> Groupé</span>
                            <span class="toggle-wrapper">
                                <input type="checkbox" id="groupedDragToggle" class="sync-toggle-checkbox" checked>
                                <span class="sync-toggle-switch"></span>
                            </span>
                        </label>
                        <button type="button" class="grid-tools-toggle-btn ${isAdvancedOpen ? 'active' : ''}" id="toggleGridToolsBtn" title="Afficher ou masquer les réglages avancés de grille et d'espacement">
                            <iconify-icon icon="solar:tuning-square-2-linear"></iconify-icon> <span id="toggleGridToolsText">${isAdvancedOpen ? 'Masquer grille' : 'Grille'}</span> <iconify-icon icon="solar:alt-arrow-down-linear" class="toggle-chevron"></iconify-icon>
                        </button>
                        <button type="button" class="grid-reset-btn" id="trombiUndoBtn" disabled style="margin-left: auto;">
                            <iconify-icon icon="solar:undo-left-round-linear"></iconify-icon> Annuler
                        </button>
                        <button type="button" class="grid-reset-btn" id="gridResetBtn" style="margin-left: 4px;" title="${hasDetectedStudents ? 'Rétablir les détections d\'origine' : 'Réinitialiser la grille'}">
                            <iconify-icon icon="solar:restart-linear"></iconify-icon> Réinitialiser
                        </button>
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
            this._restoreGroupedDrag = false;
        });

        const toggleBtn = document.getElementById('toggleGridToolsBtn');
        const advancedDrawer = document.getElementById('gridAdvancedControls');
        const toggleText = document.getElementById('toggleGridToolsText');

        toggleBtn?.addEventListener('click', () => {
            if (!advancedDrawer) return;
            const isOpen = advancedDrawer.classList.toggle('is-open');
            toggleBtn.classList.toggle('active', isOpen);
            if (toggleText) {
                toggleText.textContent = isOpen ? 'Masquer grille' : 'Grille';
            }

            if (this._drawerAnimRaf) {
                cancelAnimationFrame(this._drawerAnimRaf);
                this._drawerAnimRaf = null;
            }

            const viewport = document.querySelector('.trombi-viewport');
            viewport?.classList.add('is-animating');

            if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
                this._applyZoom();
                viewport?.classList.remove('is-animating');
                return;
            }

            this._drawerAnimActive = true;

            // Smooth 60fps real-time recalculation of the sheet during the drawer transition
            const startTime = performance.now();
            const duration = 380;
            const step = (now) => {
                this._applyZoom();
                if (now - startTime < duration) {
                    this._drawerAnimRaf = requestAnimationFrame(step);
                } else {
                    this._drawerAnimRaf = null;
                    this._drawerAnimActive = false;
                    viewport?.classList.remove('is-animating');
                    this._applyZoom();
                }
            };
            this._drawerAnimRaf = requestAnimationFrame(step);
        });

        // Bind Undo slider drag listeners
        const bindSliderUndo = (slider) => {
            if (!slider) return;
            const handleStart = () => {
                this._tempSliderSnapshot = this._getCurrentStateSnapshot();
            };
            slider.addEventListener('mousedown', handleStart);
            slider.addEventListener('touchstart', handleStart);
            slider.addEventListener('change', () => {
                if (this._tempSliderSnapshot) {
                    const hasChanged = this._gridCols !== this._tempSliderSnapshot.gridCols ||
                                     this._gridRows !== this._tempSliderSnapshot.gridRows ||
                                     this._gapH !== this._tempSliderSnapshot.gapH ||
                                     this._gapV !== this._tempSliderSnapshot.gapV ||
                                     this._globalRadius !== this._tempSliderSnapshot.globalRadius;
                    if (hasChanged) {
                        this._history.push(this._tempSliderSnapshot);
                        if (this._history.length > this._maxHistoryLevels) {
                            this._history.shift();
                        }
                        this._updateUndoButton();
                    }
                    this._tempSliderSnapshot = null;
                }
            });
        };

        bindSliderUndo(colsSlider);
        bindSliderUndo(rowsSlider);
        bindSliderUndo(gapHSlider);
        bindSliderUndo(gapVSlider);
        bindSliderUndo(sizeSlider);

        document.getElementById('trombiUndoBtn')?.addEventListener('click', () => {
            this._undo();
        });

        document.getElementById('gridResetBtn')?.addEventListener('click', () => {
            this._saveState();
            
            if (this._parsedPdfData && hasDetectedStudents) {
                this._parsedPdfData.pages.forEach(p => {
                    if (p.originalZones) {
                        p.zones = p.originalZones.map(z => ({ ...z }));
                    }
                });
                const currentPage = this._parsedPdfData.pages[this._currentPageIndex];
                if (currentPage && currentPage.zones) {
                    this._zones = currentPage.zones.map(z => ({ ...z }));
                }
                if (this._zones.length > 0 && this._zones[0].r) {
                    this._globalRadius = this._zones[0].r;
                }
                this._gapH = 0;
                this._gapV = 0;
                if (gapHSlider) { gapHSlider.value = 0; gapHValue.textContent = '0'; }
                if (gapVSlider) { gapVSlider.value = 0; gapVValue.textContent = '0'; }
                this._renderZones();
                this._renderAssignmentGrid();
                this._updateSizeSliderValue();
                UI.showNotification('Positions initiales restaurées (toutes les pages)', 'info');
                return;
            }

            let cols = 4;
            let rows = Math.ceil((this._getStudentsForImport().length || 8) / 4);

            // Use smart geometric aspect ratio detection for reset baseline
            const detected = this._detectGridFromImage();
            if (detected) {
                cols = detected.cols;
                rows = detected.rows;
            } else if (this._imageNaturalWidth && this._imageNaturalHeight) {
                const isPortrait = this._imageNaturalHeight / this._imageNaturalWidth > 1.1;
                const cellRatio = isPortrait ? 0.82 : 1.83;
                rows = Math.round(cols * (this._imageNaturalHeight / this._imageNaturalWidth) * cellRatio);
                rows = Math.max(2, Math.min(12, rows));
            }

            this._gridCols = cols;
            this._gridRows = rows;
            this._gapH = 0;
            this._gapV = 0;
            if (colsSlider) { colsSlider.value = this._gridCols; colsValue.textContent = this._gridCols; }
            if (rowsSlider) { rowsSlider.value = this._gridRows; rowsValue.textContent = this._gridRows; }
            if (sizeSlider) { sizeSlider.value = 60; sizeValue.textContent = '60%'; }
            if (gapHSlider) { gapHSlider.value = 0; gapHValue.textContent = '0'; }
            if (gapVSlider) { gapVSlider.value = 0; gapVValue.textContent = '0'; }
            this._createGridSilent(this._gridCols, this._gridRows);
        });

        // Only create initial grid if we don't have any zones yet and no PDF data
        if (this._zones.length === 0 && !this._parsedPdfData) {
            this._createDefaultGrid();
        } else {
            this._syncSlidersToState();
        }
    },

    /**
     * Synchronize control panel slider controls and labels to the current state
     */
    _syncSlidersToState() {
        const colsSlider = document.getElementById('colsSlider');
        const rowsSlider = document.getElementById('rowsSlider');
        const gapHSlider = document.getElementById('gapHSlider');
        const gapVSlider = document.getElementById('gapVSlider');
        const colsValue = document.getElementById('colsValue');
        const rowsValue = document.getElementById('rowsValue');
        const gapHValue = document.getElementById('gapHValue');
        const gapVValue = document.getElementById('gapVValue');

        if (colsSlider && this._gridCols) {
            colsSlider.value = this._gridCols;
            if (colsValue) colsValue.textContent = this._gridCols;
        }
        if (rowsSlider && this._gridRows) {
            rowsSlider.value = this._gridRows;
            if (rowsValue) rowsValue.textContent = this._gridRows;
        }
        if (gapHSlider) {
            gapHSlider.value = this._gapH ?? 0;
            if (gapHValue) gapHValue.textContent = Number.isInteger(this._gapH) ? this._gapH : (this._gapH ?? 0).toFixed(1);
        }
        if (gapVSlider) {
            gapVSlider.value = this._gapV ?? 0;
            if (gapVValue) gapVValue.textContent = Number.isInteger(this._gapV) ? this._gapV : (this._gapV ?? 0).toFixed(1);
        }
        this._updateSizeSliderValue();
    },

    /**
     * Apply gap values to all zones relative to the FIRST zone (0,0)
     * The first zone stays fixed as the reference point.
     */
    _applyGaps() {
        if (this._zones.length === 0) return;

        const cols = this._gridCols || 4;
        const w = this._imageNaturalWidth;
        const h = this._imageNaturalHeight;

        const currentPage = this._parsedPdfData?.pages?.[this._currentPageIndex];
        const hasOriginalZones = Boolean(currentPage?.originalZones && currentPage.originalZones.length === this._zones.length);

        if (hasOriginalZones) {
            const baseCellW = w / cols;
            const baseCellH = h / Math.ceil(this._zones.length / cols);
            const gapPxH = (this._gapH / 100) * baseCellW;
            const gapPxV = (this._gapV / 100) * baseCellH;
            const centerCol = (cols - 1) / 2;

            this._zones.forEach((zone, idx) => {
                const orig = currentPage.originalZones[idx];
                if (!orig) return;
                const col = idx % cols;
                const row = Math.floor(idx / cols);

                zone.cx = orig.cx + (col - centerCol) * gapPxH;
                zone.cy = orig.cy + row * gapPxV;
            });

            if (this._parsedPdfData?.pages && this._groupedDrag) {
                this._parsedPdfData.pages.forEach((p, pIdx) => {
                    if (pIdx === this._currentPageIndex) return;
                    const pOrig = p.originalZones;
                    if (pOrig && p.zones && p.zones.length === pOrig.length) {
                        const pCellW = (p.width || w) / cols;
                        const pCellH = (p.height || h) / Math.ceil(p.zones.length / cols);
                        const pGapH = (this._gapH / 100) * pCellW;
                        const pGapV = (this._gapV / 100) * pCellH;

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
        }

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
        this._zones.forEach(z => {
            z.r = this._globalRadius;
        });
        if (this._parsedPdfData?.pages) {
            this._parsedPdfData.pages.forEach(page => {
                page.zones?.forEach(z => {
                    z.r = this._globalRadius;
                });
            });
        }
        this._renderZones();
        this._updateLivePreviews();
    },

    // ========================================================================
    // ZONE MANAGEMENT
    // ========================================================================

    _getStudentsForImport() {
        if (this._parsedPdfData && this._parsedPdfData.students) {
            return this._parsedPdfData.students;
        }
        const allStudents = appState.filteredResults || [];
        const excludeWithPhotos = document.getElementById('trombiExcludeWithPhotos')?.checked ?? true;
        if (excludeWithPhotos) {
            return allStudents.filter(s => !s.studentPhoto?.data);
        }
        return allStudents;
    },

    _createDefaultGrid() {
        const students = this._getStudentsForImport();
        const count = students.length || 8;

        // Smart column distribution: aim for ~4-6 columns, scale up for large classes
        let cols;
        if (count <= 4) cols = count;
        else if (count <= 12) cols = 4;
        else if (count <= 24) cols = 6;
        else cols = Math.min(8, Math.ceil(Math.sqrt(count)));

        let rows = Math.ceil(count / cols);

        // Try automatic grid detection from image
        const detected = this._detectGridFromImage();
        if (detected) {
            cols = detected.cols;
            rows = detected.rows;
        } else if (this._imageNaturalWidth && this._imageNaturalHeight) {
            // FALLBACK GEOMETRIC ESTIMATE (based on image aspect ratio, not class size)
            cols = 4; // default columns count
            const ratio = this._imageNaturalWidth / this._imageNaturalHeight;
            let cellRatio = 0.95;
            if (ratio > 1.5) {
                cellRatio = 4.25;
            } else if (ratio > 1.1) {
                cellRatio = 1.1;
            }
            rows = Math.round(cols * (this._imageNaturalHeight / this._imageNaturalWidth) * cellRatio);
            rows = Math.max(2, Math.min(12, rows));
        }

        this._gridCols = cols;
        this._gridRows = rows;
        this._createGridSilent(cols, rows);

        // Sync control panel sliders if they are already rendered
        this._syncSlidersToState();
    },

    _detectGridFromImage() {
        try {
            const img = document.getElementById('trombiStep2Image');
            if (!img || !img.complete || img.naturalWidth === 0) return null;

            // Use a small canvas for fast pixel analysis without overhead
            const canvas = document.createElement('canvas');
            const size = 150;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            
            // Draw image on canvas
            ctx.drawImage(img, 0, 0, size, size);

            let imgData;
            try {
                imgData = ctx.getImageData(0, 0, size, size).data;
            } catch (canvasErr) {
                // Occurs if image is tainted (CORS) or other canvas context issues
                console.warn('[Trombinoscope] Unable to read image data (CORS or canvas issue):', canvasErr);
                return null;
            }

            // Convert to 2D grayscale array
            const gray = new Uint8Array(size * size);
            for (let i = 0; i < size * size; i++) {
                const r = imgData[i * 4];
                const g = imgData[i * 4 + 1];
                const b = imgData[i * 4 + 2];
                // Standard luma formula
                gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            }

            // Analyze X projection variance to find grid columns (highly robust, no vertical text)
            const cols = this._analyzeProjection(gray, size, 'x');

            // Sanity check for columns
            if (cols >= 2 && cols <= 12) {
                // Classify layout orientation and cell aspect ratio
                const ratio = img.naturalWidth / img.naturalHeight;
                let cellRatio = 0.95; // portrait default
                if (ratio > 1.5) {
                    cellRatio = 4.25; // very wide landscape (list layouts)
                } else if (ratio > 1.1) {
                    cellRatio = 1.1;  // standard landscape (photos grids)
                }

                // Geometrically calculate rows (immune to horizontal text interference)
                const rows = Math.round(cols * (img.naturalHeight / img.naturalWidth) * cellRatio);

                if (rows >= 2 && rows <= 12) {
                    return { cols, rows };
                }
            }
        } catch (e) {
            console.warn('[Trombinoscope] Error during auto-grid detection:', e);
        }
        return null;
    },

    _analyzeProjection(gray, size, axis) {
        const variances = new Float32Array(size);

        for (let i = 0; i < size; i++) {
            let sum = 0;
            let sumSq = 0;
            for (let j = 0; j < size; j++) {
                // If axis is 'x', we look at columns (index is column i, j-th row pixel)
                // If axis is 'y', we look at rows (index is row i, j-th column pixel)
                const val = (axis === 'x') ? gray[j * size + i] : gray[i * size + j];
                sum += val;
                sumSq += val * val;
            }
            const mean = sum / size;
            // Variance: E[X^2] - E[X]^2
            variances[i] = (sumSq / size) - (mean * mean);
        }

        // Apply a simple 5-tap moving average filter to smooth noise
        const smooth = new Float32Array(size);
        const halfWin = 2;
        for (let i = 0; i < size; i++) {
            let valSum = 0;
            let count = 0;
            for (let w = -halfWin; w <= halfWin; w++) {
                const idx = i + w;
                if (idx >= 0 && idx < size) {
                    valSum += variances[idx];
                    count++;
                }
            }
            smooth[i] = valSum / count;
        }

        // Find min and max to determine threshold
        let minVar = Infinity;
        let maxVar = -Infinity;
        for (let i = 0; i < size; i++) {
            if (smooth[i] < minVar) minVar = smooth[i];
            if (smooth[i] > maxVar) maxVar = smooth[i];
        }

        const range = maxVar - minVar;
        if (range < 10) return 0; // Very low contrast or solid image

        // Threshold to distinguish "student photo area" from "gutter/margin area"
        // Since gutters have low variance, threshold is set at 35% of the range above min
        const threshold = minVar + range * 0.35;

        // Count continuous segments of high variance (photos)
        let segments = 0;
        let inSegment = false;
        let minSegmentWidth = Math.max(3, Math.round(size * 0.03)); // ignore tiny noise spikes

        let currentSegmentWidth = 0;
        for (let i = 0; i < size; i++) {
            const isHighVariance = smooth[i] > threshold;
            if (isHighVariance) {
                if (!inSegment) {
                    inSegment = true;
                    currentSegmentWidth = 1;
                } else {
                    currentSegmentWidth++;
                }
            } else {
                if (inSegment) {
                    if (currentSegmentWidth >= minSegmentWidth) {
                        segments++;
                    }
                    inSegment = false;
                    currentSegmentWidth = 0;
                }
            }
        }
        // Handle segment ending at the border
        if (inSegment && currentSegmentWidth >= minSegmentWidth) {
            segments++;
        }

        return segments;
    },

    _createGrid(cols, rows, preserveReference = false, silent = false) {
        // Save the reference zone position if we want to preserve it
        let refCx = null, refCy = null;
        if (preserveReference && this._zones.length > 0) {
            refCx = this._zones[0].cx;
            refCy = this._zones[0].cy;
        }

        this._zones = [];
        this._zoneIdCounter = 0;
        this._selectedZoneIds.clear();

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

        if (!silent) {
            this._renderZones();
            this._renderAssignmentGrid();
            this._updateSizeSliderValue();
        }
    },

    /**
     * Create grid silently (without notification) for instant slider feedback
     * Also auto-assigns students to zones
     * Preserves reference zone position when zones already exist
     */
    _createGridSilent(cols, rows) {
        // Preserve reference position if zones already exist (user has adjusted positions)
        const hasExistingZones = this._zones.length > 0;
        this._createGrid(cols, rows, hasExistingZones, true);
        // Auto-assign students to zones automatically
        this._autoAssignSilent(true);
        
        // Render once at the end
        this._renderZones();
        this._renderAssignmentGrid();
        this._updateSizeSliderValue();
    },

    /**
     * Auto-assign students to zones silently (no notification)
     */
    _autoAssignSilent(silent = false) {
        const students = this._getStudentsForImport();
        this._zones.forEach((zone, idx) => {
            zone.studentId = students[idx]?.id || null;
        });
        if (!silent) {
            this._renderZones();
            this._renderAssignmentGrid();
        }
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
        this._saveState();
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
        this._saveState();
        this._selectedZoneIds.delete(zoneId);
        this._zones = this._zones.filter(z => z.id !== zoneId);
        this._renderZones();
        this._renderAssignmentGrid();
    },

    /**
     * Inserts an empty slot at a given zone index, shifting subsequent assignments down
     * @param {number} zoneId 
     */
    _insertGapAndShiftDown(zoneId) {
        this._saveState();
        
        // Sort zones by ID to keep order stable
        const sortedZones = [...this._zones].sort((a, b) => a.id - b.id);
        const fromIdx = sortedZones.findIndex(z => z.id === zoneId);
        
        if (fromIdx === -1) return;
        
        // Shift student IDs down
        for (let j = sortedZones.length - 1; j > fromIdx; j--) {
            sortedZones[j].studentId = sortedZones[j - 1].studentId;
        }
        
        // Set the current zone to null (empty)
        sortedZones[fromIdx].studentId = null;
        
        this._renderZones();
        this._renderAssignmentGrid();
        UI.showNotification('Décalage vers le bas effectué', 'success');
    },

    /**
     * Removes the student from a given zone, shifting subsequent assignments up
     * @param {number} zoneId 
     */
    _removeAndShiftUp(zoneId) {
        this._saveState();
        
        // Sort zones by ID to keep order stable
        const sortedZones = [...this._zones].sort((a, b) => a.id - b.id);
        const fromIdx = sortedZones.findIndex(z => z.id === zoneId);
        
        if (fromIdx === -1) return;
        
        // Shift student IDs up
        for (let j = fromIdx; j < sortedZones.length - 1; j++) {
            sortedZones[j].studentId = sortedZones[j + 1].studentId;
        }
        
        // The last zone becomes unassigned
        sortedZones[sortedZones.length - 1].studentId = null;
        
        this._renderZones();
        this._renderAssignmentGrid();
        UI.showNotification('Décalage vers le haut effectué', 'success');
    },

    _autoAssignInOrder() {
        this._saveState();
        let students = this._getStudentsForImport();
        if (this._parsedPdfData && this._parsedPdfData.numPages > 1) {
            const pageOffset = this._getPageOffset();
            students = students.slice(pageOffset, pageOffset + this._zones.length);
        }
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

    _renderZones(explicitW, explicitH) {
        const overlay = document.getElementById('trombiZonesOverlay');
        const img = document.getElementById('trombiStep2Image');
        const wrapper = document.querySelector('.trombi-content-wrapper');
        if (!overlay || !img) return;

        const displayedW = explicitW ?? (wrapper?.style.width ? parseFloat(wrapper.style.width) : null) ?? img.clientWidth;
        const displayedH = explicitH ?? (wrapper?.style.height ? parseFloat(wrapper.style.height) : null) ?? img.clientHeight;

        if (!displayedW || !displayedH || !this._imageNaturalWidth || !this._imageNaturalHeight) return;

        // Scale factor: displayed / natural
        const scaleX = displayedW / this._imageNaturalWidth;
        const scaleY = displayedH / this._imageNaturalHeight;
        const students = appState.filteredResults || [];
        const pageOffset = this._getPageOffset();

        const existingZoneEls = overlay.querySelectorAll('.trombi-zone');
        const canUpdateInPlace = existingZoneEls.length === this._zones.length &&
            this._zones.every((zone, idx) => existingZoneEls[idx]?.dataset?.zoneId === String(zone.id));

        if (canUpdateInPlace) {
            this._zones.forEach((zone, idx) => {
                const zoneEl = existingZoneEls[idx];
                const dispCx = zone.cx * scaleX;
                const dispCy = zone.cy * scaleY;
                const r = zone.r || this._globalRadius;
                const dispR = r * scaleX;
                const diameter = dispR * 2;

                const student = (this._parsedPdfData?.students?.find(s => s.id === zone.studentId)) ||
                                students.find(s => s.id === zone.studentId);
                const label = student?.prenom ? student.prenom : `#${pageOffset + idx + 1}`;

                const labelScale = Math.max(0.5, Math.min(1, diameter / 50));
                const labelFontSize = Math.max(8, Math.round(12 * labelScale));
                const labelHeight = Math.max(16, Math.round(28 * labelScale));
                const labelPadding = Math.max(2, Math.round(8 * labelScale));

                const deleteSize = Math.max(14, Math.round(22 * labelScale));
                const deleteFontSize = Math.max(7, Math.round(10 * labelScale));
                const borderWidth = diameter < 40 ? 2 : 3;

                zoneEl.style.left = `${dispCx}px`;
                zoneEl.style.top = `${dispCy}px`;
                zoneEl.style.width = `${diameter}px`;
                zoneEl.style.height = `${diameter}px`;
                zoneEl.style.borderWidth = `${borderWidth}px`;

                const isSel = this._selectedZoneIds?.has(zone.id) || false;
                zoneEl.classList.toggle('is-selected', isSel);

                const labelEl = zoneEl.querySelector('.zone-label');
                if (labelEl) {
                    if (labelEl.textContent !== label) labelEl.textContent = label;
                    labelEl.style.fontSize = `${labelFontSize}px`;
                    labelEl.style.height = `${labelHeight}px`;
                    labelEl.style.minWidth = `${labelHeight}px`;
                    labelEl.style.padding = `0 ${labelPadding}px`;
                    labelEl.style.borderRadius = `${labelHeight / 2}px`;
                }

                const deleteBtn = zoneEl.querySelector('.zone-delete');
                if (deleteBtn) {
                    deleteBtn.style.width = `${deleteSize}px`;
                    deleteBtn.style.height = `${deleteSize}px`;
                    deleteBtn.style.fontSize = `${deleteFontSize}px`;
                }
            });
            return;
        }

        overlay.innerHTML = this._zones.map((zone, idx) => {
            // Convert natural pixels to displayed pixels
            const dispCx = zone.cx * scaleX;
            const dispCy = zone.cy * scaleY;
            const r = zone.r || this._globalRadius;
            const dispR = r * scaleX;
            const diameter = dispR * 2;

            // Find student name if assigned
            const student = (this._parsedPdfData?.students?.find(s => s.id === zone.studentId)) ||
                            students.find(s => s.id === zone.studentId);
            const label = student?.prenom ? student.prenom : `#${pageOffset + idx + 1}`;

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

            const isSel = this._selectedZoneIds?.has(zone.id) ? 'is-selected' : '';
            return `
                <div class="trombi-zone ${isSel}" 
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
                        <iconify-icon icon="ph:x"></iconify-icon>
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
        if (!overlay) return;

        const rect = overlay.getBoundingClientRect();
        const scaleX = this._imageNaturalWidth / rect.width;
        const scaleY = this._imageNaturalHeight / rect.height;

        // Calculate offset in natural pixels
        const clickNatX = (e.clientX - rect.left) * scaleX;
        const clickNatY = (e.clientY - rect.top) * scaleY;

        // Manage selection on click
        if (e.shiftKey && this._lastFocusedZoneId !== null) {
            // Shift + Click range selection (Windows style)
            const idxAnchor = this._zones.findIndex(z => z.id === this._lastFocusedZoneId);
            const idxNew = this._zones.findIndex(z => z.id === zoneId);
            if (idxAnchor !== -1 && idxNew !== -1) {
                // Clear selection if not holding Ctrl/Cmd too
                const keepExisting = e.ctrlKey || e.metaKey;
                if (!keepExisting) {
                    this._selectedZoneIds.clear();
                    overlay.querySelectorAll('.trombi-zone').forEach(zEl => {
                        zEl.classList.remove('is-selected');
                    });
                }
                const startIdx = Math.min(idxAnchor, idxNew);
                const endIdx = Math.max(idxAnchor, idxNew);
                for (let i = startIdx; i <= endIdx; i++) {
                    const z = this._zones[i];
                    this._selectedZoneIds.add(z.id);
                    const zEl = overlay.querySelector(`.trombi-zone[data-zone-id="${z.id}"]`);
                    zEl?.classList.add('is-selected');
                }
            }
        } else if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd + Click toggle selection
            if (this._selectedZoneIds.has(zoneId)) {
                this._selectedZoneIds.delete(zoneId);
                el.classList.remove('is-selected');
            } else {
                this._selectedZoneIds.add(zoneId);
                el.classList.add('is-selected');
            }
        } else {
            // If the zone clicked is not part of the selection, clear selection and select only it
            if (!this._selectedZoneIds.has(zoneId)) {
                this._selectedZoneIds.clear();
                overlay.querySelectorAll('.trombi-zone').forEach(zEl => {
                    zEl.classList.remove('is-selected');
                });
                this._selectedZoneIds.add(zoneId);
                el.classList.add('is-selected');
            }
        }

        this._updateGroupedDragState();

        // Store original positions of all zones for synchronized drag
        const originalPositions = new Map();
        this._zones.forEach(z => {
            originalPositions.set(z.id, { cx: z.cx, cy: z.cy });
        });

        // If grouped drag in multi-page PDF, also capture original positions of other pages
        const otherPagesOriginalPositions = new Map();
        if (this._groupedDrag && this._parsedPdfData?.pages) {
            this._parsedPdfData.pages.forEach((p, pIdx) => {
                if (pIdx !== this._currentPageIndex && p.zones) {
                    p.zones.forEach(z => {
                        otherPagesOriginalPositions.set(z.id, { cx: z.cx, cy: z.cy });
                    });
                }
            });
        }

        this._dragging = {
            zone,
            offsetX: clickNatX - zone.cx,
            offsetY: clickNatY - zone.cy,
            startCx: zone.cx,
            startCy: zone.cy,
            originalPositions,
            otherPagesOriginalPositions
        };

        // Capture snapshot before dragging
        this._tempDragSnapshot = this._getCurrentStateSnapshot();

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
        if (this._selectionBox) {
            this._updateSelectionBox(e);
            return;
        }

        if (!this._dragging) return;

        const overlay = document.getElementById('trombiZonesOverlay');
        if (!overlay) return;

        const rect = overlay.getBoundingClientRect();
        const scaleX = this._imageNaturalWidth / rect.width;
        const scaleY = this._imageNaturalHeight / rect.height;

        const { zone, offsetX, offsetY, startCx, startCy } = this._dragging;
        const newCx = (e.clientX - rect.left) * scaleX - offsetX;
        const newCy = (e.clientY - rect.top) * scaleY - offsetY;

        const r = this._globalRadius;

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

            // Also propagate delta to other PDF pages so the template stays synchronized across pages
            if (this._dragging.otherPagesOriginalPositions && this._parsedPdfData?.pages) {
                this._parsedPdfData.pages.forEach((p, pIdx) => {
                    if (pIdx !== this._currentPageIndex && p.zones) {
                        p.zones.forEach(z => {
                            const originalPos = this._dragging.otherPagesOriginalPositions.get(z.id);
                            if (originalPos) {
                                z.cx = originalPos.cx + deltaX;
                                z.cy = originalPos.cy + deltaY;
                            }
                        });
                    }
                });
            }
        } else if (this._selectedZoneIds.size > 1 && this._selectedZoneIds.has(zone.id)) {
            // Multi-selection mode: move all selected zones by the same delta
            const deltaX = newCx - startCx;
            const deltaY = newCy - startCy;

            this._zones.forEach(z => {
                if (this._selectedZoneIds.has(z.id)) {
                    const originalPos = this._dragging.originalPositions.get(z.id);
                    if (originalPos) {
                        z.cx = Math.max(r, Math.min(this._imageNaturalWidth - r, originalPos.cx + deltaX));
                        z.cy = Math.max(r, Math.min(this._imageNaturalHeight - r, originalPos.cy + deltaY));
                    }
                }
            });
        } else if (e.shiftKey) {
            // Row-mode (Shift key): move all zones in the same row vertically
            const deltaY = newCy - startCy;
            // Identify zones on the same horizontal row (based on similar cy coordinate)
            const rowZones = this._zones.filter(z => Math.abs(z.cy - startCy) < r * 1.5);
            
            rowZones.forEach(z => {
                const originalPos = this._dragging.originalPositions.get(z.id);
                if (originalPos) {
                    z.cy = Math.max(r, Math.min(this._imageNaturalHeight - r, originalPos.cy + deltaY));
                }
            });
            // Also move the dragged zone horizontally normally
            zone.cx = Math.max(r, Math.min(this._imageNaturalWidth - r, newCx));
        } else {
            // Individual mode: move only this zone
            zone.cx = Math.max(r, Math.min(this._imageNaturalWidth - r, newCx));
            zone.cy = Math.max(r, Math.min(this._imageNaturalHeight - r, newCy));
        }

        this._renderZones();
        this._updateLivePreviews();
    },

    _updateSelectionBox(e) {
        const box = this._selectionBox;
        if (!box) return;

        const imagePanel = document.getElementById('trombiImageWithZones');
        const viewport = imagePanel?.querySelector('.trombi-viewport');
        if (!viewport) return;

        // Calculate current width and height
        const dx = e.clientX - box.startX;
        const dy = e.clientY - box.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If distance > 5px, activate the box
        if (!box.isActive && distance > 5) {
            box.isActive = true;
            this._selectionBoxDragActive = true;
            
            // Create the visual box element inside viewport if not exists
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

        // Compute geometry relative to viewport
        const rect = box.viewportRect;
        const left = Math.min(box.startX, e.clientX) - rect.left;
        const top = Math.min(box.startY, e.clientY) - rect.top;
        const width = Math.abs(dx);
        const height = Math.abs(dy);

        boxEl.style.left = `${left}px`;
        boxEl.style.top = `${top}px`;
        boxEl.style.width = `${width}px`;
        boxEl.style.height = `${height}px`;

        // Detect overlapping zones using client viewport coordinates
        const boxLeft = Math.min(box.startX, e.clientX);
        const boxRight = Math.max(box.startX, e.clientX);
        const boxTop = Math.min(box.startY, e.clientY);
        const boxBottom = Math.max(box.startY, e.clientY);

        const overlay = document.getElementById('trombiZonesOverlay');
        if (overlay) {
            this._zones.forEach(zone => {
                const el = overlay.querySelector(`.trombi-zone[data-zone-id="${zone.id}"]`);
                if (el) {
                    const zRect = el.getBoundingClientRect();
                    const isOverlapping = !(zRect.left > boxRight || zRect.right < boxLeft || zRect.top > boxBottom || zRect.bottom < boxTop);
                    if (isOverlapping) {
                        this._selectedZoneIds.add(zone.id);
                        el.classList.add('is-selected');
                    } else {
                        this._selectedZoneIds.delete(zone.id);
                        el.classList.remove('is-selected');
                    }
                }
            });
        }
        this._updateGroupedDragState();
    },

    _handleMouseUp() {
        if (this._selectionBox) {
            const boxEl = document.getElementById('trombiSelectionBox');
            if (boxEl) {
                boxEl.style.display = 'none';
            }
            if (!this._selectionBox.isActive) {
                // Click on background overlay: clear selection
                this._selectedZoneIds.clear();
                const overlay = document.getElementById('trombiZonesOverlay');
                overlay?.querySelectorAll('.trombi-zone').forEach(zEl => {
                    zEl.classList.remove('is-selected');
                });
                this._updateGroupedDragState();
            }
            this._selectionBox = null;
            setTimeout(() => {
                this._selectionBoxDragActive = false;
            }, 50);
            return;
        }

        if (this._dragging) {
            const { zone, startCx, startCy } = this._dragging;
            const el = document.querySelector(`[data-zone-id="${zone.id}"]`);
            el?.classList.remove('dragging');

            // Check if it actually moved
            const hasMoved = Math.abs(zone.cx - startCx) > 0.01 || Math.abs(zone.cy - startCy) > 0.01;
            if (hasMoved && this._tempDragSnapshot) {
                this._history.push(this._tempDragSnapshot);
                if (this._history.length > this._maxHistoryLevels) {
                    this._history.shift();
                }
                this._updateUndoButton();
            }
            this._tempDragSnapshot = null;
            this._dragging = null;
        }
    },

    _updateGroupedDragState() {
        if (this._selectedZoneIds.size > 1) {
            if (this._groupedDrag) {
                this._restoreGroupedDrag = true;
                this._groupedDrag = false;
                const toggle = document.getElementById('groupedDragToggle');
                if (toggle) toggle.checked = false;
            }
        } else {
            if (this._restoreGroupedDrag) {
                this._groupedDrag = true;
                this._restoreGroupedDrag = false;
                const toggle = document.getElementById('groupedDragToggle');
                if (toggle) toggle.checked = true;
            }
        }
    },

    /**
     * Handle keyboard navigation for gap sliders and zone positioning
     * - When gap sliders are focused: ←/→ adjust H gap, ↑/↓ adjust V gap
     * - When zone select is focused: all 4 arrows move the zone position
     */
    _handleKeyDown(e) {
        // Handle Ctrl+Z / Cmd+Z
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            const modal = document.getElementById('trombiWizardModal');
            if (modal?.classList.contains('visible') && this._currentStep === 2) {
                e.preventDefault();
                this._undo();
                return;
            }
        }

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
            this._saveStateForNudge();
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
                this._saveStateForNudge();
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
            this._saveStateForNudge();

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

                if (this._parsedPdfData?.pages) {
                    this._parsedPdfData.pages.forEach((p, pIdx) => {
                        if (pIdx !== this._currentPageIndex && p.zones) {
                            p.zones.forEach(z => {
                                z.cx += deltaX;
                                z.cy += deltaY;
                            });
                        }
                    });
                }
            } else if (this._selectedZoneIds.size > 1 && this._selectedZoneIds.has(this._lastFocusedZoneId)) {
                // Multi-selection mode: move all selected zones
                let deltaX = 0, deltaY = 0;
                if (e.key === 'ArrowLeft') deltaX = -step;
                else if (e.key === 'ArrowRight') deltaX = step;
                else if (e.key === 'ArrowUp') deltaY = -step;
                else if (e.key === 'ArrowDown') deltaY = step;

                this._zones.forEach(z => {
                    if (this._selectedZoneIds.has(z.id)) {
                        z.cx = Math.max(r, Math.min(this._imageNaturalWidth - r, z.cx + deltaX));
                        z.cy = Math.max(r, Math.min(this._imageNaturalHeight - r, z.cy + deltaY));
                    }
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
                <label><iconify-icon icon="solar:maximize-square-3-linear"></iconify-icon> Taille</label>
                <input type="range" class="control-slider size-slider" 
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

        let allStudents = [];
        const existingClassStudents = appState.filteredResults || [];

        if (this._parsedPdfData && this._parsedPdfData.students) {
            // Dans le mode PDF trombinoscope, la liste de référence est celle extraite du document
            allStudents = this._parsedPdfData.students.map(pdfS => {
                const matched = existingClassStudents.find(es =>
                    es.id === pdfS.id ||
                    Utils.normalizeName(es.nom, es.prenom) === Utils.normalizeName(pdfS.nom, pdfS.prenom)
                );
                return {
                    id: pdfS.id,
                    nom: pdfS.nom,
                    prenom: pdfS.prenom,
                    originClass: pdfS.originClass || null,
                    classe: pdfS.classe || null,
                    studentPhoto: matched?.studentPhoto || null,
                    matchedExistingId: matched?.id || null
                };
            });
        } else {
            allStudents = [...existingClassStudents];
        }

        if (this._zones.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <iconify-icon icon="solar:cursor-linear"></iconify-icon>
                    <p>Cliquez sur l'image pour ajouter des zones</p>
                </div>
            `;
            return;
        }

        const isPdfMode = !!this._parsedPdfData;
        const excludeWithPhotos = !isPdfMode && (document.getElementById('trombiExcludeWithPhotos')?.checked ?? true);
        const pageOffset = this._getPageOffset();

        // Sort zones by ID to keep order stable
        const sortedZones = [...this._zones].sort((a, b) => a.id - b.id);

        container.innerHTML = `
            ${sortedZones.map((zone, index) => {
                const dropdownStudents = allStudents.filter(s => {
                    if (s.id === zone.studentId) return true; // Always keep currently selected student
                    if (excludeWithPhotos && s.studentPhoto?.data) return false;
                    return true;
                });

                const assignedStudent = allStudents.find(s => s.id === zone.studentId);
                const assignedName = assignedStudent ? Utils.formatStudentName(assignedStudent.nom, assignedStudent.prenom) : '';
                const tooltipAttr = assignedName ? `data-tooltip="${assignedName}"` : 'data-tooltip="Choisir un élève..."';

                return `
                    <div class="assignment-row" data-zone-id="${zone.id}">
                        <div class="assignment-preview">
                            <canvas class="live-preview-canvas" 
                                    data-zone-id="${zone.id}" 
                                    width="80" height="80"></canvas>
                        </div>
                        <div class="assignment-id">
                            #${pageOffset + index + 1}
                        </div>
                        <div class="assignment-student-select">
                            <select class="assignment-select" data-zone-id="${zone.id}" ${tooltipAttr}>
                                <option value="">Choisir un élève...</option>
                                ${dropdownStudents.map(s => {
                                    // Check if this student is assigned to ANOTHER zone (including other PDF pages)
                                    const assignedToOther = isPdfMode && this._parsedPdfData.numPages > 1
                                        ? this._parsedPdfData.pages.some((p, pIdx) => {
                                            const zonesList = (pIdx === this._currentPageIndex) ? this._zones : (p.zones || []);
                                            return zonesList.some(z => z.studentId === s.id && !(pIdx === this._currentPageIndex && z.id === zone.id));
                                        })
                                        : this._zones.some(z => z.studentId === s.id && z.id !== zone.id);
                                    const hasPhoto = !isPdfMode && !!s.studentPhoto?.data;

                                    const statusParts = [];
                                    if (assignedToOther) {
                                        statusParts.push('déjà sélectionné');
                                    }
                                    if (hasPhoto) {
                                        statusParts.push('déjà assigné');
                                    }

                                    const statusText = statusParts.length > 0 ? ` (${statusParts.join(', ')})` : '';
                                    const studentNameFormatted = Utils.formatStudentName(s.nom, s.prenom);
                                    const label = `${studentNameFormatted}${statusText}`;

                                    return `
                                        <option value="${s.id}" ${zone.studentId === s.id ? 'selected' : ''} title="${label}">
                                            ${label}
                                        </option>
                                    `;
                                }).join('')}
                            </select>
                        </div>
                        <div class="assignment-actions">
                            <button type="button" class="assignment-action-btn shift-down-btn" 
                                    data-zone-id="${zone.id}" 
                                    data-tooltip="Insérer un vide (décaler vers le bas)">
                                <iconify-icon icon="solar:alt-arrow-down-linear"></iconify-icon>
                            </button>
                            <button type="button" class="assignment-action-btn shift-up-btn danger" 
                                    data-zone-id="${zone.id}" 
                                    data-tooltip="Supprimer cet élève et décaler le reste vers le haut">
                                <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        `;

        // Update zones count in footer
        const zonesInfo = document.getElementById('trombiZonesInfo');
        if (zonesInfo) {
            if (this._parsedPdfData && this._parsedPdfData.numPages > 1) {
                const totalZones = this._parsedPdfData.pages.reduce((acc, p) => acc + (p.zones?.length || 0), 0);
                const totalAssigned = this._parsedPdfData.pages.reduce((acc, p) => acc + (p.zones?.filter(z => z.studentId).length || 0), 0);
                zonesInfo.textContent = `${totalAssigned} / ${totalZones} zones assignées (Page ${this._currentPageIndex + 1}/${this._parsedPdfData.numPages})`;
            } else {
                const assignedCount = this._zones.filter(z => z.studentId).length;
                zonesInfo.textContent = `${assignedCount} / ${this._zones.length} zones assignées`;
            }
        }

        // Bind select events
        container.querySelectorAll('.assignment-select').forEach(select => {
            select.addEventListener('change', e => {
                this._saveState();
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

        // Bind shift buttons
        container.querySelectorAll('.shift-down-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const zoneId = parseInt(btn.dataset.zoneId);
                this._insertGapAndShiftDown(zoneId);
            });
        });

        container.querySelectorAll('.shift-up-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const zoneId = parseInt(btn.dataset.zoneId);
                this._removeAndShiftUp(zoneId);
            });
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

        // Re-initialize tooltips for the new/updated select dropdowns
        UI.initTooltips?.();
    },

    /**
     * Update all live preview canvases with current zone positions
     * @private
     */
    async _updateLivePreviews() {
        const canvases = document.querySelectorAll('.live-preview-canvas');
        if (canvases.length === 0) return;

        // Use in-memory PDF canvas if available, or cached image
        let img = this._parsedPdfData?.pages[this._currentPageIndex]?.canvas;
        if (!img) {
            if (!this._cachedImage) {
                try {
                    this._cachedImage = await this._loadImage(this._imageSrc);
                } catch {
                    return;
                }
            }
            img = this._cachedImage;
        }

        canvases.forEach(canvas => {
            const zoneId = parseInt(canvas.dataset.zoneId);
            const zone = this._zones.find(z => z.id === zoneId);
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Canvas buffer is 80x80, displayed at 40x40 CSS for HiDPI sharpness
            const size = 80;

            ctx.clearRect(0, 0, size, size);

            if (!zone) return;

            // Draw cropped zone using zone radius or global radius
            const { cx, cy } = zone;
            const r = zone.r || this._globalRadius;
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

        if (this._parsedPdfData?.pages?.[this._currentPageIndex]) {
            this._parsedPdfData.pages[this._currentPageIndex].zones = this._zones.map(z => ({ ...z }));
        }

        let students = [...(appState.filteredResults || [])];
        if (this._parsedPdfData && this._parsedPdfData.students) {
            for (const pdfStudent of this._parsedPdfData.students) {
                if (!students.some(s => s.id === pdfStudent.id || Utils.normalizeName(s.nom, s.prenom) === Utils.normalizeName(pdfStudent.nom, pdfStudent.prenom))) {
                    students.push({
                        id: pdfStudent.id,
                        nom: pdfStudent.nom,
                        prenom: pdfStudent.prenom,
                        classe: pdfStudent.classe || pdfStudent.originClass || ''
                    });
                }
            }
        }

        let assignedItems;
        if (this._parsedPdfData && this._parsedPdfData.numPages > 1) {
            assignedItems = this._parsedPdfData.pages.flatMap((p, idx) =>
                (p.zones || []).filter(z => z.studentId).map(z => ({ zone: z, pageIndex: idx }))
            );
        } else {
            assignedItems = this._zones.filter(z => z.studentId).map(z => ({ zone: z, pageIndex: 0 }));
        }

        const confirmInfo = document.getElementById('trombiConfirmInfo');
        const confirmBtn = document.getElementById('trombiConfirmBtn');

        if (assignedItems.length === 0) {
            confirmInfo?.replaceChildren();
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<iconify-icon icon="ph:check-bold"></iconify-icon> Importer les photos';
            }
            container.innerHTML = `
                <div class="empty-state">
                    <iconify-icon icon="solar:danger-circle-linear"></iconify-icon>
                    <p>Aucune photo assignée. Retournez à l'étape précédente.</p>
                </div>
            `;
            return;
        }

        const assignedCount = assignedItems.length;
        const totalStudents = students.length;

        if (confirmInfo) {
            if (totalStudents > assignedCount) {
                confirmInfo.innerHTML = `<strong>${assignedCount}</strong> / ${totalStudents} élèves prêts pour l'import`;
            } else {
                confirmInfo.innerHTML = `<strong>${assignedCount}</strong> élève${assignedCount > 1 ? 's' : ''} prêt${assignedCount > 1 ? 's' : ''} pour l'import`;
            }
        }

        if (confirmBtn) {
            confirmBtn.disabled = false;
            const photoLabel = assignedCount > 1 ? `${assignedCount} photos` : 'la photo';
            confirmBtn.innerHTML = `<iconify-icon icon="ph:check-bold"></iconify-icon> Importer ${photoLabel}`;
        }

        // Create preview canvas for each assigned zone
        container.innerHTML = '<div class="preview-list"></div>';
        const list = container.querySelector('.preview-list');

        for (const item of assignedItems) {
            const student = students.find(s => s.id === item.zone.studentId) || (this._parsedPdfData?.students?.find(s => s.id === item.zone.studentId));
            if (!student) continue;

            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            // Buffer 160x160 for HiDPI, displayed at 80x80 CSS
            previewItem.innerHTML = `
                <canvas class="preview-canvas" width="160" height="160"></canvas>
                <span>${Utils.formatStudentName(student.nom, student.prenom, true)}</span>
            `;
            list.appendChild(previewItem);

            // Draw preview
            this._drawPreview(previewItem.querySelector('canvas'), item.zone, item.pageIndex);
        }
    },

    async _drawPreview(canvas, zone, pageIndex = 0) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const targetSize = canvas.width;
        const r = zone.r || this._globalRadius;
        const diameter = r * 2;
        const { cx, cy } = zone;

        if (this._parsedPdfData && this._parsedPdfData.pages[pageIndex]?.canvas) {
            const page = this._parsedPdfData.pages[pageIndex];
            const sx = Math.max(0, cx - r);
            const sy = Math.max(0, cy - r);
            const sw = Math.min(diameter, page.width - sx);
            const sh = Math.min(diameter, page.height - sy);

            ctx.clearRect(0, 0, targetSize, targetSize);
            ctx.drawImage(page.canvas, sx, sy, sw, sh, 0, 0, targetSize, targetSize);
            return;
        }

        try {
            const img = await this._loadImage(this._imageSrc);
            const sx = Math.max(0, cx - r);
            const sy = Math.max(0, cy - r);
            const sw = Math.min(diameter, this._imageNaturalWidth - sx);
            const sh = Math.min(diameter, this._imageNaturalHeight - sy);

            ctx.clearRect(0, 0, targetSize, targetSize);
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetSize, targetSize);
        } catch {
            // Silently fail preview
        }
    },

    // ========================================================================
    // IMPORT EXECUTION
    // ========================================================================

    async _confirmImport() {
        return this._handleImport();
    },

    async _handleImport() {
        if (this._zones.length === 0 && (!this._parsedPdfData || this._parsedPdfData.pages.every(p => !p.zones || p.zones.length === 0))) {
            UI.showNotification('Aucune zone définie', 'warning');
            return;
        }

        // Sauvegarder les zones de la page courante avant l'import
        if (this._parsedPdfData && this._parsedPdfData.pages[this._currentPageIndex]) {
            this._parsedPdfData.pages[this._currentPageIndex].zones = this._zones.map(z => ({ ...z }));
        }

        // Support multi-page PDF import: collect assigned zones across ALL pages
        let assignedItems;
        if (this._parsedPdfData && this._parsedPdfData.numPages > 1) {
            assignedItems = this._parsedPdfData.pages.flatMap((p, idx) =>
                (p.zones || []).filter(z => z.studentId).map(z => ({ zone: z, pageIndex: idx }))
            );
        } else {
            assignedItems = this._zones.filter(z => z.studentId).map(z => ({ zone: z, pageIndex: 0 }));
        }

        if (assignedItems.length === 0) {
            UI.showNotification('Aucune photo à importer', 'warning');
            return;
        }

        UI.showLoadingOverlay('Extraction des photos...');

        try {
            let targetClass = null;

            // If from parsed PDF, ensure class and students exist
            if (this._parsedPdfData) {
                const rawTargetName = (this._parsedPdfData.className || 'Nouvelle Classe').trim();
                const targetName = Utils.formatClassDisplayName ? Utils.formatClassDisplayName(rawTargetName) : rawTargetName;
                const existingClasses = ClassManager.getAllClasses() || [];
                const currentClass = ClassManager.getCurrentClass?.();
                const hasStudents = currentClass && (appState.generatedResults || []).some(r => r.classId === currentClass.id);
                const isDemo = currentClass && ClassManager.isDemoClass ? ClassManager.isDemoClass(currentClass.id) : false;

                // 1. Recherche correspondance exacte (insensible à la casse sur nom formaté ou brut)
                targetClass = existingClasses.find(c => 
                    c.name.toLowerCase() === targetName.toLowerCase() || 
                    c.name.toLowerCase() === rawTargetName.toLowerCase()
                );

                // 2. Recherche tolérante / normalisée (ex: "5°1" vs "5 1", "6ème A" vs "6 A")
                if (!targetClass && Utils.normalizeClassName) {
                    const targetNorm = Utils.normalizeClassName(targetName);
                    const rawNorm = Utils.normalizeClassName(rawTargetName);
                    if (targetNorm || rawNorm) {
                        targetClass = existingClasses.find(c => {
                            const cNorm = Utils.normalizeClassName(c.name);
                            return (targetNorm && cNorm === targetNorm) || (rawNorm && cNorm === rawNorm);
                        });
                    }
                }

                // 3. Si toujours non trouvée mais la classe active est vide et n'est pas la démo :
                // On réutilise la classe active (on met à jour son nom avec celui du PDF pour éviter les doublons)
                if (!targetClass) {
                    if (currentClass && !hasStudents && !isDemo) {
                        ClassManager.updateClass?.(currentClass.id, {
                            name: targetName,
                            year: this._parsedPdfData.schoolYear || currentClass.year
                        });
                        targetClass = currentClass;
                    } else {
                        targetClass = ClassManager.createClass(targetName, this._parsedPdfData.schoolYear);
                    }
                }
                await ClassManager.switchClass(targetClass.id);

                // Create any pending student that was in the PDF and assigned to a zone
                for (const item of assignedItems) {
                    let existing = appState.generatedResults.find(r => r.id === item.zone.studentId);
                    if (!existing && this._parsedPdfData.students) {
                        const pdfStudent = this._parsedPdfData.students.find(s => s.id === item.zone.studentId);
                        if (pdfStudent) {
                            existing = appState.generatedResults.find(r =>
                                r.classId === targetClass.id &&
                                Utils.normalizeName(r.nom, r.prenom) === Utils.normalizeName(pdfStudent.nom, pdfStudent.prenom)
                            );
                            if (existing) {
                                item.zone.studentId = existing.id;
                            } else {
                                const newStudentResult = StudentDataManager.createPendingResult({
                                    nom: pdfStudent.nom,
                                    prenom: pdfStudent.prenom,
                                    classe: pdfStudent.classe || pdfStudent.originClass || '',
                                    periods: {}
                                });
                                newStudentResult.classId = targetClass.id;
                                appState.generatedResults.push(newStudentResult);
                                item.zone.studentId = newStudentResult.id;
                            }
                        }
                    }
                }
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext ? canvas.getContext('2d') : null;
            const targetSize = 200;
            canvas.width = targetSize;
            canvas.height = targetSize;

            const assignments = [];

            if (this._parsedPdfData) {
                for (const item of assignedItems) {
                    const page = this._parsedPdfData.pages[item.pageIndex];
                    if (!page || !page.canvas) continue;
                    const { studentId, cx, cy } = item.zone;
                    const r = item.zone.r || this._globalRadius;
                    const diameter = r * 2;
                    const sx = Math.max(0, cx - r);
                    const sy = Math.max(0, cy - r);
                    const sw = Math.min(diameter, page.width - sx);
                    const sh = Math.min(diameter, page.height - sy);

                    let photoData;
                    if (ctx && typeof canvas.toDataURL === 'function') {
                        ctx.clearRect(0, 0, targetSize, targetSize);
                        ctx.drawImage(page.canvas, sx, sy, sw, sh, 0, 0, targetSize, targetSize);
                        photoData = canvas.toDataURL('image/jpeg', 0.85);
                    } else {
                        const matchedPdfStudent = this._parsedPdfData.students?.find(s => s.id === studentId || s.id === item.zone.studentId);
                        photoData = matchedPdfStudent?.photoData || 'data:image/jpeg;base64,mock';
                    }
                    assignments.push({ studentId, photoData });
                }
            } else {
                const img = await this._loadImage(this._imageSrc);
                for (const item of assignedItems) {
                    const { studentId, cx, cy } = item.zone;
                    const r = item.zone.r || this._globalRadius;
                    const diameter = r * 2;
                    const sx = Math.max(0, cx - r);
                    const sy = Math.max(0, cy - r);
                    const sw = Math.min(diameter, this._imageNaturalWidth - sx);
                    const sh = Math.min(diameter, this._imageNaturalHeight - sy);

                    let photoData;
                    if (ctx && typeof canvas.toDataURL === 'function') {
                        ctx.clearRect(0, 0, targetSize, targetSize);
                        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetSize, targetSize);
                        photoData = canvas.toDataURL('image/jpeg', 0.85);
                    } else {
                        photoData = 'data:image/jpeg;base64,mock';
                    }
                    assignments.push({ studentId, photoData });
                }
            }

            const count = await StudentPhotoManager.bulkAssignPhotos(assignments);

            if (this._parsedPdfData) {
                await StorageManager.saveAppState();
                if (targetClass) {
                    await ClassManager._filterResultsByClass(targetClass.id);
                    window.dispatchEvent(new CustomEvent('classChanged', { detail: { classId: targetClass.id } }));
                }
            }

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
    },

    _getCurrentStateSnapshot() {
        return {
            zones: this._zones.map(z => ({ ...z })),
            pages: this._parsedPdfData?.pages?.map(p => ({
                zones: (p.zones || []).map(z => ({ ...z }))
            })),
            gridCols: this._gridCols,
            gridRows: this._gridRows,
            gapH: this._gapH,
            gapV: this._gapV,
            globalRadius: this._globalRadius
        };
    },

    _saveState() {
        if (!this._history) this._history = [];
        this._history.push(this._getCurrentStateSnapshot());
        if (this._history.length > this._maxHistoryLevels) {
            this._history.shift();
        }
        this._updateUndoButton();
    },

    _undo() {
        if (!this._history || this._history.length === 0) return;
        const prevState = this._history.pop();
        
        this._selectedZoneIds.clear();
        this._zones = prevState.zones.map(z => ({ ...z }));
        if (prevState.pages && this._parsedPdfData?.pages) {
            this._parsedPdfData.pages.forEach((p, idx) => {
                if (prevState.pages[idx]?.zones) {
                    p.zones = prevState.pages[idx].zones.map(z => ({ ...z }));
                }
            });
        }
        this._gridCols = prevState.gridCols;
        this._gridRows = prevState.gridRows;
        this._gapH = prevState.gapH;
        this._gapV = prevState.gapV;
        this._globalRadius = prevState.globalRadius;

        // Synchronize sliders UI
        this._syncSlidersToState();
        
        // Re-render
        this._renderZones();
        this._renderAssignmentGrid();
        this._updateUndoButton();
        
        UI.showNotification('Action annulée', 'info');
    },

    _updateUndoButton() {
        const undoBtn = document.getElementById('trombiUndoBtn');
        if (undoBtn) {
            undoBtn.disabled = !this._history || this._history.length === 0;
        }
    },

    _saveStateForNudge() {
        if (this._nudgeTimer) {
            clearTimeout(this._nudgeTimer);
        } else {
            this._saveState();
        }
        this._nudgeTimer = setTimeout(() => {
            this._nudgeTimer = null;
        }, 1000);
    }
};
