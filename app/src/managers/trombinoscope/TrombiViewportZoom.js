/**
 * @fileoverview TrombiViewportZoom — Moteur de zoom/panoramique matriciel, FLIP et initialisation Étape 2
 * Extrait de TrombinoscopeManager.js (Lot 12 — Découpage God Object #2)
 * @module managers/trombinoscope/TrombiViewportZoom
 */

import { UI } from '../UIManager.js';

export const TrombiViewportZoom = {
    getPageOffset(manager, pageIndex = manager._currentPageIndex) {
        if (!manager._parsedPdfData?.pages || pageIndex <= 0) return 0;
        let offset = 0;
        for (let i = 0; i < pageIndex; i++) {
            const page = manager._parsedPdfData.pages[i];
            offset += (page.zones?.length ?? page.studentsCount ?? 0);
        }
        return offset;
    },

    getViewportFitMetrics(manager, viewport) {
        const cs = window.getComputedStyle ? window.getComputedStyle(viewport) : null;
        const padX = cs ? ((parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)) : 0;
        const padY = cs ? ((parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)) : 0;
        const totalPadX = Math.max(32, padX);
        const totalPadY = Math.max(32, padY);

        // Use outer layout dimensions (offsetWidth/offsetHeight) first so the 100% baseline
        // never fluctuates or oscillates when scrollbars appear/disappear in zoomed mode
        const rawW = viewport.offsetWidth || viewport.clientWidth || 0;
        const rawH = viewport.offsetHeight || viewport.clientHeight || 0;
        const vpW = rawW || 600;
        const vpH = rawH || 600;
        const availW = Math.max(100, vpW - totalPadX);
        const availH = Math.max(100, vpH - totalPadY);
        const scaleToFit = Math.min(availW / manager._imageNaturalWidth, availH / manager._imageNaturalHeight);
        return { rawW, rawH, availW, availH, scaleToFit };
    },

    applyZoom(manager, scrollOptions = null, domRefs = null) {
        const viewport = domRefs?.viewport ?? document.querySelector('.trombi-viewport');
        const wrapper = domRefs?.wrapper ?? document.querySelector('.trombi-content-wrapper');
        const currentPct = Math.round(manager._zoomLevel * 100);
        const isZoomed = manager._zoomLevel > 1.0;

        const zoomLabel = document.getElementById('trombiZoomLevel');
        if (zoomLabel) {
            zoomLabel.textContent = `${currentPct}%`;
        }
        const zoomFitBtn = document.getElementById('trombiZoomFitBtn');
        if (zoomFitBtn) {
            const nextLabel = isZoomed ? `Ajuster à 100% (actuel : ${currentPct}%)` : 'Pleine largeur / Vue complète';
            const nextIcon = isZoomed ? 'ph:arrows-in-simple' : 'ph:arrows-out-simple';
            const iconEl = zoomFitBtn.querySelector('iconify-icon');
            if (iconEl && iconEl.getAttribute('icon') !== nextIcon) {
                iconEl.setAttribute('icon', nextIcon);
                zoomFitBtn.classList.remove('zoom-icon-pop');
                void zoomFitBtn.offsetWidth;
                zoomFitBtn.classList.add('zoom-icon-pop');
            }
            zoomFitBtn.setAttribute('aria-label', nextLabel);
            if (zoomFitBtn.getAttribute('data-tooltip') !== nextLabel) {
                if (typeof UI?.updateTooltip === 'function') {
                    UI.updateTooltip(zoomFitBtn, nextLabel);
                } else {
                    zoomFitBtn.setAttribute('data-tooltip', nextLabel);
                }
            }
        }
        const zoomOutBtn = document.getElementById('trombiZoomOutBtn');
        if (zoomOutBtn) {
            const isMin = manager._zoomLevel <= 1.0;
            zoomOutBtn.disabled = isMin;
            zoomOutBtn.classList.toggle('disabled', isMin);
        }
        const zoomInBtn = document.getElementById('trombiZoomInBtn');
        if (zoomInBtn) {
            const isMax = manager._zoomLevel >= 2.5;
            zoomInBtn.disabled = isMax;
            zoomInBtn.classList.toggle('disabled', isMax);
        }
        if (!viewport || !wrapper || !manager._imageNaturalWidth || !manager._imageNaturalHeight) return;

        // Reserve space for the floating drawer via viewport bottom padding (clips at outer padding box)
        const advancedDrawer = document.getElementById('gridAdvancedControls');
        if (advancedDrawer?.classList.contains('is-open')) {
            const drawerH = advancedDrawer.offsetHeight || 68;
            const nextPadBottom = `${16 + drawerH}px`;
            if (viewport.style.paddingBottom !== nextPadBottom) {
                viewport.style.paddingBottom = nextPadBottom;
            }
        } else if (viewport.style.paddingBottom) {
            viewport.style.removeProperty('padding-bottom');
        }

        // Toggle is-zoomed class: scrollbars are ONLY permitted when zoomed in > 100%
        viewport.classList.toggle('is-zoomed', isZoomed);

        const { rawW, rawH, scaleToFit } = manager._getViewportFitMetrics(viewport);
        manager._lastViewportW = rawW;
        manager._lastViewportH = rawH;
        const baseW = manager._imageNaturalWidth * scaleToFit;
        const baseH = manager._imageNaturalHeight * scaleToFit;

        // Use Math.floor when fitting to strictly ensure wrapper never exceeds available space
        const targetW = !isZoomed ? Math.floor(baseW) : Math.round(baseW * manager._zoomLevel);
        const targetH = !isZoomed ? Math.floor(baseH) : Math.round(baseH * manager._zoomLevel);

        const prevW = parseFloat(wrapper.style.width) || 0;
        const prevH = parseFloat(wrapper.style.height) || 0;
        const widthChanged = prevW !== targetW;
        const heightChanged = prevH !== targetH;

        wrapper.style.aspectRatio = `${manager._imageNaturalWidth} / ${manager._imageNaturalHeight}`;
        if (widthChanged) wrapper.style.width = `${targetW}px`;
        if (heightChanged) wrapper.style.height = `${targetH}px`;

        const overlay = document.getElementById('trombiZonesOverlay');
        if (widthChanged || heightChanged || !overlay || overlay.children.length !== manager._zones.length) {
            manager._renderZones(targetW, targetH);
        }

        if (!isZoomed) {
            viewport.scrollLeft = 0;
            viewport.scrollTop = 0;
        } else if (scrollOptions) {
            const maxScrollX = Math.max(0, (viewport.scrollWidth || 0) - (viewport.clientWidth || 0));
            const maxScrollY = Math.max(0, (viewport.scrollHeight || 0) - (viewport.clientHeight || 0));
            if (typeof scrollOptions.clientX === 'number' && typeof scrollOptions.relX === 'number') {
                const wRectAfter = (widthChanged || heightChanged) ? wrapper.getBoundingClientRect?.() : null;
                if (wRectAfter && wRectAfter.width > 0 && wRectAfter.height > 0) {
                    if (widthChanged && maxScrollX > 0) {
                        const afterX = wRectAfter.left + scrollOptions.relX * wRectAfter.width;
                        viewport.scrollLeft = Math.max(0, Math.min(maxScrollX, Math.round(viewport.scrollLeft + (afterX - scrollOptions.clientX))));
                    }
                    if (heightChanged && maxScrollY > 0) {
                        const afterY = wRectAfter.top + scrollOptions.relY * wRectAfter.height;
                        viewport.scrollTop = Math.max(0, Math.min(maxScrollY, Math.round(viewport.scrollTop + (afterY - scrollOptions.clientY))));
                    }
                }
            } else {
                if (maxScrollX > 0) viewport.scrollLeft = Math.round(maxScrollX * (scrollOptions.ratioX ?? 0.5));
                if (maxScrollY > 0) viewport.scrollTop = Math.round(maxScrollY * (scrollOptions.ratioY ?? 0.5));
            }
        }
    },

    setZoomLevel(manager, nextZoom, options = {}) {
        const shouldAnimate = options.animate !== false;
        const precision = shouldAnimate ? 100 : 1000;
        const clamped = Math.min(2.5, Math.max(1.0, Math.round(nextZoom * precision) / precision));
        const zoomChanged = Math.abs(clamped - manager._zoomLevel) >= 0.0005;

        const viewport = document.querySelector('.trombi-viewport');
        const wrapper = document.querySelector('.trombi-content-wrapper');
        const focal = options.focalPoint;
        const hasFocalPoint = Boolean(focal && typeof focal.clientX === 'number' && typeof focal.clientY === 'number');
        const wRectBefore = (zoomChanged && (shouldAnimate || hasFocalPoint) && wrapper)
            ? wrapper.getBoundingClientRect?.()
            : null;

        if (zoomChanged && manager._zoomAnimCleanup) {
            manager._zoomAnimCleanup();
            manager._zoomAnimCleanup = null;
        }

        let scrollOptions = null;
        if (zoomChanged) {
            if (hasFocalPoint && wRectBefore && wRectBefore.width > 0 && wRectBefore.height > 0) {
                scrollOptions = {
                    clientX: focal.clientX,
                    clientY: focal.clientY,
                    relX: Math.max(0, Math.min(1, (focal.clientX - wRectBefore.left) / wRectBefore.width)),
                    relY: Math.max(0, Math.min(1, (focal.clientY - wRectBefore.top) / wRectBefore.height))
                };
            } else {
                let ratioX = 0.5;
                let ratioY = 0.5;
                if (viewport && manager._zoomLevel > 1.0) {
                    const maxScrollXBefore = Math.max(0, (viewport.scrollWidth || 0) - (viewport.clientWidth || 0));
                    const maxScrollYBefore = Math.max(0, (viewport.scrollHeight || 0) - (viewport.clientHeight || 0));
                    if (maxScrollXBefore > 0) ratioX = viewport.scrollLeft / maxScrollXBefore;
                    if (maxScrollYBefore > 0) ratioY = viewport.scrollTop / maxScrollYBefore;
                }
                scrollOptions = { ratioX, ratioY };
            }
        }

        manager._zoomLevel = clamped;
        manager._applyZoom(scrollOptions, { viewport, wrapper });

        if (zoomChanged && shouldAnimate && wRectBefore && wRectBefore.width > 0) {
            manager._animateSheetFLIP(wRectBefore, options, wrapper);
        }
    },

    animateSheetFLIP(manager, rBefore, options = {}, wrapperEl = null) {
        const wrapper = wrapperEl ?? document.querySelector('.trombi-content-wrapper');
        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        if (!wrapper || !rBefore || rBefore.width <= 0 || prefersReducedMotion) {
            return;
        }

        if (manager._zoomAnimCleanup) {
            manager._zoomAnimCleanup();
            manager._zoomAnimCleanup = null;
        }

        const rAfter = wrapper.getBoundingClientRect?.();
        if (!rAfter || rAfter.width <= 0 || rAfter.height <= 0) {
            return;
        }

        const centerBeforeX = rBefore.left + rBefore.width / 2;
        const centerBeforeY = rBefore.top + rBefore.height / 2;
        const centerAfterX = rAfter.left + rAfter.width / 2;
        const centerAfterY = rAfter.top + rAfter.height / 2;

        const dx = Math.round((centerBeforeX - centerAfterX) * 100) / 100;
        const dy = Math.round((centerBeforeY - centerAfterY) * 100) / 100;
        const sx = Math.round((rBefore.width / rAfter.width) * 10000) / 10000;
        const sy = Math.round((rBefore.height / rAfter.height) * 10000) / 10000;

        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005) {
            return;
        }

        wrapper.style.willChange = 'transform';
        wrapper.style.transformOrigin = '50% 50%';
        wrapper.style.transition = 'none';
        wrapper.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`;

        void wrapper.offsetWidth;
        if (typeof window.getComputedStyle === 'function') {
            void window.getComputedStyle(wrapper).transform;
        }

        const duration = options.duration || 360;
        const easing = options.easing || 'cubic-bezier(0.22, 1, 0.36, 1)';
        wrapper.style.transition = `transform ${duration}ms ${easing}`;
        wrapper.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';

        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            clearTimeout(timer);
            wrapper.removeEventListener('transitionend', onEnd);
            wrapper.style.removeProperty('transition');
            wrapper.style.removeProperty('transform');
            wrapper.style.removeProperty('transform-origin');
            wrapper.style.removeProperty('will-change');
            if (manager._zoomAnimCleanup === cleanup) {
                manager._zoomAnimCleanup = null;
            }
        };
        const onEnd = (e) => {
            if (e.target === wrapper && e.propertyName === 'transform') {
                cleanup();
            }
        };
        wrapper.addEventListener('transitionend', onEnd);
        const timer = setTimeout(cleanup, duration + 60);
        manager._zoomAnimCleanup = cleanup;
    },

    zoomIn(manager) {
        manager._setZoomLevel(manager._zoomLevel + 0.25);
    },

    zoomOut(manager) {
        manager._setZoomLevel(manager._zoomLevel - 0.25);
    },

    zoomReset(manager) {
        manager._setZoomLevel(1.0);
    },

    zoomToggleFit(manager) {
        let targetZoom = 1.0;
        if (manager._zoomLevel === 1.0) {
            const viewport = document.querySelector('.trombi-viewport');
            if (viewport && manager._imageNaturalWidth && manager._imageNaturalHeight) {
                const { availW, scaleToFit } = manager._getViewportFitMetrics(viewport);
                const fitW = manager._imageNaturalWidth * scaleToFit;
                // Reserve width for the vertical scrollbar (6px custom scrollbar + 2px subpixel margin)
                // so fitting to width never overflows horizontally when vertical scroll activates
                const scrollbarW = Math.max(8, (viewport.offsetWidth - viewport.clientWidth) || 0);
                const fitWidthAvailW = Math.max(100, availW - scrollbarW);
                if (fitWidthAvailW > fitW * 1.05) {
                    targetZoom = Math.min(2.5, Math.floor((fitWidthAvailW / fitW) * 100) / 100);
                } else {
                    targetZoom = 1.5;
                }
            } else {
                targetZoom = 1.5;
            }
        }
        manager._setZoomLevel(targetZoom);
    },

    initStep2(manager) {
        const imagePanel = document.getElementById('trombiImageWithZones');
        if (!imagePanel) return;

        if (manager._step2AbortController) {
            manager._step2AbortController.abort();
        }
        manager._step2AbortController = new AbortController();
        const { signal: step2Signal } = manager._step2AbortController;

        // Invalidate cached preview image
        manager._cachedImage = null;

        // Manage exclude-photos toggle visibility and smart auto-fallback:
        // - Hide during PDF import or when no student in the class has a photo yet
        // - Automatically uncheck if 100% of students already have a photo so the list is never empty on open
        const excludeWrapper = document.getElementById('trombiExcludeToggleWrapper');
        const excludeInput = document.getElementById('trombiExcludeWithPhotos');
        if (manager._parsedPdfData) {
            if (excludeWrapper) excludeWrapper.style.display = 'none';
        } else {
            const classStudents = manager._getTargetClassInfo().existingClassStudents;
            const withPhotosCount = classStudents.filter(s => Boolean(s.studentPhoto?.data)).length;
            const withoutPhotosCount = classStudents.length - withPhotosCount;
            if (excludeInput && !manager._userToggledExcludeFilter) {
                if (classStudents.length > 0 && withoutPhotosCount === 0) {
                    excludeInput.checked = false;
                } else {
                    excludeInput.checked = true;
                }
            }
            if (excludeWrapper) {
                excludeWrapper.style.display = withPhotosCount > 0 ? 'flex' : 'none';
            }
        }

        // Setup page selector bar if PDF has multiple pages
        const pageBar = document.getElementById('trombiPageSelectorBar');
        if (pageBar) {
            if (manager._parsedPdfData && manager._parsedPdfData.numPages > 1) {
                pageBar.style.display = 'flex';
                pageBar.innerHTML = manager._parsedPdfData.pages.map((p, idx) => {
                    const pageLabel = `Page ${idx + 1} (${p.studentsCount} élève${p.studentsCount > 1 ? 's' : ''})`;
                    return `
                    <button type="button" class="page-tab-btn ${idx === manager._currentPageIndex ? 'active' : ''}" data-page-index="${idx}" aria-label="${pageLabel}" data-tooltip="${pageLabel}">
                        <span>Page ${idx + 1}</span>
                        <span class="page-tab-sep" aria-hidden="true">·</span>
                        <span class="page-tab-count">${p.studentsCount} élève${p.studentsCount > 1 ? 's' : ''}</span>
                    </button>
                `;
                }).join('');

                pageBar.querySelectorAll('.page-tab-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const targetIdx = parseInt(btn.dataset.pageIndex, 10);
                        if (targetIdx !== manager._currentPageIndex) {
                            manager._switchPdfPage(targetIdx);
                        }
                    }, { signal: step2Signal });
                });
            } else {
                pageBar.style.display = 'none';
                pageBar.innerHTML = '';
            }
        }

        // Initialize zones synchronously if PDF data is present
        if (manager._parsedPdfData) {
            const currentPage = manager._parsedPdfData.pages[manager._currentPageIndex];
            if (currentPage && currentPage.zones) {
                manager._zones = currentPage.zones.map(z => ({ ...z }));
                if (manager._zones.length > 0 && manager._zones[0].r) {
                    manager._globalRadius = manager._zones[0].r;
                }
            }
            manager._isNewUpload = false;
        }

        // Setup image with overlay - wrapped in a container for correct aspect ratio positioning
        imagePanel.innerHTML = `
            <div class="trombi-zoom-controls">
                <button type="button" class="zoom-btn" id="trombiZoomOutBtn" aria-label="Dézoomer (-25%)" data-tooltip="Dézoomer (-25%)">
                    <iconify-icon icon="ph:minus"></iconify-icon>
                </button>
                <button type="button" class="zoom-btn" id="trombiZoomInBtn" aria-label="Zoomer (+25%)" data-tooltip="Zoomer (+25%)">
                    <iconify-icon icon="ph:plus"></iconify-icon>
                </button>
                <button type="button" class="zoom-btn" id="trombiZoomFitBtn" aria-label="Pleine largeur / Vue complète" data-tooltip="Pleine largeur / Vue complète">
                    <iconify-icon icon="ph:arrows-out-simple"></iconify-icon>
                </button>
                <button type="button" class="zoom-btn zoom-value-btn" id="trombiZoomResetBtn" style="display: none;" aria-hidden="true" data-tooltip="Réinitialiser le zoom (100%)">
                    <span id="trombiZoomLevel">${Math.round(manager._zoomLevel * 100)}%</span>
                </button>
            </div>
            <div class="trombi-viewport">
                <div class="trombi-content-wrapper" style="width: 0px; height: 0px; aspect-ratio: ${manager._imageNaturalWidth} / ${manager._imageNaturalHeight};">
                    <img src="${manager._imageSrc}" alt="Trombinoscope" class="trombi-image" id="trombiStep2Image" draggable="false">
                    <div class="trombi-zones-overlay" id="trombiZonesOverlay"></div>
                </div>
            </div>
        `;

        // Setup control panel first so its height is accounted for in viewport layout before measuring zoom fit
        manager._setupControlPanel();

        // Bind zoom controls
        document.getElementById('trombiZoomInBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            manager._zoomIn();
        }, { signal: step2Signal });
        document.getElementById('trombiZoomOutBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            manager._zoomOut();
        }, { signal: step2Signal });
        document.getElementById('trombiZoomResetBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            manager._zoomReset();
        }, { signal: step2Signal });
        document.getElementById('trombiZoomFitBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            manager._zoomToggleFit();
        }, { signal: step2Signal });

        const img = document.getElementById('trombiStep2Image');
        const handleImageReady = () => {
            if (manager._parsedPdfData) {
                const currentPage = manager._parsedPdfData.pages[manager._currentPageIndex];
                if (currentPage && currentPage.zones && manager._zones.length === 0) {
                    manager._zones = currentPage.zones.map(z => ({ ...z }));
                    if (manager._zones.length > 0 && manager._zones[0].r) {
                        manager._globalRadius = manager._zones[0].r;
                    }
                }
                manager._isNewUpload = false;
            } else if (manager._isNewUpload || manager._zones.length === 0) {
                manager._zones = []; // Clear previous zones
                manager._createDefaultGrid();
                manager._isNewUpload = false; // Reset upload flag
            }
            manager._applyZoom();
        };

        if (img.complete && img.naturalWidth > 0) {
            handleImageReady();
        } else {
            img.onload = handleImageReady;
        }

        // Observer for layout changes on the viewport
        const viewport = imagePanel?.querySelector('.trombi-viewport');
        if (manager._viewportResizeObserver) manager._viewportResizeObserver.disconnect();

        manager._viewportResizeObserver = new ResizeObserver(() => {
            const vpW = viewport?.offsetWidth || viewport?.clientWidth || 0;
            const vpH = viewport?.offsetHeight || viewport?.clientHeight || 0;
            if (vpW === manager._lastViewportW && vpH === manager._lastViewportH) return;
            if (manager._viewportResizeRaf) cancelAnimationFrame(manager._viewportResizeRaf);
            manager._viewportResizeRaf = window.requestAnimationFrame(() => {
                manager._viewportResizeRaf = null;
                manager._applyZoom();
            });
        });
        if (viewport) {
            manager._viewportResizeObserver.observe(viewport);
        }

        // Click and drag selection / add zone on overlay/viewport
        const overlay = document.getElementById('trombiZonesOverlay');

        const zoomHost = imagePanel.closest('.trombi-image-panel') || viewport;
        if (manager._wheelZoomHost && manager._wheelZoomHandler) {
            manager._wheelZoomHost.removeEventListener('wheel', manager._wheelZoomHandler);
        }
        manager._wheelZoomHost = zoomHost;
        manager._wheelZoomHandler = (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            if (!e.deltaY) return;

            let dy = e.deltaY;
            if (e.deltaMode === 1) dy *= 16;
            else if (e.deltaMode === 2) dy *= 400;
            dy = Math.max(-100, Math.min(100, dy));

            // Smooth exponential scaling for trackpad pinch and Ctrl+wheel without FLIP snap-back
            const factor = Math.exp(-dy * 0.004);
            manager._setZoomLevel(manager._zoomLevel * factor, {
                animate: false,
                focalPoint: { clientX: e.clientX, clientY: e.clientY }
            });
        };
        zoomHost?.addEventListener('wheel', manager._wheelZoomHandler, { passive: false, signal: step2Signal });

        let touchPinchStartDist = 0;
        let touchPinchStartZoom = 1.0;
        viewport?.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                if (e.cancelable) e.preventDefault();
                manager._selectionBox = null;
                manager._selectionBoxDragActive = false;
                const [t1, t2] = e.touches;
                touchPinchStartDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
                touchPinchStartZoom = manager._zoomLevel;
            }
        }, { passive: false, signal: step2Signal });

        viewport?.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && touchPinchStartDist > 10) {
                if (e.cancelable) e.preventDefault();
                const [t1, t2] = e.touches;
                const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
                const midX = (t1.clientX + t2.clientX) / 2;
                const midY = (t1.clientY + t2.clientY) / 2;
                manager._setZoomLevel(touchPinchStartZoom * (dist / touchPinchStartDist), {
                    animate: false,
                    focalPoint: { clientX: midX, clientY: midY }
                });
            }
        }, { passive: false, signal: step2Signal });

        const resetTouchPinch = (e) => {
            if (!e.touches || e.touches.length < 2) {
                touchPinchStartDist = 0;
            }
        };
        viewport?.addEventListener('touchend', resetTouchPinch, { passive: true, signal: step2Signal });
        viewport?.addEventListener('touchcancel', resetTouchPinch, { passive: true, signal: step2Signal });

        viewport?.addEventListener('mousedown', e => {
            // Start selection box only if clicking background viewport or overlay (not a zone)
            if (!e.target.closest('.trombi-zone') && !e.target.closest('.zone-delete')) {
                e.preventDefault();
                manager._selectionBox = {
                    startX: e.clientX,
                    startY: e.clientY,
                    isActive: false,
                    viewportRect: viewport.getBoundingClientRect()
                };
                manager._selectionBoxDragActive = false;
            }
        }, { signal: step2Signal });

        overlay?.addEventListener('click', e => {
            if (e.target === overlay) {
                if (manager._selectionBoxDragActive) {
                    return;
                }
                manager._addZoneAtClick(e);
            }
        }, { signal: step2Signal });

        // Render student assignment grid
        manager._renderAssignmentGrid();

        manager._updateUndoButton();
    }
};
