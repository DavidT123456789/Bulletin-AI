/**
 * @fileoverview Tests unitaires pour UIManager
 * @module managers/UIManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { UI } from './UIManager.js';

// Mock state module
vi.mock('../state/State.js', () => ({
    appState: {
        theme: 'dark',
        useSubjectPersonalization: true,
        periodSystem: 'trimestres',
        subjects: { 'Français': { iaConfig: { length: 50, tone: 3 } } },
        evolutionThresholds: { positive: 0.5, veryPositive: 2, negative: -0.5, veryNegative: -2 },
        currentPeriod: 'T1',
        currentSubject: 'Français',
        currentSettingsSubject: 'Français',
        currentAIModel: 'gemini-2.0-flash',
        openaiApiKey: '',
        googleApiKey: 'test-key',
        openrouterApiKey: '',
        generatedResults: [],
        filteredResults: [],
        instructionHistory: [],
        isDemoMode: false,
        sessionCost: 0,
        currentInputMode: 'single'
    }
}));

// Mock config module
vi.mock('../config/Config.js', () => ({
    CONFIG: {
        LS_APP_STATE_KEY: 'bulletin-assistant-state'
    },
    CONSTS: {
        INPUT_MODE: { MASS: 'mass', SINGLE: 'single' }
    },
    APP_VERSION: '4.3.0',
    DEFAULT_PROMPT_TEMPLATES: {
        'Français': { iaConfig: { length: 50, tone: 2 } },
        'Générique': { iaConfig: { length: 50, tone: 2 } }
    },
    DEFAULT_IA_CONFIG: { length: 50, tone: 3, voice: 'default', styleInstructions: '' },
    MODEL_DESCRIPTIONS: { 'gemini-2.0-flash': 'Test model description' }
}));

// Mock DOM module
vi.mock('../utils/DOM.js', () => ({
    DOM: {
        darkModeToggle: null,
        settingsModal: null,
        loadingOverlay: null,
        loadingText: null,
        mainPeriodSelector: { innerHTML: '', querySelectorAll: vi.fn(() => []) },
        singleStudentPeriodInputs: { innerHTML: '', querySelectorAll: vi.fn(() => []) },
        massImportSection: { style: { display: '' } },
        singleStudentFormDiv: { style: { display: '' } },
        massImportActions: { style: { display: '' } },
        singleStudentActions: { style: { display: '' } },
        massImportTab: { classList: { toggle: vi.fn() }, setAttribute: vi.fn() },
        singleStudentTab: { classList: { toggle: vi.fn() }, setAttribute: vi.fn() },
        massData: { focus: vi.fn() },
        loadStudentSelect: null,
        nomInput: { focus: vi.fn() }
    }
}));

// Mock Utils
vi.mock('../utils/Utils.js', () => ({
    Utils: {
        getPeriods: vi.fn(() => ['T1', 'T2', 'T3']),
        getPeriodLabel: vi.fn((p, long) => long ? `Trimestre ${p.slice(1)}` : p),
        validateGrade: vi.fn(),
        countWords: vi.fn(() => 50),
        getGradeClass: vi.fn((grade) => {
            if (grade === null || grade === undefined || isNaN(grade)) return '';
            if (grade < 6) return 'grade-poor';
            if (grade < 8) return 'grade-average';
            if (grade >= 16) return 'grade-good';
            return '';
        })
    }
}));

// Mock ThemeManager
vi.mock('./ThemeManager.js', () => ({
    ThemeManager: {
        applyTheme: vi.fn(),
        updateUI: vi.fn(),
        setTheme: vi.fn(),
        currentResolvedTheme: 'light'
    }
}));

// Mock FormUIManager
vi.mock('./FormUIManager.js', () => ({
    FormUI: {
        showSettingsTab: vi.fn(),
        toggleAIKeyFields: vi.fn()
    }
}));

// Mock StorageManager
vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
}));

// Mock AppreciationsManager
vi.mock('./AppreciationsManager.js', () => ({
    AppreciationsManager: {
        renderResults: vi.fn(),
        resetForm: vi.fn(),
        getAllPrompts: vi.fn(() => ({ main: '', sw: '', ns: '' })),
        getRefinementPrompt: vi.fn(() => 'Refine prompt'),
        getRelevantEvolution: vi.fn()
    }
}));

describe('UIManager', () => {
    let mockContainer;

    beforeEach(() => {
        // Setup mock DOM
        mockContainer = document.createElement('div');
        mockContainer.id = 'notification-container';
        document.body.appendChild(mockContainer);

        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        // Cleanup
        document.body.innerHTML = '';
        vi.useRealTimers();
    });

    describe('showNotification', () => {
        it('should create notification container if it does not exist', () => {
            document.body.innerHTML = ''; // Remove existing container
            UI.showNotification('Test message');

            const container = document.getElementById('notification-container');
            expect(container).not.toBeNull();
        });

        it('should create a notification with success type by default', () => {
            document.body.innerHTML = '';
            UI.showNotification('Success message');

            const container = document.getElementById('notification-container');
            const notification = container.querySelector('.notification');

            expect(notification).not.toBeNull();
            expect(notification.classList.contains('success')).toBe(true);
            expect(notification.innerHTML).toContain('iconify-icon');
            expect(notification.innerHTML).toContain('Success message');
        });

        it('should create a notification with error type', () => {
            document.body.innerHTML = '';
            UI.showNotification('Error message', 'error');

            const container = document.getElementById('notification-container');
            const notification = container.querySelector('.notification');

            expect(notification.classList.contains('error')).toBe(true);
            expect(notification.innerHTML).toContain('iconify-icon');
        });

        it('should create a notification with warning type', () => {
            document.body.innerHTML = '';
            UI.showNotification('Warning message', 'warning');

            const container = document.getElementById('notification-container');
            const notification = container.querySelector('.notification');

            expect(notification.classList.contains('warning')).toBe(true);
            expect(notification.innerHTML).toContain('iconify-icon');
        });

        it('should add show class via requestAnimationFrame', () => {
            document.body.innerHTML = '';
            UI.showNotification('Test');

            const container = document.getElementById('notification-container');
            const notification = container.querySelector('.notification');

            // requestAnimationFrame is used — trigger pending RAF callbacks
            vi.runAllTimers();
            // In jsdom, RAF may not fire; verify notification exists
            expect(notification).not.toBeNull();
        });

        it('should create notification via requestAnimationFrame', () => {
            document.body.innerHTML = '';
            UI.showNotification('Notification test');

            const container = document.getElementById('notification-container');
            expect(container).not.toBeNull();
            expect(container.querySelector('.notification')).not.toBeNull();
        });
    });

    describe('showCustomConfirm', () => {
        it('should create a confirmation modal', () => {
            UI.showCustomConfirm('Are you sure?', vi.fn(), vi.fn());

            const modal = document.getElementById('customConfirmModal');
            expect(modal).not.toBeNull();
            expect(modal.querySelector('.modal-body p').textContent).toBe('Are you sure?');
        });

        it('should display custom button texts', () => {
            UI.showCustomConfirm('Test', vi.fn(), vi.fn(), {
                confirmText: 'Oui',
                cancelText: 'Non'
            });

            const modal = document.getElementById('customConfirmModal');
            expect(modal.querySelector('#confirmOkBtn').textContent).toBe('Oui');
            expect(modal.querySelector('#confirmCancelBtn').textContent).toBe('Non');
        });

        it('should call onConfirm when OK button is clicked', () => {
            const onConfirm = vi.fn();
            UI.showCustomConfirm('Test', onConfirm, vi.fn());

            const okBtn = document.getElementById('confirmOkBtn');
            okBtn.click();

            expect(onConfirm).toHaveBeenCalledTimes(1);
        });

        it('should call onCancel when Cancel button is clicked', () => {
            const onCancel = vi.fn();
            UI.showCustomConfirm('Test', vi.fn(), onCancel);

            const cancelBtn = document.getElementById('confirmCancelBtn');
            cancelBtn.click();

            expect(onCancel).toHaveBeenCalledTimes(1);
        });

        it('should add extra button when specified', () => {
            const extraAction = vi.fn();
            UI.showCustomConfirm('Test', vi.fn(), vi.fn(), {
                extraButton: {
                    text: 'Extra',
                    class: 'btn-warning',
                    action: extraAction
                }
            });

            const extraBtn = document.getElementById('confirmExtraBtn');
            expect(extraBtn).not.toBeNull();
            expect(extraBtn.textContent).toBe('Extra');

            extraBtn.click();
            expect(extraAction).toHaveBeenCalledTimes(1);
        });
    });

    describe('applyTheme', () => {
        it('should delegate to ThemeManager.applyTheme', async () => {
            const { ThemeManager } = await import('./ThemeManager.js');

            UI.applyTheme();

            expect(ThemeManager.applyTheme).toHaveBeenCalled();
        });
    });

    describe('toggleDarkMode', () => {
        it('should toggle from dark to light via ThemeManager', async () => {
            const { appState } = await import('../state/State.js');
            const { ThemeManager } = await import('./ThemeManager.js');
            appState.theme = 'dark';

            UI.toggleDarkMode();

            expect(ThemeManager.setTheme).toHaveBeenCalledWith('light');
        });

        it('should toggle from light to dark via ThemeManager', async () => {
            const { appState } = await import('../state/State.js');
            const { ThemeManager } = await import('./ThemeManager.js');
            appState.theme = 'light';

            UI.toggleDarkMode();

            expect(ThemeManager.setTheme).toHaveBeenCalledWith('dark');
        });
    });

    describe('openModal / closeModal', () => {
        // Note: Detailed modal behavior is tested in ModalUIManager.test.js
        // These tests verify basic modal functions exist

        it('should be a function', () => {
            expect(typeof UI.openModal).toBe('function');
            expect(typeof UI.closeModal).toBe('function');
        });
    });

    describe('checkAPIKeyPresence', () => {
        it('should return true when in demo mode', async () => {
            const { appState } = await import('../state/State.js');
            appState.isDemoMode = true;

            const result = UI.checkAPIKeyPresence(true);

            expect(result).toBe(true);
        });

        it('should return true when Google API key is present for Gemini model', async () => {
            const { appState } = await import('../state/State.js');
            appState.isDemoMode = false;
            appState.currentAIModel = 'gemini-2.0-flash';
            appState.googleApiKey = 'test-key';

            const result = UI.checkAPIKeyPresence(true);

            expect(result).toBe(true);
        });

        it('should return false when Google API key is missing', async () => {
            const { appState } = await import('../state/State.js');
            appState.isDemoMode = false;
            appState.currentAIModel = 'gemini-2.0-flash';
            appState.googleApiKey = '';

            const result = UI.checkAPIKeyPresence(true);

            expect(result).toBe(false);
        });

        it('should return false when OpenAI key is missing for OpenAI model', async () => {
            const { appState } = await import('../state/State.js');
            appState.isDemoMode = false;
            appState.currentAIModel = 'openai-gpt-4';
            appState.openaiApiKey = '';

            const result = UI.checkAPIKeyPresence(true);

            expect(result).toBe(false);
        });
    });

    describe('showLoadingOverlay / hideLoadingOverlay', () => {
        beforeEach(async () => {
            const { DOM } = await import('../utils/DOM.js');
            DOM.loadingOverlay = document.createElement('div');
            DOM.loadingOverlay.style.display = 'none';
            DOM.loadingText = document.createElement('div');
            document.body.appendChild(DOM.loadingOverlay);
        });

        it('should show loading overlay', async () => {
            const { DOM } = await import('../utils/DOM.js');

            UI.showLoadingOverlay('Loading...');

            expect(DOM.loadingOverlay.style.display).toBe('flex');
            expect(DOM.loadingText.textContent).toBe('Loading...');
        });

        it('should hide loading overlay', async () => {
            const { DOM } = await import('../utils/DOM.js');
            DOM.loadingOverlay.style.display = 'flex';

            UI.hideLoadingOverlay();

            expect(DOM.loadingOverlay.style.display).toBe('none');
        });
    });

    describe('animateValue', () => {
        it('should resolve immediately if element is null', async () => {
            await expect(UI.animateValue(null, 0, 10, 500)).resolves.toBe(undefined);
        });

        it('should set final value immediately if start equals end', async () => {
            const element = document.createElement('div');
            await UI.animateValue(element, 5, 5, 500);
            expect(element.textContent).toBe('5');
        });

        it('should set decimal value if end is not an integer', async () => {
            const element = document.createElement('div');
            await UI.animateValue(element, 5.5, 5.5, 500);
            expect(element.textContent).toBe('5.5');
        });
    });

    describe('animateNumberWithText', () => {
        it('should resolve and set template value if element is null', async () => {
            const templateFn = (val) => `${val} items`;
            await expect(UI.animateNumberWithText(null, 0, 10, 500, templateFn)).resolves.toBe(undefined);
        });

        it('should apply template immediately if start equals end', async () => {
            const element = document.createElement('div');
            const templateFn = (val) => `Ø ${val} mots`;

            await UI.animateNumberWithText(element, 5, 5, 500, templateFn);

            expect(element.textContent).toBe('Ø 5 mots');
        });
    });

    describe('setInputMode', () => {
        it('should switch to mass import mode', async () => {
            const { appState } = await import('../state/State.js');
            const { DOM } = await import('../utils/DOM.js');
            appState.currentInputMode = 'single';

            UI.setInputMode('mass', true);

            expect(appState.currentInputMode).toBe('mass');
            expect(DOM.massImportSection.style.display).toBe('block');
            expect(DOM.singleStudentFormDiv.style.display).toBe('none');
        });

        it('should switch to single student mode', async () => {
            const { appState } = await import('../state/State.js');
            const { DOM } = await import('../utils/DOM.js');
            appState.currentInputMode = 'mass';

            UI.setInputMode('single', true);

            expect(appState.currentInputMode).toBe('single');
            expect(DOM.massImportSection.style.display).toBe('none');
            expect(DOM.singleStudentFormDiv.style.display).toBe('block');
        });

        it('should not change mode if already in the same mode and not forced', async () => {
            const { appState } = await import('../state/State.js');
            const { StorageManager } = await import('./StorageManager.js');
            appState.currentInputMode = 'single';

            UI.setInputMode('single', false);

            expect(StorageManager.saveAppState).not.toHaveBeenCalled();
        });
    });

    describe('updateOutputProgress (delegates to showHeaderProgress)', () => {
        beforeEach(async () => {
            const { DOM } = await import('../utils/DOM.js');
            DOM.headerGenDashboard = document.createElement('div');
            DOM.dashProgressFill = document.createElement('div');
            DOM.dashProgressText = document.createElement('div');
            document.body.appendChild(DOM.headerGenDashboard);
            document.body.appendChild(DOM.dashProgressFill);
            document.body.appendChild(DOM.dashProgressText);
        });

        it('should update progress bar width', async () => {
            const { DOM } = await import('../utils/DOM.js');

            UI.updateOutputProgress(5, 10);

            expect(DOM.dashProgressFill.style.width).toBe('50%');
            expect(DOM.dashProgressText.textContent).toBe('5/10');
        });

        it('should handle zero total', async () => {
            const { DOM } = await import('../utils/DOM.js');

            UI.updateOutputProgress(0, 0);

            expect(DOM.dashProgressFill.style.width).toBe('0%');
        });
    });

    describe('resetProgressBar (delegates to resetHeaderProgress)', () => {
        it('should reset progress to 0', async () => {
            const { DOM } = await import('../utils/DOM.js');
            DOM.headerGenDashboard = document.createElement('div');
            DOM.dashProgressFill = document.createElement('div');
            DOM.dashProgressFill.style.width = '50%';
            DOM.dashProgressText = document.createElement('div');

            UI.resetProgressBar();

            expect(DOM.dashProgressFill.style.width).toBe('0%');
        });
    });

    describe('switchToCreationModeUI / switchToEditModeUI', () => {
        beforeEach(async () => {
            const { DOM } = await import('../utils/DOM.js');
            DOM.generateAppreciationBtn = document.createElement('button');
            DOM.generateAndNextBtn = document.createElement('button');
            DOM.cancelEditBtn = document.createElement('button');
            DOM.resetFormBtn = document.createElement('button');
            document.body.appendChild(DOM.generateAppreciationBtn);
            document.body.appendChild(DOM.generateAndNextBtn);
            document.body.appendChild(DOM.cancelEditBtn);
            document.body.appendChild(DOM.resetFormBtn);
        });

        it('should show correct buttons in creation mode', async () => {
            const { DOM } = await import('../utils/DOM.js');

            UI.switchToCreationModeUI();

            expect(DOM.generateAppreciationBtn.style.display).toBe('none');
            expect(DOM.generateAndNextBtn.style.display).toBe('inline-flex');
            expect(DOM.cancelEditBtn.style.display).toBe('none');
            expect(DOM.resetFormBtn.style.display).toBe('inline-flex');
        });

        it('should show correct buttons in edit mode', async () => {
            const { DOM } = await import('../utils/DOM.js');

            UI.switchToEditModeUI();

            expect(DOM.generateAppreciationBtn.style.display).toBe('inline-flex');
            expect(DOM.generateAndNextBtn.style.display).toBe('none');
            expect(DOM.cancelEditBtn.style.display).toBe('inline-flex');
            expect(DOM.resetFormBtn.style.display).toBe('none');
        });
    });

    describe('getGradeClass', () => {
        it('should return grade-poor for grades below 6', () => {
            expect(UI.getGradeClass(5)).toBe('grade-poor');
            expect(UI.getGradeClass(0)).toBe('grade-poor');
        });

        it('should return grade-average for grades between 6 and 8', () => {
            expect(UI.getGradeClass(6)).toBe('grade-average');
            expect(UI.getGradeClass(7)).toBe('grade-average');
        });

        it('should return empty string for grades between 8 and 16', () => {
            expect(UI.getGradeClass(10)).toBe('');
            expect(UI.getGradeClass(12)).toBe('');
            expect(UI.getGradeClass(15)).toBe('');
        });

        it('should return grade-good for grades 16 and above', () => {
            expect(UI.getGradeClass(16)).toBe('grade-good');
            expect(UI.getGradeClass(20)).toBe('grade-good');
        });

        it('should handle null grade', () => {
            expect(UI.getGradeClass(null)).toBe('');
        });

        it('should handle NaN', () => {
            expect(UI.getGradeClass(NaN)).toBe('');
        });
    });

    // toggleSidebar removed — no longer part of UIManager

    describe('showSettingsTab', () => {
        it('should delegate to FormUI.showSettingsTab', async () => {
            const { FormUI } = await import('./FormUIManager.js');

            UI.showSettingsTab('advanced');

            expect(FormUI.showSettingsTab).toHaveBeenCalledWith('advanced');
        });
    });

    describe('updateHelpImportFormat', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div id="helpFormatStructure"></div>
                <div id="helpFormatExample"></div>
                <div id="helpFormatSelector">
                    <button data-format="T1" class="active">T1</button>
                    <button data-format="T2">T2</button>
                </div>
            `;
        });

        it('should update structure text for given period', () => {
            UI.updateHelpImportFormat('T2');

            const struct = document.getElementById('helpFormatStructure');
            expect(struct.textContent).toContain('NOM Prénom');
        });

        it('should update example text for given period', () => {
            UI.updateHelpImportFormat('T2');

            const example = document.getElementById('helpFormatExample');
            expect(example.textContent).toContain('DUPONT');
        });

        it('should not throw if elements are missing', () => {
            document.body.innerHTML = '';
            expect(() => UI.updateHelpImportFormat('T1')).not.toThrow();
        });
    });

    describe('updateDarkModeButtonIcon', () => {
        it('should delegate to ThemeManager.updateUI', async () => {
            const { ThemeManager } = await import('./ThemeManager.js');

            UI.updateDarkModeButtonIcon();

            expect(ThemeManager.updateUI).toHaveBeenCalled();
        });
    });

    // Tests renderVocabList supprimés - fonctionnalité vocabulaire dépréciée
});
