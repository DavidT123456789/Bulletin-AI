/**
 * @fileoverview Tests for ApiValidationManager
 * @module managers/ApiValidationManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        isDemoMode: false,
        currentAIModel: 'gemini-2.5-flash',
        apiKeyStatus: {},
        validatedApiKeys: {},
        googleApiKey: '',
        openaiApiKey: '',
        openrouterApiKey: ''
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
        getAvailableModels: vi.fn()
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
        appState.isDemoMode = false;
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
                    modelOverride: 'openai-gpt-3.5-turbo'
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

        it('should work in demo mode', async () => {
            vi.useFakeTimers();
            appState.isDemoMode = true;

            const promise = ApiValidationManager.validateApiKeyUI(
                'google', mockInputEl, mockErrorEl, mockBtnEl
            );

            vi.advanceTimersByTime(1100);
            await promise;

            expect(appState.apiKeyStatus.google).toBe('valid');
            expect(UI.showNotification).toHaveBeenCalledWith(
                expect.stringContaining('Mode Démo'),
                'success'
            );

            vi.useRealTimers();
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
                    classList: { remove: vi.fn() },
                    nextElementSibling: {
                        classList: { contains: vi.fn(() => true) },
                        innerHTML: ''
                    }
                }
            };

            ApiValidationManager.handleApiKeyInput(mockEvent);

            expect(appState.validatedApiKeys.google).toBe(false);
        });

        it('should clear validation icon on input', () => {
            const mockIcon = {
                classList: { contains: vi.fn(() => true) },
                innerHTML: '<i class="fas fa-check"></i>'
            };

            const mockEvent = {
                target: {
                    id: 'googleApiKey',
                    value: 'new-key',
                    classList: { remove: vi.fn() },
                    nextElementSibling: mockIcon
                }
            };

            ApiValidationManager.handleApiKeyInput(mockEvent);

            expect(mockIcon.innerHTML).toBe('');
        });
    });
});
