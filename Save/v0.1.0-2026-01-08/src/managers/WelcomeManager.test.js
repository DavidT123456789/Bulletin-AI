import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WelcomeManager } from './WelcomeManager';
import { appState } from '../state/State';
import { CONFIG } from '../config/Config';

// Mock dependencies with proper HTMLElements
vi.mock('../utils/DOM', () => {
    const createElement = () => {
        const el = document.createElement('div');
        return el;
    };

    return {
        DOM: {
            welcomeModal: createElement(),
            welcomeDots: { querySelectorAll: vi.fn(() => [{ classList: { toggle: vi.fn() } }]) },
            welcomePrevBtn: createElement(),
            welcomeNextBtn: Object.assign(createElement(), { disabled: false, click: vi.fn() }),
            welcomeFinishOptions: createElement(),
            welcomeNextStepInfo: createElement(),
            welcomeLoadSampleBtn: Object.assign(createElement(), { disabled: false }),
            welcomeFinishBtn: createElement(),
            welcomeFinishAndHideBtn: createElement(),
            welcomeValidateApiKeyBtn: createElement(),
            welcomeSkipApiKeyBtn: createElement(),
            welcomeApiKeyInput: Object.assign(createElement(), { value: '' }),
            welcomeApiKeyError: { textContent: '' },
            importGenerateBtn: { click: vi.fn() }
        }
    };
});

vi.mock('./UIManager', () => ({
    UI: {
        openModal: vi.fn(),
        closeModal: vi.fn(),
        closeAllModals: vi.fn(),
        showNotification: vi.fn(),
        updatePeriodSystemUI: vi.fn(),
        updateGenerateButtonState: vi.fn(),
        updateHeaderPremiumLook: vi.fn()
    }
}));

vi.mock('./AppreciationsManager', () => ({
    AppreciationsManager: {
        loadSampleData: vi.fn()
    }
}));

vi.mock('./StorageManager', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
}));

describe('WelcomeManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        appState.isDemoMode = false;
        appState.googleApiKey = '';
        appState.periodSystem = 'trimester';

        // Add activateDemoModeBtn element to DOM
        const demoBtn = document.createElement('button');
        demoBtn.id = 'activateDemoModeBtn';
        document.body.appendChild(demoBtn);
    });

    afterEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
    });

    describe('setValidateApiKeyCallback', () => {
        it('should set the callback for API key validation', () => {
            const mockCallback = vi.fn();
            WelcomeManager.setValidateApiKeyCallback(mockCallback);
            expect(() => WelcomeManager.setValidateApiKeyCallback(mockCallback)).not.toThrow();
        });
    });

    describe('handleFirstVisit', () => {
        it('should open welcome modal on first visit', async () => {
            const { UI } = await import('./UIManager');
            const { DOM } = await import('../utils/DOM');

            localStorage.removeItem(CONFIG.LS_FIRST_VISIT_KEY);

            WelcomeManager.handleFirstVisit();

            expect(UI.openModal).toHaveBeenCalledWith(DOM.welcomeModal);
        });

        it('should not open welcome modal if already visited', async () => {
            const { UI } = await import('./UIManager');

            localStorage.setItem(CONFIG.LS_FIRST_VISIT_KEY, 'true');

            WelcomeManager.handleFirstVisit();

            expect(UI.openModal).not.toHaveBeenCalled();
        });
    });

    describe('activateDemoMode', () => {
        it('should enable demo mode', async () => {
            const { UI } = await import('./UIManager');
            const { AppreciationsManager } = await import('./AppreciationsManager');

            WelcomeManager.activateDemoMode();

            expect(appState.isDemoMode).toBe(true);
            expect(UI.showNotification).toHaveBeenCalledWith(
                "Mode Démo activé ! Génération simulée.",
                "success"
            );
            expect(UI.closeModal).toHaveBeenCalled();
            expect(UI.updateGenerateButtonState).toHaveBeenCalled();
            expect(UI.updateHeaderPremiumLook).toHaveBeenCalled();
            expect(AppreciationsManager.loadSampleData).toHaveBeenCalled();
        });
    });

    describe('handleRelaunchWelcomeGuide', () => {
        it('should relaunch the welcome guide', async () => {
            const { UI } = await import('./UIManager');
            const { DOM } = await import('../utils/DOM');

            const mockEvent = { preventDefault: vi.fn() };

            WelcomeManager.handleRelaunchWelcomeGuide(mockEvent);

            expect(mockEvent.preventDefault).toHaveBeenCalled();
            expect(UI.closeAllModals).toHaveBeenCalled();
            expect(UI.openModal).toHaveBeenCalledWith(DOM.welcomeModal);
        });
    });
});
