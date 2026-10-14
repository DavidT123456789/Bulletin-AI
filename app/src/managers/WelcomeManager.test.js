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
                closeWelcomeModalBtn: createElement(),
                welcomeDots: { querySelectorAll: vi.fn(() => [{ classList: { toggle: vi.fn() } }]) },
                welcomePrevBtn: createElement(),
                welcomeNextBtn: Object.assign(createElement(), { disabled: false }),
                welcomeFinishOptions: createElement(),
                welcomeFinishAndHideBtn: createElement(),
                welcomeValidateApiKeyBtn: createElement(),
                welcomeSkipApiKeyBtn: createElement(),
                welcomeApiKeyInput: Object.assign(document.createElement('input'), { value: '' }),
                welcomeApiKeyError: { style: {}, textContent: '' },
                importGenerateBtn: { click: vi.fn() }
            }
        };
});

vi.mock('./UIManager', () => ({
    UI: {
        activeModal: null,
        openModal: vi.fn(),
        closeModal: vi.fn(),
        closeAllModals: vi.fn(),
        showNotification: vi.fn(),
        updatePeriodSystemUI: vi.fn(),
        updateGenerateButtonState: vi.fn(),
        updateHeaderPremiumLook: vi.fn(),
        updateStats: vi.fn()
    }
}));

vi.mock('./AppreciationsManager', () => ({
    AppreciationsManager: {
        loadSampleData: vi.fn(),
        renderResults: vi.fn()
    }
}));

vi.mock('./ClassManager', () => ({
    ClassManager: {
        createClass: vi.fn(() => ({ id: 'demo-class-id', name: 'Classe Exemple' })),
        getAllClasses: vi.fn(() => []),
        isDemoClass: vi.fn(() => false),
        switchClass: vi.fn(),
        _filterResultsByClass: vi.fn()
    }
}));

vi.mock('./StudentDataManager', () => ({
    StudentDataManager: {
        createPendingResult: vi.fn(s => ({ id: 'mock-id', nom: s.nom, prenom: s.prenom, classId: 'demo-class-id' }))
    }
}));

