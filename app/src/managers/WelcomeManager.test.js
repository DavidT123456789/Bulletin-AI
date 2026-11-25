import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WelcomeManager } from './WelcomeManager';
import { appState } from '../state/State';
import { CONFIG } from '../config/Config';
import { bus, EVENTS } from '../core/EventBus.js';

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
                welcomeRestoreBtn: document.createElement('button'),
                welcomeProviderHint: createElement(),
                settingsModal: createElement(),
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
        updateStats: vi.fn(),
        highlightSettingsElement: vi.fn()
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
        appState.albertApiKey = '';
        appState.groqApiKey = '';
        appState.openrouterApiKey = '';
        appState.mistralApiKey = '';
        appState.openaiApiKey = '';
        appState.anthropicApiKey = '';
        appState.ollamaEnabled = false;
        appState.periodSystem = 'trimestres';
        appState.generatedResults = [];

        document.body.innerHTML = `
            <div id="welcome-step-1" class="welcome-step active">
                <button type="button" id="welcomeRestoreBtn">Restaurer mes données</button>
            </div>
            <div id="welcome-step-2" class="welcome-step">
                <div id="welcomeProviderSelector">
                    <input type="radio" id="providerAlbert" name="welcomeProvider" value="albert" checked>
                    <input type="radio" id="providerGoogle" name="welcomeProvider" value="google">
                    <input type="radio" id="providerGroq" name="welcomeProvider" value="groq">
                </div>
                <p id="welcomeProviderHint"></p>
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
            <div id="welcome-step-4" class="welcome-step">
                <div class="welcome-transformation-svg">
                    <svg></svg>
                </div>
                <p id="welcomeFinalSubtitle"></p>
            </div>
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

        it('should update periodSystem, synchronize currentPeriod before updating UI, inject demo class, and close modal when clicking Commencer', async () => {
            const { UI } = await import('./UIManager');
            const { DOM } = await import('../utils/DOM');
            const { ClassManager } = await import('./ClassManager');

            let periodAtUIRefresh = null;
            UI.updatePeriodSystemUI.mockImplementation(() => {
                periodAtUIRefresh = appState.currentPeriod;
            });

            const injectSpy = vi.spyOn(WelcomeManager, '_injectDemoClass').mockResolvedValue();
            ClassManager.getAllClasses.mockReturnValue([]);
            appState.currentPeriod = 'T1';

            WelcomeManager.setupWelcomeModal();

            const semestresCard = document.querySelector('.welcome-start-card[data-value="semestres"]');
            semestresCard.click();

            DOM.welcomeFinishAndHideBtn.click();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(localStorage.getItem(CONFIG.LS_FIRST_VISIT_KEY)).toBe('true');
            expect(appState.periodSystem).toBe('semestres');
            expect(appState.currentPeriod).toBe('S1');
            expect(periodAtUIRefresh).toBe('S1');
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

            bus.emit(EVENTS.MODAL_WELCOME_CLOSE, { modalId: 'welcomeModal' });
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

        it('should keep Next enabled on Step 2 when no key is configured, allow advancing directly via Next, and tailor Step 4 subtitle', async () => {
            vi.useFakeTimers();
            const { DOM } = await import('../utils/DOM');

            WelcomeManager.setupWelcomeModal();

            // Move to Step 2 -> Next stays enabled (soft-onboarding)
            DOM.welcomeNextBtn.click();
            vi.advanceTimersByTime(500);
            expect(DOM.welcomeNextBtn.disabled).toBe(false);

            // Click Next on Step 2 with empty input -> advances directly to Step 3
            DOM.welcomeNextBtn.click();
            vi.advanceTimersByTime(500);
            expect(document.getElementById('welcome-step-3').classList.contains('active')).toBe(true);

            // Advance from Step 3 to Step 4 -> focus moves to welcomeFinishAndHideBtn and subtitle reflects keyless mode
            const focusSpy = vi.spyOn(DOM.welcomeFinishAndHideBtn, 'focus');
            DOM.welcomeNextBtn.click();
            vi.advanceTimersByTime(500);
            expect(focusSpy).toHaveBeenCalledTimes(1);
            expect(document.getElementById('welcomeFinalSubtitle').textContent).toContain('Tout est prêt');

            focusSpy.mockRestore();
            vi.useRealTimers();
        });

        it('should auto-validate typed API key when clicking Next on Step 2 instead of Valider', async () => {
            vi.useFakeTimers();
            const { DOM } = await import('../utils/DOM');
            const mockValidate = vi.fn();
            WelcomeManager.setValidateApiKeyCallback(mockValidate);

            WelcomeManager.setupWelcomeModal();

            // Move to Step 2
            DOM.welcomeNextBtn.click();
            vi.advanceTimersByTime(500);

            // Type an unvalidated key and click Next
            DOM.welcomeApiKeyInput.value = 'AIzaSyTypedButNotValidated';
            DOM.welcomeApiKeyInput.disabled = false;
            DOM.welcomeValidateApiKeyBtn.classList.remove('validated');

            DOM.welcomeNextBtn.click();

            expect(mockValidate).toHaveBeenCalledTimes(1);
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

        it('should keep input editable when a key is already saved and re-enable validation when edited', async () => {
            const { DOM } = await import('../utils/DOM');
            appState.albertApiKey = 'sk-existing-albert-key';

            WelcomeManager.setupWelcomeModal();

            expect(DOM.welcomeApiKeyInput.value).toBe('sk-existing-albert-key');
            expect(DOM.welcomeApiKeyInput.disabled).toBe(false);
            expect(DOM.welcomeValidateApiKeyBtn.classList.contains('validated')).toBe(true);
            expect(DOM.welcomeValidateApiKeyBtn.disabled).toBe(true);

            // Editing the key unlocks the validate button in 'ready' state
            DOM.welcomeApiKeyInput.value = 'sk-new-albert-key';
            DOM.welcomeApiKeyInput.dispatchEvent(new Event('input', { bubbles: true }));

            expect(DOM.welcomeValidateApiKeyBtn.classList.contains('validated')).toBe(false);
            expect(DOM.welcomeValidateApiKeyBtn.classList.contains('ready')).toBe(true);
            expect(DOM.welcomeValidateApiKeyBtn.disabled).toBe(false);
            expect(DOM.welcomeValidateApiKeyBtn.textContent).toBe('Valider');

            // Reverting to the already saved key restores 'validated' state without network call
            DOM.welcomeApiKeyInput.value = 'sk-existing-albert-key';
            DOM.welcomeApiKeyInput.dispatchEvent(new Event('input', { bubbles: true }));

            expect(DOM.welcomeValidateApiKeyBtn.classList.contains('validated')).toBe(true);
            expect(DOM.welcomeValidateApiKeyBtn.classList.contains('ready')).toBe(false);
            expect(DOM.welcomeValidateApiKeyBtn.disabled).toBe(true);

            // Clearing the input (or whitespace only) disables Valider and removes ready/validated
            DOM.welcomeApiKeyInput.value = '   ';
            DOM.welcomeApiKeyInput.dispatchEvent(new Event('input', { bubbles: true }));

            expect(DOM.welcomeValidateApiKeyBtn.classList.contains('validated')).toBe(false);
            expect(DOM.welcomeValidateApiKeyBtn.classList.contains('ready')).toBe(false);
            expect(DOM.welcomeValidateApiKeyBtn.disabled).toBe(true);
            expect(DOM.welcomeValidateApiKeyBtn.textContent).toBe('Valider');
        });

        it('should disable Valider when opening on an empty provider and clear stale error messages on tab switch or input edit', async () => {
            const { DOM } = await import('../utils/DOM');
            WelcomeManager.setupWelcomeModal();

            expect(DOM.welcomeValidateApiKeyBtn.disabled).toBe(true);
            expect(DOM.welcomeValidateApiKeyBtn.classList.contains('ready')).toBe(false);

            // Simulate a validation error shown on Albert
            DOM.welcomeApiKeyError.style.display = 'block';
            DOM.welcomeApiKeyError.textContent = 'Clé invalide';

            // Switching to Gemini clears the stale error, updates hint and keeps Valider disabled on empty field
            const googleRadio = document.getElementById('providerGoogle');
            googleRadio.checked = true;
            googleRadio.dispatchEvent(new Event('change', { bubbles: true }));

            expect(DOM.welcomeApiKeyError.style.display).toBe('none');
            expect(DOM.welcomeApiKeyError.textContent).toBe('');
            expect(DOM.welcomeProviderHint.textContent).toContain('sans CB');
            expect(DOM.welcomeValidateApiKeyBtn.disabled).toBe(true);

            // Switching to Groq updates hint as well
            const groqRadio = document.getElementById('providerGroq');
            groqRadio.checked = true;
            groqRadio.dispatchEvent(new Event('change', { bubbles: true }));
            expect(DOM.welcomeProviderHint.textContent).toContain('Ultra-rapide');

            // Simulate another error, then type in input -> error clears and button becomes ready
            DOM.welcomeApiKeyError.style.display = 'block';
            DOM.welcomeApiKeyError.textContent = 'Erreur réseau';

            DOM.welcomeApiKeyInput.value = 'gsk_test-key-123';
            DOM.welcomeApiKeyInput.dispatchEvent(new Event('input', { bubbles: true }));

            expect(DOM.welcomeApiKeyError.style.display).toBe('none');
            expect(DOM.welcomeApiKeyError.textContent).toBe('');
            expect(DOM.welcomeValidateApiKeyBtn.disabled).toBe(false);
            expect(DOM.welcomeValidateApiKeyBtn.classList.contains('ready')).toBe(true);
        });

        it('should open Data settings via direct modal handoff without demo class injection when clicking welcomeRestoreBtn, and hide it only when a non-demo class exists', async () => {
            const { DOM } = await import('../utils/DOM');
            const { UI } = await import('./UIManager');
            const { ClassManager } = await import('./ClassManager');

            // Case 1: Only a demo class exists -> button stays visible
            ClassManager.getAllClasses.mockReturnValue([{ id: 'demo_1', isDemo: true }]);
            WelcomeManager.setupWelcomeModal();
            expect(DOM.welcomeRestoreBtn.hidden).toBe(false);

            // Case 2: A real user class exists -> button is hidden on relaunch
            ClassManager.getAllClasses.mockReturnValue([{ id: 'c_real', isDemo: false }]);
            WelcomeManager.setupWelcomeModal();
            expect(DOM.welcomeRestoreBtn.hidden).toBe(true);

            // Case 3: First visit (no classes) -> click triggers direct handoff to Settings > Data
            ClassManager.getAllClasses.mockReturnValue([]);
            WelcomeManager.setupWelcomeModal();
            expect(DOM.welcomeRestoreBtn.hidden).toBe(false);
            DOM.welcomeRestoreBtn.click();

            expect(localStorage.getItem(CONFIG.LS_FIRST_VISIT_KEY)).toBe('true');
            expect(ClassManager.createClass).not.toHaveBeenCalled();
            expect(UI.openModal).toHaveBeenCalledWith(DOM.settingsModal);
            expect(UI.closeModal).not.toHaveBeenCalled();
            expect(UI.highlightSettingsElement).toHaveBeenCalledWith('cloudSyncCard', {
                tab: 'settings-data',
                parentSelector: null
            });
        });
    });

    describe('handleRelaunchWelcomeGuide', () => {
        it('should relaunch the welcome guide via direct modal handoff', async () => {
            const { UI } = await import('./UIManager');
            const { DOM } = await import('../utils/DOM');

            const mockEvent = { preventDefault: vi.fn() };

            WelcomeManager.handleRelaunchWelcomeGuide(mockEvent);

            expect(mockEvent.preventDefault).toHaveBeenCalled();
            expect(UI.openModal).toHaveBeenCalledWith(DOM.welcomeModal);
        });
    });

    describe('Step 4 SVG animation lifecycle', () => {
        it('should pause Step 4 SVG animations when already visited', () => {
            const svg = document.querySelector('#welcome-step-4 .welcome-transformation-svg svg');
            svg.pauseAnimations = vi.fn();
            localStorage.setItem(CONFIG.LS_FIRST_VISIT_KEY, 'true');

            WelcomeManager.handleFirstVisit();

            expect(svg.pauseAnimations).toHaveBeenCalledTimes(1);
        });

        it('should pause on init, restart from t=0 on Step 4, and pause again on back or completion', async () => {
            vi.useFakeTimers();
            const { DOM } = await import('../utils/DOM');
            const { ClassManager } = await import('./ClassManager');
            const injectSpy = vi.spyOn(WelcomeManager, '_injectDemoClass').mockResolvedValue();
            ClassManager.getAllClasses.mockReturnValue([]);

            const svg = document.querySelector('#welcome-step-4 .welcome-transformation-svg svg');
            svg.pauseAnimations = vi.fn();
            svg.unpauseAnimations = vi.fn();
            svg.setCurrentTime = vi.fn();

            WelcomeManager.setupWelcomeModal();
            expect(svg.pauseAnimations).toHaveBeenCalledTimes(1);
            expect(svg.unpauseAnimations).not.toHaveBeenCalled();

            // Step 1 -> 2 -> 3 -> 4
            DOM.welcomeNextBtn.click();
            vi.advanceTimersByTime(500);
            DOM.welcomeNextBtn.click();
            vi.advanceTimersByTime(500);
            expect(svg.unpauseAnimations).not.toHaveBeenCalled();

            DOM.welcomeNextBtn.click();
            expect(svg.setCurrentTime).toHaveBeenCalledWith(0);
            expect(svg.unpauseAnimations).toHaveBeenCalledTimes(1);

            // Step 4 -> 3 (Précédent) pauses again
            vi.advanceTimersByTime(500);
            const pauseCountBeforeBack = svg.pauseAnimations.mock.calls.length;
            DOM.welcomePrevBtn.click();
            expect(svg.pauseAnimations).toHaveBeenCalledTimes(pauseCountBeforeBack + 1);

            // Return to Step 4 -> restarts cleanly from 0
            vi.advanceTimersByTime(500);
            DOM.welcomeNextBtn.click();
            expect(svg.setCurrentTime).toHaveBeenCalledTimes(2);
            expect(svg.unpauseAnimations).toHaveBeenCalledTimes(2);

            // Completing the modal pauses animations
            const pauseCountBeforeFinish = svg.pauseAnimations.mock.calls.length;
            DOM.welcomeFinishAndHideBtn.click();
            expect(svg.pauseAnimations).toHaveBeenCalledTimes(pauseCountBeforeFinish + 1);

            injectSpy.mockRestore();
            vi.useRealTimers();
        });

        it('should jump directly to the final built state and stay paused when prefers-reduced-motion is enabled', async () => {
            vi.useFakeTimers();
            const { DOM } = await import('../utils/DOM');
            const originalMatchMedia = window.matchMedia;
            window.matchMedia = vi.fn().mockImplementation((query) => ({
                matches: query === '(prefers-reduced-motion: reduce)',
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn()
            }));

            const svg = document.querySelector('#welcome-step-4 .welcome-transformation-svg svg');
            svg.pauseAnimations = vi.fn();
            svg.unpauseAnimations = vi.fn();
            svg.setCurrentTime = vi.fn();

            WelcomeManager.setupWelcomeModal();
            DOM.welcomeNextBtn.click();
            vi.advanceTimersByTime(500);
            DOM.welcomeNextBtn.click();
            vi.advanceTimersByTime(500);

            svg.pauseAnimations.mockClear();
            DOM.welcomeNextBtn.click();

            expect(svg.setCurrentTime).toHaveBeenCalledWith(8.6);
            expect(svg.pauseAnimations).toHaveBeenCalledTimes(1);
            expect(svg.unpauseAnimations).not.toHaveBeenCalled();

            window.matchMedia = originalMatchMedia;
            vi.useRealTimers();
        });
    });
});
