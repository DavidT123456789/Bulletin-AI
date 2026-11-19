/**
 * @fileoverview Tests for ApiValidationManager
 * @module managers/ApiValidationManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        currentAIModel: 'gemini-2.5-flash',
        apiKeyStatus: {},
        validatedApiKeys: {},
        googleApiKey: '',
        openaiApiKey: '',
        openrouterApiKey: ''
    },
    UIState: {
        settingsBeforeEdit: {}
    }
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {
        googleApiKey: { value: '' },
        openaiApiKey: { value: '' },
        openrouterApiKey: { value: '' },
        googleApiKeyError: { style: { display: '' }, textContent: '' },
        openaiApiKeyError: { style: { display: '' }, textContent: '' },
        openrouterApiKeyError: { style: { display: '' }, textContent: '' },
        validateGoogleApiKeyBtn: { innerHTML: '', classList: { add: vi.fn(), remove: vi.fn() } },
        validateOpenaiApiKeyBtn: { innerHTML: '', classList: { add: vi.fn(), remove: vi.fn() } },
        validateOpenrouterApiKeyBtn: { innerHTML: '', classList: { add: vi.fn(), remove: vi.fn() } },
        aiModelSelect: { value: '' }
    }
}));

vi.mock('./UIManager.js', () => ({
    UI: {
        showInlineSpinner: vi.fn(),
        hideInlineSpinner: vi.fn(),
        showNotification: vi.fn(),
        updateGenerateButtonState: vi.fn(),
        updateHeaderPremiumLook: vi.fn()
    }
}));

vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
}));

vi.mock('../services/AIService.js', () => ({
    AIService: {
        callAI: vi.fn(),
        getAvailableModels: vi.fn(),
        _hasApiKeyForModel: vi.fn(() => true),
        getOpenRouterCredits: vi.fn(() => Promise.resolve(10.5)),
        getAlbertAccountInfo: vi.fn(() => Promise.resolve({ rpmLimit: 30, rpdLimit: 1000 }))
    }
}));

vi.mock('./SettingsUIManager.js', () => ({
    SettingsUIManager: {
        updateApiStatusDisplay: vi.fn()
    }
}));

import { ApiValidationManager } from './ApiValidationManager.js';
import { appState } from '../state/State.js';
import { UI } from './UIManager.js';
import { AIService } from '../services/AIService.js';
import { StorageManager } from './StorageManager.js';
import { SettingsUIManager } from './SettingsUIManager.js';

describe('ApiValidationManager', () => {
    let mockInputEl, mockErrorEl, mockBtnEl;

    beforeEach(() => {
        vi.clearAllMocks();

        // Reset appState
        appState.currentAIModel = 'gemini-2.5-flash';
        appState.apiKeyStatus = {};
        appState.validatedApiKeys = {};
        appState.googleApiKey = '';
        appState.openaiApiKey = '';
        appState.openrouterApiKey = '';

        // Create mock DOM elements
        mockInputEl = {
            value: 'test-api-key',
            classList: { add: vi.fn(), remove: vi.fn() },
            nextElementSibling: {
                classList: { contains: vi.fn(() => true) },
                innerHTML: ''
            }
        };

        mockErrorEl = {
            textContent: '',
            innerHTML: '',
            style: { display: '', color: '' }
        };

        mockBtnEl = {
            innerHTML: 'Vérifier',
            classList: { add: vi.fn(), remove: vi.fn() }
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('validateApiKeyUI', () => {
        it('should show error if key is empty', async () => {
            mockInputEl.value = '';

            await ApiValidationManager.validateApiKeyUI(
                'google', mockInputEl, mockErrorEl, mockBtnEl
            );

            expect(mockErrorEl.textContent).toBe("Veuillez entrer une clé.");
            expect(mockErrorEl.style.display).toBe('block');
        });

        it('should show spinner during validation', async () => {
            AIService.getAvailableModels.mockResolvedValue([]);
            AIService.callAI.mockResolvedValue({ text: 'ok' });

            await ApiValidationManager.validateApiKeyUI(
                'google', mockInputEl, mockErrorEl, mockBtnEl
            );

            expect(UI.showInlineSpinner).toHaveBeenCalledWith(mockBtnEl);
        });

        it('should validate successfully for valid Google key', async () => {
            AIService.getAvailableModels.mockResolvedValue([
                { name: 'models/gemini-2.5-flash' }
            ]);
            AIService.callAI.mockResolvedValue({ text: 'ok' });

            await ApiValidationManager.validateApiKeyUI(
                'google', mockInputEl, mockErrorEl, mockBtnEl
            );

            expect(appState.apiKeyStatus.google).toBe('valid');
            expect(appState.validatedApiKeys.google).toBe(true);
            expect(StorageManager.saveAppState).toHaveBeenCalled();
        });

        it('should use fast non-reasoning gemini-3.6-flash for Google step 2 validation even when currentAIModel is gemini-4-hydrogen', async () => {
            appState.currentAIModel = 'gemini-4-hydrogen';
            AIService.getAvailableModels.mockResolvedValue([
                { name: 'models/gemini-4-hydrogen' },
                { name: 'models/gemini-3.6-flash' },
                { name: 'models/gemini-3.8-flash' }
            ]);
            AIService.callAI.mockResolvedValue({ text: 'ok' });

            await ApiValidationManager.validateApiKeyUI(
                'google', mockInputEl, mockErrorEl, mockBtnEl
            );

            expect(AIService.callAI).toHaveBeenCalledWith(
                'Validation',
                expect.objectContaining({
                    isValidation: true,
                    validationProvider: 'google',
                    modelOverride: 'gemini-3.6-flash'
                })
            );
        });

        it('should keep and save Google key as valid when step 1 (/models) succeeds but step 2 times out or returns 503', async () => {
            AIService.getAvailableModels.mockResolvedValue([
                { name: 'models/gemini-3.6-flash' }
            ]);
            const timeoutErr = new Error('La requête a expiré (timeout 15s).');
            timeoutErr.name = 'TimeoutError';
            AIService.callAI.mockRejectedValue(timeoutErr);
            const onSuccess = vi.fn();

            await ApiValidationManager.validateApiKeyUI(
                'google', mockInputEl, mockErrorEl, mockBtnEl, onSuccess
            );

            expect(appState.googleApiKey).toBe('test-api-key');
            expect(appState.apiKeyStatus.google).toBe('valid');
            expect(appState.validatedApiKeys.google).toBe(true);
            expect(mockInputEl.classList.add).not.toHaveBeenCalledWith('input-error');
            expect(mockErrorEl.innerHTML).toContain('Clé enregistrée et prête');
            expect(mockErrorEl.style.color).toBe('var(--text-secondary)');
            expect(StorageManager.saveAppState).toHaveBeenCalled();
            expect(onSuccess).toHaveBeenCalled();
        });

        it('should NOT mark key as invalid when step 1 or 1-step provider fails with timeout/503/network error', async () => {
            const timeoutErr = new DOMException('Timeout', 'TimeoutError');
            AIService.getAvailableModels.mockRejectedValue(timeoutErr);

            await ApiValidationManager.validateApiKeyUI(
                'google', mockInputEl, mockErrorEl, mockBtnEl
            );

            expect(appState.apiKeyStatus.google).toBeNull();
            expect(appState.validatedApiKeys.google).toBe(false);
            expect(appState.googleApiKey).toBe('');
            expect(mockInputEl.classList.add).not.toHaveBeenCalledWith('input-error');
            expect(mockErrorEl.innerHTML).toContain('délai dépassé');

            // 1-step provider (Groq) hitting 503 should also preserve status instead of marking invalid
            appState.groqApiKey = 'existing-valid-groq';
            appState.validatedApiKeys.groq = true;
            appState.apiKeyStatus.groq = 'valid';
            mockInputEl.value = 'existing-valid-groq';
            AIService.callAI.mockRejectedValue(new Error('Clé invalide (503): Service Unavailable'));

            await ApiValidationManager.validateApiKeyUI(
                'groq', mockInputEl, mockErrorEl, mockBtnEl
            );

            expect(appState.groqApiKey).toBe('existing-valid-groq');
            expect(appState.apiKeyStatus.groq).toBe('valid');
            expect(appState.validatedApiKeys.groq).toBe(true);
        });

        it('should handle quota errors for Google gracefully', async () => {
            AIService.getAvailableModels.mockResolvedValue([
                { name: 'models/gemini-2.5-flash' }
            ]);
            AIService.callAI.mockRejectedValue(new Error('429 quota exceeded'));

            await ApiValidationManager.validateApiKeyUI(
                'google', mockInputEl, mockErrorEl, mockBtnEl
            );

            // Key is still valid, just quota limited
            expect(appState.apiKeyStatus.google).toBe('quota-warning');
            expect(appState.validatedApiKeys.google).toBe(true);
        });

        it('should handle invalid Google key', async () => {
            AIService.getAvailableModels.mockRejectedValue(new Error('Invalid API key'));

            await ApiValidationManager.validateApiKeyUI(
                'google', mockInputEl, mockErrorEl, mockBtnEl
            );

            expect(appState.validatedApiKeys.google).toBe(false);
            expect(appState.apiKeyErrorDetails.google).toContain('Invalid API key');
            expect(mockErrorEl.style.display).toBe('block');
        });

        it('should validate OpenAI key with correct model', async () => {
            AIService.callAI.mockResolvedValue({ text: 'ok' });

            await ApiValidationManager.validateApiKeyUI(
                'openai', mockInputEl, mockErrorEl, mockBtnEl
            );

            expect(AIService.callAI).toHaveBeenCalledWith(
                'Validation',
                expect.objectContaining({
                    isValidation: true,
                    validationProvider: 'openai',
                    modelOverride: 'openai-gpt-6-luna'
                })
            );
        });

        it('should strip duplicate Erreur HTTP prefix and escape HTML in invalid key diagnostics', async () => {
            AIService.getAvailableModels.mockRejectedValue(
                new Error('Erreur HTTP 400: API key not valid <script>alert(1)</script>')
            );

            await ApiValidationManager.validateApiKeyUI(
                'google', mockInputEl, mockErrorEl, mockBtnEl
            );

            expect(appState.apiKeyStatus.google).toBe('invalid');
            expect(appState.apiKeyErrorDetails.google).toBe('Code 400 · API key not valid <script>alert(1)</script>');
            expect(mockErrorEl.innerHTML).not.toContain('<script>');
            expect(mockErrorEl.innerHTML).toContain('&lt;script&gt;');
        });

        it('should validate Anthropic key with lightweight Claude Haiku 5.5 model', async () => {
            AIService.callAI.mockResolvedValue({ text: 'ok' });

            await ApiValidationManager.validateApiKeyUI(
                'anthropic', mockInputEl, mockErrorEl, mockBtnEl
            );

            expect(AIService.callAI).toHaveBeenCalledWith(
                'Validation',
                expect.objectContaining({
                    isValidation: true,
                    validationProvider: 'anthropic',
                    modelOverride: 'anthropic-claude-haiku-5-5'
                })
            );
        });

        it('should validate OpenRouter key with correct model', async () => {
            AIService.callAI.mockResolvedValue({ text: 'ok' });

            await ApiValidationManager.validateApiKeyUI(
                'openrouter', mockInputEl, mockErrorEl, mockBtnEl
            );

            expect(AIService.callAI).toHaveBeenCalledWith(
                'Validation',
                expect.objectContaining({
                    isValidation: true,
                    validationProvider: 'openrouter',
                    modelOverride: 'deepseek/deepseek-chat'
                })
            );
        });

        it('should validate Groq key with correct model', async () => {
            AIService.callAI.mockResolvedValue({ text: 'ok' });

            await ApiValidationManager.validateApiKeyUI(
                'groq', mockInputEl, mockErrorEl, mockBtnEl
            );

            expect(AIService.callAI).toHaveBeenCalledWith(
                'Validation',
                expect.objectContaining({
                    isValidation: true,
                    validationProvider: 'groq',
                    modelOverride: 'groq-gpt-oss-20b'
                })
            );
            expect(appState.apiKeyStatus.groq).toBe('valid');
            expect(appState.validatedApiKeys.groq).toBe(true);

            // Albert API two-step validation + quota display
            AIService.getAvailableModels.mockResolvedValue([{ id: 'openweight-medium' }]);
            AIService.callAI.mockResolvedValue({ text: 'ok' });
            AIService.getAlbertAccountInfo.mockResolvedValue({ rpmLimit: 30, rpdLimit: 1000 });
            await ApiValidationManager.validateApiKeyUI('albert', mockInputEl, mockErrorEl, mockBtnEl);
            expect(AIService.getAvailableModels).toHaveBeenCalledWith('albert');
            expect(appState.apiKeyStatus.albert).toBe('valid');
            expect(appState.validatedApiKeys.albert).toBe(true);
            expect(mockErrorEl.innerHTML).toContain('30 req/min');
        });

        it('should call onSuccess callback on successful validation', async () => {
            AIService.getAvailableModels.mockResolvedValue([]);
            AIService.callAI.mockResolvedValue({ text: 'ok' });
            const onSuccess = vi.fn();

            await ApiValidationManager.validateApiKeyUI(
                'google', mockInputEl, mockErrorEl, mockBtnEl, onSuccess
            );

            expect(onSuccess).toHaveBeenCalled();
        });

        it('should update UI status display after validation', async () => {
            AIService.getAvailableModels.mockResolvedValue([]);
            AIService.callAI.mockResolvedValue({ text: 'ok' });

            await ApiValidationManager.validateApiKeyUI(
                'google', mockInputEl, mockErrorEl, mockBtnEl
            );

            expect(SettingsUIManager.updateApiStatusDisplay).toHaveBeenCalled();
        });
    });

    describe('handleApiKeyInput', () => {
        it('should clear input classes on input', () => {
            const mockEvent = {
                target: {
                    id: 'googleApiKey',
                    value: 'new-key',
                    classList: { remove: vi.fn() },
                    nextElementSibling: {
                        classList: { contains: vi.fn(() => true) },
                        innerHTML: ''
                    }
                }
            };

            ApiValidationManager.handleApiKeyInput(mockEvent);

            expect(mockEvent.target.classList.remove).toHaveBeenCalledWith(
                'input-error', 'input-success', 'input-warning'
            );
        });

        it('should reset validation status when key changes', () => {
            appState.validatedApiKeys = { google: true };

            const mockEvent = {
                target: {
                    id: 'googleApiKey',
                    value: 'new-key',
                    classList: { remove: vi.fn() }
                }
            };

            ApiValidationManager.handleApiKeyInput(mockEvent);

            expect(appState.validatedApiKeys.google).toBe(false);
            expect(appState.apiKeyErrorDetails?.google).toBeUndefined();
        });

        it('should sync UIState.settingsBeforeEdit snapshot after successful validation so closing Settings does not revert validated key', async () => {
            const { UIState } = await import('../state/State.js');
            UIState.settingsBeforeEdit = {
                googleApiKey: 'old-key',
                currentAIModel: 'gpt-4o-mini',
                validatedApiKeys: { google: false },
                apiKeyStatus: { google: 'invalid' }
            };
            AIService.callAI.mockResolvedValue({ content: 'test response' });

            await ApiValidationManager.validateApiKeyUI(
                'google',
                mockInputEl,
                mockErrorEl,
                mockBtnEl
            );

            expect(UIState.settingsBeforeEdit.googleApiKey).toBe('test-api-key');
            expect(UIState.settingsBeforeEdit.validatedApiKeys.google).toBe(true);
            expect(UIState.settingsBeforeEdit.apiKeyStatus.google).toBe('valid');
            expect(UIState.settingsBeforeEdit.currentAIModel).toBe(appState.currentAIModel);
        });
    });
});
