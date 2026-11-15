/**
 * @fileoverview Tests ciblés pour OtherModalsListeners (statut et ciblage dynamique du Guide)
 * @module managers/listeners/OtherModalsListeners.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OtherModalsListeners } from './OtherModalsListeners.js';
import { appState } from '../../state/State.js';

describe('OtherModalsListeners.updateHelpProviderStatus', () => {
    let savedState;

    beforeEach(() => {
        savedState = {
            currentAIModel: appState.currentAIModel,
            googleApiKey: appState.googleApiKey,
            albertApiKey: appState.albertApiKey,
            groqApiKey: appState.groqApiKey,
            openrouterApiKey: appState.openrouterApiKey,
            openaiApiKey: appState.openaiApiKey,
            anthropicApiKey: appState.anthropicApiKey,
            mistralApiKey: appState.mistralApiKey,
            ollamaEnabled: appState.ollamaEnabled
        };

        appState.googleApiKey = '';
        appState.albertApiKey = '';
        appState.groqApiKey = '';
        appState.openrouterApiKey = '';
        appState.openaiApiKey = '';
        appState.anthropicApiKey = '';
        appState.mistralApiKey = '';
        appState.ollamaEnabled = false;

        document.body.innerHTML = `
            <span id="helpProviderStatusBadge" class="provider-status-badge status-unconfigured"></span>
            <button id="helpOpenSettingsEngineBtn" class="btn btn-primary" data-target-element="albertApiKey"></button>
        `;
    });

    afterEach(() => {
        Object.assign(appState, savedState);
        document.body.innerHTML = '';
    });

    it('affiche À configurer et cible albertApiKey quand aucune clé ni Ollama ne sont configurés', () => {
        OtherModalsListeners.updateHelpProviderStatus();

        const badge = document.getElementById('helpProviderStatusBadge');
        const btn = document.getElementById('helpOpenSettingsEngineBtn');

        expect(badge.classList.contains('status-unconfigured')).toBe(true);
        expect(badge.classList.contains('status-connected')).toBe(false);
        expect(badge.textContent).toContain('À configurer');
        expect(btn.classList.contains('btn-primary')).toBe(true);
        expect(btn.dataset.targetElement).toBe('albertApiKey');
    });

    it('cible la clé du fournisseur du modèle actif lorsqu’elle est configurée', () => {
        appState.currentAIModel = 'gemini-4-hydrogen';
        appState.albertApiKey = 'sk-albert-test-key-123456';
        appState.googleApiKey = 'AIzaSyTestGoogleKey123456';

        OtherModalsListeners.updateHelpProviderStatus();

        const badge = document.getElementById('helpProviderStatusBadge');
        const btn = document.getElementById('helpOpenSettingsEngineBtn');

        expect(badge.classList.contains('status-connected')).toBe(true);
        expect(badge.textContent).toContain('Clé configurée');
        expect(btn.classList.contains('btn-secondary')).toBe(true);
        expect(btn.dataset.targetElement).toBe('googleApiKey');
    });

    it('se replie sur le premier fournisseur configuré si le modèle actif n’a pas de clé', () => {
        appState.currentAIModel = 'gemini-4-hydrogen';
        appState.groqApiKey = 'gsk_test_groq_key_123456';

        OtherModalsListeners.updateHelpProviderStatus();

        const btn = document.getElementById('helpOpenSettingsEngineBtn');
        expect(btn.dataset.targetElement).toBe('groqApiKey');
    });

    it('cible ollamaEnabledToggle lorsque seul Ollama est activé', () => {
        appState.currentAIModel = 'ollama-qwen2.5:7b';
        appState.ollamaEnabled = true;

        OtherModalsListeners.updateHelpProviderStatus();

        const badge = document.getElementById('helpProviderStatusBadge');
        const btn = document.getElementById('helpOpenSettingsEngineBtn');

        expect(badge.classList.contains('status-connected')).toBe(true);
        expect(btn.dataset.targetElement).toBe('ollamaEnabledToggle');
    });
});
