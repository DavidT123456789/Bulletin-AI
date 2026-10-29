/**
 * @fileoverview Focus Panel Events — Écouteurs DOM, raccourcis clavier et gestes tactiles de fermeture
 * Extrait de FocusPanelManager.js (Lot 11 — Découpage God Object #1)
 * @module managers/focus/FocusPanelEvents
 */

import { appState } from '../../state/State.js';
import { UI } from '../UIManager.js';
import { StorageManager } from '../StorageManager.js';
import { PromptService } from '../../services/PromptService.js';
import { FocusPanelHistory } from '../FocusPanelHistory.js';
import { FocusPanelAnalysis } from '../FocusPanelAnalysis.js';
import { FocusPanelHeader } from '../FocusPanelHeader.js';
import { FocusPanelNavigation } from '../FocusPanelNavigation.js';
import { FocusPanelStatus } from '../FocusPanelStatus.js';
import { SettingsModalListeners } from '../listeners/SettingsModalListeners.js';
import { SpeechRecognitionManager } from '../SpeechRecognitionManager.js';

const isPanelOpen = (panel) => (typeof panel.isOpen === 'function' ? panel.isOpen() : Boolean(panel.isOpen));

export const FocusPanelEvents = {
    /**
     * Configure les event listeners du Focus Panel
     * @param {Object} panel - Instance FocusPanelManager
     */
    setupEventListeners(panel) {
        if (panel._listenersAttached) return;
        panel._listenersAttached = true;

        panel._initCloseGestures();

        const panelEl = document.getElementById('focusPanel');
        const backdrop = document.getElementById('focusPanelBackdrop');
        const backBtn = document.getElementById('focusBackBtn');
        const prevBtn = document.getElementById('focusPrevBtn');
        const nextBtn = document.getElementById('focusNextBtn');
        const analysisPrevBtn = document.getElementById('focusAnalysisPrevBtn');
        const analysisNextBtn = document.getElementById('focusAnalysisNextBtn');
        const generateBtn = document.getElementById('focusGenerateBtn');
        const copyBtn = document.getElementById('focusCopyBtn');

        // Dynamic scroll-driven morphing: progressively interpolates header into compact floating capsule
        const focusContent = panelEl?.querySelector('.focus-main-page .focus-content');
        const focusHeader = panelEl?.querySelector('.focus-header');
        if (focusContent && focusHeader) {
            let scrollRafId = null;
            const SCROLL_RANGE = 40;

            const updateHeaderScrollProgress = () => {
                scrollRafId = null;
                if (!focusHeader || !focusContent) return;

                if (focusHeader.classList.contains('editing')) {
                    focusHeader.style.removeProperty('--scroll-p');
                    focusHeader.classList.remove('scrolled');
                } else {
                    const scrollTop = Math.max(0, focusContent.scrollTop);
                    const progress = Math.min(1, scrollTop / SCROLL_RANGE);

                    focusHeader.style.setProperty('--scroll-p', progress.toFixed(3));
                    focusHeader.classList.toggle('scrolled', progress > 0.01);
                }

                panel.updateScrollAffordances();
            };

            focusContent.addEventListener('scroll', () => {
                if (scrollRafId === null) {
                    scrollRafId = requestAnimationFrame(updateHeaderScrollProgress);
                }
            }, { passive: true });

            if (typeof ResizeObserver !== 'undefined') {
                const resizeObserver = new ResizeObserver(() => {
                    panel.updateScrollAffordances();
                });
                resizeObserver.observe(focusContent);
            }

            focusContent.addEventListener('focusin', (e) => {
                if (!focusHeader.classList.contains('editing')) return;
                if (focusHeader.contains(e.target)) return;

                if (!panel.isCreationMode || FocusPanelHeader.hasCreationIdentityInput()) {
                    FocusPanelHeader.toggleEditMode(false, false);
                }
            });
        }

        const preCloseHandler = () => {
            const header = document.querySelector('.focus-header');
            const isEditing = header?.classList.contains('editing');
            if (!isEditing || panel.isCreationMode) {
                panel._isClosing = true;
                clearTimeout(panel._preCloseTimeout);
                panel._preCloseTimeout = setTimeout(() => {
                    panel._isClosing = false;
                }, 1000);
            }
        };

        if (backdrop) {
            backdrop.addEventListener('pointerdown', preCloseHandler);
            backdrop.addEventListener('click', () => panel.close());
        }

        if (backBtn) {
            backBtn.addEventListener('pointerdown', (e) => {
                const header = document.querySelector('.focus-header');
                if (header?.classList.contains('editing')) {
                    e.preventDefault();
                }
                preCloseHandler();
            });
            backBtn.addEventListener('click', () => {
                const header = document.querySelector('.focus-header');
                const isEditing = header?.classList.contains('editing');

                if (panel.isCreationMode) {
                    FocusPanelHeader.toggleEditMode(false, true);
                    if (isPanelOpen(panel)) {
                        panel.close({ cancelCreation: true });
                    }
                    return;
                }

                if (isEditing) {
                    FocusPanelHeader.toggleEditMode(false, true);
                } else {
                    panel.close();
                }
            });
        }

        if (prevBtn) prevBtn.addEventListener('click', () => {
            FocusPanelNavigation.navigatePrev();
            prevBtn.blur();
            setTimeout(() => prevBtn.blur(), 50);
        });
        if (nextBtn) nextBtn.addEventListener('click', () => {
            FocusPanelNavigation.navigateNext();
            nextBtn.blur();
            setTimeout(() => nextBtn.blur(), 50);
        });
        if (analysisPrevBtn) analysisPrevBtn.addEventListener('click', () => {
            FocusPanelNavigation.navigatePrev();
            analysisPrevBtn.blur();
            setTimeout(() => analysisPrevBtn.blur(), 50);
        });
        if (analysisNextBtn) analysisNextBtn.addEventListener('click', () => {
            FocusPanelNavigation.navigateNext();
            analysisNextBtn.blur();
            setTimeout(() => analysisNextBtn.blur(), 50);
        });

        if (generateBtn) {
            generateBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (panel._activeGenerations.has(panel.currentStudentId)) {
                    const elapsed = Date.now() - (panel._activeGenerationStartTime || 0);
                    if (elapsed < 350) return;

                    panel._isCancellingGeneration = true;
                    panel._cancelGenerationForStudent(panel.currentStudentId);
                    setTimeout(() => { panel._isCancellingGeneration = false; }, 300);
                    generateBtn.blur();
                    return;
                }
                panel.generate();
                generateBtn.blur();
            });
            generateBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (panel._activeGenerations.has(panel.currentStudentId)) {
                    return;
                }
                panel._showPromptPreview();
                generateBtn.blur();
            });
        }

        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                panel.copy();
                copyBtn.blur();
            });
            copyBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                panel._copyPromptToClipboard();
                copyBtn.blur();
            });
        }

        document.addEventListener('app-settings-changed', () => {
            if (panel.currentStudentId) {
                FocusPanelStatus.refreshAppreciationStatus();
            }
        });

        const analyzeBtn = document.getElementById('focusAnalyzeBtn');
        if (analyzeBtn) analyzeBtn.addEventListener('click', () => FocusPanelAnalysis.show());
        const analysisBackBtn = document.getElementById('focusAnalysisBackBtn');
        if (analysisBackBtn) analysisBackBtn.addEventListener('click', () => FocusPanelAnalysis.hide());
        const generateAnalysisBtn = document.getElementById('focusGenerateAnalysisBtn');
        if (generateAnalysisBtn) generateAnalysisBtn.addEventListener('click', () => FocusPanelAnalysis.generate());

        const handleDataChange = (e) => {
            if (!isPanelOpen(panel) || !panel.currentStudentId) return;

            const currentPeriod = appState.currentPeriod;
            const result = appState.generatedResults.find(r => r.id === panel.currentStudentId);
            if (!result) return;

            const target = e.target;
            let changed = false;

            if (target.id === 'focusCurrentGradeInput' || target.id === 'focusEditGradeInput') {
                const val = target.value.replace(',', '.');
                let numVal = val === '' ? null : parseFloat(val);
                if (isNaN(numVal)) numVal = null;

                if (!result.studentData.periods) result.studentData.periods = {};
                if (!result.studentData.periods[currentPeriod]) result.studentData.periods[currentPeriod] = {};

                result.studentData.periods[currentPeriod].grade = numVal;
                changed = true;
                panel._isGradeEdited = true;
            } else if (target.id === 'focusContextInput') {
                if (!result.studentData.periods) result.studentData.periods = {};
                if (!result.studentData.periods[currentPeriod]) result.studentData.periods[currentPeriod] = {};

                result.studentData.periods[currentPeriod].context = target.value;
                changed = true;
                panel._isContextEdited = true;
            } else if (e.type === 'change' && target.type === 'checkbox' && target.closest('.focus-header-edit')) {
                const allBoxes = Array.from(document.querySelectorAll('.focus-header-edit input[type="checkbox"]'));
                const checkedValues = allBoxes.filter(cb => cb.checked).map(cb => cb.value);
                const allCheckboxValues = allBoxes.map(cb => cb.value);
                const baseStatuses = FocusPanelHeader._originalHeaderValues?.statuses || result.studentData.statuses || [];
                result.studentData.statuses = FocusPanelHeader.mergeEditedStatuses(baseStatuses, checkedValues, allCheckboxValues);
                changed = true;
            }

            if (changed) {
                clearTimeout(panel._uiUpdateTimeout);
                panel._uiUpdateTimeout = setTimeout(() => {
                    FocusPanelStatus.refreshAppreciationStatus();
                    panel._updateListRow(result);
                }, 300);
            }
        };

        document.addEventListener('input', handleDataChange);
        document.addEventListener('change', handleDataChange);

        document.addEventListener('keydown', (e) => {
            if (!isPanelOpen(panel) || UI.isAnyModalOpen()) return;
            const activeEl = document.activeElement;
            const isEditing = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                if (SpeechRecognitionManager.isRecording?.() && SpeechRecognitionManager.getActiveTarget?.() === 'appreciation') return;
                panel.generate();
                return;
            }

            if (e.key === 'Escape') {
                const popover = document.getElementById('historyPopover');
                if (popover) {
                    popover.remove();
                    const indicator = document.getElementById('focusHistoryIndicator');
                    indicator?.classList.remove('active');
                    return;
                }
                if (SpeechRecognitionManager.isRecording()) {
                    SpeechRecognitionManager.stop();
                    return;
                }
                if (panel._activeGenerations.has(panel.currentStudentId)) {
                    panel._isCancellingGeneration = true;
                    panel._cancelGenerationForStudent(panel.currentStudentId);
                    setTimeout(() => { panel._isCancellingGeneration = false; }, 300);
                    return;
                }
                const header = document.querySelector('.focus-header');
                if (header?.classList.contains('editing')) {
                    FocusPanelHeader.toggleEditMode(false, true);
                    if (panel.isCreationMode && isPanelOpen(panel)) {
                        panel.close({ cancelCreation: true });
                    }
                    return;
                }
                panel.close();
            } else if (e.key === 'ArrowLeft' && !isEditing) {
                e.preventDefault();
                FocusPanelNavigation.navigatePrev();
            } else if (e.key === 'ArrowRight' && !isEditing) {
                e.preventDefault();
                FocusPanelNavigation.navigateNext();
            }
        });

        const refinementOptions = document.getElementById('focusRefinementOptions');
        if (refinementOptions) {
            refinementOptions.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-refine-type]');
                if (btn && !btn.classList.contains('disabled')) {
                    panel._refineAppreciation(btn.dataset.refineType);
                    btn.blur();
                }
            });

            refinementOptions.addEventListener('contextmenu', (e) => {
                const btn = e.target.closest('[data-refine-type]');
                if (btn) {
                    e.preventDefault();
                    panel._showRefinementPreview(btn.dataset.refineType);
                    btn.blur();
                }
            });
        }

        const appreciationText = document.getElementById('focusAppreciationText');
        if (appreciationText) {
            appreciationText.addEventListener('input', () => {
                panel._isAppreciationEdited = true;
                FocusPanelStatus.updateWordCount();

                const content = appreciationText.textContent?.trim() || '';
                const result = appState.generatedResults.find(r => r.id === panel.currentStudentId);
                const isGenerating = FocusPanelStatus._isGenerating(panel.currentStudentId);

                if (result && !isGenerating) {
                    const hasRealContent = FocusPanelStatus._hasRealContent(content);

                    if (hasRealContent) {
                        if (result.appreciationSource !== 'manual' || result.wasGenerated === true) {
                            result.appreciationSource = 'manual';
                            result.wasGenerated = false;
                        }

                        result.errorMessage = null;
                        result.errorPeriod = null;

                        result.appreciation = content;
                        if (result.studentData?.periods?.[appState.currentPeriod]) {
                            result.studentData.periods[appState.currentPeriod].appreciation = content;
                        }
                    } else {
                        result.appreciation = '';
                        if (result.studentData?.periods?.[appState.currentPeriod]) {
                            result.studentData.periods[appState.currentPeriod].appreciation = '';
                        }
                    }

                    clearTimeout(panel._appreciationUITimeout);
                    panel._appreciationUITimeout = setTimeout(() => {
                        result.promptHash = PromptService.getPromptHash({
                            ...result.studentData,
                            id: result.id,
                            currentPeriod: appState.currentPeriod
                        });
                        result.generationPeriod = appState.currentPeriod;
                        result.generationSnapshot = null;

                        FocusPanelStatus.updateSourceIndicator(result);
                        FocusPanelStatus.updateAppreciationStatus(result);
                        panel._updateListRow(result);
                    }, 300);
                }
            });

            appreciationText.addEventListener('blur', () => {
                if (!panel._isAppreciationEdited) return;

                const content = appreciationText.textContent?.trim() || '';
                const result = appState.generatedResults.find(r => r.id === panel.currentStudentId);

                if (result) {
                    const isRealContent = FocusPanelStatus._hasRealContent(content);

                    if (isRealContent) {
                        if (content !== panel._initialAppreciationText) {
                            FocusPanelHistory.push(content, 'edit');
                            panel._initialAppreciationText = content;
                        }

                        if (result.wasGenerated === false) {
                            result.errorMessage = null;
                            result.errorPeriod = null;
                            result.promptHash = PromptService.getPromptHash({
                                ...result.studentData,
                                id: result.id,
                                currentPeriod: appState.currentPeriod
                            });
                            result.generationPeriod = appState.currentPeriod;
                            result.generationSnapshot = null;
                        }

                        panel._saveContext();

                        if (result.wasGenerated === false) {
                            FocusPanelStatus.updateAppreciationStatus(null, { state: 'saved' });
                            FocusPanelStatus.updateSourceIndicator(result);
                            panel._updateListRow(result);
                        } else {
                            FocusPanelStatus.refreshAppreciationStatus();
                        }
                    } else {
                        result.appreciation = '';
                        if (result.studentData?.periods?.[appState.currentPeriod]) {
                            result.studentData.periods[appState.currentPeriod].appreciation = '';
                        }
                        panel._initialAppreciationText = '';
                        FocusPanelStatus.refreshAppreciationStatus();
                        FocusPanelStatus.updateHistoryIndicator();
                        panel._saveContext();
                    }
                }
                panel._isAppreciationEdited = false;
            });

            appreciationText.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text/plain');
                const cleanText = text.replace(/^[\r\n]+|[\r\n]+$/g, '');

                const selection = window.getSelection();
                if (!selection.rangeCount) return;

                const range = selection.getRangeAt(0);
                if (!appreciationText.contains(range.commonAncestorContainer)) return;

                selection.deleteFromDocument();

                const textNode = document.createTextNode(cleanText);
                range.insertNode(textNode);
                selection.collapseToEnd();

                appreciationText.dispatchEvent(new Event('input', { bubbles: true }));
            });

            appreciationText.addEventListener('keydown', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); FocusPanelHistory.undo(); }
                    else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); FocusPanelHistory.redo(); }
                }
            });
        }

        const historyIndicator = document.getElementById('focusHistoryIndicator');
        if (historyIndicator) {
            historyIndicator.addEventListener('click', (e) => {
                e.stopPropagation();
                FocusPanelHistory.showPopover();
            });
        }

        const historyPrevBtn = document.getElementById('focusHistoryPrevBtn');
        if (historyPrevBtn) {
            historyPrevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                FocusPanelHistory.undo();
            });
        }

        const historyNextBtn = document.getElementById('focusHistoryNextBtn');
        if (historyNextBtn) {
            historyNextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                FocusPanelHistory.redo();
            });
        }

        const appreciationBadge = document.getElementById('focusAppreciationBadge');
        if (appreciationBadge) {
            appreciationBadge.addEventListener('click', () => {
                if (!appreciationBadge.classList.contains('modified')) return;
                const result = appState.generatedResults.find(r => r.id === panel.currentStudentId);
                if (!result) return;

                if (result.wasGenerated === true) {
                    const genBtn = document.getElementById('focusGenerateBtn');
                    genBtn?.click();
                } else {
                    result.promptHash = PromptService.getPromptHash({
                        ...result.studentData,
                        id: result.id,
                        currentPeriod: appState.currentPeriod
                    });
                    result.generationPeriod = appState.currentPeriod;
                    result.generationSnapshot = null;

                    StorageManager.saveAppState();
                    panel._updateListRow(result);
                    FocusPanelStatus.updateSourceIndicator(result);
                    FocusPanelStatus.updateAppreciationStatus(null, { state: 'saved' });
                }
            });
        }

        const contextInput = document.getElementById('focusContextInput');
        if (contextInput) {
            contextInput.addEventListener('input', () => {
                panel._isContextEdited = true;
                panel._autoResizeTextarea(contextInput);
            });
            contextInput.addEventListener('blur', () => {
                panel._saveContext();
                FocusPanelStatus.refreshAppreciationStatus();
            });
        }

        const wordCountBadge = document.getElementById('focusWordCount');
        if (wordCountBadge) {
            wordCountBadge.addEventListener('click', () => {
                const personalizationModal = document.getElementById('personalizationModal');
                if (personalizationModal) UI.openModal(personalizationModal);
                SettingsModalListeners._updateStudentContextAndPrompt();
                UI.highlightSettingsElement('iaLengthSlider', { tab: 'templates' });
            });
        }
    },

    /**
     * Initialise les gestures natives iOS pour fermer le panneau ("Edge Swipe" et "Pull-to-Dismiss")
     * @param {Object} panel - Instance FocusPanelManager
     */
    initCloseGestures(panel) {
        const panelEl = document.getElementById('focusPanel');
        if (!panelEl) return;

        let touchStartX = null;
        let touchStartY = null;
        let currentX = 0;
        let currentY = 0;
        let isEdgeSwiping = false;
        let isPullingDown = false;
        let contentEl = null;

        panelEl.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) return;
            if (e.target.closest('button, [role="button"], input, textarea, select, .focus-nav-btn, .close-modal-btn')) return;

            const header = document.querySelector('.focus-header');
            if (header && header.classList.contains('editing')) return;

            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            currentX = 0;
            currentY = 0;

            const isAnalysisVisible = document.getElementById('focusPagesContainer')?.classList.contains('show-analysis');

            isEdgeSwiping = touchStartX < 30;
            isPullingDown = false;

            contentEl = isAnalysisVisible
                ? panelEl.querySelector('.focus-analysis-content-area')
                : panelEl.querySelector('.focus-main-page .focus-content');

            if (!isEdgeSwiping && contentEl && contentEl.scrollTop <= 0) {
                let currentHeaderRect = null;
                if (isAnalysisVisible) {
                    const analysisHeader = panelEl.querySelector('.focus-analysis-header');
                    currentHeaderRect = analysisHeader ? analysisHeader.getBoundingClientRect() : null;
                } else {
                    currentHeaderRect = header ? header.getBoundingClientRect() : null;
                }

                if (currentHeaderRect && touchStartY <= currentHeaderRect.bottom + 40) {
                    isPullingDown = true;
                }
            }

            if (isEdgeSwiping || isPullingDown) {
                const target = isAnalysisVisible ? document.querySelector('.focus-analysis-page') : panelEl;
                if (target) {
                    target.style.transition = 'none';
                    target.style.willChange = 'transform';
                }
            }
        }, { passive: true });

        panelEl.addEventListener('touchmove', (e) => {
            if (touchStartX === null || touchStartY === null) return;

            currentX = e.touches[0].clientX - touchStartX;
            currentY = e.touches[0].clientY - touchStartY;

            const isAnalysisVisible = document.getElementById('focusPagesContainer')?.classList.contains('show-analysis');
            const target = isAnalysisVisible ? document.querySelector('.focus-analysis-page') : panelEl;
            if (!target) return;

            if (isEdgeSwiping) {
                if (currentX > 0) {
                    if (e.cancelable) e.preventDefault();

                    if (isAnalysisVisible) {
                        target.style.transform = `translateX(${currentX}px)`;
                    } else {
                        const progress = Math.min(currentX / window.innerWidth, 1);
                        target.style.transform = `translateX(${currentX}px)`;
                        const backdrop = document.getElementById('focusPanelBackdrop');
                        if (backdrop) backdrop.style.opacity = (1 - progress).toString();
                    }
                }
            } else if (isPullingDown && currentY > 0) {
                if (currentY > Math.abs(currentX)) {
                    if (e.cancelable) e.preventDefault();
                    const resistance = currentY * 0.45;
                    target.style.transform = `translateY(${resistance}px)`;
                } else {
                    isPullingDown = false;
                    target.style.transition = '';
                    target.style.transform = '';
                }
            }
        }, { passive: false });

        panelEl.addEventListener('touchend', (e) => {
            if (touchStartX === null || touchStartY === null) return;

            const isAnalysisVisible = document.getElementById('focusPagesContainer')?.classList.contains('show-analysis');
            const target = isAnalysisVisible ? document.querySelector('.focus-analysis-page') : panelEl;
            if (!target) return;

            if (isEdgeSwiping) {
                const threshold = window.innerWidth * 0.3;
                const velocity = currentX / (e.timeStamp || 1);

                if (currentX > threshold || velocity > 1.5) {
                    panel._isClosing = true;
                    target.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
                    target.style.transform = 'translateX(100%)';

                    if (isAnalysisVisible) {
                        setTimeout(() => {
                            FocusPanelAnalysis.hide();
                            panel._resetTransformations(target, null);
                        }, 300);
                    } else {
                        const backdrop = document.getElementById('focusPanelBackdrop');
                        if (backdrop) {
                            backdrop.style.transition = 'opacity 0.3s ease';
                            backdrop.style.opacity = '0';
                        }
                        setTimeout(() => {
                            target.style.transition = 'none';
                            panel.close();
                            panel._resetTransformations(target, backdrop);
                        }, 300);
                    }
                } else if (currentX > 10) {
                    target.style.transition = 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)';
                    target.style.transform = 'translateX(0)';

                    if (!isAnalysisVisible) {
                        const backdrop = document.getElementById('focusPanelBackdrop');
                        if (backdrop) {
                            backdrop.style.transition = 'opacity 0.45s ease';
                            backdrop.style.opacity = '1';
                            setTimeout(() => panel._resetTransformations(target, backdrop), 450);
                        } else {
                            setTimeout(() => panel._resetTransformations(target, null), 450);
                        }
                    } else {
                        setTimeout(() => panel._resetTransformations(target, null), 450);
                    }
                } else {
                    const backdrop = !isAnalysisVisible ? document.getElementById('focusPanelBackdrop') : null;
                    panel._resetTransformations(target, backdrop);
                }
            } else if (isPullingDown) {
                const threshold = 100;
                if (currentY > threshold) {
                    panel._isClosing = true;
                    target.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
                    target.style.transform = 'translateY(100vh)';

                    if (isAnalysisVisible) {
                        setTimeout(() => {
                            FocusPanelAnalysis.hide();
                            panel._resetTransformations(target, null);
                        }, 300);
                    } else {
                        setTimeout(() => {
                            target.style.transition = 'none';
                            panel.close();
                            panel._resetTransformations(target, null);
                        }, 300);
                    }
                } else if (currentY > 10) {
                    target.style.transition = 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)';
                    target.style.transform = 'translateX(0) translateY(0)';
                    setTimeout(() => panel._resetTransformations(target, null), 450);
                } else {
                    panel._resetTransformations(target, null);
                }
            }

            touchStartX = null;
            touchStartY = null;
            currentX = 0;
            currentY = 0;
            isEdgeSwiping = false;
            isPullingDown = false;
        }, { passive: true });
    },

    /**
     * Nettoie les transformations en ligne après un geste tactile
     * @param {HTMLElement|null} target
     * @param {HTMLElement|null} backdrop
     */
    resetTransformations(target, backdrop) {
        if (target) {
            target.style.transition = '';
            target.style.transform = '';
            target.style.willChange = '';
        }
        if (backdrop) {
            backdrop.style.transition = '';
            backdrop.style.opacity = '';
        }
    }
};
