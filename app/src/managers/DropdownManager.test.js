/**
 * @fileoverview Tests unitaires pour DropdownManager.
 * Vérifie le comportement des dropdowns custom, l'accessibilité ARIA,
 * la propagation d'événements et la gestion du z-index (has-open-dropdown).
 * @module managers/DropdownManager.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DropdownManager } from './DropdownManager.js';
import { HistoryManager } from './HistoryManager.js';
import { TooltipsUI } from './TooltipsManager.js';

// Mocks minimaux requis
vi.mock('./HistoryManager.js', () => ({
    HistoryManager: {
        pushState: vi.fn(),
        isOpen: vi.fn(() => false),
        handleManualClose: vi.fn()
    }
}));

vi.mock('./TooltipsManager.js', () => ({
    TooltipsUI: {
        initTooltips: vi.fn()
    }
}));

describe('DropdownManager', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        DropdownManager.instances.clear();
        vi.clearAllMocks();
    });

    describe('enhance()', () => {
        it('devrait transformer un <select> natif en composant custom-dropdown accessible', () => {
            const container = document.createElement('div');
            container.innerHTML = `
                <select id="testSelect">
                    <option value="opt1">Option 1</option>
                    <option value="opt2" selected>Option 2</option>
                </select>
            `;
            document.body.appendChild(container);
            const selectEl = container.querySelector('#testSelect');

            const wrapper = DropdownManager.enhance(selectEl);

            expect(wrapper).toBeDefined();
            expect(wrapper.classList.contains('custom-dropdown')).toBe(true);
            expect(wrapper.dataset.for).toBe('testSelect');
            expect(selectEl.style.display).toBe('none');
            expect(selectEl.dataset.enhanced).toBe('true');

            // Trigger & ARIA
            const trigger = wrapper.querySelector('.custom-dropdown-trigger');
            expect(trigger).not.toBeNull();
            expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
            expect(trigger.getAttribute('aria-expanded')).toBe('false');

            // Menu
            const menu = wrapper.querySelector('.custom-dropdown-menu');
            expect(menu).not.toBeNull();
            expect(menu.getAttribute('role')).toBe('listbox');

            // Options
            const options = menu.querySelectorAll('.custom-dropdown-option');
            expect(options.length).toBe(2);
            expect(options[1].classList.contains('selected')).toBe(true);
        });

        it('ne devrait pas ré-enhancer un select déjà configuré', () => {
            const selectEl = document.createElement('select');
            selectEl.id = 'alreadyEnhanced';
            selectEl.dataset.enhanced = 'true';
            document.body.appendChild(selectEl);

            const result = DropdownManager.enhance(selectEl);
            expect(result).toBeUndefined();
        });

        it('devrait convertir les options séparatrices en .dropdown-divider et propager les classes sémantiques', () => {
            document.body.innerHTML = `
                <select id="wizardMappingSelect_0" class="mapping-select">
                    <option value="IGNORE">Ignorer</option>
                    <option value="NOM_PRENOM" selected>Élève</option>
                    <option disabled data-divider="true">──────</option>
                    <option value="MOY_S1">Moy. S1</option>
                </select>
            `;
            const selectEl = document.querySelector('#wizardMappingSelect_0');
            const wrapper = DropdownManager.enhance(selectEl);

            expect(wrapper.classList.contains('mapping-select-dropdown')).toBe(true);
            const dividers = wrapper.querySelectorAll('.dropdown-divider[role="separator"]');
            expect(dividers.length).toBe(1);
            const options = wrapper.querySelectorAll('.custom-dropdown-option');
            expect(options.length).toBe(3);
            expect(wrapper.querySelector('.value-text').textContent).toBe('Élève');
        });
    });

    describe('toggle() & closeAll()', () => {
        it('devrait ouvrir le dropdown et poser .has-open-dropdown sur les conteneurs parents (cartes & groupes)', () => {
            document.body.innerHTML = `
                <div class="settings-group">
                    <div class="settings-group-card">
                        <select id="modelSelect">
                            <option value="gemini-3.6-flash">Gemini 3.6 Flash</option>
                        </select>
                    </div>
                </div>
            `;
            const group = document.querySelector('.settings-group');
            const card = document.querySelector('.settings-group-card');
            const selectEl = document.querySelector('#modelSelect');

            const wrapper = DropdownManager.enhance(selectEl);
            const trigger = wrapper.querySelector('.custom-dropdown-trigger');

            // État initial fermé
            expect(wrapper.classList.contains('open')).toBe(false);
            expect(card.classList.contains('has-open-dropdown')).toBe(false);
            expect(group.classList.contains('has-open-dropdown')).toBe(false);

            // Ouvrir
            DropdownManager.toggle(wrapper);

            expect(wrapper.classList.contains('open')).toBe(true);
            expect(trigger.getAttribute('aria-expanded')).toBe('true');
            expect(card.classList.contains('has-open-dropdown')).toBe(true);
            expect(group.classList.contains('has-open-dropdown')).toBe(true);
            expect(TooltipsUI.initTooltips).toHaveBeenCalled();
            expect(HistoryManager.pushState).toHaveBeenCalledWith('customDropdown', expect.any(Function));

            // Fermer via closeAll()
            DropdownManager.closeAll();

            expect(wrapper.classList.contains('open')).toBe(false);
            expect(trigger.getAttribute('aria-expanded')).toBe('false');
            expect(card.classList.contains('has-open-dropdown')).toBe(false);
            expect(group.classList.contains('has-open-dropdown')).toBe(false);
        });

        it('devrait fonctionner également pour un conteneur .settings-card classique', () => {
            document.body.innerHTML = `
                <div class="settings-card">
                    <select id="sortSelect">
                        <option value="alpha">Alphabétique</option>
                    </select>
                </div>
            `;
            const card = document.querySelector('.settings-card');
            const selectEl = document.querySelector('#sortSelect');
            const wrapper = DropdownManager.enhance(selectEl);

            DropdownManager.toggle(wrapper);
            expect(card.classList.contains('has-open-dropdown')).toBe(true);

            DropdownManager.closeAll();
            expect(card.classList.contains('has-open-dropdown')).toBe(false);
        });
    });

    describe('selectOption()', () => {
        it('devrait mettre à jour la valeur du select natif, déclencher un événement change et fermer le menu', () => {
            document.body.innerHTML = `
                <select id="fruitSelect">
                    <option value="apple">Pomme</option>
                    <option value="banana">Banane</option>
                </select>
            `;
            const selectEl = document.querySelector('#fruitSelect');
            const wrapper = DropdownManager.enhance(selectEl);
            const changeSpy = vi.fn();
            selectEl.addEventListener('change', changeSpy);

            DropdownManager.toggle(wrapper);
            expect(wrapper.classList.contains('open')).toBe(true);

            DropdownManager.selectOption(wrapper, selectEl, 'banana');

            expect(selectEl.value).toBe('banana');
            expect(changeSpy).toHaveBeenCalledTimes(1);
            expect(wrapper.classList.contains('open')).toBe(false);
            expect(wrapper.querySelector('.value-text').textContent).toBe('Banane');
        });
    });

    describe('getProviderFromLabel() & formatGroupLabel()', () => {
        it('devrait extraire le bon fournisseur et formater l\'en-tête épuré sans badge superflu', () => {
            const googleConfig = DropdownManager.getProviderFromLabel('Google Gemini — Quota gratuit');
            expect(googleConfig).toBeDefined();
            expect(googleConfig.name).toBe('Google Gemini');

            const formatted = DropdownManager.formatGroupLabel('Google Gemini — Quota gratuit');
            expect(formatted).toContain('provider-google');
            expect(formatted).toContain('Google Gemini');
            expect(formatted).not.toContain('Quota gratuit');

            const albertFormatted = DropdownManager.formatGroupLabel('Albert API (Gouv.fr) — QUOTA GRATUIT');
            expect(albertFormatted).toContain('provider-albert');
            expect(albertFormatted).toContain('Albert API (Gouv.fr)');
            expect(albertFormatted).not.toContain('QUOTA GRATUIT');
        });

        it('devrait harmoniser #aiModelSelect (trigger sans qualificatif, badge sans parenthèses, coche à gauche alignée sur l\'icône fournisseur)', () => {
            document.body.innerHTML = `
                <select id="aiModelSelect">
                    <optgroup label="Albert API (Gouv.fr) — QUOTA GRATUIT">
                        <option value="albert-large" selected>Mistral Small 3.2 24B (Recommandé)</option>
                    </optgroup>
                    <optgroup label="OpenRouter — PAYANT">
                        <option value="or-free" disabled>Llama 3.3 (Gratuit)</option>
                        <option value="or-paid" disabled>Claude 3.7 (Payant)</option>
                    </optgroup>
                </select>
                <div id="apiKeysSection"></div>
            `;
            const selectEl = document.querySelector('#aiModelSelect');
            const keysSection = document.querySelector('#apiKeysSection');
            keysSection.scrollIntoView = vi.fn();

            const wrapper = DropdownManager.enhance(selectEl);

            // Trigger épuré sans "(Recommandé)"
            expect(wrapper.querySelector('.value-text').textContent).toBe('Mistral Small 3.2 24B');

            // Option avec badge sans parenthèses et coche dans la gouttière gauche (avant le texte)
            const firstOpt = wrapper.querySelector('.custom-dropdown-option[data-value="albert-large"]');
            const badge = firstOpt.querySelector('.model-dropdown-item-badge');
            expect(badge).not.toBeNull();
            expect(badge.textContent).toBe('Recommandé');
            expect(firstOpt.firstElementChild.classList.contains('custom-dropdown-option-check')).toBe(true);

            // Le groupe OpenRouter désactivé compte pour 1 fournisseur
            const hint = wrapper.querySelector('.custom-dropdown-hint');
            expect(hint).not.toBeNull();
            expect(hint.textContent).toContain('1 autre fournisseur disponible ci-dessous');

            // Clic sur le hint ferme le menu et scrolle vers #apiKeysSection
            DropdownManager.toggle(wrapper);
            expect(wrapper.classList.contains('open')).toBe(true);
            hint.click();
            expect(wrapper.classList.contains('open')).toBe(false);
            expect(keysSection.scrollIntoView).toHaveBeenCalled();
        });
    });
});
