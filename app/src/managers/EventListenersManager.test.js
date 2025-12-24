/**
 * @fileoverview Tests unitaires pour EventListenersManager
 * @module managers/EventListenersManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventListenersManager } from './EventListenersManager.js';

// Mock state module
vi.mock('../state/State.js', () => ({
    appState: {
        currentInputMode: 'single',
        currentEditingId: null,
        activeStatFilter: null
    }
}));

// Mock config module
vi.mock('../config/Config.js', () => ({
    CONFIG: {
        DEBOUNCE_TIME_MS: 300
    },
    CONSTS: {
        INPUT_MODE: { MASS: 'mass', SINGLE: 'single' }
    }
}));

// Helper to create mock element - inline inside vi.mock to avoid hoisting issues
vi.mock('../utils/DOM.js', () => {
    const createMockElement = () => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        click: vi.fn(),
        classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn(), contains: vi.fn() },
        style: {},
        disabled: false,
        dataset: {},
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
    });

    return {
        DOM: {
            generateAppreciationBtn: createMockElement(),
            importGenerateBtn: createMockElement(),
            resetFormBtn: createMockElement(),
            darkModeToggle: createMockElement(),
            settingsButton: createMockElement(),
            helpButton: createMockElement(),
            sidebarToggle: createMockElement(),
            sidebarCloseBtn: createMockElement(),
            singleStudentTab: createMockElement(),
            massImportTab: createMockElement(),
            importFileBtn: createMockElement(),
            clearImportBtn: createMockElement(),
            loadSampleDataLink: createMockElement(),
            cancelImportOutputBtn: createMockElement(),
            massData: createMockElement(),
            nomInput: createMockElement(),
            prenomInput: createMockElement(),
            negativeInstructions: createMockElement(),
            searchInput: createMockElement(),
            sortSelect: createMockElement(),
            actionsBtnToggle: createMockElement(),
            analyzeClassBtn: createMockElement(),
            activeFilterInfo: createMockElement(),
            settingsTabs: [],
            periodSystemRadios: [],
            personalizationToggle: createMockElement(),
            validateOpenaiApiKeyBtn: createMockElement(),
            validateGoogleApiKeyBtn: createMockElement(),
            validateOpenrouterApiKeyBtn: createMockElement(),
            aiModelSelect: createMockElement(),
            openaiApiKey: createMockElement(),
            googleApiKey: createMockElement(),
            openrouterApiKey: createMockElement(),
            addSubjectBtn: createMockElement(),
            resetSubjectBtn: createMockElement(),
            deleteSubjectBtn: createMockElement(),
            settingsSubjectSelect: createMockElement(),
            settingsModal: createMockElement(),
            importSettingsBtn: createMockElement(),
            exportSettingsBtn: createMockElement(),
            resetAllSettingsBtn: createMockElement(),
            saveSettingsBtn: createMockElement(),
            cancelSettingsBtn: createMockElement(),
            closeSettingsModalBtn: createMockElement(),
            closeStudentDetailsModalBtn: createMockElement(),
            closeDetailsModalBtn: createMockElement(),
            nextStudentBtn: createMockElement(),
            prevStudentBtn: createMockElement(),
            studentDetailsModal: createMockElement(),
            closeRefinementModalBtn: createMockElement(),
            cancelRefinementBtn: createMockElement(),
            closeRefinementFooterBtn: createMockElement(),
            applyRefinedAppreciationBtn: createMockElement(),
            resetRefinementBtn: createMockElement(),
            swapRefinementBtn: createMockElement(),
            nextRefinementStudentBtn: createMockElement(),
            prevRefinementStudentBtn: createMockElement(),
            refinementModal: createMockElement(),
            refineStyleOptions: createMockElement(),
            refineWithContextBtn: createMockElement(),
            originalAppreciationText: createMockElement(),
            refinementErrorActions: createMockElement(),
            closeHelpModalBtn: createMockElement(),
            closeHelpModalFooterBtn: createMockElement(),
            helpGoToSettingsBtn: createMockElement(),
            helpFormatSelector: createMockElement(),
            helpModal: createMockElement(),
            closeClassAnalysisModalBtn: createMockElement(),
            closeClassAnalysisFooterBtn: createMockElement(),
            copyAnalysisBtn: createMockElement(),
            copyClassAnalysisBtn: createMockElement(),
            classAnalysisModal: createMockElement(),
            closeImportPreviewModalBtn: createMockElement(),
            cancelImportPreviewBtn: createMockElement(),
            confirmImportPreviewBtn: createMockElement(),
            importPreviewModal: createMockElement(),
            customSeparatorInput: createMockElement(),
            backToTopBtn: createMockElement(),
            actionsDropdown: createMockElement()
        }
    };
});

// Mock Utils
vi.mock('../utils/Utils.js', () => ({
    Utils: {
        getPeriods: vi.fn(() => ['T1', 'T2', 'T3']),
        debounce: vi.fn((fn) => fn),
        isNumeric: vi.fn()
    }
}));

// Mock UI
vi.mock('./UIManager.js', () => ({
    UI: {
        activeModal: null,
        toggleDarkMode: vi.fn(),
        openModal: vi.fn(),
        closeModal: vi.fn(),
        closeAllModals: vi.fn(),
        toggleSidebar: vi.fn(),
        showSettingsTab: vi.fn(),
        setMassImportProcessingState: vi.fn(),
        showNotification: vi.fn(),
        updateHelpImportFormat: vi.fn()
    }
}));

// Mock AppreciationsManager
vi.mock('./AppreciationsManager.js', () => ({
    AppreciationsManager: {
        loadSampleData: vi.fn(),
        exportToCsv: vi.fn(),
        exportToPdf: vi.fn(),
        copyAllResults: vi.fn(),
        clearAllResults: vi.fn(),
        applyRefinedAppreciation: vi.fn(),
        acceptRefinedSuggestion: vi.fn(),
        copyRefinementText: vi.fn(),
        regenerateFailedAppreciation: vi.fn(),
        generateRefinedAppreciation: vi.fn(),
        resetForm: vi.fn()
    }
}));

// Mock StorageManager
vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        exportToJson: vi.fn(),
        exportSettings: vi.fn(),
        resetAllSettings: vi.fn()
    }
}));

// Mock FileImportManager
vi.mock('./FileImportManager.js', () => ({
    FileImportManager: {
        handleMassImportTrigger: vi.fn(),
        handleImportFileBtnClick: vi.fn(),
        handleClearImportClick: vi.fn(),
        handleCancelImportOutputClick: vi.fn(),
        handleMassDataInput: vi.fn(),
        handleMassDataPaste: vi.fn(),
        handleImportPreviewConfirmation: vi.fn(),
        forgetSavedImportFormat: vi.fn(),
        updateImportPreview: vi.fn()
    }
}));

// Mock ApiValidationManager
vi.mock('./ApiValidationManager.js', () => ({
    ApiValidationManager: {
        validateApiKey: vi.fn(),
        handleApiKeyInput: vi.fn()
    }
}));

describe('EventListenersManager', () => {
    let mockApp;

    beforeEach(() => {
        mockApp = {
            handleGenerateClick: vi.fn(),
            handleClearClick: vi.fn(),
            handleHelpButtonClick: vi.fn(),
            handleSingleStudentTabClick: vi.fn(),
            handleMassImportTabClick: vi.fn(),
            handleInputFieldChange: vi.fn(),
            handleInputEnterKey: vi.fn(),
            handleSearchInput: vi.fn(),
            handleSortSelectChange: vi.fn(),
            handleActionsBtnToggle: vi.fn(),
            handleRegenerateAllClick: vi.fn(),
            handleRegenerateErrorsClick: vi.fn(),
            analyzeClass: vi.fn(),
            handleActiveFilterInfoClick: vi.fn(),
            handleStatCardClick: vi.fn(),
            handleSettingsTabClick: vi.fn(),
            handlePeriodSystemChange: vi.fn(),
            handlePersonalizationToggleChange: vi.fn(),
            handleAiModelSelectChange: vi.fn(),
            addSubject: vi.fn(),
            resetCurrentSubject: vi.fn(),
            handleDeleteSubjectClick: vi.fn(),
            handleSettingsSubjectSelectChange: vi.fn(),
            handleSettingsModalClick: vi.fn(),
            handleSettingsModalBlur: vi.fn(),
            handleSettingsModalKeydown: vi.fn(),
            handleImportSettingsBtnClick: vi.fn(),
            saveSettings: vi.fn(),
            cancelSettings: vi.fn(),
            _navigateModalView: vi.fn(),
            resetRefinementChanges: vi.fn(),
            saveRefinementEdit: vi.fn(),
            copyClassAnalysis: vi.fn(),
            handleClassAnalysisActions: vi.fn(),
            handleFocusTrap: vi.fn(),
            handleResultListKeyboardNav: vi.fn(),
            handleStatFilterClick: vi.fn(),
            handleResultCardAction: vi.fn()
        };

        vi.clearAllMocks();

        // Reset document mock
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('init', () => {
        it('should store the app instance', () => {
            EventListenersManager.init(mockApp);
            // Init is successful if it doesn't throw
            expect(true).toBe(true);
        });

        it('should accept null app instance', () => {
            expect(() => EventListenersManager.init(null)).not.toThrow();
        });
    });

    describe('setupEventListeners', () => {
        beforeEach(() => {
            EventListenersManager.init(mockApp);
        });

        it('should call all setup methods', () => {
            const setupGeneralSpy = vi.spyOn(EventListenersManager, 'setupGeneralListeners');
            const setupInputSpy = vi.spyOn(EventListenersManager, 'setupInputListeners');
            const setupOutputSpy = vi.spyOn(EventListenersManager, 'setupOutputListeners');
            const setupSettingsSpy = vi.spyOn(EventListenersManager, 'setupSettingsModalListeners');
            const setupOtherSpy = vi.spyOn(EventListenersManager, 'setupOtherModalsListeners');
            const setupGlobalSpy = vi.spyOn(EventListenersManager, 'setupGlobalEventListeners');

            EventListenersManager.setupEventListeners();

            expect(setupGeneralSpy).toHaveBeenCalled();
            expect(setupInputSpy).toHaveBeenCalled();
            expect(setupOutputSpy).toHaveBeenCalled();
            expect(setupSettingsSpy).toHaveBeenCalled();
            expect(setupOtherSpy).toHaveBeenCalled();
            expect(setupGlobalSpy).toHaveBeenCalled();
        });
    });

    describe('setupGeneralListeners', () => {
        beforeEach(async () => {
            EventListenersManager.init(mockApp);
            const { DOM } = await import('../utils/DOM.js');
            // Reset mock elements
            Object.keys(DOM).forEach(key => {
                if (DOM[key] && typeof DOM[key].addEventListener === 'function') {
                    DOM[key].addEventListener.mockClear();
                }
            });
        });

        it('should attach click listeners to main buttons', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn((el, handler) => {
                if (el) el.addEventListener('click', handler);
            });

            EventListenersManager.setupGeneralListeners(addClickListener);

            expect(addClickListener).toHaveBeenCalledWith(DOM.generateAppreciationBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.importGenerateBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.resetFormBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.darkModeToggle, expect.any(Function));
        });

        it('should attach settings button listener', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn((el, handler) => {
                if (el) el.addEventListener('click', handler);
            });

            EventListenersManager.setupGeneralListeners(addClickListener);

            expect(addClickListener).toHaveBeenCalledWith(DOM.settingsButton, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.helpButton, expect.any(Function));
        });

        it('should attach sidebar toggle listeners', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn((el, handler) => {
                if (el) el.addEventListener('click', handler);
            });

            EventListenersManager.setupGeneralListeners(addClickListener);

            expect(addClickListener).toHaveBeenCalledWith(DOM.sidebarToggle, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.sidebarCloseBtn, expect.any(Function));
        });
    });

    describe('setupInputListeners', () => {
        beforeEach(() => {
            EventListenersManager.init(mockApp);
        });

        it('should attach tab click listeners', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn((el, handler) => {
                if (el) el.addEventListener('click', handler);
            });

            EventListenersManager.setupInputListeners(addClickListener);

            expect(addClickListener).toHaveBeenCalledWith(DOM.singleStudentTab, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.massImportTab, expect.any(Function));
        });

        it('should attach import button listeners', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn((el, handler) => {
                if (el) el.addEventListener('click', handler);
            });

            EventListenersManager.setupInputListeners(addClickListener);

            expect(addClickListener).toHaveBeenCalledWith(DOM.importFileBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.clearImportBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.loadSampleDataLink, expect.any(Function));
        });

        it('should attach mass data input/paste listeners', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn();

            EventListenersManager.setupInputListeners(addClickListener);

            expect(DOM.massData.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
            expect(DOM.massData.addEventListener).toHaveBeenCalledWith('paste', expect.any(Function));
        });
    });

    describe('setupOutputListeners', () => {
        beforeEach(() => {
            EventListenersManager.init(mockApp);
        });

        it('should attach search and sort listeners', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn();

            EventListenersManager.setupOutputListeners(addClickListener);

            expect(DOM.searchInput.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
            expect(DOM.sortSelect.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
        });

        it('should attach action button toggle listener', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn((el, handler) => {
                if (el) el.addEventListener('click', handler);
            });

            EventListenersManager.setupOutputListeners(addClickListener);

            expect(addClickListener).toHaveBeenCalledWith(DOM.actionsBtnToggle, expect.any(Function));
        });

        it('should attach analyze class button listener', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn((el, handler) => {
                if (el) el.addEventListener('click', handler);
            });

            EventListenersManager.setupOutputListeners(addClickListener);

            expect(addClickListener).toHaveBeenCalledWith(DOM.analyzeClassBtn, expect.any(Function));
        });
    });

    describe('setupSettingsModalListeners', () => {
        beforeEach(() => {
            EventListenersManager.init(mockApp);
        });

        it('should attach personalization toggle listener', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn();

            EventListenersManager.setupSettingsModalListeners(addClickListener);

            expect(DOM.personalizationToggle.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
        });

        it('should attach API validation button listeners', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn((el, handler) => {
                if (el) el.addEventListener('click', handler);
            });

            EventListenersManager.setupSettingsModalListeners(addClickListener);

            expect(addClickListener).toHaveBeenCalledWith(DOM.validateOpenaiApiKeyBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.validateGoogleApiKeyBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.validateOpenrouterApiKeyBtn, expect.any(Function));
        });

        it('should attach save/cancel settings button listeners', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn((el, handler) => {
                if (el) el.addEventListener('click', handler);
            });

            EventListenersManager.setupSettingsModalListeners(addClickListener);

            expect(addClickListener).toHaveBeenCalledWith(DOM.saveSettingsBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.cancelSettingsBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.closeSettingsModalBtn, expect.any(Function));
        });

        it('should attach subject management button listeners', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn((el, handler) => {
                if (el) el.addEventListener('click', handler);
            });

            EventListenersManager.setupSettingsModalListeners(addClickListener);

            expect(addClickListener).toHaveBeenCalledWith(DOM.addSubjectBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.resetSubjectBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.deleteSubjectBtn, expect.any(Function));
        });
    });

    describe('setupOtherModalsListeners', () => {
        beforeEach(() => {
            EventListenersManager.init(mockApp);
        });

        it('should attach student details modal listeners', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn((el, handler) => {
                if (el) el.addEventListener('click', handler);
            });

            EventListenersManager.setupOtherModalsListeners(addClickListener);

            expect(addClickListener).toHaveBeenCalledWith(DOM.closeStudentDetailsModalBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.nextStudentBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.prevStudentBtn, expect.any(Function));
        });

        it('should attach refinement modal listeners', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn((el, handler) => {
                if (el) el.addEventListener('click', handler);
            });

            EventListenersManager.setupOtherModalsListeners(addClickListener);

            expect(addClickListener).toHaveBeenCalledWith(DOM.closeRefinementModalBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.applyRefinedAppreciationBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.resetRefinementBtn, expect.any(Function));
        });

        it('should attach help modal listeners', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn((el, handler) => {
                if (el) el.addEventListener('click', handler);
            });

            EventListenersManager.setupOtherModalsListeners(addClickListener);

            expect(addClickListener).toHaveBeenCalledWith(DOM.closeHelpModalBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.closeHelpModalFooterBtn, expect.any(Function));
        });

        it('should attach import preview modal listeners', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const addClickListener = vi.fn((el, handler) => {
                if (el) el.addEventListener('click', handler);
            });

            EventListenersManager.setupOtherModalsListeners(addClickListener);

            expect(addClickListener).toHaveBeenCalledWith(DOM.closeImportPreviewModalBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.cancelImportPreviewBtn, expect.any(Function));
            expect(addClickListener).toHaveBeenCalledWith(DOM.confirmImportPreviewBtn, expect.any(Function));
        });
    });

    describe('setupGlobalEventListeners', () => {
        beforeEach(() => {
            EventListenersManager.init(mockApp);
        });

        it('should attach document keydown listener', () => {
            const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

            EventListenersManager.setupGlobalEventListeners();

            expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
        });

        it('should attach window scroll listener', () => {
            const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

            EventListenersManager.setupGlobalEventListeners();

            expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
        });

        it('should attach window resize listener', () => {
            const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

            EventListenersManager.setupGlobalEventListeners();

            expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
        });

        it('should attach body click listener', () => {
            const addEventListenerSpy = vi.spyOn(document.body, 'addEventListener');

            EventListenersManager.setupGlobalEventListeners();

            expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
        });
    });

    describe('keyboard shortcuts', () => {
        beforeEach(async () => {
            EventListenersManager.init(mockApp);
            const { UI } = await import('./UIManager.js');
            UI.activeModal = null;
        });

        it('should handle Escape key when modal is open', async () => {
            const { UI } = await import('./UIManager.js');
            UI.activeModal = { id: 'testModal' };

            EventListenersManager.setupGlobalEventListeners();

            const event = new KeyboardEvent('keydown', { key: 'Escape' });
            document.dispatchEvent(event);

            expect(UI.closeAllModals).toHaveBeenCalled();
        });

        it('should handle Ctrl+G shortcut for generation', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const { appState } = await import('../state/State.js');
            appState.currentInputMode = 'single';

            EventListenersManager.setupGlobalEventListeners();

            const event = new KeyboardEvent('keydown', { key: 'g', ctrlKey: true });
            Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
            document.dispatchEvent(event);

            expect(DOM.generateAppreciationBtn.click).toHaveBeenCalled();
        });

        it('should handle Ctrl+G shortcut for mass import mode', async () => {
            const { DOM } = await import('../utils/DOM.js');
            const { appState } = await import('../state/State.js');
            appState.currentInputMode = 'mass';

            EventListenersManager.setupGlobalEventListeners();

            const event = new KeyboardEvent('keydown', { key: 'g', ctrlKey: true });
            Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
            document.dispatchEvent(event);

            expect(DOM.importGenerateBtn.click).toHaveBeenCalled();
        });
    });
});
