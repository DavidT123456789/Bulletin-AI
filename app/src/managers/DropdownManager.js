/**
 * @fileoverview Gestionnaire de dropdowns custom.
 * Remplace les <select> natifs par des composants stylisables avec accessibilité clavier.
 * @module managers/DropdownManager
 */

import { PROVIDER_CONFIG } from '../config/providers.js';
import { TooltipsUI } from './TooltipsManager.js';
import { HistoryManager } from './HistoryManager.js';

/**
 * Module de gestion des dropdowns custom.
 * @namespace DropdownManager
 */
export const DropdownManager = {
    /** Map des dropdowns initialisés (id -> instance data) */
    instances: new Map(),
    _uidCounter: 0,

    /**
     * Initialise tous les dropdowns custom.
     */
    init() {
        // Fermer les dropdowns au clic extérieur
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-dropdown')) {
                this.closeAll();
            }
        });

        // Gestion clavier globale
        document.addEventListener('keydown', (e) => {
            const openDropdown = document.querySelector('.custom-dropdown.open');
            if (openDropdown) {
                this.handleKeydown(e, openDropdown);
            }
        });
    },

    /**
     * Transforme un <select> natif en dropdown custom.
     * @param {HTMLSelectElement} selectEl - L'élément select à transformer
     * @param {Object} options - Options de configuration
     */
    enhance(selectEl, options = {}) {
        if (!selectEl || selectEl.dataset.enhanced === 'true') return;

        const id = selectEl.id || `dropdown-${Date.now()}-${++this._uidCounter}`;
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-dropdown';
        if (selectEl.classList.contains('mapping-select')) {
            wrapper.classList.add('mapping-select-dropdown');
        }
        if (selectEl.classList.contains('import-separator-select')) {
            wrapper.classList.add('import-separator-dropdown');
        }
        if (options.className) {
            wrapper.classList.add(...options.className.split(/\s+/).filter(Boolean));
        }
        wrapper.dataset.for = id;

        // Créer le trigger (bouton)
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'custom-dropdown-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');

        const valueSpan = document.createElement('span');
        valueSpan.className = 'custom-dropdown-value';

        const arrow = document.createElement('span');
        arrow.className = 'custom-dropdown-arrow';
        arrow.innerHTML = '<iconify-icon icon="solar:alt-arrow-down-linear"></iconify-icon>';

        trigger.appendChild(valueSpan);
        trigger.appendChild(arrow);

        // Créer le menu
        const menu = document.createElement('div');
        menu.className = 'custom-dropdown-menu';
        menu.setAttribute('role', 'listbox');
        menu.setAttribute('aria-labelledby', id);

        // Parser les options et optgroups
        this.buildMenu(selectEl, menu);

        wrapper.appendChild(trigger);
        wrapper.appendChild(menu);

        // Insérer le wrapper et cacher le select original
        selectEl.parentNode.insertBefore(wrapper, selectEl);
        selectEl.style.display = 'none';
        selectEl.dataset.enhanced = 'true';

        // Mettre à jour la valeur affichée
        this.updateDisplay(wrapper, selectEl);

        // Event listeners
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle(wrapper);
        });

        menu.addEventListener('click', (e) => {
            const hint = e.target.closest('.custom-dropdown-hint');
            if (hint) {
                e.stopPropagation();
                this.closeAll();
                document.getElementById('apiKeysAccordion')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
                return;
            }
            const option = e.target.closest('.custom-dropdown-option');
            // Ne pas sélectionner les options désactivées
            if (option && !option.classList.contains('disabled')) {
                this.selectOption(wrapper, selectEl, option.dataset.value);
            }
        });

        // Stocker l'instance
        this.instances.set(id, { wrapper, selectEl, trigger, menu });

        return wrapper;
    },

    /**
     * Identifie le provider associé à un label de groupe.
     * @param {string} labelText 
     * @returns {Object|null} Configuration du provider ou null
     */
    getProviderFromLabel(labelText) {
        if (!labelText) return null;
        const mappings = [
            { pattern: /Google Gemini/i, id: 'google' },
            { pattern: /Albert/i, id: 'albert' },
            { pattern: /Groq/i, id: 'groq' },
            { pattern: /OpenRouter/i, id: 'openrouter' },
            { pattern: /OpenAI/i, id: 'openai' },
            { pattern: /Anthropic Claude/i, id: 'anthropic' },
            { pattern: /Mistral AI/i, id: 'mistral' },
            { pattern: /Ollama/i, id: 'ollama' },
        ];

        for (const m of mappings) {
            if (m.pattern.test(labelText)) {
                return PROVIDER_CONFIG[m.id];
            }
        }
        return null;
    },

    /**
     * Formate un label de groupe avec l'icône et le nom épuré du fournisseur.
     * @param {string} labelText - Le texte du label original
     * @returns {string} Le HTML avec l'icône du fournisseur
     */
    formatGroupLabel(labelText) {
        const config = this.getProviderFromLabel(labelText);

        if (config) {
            const styleAttr = config.style ? ` style="${config.style}"` : '';
            return `<iconify-icon icon="${config.icon}" class="provider-icon ${config.class}"${styleAttr}></iconify-icon> <span>${config.name}</span>`;
        }

        return labelText;
    },

    /**
     * Construit le contenu du menu à partir du select.
     */
    buildMenu(selectEl, menu) {
        menu.innerHTML = '';
        let focusIndex = 0;
        let hasVisibleOptions = false;
        const hiddenProviders = new Set();
        const isAiModelSelect = selectEl.id === 'aiModelSelect';

        Array.from(selectEl.children).forEach(child => {
            if (child.tagName === 'OPTGROUP') {
                const group = document.createElement('div');
                group.className = 'custom-dropdown-group';

                const options = Array.from(child.children);
                const allDisabled = options.length > 0 && options.every(opt => opt.disabled);

                if (allDisabled && isAiModelSelect) {
                    group.classList.add('group-all-disabled');
                    const providerConfig = this.getProviderFromLabel(child.label);
                    hiddenProviders.add(providerConfig?.name || child.label);
                } else {
                    hasVisibleOptions = true;
                }

                const label = document.createElement('div');
                label.className = 'custom-dropdown-group-label';
                label.innerHTML = this.formatGroupLabel(child.label);
                group.appendChild(label);

                options.forEach(opt => {
                    group.appendChild(this.createOption(opt, focusIndex++));
                });

                menu.appendChild(group);
            } else if (child.tagName === 'OPTION') {
                if (child.dataset.divider === 'true' || (child.disabled && /^[─—\-]+$/.test(child.textContent.trim()))) {
                    const divider = document.createElement('div');
                    divider.className = 'dropdown-divider';
                    divider.setAttribute('role', 'separator');
                    menu.appendChild(divider);
                    return;
                }
                if (!child.disabled) hasVisibleOptions = true;
                menu.appendChild(this.createOption(child, focusIndex++));
            }
        });

        // Pour le sélecteur de modèle IA, afficher un pied de page contextuel harmonisé
        if (isAiModelSelect) {
            if (!hasVisibleOptions) {
                const emptyNotice = document.createElement('div');
                emptyNotice.className = 'custom-dropdown-empty-notice';
                emptyNotice.innerHTML = '<iconify-icon icon="solar:info-circle-linear"></iconify-icon> <span>Aucun modèle disponible. Configurez une clé API ci-dessous.</span>';
                menu.appendChild(emptyNotice);
            } else if (hiddenProviders.size > 0) {
                const divider = document.createElement('div');
                divider.className = 'dropdown-divider';
                divider.setAttribute('role', 'separator');
                menu.appendChild(divider);

                const count = hiddenProviders.size;
                const hintLabel = count > 1
                    ? `${count} autres fournisseurs disponibles ci-dessous`
                    : `1 autre fournisseur disponible ci-dessous`;
                const hint = document.createElement('button');
                hint.type = 'button';
                hint.className = 'custom-dropdown-hint';
                hint.innerHTML = `<iconify-icon icon="solar:key-linear"></iconify-icon> <span>${hintLabel}</span>`;
                menu.appendChild(hint);
            }
        }
    },

    /**
     * Crée un élément option custom.
     */
    createOption(optionEl, index) {
        const div = document.createElement('div');
        div.className = 'custom-dropdown-option';
        div.setAttribute('role', 'option');
        div.dataset.value = optionEl.value;
        div.dataset.index = index;

        if (optionEl.selected) {
            div.classList.add('selected');
            div.setAttribute('aria-selected', 'true');
        }

        // Gérer les options désactivées avec tooltip explicatif
        if (optionEl.disabled) {
            div.classList.add('disabled');
            div.setAttribute('aria-disabled', 'true');

            // Ajouter un tooltip explicatif si une raison est fournie
            const reason = optionEl.dataset.disabledReason;
            if (reason) {
                div.classList.add('tooltip');
                div.setAttribute('data-tooltip', reason);
            }
        }

        const check = document.createElement('span');
        check.className = 'custom-dropdown-option-check';
        check.innerHTML = '<iconify-icon icon="ph:check-bold"></iconify-icon>';

        const textSpan = document.createElement('span');
        textSpan.className = 'custom-dropdown-option-text';

        // Sépare élégamment le libellé et son qualificatif (hors symboles de ponctuation d'1 caractère comme (;))
        const qualifierMatch = optionEl.textContent.match(/^(.*?)\s*\(([^)]+)\)$/);
        if (qualifierMatch && qualifierMatch[2].length > 1) {
            textSpan.innerHTML = `<span class="model-name">${qualifierMatch[1]}</span> <span class="model-dropdown-item-badge">${qualifierMatch[2]}</span>`;
        } else if (qualifierMatch) {
            textSpan.innerHTML = `<span class="model-name">${qualifierMatch[1]}</span> <span class="model-qualifier">(${qualifierMatch[2]})</span>`;
        } else {
            textSpan.textContent = optionEl.textContent;
        }

        div.appendChild(check);
        div.appendChild(textSpan);

        return div;
    },

    /**
     * Met à jour l'affichage de la valeur sélectionnée.
     */
    updateDisplay(wrapper, selectEl) {
        const valueSpan = wrapper.querySelector('.custom-dropdown-value');
        const selectedOption = selectEl.options[selectEl.selectedIndex];

        if (selectEl.id === 'aiModelSelect' && (!selectedOption || selectedOption.disabled)) {
            valueSpan.innerHTML = `<iconify-icon icon="solar:key-linear" class="provider-icon"></iconify-icon><span class="value-text">Configurer l'IA</span>`;
            valueSpan.classList.add('placeholder');
        } else if (selectedOption) {
            // Check if we should inject a provider icon (Premium UX)
            let iconHtml = '';
            if (selectedOption.parentNode && selectedOption.parentNode.tagName === 'OPTGROUP') {
                const config = this.getProviderFromLabel(selectedOption.parentNode.label);
                if (config) {
                    const baseStyle = config.style || '';
                    iconHtml = `<iconify-icon icon="${config.icon}" class="provider-icon ${config.class}" style="${baseStyle}"></iconify-icon>`;
                }
            }

            const displayText = selectedOption.textContent.replace(/\s*\([^)]{2,}\)$/, '');
            valueSpan.innerHTML = `${iconHtml}<span class="value-text">${displayText}</span>`;
            valueSpan.classList.remove('placeholder');
        } else {
            valueSpan.innerHTML = '<span class="value-text">Sélectionner...</span>';
            valueSpan.classList.add('placeholder');
        }

        // Mettre à jour les classes selected
        wrapper.querySelectorAll('.custom-dropdown-option').forEach(opt => {
            const isSelected = opt.dataset.value === selectEl.value && !opt.classList.contains('disabled');
            opt.classList.toggle('selected', isSelected);
            opt.setAttribute('aria-selected', isSelected);
        });
    },

    /**
 * Toggle l'ouverture/fermeture d'un dropdown.
 */
    toggle(wrapper) {
        const isOpen = wrapper.classList.contains('open');

        // Fermer tous les autres dropdowns custom
        this.closeAll();

        // Fermer aussi le sélecteur de période de l'assistant s'il est ouvert
        document.getElementById('wizardPeriodDropdown')?.classList.remove('open');
        document.getElementById('wizardPeriodMenu')?.classList.remove('open');

        if (!isOpen) {
            wrapper.classList.add('open');
            wrapper.querySelector('.custom-dropdown-trigger').setAttribute('aria-expanded', 'true');

            // Focus sur l'option sélectionnée
            const selected = wrapper.querySelector('.custom-dropdown-option.selected');
            if (selected) {
                selected.classList.add('focused');
                selected.scrollIntoView?.({ block: 'nearest' });
            }

            // Initialiser les tooltips pour les options désactivées
            // (nécessaire car les éléments sont ajoutés dynamiquement)
            TooltipsUI.initTooltips();

            // Fix z-index stacking context for settings cards, group cards and groups
            const parentCard = wrapper.closest('.settings-card, .settings-group-card');
            if (parentCard) {
                parentCard.classList.add('has-open-dropdown');
            }
            const parentGroup = wrapper.closest('.settings-group');
            if (parentGroup) {
                parentGroup.classList.add('has-open-dropdown');
            }

            // [UX Mobile] History integration
            HistoryManager.pushState('customDropdown', () => this.closeAll());
        }
    },

    /**
     * Ferme tous les dropdowns.
     */
    closeAll() {
        let hadOpen = false;
        document.querySelectorAll('.custom-dropdown.open').forEach(dd => {
            hadOpen = true;
            dd.classList.remove('open');
            const trigger = dd.querySelector('.custom-dropdown-trigger');
            if (trigger) {
                trigger.setAttribute('aria-expanded', 'false');
                if (document.activeElement === trigger && !trigger.matches(':focus-visible')) {
                    trigger.blur();
                }
            }
            dd.querySelectorAll('.custom-dropdown-option.focused').forEach(opt => {
                opt.classList.remove('focused');
            });
            // Cleanup z-index fix
            document.querySelectorAll('.has-open-dropdown').forEach(el => {
                el.classList.remove('has-open-dropdown');
            });
        });

        if (hadOpen && HistoryManager.isOpen('customDropdown')) {
            HistoryManager.handleManualClose('customDropdown');
        }
    },

    /**
     * Sélectionne une option.
     */
    selectOption(wrapper, selectEl, value) {
        selectEl.value = value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        this.updateDisplay(wrapper, selectEl);
        this.closeAll();
    },

    /**
     * Gère les événements clavier.
     */
    handleKeydown(e, wrapper) {
        const menu = wrapper.querySelector('.custom-dropdown-menu');
        const options = Array.from(menu.querySelectorAll('.custom-dropdown-group:not(.group-all-disabled) .custom-dropdown-option, .custom-dropdown-menu > .custom-dropdown-option'));
        const focusedIndex = options.findIndex(opt => opt.classList.contains('focused'));

        switch (e.key) {
            case 'Escape':
                e.preventDefault();
                this.closeAll();
                wrapper.querySelector('.custom-dropdown-trigger').focus();
                break;

            case 'ArrowDown':
                e.preventDefault();
                this.moveFocus(options, focusedIndex, 1);
                break;

            case 'ArrowUp':
                e.preventDefault();
                this.moveFocus(options, focusedIndex, -1);
                break;

            case 'Enter':
            case ' ':
                e.preventDefault();
                if (focusedIndex >= 0) {
                    const instance = this.instances.get(wrapper.dataset.for);
                    if (instance) {
                        this.selectOption(wrapper, instance.selectEl, options[focusedIndex].dataset.value);
                    }
                }
                break;

            case 'Tab':
                this.closeAll();
                break;
        }
    },

    /**
     * Déplace le focus entre les options (ignore les options désactivées).
     */
    moveFocus(options, currentIndex, direction) {
        options.forEach(opt => opt.classList.remove('focused'));

        let newIndex = currentIndex + direction;
        let attempts = 0;
        const maxAttempts = options.length;

        // Boucler pour trouver la prochaine option non désactivée
        while (attempts < maxAttempts) {
            if (newIndex < 0) newIndex = options.length - 1;
            if (newIndex >= options.length) newIndex = 0;

            // Si l'option n'est pas désactivée, on la sélectionne
            if (!options[newIndex].classList.contains('disabled')) {
                options[newIndex].classList.add('focused');
                options[newIndex]?.scrollIntoView?.({ block: 'nearest' });
                return;
            }

            newIndex += direction;
            attempts++;
        }
    },

    /**
     * Rafraîchit un dropdown après modification du select.
     * @param {string} selectId - L'ID du select à rafraîchir
     * @param {Function} [onRefresh] - Callback optionnel appelé après le refresh
     */
    refresh(selectId, onRefresh) {
        const instance = this.instances.get(selectId);
        if (instance) {
            this.buildMenu(instance.selectEl, instance.menu);
            this.updateDisplay(instance.wrapper, instance.selectEl);

            // Réinitialiser les tooltips pour les nouveaux éléments
            TooltipsUI.initTooltips();

            if (onRefresh) onRefresh();
        }
    }
};
