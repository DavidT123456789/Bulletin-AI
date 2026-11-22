/**
 * @fileoverview Trombinoscope Manager - Façade coordinatrice de l'assistant Trombinoscope
 * Découpé en 6 sous-modules spécialisés (Lot 12 — Découpage God Object #2) :
 * - TrombiPdfLoader (`src/managers/trombinoscope/TrombiPdfLoader.js`)
 * - TrombiGridDetector (`src/managers/trombinoscope/TrombiGridDetector.js`)
 * - TrombiViewportZoom (`src/managers/trombinoscope/TrombiViewportZoom.js`)
 * - TrombiZoneEditor (`src/managers/trombinoscope/TrombiZoneEditor.js`)
 * - TrombiStudentMatcher (`src/managers/trombinoscope/TrombiStudentMatcher.js`)
 * - TrombiCropExporter (`src/managers/trombinoscope/TrombiCropExporter.js`)
 * @module managers/TrombinoscopeManager
 */

import { ClassManager } from './ClassManager.js';
import { ModalUI } from './ModalUIManager.js';
import { HistoryManager } from './HistoryManager.js';
import { TrombiPdfLoader } from './trombinoscope/TrombiPdfLoader.js';
import { TrombiGridDetector } from './trombinoscope/TrombiGridDetector.js';
import { TrombiViewportZoom } from './trombinoscope/TrombiViewportZoom.js';
import { TrombiZoneEditor } from './trombinoscope/TrombiZoneEditor.js';
import { TrombiStudentMatcher } from './trombinoscope/TrombiStudentMatcher.js';
import { TrombiCropExporter } from './trombinoscope/TrombiCropExporter.js';

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

    /** History stack for redo */
    _redoHistory: [],

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
    _transitionCleanup: null,
    _zoomAnimCleanup: null,
    _lastViewportW: 0,
    _lastViewportH: 0,
    _viewportResizeRaf: null,
    _openPopoverZoneId: null,
    _userToggledExcludeFilter: false,
    _outsidePopoverHandler: null,

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    init() {
        this._setupEventListeners();
    },

    _setupEventListeners() {
        if (this._initAbortController) {
            this._initAbortController.abort();
        }
        this._initAbortController = new AbortController();
        const { signal } = this._initAbortController;

        // Close buttons
        document.getElementById('closeTrombiWizardBtn')?.addEventListener('click', () => this.close(), { signal });
        document.getElementById('trombiWizardBackdrop')?.addEventListener('click', () => this.close(), { signal });
        document.getElementById('trombiStep1CancelBtn')?.addEventListener('click', () => this.close(), { signal });

        // File input
        const dropZone = document.getElementById('trombiDropZone');
        const fileInput = document.getElementById('trombiFileInput');

        dropZone?.addEventListener('click', () => {
            if (dropZone.classList.contains('has-image')) return;
            fileInput?.click();
        }, { signal });
        document.getElementById('trombiStep1PageSelectorBar')?.addEventListener('click', (e) => e.stopPropagation(), { signal });
        dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); }, { signal });
        dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dragover'), { signal });
        dropZone?.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const file = e.dataTransfer?.files[0];
            if (file) {
                this._loadFile(file);
            }
        }, { signal });

        fileInput?.addEventListener('change', e => {
            const file = e.target.files?.[0];
            if (file) this._loadFile(file);
        }, { signal });

        // Sample button
        document.getElementById('trombiSampleBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._loadImageFromUrl('./images/sample-trombinoscope.png');
        }, { signal });

        // Remove image button (× in corner)
        document.getElementById('trombiRemoveImageBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._removeImage();
        }, { signal });

        // Navigation buttons
        document.getElementById('trombiStep1NextBtn')?.addEventListener('click', () => this._goToStep(2), { signal });
        document.getElementById('trombiStep2PrevBtn')?.addEventListener('click', () => this._goToStep(1), { signal });
        document.getElementById('trombiStep2NextBtn')?.addEventListener('click', () => this._goToStep(3), { signal });
        document.getElementById('trombiStep3PrevBtn')?.addEventListener('click', () => this._goToStep(2), { signal });
        document.getElementById('trombiConfirmBtn')?.addEventListener('click', () => this._handleImport(), { signal });

        // STEPPER NAVIGATION - Clickable steps
        document.querySelectorAll('#trombiWizardModal .ui-stepper-step[role="button"]').forEach(stepEl => {
            stepEl.addEventListener('click', () => {
                const targetStep = parseInt(stepEl.dataset.step, 10);
                if (targetStep && targetStep !== this._currentStep) {
                    if (targetStep < this._currentStep) {
                        this._goToStep(targetStep);
                    } else if (targetStep === 2 && this._currentStep === 1 && (this._imageSrc || this._parsedPdfData)) {
                        this._goToStep(2);
                    } else if (targetStep === 3 && this._currentStep === 2) {
                        this._goToStep(3);
                    }
                }
            }, { signal });
            stepEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    stepEl.click();
                }
            }, { signal });
        });

        // Exclude students with photos toggle
        document.getElementById('trombiExcludeWithPhotos')?.addEventListener('change', () => {
            this._userToggledExcludeFilter = true;
            this._closeStudentPopover();
            this._autoAssignSilent();
        }, { signal });

        // Reassign in alphabetical order button
        document.getElementById('trombiAutoAssignBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.currentTarget.classList.contains('disabled')) return;
            this._closeStudentPopover();
            this._autoAssignInOrder();
        }, { signal });
    },

    _bindDocumentListeners() {
        if (this._documentListenersAbortController) {
            this._documentListenersAbortController.abort();
        }
        this._documentListenersAbortController = new AbortController();
        const { signal } = this._documentListenersAbortController;

        // Global mouse events for drag/resize
        document.addEventListener('mousemove', e => this._handleMouseMove(e), { signal });
        document.addEventListener('mouseup', () => this._handleMouseUp(), { signal });

        // Keyboard navigation for gap sliders, zone positioning and Escape (capture phase to precede GlobalListeners on popover Escape)
        document.addEventListener('keydown', e => this._handleKeyDown(e), { capture: true, signal });

        // Global paste event for image
        document.addEventListener('paste', e => {
            const modal = document.getElementById('trombiWizardModal');
            if (!modal || !modal.classList.contains('visible') || this._currentStep !== 1) return;

            const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items || [];
            for (const item of items) {
                if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    this._loadFile(file);
                    break;
                }
            }
        }, { signal });
    },

    _unbindDocumentListeners() {
        if (this._documentListenersAbortController) {
            this._documentListenersAbortController.abort();
            this._documentListenersAbortController = null;
        }
    },

    // ========================================================================
    // MODAL CONTROL (Mutualized with ModalUI.openModal / ModalUI.closeModal)
    // ========================================================================

    open() {
        this._reset();
        this._bindDocumentListeners();
        const modal = document.getElementById('trombiWizardModal');
        if (modal) {
            ModalUI.openModal(modal, {
                onClose: () => {
                    this._closeStudentPopover();
                    if (HistoryManager.isOpen('trombiWizardStep')) {
                        HistoryManager.handleManualClose('trombiWizardStep');
                    }
                    this._unbindDocumentListeners();
                },
                onClosed: () => this._reset()
            });
        }

        // Update class badge in header and contextual guide copy
        const classBadge = document.getElementById('trombiClassBadge');
        if (classBadge) {
            const currentClass = ClassManager.getCurrentClass();
            classBadge.textContent = currentClass?.name || 'Nouvelle classe';
        }
        this._updateGuideContext();
    },

    _updateGuideContext() {
        const guideText = document.getElementById('trombiGuideText');
        if (!guideText) return;

        const currentClass = ClassManager.getCurrentClass?.();
        const isDemo = Boolean(currentClass && ClassManager.isDemoClass?.(currentClass.id));
        const { existingClassStudents } = this._getTargetClassInfo?.() || {};
        const hasStudents = !isDemo && Array.isArray(existingClassStudents) && existingClassStudents.length > 0;

        guideText.textContent = hasStudents
            ? 'Importez un trombinoscope pour détecter et associer automatiquement les photos à vos élèves.'
            : 'Importez un trombinoscope pour créer la classe et associer les photos.';
    },

    close(options = {}) {
        const modal = document.getElementById('trombiWizardModal');
        if (!modal || (!modal.classList.contains('visible') && !modal.classList.contains('modal-visible')) || modal.classList.contains('closing')) return;

        this._closeStudentPopover();
        if (HistoryManager.isOpen('trombiWizardStep')) {
            HistoryManager.handleManualClose('trombiWizardStep');
        }
        this._unbindDocumentListeners();
        ModalUI.closeModal(modal, {
            ...options,
            onClosed: () => this._reset()
        });
    },

    _reset() {
        this._currentStep = 1;
        if (HistoryManager.isOpen('trombiWizardStep')) {
            HistoryManager.handleManualClose('trombiWizardStep');
        }
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
        this._redoHistory = [];
        this._tempSliderSnapshot = null;
        this._tempDragSnapshot = null;
        this._isNewUpload = false;
        this._userToggledExcludeFilter = false;
        this._closeStudentPopover();
        if (this._nudgeTimer) {
            clearTimeout(this._nudgeTimer);
            this._nudgeTimer = null;
        }
        this._selectedZoneIds.clear();
        this._selectionBox = null;
        this._selectionBoxDragActive = false;
        this._restoreGroupedDrag = false;
        this._cancelStepTransition();
        this._lastViewportW = 0;
        this._lastViewportH = 0;
        if (this._zoomAnimCleanup) {
            this._zoomAnimCleanup();
            this._zoomAnimCleanup = null;
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
        if (this._wheelZoomHost && this._wheelZoomHandler) {
            this._wheelZoomHost.removeEventListener('wheel', this._wheelZoomHandler);
            this._wheelZoomHost = null;
            this._wheelZoomHandler = null;
        }
        if (this._step2AbortController) {
            this._step2AbortController.abort();
            this._step2AbortController = null;
        }
        if (this._controlPanelAbortController) {
            this._controlPanelAbortController.abort();
            this._controlPanelAbortController = null;
        }
        if (this._objectUrls) {
            this._objectUrls.forEach(url => {
                try { URL.revokeObjectURL?.(url); } catch (_) { /* ignore */ }
            });
            this._objectUrls.clear();
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

        if (placeholder) placeholder.style.display = '';
        if (preview) preview.style.display = 'none';
        if (previewImg) {
            previewImg.classList.remove('is-revealing');
            previewImg.src = '';
        }
        dropZone?.classList.remove('has-image');

        document.getElementById('trombiImageInfo')?.replaceChildren();
        document.getElementById('trombiZonesInfo')?.replaceChildren();
        document.getElementById('trombiConfirmInfo')?.replaceChildren();

        const reassuranceBanner = document.getElementById('trombiReassuranceBanner');
        if (reassuranceBanner) {
            reassuranceBanner.style.display = 'none';
            reassuranceBanner.replaceChildren();
        }
        this._updateExistingPhotos = null;

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

    _goToStep(step, options = {}) {
        if (this._isTransitioning && !options?.causedByHistory) return;

        const previousStep = this._currentStep;
        if (previousStep === step) return;
        this._closeStudentPopover();
        this._currentStep = step;

        if (step > previousStep) {
            HistoryManager.pushState('trombiWizardStep', (opts) => {
                if (this._currentStep > 1) {
                    this._goToStep(this._currentStep - 1, opts);
                }
            });
        } else if (!options?.causedByHistory && !options?.silentHistory && HistoryManager.isOpen('trombiWizardStep')) {
            if (step === 1) {
                HistoryManager.handleManualClose('trombiWizardStep');
            } else {
                HistoryManager.handleManualClose('trombiWizardStep', { stepCount: previousStep - step });
            }
        }

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

    _cancelStepTransition() {
        if (this._transitionCleanup) {
            const cleanup = this._transitionCleanup;
            this._transitionCleanup = null;
            cleanup();
        }
        if (typeof document !== 'undefined') {
            document.querySelectorAll('.trombi-flip-ghost').forEach(el => el.remove());
        }
        this._isTransitioning = false;
    },

    _createFlipGhost(sourceRect, clipInsets = null) {
        const ghost = document.createElement('div');
        ghost.className = 'trombi-flip-ghost';
        ghost.style.top = `${sourceRect.top}px`;
        ghost.style.left = `${sourceRect.left}px`;
        ghost.style.width = `${sourceRect.width}px`;
        ghost.style.height = `${sourceRect.height}px`;
        if (clipInsets) {
            ghost.style.clipPath = `inset(${clipInsets.top}px ${clipInsets.right}px ${clipInsets.bottom}px ${clipInsets.left}px round var(--radius-sm, 6px))`;
        }

        const img = document.createElement('img');
        img.alt = '';
        img.decoding = 'sync';
        img.src = this._imageSrc;
        ghost.appendChild(img);
        document.body.appendChild(ghost);
        return { ghost, img };
    },

    _animateStepTransition(fromStep, toStep, direction) {
        this._cancelStepTransition();

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
            toContent.style.opacity = '';
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
        const isForward = direction === 'forward';
        const targetStep = isForward ? 2 : 1;
        const sourceEl = isForward
            ? fromContent.querySelector('#trombiPreviewImg, .drop-zone-image')
            : fromContent.querySelector('.trombi-content-wrapper');

        if (!sourceEl || !this._imageSrc) {
            this._animateGenericTransition(fromContent, toContent, direction, targetStep);
            return;
        }

        const sourceRect = sourceEl.getBoundingClientRect();
        if (!sourceRect || sourceRect.width === 0 || sourceRect.height === 0) {
            this._animateGenericTransition(fromContent, toContent, direction, targetStep);
            return;
        }

        let clipInsets = null;
        if (!isForward) {
            const viewportRect = fromContent.querySelector('.trombi-viewport')?.getBoundingClientRect();
            if (viewportRect && viewportRect.width > 0 && viewportRect.height > 0) {
                const top = Math.max(0, viewportRect.top - sourceRect.top);
                const right = Math.max(0, sourceRect.right - viewportRect.right);
                const bottom = Math.max(0, sourceRect.bottom - viewportRect.bottom);
                const left = Math.max(0, viewportRect.left - sourceRect.left);
                if (top + bottom >= sourceRect.height || left + right >= sourceRect.width) {
                    this._animateGenericTransition(fromContent, toContent, direction, 1);
                    return;
                }
                if (top > 0.5 || right > 0.5 || bottom > 0.5 || left > 0.5) {
                    clipInsets = { top, right, bottom, left };
                }
            }
        }

        this._isTransitioning = true;
        // Keep fromContent visible underneath the ghost until the ghost bitmap is decoded to avoid a 1-frame blank flash
        const { ghost, img: ghostImg } = this._createFlipGhost(sourceRect, clipInsets);

        let targetEl = null;
        let activeItems = [];
        let rafId = null;
        let timerId = null;
        let cleaned = false;

        const onTransitionEnd = (e) => {
            if (e.target === ghost && e.propertyName === 'transform') {
                cleanup();
            }
        };

        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            if (rafId !== null) cancelAnimationFrame(rafId);
            if (timerId !== null) clearTimeout(timerId);
            ghost.removeEventListener('transitionend', onTransitionEnd);
            if (targetEl) targetEl.style.opacity = '';
            ghost.remove();
            activeItems.forEach(({ el }) => {
                el.style.transition = '';
                el.style.transform = '';
                el.style.opacity = '';
            });
            this._isTransitioning = false;
            if (this._transitionCleanup === cleanup) {
                this._transitionCleanup = null;
            }
        };
        this._transitionCleanup = cleanup;

        const startFlip = () => {
            if (cleaned) return;

            fromContent.style.display = 'none';
            toContent.style.display = 'flex';
            toContent.style.opacity = '';

            if (isForward) {
                this._initStep2();
                this._applyZoom();
            }

            targetEl = isForward
                ? toContent.querySelector('.trombi-content-wrapper')
                : toContent.querySelector('#trombiPreviewImg, .drop-zone-image');

            if (targetEl && !isForward) {
                targetEl.classList.remove('is-revealing');
            }

            const targetRect = targetEl?.getBoundingClientRect();
            if (!targetRect || targetRect.width === 0 || targetRect.height === 0) {
                cleanup();
                return;
            }

            // Pre-decode destination image while it glides behind the ghost so revealing it at the end is instantaneous
            const targetImg = targetEl.tagName === 'IMG' ? targetEl : targetEl.querySelector('img');
            targetImg?.decode?.().catch(() => {});

            targetEl.style.opacity = '0';

            const slideElements = isForward
                ? [
                    { el: toContent.querySelector('.trombi-assignment-panel'), fromTransform: 'translateX(28px)', isSlide: true },
                    { el: toContent.querySelector('.trombi-zoom-controls') },
                    { el: toContent.querySelector('#trombiPageSelectorBar'), skipIfHidden: true },
                    { el: toContent.querySelector('.grid-control-panel') }
                ]
                : [
                    { el: toContent.querySelector('.wizard-guide-panel'), fromTransform: 'translateX(-24px)', isSlide: true },
                    { el: toContent.querySelector('#trombiRemoveImageBtn') },
                    { el: toContent.querySelector('#trombiStep1PageSelectorBar'), skipIfHidden: true }
                ];

            activeItems = slideElements.filter(item => {
                if (!item.el) return false;
                if (item.skipIfHidden && item.el.style.display === 'none') return false;
                return true;
            });

            activeItems.forEach(({ el, fromTransform }) => {
                if (fromTransform) el.style.transform = fromTransform;
                el.style.opacity = '0';
            });

            // Position ghost at targetRect and invert back to sourceRect for GPU-only transform animation
            const dx = sourceRect.left - targetRect.left;
            const dy = sourceRect.top - targetRect.top;
            const sx = sourceRect.width / targetRect.width;
            const sy = sourceRect.height / targetRect.height;

            ghost.style.transition = 'none';
            ghost.style.top = `${targetRect.top}px`;
            ghost.style.left = `${targetRect.left}px`;
            ghost.style.width = `${targetRect.width}px`;
            ghost.style.height = `${targetRect.height}px`;
            ghost.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`;
            if (clipInsets) {
                ghost.style.clipPath = `inset(${clipInsets.top / sy}px ${clipInsets.right / sx}px ${clipInsets.bottom / sy}px ${clipInsets.left / sx}px round var(--radius-sm, 6px))`;
            }

            void ghost.offsetWidth;

            rafId = requestAnimationFrame(() => {
                rafId = null;
                if (cleaned) return;
                const duration = '0.36s';
                const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
                const clipTransition = clipInsets ? `, clip-path ${duration} ${easing}` : '';

                ghost.addEventListener('transitionend', onTransitionEnd);
                ghost.style.transition = `transform ${duration} ${easing}${clipTransition}`;
                ghost.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
                if (clipInsets) {
                    ghost.style.clipPath = 'inset(0px 0px 0px 0px round var(--radius-sm, 6px))';
                }

                activeItems.forEach(({ el, isSlide }) => {
                    if (isSlide) {
                        el.style.transition = `opacity ${duration} ${easing}, transform ${duration} ${easing}`;
                        el.style.transform = 'translateX(0)';
                    } else {
                        el.style.transition = 'opacity 0.28s ease 0.08s';
                    }
                    el.style.opacity = '1';
                });

                timerId = setTimeout(cleanup, 420);
            });
        };

        if (typeof ghostImg.decode === 'function') {
            ghostImg.decode().then(startFlip, startFlip);
        } else {
            startFlip();
        }
    },

    _animateGenericTransition(fromContent, toContent, direction, toStep) {
        this._isTransitioning = true;
        const offset = direction === 'forward' ? -24 : 24;

        let timerOut = null;
        let timerIn = null;
        let raf1 = null;
        let raf2 = null;
        let cleaned = false;

        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            if (timerOut !== null) clearTimeout(timerOut);
            if (timerIn !== null) clearTimeout(timerIn);
            if (raf1 !== null) cancelAnimationFrame(raf1);
            if (raf2 !== null) cancelAnimationFrame(raf2);
            [fromContent, toContent].forEach(el => {
                el.style.transition = '';
                el.style.transform = '';
                el.style.opacity = '';
            });
            this._isTransitioning = false;
            if (this._transitionCleanup === cleanup) {
                this._transitionCleanup = null;
            }
        };
        this._transitionCleanup = cleanup;

        fromContent.style.transition = 'opacity 0.2s cubic-bezier(0.32, 0.72, 0, 1), transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)';
        fromContent.style.opacity = '0';
        fromContent.style.transform = `translateX(${offset}px)`;

        timerOut = setTimeout(() => {
            timerOut = null;
            if (cleaned) return;

            fromContent.style.display = 'none';
            fromContent.style.transform = '';
            fromContent.style.opacity = '';
            fromContent.style.transition = '';

            toContent.style.display = 'flex';
            toContent.style.opacity = '0';
            toContent.style.transform = `translateX(${-offset}px)`;

            if (toStep === 2) {
                this._initStep2();
            } else if (toStep === 3) {
                this._initStep3();
            }

            void toContent.offsetWidth;

            raf1 = requestAnimationFrame(() => {
                raf1 = null;
                raf2 = requestAnimationFrame(() => {
                    raf2 = null;
                    if (cleaned) return;
                    toContent.style.transition = 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
                    toContent.style.opacity = '1';
                    toContent.style.transform = 'translateX(0)';

                    if (toStep === 3) {
                        this._animateStepChildren(toContent, 3);
                    }

                    timerIn = setTimeout(cleanup, 300);
                });
            });
        }, 200);
    },

    _animateStepChildren(container, step) {
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
        const canGoToStep2 = Boolean(this._imageSrc || this._parsedPdfData);
        document.querySelectorAll('#trombiWizardModal .ui-stepper-step').forEach(el => {
            const stepNum = parseInt(el.dataset.step, 10);
            const isActive = stepNum === this._currentStep;
            el.classList.remove('active', 'completed', 'clickable');
            if (isActive) {
                el.classList.add('active');
            } else if (stepNum < this._currentStep) {
                el.classList.add('completed', 'clickable');
            } else if (stepNum === 2 && this._currentStep === 1 && canGoToStep2) {
                el.classList.add('clickable');
            } else if (stepNum === 3 && this._currentStep === 2) {
                el.classList.add('clickable');
            }
            const isClickable = el.classList.contains('clickable');
            if (isActive) {
                el.setAttribute('aria-current', 'step');
            } else {
                el.removeAttribute('aria-current');
            }
            el.setAttribute('aria-disabled', (!isActive && !isClickable) ? 'true' : 'false');
            el.setAttribute('tabindex', isClickable ? '0' : '-1');
        });
    },

    // ========================================================================
    // DELEGATIONS TO SUB-MODULES
    // ========================================================================

    // --- TrombiPdfLoader ---
    _loadFile(file) { return TrombiPdfLoader.loadFile(this, file); },
    _canvasToImageUrl(canvas, quality = 0.9) { return TrombiPdfLoader.canvasToImageUrl(this, canvas, quality); },
    _canvasToDataUrlAsync(canvas, quality = 0.85) { return TrombiPdfLoader.canvasToDataUrlAsync(this, canvas, quality); },
    _loadPdf(file) { return TrombiPdfLoader.loadPdf(this, file); },
    _previewPdfPageInStep1(pageIndex) { return TrombiPdfLoader.previewPdfPageInStep1(this, pageIndex); },
    _switchPdfPage(pageIndex) { return TrombiPdfLoader.switchPdfPage(this, pageIndex); },
    _loadImageFromUrl(url) { return TrombiPdfLoader.loadImageFromUrl(this, url); },
    _displayImagePreview() { return TrombiPdfLoader.displayImagePreview(this); },
    _removeImage() { return TrombiPdfLoader.removeImage(this); },
    _loadImage(src) { return TrombiPdfLoader.loadImage(src); },

    // --- TrombiGridDetector ---
    _createDefaultGrid() { return TrombiGridDetector.createDefaultGrid(this); },
    _detectGridFromImage() { return TrombiGridDetector.detectGridFromImage(this); },
    _calibrateAxisFromSegments(segments, count, size, naturalSpan) { return TrombiGridDetector.calibrateAxisFromSegments(segments, count, size, naturalSpan); },
    _analyzeProjection(gray, size, axis) { return TrombiGridDetector.analyzeProjection(gray, size, axis); },

    // --- TrombiViewportZoom ---
    _getPageOffset(pageIndex = this._currentPageIndex) { return TrombiViewportZoom.getPageOffset(this, pageIndex); },
    _getViewportFitMetrics(viewport) { return TrombiViewportZoom.getViewportFitMetrics(this, viewport); },
    _applyZoom(scrollOptions = null, domRefs = null) { return TrombiViewportZoom.applyZoom(this, scrollOptions, domRefs); },
    _setZoomLevel(nextZoom, options = {}) { return TrombiViewportZoom.setZoomLevel(this, nextZoom, options); },
    _animateSheetFLIP(rBefore, options = {}, wrapperEl = null) { return TrombiViewportZoom.animateSheetFLIP(this, rBefore, options, wrapperEl); },
    _zoomIn() { return TrombiViewportZoom.zoomIn(this); },
    _zoomOut() { return TrombiViewportZoom.zoomOut(this); },
    _zoomReset() { return TrombiViewportZoom.zoomReset(this); },
    _zoomToggleFit() { return TrombiViewportZoom.zoomToggleFit(this); },
    _initStep2() { return TrombiViewportZoom.initStep2(this); },

    // --- TrombiZoneEditor ---
    _setupControlPanel(options) { return TrombiZoneEditor.setupControlPanel(this, options); },
    _syncSlidersToState() { return TrombiZoneEditor.syncSlidersToState(this); },
    _applyGaps() { return TrombiZoneEditor.applyGaps(this); },
    _applyGapsInternal(baseCellW, baseCellH) { return TrombiZoneEditor.applyGapsInternal(this, baseCellW, baseCellH); },
    _updateSizeFromPercent(percent) { return TrombiZoneEditor.updateSizeFromPercent(this, percent); },
    _createGrid(cols, rows, preserveReference = false, silent = false, initialRef = null) { return TrombiZoneEditor.createGrid(this, cols, rows, preserveReference, silent, initialRef); },
    _createGridSilent(cols, rows, initialRef = null) { return TrombiZoneEditor.createGridSilent(this, cols, rows, initialRef); },
    _updateSizeSliderValue() { return TrombiZoneEditor.updateSizeSliderValue(this); },
    _addZoneAtClick(e) { return TrombiZoneEditor.addZoneAtClick(this, e); },
    _removeZone(zoneId) { return TrombiZoneEditor.removeZone(this, zoneId); },
    _renderZones(explicitW, explicitH) { return TrombiZoneEditor.renderZones(this, explicitW, explicitH); },
    _handleZoneMouseDown(e) { return TrombiZoneEditor.handleZoneMouseDown(this, e); },
    _handleMouseMove(e) { return TrombiZoneEditor.handleMouseMove(this, e); },
    _updateSelectionBox(e) { return TrombiZoneEditor.updateSelectionBox(this, e); },
    _handleMouseUp() { return TrombiZoneEditor.handleMouseUp(this); },
    _updateGroupedDragState() { return TrombiZoneEditor.updateGroupedDragState(this); },
    _handleKeyDown(e) { return TrombiZoneEditor.handleKeyDown(this, e); },
    _clearZoneSelection() { return TrombiZoneEditor.clearZoneSelection(this); },
    _selectSingleZone(zoneId, scroll = false) { return TrombiZoneEditor.selectSingleZone(this, zoneId, scroll); },
    _highlightZone(zoneId) { return TrombiZoneEditor.highlightZone(this, zoneId); },
    _getCurrentStateSnapshot() { return TrombiZoneEditor.getCurrentStateSnapshot(this); },
    _saveState(snapshot) { return TrombiZoneEditor.saveState(this, snapshot); },
    _undo() { return TrombiZoneEditor.undo(this); },
    _redo() { return TrombiZoneEditor.redo(this); },
    _applyHistorySnapshot(state) { return TrombiZoneEditor.applyHistorySnapshot(this, state); },
    _updateUndoButton() { return TrombiZoneEditor.updateUndoButton(this); },
    _saveStateForNudge() { return TrombiZoneEditor.saveStateForNudge(this); },

    // --- TrombiStudentMatcher ---
    _getSampleFallbackStudents() { return TrombiStudentMatcher.getSampleFallbackStudents(); },
    _getTargetClassInfo() { return TrombiStudentMatcher.getTargetClassInfo(this); },
    _getStudentsForImport() { return TrombiStudentMatcher.getStudentsForImport(this); },
    _autoAssignSilent(silent = false) { return TrombiStudentMatcher.autoAssignSilent(this, silent); },
    _insertGapAndShiftDown(zoneId) { return TrombiStudentMatcher.insertGapAndShiftDown(this, zoneId); },
    _removeAndShiftUp(zoneId) { return TrombiStudentMatcher.removeAndShiftUp(this, zoneId); },
    _isAutoAssignedInOrder(sortedZones) { return TrombiStudentMatcher.isAutoAssignedInOrder(this, sortedZones); },
    _autoAssignInOrder() { return TrombiStudentMatcher.autoAssignInOrder(this); },
    _getAssignmentContext() { return TrombiStudentMatcher.getAssignmentContext(this); },
    _getAssignedZoneNumber(studentId, excludeZoneId, sortedZones) { return TrombiStudentMatcher.getAssignedZoneNumber(this, studentId, excludeZoneId, sortedZones); },
    _assignStudentToZone(zoneId, studentId) { return TrombiStudentMatcher.assignStudentToZone(this, zoneId, studentId); },
    _closeStudentPopover(restoreFocus = false, options = {}) { return TrombiStudentMatcher.closeStudentPopover(this, restoreFocus, options); },
    _toggleStudentPopover(zoneId, triggerBtn) { return TrombiStudentMatcher.toggleStudentPopover(this, zoneId, triggerBtn); },
    _openStudentPopover(zoneId, triggerBtn) { return TrombiStudentMatcher.openStudentPopover(this, zoneId, triggerBtn); },
    _renderAssignmentGrid() { return TrombiStudentMatcher.renderAssignmentGrid(this); },
    _highlightAssignmentRow(zoneId, scroll = true) { return TrombiStudentMatcher.highlightAssignmentRow(this, zoneId, scroll); },

    // --- TrombiCropExporter ---
    _updateLivePreviews() { return TrombiCropExporter.updateLivePreviews(this); },
    _initStep3() { return TrombiCropExporter.initStep3(this); },
    _drawPreview(canvas, zone, pageIndex = 0) { return TrombiCropExporter.drawPreview(this, canvas, zone, pageIndex); },
    _confirmImport() { return TrombiCropExporter.confirmImport(this); },
    _handleImport() { return TrombiCropExporter.handleImport(this); }
};
