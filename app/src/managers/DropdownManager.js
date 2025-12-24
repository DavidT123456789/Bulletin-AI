/**
 * @fileoverview Gestionnaire de dropdowns custom.
 * Remplace les <select> natifs par des composants stylisables avec accessibilité clavier.
 * @module managers/DropdownManager
 */

import { DOM } from '../utils/DOM.js';

/**
 * Module de gestion des dropdowns custom.
 * @namespace DropdownManager
 */
export const DropdownManager = {
    /** Map des dropdowns initialisés (id -> instance data) */
    instances: new Map(),

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

        const id = selectEl.id || `dropdown-${Date.now()}`;
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-dropdown';
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
        arrow.innerHTML = '<i class="fas fa-chevron-down"></i>';

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
     * Transforme un label de groupe avec emojis en HTML avec icônes professionnelles.
     * @param {string} labelText - Le texte du label original
     * @returns {string} Le HTML avec des icônes Font Awesome
     */
    formatGroupLabel(labelText) {
        // Mapping des emojis vers des icônes Font Awesome avec classes pour le styling
        const iconMappings = [
            // Google Gemini - utilise le logo Google officiel
            { pattern: /💚\s*Google Gemini/i, icon: '<i class="fab fa-google provider-icon provider-google"></i>', text: 'Google Gemini' },
            // OpenRouter - utilise un éclair stylisé
            { pattern: /💚\s*OpenRouter/i, icon: '<i class="fas fa-bolt provider-icon provider-openrouter"></i>', text: 'OpenRouter' },
            { pattern: /💰\s*OpenRouter/i, icon: '<i class="fas fa-bolt provider-icon provider-openrouter-paid"></i>', text: 'OpenRouter' },
            // OpenAI - utilise le robot
            { pattern: /💰\s*OpenAI/i, icon: '<i class="fas fa-robot provider-icon provider-openai"></i>', text: 'OpenAI' },
            // Ollama - maison pour local
            { pattern: /🏠\s*Ollama/i, icon: '<i class="fas fa-home provider-icon provider-ollama"></i>', text: 'Ollama' },
        ];

        for (const mapping of iconMappings) {
            if (mapping.pattern.test(labelText)) {
                // Extraire la partie après le nom du provider (ex: "— GRATUIT", "— PAYANT", "— LOCAL")
                const suffixMatch = labelText.match(/—\s*(.+)$/);
                const suffix = suffixMatch ? ` <span class="provider-suffix provider-suffix-${suffixMatch[1].toLowerCase()}">${suffixMatch[1]}</span>` : '';
                return `${mapping.icon} ${mapping.text}${suffix}`;
            }
        }

        // Fallback: retourner le texte original si pas de pattern trouvé
        return labelText;
    },

    /**
     * Construit le contenu du menu à partir du select.
     */
    buildMenu(selectEl, menu) {
        menu.innerHTML = '';
        let focusIndex = 0;

        Array.from(selectEl.children).forEach(child => {
            if (child.tagName === 'OPTGROUP') {
                const group = document.createElement('div');
                group.className = 'custom-dropdown-group';

                const label = document.createElement('div');
                label.className = 'custom-dropdown-group-label';
                // Utiliser innerHTML pour permettre les icônes Font Awesome
                label.innerHTML = this.formatGroupLabel(child.label);
                group.appendChild(label);

                Array.from(child.children).forEach(opt => {
                    group.appendChild(this.createOption(opt, focusIndex++));
                });

                menu.appendChild(group);
            } else if (child.tagName === 'OPTION') {
                menu.appendChild(this.createOption(child, focusIndex++));
            }
        });
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
        check.innerHTML = '<i class="fas fa-check"></i>';

        const text = document.createElement('span');
        text.textContent = optionEl.textContent;

        div.appendChild(check);
        div.appendChild(text);

        return div;
    },

    /**
     * Met à jour l'affichage de la valeur sélectionnée.
     */
    updateDisplay(wrapper, selectEl) {
        const valueSpan = wrapper.querySelector('.custom-dropdown-value');
        const selectedOption = selectEl.options[selectEl.selectedIndex];

        if (selectedOption) {
            valueSpan.textContent = selectedOption.textContent;
            valueSpan.classList.remove('placeholder');
        } else {
            valueSpan.textContent = 'Sélectionner...';
            valueSpan.classList.add('placeholder');
        }

        // Mettre à jour les classes selected
        wrapper.querySelectorAll('.custom-dropdown-option').forEach(opt => {
            const isSelected = opt.dataset.value === selectEl.value;
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

        // Fermer aussi le menu actions (3 points) s'il est ouvert
        const actionsDropdown = document.querySelector('.actions-dropdown');
        actionsDropdown?.classList.remove('show');

        if (!isOpen) {
            wrapper.classList.add('open');
            wrapper.querySelector('.custom-dropdown-trigger').setAttribute('aria-expanded', 'true');

            // Focus sur l'option sélectionnée
            const selected = wrapper.querySelector('.custom-dropdown-option.selected');
            if (selected) {
                selected.classList.add('focused');
                selected.scrollIntoView({ block: 'nearest' });
            }

            // Initialiser les tooltips pour les options désactivées
            // (nécessaire car les éléments sont ajoutés dynamiquement)
            import('./UIManager.js').then(({ UI }) => {
                if (UI && UI.initTooltips) {
                    UI.initTooltips();
                }
            }).catch(() => { });
        }
    },

    /**
     * Ferme tous les dropdowns.
     */
    closeAll() {
        document.querySelectorAll('.custom-dropdown.open').forEach(dd => {
            dd.classList.remove('open');
            dd.querySelector('.custom-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
            dd.querySelectorAll('.custom-dropdown-option.focused').forEach(opt => {
                opt.classList.remove('focused');
            });
        });
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
        const options = Array.from(menu.querySelectorAll('.custom-dropdown-option'));
        const focusedIndex = options.findIndex(opt => opt.classList.contains('focused'));
        const selectEl = document.querySelector(`select[data-enhanced="true"]`);

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
                options[newIndex].scrollIntoView({ block: 'nearest' });
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
            // Import dynamique pour éviter les dépendances circulaires
            import('./UIManager.js').then(({ UI }) => {
                if (UI && UI.initTooltips) {
                    UI.initTooltips();
                }
            }).catch(() => {
                // Fallback silencieux si l'import échoue
            });

            if (onRefresh) onRefresh();
        }
    }
};
