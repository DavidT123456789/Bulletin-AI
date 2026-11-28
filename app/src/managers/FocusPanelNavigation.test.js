/**
 * @fileoverview Tests unitaires pour FocusPanelNavigation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FocusPanelNavigation } from './FocusPanelNavigation.js';
import { appState } from '../state/State.js';

vi.mock('../state/State.js', () => ({
    appState: {
        filteredResults: [],
        generatedResults: []
    }
}));

vi.mock('./UIManager.js', () => ({
    UI: {
        hideInlineSpinner: vi.fn()
    }
}));

vi.mock('./FocusPanelHeader.js', () => ({
    FocusPanelHeader: {
        toggleEditMode: vi.fn(),
        settleEditMode: vi.fn(),
        syncHeaderOffset: vi.fn(),
        resetScrollState: vi.fn()
    }
}));

vi.mock('./FocusPanelHistory.js', () => ({
    FocusPanelHistory: {
        load: vi.fn()
    }
}));

vi.mock('./FocusPanelJournal.js', () => ({
    FocusPanelJournal: {
        closeThresholdPopover: vi.fn(),
        resetEditingState: vi.fn()
    }
}));

vi.mock('./FocusPanelAnalysis.js', () => ({
    FocusPanelAnalysis: {
        isVisible: vi.fn(() => false),
        show: vi.fn()
    }
}));

vi.mock('./SpeechRecognitionManager.js', () => ({
    SpeechRecognitionManager: {
        abort: vi.fn(),
        stop: vi.fn(),
        isRecording: vi.fn(() => false)
    }
}));

describe('FocusPanelNavigation', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        appState.filteredResults = [];
        appState.generatedResults = [];
        // Reset default callbacks
        FocusPanelNavigation.callbacks = {
            getCurrentStudentId: () => null,
            setCurrentStudentId: () => {},
            getCurrentIndex: () => -1,
            setCurrentIndex: () => {},
            saveContext: () => {},
            renderContent: () => {},
            updateAppreciationStatus: () => {},
            onUpdateActiveRow: () => {},
            updateScrollAffordances: () => {}
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Default Callbacks & Safety', () => {
        it('should have safe no-op default callbacks that do not throw', () => {
            expect(() => FocusPanelNavigation.callbacks.getCurrentStudentId()).not.toThrow();
            expect(FocusPanelNavigation.callbacks.getCurrentStudentId()).toBeNull();
            expect(() => FocusPanelNavigation.callbacks.setCurrentStudentId('1')).not.toThrow();
            expect(() => FocusPanelNavigation.callbacks.getCurrentIndex()).not.toThrow();
            expect(FocusPanelNavigation.callbacks.getCurrentIndex()).toBe(-1);
            expect(() => FocusPanelNavigation.callbacks.setCurrentIndex(0)).not.toThrow();
            expect(() => FocusPanelNavigation.callbacks.saveContext()).not.toThrow();
            expect(() => FocusPanelNavigation.callbacks.renderContent({})).not.toThrow();
            expect(() => FocusPanelNavigation.callbacks.updateAppreciationStatus()).not.toThrow();
            expect(() => FocusPanelNavigation.callbacks.onUpdateActiveRow('1')).not.toThrow();
            expect(() => FocusPanelNavigation.callbacks.updateScrollAffordances()).not.toThrow();
        });

        it('should safely execute navigatePrev and navigateNext with default callbacks without throwing', () => {
            expect(() => FocusPanelNavigation.navigatePrev()).not.toThrow();
            expect(() => FocusPanelNavigation.navigateNext()).not.toThrow();
            expect(() => FocusPanelNavigation.updateControls()).not.toThrow();
        });
    });

    describe('updateControls', () => {
        it('updates buttons and position indicators when elements are present', () => {
            document.body.innerHTML = `
                <button id="focusPrevBtn"></button>
                <button id="focusNextBtn"></button>
                <span id="focusPosition"></span>
            `;

            appState.filteredResults = [{ id: '1' }, { id: '2' }, { id: '3' }];
            FocusPanelNavigation.init({
                getCurrentIndex: () => 0
            });

            FocusPanelNavigation.updateControls();

            const prevBtn = document.getElementById('focusPrevBtn');
            const nextBtn = document.getElementById('focusNextBtn');
            const pos = document.getElementById('focusPosition');

            expect(prevBtn.disabled).toBe(true);
            expect(nextBtn.disabled).toBe(false);
            expect(pos.textContent).toBe('1/3');
        });

        it('disables next button at the last item and enables prev button', () => {
            document.body.innerHTML = `
                <button id="focusPrevBtn"></button>
                <button id="focusNextBtn"></button>
                <span id="focusPosition"></span>
            `;

            appState.filteredResults = [{ id: '1' }, { id: '2' }, { id: '3' }];
            FocusPanelNavigation.init({
                getCurrentIndex: () => 2
            });

            FocusPanelNavigation.updateControls();

            const prevBtn = document.getElementById('focusPrevBtn');
            const nextBtn = document.getElementById('focusNextBtn');
            const pos = document.getElementById('focusPosition');

            expect(prevBtn.disabled).toBe(false);
            expect(nextBtn.disabled).toBe(true);
            expect(pos.textContent).toBe('3/3');
        });
    });

    describe('Navigation Transitions', () => {
        it('calls callbacks and updates student on fallback navigation', () => {
            const saveContextSpy = vi.fn();
            const setCurrentStudentIdSpy = vi.fn();
            const setCurrentIndexSpy = vi.fn();
            const renderContentSpy = vi.fn();
            const onUpdateActiveRowSpy = vi.fn();

            const student1 = { id: 's1', nom: 'Alice' };
            const student2 = { id: 's2', nom: 'Bob' };
            appState.filteredResults = [student1, student2];
            appState.generatedResults = [student1, student2];

            let currentIndex = 0;
            FocusPanelNavigation.init({
                getCurrentIndex: () => currentIndex,
                setCurrentIndex: (idx) => { currentIndex = idx; setCurrentIndexSpy(idx); },
                getCurrentStudentId: () => 's1',
                setCurrentStudentId: setCurrentStudentIdSpy,
                saveContext: saveContextSpy,
                renderContent: renderContentSpy,
                onUpdateActiveRow: onUpdateActiveRowSpy,
                updateAppreciationStatus: vi.fn()
            });

            FocusPanelNavigation.navigateNext();

            expect(saveContextSpy).toHaveBeenCalled();
            expect(setCurrentStudentIdSpy).toHaveBeenCalledWith('s2');
            expect(setCurrentIndexSpy).toHaveBeenCalledWith(1);
            expect(renderContentSpy).toHaveBeenCalledWith(student2);
            expect(onUpdateActiveRowSpy).toHaveBeenCalledWith('s2');
        });

        it('does not navigate prev when currentIndex <= 0', () => {
            const saveContextSpy = vi.fn();
            appState.filteredResults = [{ id: 's1' }, { id: 's2' }];

            FocusPanelNavigation.init({
                getCurrentIndex: () => 0,
                saveContext: saveContextSpy
            });

            FocusPanelNavigation.navigatePrev();
            expect(saveContextSpy).not.toHaveBeenCalled();
        });

        it('does not navigate next when currentIndex is at end', () => {
            const saveContextSpy = vi.fn();
            appState.filteredResults = [{ id: 's1' }, { id: 's2' }];

            FocusPanelNavigation.init({
                getCurrentIndex: () => 1,
                saveContext: saveContextSpy
            });

            FocusPanelNavigation.navigateNext();
            expect(saveContextSpy).not.toHaveBeenCalled();
        });

        it('aborts active speech recognition and resets journal editing state when navigating between students', async () => {
            const { SpeechRecognitionManager } = await import('./SpeechRecognitionManager.js');
            const { FocusPanelJournal } = await import('./FocusPanelJournal.js');
            const student1 = { id: 's1', nom: 'Alice' };
            const student2 = { id: 's2', nom: 'Bob' };
            appState.filteredResults = [student1, student2];
            appState.generatedResults = [student1, student2];

            FocusPanelNavigation.init({
                getCurrentIndex: () => 0,
                setCurrentIndex: vi.fn(),
                getCurrentStudentId: () => 's1',
                setCurrentStudentId: vi.fn(),
                saveContext: vi.fn(),
                renderContent: vi.fn(),
                onUpdateActiveRow: vi.fn(),
                updateAppreciationStatus: vi.fn()
            });

            FocusPanelNavigation.navigateNext();
            expect(SpeechRecognitionManager.abort).toHaveBeenCalled();
            expect(FocusPanelJournal.closeThresholdPopover).toHaveBeenCalled();
            expect(FocusPanelJournal.resetEditingState).toHaveBeenCalled();
        });
    });

    describe('Touch Swipe Navigation', () => {
        const dispatchTouch = (el, type, x, y) => {
            const evt = new Event(type);
            if (type === 'touchend' || type === 'touchcancel') {
                evt.touches = [];
                evt.changedTouches = [{ clientX: x, clientY: y }];
            } else {
                evt.touches = [{ clientX: x, clientY: y }];
            }
            el.dispatchEvent(evt);
        };

        const setupSwipeDom = () => {
            document.body.innerHTML = `
                <div id="focusPagesContainer">
                    <div class="focus-main-page">
                        <div class="focus-content"></div>
                    </div>
                </div>
            `;
            const container = document.getElementById('focusPagesContainer');
            const content = document.querySelector('.focus-main-page .focus-content');
            Object.defineProperty(container, 'clientWidth', { value: 480, configurable: true });
            Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
            return { container, content };
        };

        it('switches student after a moderate swipe (~60px) even on a wide viewport', () => {
            const { container } = setupSwipeDom();
            const student1 = { id: 's1', nom: 'Alice' };
            const student2 = { id: 's2', nom: 'Bob' };
            appState.filteredResults = [student1, student2];
            appState.generatedResults = [student1, student2];

            let currentIndex = 0;
            const setCurrentStudentIdSpy = vi.fn();
            FocusPanelNavigation.init({
                getCurrentIndex: () => currentIndex,
                setCurrentIndex: (idx) => { currentIndex = idx; },
                getCurrentStudentId: () => appState.filteredResults[currentIndex]?.id,
                setCurrentStudentId: setCurrentStudentIdSpy,
                saveContext: vi.fn(),
                renderContent: vi.fn(),
                onUpdateActiveRow: vi.fn(),
                updateAppreciationStatus: vi.fn(),
                updateScrollAffordances: vi.fn()
            });

            dispatchTouch(container, 'touchstart', 300, 200);
            dispatchTouch(container, 'touchmove', 238, 200);
            dispatchTouch(container, 'touchend', 238, 200);

            expect(currentIndex).toBe(1);
            expect(setCurrentStudentIdSpy).toHaveBeenCalledWith('s2');
        });

        it('supports quick flicks (~30px) while snapping back on slow small drags and touchcancel', () => {
            vi.useFakeTimers();
            const { container, content } = setupSwipeDom();
            const student1 = { id: 's1', nom: 'Alice' };
            const student2 = { id: 's2', nom: 'Bob' };
            appState.filteredResults = [student1, student2];
            appState.generatedResults = [student1, student2];

            let currentIndex = 0;
            FocusPanelNavigation.init({
                getCurrentIndex: () => currentIndex,
                setCurrentIndex: (idx) => { currentIndex = idx; },
                getCurrentStudentId: () => appState.filteredResults[currentIndex]?.id,
                setCurrentStudentId: vi.fn(),
                saveContext: vi.fn(),
                renderContent: vi.fn(),
                onUpdateActiveRow: vi.fn(),
                updateAppreciationStatus: vi.fn(),
                updateScrollAffordances: vi.fn()
            });

            // 1. Petit glissement lent (30px en 250ms) -> rebond sans changer d'élève
            dispatchTouch(container, 'touchstart', 300, 200);
            vi.advanceTimersByTime(250);
            dispatchTouch(container, 'touchmove', 270, 200);
            dispatchTouch(container, 'touchend', 270, 200);
            expect(currentIndex).toBe(0);
            expect(content.style.transform).toContain('translate3d(0, 0, 0)');

            // 2. Flick rapide (32px en 40ms -> 0.8 px/ms) -> passe à l'élève suivant
            dispatchTouch(container, 'touchstart', 300, 200);
            vi.advanceTimersByTime(40);
            dispatchTouch(container, 'touchmove', 268, 200);
            dispatchTouch(container, 'touchend', 268, 200);
            expect(currentIndex).toBe(1);

            // 3. touchcancel pendant un grand swipe -> revient sans naviguer
            dispatchTouch(container, 'touchstart', 200, 200);
            vi.advanceTimersByTime(50);
            dispatchTouch(container, 'touchmove', 320, 200);
            dispatchTouch(container, 'touchcancel', 320, 200);
            expect(currentIndex).toBe(1);
            expect(content.style.transform).toContain('translate3d(0, 0, 0)');

            vi.useRealTimers();
        });

        it('allows swiping from left edge, unfocused fields, and static buttons while ignoring focused inputs and absorbing synthetic clicks', () => {
            const { container, content } = setupSwipeDom();
            content.innerHTML = `
                <textarea id="focusContextInput"></textarea>
                <div id="focusAppreciationText" contenteditable="true">Texte</div>
                <button id="focusGenerateBtn" type="button">Générer</button>
            `;
            const textarea = document.getElementById('focusContextInput');
            const editable = document.getElementById('focusAppreciationText');
            const genBtn = document.getElementById('focusGenerateBtn');
            const genClickSpy = vi.fn();
            genBtn.addEventListener('click', genClickSpy);

            const student1 = { id: 's1', nom: 'Alice' };
            const student2 = { id: 's2', nom: 'Bob' };
            appState.filteredResults = [student1, student2];
            appState.generatedResults = [student1, student2];

            let currentIndex = 1;
            FocusPanelNavigation.init({
                getCurrentIndex: () => currentIndex,
                setCurrentIndex: (idx) => { currentIndex = idx; },
                getCurrentStudentId: () => appState.filteredResults[currentIndex]?.id,
                setCurrentStudentId: vi.fn(),
                saveContext: vi.fn(),
                renderContent: vi.fn(),
                onUpdateActiveRow: vi.fn(),
                updateAppreciationStatus: vi.fn(),
                updateScrollAffordances: vi.fn()
            });

            // 1. Edge swipe starting at clientX = 12 is no longer blocked -> navigates to prev
            dispatchTouch(container, 'touchstart', 12, 200);
            dispatchTouch(container, 'touchmove', 160, 200);
            dispatchTouch(container, 'touchend', 160, 200);
            expect(currentIndex).toBe(0);

            // 2. Touch on unfocused textarea navigates next
            const tsTextarea = new Event('touchstart', { bubbles: true });
            tsTextarea.touches = [{ clientX: 250, clientY: 200 }];
            textarea.dispatchEvent(tsTextarea);
            dispatchTouch(container, 'touchmove', 120, 200);
            dispatchTouch(container, 'touchend', 120, 200);
            expect(currentIndex).toBe(1);

            // 3. Touch on resting button navigates prev AND absorbs trailing synthetic click
            const tsBtn = new Event('touchstart', { bubbles: true });
            tsBtn.touches = [{ clientX: 120, clientY: 200 }];
            genBtn.dispatchEvent(tsBtn);
            dispatchTouch(container, 'touchmove', 250, 200);
            dispatchTouch(container, 'touchend', 250, 200);
            expect(currentIndex).toBe(0);
            genBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(genClickSpy).not.toHaveBeenCalled();

            // 4. Touch on focused contenteditable or focused textarea must NOT trigger student swipe
            editable.focus();
            const touchStart = new Event('touchstart', { bubbles: true });
            touchStart.touches = [{ clientX: 250, clientY: 200 }];
            editable.dispatchEvent(touchStart);
            dispatchTouch(container, 'touchmove', 100, 200);
            dispatchTouch(container, 'touchend', 100, 200);
            expect(currentIndex).toBe(0);

            textarea.focus();
            const touchStartTa = new Event('touchstart', { bubbles: true });
            touchStartTa.touches = [{ clientX: 250, clientY: 200 }];
            textarea.dispatchEvent(touchStartTa);
            dispatchTouch(container, 'touchmove', 100, 200);
            dispatchTouch(container, 'touchend', 100, 200);
            expect(currentIndex).toBe(0);
        });

        it('yields rightward swipes on left-edge close zone while keeping leftward edge swipes and center swipes active', () => {
            const { container, content } = setupSwipeDom();
            const student1 = { id: 's1', nom: 'Alice' };
            const student2 = { id: 's2', nom: 'Bob' };
            appState.filteredResults = [student1, student2];
            appState.generatedResults = [student1, student2];

            let currentIndex = 1;
            FocusPanelNavigation.init({
                getCurrentIndex: () => currentIndex,
                setCurrentIndex: (idx) => { currentIndex = idx; },
                getCurrentStudentId: () => appState.filteredResults[currentIndex]?.id,
                setCurrentStudentId: vi.fn(),
                saveContext: vi.fn(),
                renderContent: vi.fn(),
                onUpdateActiveRow: vi.fn(),
                updateAppreciationStatus: vi.fn(),
                updateScrollAffordances: vi.fn(),
                isLeftEdgeCloseCandidate: (clientX) => clientX <= 20
            });

            // 1. Rightward swipe starting at x = 12 yields cleanly to panel close (does not navigate prev or transform content)
            dispatchTouch(container, 'touchstart', 12, 200);
            dispatchTouch(container, 'touchmove', 140, 200);
            expect(content.style.transform).toBe('');
            dispatchTouch(container, 'touchend', 140, 200);
            expect(currentIndex).toBe(1);

            // 2. Rightward swipe starting at x = 35 (> 20) still navigates to prev student
            dispatchTouch(container, 'touchstart', 35, 200);
            dispatchTouch(container, 'touchmove', 175, 200);
            dispatchTouch(container, 'touchend', 175, 200);
            expect(currentIndex).toBe(0);

            // 3. Leftward swipe starting at x = 15 (even inside left edge!) still navigates to next student
            dispatchTouch(container, 'touchstart', 15, 200);
            dispatchTouch(container, 'touchmove', -80, 200);
            dispatchTouch(container, 'touchend', -80, 200);
            expect(currentIndex).toBe(1);
        });

        it('starts carousel cross-slide synchronously calibrated to panel width, respects reduced motion & instant repeat, and cleans up via cancelActiveTransition()', () => {
            document.body.innerHTML = `
                <div id="focusPanel">
                    <div class="focus-header">
                        <div class="focus-header-identity"></div>
                    </div>
                    <div id="focusPagesContainer">
                        <div class="focus-main-page">
                            <div class="focus-content"></div>
                        </div>
                    </div>
                </div>
            `;
            const container = document.getElementById('focusPanel');
            const content = document.querySelector('.focus-main-page .focus-content');
            Object.defineProperty(container, 'clientWidth', { value: 480, configurable: true });
            Object.defineProperty(content, 'clientWidth', { value: 480, configurable: true });
            Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });

            const student1 = { id: 's1', nom: 'Alice' };
            const student2 = { id: 's2', nom: 'Bob' };
            appState.filteredResults = [student1, student2];
            appState.generatedResults = [student1, student2];

            let currentIndex = 0;
            FocusPanelNavigation.init({
                getCurrentIndex: () => currentIndex,
                setCurrentIndex: (idx) => { currentIndex = idx; },
                getCurrentStudentId: () => appState.filteredResults[currentIndex]?.id,
                setCurrentStudentId: vi.fn(),
                saveContext: vi.fn(),
                renderContent: vi.fn(),
                onUpdateActiveRow: vi.fn(),
                updateAppreciationStatus: vi.fn(),
                updateScrollAffordances: vi.fn()
            });

            const origMatchMedia = window.matchMedia;
            window.matchMedia = vi.fn().mockReturnValue({ matches: true });
            try {
                FocusPanelNavigation.navigateNext();
                expect(currentIndex).toBe(1);
                expect(FocusPanelNavigation._activeClone).toBeNull();
                expect(content.style.opacity).toBe('');
            } finally {
                window.matchMedia = origMatchMedia;
            }

            // Carousel starts synchronously on Frame 0 calibrated to panelWidth (480px, not 1920*0.6)
            window.matchMedia = vi.fn().mockReturnValue({ matches: false });
            try {
                FocusPanelNavigation.navigatePrev();
                expect(currentIndex).toBe(0);
                expect(FocusPanelNavigation._activeClone).not.toBeNull();
                expect(FocusPanelNavigation._activeClone.getAttribute('aria-hidden')).toBe('true');
                expect(FocusPanelNavigation._activeClone.style.transform).toContain('translate3d(480px, 0, 0)');
                expect(content.style.transform).toContain('translate3d(0, 0, 0)');
                expect(content.style.opacity).toBe('1');

                // cancelActiveTransition cleans up outgoing clone and inline styles
                FocusPanelNavigation.cancelActiveTransition();
                expect(FocusPanelNavigation._activeClone).toBeNull();
                expect(content.style.opacity).toBe('');
                expect(content.style.transform).toBe('');

                // instant: true (held key repeat) skips cloning and animation
                FocusPanelNavigation.navigateNext({ instant: true });
                expect(currentIndex).toBe(1);
                expect(FocusPanelNavigation._activeClone).toBeNull();
                expect(content.style.opacity).toBe('');
            } finally {
                window.matchMedia = origMatchMedia;
            }
        });

        it('plays directional boundary bounce at list start/end, respects bounce: false and reduced motion, and cleans up on animationend/timeout', () => {
            vi.useFakeTimers();
            document.body.innerHTML = `
                <div id="focusPanel">
                    <div class="focus-header">
                        <div class="focus-header-identity"></div>
                    </div>
                    <div id="focusPagesContainer">
                        <div class="focus-main-page">
                            <div class="focus-content"></div>
                        </div>
                    </div>
                </div>
            `;
            const content = document.querySelector('.focus-main-page .focus-content');
            const identity = document.querySelector('.focus-header-identity');

            const student1 = { id: 's1', nom: 'Alice' };
            const student2 = { id: 's2', nom: 'Bob' };
            appState.filteredResults = [student1, student2];
            appState.generatedResults = [student1, student2];

            let currentIndex = 0;
            FocusPanelNavigation.init({
                getCurrentIndex: () => currentIndex,
                setCurrentIndex: (idx) => { currentIndex = idx; },
                getCurrentStudentId: () => appState.filteredResults[currentIndex]?.id,
                setCurrentStudentId: vi.fn(),
                saveContext: vi.fn(),
                renderContent: vi.fn(),
                onUpdateActiveRow: vi.fn(),
                updateAppreciationStatus: vi.fn(),
                updateScrollAffordances: vi.fn()
            });

            const origMatchMedia = window.matchMedia;
            window.matchMedia = vi.fn().mockReturnValue({ matches: false });
            try {
                // Start boundary -> nudges rightward (+10px / +6px)
                FocusPanelNavigation.navigatePrev();
                expect(currentIndex).toBe(0);
                expect(content.classList.contains('nav-boundary-bounce')).toBe(true);
                expect(content.style.getPropertyValue('--nav-bounce-x')).toBe('10px');
                expect(identity.classList.contains('nav-boundary-bounce')).toBe(true);
                expect(identity.style.getPropertyValue('--nav-bounce-x')).toBe('6px');

                // Auto cleanup after fallback timer
                vi.advanceTimersByTime(270);
                expect(content.classList.contains('nav-boundary-bounce')).toBe(false);
                expect(identity.classList.contains('nav-boundary-bounce')).toBe(false);

                // bounce: false (key repeat) does not trigger bounce
                FocusPanelNavigation.navigatePrev({ bounce: false });
                expect(content.classList.contains('nav-boundary-bounce')).toBe(false);

                // End boundary -> nudges leftward (-10px / -6px), cleared on animationend
                currentIndex = 1;
                FocusPanelNavigation.navigateNext();
                expect(content.classList.contains('nav-boundary-bounce')).toBe(true);
                expect(content.style.getPropertyValue('--nav-bounce-x')).toBe('-10px');
                expect(identity.style.getPropertyValue('--nav-bounce-x')).toBe('-6px');

                content.dispatchEvent(new Event('animationend'));
                expect(content.classList.contains('nav-boundary-bounce')).toBe(false);

                // Reduced motion skips boundary bounce
                window.matchMedia = vi.fn().mockReturnValue({ matches: true });
                FocusPanelNavigation.navigateNext();
                expect(content.classList.contains('nav-boundary-bounce')).toBe(false);

                // Empty list / creation mode (index -1) never bounces
                window.matchMedia = vi.fn().mockReturnValue({ matches: false });
                currentIndex = -1;
                FocusPanelNavigation.navigatePrev();
                FocusPanelNavigation.navigateNext();
                expect(content.classList.contains('nav-boundary-bounce')).toBe(false);
            } finally {
                window.matchMedia = origMatchMedia;
                vi.useRealTimers();
            }
        });
    });
});
