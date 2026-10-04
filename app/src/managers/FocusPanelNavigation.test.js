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
        toggleEditMode: vi.fn()
    }
}));

vi.mock('./FocusPanelHistory.js', () => ({
    FocusPanelHistory: {
        load: vi.fn()
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
            onUpdateActiveRow: () => {}
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

        it('aborts active speech recognition when navigating between students', async () => {
            const { SpeechRecognitionManager } = await import('./SpeechRecognitionManager.js');
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
        });
    });
});
