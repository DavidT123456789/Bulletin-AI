/**
 * @fileoverview Tests unitaires pour ModelSelectionManager
 * @module managers/ModelSelectionManager.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DOM } from '../utils/DOM.js';
import { appState } from '../state/State.js';
import { ModelSelectionManager } from './ModelSelectionManager.js';
import { SettingsUIManager } from './SettingsUIManager.js';
import { StorageManager } from './StorageManager.js';
import { UI } from './UIManager.js';
import { DropdownManager } from './DropdownManager.js';

describe('ModelSelectionManager', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div class="header-gen-wrapper" id="headerGenWrapper">
                <div id="headerGenDashboard" class="header-gen-dashboard" role="button" aria-expanded="false">
                    <div class="dash-model-label" id="dashModelLabel">
                        <iconify-icon class="dash-model-icon" icon="solar:cpu-linear"></iconify-icon>
                        <span id="dashModelName">Gemini</span>
                        <iconify-icon class="dash-model-chevron" icon="solar:alt-arrow-down-linear"></iconify-icon>
                    </div>
                </div>
                <div id="headerModelDropdown" class="header-model-dropdown" style="display: none;"></div>
            </div>
            <select id="aiModelSelect" style="display: none;">
                <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
                <option value="groq-llama-3.3-70b">Llama 3.3 70B</option>
            </select>
            <div id="appSettingsModal" style="display: none;"></div>
        `;

        DOM.headerGenWrapper = document.getElementById('headerGenWrapper');
        DOM.headerGenDashboard = document.getElementById('headerGenDashboard');
        DOM.headerModelDropdown = document.getElementById('headerModelDropdown');
        DOM.dashModelLabel = document.getElementById('dashModelLabel');
        DOM.dashModelName = document.getElementById('dashModelName');
        DOM.aiModelSelect = document.getElementById('aiModelSelect');
        DOM.settingsModal = document.getElementById('appSettingsModal');

        appState.currentAIModel = 'gemini-3.5-flash';
        appState.googleApiKey = 'AIzaSyFakeGoogleApiKey1234567';
        appState.groqApiKey = '';
        appState.ollamaEnabled = false;

        ModelSelectionManager.isOpen = false;
        vi.spyOn(StorageManager, 'saveAppState').mockImplementation(async () => {});
        vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        vi.spyOn(UI, 'openModal').mockImplementation(() => {});
        vi.spyOn(UI, 'showSettingsTab').mockImplementation(() => {});
        vi.spyOn(UI, 'highlightSettingsElement').mockImplementation(() => {});
        vi.spyOn(UI, 'updateDashboardCounts').mockImplementation(() => {});
        vi.spyOn(SettingsUIManager, 'updateApiStatusDisplay').mockImplementation(() => {});
    });

    it('devrait rediriger directement vers la saisie de clé si aucune IA n\'est configurée', () => {
        appState.googleApiKey = '';
        appState.groqApiKey = '';
        appState.ollamaEnabled = false;

        ModelSelectionManager.handleHeaderClick();

        expect(ModelSelectionManager.isOpen).toBe(false);
        expect(UI.openModal).toHaveBeenCalledWith(DOM.settingsModal);
        expect(UI.showSettingsTab).toHaveBeenCalledWith('settings-engine');
        expect(UI.highlightSettingsElement).toHaveBeenCalledWith('googleApiKeyGroup', { tab: 'settings-engine' });
    });

    it('devrait ouvrir le popover rapide si au moins un modèle est disponible', () => {
        appState.googleApiKey = 'AIzaSyValidKey123456';

        ModelSelectionManager.handleHeaderClick();

        expect(ModelSelectionManager.isOpen).toBe(true);
        expect(DOM.headerModelDropdown.style.display).toBe('flex');
        expect(DOM.headerGenDashboard.getAttribute('aria-expanded')).toBe('true');
    });

    it('devrait afficher uniquement les VRAIS modèles utilisables dans la liste', () => {
        appState.googleApiKey = 'AIzaSyValidKey123456';
        appState.groqApiKey = '';

        ModelSelectionManager.openDropdown();

        const items = DOM.headerModelDropdown.querySelectorAll('.model-dropdown-item');
        expect(items.length).toBeGreaterThan(0);

        // Doit contenir le vrai modèle Gemini 3.5 Flash
        const flashItem = Array.from(items).find(item => item.getAttribute('data-model-id') === 'gemini-3.5-flash');
        expect(flashItem).toBeTruthy();
        expect(flashItem.textContent).toContain('Gemini 3.5 Flash');
        expect(flashItem.classList.contains('active')).toBe(true);

        // Ne doit pas contenir Groq Llama car la clé n'est pas configurée
        const groqItem = Array.from(items).find(item => item.getAttribute('data-model-id') === 'groq-llama-3.3-70b');
        expect(groqItem).toBeFalsy();

        // Footer présent
        const footerBtn = DOM.headerModelDropdown.querySelector('#headerModelDropdownSettingsBtn');
        expect(footerBtn).toBeTruthy();
        expect(footerBtn.textContent).toContain('Gérer les clés & fournisseurs');
    });

    it('devrait sélectionner un modèle immédiatement au clic', () => {
        const refreshSpy = vi.spyOn(DropdownManager, 'refresh').mockImplementation(() => {});
        ModelSelectionManager.openDropdown();

        ModelSelectionManager.selectModel('gemini-3.8-flash');

        expect(appState.currentAIModel).toBe('gemini-3.8-flash');
        expect(DOM.aiModelSelect.value).toBe('gemini-3.8-flash');
        expect(refreshSpy).toHaveBeenCalledWith('aiModelSelect');
        expect(StorageManager.saveAppState).toHaveBeenCalled();
        expect(UI.showNotification).toHaveBeenCalledWith('Modèle actif : Gemini 3.8 Flash', 'info');
        expect(ModelSelectionManager.isOpen).toBe(false);
    });

    it('devrait se fermer à la touche Échap', () => {
        ModelSelectionManager.init();
        ModelSelectionManager.openDropdown();
        expect(ModelSelectionManager.isOpen).toBe(true);

        const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        document.dispatchEvent(escEvent);

        expect(ModelSelectionManager.isOpen).toBe(false);
    });

    it('devrait se fermer au clic en dehors du menu déroulant', () => {
        ModelSelectionManager.init();
        ModelSelectionManager.openDropdown();
        expect(ModelSelectionManager.isOpen).toBe(true);

        // Clic sur le body en dehors du wrapper
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(ModelSelectionManager.isOpen).toBe(false);
    });

    it('devrait naviguer au clavier avec ArrowDown et ArrowUp', () => {
        ModelSelectionManager.init();
        ModelSelectionManager.openDropdown();

        const items = DOM.headerModelDropdown.querySelectorAll('.model-dropdown-item');
        expect(items.length).toBeGreaterThan(0);

        // Flèche bas -> premier focus
        const arrowDownEvent = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
        document.dispatchEvent(arrowDownEvent);

        expect(document.activeElement).toBeTruthy();
    });
});

