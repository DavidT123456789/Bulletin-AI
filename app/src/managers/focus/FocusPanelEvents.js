/**
 * @fileoverview Focus Panel Events — Écouteurs DOM, raccourcis clavier et gestes tactiles de fermeture
 * Extrait de FocusPanelManager.js (Lot 11 — Découpage God Object #1)
 * @module managers/focus/FocusPanelEvents
 */

import { appState } from '../../state/State.js';
import { UI } from '../UIManager.js';
import { StorageManager } from '../StorageManager.js';
import { Utils } from '../../utils/Utils.js';
import { DOMHelper } from '../../utils/DOMHelper.js';
import { PromptService } from '../../services/PromptService.js';
import { FocusPanelHistory } from '../FocusPanelHistory.js';
import { FocusPanelJournal } from '../FocusPanelJournal.js';
import { FocusPanelAnalysis } from '../FocusPanelAnalysis.js';
import { FocusPanelHeader } from '../FocusPanelHeader.js';
import { FocusPanelNavigation } from '../FocusPanelNavigation.js';
import { FocusPanelStatus } from '../FocusPanelStatus.js';
import { SettingsModalListeners } from '../listeners/SettingsModalListeners.js';
import { ExportManager } from '../ExportManager.js';
import { SpeechRecognitionManager } from '../SpeechRecognitionManager.js';
import { bus, EVENTS } from '../../core/EventBus.js';

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

        // Progressive scroll-driven Dynamic Island morphing (desktop) + hysteresis capsule (mobile 2-tier)
        const focusContent = panelEl?.querySelector('.focus-main-page .focus-content');
        const focusHeader = panelEl?.querySelector('.focus-header');
        if (focusContent && focusHeader) {
            let scrollRafId = null;
            const SCROLL_RANGE = 40;
            const SCROLL_ENTER_MOBILE = 14;
            const SCROLL_EXIT_MOBILE = 4;

            const updateHeaderScrollState = () => {
                scrollRafId = null;
                if (!focusHeader || !focusContent) return;

                if (focusHeader.classList.contains('editing')) {
                    FocusPanelHeader.resetScrollState();
                } else {
                    const scrollTop = Math.max(0, focusContent.scrollTop);
                    if (window.innerWidth <= 600) {
                        focusHeader.style.removeProperty('--scroll-p');
                        const isScrolled = focusHeader.classList.contains('scrolled');
                        if (!isScrolled && scrollTop >= SCROLL_ENTER_MOBILE) {
                            focusHeader.classList.add('scrolled');
                        } else if (isScrolled && scrollTop <= SCROLL_EXIT_MOBILE) {
                            focusHeader.classList.remove('scrolled');
                            FocusPanelHeader.syncHeaderOffset();
                        }
                    } else {
                        const progress = Math.min(1, scrollTop / SCROLL_RANGE);
                        const wasScrolled = focusHeader.classList.contains('scrolled');
                        const nowScrolled = progress > 0.01;
                        focusHeader.style.setProperty('--scroll-p', progress.toFixed(3));
                        focusHeader.classList.toggle('scrolled', nowScrolled);
                        if (wasScrolled && !nowScrolled) {
                            FocusPanelHeader.syncHeaderOffset();
                        }
                    }
                }

                panel.updateScrollAffordances();
            };

            focusContent.addEventListener('scroll', () => {
                if (scrollRafId === null) {
                    scrollRafId = requestAnimationFrame(updateHeaderScrollState);
                }
            }, { passive: true });

            if (typeof ResizeObserver !== 'undefined') {
                const resizeObserver = new ResizeObserver(() => {
                    FocusPanelHeader.syncHeaderOffset();
                    panel.updateScrollAffordances();
                });
                resizeObserver.observe(focusContent);
                resizeObserver.observe(focusHeader);
            }

            focusContent.addEventListener('focusin', (e) => {
                if (!focusHeader.classList.contains('editing')) return;
                if (focusHeader.contains(e.target)) return;

                if (!panel.isCreationMode || FocusPanelHeader.hasCreationIdentityInput()) {
                    FocusPanelHeader.toggleEditMode(false, false);
                }
            });
        }

        const analysisContent = panelEl.querySelector('.focus-analysis-content-area');
        if (analysisContent) {
            panel.bindScrollAffordances?.(analysisContent);
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

        const blurOnPointerClick = (btn, event, delayed = false) => {
            if (btn && event?.detail > 0) {
                btn.blur();
                if (delayed) setTimeout(() => btn.blur(), 50);
            }
        };

        if (prevBtn) prevBtn.addEventListener('click', (e) => {
            FocusPanelNavigation.navigatePrev();
            blurOnPointerClick(prevBtn, e, true);
        });
        if (nextBtn) nextBtn.addEventListener('click', (e) => {
            FocusPanelNavigation.navigateNext();
            blurOnPointerClick(nextBtn, e, true);
        });
        if (analysisPrevBtn) analysisPrevBtn.addEventListener('click', (e) => {
            FocusPanelAnalysis.flushPendingEdit?.();
            FocusPanelNavigation.navigatePrev();
            blurOnPointerClick(analysisPrevBtn, e, true);
        });
        if (analysisNextBtn) analysisNextBtn.addEventListener('click', (e) => {
            FocusPanelAnalysis.flushPendingEdit?.();
            FocusPanelNavigation.navigateNext();
            blurOnPointerClick(analysisNextBtn, e, true);
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
                    blurOnPointerClick(generateBtn, e);
                    return;
                }
                panel.generate();
                blurOnPointerClick(generateBtn, e);
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
            copyBtn.addEventListener('click', (e) => {
                if (copyBtn.classList.contains('disabled')) return;
                if (copyBtn.dataset.copyMode === 'prompt') {
                    panel._copyPromptToClipboard();
                } else {
                    panel.copy();
                }
                blurOnPointerClick(copyBtn, e);
            });
            copyBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (copyBtn.classList.contains('disabled')) return;
                if (copyBtn.dataset.copyMode === 'prompt') {
                    panel._showPromptPreview();
                } else {
                    panel._copyPromptToClipboard();
                }
                copyBtn.blur();
            });
        }

        bus.on(EVENTS.APP_SETTINGS_CHANGED, () => {
            if (panel.currentStudentId) {
                FocusPanelStatus.updateWordCount();
                FocusPanelStatus.refreshAppreciationStatus();
            }
        });

        const analyzeBtn = document.getElementById('focusAnalyzeBtn');
        if (analyzeBtn) analyzeBtn.addEventListener('click', () => FocusPanelAnalysis.show());
        const printStudentBtn = document.getElementById('focusPrintStudentBtn');
        const analysisPrintBtn = document.getElementById('focusAnalysisPrintBtn');
        const handleStudentPrint = (btn, event) => {
            if (!panel.currentStudentId || panel.isCreationMode) return;
            FocusPanelAnalysis.flushPendingEdit?.();
            if (document.activeElement?.isContentEditable) document.activeElement.blur();
            panel._saveContext?.();
            ExportManager.exportStudentReportPdf(panel.currentStudentId);
            blurOnPointerClick(btn, event);
        };
        if (printStudentBtn) printStudentBtn.addEventListener('click', (e) => handleStudentPrint(printStudentBtn, e));
        if (analysisPrintBtn) analysisPrintBtn.addEventListener('click', (e) => handleStudentPrint(analysisPrintBtn, e));
        const analysisBackBtn = document.getElementById('focusAnalysisBackBtn');
        if (analysisBackBtn) analysisBackBtn.addEventListener('click', () => FocusPanelAnalysis.hide());
        const generateAnalysisBtn = document.getElementById('focusGenerateAnalysisBtn');
        if (generateAnalysisBtn) {
            generateAnalysisBtn.addEventListener('click', (e) => {
                FocusPanelAnalysis.generate();
                blurOnPointerClick(generateAnalysisBtn, e);
            });
            generateAnalysisBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (FocusPanelAnalysis._activeGenerations?.has(panel.currentStudentId)) return;
                FocusPanelAnalysis.showPromptPreview();
                generateAnalysisBtn.blur();
            });
        }

        const analysisPage = document.getElementById('focusAnalysisPage');
        if (analysisPage) {
            analysisPage.addEventListener('click', (e) => {
                const addTrigger = e.target.closest('[data-analysis-add]');
                if (addTrigger) {
                    e.preventDefault();
                    FocusPanelAnalysis.addEditableItem(addTrigger.dataset.analysisAdd);
                }
            });

            DOMHelper.bindInlineEditable(analysisPage, {
                selector: '.analysis-card-body li[contenteditable="true"]',
                onCancel: (editable) => FocusPanelAnalysis.cancelEditableItem(editable),
                onCommit: (editable) => FocusPanelAnalysis.commitEditableBlur(editable)
            });
        }

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

                Utils.markStudentModified(result, currentPeriod);
                result.studentData.periods[currentPeriod].grade = numVal;
                changed = true;
                panel._isGradeEdited = true;
            } else if (target.id === 'focusContextInput') {
                Utils.markStudentModified(result, currentPeriod);
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
                if (FocusPanelAnalysis.isVisible?.()) {
                    FocusPanelAnalysis.generate();
                    return;
                }
                if (SpeechRecognitionManager.isRecording?.() && SpeechRecognitionManager.getActiveTarget?.() === 'appreciation') return;
                panel.generate();
                return;
            }

            if (e.key === 'Escape') {
                if (document.getElementById('journalThresholdControl')?.classList.contains('open')) {
                    FocusPanelJournal.closeThresholdPopover?.();
                    return;
                }
                if (FocusPanelJournal.isEditing?.()) {
                    FocusPanelJournal.toggleQuickAdd(false);
                    return;
                }
                if (FocusPanelAnalysis.isVisible?.()) {
                    if (FocusPanelAnalysis._activeGenerations?.has(panel.currentStudentId)) {
                        FocusPanelAnalysis.cancelGenerationForStudent(panel.currentStudentId);
                        return;
                    }
                    FocusPanelAnalysis.hide();
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
                    blurOnPointerClick(btn, e);
                }
            });

            refinementOptions.addEventListener('contextmenu', (e) => {
                const btn = e.target.closest('[data-refine-type]');
                if (btn && !btn.classList.contains('disabled')) {
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
                    // Ensure existing appreciation is seeded into history before live mutation
                    if (result.studentData?.periods?.[appState.currentPeriod]?.appreciation?.trim()) {
                        FocusPanelHistory._getState?.(true);
                    }
                    Utils.markStudentModified(result, appState.currentPeriod);
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
                        FocusPanelHistory.scheduleEditCommit(content);
                    } else {
                        FocusPanelHistory.endEditSession();
                        result.appreciation = '';
                        if (result.studentData?.periods?.[appState.currentPeriod]) {
                            result.studentData.periods[appState.currentPeriod].appreciation = '';
                        }
                        FocusPanelStatus.updateHistoryIndicator();
                    }

                    panel._updateGenerateButton(result);
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
                if (!panel._isAppreciationEdited) {
                    FocusPanelHistory.endEditSession();
                    return;
                }

                const content = appreciationText.textContent?.trim() || '';
                const result = appState.generatedResults.find(r => r.id === panel.currentStudentId);

                if (result) {
                    const isRealContent = FocusPanelStatus._hasRealContent(content);

                    if (isRealContent) {
                        FocusPanelHistory.flushEditSession(content);
                        FocusPanelHistory.endEditSession();

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
                            panel._updateGenerateButton(result);
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
                const trimmedText = text.replace(/^[\r\n]+|[\r\n]+$/g, '');
                const result = appState.generatedResults.find(r => r.id === panel.currentStudentId);
                const studentPrenom = result?.studentData?.prenom || result?.prenom || '';
                const cleanText = studentPrenom
                    ? PromptService.deanonymizeText(trimmedText, studentPrenom)
                    : trimmedText;

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
                if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                    const key = e.key.toLowerCase();
                    if (key === 'z' && !e.shiftKey) {
                        const currentText = appreciationText.textContent || '';
                        if (FocusPanelHistory.canUndoWithPending(currentText)) {
                            e.preventDefault();
                            FocusPanelHistory.undo();
                        }
                    } else if ((key === 'z' && e.shiftKey) || key === 'y') {
                        if (FocusPanelHistory.canRedo()) {
                            e.preventDefault();
                            FocusPanelHistory.redo();
                        }
                    }
                }
            });
        }

        const historyIndicator = document.getElementById('focusHistoryIndicator');
        if (historyIndicator) {
            historyIndicator.addEventListener('click', (e) => {
                e.stopPropagation();
                if (historyIndicator.classList.contains('disabled')) return;
                FocusPanelHistory.showPopover();
            });
        }

        const historyPrevBtn = document.getElementById('focusHistoryPrevBtn');
        if (historyPrevBtn) {
            historyPrevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (historyPrevBtn.classList.contains('disabled')) return;
                FocusPanelHistory.undo();
            });
        }

        const historyNextBtn = document.getElementById('focusHistoryNextBtn');
        if (historyNextBtn) {
            historyNextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (historyNextBtn.classList.contains('disabled')) return;
                FocusPanelHistory.redo();
            });
        }

        const appreciationBadge = document.getElementById('focusAppreciationBadge');
        if (appreciationBadge) {
            appreciationBadge.addEventListener('click', () => {
                if (!appreciationBadge.classList.contains('modified')) return;
                const result = appState.generatedResults.find(r => r.id === panel.currentStudentId);
                if (!result) return;

                if (FocusPanelStatus._resolveSource(result) === 'ai') {
                    const genBtn = document.getElementById('focusGenerateBtn');
                    genBtn?.click();
                } else {
                    FocusPanelStatus.markDirtyAsVerified(result);
                    StorageManager.saveAppState();
                    panel._updateListRow(result);
                    FocusPanelStatus.updateSourceIndicator(result);
                    FocusPanelStatus.updateAppreciationStatus(null, { state: 'saved' });
                }
            });
        }

        const gradeInput = document.getElementById('focusCurrentGradeInput');
        if (gradeInput) {
            gradeInput.addEventListener('blur', () => {
                panel._saveContext();
                FocusPanelStatus.refreshAppreciationStatus();
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
                const targetControl = PromptService.getActiveMaxChars?.() ? 'iaMaxCharsToggle' : 'iaLengthSlider';
                SettingsModalListeners.openPersonalization(targetControl);
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
        let touchStartTime = 0;
        let currentX = 0;
        let currentY = 0;
        let isEdgeSwiping = false;
        let isPullingDown = false;
        let contentEl = null;
        let resetTimer = null;

        const clearPendingReset = () => {
            if (resetTimer) {
                clearTimeout(resetTimer);
                resetTimer = null;
            }
        };

        const resetGestureVars = () => {
            touchStartX = null;
            touchStartY = null;
            touchStartTime = 0;
            currentX = 0;
            currentY = 0;
            isEdgeSwiping = false;
            isPullingDown = false;
        };

        const prefersReducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

        panelEl.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) return;
            if (e.target.closest('button, [role="button"], input, textarea, select, .focus-nav-btn, .close-modal-btn')) return;

            const editable = e.target.closest('[contenteditable="true"]');
            if (editable && (editable === document.activeElement || editable.contains(document.activeElement) || !window.getSelection?.()?.isCollapsed)) {
                return;
            }

            const header = document.querySelector('.focus-header');
            if (header && header.classList.contains('editing')) return;

            clearPendingReset();
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = e.timeStamp || Date.now();
            currentX = 0;
            currentY = 0;

            const isAnalysisVisible = document.getElementById('focusPagesContainer')?.classList.contains('show-analysis');
            const panelLeft = panelEl.getBoundingClientRect?.().left || 0;

            isEdgeSwiping = touchStartX >= panelLeft && (touchStartX - panelLeft) < 30;
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
            const backdrop = !isAnalysisVisible ? document.getElementById('focusPanelBackdrop') : null;
            if (!target) {
                resetGestureVars();
                return;
            }

            const reducedMotion = prefersReducedMotion();

            if (isEdgeSwiping) {
                const threshold = window.innerWidth * 0.3;
                const elapsedMs = Math.max(1, (e.timeStamp || Date.now()) - touchStartTime);
                const velocity = currentX / elapsedMs;

                if (currentX > threshold || (currentX > 24 && velocity > 0.65)) {
                    panel._isClosing = true;
                    const finalizeClose = () => {
                        if (isAnalysisVisible) {
                            FocusPanelAnalysis.hide();
                            panel._resetTransformations(target, null);
                        } else {
                            target.style.transition = 'none';
                            panel.close();
                            panel._resetTransformations(target, backdrop);
                        }
                    };

                    if (reducedMotion) {
                        finalizeClose();
                    } else {
                        target.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
                        target.style.transform = 'translateX(100%)';
                        if (!isAnalysisVisible && backdrop) {
                            backdrop.style.transition = 'opacity 0.3s ease';
                            backdrop.style.opacity = '0';
                        }
                        clearPendingReset();
                        resetTimer = setTimeout(() => {
                            resetTimer = null;
                            finalizeClose();
                        }, 300);
                    }
                } else if (currentX > 10 && !reducedMotion) {
                    target.style.transition = 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)';
                    target.style.transform = 'translateX(0)';

                    if (backdrop) {
                        backdrop.style.transition = 'opacity 0.45s ease';
                        backdrop.style.opacity = '1';
                    }
                    clearPendingReset();
                    resetTimer = setTimeout(() => {
                        resetTimer = null;
                        panel._resetTransformations(target, backdrop);
                    }, 450);
                } else {
                    panel._resetTransformations(target, backdrop);
                }
            } else if (isPullingDown) {
                const threshold = 100;
                if (currentY > threshold) {
                    panel._isClosing = true;
                    const finalizePullClose = () => {
                        if (isAnalysisVisible) {
                            FocusPanelAnalysis.hide();
                            panel._resetTransformations(target, null);
                        } else {
                            target.style.transition = 'none';
                            panel.close();
                            panel._resetTransformations(target, null);
                        }
                    };

                    if (reducedMotion) {
                        finalizePullClose();
                    } else {
                        target.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
                        target.style.transform = 'translateY(100vh)';
                        clearPendingReset();
                        resetTimer = setTimeout(() => {
                            resetTimer = null;
                            finalizePullClose();
                        }, 300);
                    }
                } else if (currentY > 10 && !reducedMotion) {
                    target.style.transition = 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)';
                    target.style.transform = 'translateX(0) translateY(0)';
                    clearPendingReset();
                    resetTimer = setTimeout(() => {
                        resetTimer = null;
                        panel._resetTransformations(target, null);
                    }, 450);
                } else {
                    panel._resetTransformations(target, null);
                }
            }

            resetGestureVars();
        }, { passive: true });

        panelEl.addEventListener('touchcancel', () => {
            if (touchStartX === null && touchStartY === null && !isEdgeSwiping && !isPullingDown) return;
            clearPendingReset();
            const isAnalysisVisible = document.getElementById('focusPagesContainer')?.classList.contains('show-analysis');
            const target = isAnalysisVisible ? document.querySelector('.focus-analysis-page') : panelEl;
            const backdrop = !isAnalysisVisible ? document.getElementById('focusPanelBackdrop') : null;
            panel._resetTransformations(target, backdrop);
            resetGestureVars();
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