vi.mock('./ClassUIManager', () => ({
    ClassUIManager: {
        updateHeaderDisplay: vi.fn(),
        updateStudentCount: vi.fn()
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
        appState.googleApiKey = '';
        appState.groqApiKey = '';
        appState.openrouterApiKey = '';
        appState.mistralApiKey = '';
        appState.openaiApiKey = '';
        appState.anthropicApiKey = '';
        appState.ollamaEnabled = false;
        appState.periodSystem = 'trimestres';
        appState.generatedResults = [];

        document.body.innerHTML = `
            <div id="welcome-step-1" class="welcome-step active"></div>
            <div id="welcome-step-2" class="welcome-step">
                <div id="welcomeProviderSelector">
                    <input type="radio" id="providerGoogle" name="welcomeProvider" value="google" checked>
                    <input type="radio" id="providerGroq" name="welcomeProvider" value="groq">
                    <input type="radio" id="providerMistral" name="welcomeProvider" value="mistral">
                    <input type="radio" id="providerOpenRouter" name="welcomeProvider" value="openrouter">
                </div>
                <a id="welcomeGetKeyLink" href=""></a>
            </div>
            <div id="welcome-step-3" class="welcome-step">
                <div id="welcomePeriodCards">
                    <div class="welcome-start-card active" data-value="trimestres"></div>
                    <div class="welcome-start-card" data-value="semestres"></div>
                </div>
                <input type="radio" id="welcomePeriodSystemTrimestres" name="welcomePeriodSystemRadio" value="trimestres" checked>
                <input type="radio" id="welcomePeriodSystemSemestres" name="welcomePeriodSystemRadio" value="semestres">
            </div>
            <div id="welcome-step-4" class="welcome-step"></div>
        `;
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

    describe('completion & dismissal paths', () => {
        it('should persist first visit flag, close modal immediately, and inject demo class when clicking close button (×)', async () => {
            const { UI } = await import('./UIManager');
            const { DOM } = await import('../utils/DOM');
            const { ClassManager } = await import('./ClassManager');

            const injectSpy = vi.spyOn(WelcomeManager, '_injectDemoClass').mockResolvedValue();
            ClassManager.getAllClasses.mockReturnValue([]);

            WelcomeManager.setupWelcomeModal();
            DOM.closeWelcomeModalBtn.click();

            expect(localStorage.getItem(CONFIG.LS_FIRST_VISIT_KEY)).toBe('true');
            expect(UI.closeModal).toHaveBeenCalledWith(DOM.welcomeModal);
            expect(injectSpy).toHaveBeenCalledWith('trimestres');

            await Promise.resolve();
            injectSpy.mockRestore();
        });

        it('should update periodSystem, inject demo class, and close modal when clicking Commencer', async () => {
            const { UI } = await import('./UIManager');
            const { DOM } = await import('../utils/DOM');
            const { ClassManager } = await import('./ClassManager');

            const injectSpy = vi.spyOn(WelcomeManager, '_injectDemoClass').mockResolvedValue();
            ClassManager.getAllClasses.mockReturnValue([]);

            WelcomeManager.setupWelcomeModal();

            const semestresCard = document.querySelector('.welcome-start-card[data-value="semestres"]');
            semestresCard.click();

            DOM.welcomeFinishAndHideBtn.click();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(localStorage.getItem(CONFIG.LS_FIRST_VISIT_KEY)).toBe('true');
            expect(appState.periodSystem).toBe('semestres');
            expect(UI.updatePeriodSystemUI).toHaveBeenCalled();
            expect(injectSpy).toHaveBeenCalledWith('semestres');
            expect(UI.closeModal).toHaveBeenCalledWith(DOM.welcomeModal);

            injectSpy.mockRestore();
        });

        it('should finalize onboarding cleanly when pressing Escape while welcomeModal is active', async () => {
            const { UI } = await import('./UIManager');
            const { DOM } = await import('../utils/DOM');
            const { ClassManager } = await import('./ClassManager');

            const injectSpy = vi.spyOn(WelcomeManager, '_injectDemoClass').mockResolvedValue();
            ClassManager.getAllClasses.mockReturnValue([]);
            UI.activeModal = DOM.welcomeModal;

            WelcomeManager.setupWelcomeModal();

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            await Promise.resolve();

            expect(localStorage.getItem(CONFIG.LS_FIRST_VISIT_KEY)).toBe('true');
            expect(UI.closeModal).toHaveBeenCalledWith(DOM.welcomeModal);
            expect(injectSpy).toHaveBeenCalledTimes(1);

            UI.activeModal = null;
            injectSpy.mockRestore();
        });

        it('should finalize onboarding without duplicate closeModal call when welcome-modal-close event is dispatched (e.g. mobile Back)', async () => {
            const { UI } = await import('./UIManager');
            const { ClassManager } = await import('./ClassManager');

            const injectSpy = vi.spyOn(WelcomeManager, '_injectDemoClass').mockResolvedValue();
            ClassManager.getAllClasses.mockReturnValue([]);

            WelcomeManager.setupWelcomeModal();

            document.dispatchEvent(new CustomEvent('welcome-modal-close', { detail: { modalId: 'welcomeModal' } }));
            await Promise.resolve();

            expect(localStorage.getItem(CONFIG.LS_FIRST_VISIT_KEY)).toBe('true');
            expect(injectSpy).toHaveBeenCalledTimes(1);
            expect(UI.closeModal).not.toHaveBeenCalled();

            injectSpy.mockRestore();
        });
    });

    describe('Step 2 API key & provider switching', () => {
        it('should keep Next button enabled on Step 2 when switching to an empty provider tab if another provider already has a key', async () => {
            vi.useFakeTimers();
            const { DOM } = await import('../utils/DOM');

            appState.googleApiKey = 'AIzaSyTestKey123456';
            WelcomeManager.setupWelcomeModal();

            // Move from Step 1 to Step 2
            DOM.welcomeNextBtn.click();
            vi.advanceTimersByTime(500);

            expect(DOM.welcomeNextBtn.disabled).toBe(false);

            // Switch to Groq tab (which has no key)
            const groqRadio = document.getElementById('providerGroq');
            groqRadio.checked = true;
            groqRadio.dispatchEvent(new Event('change', { bubbles: true }));

            expect(DOM.welcomeApiKeyInput.value).toBe('');
            expect(DOM.welcomeNextBtn.disabled).toBe(false);

            vi.useRealTimers();
        });

        it('should disable Next on Step 2 when no key is configured, and keep Next enabled after clicking Configurer plus tard', async () => {
            vi.useFakeTimers();
            const { DOM } = await import('../utils/DOM');

            WelcomeManager.setupWelcomeModal();

            // Move to Step 2
            DOM.welcomeNextBtn.click();
            vi.advanceTimersByTime(500);
            expect(DOM.welcomeNextBtn.disabled).toBe(true);

            // Click "Configurer plus tard" -> advances to Step 3
            DOM.welcomeSkipApiKeyBtn.click();
            vi.advanceTimersByTime(500);
            expect(DOM.welcomeNextBtn.disabled).toBe(false);

            // Go back to Step 2 -> Next should remain enabled because user already chose to skip
            DOM.welcomePrevBtn.click();
            vi.advanceTimersByTime(500);
            expect(DOM.welcomeNextBtn.disabled).toBe(false);

            // Advance to Step 3 then Step 4 -> focus should move to welcomeFinishAndHideBtn
            const focusSpy = vi.spyOn(DOM.welcomeFinishAndHideBtn, 'focus');
            DOM.welcomeNextBtn.click();
            vi.advanceTimersByTime(500);
            DOM.welcomeNextBtn.click();
            vi.advanceTimersByTime(500);
            expect(focusSpy).toHaveBeenCalledTimes(1);

            focusSpy.mockRestore();
            vi.useRealTimers();
        });

        it('should trigger API key validation when pressing Enter in non-empty API key input', async () => {
            const { DOM } = await import('../utils/DOM');
            const mockValidate = vi.fn();
            WelcomeManager.setValidateApiKeyCallback(mockValidate);

            WelcomeManager.setupWelcomeModal();
            DOM.welcomeApiKeyInput.value = 'AIzaSyNewKey';
            DOM.welcomeValidateApiKeyBtn.disabled = false;

            DOM.welcomeApiKeyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

            expect(mockValidate).toHaveBeenCalledTimes(1);
        });
    });

    describe('handleRelaunchWelcomeGuide', () => {
        it('should relaunch the welcome guide', async () => {
            vi.useFakeTimers();
            const { UI } = await import('./UIManager');
            const { DOM } = await import('../utils/DOM');

            const mockEvent = { preventDefault: vi.fn() };

            WelcomeManager.handleRelaunchWelcomeGuide(mockEvent);

            expect(mockEvent.preventDefault).toHaveBeenCalled();
            expect(UI.closeAllModals).toHaveBeenCalled();

            vi.advanceTimersByTime(300);
            expect(UI.openModal).toHaveBeenCalledWith(DOM.welcomeModal);
            vi.useRealTimers();
        });
    });
});
