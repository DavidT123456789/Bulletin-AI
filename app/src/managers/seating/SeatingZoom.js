/**
 * @fileoverview Seating Chart Zoom, Smart-Fit, Pinch/Wheel Gestures & Overscroll Rebound
 * Extracted from SeatingChartManager for modularity (facade pattern via object spread).
 * @module managers/seating/SeatingZoom
 */

import { TooltipsUI } from '../TooltipsManager.js';

export const SeatingZoom = {
    // ========================================================================
    // SMART-FIT & MINIMALIST ZOOM
    // ========================================================================

    _getTargetZoomScale(fitScale = this._fitScale || 1) {
        return fitScale < 0.95
            ? 1.0
            : Math.round(fitScale * 1.25 * 100) / 100;
    },

    _applyBoardScale(board, scale, knownW = 0, knownH = 0) {
        if (!board) return;
        const s = Number(scale) || 1;
        board.style.setProperty('--sc-scale', s.toString());
        board.style.removeProperty('zoom');

        const boardW = knownW > 0 ? knownW : (board.offsetWidth || 0);
        const boardH = knownH > 0 ? knownH : (board.offsetHeight || 0);
        if (boardW > 0 && boardH > 0) {
            const mx = Math.round((boardW * (s - 1)) / 2 * 100) / 100;
            const my = Math.round((boardH * (s - 1)) / 2 * 100) / 100;
            board.style.setProperty('--sc-margin-x', `${mx}px`);
            board.style.setProperty('--sc-margin-y', `${my}px`);
        } else {
            board.style.setProperty('--sc-margin-x', '0px');
            board.style.setProperty('--sc-margin-y', '0px');
        }
    },

    _applySmartFit(forceFit = false) {
        const view = document.getElementById('seatingChartView');
        const gridArea = document.getElementById('scGridArea');
        const board = document.getElementById('scClassroomBoard');
        if (!view || !gridArea || !board) return;

        if (this._zoomAnimCleanup) {
            this._zoomAnimCleanup();
            this._zoomAnimCleanup = null;
        }

        board.style.transition = 'none';
        board.style.removeProperty('transform');
        board.style.removeProperty('transform-origin');

        if (forceFit) {
            this._isFitted = true;
        }

        if (!this._isFitted) {
            const zoomScale = this._zoomScale || this._getTargetZoomScale(this._fitScale);
            this._applyBoardScale(board, zoomScale);
            gridArea.setAttribute('data-fitted', 'false');
            this._lastObservedGridW = Math.round(gridArea.offsetWidth || gridArea.clientWidth || 0);
            this._lastObservedGridH = Math.round(gridArea.offsetHeight || gridArea.clientHeight || 0);
            this._updateZoomButtonUI(false, zoomScale);
            void board.offsetWidth;
            board.style.removeProperty('transition');
            return;
        }

        // Apply fitted overflow state before reading dimensions so disappearing scrollbars do not shift measurements
        gridArea.setAttribute('data-fitted', 'true');
        gridArea.style.scrollBehavior = 'auto';
        gridArea.scrollLeft = 0;
        gridArea.scrollTop = 0;
        gridArea.style.removeProperty('scroll-behavior');

        const areaWidth = gridArea.clientWidth || 0;
        const areaHeight = gridArea.clientHeight || 0;
        this._lastObservedGridW = Math.round(gridArea.offsetWidth || areaWidth);
        this._lastObservedGridH = Math.round(gridArea.offsetHeight || areaHeight);
        if (areaWidth <= 0 || areaHeight <= 0) {
            board.style.removeProperty('transition');
            return;
        }

        const isMobile = window.innerWidth <= 768;
        const reservedTop = isMobile ? (56 + 48) : (56 + 24);
        const reservedBottom = isMobile ? (this._isLocked ? 48 : 12) : 24;
        const reservedHoriz = isMobile ? 24 : 48;

        // On desktop, always account for the 260px sidebar so fit scale is identical between locked and unlocked modes
        const effectiveAreaW = (!isMobile && areaWidth >= 600) ? (areaWidth - 260) : areaWidth;
        const availW = Math.max(80, effectiveAreaW - reservedHoriz);
        const availH = Math.max(80, areaHeight - reservedTop - reservedBottom);

        const gridContainer = document.getElementById('scGridContainer');
        if (gridContainer) {
            gridContainer.style.transition = 'none';
        }

        const activeScale = parseFloat(board.style.getPropertyValue('--sc-scale')) || 1;
        const offsetW = board.offsetWidth;
        const offsetH = board.offsetHeight;
        const rect = (offsetW > 0 && offsetH > 0) ? null : board.getBoundingClientRect?.();
        const boardW = (offsetW > 0 ? offsetW : (rect?.width && activeScale > 0 ? rect.width / activeScale : 0)) || board.scrollWidth;
        const boardH = (offsetH > 0 ? offsetH : (rect?.height && activeScale > 0 ? rect.height / activeScale : 0)) || board.scrollHeight;
        if (gridContainer) {
            gridContainer.style.removeProperty('transition');
        }

        if (!boardW || !boardH) {
            board.style.removeProperty('transition');
            return;
        }

        const scaleW = availW / boardW;
        const scaleH = availH / boardH;
        let scale = Math.min(scaleW, scaleH);

        const maxFitScale = isMobile ? 1.0 : 1.65;
        scale = Math.min(maxFitScale, Math.max(0.35, Math.round(scale * 100) / 100));

        this._fitScale = scale;
        this._zoomScale = scale;
        this._isFitted = true;

        this._applyBoardScale(board, scale, boardW, boardH);
        this._updateZoomButtonUI(true, scale);
        void board.offsetWidth;
        board.style.removeProperty('transition');
    },

    _toggleZoom(focalPoint = null) {
        const gridArea = document.getElementById('scGridArea');
        const board = document.getElementById('scClassroomBoard');
        if (!gridArea || !board) return;

        TooltipsUI?.hideAll?.();

        if (this._zoomAnimCleanup) {
            this._zoomAnimCleanup();
            this._zoomAnimCleanup = null;
        }

        const rBefore = board.getBoundingClientRect?.() || null;
        board.style.transition = 'none';

        if (this._isFitted) {
            this._isFitted = false;
            const targetScale = this._getTargetZoomScale(this._fitScale);
            this._zoomScale = targetScale;
            this._applyBoardScale(board, targetScale);
            gridArea.setAttribute('data-fitted', 'false');
            this._lastObservedGridW = Math.round(gridArea.offsetWidth || gridArea.clientWidth || 0);
            this._lastObservedGridH = Math.round(gridArea.offsetHeight || gridArea.clientHeight || 0);
            this._updateZoomButtonUI(false, targetScale);

            let ratioX = 0.5;
            let ratioY = 0.5;
            if (focalPoint && typeof focalPoint.clientX === 'number' && typeof focalPoint.clientY === 'number' && rBefore && rBefore.width > 0 && rBefore.height > 0) {
                ratioX = Math.max(0, Math.min(1, (focalPoint.clientX - rBefore.left) / rBefore.width));
                ratioY = Math.max(0, Math.min(1, (focalPoint.clientY - rBefore.top) / rBefore.height));
            }

            const maxScrollX = Math.max(0, (gridArea.scrollWidth || 0) - (gridArea.clientWidth || 0));
            const maxScrollY = Math.max(0, (gridArea.scrollHeight || 0) - (gridArea.clientHeight || 0));
            if (maxScrollX > 0) gridArea.scrollLeft = Math.round(maxScrollX * ratioX);
            if (maxScrollY > 0) gridArea.scrollTop = Math.round(maxScrollY * ratioY);
        } else {
            this._applySmartFit(true);
        }

        if (rBefore && rBefore.width > 0) {
            this._animateFLIPTransition(rBefore);
        } else {
            board.style.removeProperty('transition');
        }
    },

    _animateFLIPTransition(rBefore, options = {}) {
        const board = document.getElementById('scClassroomBoard');
        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        if (!board || !rBefore || rBefore.width <= 0 || prefersReducedMotion) {
            board?.classList.remove('sc-lock-sliding');
            board?.style.removeProperty('transition');
            return;
        }

        if (this._zoomAnimCleanup) {
            this._zoomAnimCleanup();
            this._zoomAnimCleanup = null;
        }

        const rAfter = board.getBoundingClientRect?.();
        if (!rAfter || rAfter.width <= 0) {
            board.style.transition = 'transform 0.54s cubic-bezier(0.28, 1.2, 0.46, 1)';
            board.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
            this._bindBoardSlideCleanup(board, 0);
            return;
        }

        const zAfter = parseFloat(board.style.getPropertyValue('--sc-scale')) || 1;
        if (zAfter <= 0) {
            board.classList.remove('sc-lock-sliding');
            board.style.removeProperty('transition');
            return;
        }

        const isLockToggle = Boolean(options.lockToggle);
        const isMobile = this._isCompactLayout ? this._isCompactLayout() : this._isMobileView();
        const sameScale = Math.abs(rBefore.width - rAfter.width) <= 2 && Math.abs(rBefore.height - rAfter.height) <= 2;
        const isHorizontalDesktopDrawer = isLockToggle && !isMobile && sameScale;

        const centerBeforeX = rBefore.left + rBefore.width / 2;
        const centerBeforeY = rBefore.top + rBefore.height / 2;
        const centerAfterX = rAfter.left + rAfter.width / 2;
        const centerAfterY = rAfter.top + rAfter.height / 2;

        const rawDeltaX = Math.round((centerBeforeX - centerAfterX) * 100) / 100;
        const rawDeltaY = isHorizontalDesktopDrawer ? 0 : (Math.round((centerBeforeY - centerAfterY) * 100) / 100);
        const deltaCenterX = Math.abs(rawDeltaX) <= 1.5 ? 0 : rawDeltaX;
        const deltaCenterY = Math.abs(rawDeltaY) <= 1.5 ? 0 : rawDeltaY;
        const scaleX = isHorizontalDesktopDrawer ? 1 : (Math.round((rBefore.width / rAfter.width) * 1000) / 1000);
        const scaleY = isHorizontalDesktopDrawer ? 1 : (Math.round((rBefore.height / rAfter.height) * 1000) / 1000);

        if (Math.abs(deltaCenterX) < 1 && Math.abs(deltaCenterY) < 1 && Math.abs(scaleX - 1) < 0.01) {
            board.style.removeProperty('transition');
            if (isLockToggle && !isMobile) {
                this._bindBoardSlideCleanup(board, 600);
            } else {
                board.classList.remove('sc-lock-sliding');
            }
            return;
        }

        const tx = Math.round((deltaCenterX / zAfter) * 100) / 100;
        const ty = Math.round((deltaCenterY / zAfter) * 100) / 100;

        if (isLockToggle) {
            board.classList.add('sc-lock-sliding');
        }
        board.style.transformOrigin = '50% 50%';
        board.style.transition = 'none';
        board.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scaleX}, ${scaleY})`;

        void board.offsetWidth;
        if (typeof window.getComputedStyle === 'function') {
            void window.getComputedStyle(board).transform;
        }

        const isPureTranslationSettle = sameScale && Math.abs(scaleX - 1) < 0.015;
        board.style.transition = isPureTranslationSettle
            ? 'transform 0.52s cubic-bezier(0.32, 0.72, 0, 1)'
            : 'transform 0.54s cubic-bezier(0.28, 1.2, 0.46, 1)';
        board.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';

        this._bindBoardSlideCleanup(board, 600);
    },

    _updateZoomButtonUI(isFitted, scale) {
        const zoomBtn = document.getElementById('scFloatingZoomBtn');
        if (!zoomBtn) return;
        const icon = zoomBtn.querySelector('iconify-icon');

        zoomBtn.classList.toggle('is-zoomed', !isFitted);

        const nextIcon = isFitted ? 'solar:magnifer-zoom-in-linear' : 'solar:minimize-square-linear';
        const nextLabel = isFitted
            ? ((this._fitScale < 0.95) ? 'Agrandir (100%)' : 'Agrandir (125%)')
            : 'Ajuster à l’écran';

        if (icon && icon.getAttribute('icon') !== nextIcon) {
            icon.setAttribute('icon', nextIcon);
            zoomBtn.classList.remove('sc-zoom-icon-pop');
            void zoomBtn.offsetWidth;
            zoomBtn.classList.add('sc-zoom-icon-pop');
        }

        const prevLabel = zoomBtn.getAttribute('data-tooltip');
        zoomBtn.setAttribute('aria-label', nextLabel);
        zoomBtn.setAttribute('data-tooltip', nextLabel);

        if (prevLabel !== nextLabel) {
            if (typeof TooltipsUI?.updateTooltip === 'function') {
                TooltipsUI.updateTooltip(zoomBtn, nextLabel);
            } else {
                TooltipsUI?.initTooltips?.(document.getElementById('seatingChartView'));
            }
        }
    },

    _getMaxZoomScale(minScale = this._fitScale || 0.45) {
        return Math.min(2.5, Math.max(1.8, Math.round(minScale * 2.8 * 100) / 100));
    },

    // ========================================================================
    // PINCH & WHEEL GESTURE ZOOM
    // ========================================================================

    _suppressTouchTooltips(cooldownMs = 400) {
        if (TooltipsUI) {
            TooltipsUI.isIgnoringTooltips = true;
            TooltipsUI.hideAll?.();
        }
        if (this._tooltipSuppressTimer) {
            clearTimeout(this._tooltipSuppressTimer);
            this._tooltipSuppressTimer = null;
        }
        if (cooldownMs > 0) {
            this._tooltipSuppressTimer = setTimeout(() => {
                this._tooltipSuppressTimer = null;
                if (!this._isPinching && !this._touchDragEl && TooltipsUI) {
                    TooltipsUI.isIgnoringTooltips = false;
                }
            }, cooldownMs);
        }
    },

    _setupPinchAndWheelZoom(gridArea) {
        if (!gridArea) return;

        let pinchState = null;
        let rafPending = false;
        let pinchEndTimer = null;

        const clearPinchEndTimer = () => {
            if (pinchEndTimer) {
                clearTimeout(pinchEndTimer);
                pinchEndTimer = null;
            }
        };

        const onTouchStart = (e) => {
            if (e.touches.length !== 2) {
                clearPinchEndTimer();
                if (pinchState) {
                    const stateToFinish = pinchState;
                    pinchState = null;
                    this._endPinch(stateToFinish, gridArea);
                    this._suppressTouchTooltips(450);
                }
                this._isPinching = false;
                return;
            }

            clearPinchEndTimer();
            if (e.cancelable) e.preventDefault();
            this._isPinching = true;
            this._cleanupTouch();
            this._suppressTouchTooltips(0);

            const board = document.getElementById('scClassroomBoard');
            if (!board) return;

            if (this._zoomAnimCleanup) {
                this._zoomAnimCleanup();
                this._zoomAnimCleanup = null;
            }

            board.style.removeProperty('transform');
            board.style.removeProperty('transition');

            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            if (dist < 10) return;

            const midX = (t1.clientX + t2.clientX) / 2;
            const midY = (t1.clientY + t2.clientY) / 2;

            const minScale = this._fitScale || 0.45;
            const maxScale = this._getMaxZoomScale(minScale);
            const startScale = this._zoomScale || this._fitScale || 1;

            const boardRect = board.getBoundingClientRect?.() || { left: midX, top: midY, width: 300, height: 300 };
            const bw = boardRect.width > 0 ? boardRect.width : 300;
            const bh = boardRect.height > 0 ? boardRect.height : 300;
            const originPercentX = Math.round(((midX - boardRect.left) / bw) * 10000) / 100;
            const originPercentY = Math.round(((midY - boardRect.top) / bh) * 10000) / 100;

            const naturalW = board.offsetWidth > 0 ? board.offsetWidth : (bw / startScale);
            const naturalH = board.offsetHeight > 0 ? board.offsetHeight : (bh / startScale);
            const originCompX = -((originPercentX - 50) / 100) * naturalW * ((1 - startScale) / startScale);
            const originCompY = -((originPercentY - 50) / 100) * naturalH * ((1 - startScale) / startScale);

            pinchState = {
                startDist: dist,
                startScale,
                minScale,
                maxScale,
                initialMidX: midX,
                initialMidY: midY,
                originPercentX,
                originPercentY,
                originCompX,
                originCompY,
                boardRect,
                currentScale: startScale,
                currentMidX: midX,
                currentMidY: midY
            };

            board.style.transformOrigin = `${originPercentX.toFixed(2)}% ${originPercentY.toFixed(2)}%`;
            board.style.transition = 'none';
            if (Math.abs(originCompX) > 0.05 || Math.abs(originCompY) > 0.05) {
                board.style.transform = `translate3d(${originCompX.toFixed(2)}px, ${originCompY.toFixed(2)}px, 0)`;
            }
        };

        const renderPinch = () => {
            if (!pinchState) return;
            const board = document.getElementById('scClassroomBoard');
            if (!board) return;

            const { currentScale, startScale, initialMidX, initialMidY, currentMidX, currentMidY, minScale, originCompX = 0, originCompY = 0 } = pinchState;
            const visualScale = currentScale / startScale;

            const panX = originCompX + (currentMidX - initialMidX) / startScale;
            const panY = originCompY + (currentMidY - initialMidY) / startScale;

            board.style.transform = (Math.abs(panX) > 0.1 || Math.abs(panY) > 0.1)
                ? `translate3d(${panX.toFixed(2)}px, ${panY.toFixed(2)}px, 0) scale(${visualScale.toFixed(4)})`
                : `scale(${visualScale.toFixed(4)})`;

            const isFittedNow = (currentScale <= minScale + 0.04);
            const zoomBtn = document.getElementById('scFloatingZoomBtn');
            const icon = zoomBtn?.querySelector('iconify-icon');
            if (icon) {
                const targetIcon = isFittedNow ? 'solar:magnifer-zoom-in-linear' : 'solar:minimize-square-linear';
                if (icon.getAttribute('icon') !== targetIcon) {
                    icon.setAttribute('icon', targetIcon);
                }
            }
        };

        const onTouchMove = (e) => {
            if (!pinchState || e.touches.length !== 2) return;
            if (e.cancelable) e.preventDefault();

            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            const ratio = dist / pinchState.startDist;
            const rawScale = pinchState.startScale * ratio;

            let effectiveScale = rawScale;

            if (rawScale < pinchState.minScale) {
                const overshoot = pinchState.minScale - rawScale;
                const damped = (overshoot * 0.20) / (1 + (overshoot / (pinchState.minScale * 0.5)));
                effectiveScale = Math.max(pinchState.minScale * 0.85, pinchState.minScale - damped);
            } else if (rawScale > pinchState.maxScale) {
                const overshoot = rawScale - pinchState.maxScale;
                const damped = (overshoot * 0.20) / (1 + (overshoot / (pinchState.maxScale * 0.5)));
                effectiveScale = Math.min(pinchState.maxScale * 1.15, pinchState.maxScale + damped);
            }

            pinchState.currentScale = effectiveScale;
            pinchState.currentMidX = (t1.clientX + t2.clientX) / 2;
            pinchState.currentMidY = (t1.clientY + t2.clientY) / 2;

            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(() => {
                    rafPending = false;
                    renderPinch();
                });
            }
        };

        const onTouchEnd = (e) => {
            if (!pinchState) {
                if (this._isPinching && (!e.touches || e.touches.length === 0)) {
                    clearPinchEndTimer();
                    this._isPinching = false;
                    this._suppressTouchTooltips(450);
                }
                return;
            }
            if (e.touches.length < 2) {
                if (rafPending) {
                    rafPending = false;
                    renderPinch();
                }
                const stateToFinish = pinchState;
                pinchState = null;
                this._endPinch(stateToFinish, gridArea);
                clearPinchEndTimer();
                if (e.touches.length === 0) {
                    this._isPinching = false;
                    this._suppressTouchTooltips(450);
                } else {
                    pinchEndTimer = setTimeout(() => {
                        pinchEndTimer = null;
                        this._isPinching = false;
                        this._suppressTouchTooltips(400);
                    }, 200);
                }
            }
        };

        gridArea.addEventListener('touchstart', onTouchStart, { passive: false });
        gridArea.addEventListener('touchmove', onTouchMove, { passive: false });
        gridArea.addEventListener('touchend', onTouchEnd, { passive: true });
        gridArea.addEventListener('touchcancel', onTouchEnd, { passive: true });

        let wheelDebounceTimer = null;

        gridArea.addEventListener('wheel', (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            TooltipsUI?.hideAll?.();

            const board = document.getElementById('scClassroomBoard');
            if (!board) return;

            if (this._zoomAnimCleanup) {
                this._zoomAnimCleanup();
                this._zoomAnimCleanup = null;
            }

            const minScale = this._fitScale || 0.45;
            const maxScale = this._getMaxZoomScale(minScale);
            const currentScale = this._zoomScale || this._fitScale || 1;

            let dy = e.deltaY;
            if (e.deltaMode === 1) dy *= 16;
            else if (e.deltaMode === 2) dy *= 400;
            dy = Math.max(-100, Math.min(100, dy));

            // Responsive exponential scaling (smooth and natural on trackpads)
            const factor = Math.exp(-dy * 0.006);
            let nextScale = currentScale * factor;

            // Strict desktop boundaries: stops cleanly at min and max zoom without drift or bounce
            nextScale = Math.min(maxScale, Math.max(minScale, Math.round(nextScale * 1000) / 1000));

            if (Math.abs(nextScale - currentScale) < 0.001) return;

            // Cursor-anchored zoom
            const gridRect = gridArea.getBoundingClientRect?.() || { left: 0, top: 0 };
            const mouseX = e.clientX - gridRect.left;
            const mouseY = e.clientY - gridRect.top;
            const prevScrollLeft = gridArea.scrollLeft || 0;
            const prevScrollTop = gridArea.scrollTop || 0;
            const scaleRatio = nextScale / currentScale;

            this._zoomScale = nextScale;
            this._isFitted = (Math.abs(nextScale - minScale) < 0.02);

            this._applyBoardScale(board, nextScale);
            gridArea.setAttribute('data-fitted', this._isFitted ? 'true' : 'false');
            this._lastObservedGridW = Math.round(gridArea.offsetWidth || gridArea.clientWidth || 0);
            this._lastObservedGridH = Math.round(gridArea.offsetHeight || gridArea.clientHeight || 0);
            this._updateZoomButtonUI(this._isFitted, nextScale);

            const newScrollLeft = (prevScrollLeft + mouseX) * scaleRatio - mouseX;
            const newScrollTop = (prevScrollTop + mouseY) * scaleRatio - mouseY;
            const maxScrollX = Math.max(0, (gridArea.scrollWidth || 0) - (gridArea.clientWidth || 0));
            const maxScrollY = Math.max(0, (gridArea.scrollHeight || 0) - (gridArea.clientHeight || 0));

            if (maxScrollX > 0) {
                gridArea.scrollLeft = Math.max(0, Math.min(maxScrollX, Math.round(newScrollLeft)));
            }
            if (maxScrollY > 0) {
                gridArea.scrollTop = Math.max(0, Math.min(maxScrollY, Math.round(newScrollTop)));
            }

            clearTimeout(wheelDebounceTimer);
            wheelDebounceTimer = setTimeout(() => {
                if (this._isFitted) {
                    this._applySmartFit(true);
                }
            }, 120);
        }, { passive: false });
    },

    _endPinch(pinchState, gridArea) {
        const board = document.getElementById('scClassroomBoard');
        if (!board) return;

        const { currentScale, minScale, maxScale, startScale } = pinchState;
        let targetScale = currentScale;

        if (currentScale < minScale) {
            targetScale = minScale;
        } else if (currentScale > maxScale) {
            targetScale = maxScale;
        } else if (Math.abs(currentScale - minScale) / minScale < 0.08) {
            targetScale = minScale;
        } else {
            targetScale = Math.round(currentScale * 100) / 100;
        }

        const isFitted = (Math.abs(targetScale - minScale) < 0.02);

        // Capture visual bounding box before layout changes
        let rBefore = board.getBoundingClientRect?.() || null;
        if ((!rBefore || rBefore.width <= 0) && pinchState?.boardRect?.width > 0) {
            const visualRatio = currentScale / startScale;
            const b = pinchState.boardRect;
            rBefore = {
                left: b.left + (pinchState.currentMidX - pinchState.initialMidX),
                top: b.top + (pinchState.currentMidY - pinchState.initialMidY),
                width: b.width * visualRatio,
                height: b.height * visualRatio
            };
        }

        // Clear gesture transform so DOM layout box is immediately applied
        board.style.removeProperty('transform');
        board.style.removeProperty('transform-origin');
        board.style.removeProperty('transition');

        if (isFitted) {
            this._zoomScale = minScale;
            this._isFitted = true;
            this._applyBoardScale(board, minScale);
            gridArea.setAttribute('data-fitted', 'true');
            this._updateZoomButtonUI(true, minScale);
            this._applySmartFit(true);
        } else {
            this._zoomScale = targetScale;
            this._isFitted = false;
            this._applyBoardScale(board, targetScale);
            gridArea.setAttribute('data-fitted', 'false');
            this._lastObservedGridW = Math.round(gridArea.offsetWidth || gridArea.clientWidth || 0);
            this._lastObservedGridH = Math.round(gridArea.offsetHeight || gridArea.clientHeight || 0);
            this._updateZoomButtonUI(false, targetScale);

            if (rBefore && rBefore.width > 0) {
                const rMeasured = board.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
                const bw = rMeasured.width > 0 ? rMeasured.width : rBefore.width;
                const bh = rMeasured.height > 0 ? rMeasured.height : rBefore.height;

                const originPctX = pinchState.originPercentX ?? 50;
                const originPctY = pinchState.originPercentY ?? 50;
                const currentMidX = pinchState.currentMidX ?? (rBefore.left + rBefore.width / 2);
                const currentMidY = pinchState.currentMidY ?? (rBefore.top + rBefore.height / 2);

                const targetScrollLeft = (gridArea.scrollLeft || 0) + (rMeasured.left + (originPctX / 100) * bw) - currentMidX;
                const targetScrollTop = (gridArea.scrollTop || 0) + (rMeasured.top + (originPctY / 100) * bh) - currentMidY;

                const maxScrollX = Math.max(0, (gridArea.scrollWidth || 0) - (gridArea.clientWidth || 0));
                const maxScrollY = Math.max(0, (gridArea.scrollHeight || 0) - (gridArea.clientHeight || 0));

                if (maxScrollX > 0) {
                    gridArea.scrollLeft = Math.max(0, Math.min(maxScrollX, Math.round(targetScrollLeft)));
                }
                if (maxScrollY > 0) {
                    gridArea.scrollTop = Math.max(0, Math.min(maxScrollY, Math.round(targetScrollTop)));
                }
            }
        }

        if (rBefore && rBefore.width > 0) {
            this._animateFLIPTransition(rBefore);
        }
    },

    // ========================================================================
    // OVERSCROLL EDGE REBOUND (iOS/Android Photo-style elastic bounce)
    // ========================================================================

    _setupOverscrollBounce(gridArea) {
        if (!gridArea) return;

        const MAX_RAW_EXCESS = 160;
        const SWIPE_MODE_MIN_DX = 44;
        const SWIPE_MODE_MIN_EXCESS = 24;
        const SWIPE_EDGE_GUARD = 24;
        let touchStartX = 0;
        let touchStartY = 0;
        let prevTouchX = 0;
        let prevTouchY = 0;
        let prevScrollLeft = 0;
        let prevScrollTop = 0;
        let baseMaxScrollX = 0;
        let baseMaxScrollY = 0;
        let rawExcessX = 0;
        let rawExcessY = 0;
        let lockedAxis = null;
        let isTouching = false;
        let isOverscrolling = false;
        let isEdgeSwipe = false;
        let startedOnOverlayControl = false;
        let canSwipeUnlockedEmpty = false;
        let touchBoard = null;
        let currentOverscrollX = 0;
        let currentOverscrollY = 0;
        let lastTouchEndTime = 0;
        let releaseScrollLeft = 0;
        let releaseScrollTop = 0;

        const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

        const getEffectiveMaxScroll = () => {
            if (this._isFitted && gridArea.getAttribute('data-fitted') === 'true') {
                return { maxX: 0, maxY: 0 };
            }
            const rawMaxX = Math.max(0, (gridArea.scrollWidth || 0) - (gridArea.clientWidth || 0));
            const rawMaxY = Math.max(0, (gridArea.scrollHeight || 0) - (gridArea.clientHeight || 0));
            return {
                maxX: (this._isFitted && rawMaxX <= 8) ? 0 : rawMaxX,
                maxY: (this._isFitted && rawMaxY <= 8) ? 0 : rawMaxY
            };
        };

        const clampOverscroll = (excess, maxOvershoot = 56, resistance = 0.34) => {
            if (Math.abs(excess) < 1) return 0;
            const sign = Math.sign(excess);
            const abs = Math.abs(excess);
            const scaleComp = Math.max(1, this._zoomScale || 1);
            const damped = ((abs * resistance) / (1 + (abs * resistance) / maxOvershoot)) / scaleComp;
            return Math.round(sign * damped * 10) / 10;
        };

        const effectiveExcess = (val, deadZone = 5) => {
            if (Math.abs(val) <= deadZone) return 0;
            return val - Math.sign(val) * deadZone;
        };

        const onTouchStart = (e) => {
            if (this._isPinching || e.touches.length !== 1 || this._dragSource || this._touchSourceInfo) {
                if (isOverscrolling && !this._isPinching && (!e.touches || e.touches.length < 2)) {
                    this._releaseOverscrollBounce();
                }
                isOverscrolling = false;
                isTouching = false;
                rawExcessX = 0;
                rawExcessY = 0;
                lockedAxis = null;
                touchBoard = null;
                return;
            }

            const board = document.getElementById('scClassroomBoard');
            if (!board) return;
            touchBoard = board;

            if (this._overscrollApexTimer) {
                clearTimeout(this._overscrollApexTimer);
                this._overscrollApexTimer = null;
                board.style.transition = 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)';
                board.style.transform = 'translate3d(0, 0, 0)';
            }

            isTouching = true;
            isOverscrolling = false;
            currentOverscrollX = 0;
            currentOverscrollY = 0;
            rawExcessX = 0;
            rawExcessY = 0;
            lockedAxis = null;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            prevTouchX = touchStartX;
            prevTouchY = touchStartY;
            const viewportW = window.innerWidth || document.documentElement?.clientWidth || 0;
            isEdgeSwipe = touchStartX < SWIPE_EDGE_GUARD || (viewportW > 0 && touchStartX > viewportW - SWIPE_EDGE_GUARD);
            startedOnOverlayControl = Boolean(
                e.target?.closest?.('.sc-top-left-bar, .sc-floating-actions, .sc-status-pill, .sc-desk, .sc-mobile-sheet, .sc-onboarding-hint')
            );
            canSwipeUnlockedEmpty = !this._isLocked && (this._getPlacedIds?.().size || 0) === 0;
            prevScrollLeft = gridArea.scrollLeft;
            prevScrollTop = gridArea.scrollTop;
            const { maxX, maxY } = getEffectiveMaxScroll();
            baseMaxScrollX = maxX;
            baseMaxScrollY = maxY;
        };

        const onTouchMove = (e) => {
            if (!isTouching || e.touches.length !== 1 || this._dragSource || this._touchSourceInfo) return;

            const board = touchBoard || document.getElementById('scClassroomBoard');
            if (!board) return;

            const touch = e.touches[0];

            const stepX = touch.clientX - prevTouchX;
            const stepY = touch.clientY - prevTouchY;
            const dScrollX = gridArea.scrollLeft - prevScrollLeft;
            const dScrollY = gridArea.scrollTop - prevScrollTop;

            prevTouchX = touch.clientX;
            prevTouchY = touch.clientY;
            prevScrollLeft = gridArea.scrollLeft;
            prevScrollTop = gridArea.scrollTop;

            const totalMoveX = touch.clientX - touchStartX;
            const totalMoveY = touch.clientY - touchStartY;

            if (Math.abs(totalMoveX) > 6 || Math.abs(totalMoveY) > 6) {
                this._suppressTouchTooltips(400);
            }

            const moveMax = (baseMaxScrollX === 0 || baseMaxScrollY === 0) ? getEffectiveMaxScroll() : null;
            const maxScrollX = baseMaxScrollX > 0 ? baseMaxScrollX : moveMax.maxX;
            const maxScrollY = baseMaxScrollY > 0 ? baseMaxScrollY : moveMax.maxY;

            const scrollingBackX = (rawExcessX > 0 && (dScrollX > 0.5 || gridArea.scrollLeft > 1.5)) ||
                                   (rawExcessX < 0 && (dScrollX < -0.5 || gridArea.scrollLeft < maxScrollX - 2));
            const scrollingBackY = (rawExcessY > 0 && (dScrollY > 0.5 || gridArea.scrollTop > 1.5)) ||
                                   (rawExcessY < 0 && (dScrollY < -0.5 || gridArea.scrollTop < maxScrollY - 2));

            if (scrollingBackX || scrollingBackY) {
                rawExcessX = 0;
                rawExcessY = 0;
                if (isOverscrolling) {
                    isOverscrolling = false;
                    currentOverscrollX = 0;
                    currentOverscrollY = 0;
                    this._releaseOverscrollBounce();
                }
                return;
            }

            if (maxScrollX === 0 && maxScrollY === 0 && !lockedAxis && (Math.abs(totalMoveX) > 7 || Math.abs(totalMoveY) > 7)) {
                lockedAxis = Math.abs(totalMoveX) >= Math.abs(totalMoveY) ? 'x' : 'y';
            }

            if (maxScrollX > 0) {
                if (gridArea.scrollLeft <= 1 && stepX > 0 && rawExcessX >= 0 && Math.abs(dScrollY) < 1) {
                    rawExcessX = clamp(rawExcessX + Math.max(0, stepX + dScrollX), -MAX_RAW_EXCESS, MAX_RAW_EXCESS);
                } else if (gridArea.scrollLeft >= maxScrollX - 1.5 && stepX < 0 && rawExcessX <= 0 && Math.abs(dScrollY) < 1) {
                    rawExcessX = clamp(rawExcessX + Math.min(0, stepX + dScrollX), -MAX_RAW_EXCESS, MAX_RAW_EXCESS);
                } else if (rawExcessX !== 0) {
                    const decayX = Math.max(Math.abs(stepX), Math.abs(dScrollX)) * 1.15;
                    rawExcessX = rawExcessX > 0
                        ? Math.max(0, rawExcessX - decayX)
                        : Math.min(0, rawExcessX + decayX);
                }
            } else if (lockedAxis !== 'y' && Math.abs(dScrollY) < 1) {
                const factorX = (rawExcessX !== 0 && Math.sign(stepX) !== Math.sign(rawExcessX)) ? 1.5 : 1;
                rawExcessX = clamp(rawExcessX + stepX * factorX, -MAX_RAW_EXCESS, MAX_RAW_EXCESS);
            }

            if (maxScrollY > 0) {
                if (gridArea.scrollTop <= 1 && stepY > 0 && rawExcessY >= 0 && Math.abs(dScrollX) < 1) {
                    rawExcessY = clamp(rawExcessY + Math.max(0, stepY + dScrollY), -MAX_RAW_EXCESS, MAX_RAW_EXCESS);
                } else if (gridArea.scrollTop >= maxScrollY - 1.5 && stepY < 0 && rawExcessY <= 0 && Math.abs(dScrollX) < 1) {
                    rawExcessY = clamp(rawExcessY + Math.min(0, stepY + dScrollY), -MAX_RAW_EXCESS, MAX_RAW_EXCESS);
                } else if (rawExcessY !== 0) {
                    const decayY = Math.max(Math.abs(stepY), Math.abs(dScrollY)) * 1.15;
                    rawExcessY = rawExcessY > 0
                        ? Math.max(0, rawExcessY - decayY)
                        : Math.min(0, rawExcessY + decayY);
                }
            } else if (lockedAxis !== 'x' && Math.abs(dScrollX) < 1) {
                const factorY = (rawExcessY !== 0 && Math.sign(stepY) !== Math.sign(rawExcessY)) ? 1.5 : 1;
                rawExcessY = clamp(rawExcessY + stepY * factorY, -MAX_RAW_EXCESS, MAX_RAW_EXCESS);
            }

            if (lockedAxis === 'x') rawExcessY = 0;
            if (lockedAxis === 'y') rawExcessX = 0;

            const effX = effectiveExcess(rawExcessX, 5);
            const effY = effectiveExcess(rawExcessY, 5);

            if (effX !== 0 || effY !== 0) {
                const isFittedSwipeSurface = Boolean(
                    maxScrollX === 0 &&
                    maxScrollY === 0 &&
                    this._isActive &&
                    this._isFitted &&
                    !isEdgeSwipe &&
                    !startedOnOverlayControl &&
                    !this._activeMobileSheet &&
                    !this._isSearchOpen?.()
                );
                const canNavigateView = isFittedSwipeSurface && (this._isLocked || canSwipeUnlockedEmpty);

                let ox = 0;
                let oy = 0;
                if (maxScrollX > 0 || maxScrollY > 0) {
                    ox = clampOverscroll(effX);
                    oy = clampOverscroll(effY);
                } else {
                    const isNavX = Boolean(
                        (effX < 0 && isFittedSwipeSurface && this._isLocked && this._planMode === 'course' && this._canSwitchPlanMode?.('activity')) ||
                        (effX > 0 && canNavigateView)
                    );
                    ox = clampOverscroll(effX, isNavX ? 84 : 28, isNavX ? 0.56 : 0.25);
                    oy = clampOverscroll(effY, 28, 0.25);
                }

                if (Math.abs(ox) > 0 || Math.abs(oy) > 0) {
                    if (!isOverscrolling && this._zoomAnimCleanup) {
                        this._zoomAnimCleanup();
                        this._zoomAnimCleanup = null;
                    }
                    isOverscrolling = true;
                    currentOverscrollX = ox;
                    currentOverscrollY = oy;

                    board.style.transition = 'none';
                    board.style.transform = `translate3d(${ox}px, ${oy}px, 0)`;
                }
            } else if (isOverscrolling) {
                isOverscrolling = false;
                currentOverscrollX = 0;
                currentOverscrollY = 0;
                this._releaseOverscrollBounce();
            }
        };

        const onTouchEnd = (e) => {
            if (!isTouching) return;
            isTouching = false;
            lastTouchEndTime = performance.now();
            releaseScrollLeft = gridArea.scrollLeft;
            releaseScrollTop = gridArea.scrollTop;

            const endTouch = e?.changedTouches?.[0];
            const endX = typeof endTouch?.clientX === 'number' ? endTouch.clientX : prevTouchX;
            const endY = typeof endTouch?.clientY === 'number' ? endTouch.clientY : prevTouchY;
            const totalDx = endX - touchStartX;
            const totalDy = endY - touchStartY;

            const canSwipeBase = Boolean(
                e?.type !== 'touchcancel' &&
                this._isActive &&
                this._isFitted &&
                baseMaxScrollX === 0 &&
                baseMaxScrollY === 0 &&
                !isEdgeSwipe &&
                !startedOnOverlayControl &&
                !this._activeMobileSheet &&
                !this._isSearchOpen?.()
            );
            const canSwipeView = Boolean(
                canSwipeBase && (this._isLocked || canSwipeUnlockedEmpty)
            );
            touchBoard = null;

            const clearOverscrollTracking = () => {
                isOverscrolling = false;
                currentOverscrollX = 0;
                currentOverscrollY = 0;
                rawExcessX = 0;
                rawExcessY = 0;
                lockedAxis = null;
            };

            const isHorizontalSwipe = Boolean(
                canSwipeBase &&
                Math.abs(totalDx) >= SWIPE_MODE_MIN_DX &&
                Math.abs(rawExcessX) >= SWIPE_MODE_MIN_EXCESS &&
                Math.abs(totalDx) > Math.abs(totalDy) * 1.35
            );

            if (isHorizontalSwipe) {
                if (totalDx < 0 && rawExcessX < 0) {
                    if (this._isLocked && this._planMode === 'course' && this._canSwitchPlanMode?.('activity')) {
                        clearOverscrollTracking();
                        this.switchPlanMode('activity');
                        return;
                    }
                } else if (totalDx > 0 && rawExcessX > 0 && canSwipeView) {
                    clearOverscrollTracking();
                    if (this._isLocked && this._planMode === 'activity' && this._canSwitchPlanMode?.('course') && this._hasClassCoursePlan?.()) {
                        this.switchPlanMode('course');
                    } else {
                        this.switchToView?.('list');
                    }
                    return;
                }
            }

            if (isOverscrolling && (currentOverscrollX !== 0 || currentOverscrollY !== 0)) {
                this._releaseOverscrollBounce();
            }
            isOverscrolling = false;
            rawExcessX = 0;
            rawExcessY = 0;
            lockedAxis = null;
        };

        gridArea.addEventListener('touchstart', onTouchStart, { passive: true });
        gridArea.addEventListener('touchmove', onTouchMove, { passive: true });
        gridArea.addEventListener('touchend', onTouchEnd, { passive: true });
        gridArea.addEventListener('touchcancel', onTouchEnd, { passive: true });

        let lastScrollX = gridArea.scrollLeft;
        let lastScrollY = gridArea.scrollTop;
        let lastScrollTime = performance.now();
        let lastVelocityX = 0;
        let lastVelocityY = 0;
        let lastBounceTime = 0;

        const onScroll = () => {
            TooltipsUI?.hideAll?.();

            if (this._isPinching || isTouching || this._dragSource || this._touchSourceInfo || this._zoomAnimCleanup || this._isFitted) {
                lastScrollX = gridArea.scrollLeft;
                lastScrollY = gridArea.scrollTop;
                lastScrollTime = performance.now();
                lastVelocityX = 0;
                lastVelocityY = 0;
                return;
            }

            const now = performance.now();
            const dt = Math.max(1, now - lastScrollTime);
            const currentX = gridArea.scrollLeft;
            const currentY = gridArea.scrollTop;

            const vx = (currentX - lastScrollX) / dt;
            const vy = (currentY - lastScrollY) / dt;

            const maxScrollX = Math.max(0, (gridArea.scrollWidth || 0) - (gridArea.clientWidth || 0));
            const maxScrollY = Math.max(0, (gridArea.scrollHeight || 0) - (gridArea.clientHeight || 0));

            const cooldownElapsed = (now - lastBounceTime) > 380;
            const traveledSinceReleaseX = Math.abs(currentX - releaseScrollLeft);
            const traveledSinceReleaseY = Math.abs(currentY - releaseScrollTop);
            const recentlyReleased = (now - lastTouchEndTime) < 650;

            if (cooldownElapsed) {
                let hitEdgeX = 0;
                let hitEdgeY = 0;

                const speedX = currentX < lastScrollX ? Math.min(vx, lastVelocityX) : Math.max(vx, lastVelocityX);
                const speedY = currentY < lastScrollY ? Math.min(vy, lastVelocityY) : Math.max(vy, lastVelocityY);

                const canBounceX = !recentlyReleased || traveledSinceReleaseX > 36;
                const canBounceY = !recentlyReleased || traveledSinceReleaseY > 36;
                const scaleComp = Math.max(1, this._zoomScale || 1);

                if (canBounceX && currentX <= 2 && currentX < lastScrollX && lastScrollX > 0.5 && speedX < -0.42) {
                    hitEdgeX = Math.round((Math.min(22, Math.max(7, Math.abs(speedX) * 16)) / scaleComp) * 10) / 10;
                } else if (canBounceX && maxScrollX > 0 && currentX >= maxScrollX - 2.5 && currentX > lastScrollX && lastScrollX < maxScrollX - 0.5 && speedX > 0.42) {
                    hitEdgeX = -Math.round((Math.min(22, Math.max(7, Math.abs(speedX) * 16)) / scaleComp) * 10) / 10;
                }

                if (canBounceY && currentY <= 2 && currentY < lastScrollY && lastScrollY > 0.5 && speedY < -0.42) {
                    hitEdgeY = Math.round((Math.min(22, Math.max(7, Math.abs(speedY) * 16)) / scaleComp) * 10) / 10;
                } else if (canBounceY && maxScrollY > 0 && currentY >= maxScrollY - 2.5 && currentY > lastScrollY && lastScrollY < maxScrollY - 0.5 && speedY > 0.42) {
                    hitEdgeY = -Math.round((Math.min(22, Math.max(7, Math.abs(speedY) * 16)) / scaleComp) * 10) / 10;
                }

                if (hitEdgeX !== 0 || hitEdgeY !== 0) {
                    lastBounceTime = now;
                    this._triggerEdgeImpactBounce(hitEdgeX, hitEdgeY);
                }
            }

            lastScrollX = currentX;
            lastScrollY = currentY;
            lastScrollTime = now;
            lastVelocityX = vx;
            lastVelocityY = vy;
        };

        gridArea.addEventListener('scroll', onScroll, { passive: true });
    },

    _releaseOverscrollBounce() {
        const board = document.getElementById('scClassroomBoard');
        if (!board) return;

        if (this._zoomAnimCleanup) {
            this._zoomAnimCleanup();
            this._zoomAnimCleanup = null;
        }

        let cleaned = false;
        let onTransEnd = null;
        let timer = null;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            if (timer) clearTimeout(timer);
            if (onTransEnd) {
                board.removeEventListener('transitionend', onTransEnd);
                onTransEnd = null;
            }
            board.style.removeProperty('transform');
            board.style.removeProperty('transition');
            if (this._zoomAnimCleanup === cleanup) {
                this._zoomAnimCleanup = null;
            }
        };
        this._zoomAnimCleanup = cleanup;

        board.style.transition = 'transform 0.42s cubic-bezier(0.25, 1, 0.3, 1)';
        board.style.transform = 'translate3d(0, 0, 0)';

        timer = setTimeout(cleanup, 460);
        onTransEnd = (e) => {
            if (e.target === board && (!e.propertyName || e.propertyName === 'transform')) {
                if (board.style.transform.includes('0px, 0px, 0') || board.style.transform === 'translate3d(0, 0, 0)') {
                    cleanup();
                }
            }
        };
        board.addEventListener('transitionend', onTransEnd);
    },

    _triggerEdgeImpactBounce(bounceX, bounceY) {
        const board = document.getElementById('scClassroomBoard');
        if (!board) return;

        if (this._zoomAnimCleanup) {
            this._zoomAnimCleanup();
            this._zoomAnimCleanup = null;
        }

        board.style.transition = 'transform 0.09s cubic-bezier(0.1, 0.9, 0.2, 1)';
        board.style.transform = `translate3d(${bounceX}px, ${bounceY}px, 0)`;

        let cleaned = false;
        let onTransEnd = null;
        let apexTimer = null;
        let timer = null;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            if (apexTimer) clearTimeout(apexTimer);
            if (this._overscrollApexTimer === apexTimer) {
                this._overscrollApexTimer = null;
            }
            if (timer) clearTimeout(timer);
            if (onTransEnd) {
                board.removeEventListener('transitionend', onTransEnd);
                onTransEnd = null;
            }
            board.style.removeProperty('transform');
            board.style.removeProperty('transition');
            if (this._zoomAnimCleanup === cleanup) {
                this._zoomAnimCleanup = null;
            }
        };
        this._zoomAnimCleanup = cleanup;

        apexTimer = setTimeout(() => {
            this._overscrollApexTimer = null;
            if (cleaned) return;
            board.style.transition = 'transform 0.38s cubic-bezier(0.25, 1, 0.3, 1)';
            board.style.transform = 'translate3d(0, 0, 0)';
        }, 85);
        this._overscrollApexTimer = apexTimer;

        timer = setTimeout(cleanup, 500);
        onTransEnd = (e) => {
            if (e.target === board && (!e.propertyName || e.propertyName === 'transform')) {
                if (board.style.transform.includes('0px, 0px, 0') || board.style.transform === 'translate3d(0, 0, 0)') {
                    cleanup();
                }
            }
        };
        board.addEventListener('transitionend', onTransEnd);
    }
};
