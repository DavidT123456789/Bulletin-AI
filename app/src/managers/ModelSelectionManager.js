/**
 * @fileoverview Gestionnaire de sélection rapide de modèle IA depuis l'en-tête.
 * Permet de basculer en 1 clic entre les modèles réellement utilisables (clés actives).
 * Zéro redondance avec les paramètres (qui ne gèrent que les clés API et le relais).
 * @module managers/ModelSelectionManager
 */

import { DOM } from '../utils/DOM.js';
import { appState } from '../state/State.js';
import { MODEL_SELECTOR_CONFIG, MODEL_SHORT_NAMES, getProviderForModel } from '../config/models.js';
import { PROVIDER_CONFIG } from '../config/providers.js';
import { SettingsUIManager } from './SettingsUIManager.js';
import { StorageManager } from './StorageManager.js';
import { UI } from './UIManager.js';
import { DropdownManager } from './DropdownManager.js';

export const ModelSelectionManager = {
    isOpen: false,
    _boundKeyHandler: null,
    _boundClickHandler: null,

    /**
     * Initialise les écouteurs d'événements pour le menu déroulant de modèles.
     */
    init() {
        // Clic extérieur pour fermer
        this._boundClickHandler = (e) => {
            if (!this.isOpen) return;
            const wrapper = DOM.headerGenWrapper || document.getElementById('headerGenWrapper');
            const dropdown = DOM.headerModelDropdown || document.getElementById('headerModelDropdown');
            if (
                wrapper &&
                !wrapper.contains(e.target) &&
                dropdown &&
                !dropdown.contains(e.target)
            ) {
                this.closeDropdown();
            }
        };
        document.addEventListener('click', this._boundClickHandler);

        // Navigation clavier (Flèches, Entrée, Échap)
        this._boundKeyHandler = (e) => {
            if (!this.isOpen) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.closeDropdown();
                DOM.headerGenDashboard?.focus();
                return;
            }

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const dropdown = DOM.headerModelDropdown || document.getElementById('headerModelDropdown');
                const items = Array.from(dropdown?.querySelectorAll('.model-dropdown-item') || []);
                if (items.length === 0) return;

                e.preventDefault();
                const activeEl = document.activeElement;
                const index = items.indexOf(activeEl);

                if (index === -1) {
                    const selectedItem = dropdown.querySelector('.model-dropdown-item.active') || items[0];
                    selectedItem?.focus();
                } else {
                    const nextIndex = e.key === 'ArrowDown'
                        ? (index + 1) % items.length
                        : (index - 1 + items.length) % items.length;
                    items[nextIndex]?.focus();
                }
            }
        };
        document.addEventListener('keydown', this._boundKeyHandler);
    },

    /**
     * Retourne la liste des modèles réellement configurés et prêts à l'emploi.
     * @returns {Array<Object>}
     */
    getAvailableModels() {
        const available = [];
        MODEL_SELECTOR_CONFIG.forEach(group => {
            group.models.forEach(modelInfo => {
                if (SettingsUIManager.isModelAvailable(modelInfo.id)) {
                    const provider = getProviderForModel(modelInfo.id);
                    available.push({
                        ...modelInfo,
                        name: MODEL_SHORT_NAMES[modelInfo.id] || modelInfo.id,
                        groupLabel: group.label,
                        provider
                    });
                }
            });
        });
        return available;
    },

    /**
     * Indique si au moins un modèle IA est utilisable.
     * @returns {boolean}
     */
    hasAnyAvailableModel() {
        return this.getAvailableModels().length > 0;
    },

    /**
     * Gère le clic sur la pilule de génération de l'en-tête.
     * Si aucune IA n'est configurée : ouvre directement les paramètres (onboarding immédiat en 1 clic).
     * Si des IA sont prêtes : ouvre le menu déroulant rapide des modèles.
     */
    handleHeaderClick() {
        const trigger = DOM.headerGenDashboard || document.getElementById('headerGenDashboard');
        if (!trigger) return;

        // Ne rien faire si une génération est en cours
        if (trigger.classList.contains('generating')) return;

        const available = this.getAvailableModels();

        // 0 clé configurée -> Direction les paramètres directement !
        if (available.length === 0) {
            this.openAllSettings('googleApiKeyGroup');
            return;
        }

        // Au moins un modèle disponible -> Toggle du popover
        this.toggleDropdown();
    },

    /**
     * Alterne l'affichage du menu déroulant.
     */
    toggleDropdown() {
        if (this.isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    },

    /**
     * Ouvre le popover de sélection de modèle.
     */
    openDropdown() {
        const dropdown = DOM.headerModelDropdown || document.getElementById('headerModelDropdown');
        const trigger = DOM.headerGenDashboard || document.getElementById('headerGenDashboard');
        if (!dropdown || !trigger) return;

        if (trigger.classList.contains('generating')) return;

        // Fermer les autres dropdowns ouverts pour éviter les superpositions
        if (DOM.classDropdown && DOM.classDropdown.style.display !== 'none') {
            DOM.classDropdown.style.display = 'none';
            DOM.headerClassChip?.classList.remove('active');
        }
        if (DOM.headerMenuDropdown?.classList.contains('open')) {
            DOM.headerMenuDropdown.classList.remove('open');
        }

        this.renderDropdown();

        const wrapper = DOM.headerGenWrapper || trigger.closest('.header-gen-wrapper');
        if (wrapper) wrapper.classList.add('open');

        dropdown.style.display = 'flex';
        this.isOpen = true;
        trigger.setAttribute('aria-expanded', 'true');

        // Focus accessible sur le modèle actif
        setTimeout(() => {
            const activeItem = dropdown.querySelector('.model-dropdown-item.active');
            if (activeItem) {
                activeItem.focus();
            }
        }, 50);
    },

    /**
     * Ferme le popover de sélection de modèle.
     */
    closeDropdown() {
        if (!this.isOpen) return;

        const dropdown = DOM.headerModelDropdown || document.getElementById('headerModelDropdown');
        const trigger = DOM.headerGenDashboard || document.getElementById('headerGenDashboard');
        const wrapper = DOM.headerGenWrapper || trigger?.closest('.header-gen-wrapper');

        if (wrapper) wrapper.classList.remove('open');
        if (dropdown) dropdown.style.display = 'none';

        this.isOpen = false;
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    },

    /**
     * Génère dynamiquement le HTML du menu déroulant avec les VRAIS modèles disponibles.
     */
    renderDropdown() {
        const dropdown = DOM.headerModelDropdown || document.getElementById('headerModelDropdown');
        if (!dropdown) return;

        const availableModels = this.getAvailableModels();

        let html = `
            <div class="model-dropdown-section-title">
                <span>Modèle IA actif</span>
                <span class="model-dropdown-count-badge">${availableModels.length} dispo.</span>
            </div>
            <div class="model-dropdown-list">
        `;

        availableModels.forEach(m => {
            const isSelected = m.id === appState.currentAIModel;
            const pConfig = PROVIDER_CONFIG[m.provider] || {};
            const iconAttr = pConfig.style ? ` style="${pConfig.style}"` : '';

            html += `
                <button type="button" class="model-dropdown-item ${isSelected ? 'active' : ''}" data-model-id="${m.id}" role="menuitem">
                    <span class="model-dropdown-item-icon">
                        <iconify-icon icon="${pConfig.icon || 'solar:cpu-linear'}" class="${pConfig.class || ''}"${iconAttr}></iconify-icon>
                    </span>
                    <span class="model-dropdown-item-details">
                        <span class="model-dropdown-item-name">
                            ${m.name}
                            ${m.qualifier ? `<span class="model-dropdown-item-badge">${m.qualifier}</span>` : ''}
                        </span>
                    </span>
                    ${isSelected ? `<span class="model-dropdown-item-check"><iconify-icon icon="ph:check-bold"></iconify-icon></span>` : ''}
                </button>
            `;
        });

        html += `
            </div>
            <div class="model-dropdown-divider"></div>
            <button type="button" class="model-dropdown-footer" id="headerModelDropdownSettingsBtn">
                <iconify-icon icon="solar:settings-linear"></iconify-icon>
                <span>Gérer les clés & fournisseurs...</span>
            </button>
        `;

        dropdown.innerHTML = html;

        // Clic sur un modèle -> Sélection instantanée en 1 clic
        dropdown.querySelectorAll('.model-dropdown-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const modelId = btn.getAttribute('data-model-id');
                if (modelId) this.selectModel(modelId);
            });
        });

        // Clic sur le footer -> Ouvrir les paramètres
        const settingsBtn = dropdown.querySelector('#headerModelDropdownSettingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openAllSettings();
            });
        }
    },

    /**
     * Sélectionne immédiatement un modèle disponible (en 1 clic).
     * @param {string} modelId
     */
    selectModel(modelId) {
        if (!modelId) return;

        appState.currentAIModel = modelId;

        // Synchroniser le sélecteur des paramètres si présent
        if (DOM.aiModelSelect) {
            DOM.aiModelSelect.value = modelId;
            if (DropdownManager?.refresh) {
                DropdownManager.refresh('aiModelSelect');
            }
        }

        // Sauvegarder dans le stockage persistant
        if (StorageManager?.saveAppState) {
            StorageManager.saveAppState();
        }

        // Mettre à jour l'en-tête et les écrans
        if (UI?.updateDashboardCounts) {
            UI.updateDashboardCounts();
        }
        if (SettingsUIManager?.updateHeaderAiModelDisplay) {
            SettingsUIManager.updateHeaderAiModelDisplay();
        }
        if (SettingsUIManager?.updatePersonalizationState) {
            SettingsUIManager.updatePersonalizationState();
        }
        if (UI?.updateHeaderPremiumLook) {
            UI.updateHeaderPremiumLook();
        }

        const modelName = MODEL_SHORT_NAMES[modelId] || modelId;
        UI.showNotification(`Modèle actif : ${modelName}`, 'info');

        this.closeDropdown();
    },

    /**
     * Ouvre les paramètres IA dans la modale générale.
     * @param {string|null} highlightTarget - Identifiant optionnel d'élément à cibler
     */
    openAllSettings(highlightTarget = null) {
        this.closeDropdown();
        UI.openModal(DOM.settingsModal);
        UI.showSettingsTab('settings-engine');
        SettingsUIManager.updateApiStatusDisplay();
        if (highlightTarget) {
            UI.highlightSettingsElement(highlightTarget, { tab: 'settings-engine' });
        }
    }
};
