/**
 * @fileoverview Gestionnaire des champs de formulaire des paramètres.
 * 
 * Ce module gère la mise à jour des champs de formulaire dans la modale
 * des paramètres, y compris les sliders IA, les listes de vocabulaire,
 * et l'affichage des prompts.
 * 
 * @module managers/FormUIManager
 */

import { appState } from '../state/State.js';
import { DEFAULT_IA_CONFIG, IA_TONE_LABELS, MODEL_DESCRIPTIONS, DEFAULT_SEATING_STATUS_DOTS } from '../config/Config.js';
import { DOM } from '../utils/DOM.js';
import { UI } from './UIManager.js';

/** Nombre moyen de caractères par mot, pour l'estimation affichée sous la cible de longueur. */
const APPROX_CHARS_PER_WORD = 6.5;

/** @type {import('./AppManager.js').App|null} */
let App;

/**
 * Module de gestion des formulaires dans les paramètres.
 * @namespace FormUI
 */
export const FormUI = {
    /**
     * Initialise le module avec une référence à l'application.
     * @param {Object} appInstance - Instance de l'application principale
     */
    init(appInstance) {
        App = appInstance;
    },

    /**
     * Met à jour tous les champs des paramètres.
     */
    updateSettingsFields() {
        const iaConfig = appState.subjects?.['MonStyle']?.iaConfig
            || appState.subjects?.['Générique']?.iaConfig
            || DEFAULT_IA_CONFIG;

        DOM.periodSystemRadios.forEach(r => r.checked = r.value === appState.periodSystem);
        if (DOM.settingsEvolutionThresholdPositive) {
            DOM.settingsEvolutionThresholdPositive.value = appState.evolutionThresholds.positive;
            this.updateSpinnerBounds(DOM.settingsEvolutionThresholdPositive);
        }
        if (DOM.settingsEvolutionThresholdNegative) {
            DOM.settingsEvolutionThresholdNegative.value = appState.evolutionThresholds.negative;
            this.updateSpinnerBounds(DOM.settingsEvolutionThresholdNegative);
        }

        if (DOM.iaLengthSlider) DOM.iaLengthSlider.value = iaConfig.length;
        if (DOM.iaToneSlider) DOM.iaToneSlider.value = iaConfig.tone ?? 3;
        if (DOM.iaStyleInstructions) DOM.iaStyleInstructions.value = iaConfig.styleInstructions ?? '';
        if (DOM.iaDiscipline) DOM.iaDiscipline.value = iaConfig.discipline ?? '';

        document.querySelectorAll('input[name="iaVoiceRadio"]').forEach(radio => {
            radio.checked = radio.value === (iaConfig.voice || 'default');
        });

        this.syncStyleControls();

        if (DOM.aiModelSelect) DOM.aiModelSelect.value = appState.currentAIModel;
        if (DOM.openaiApiKey) DOM.openaiApiKey.value = appState.openaiApiKey;
        if (DOM.googleApiKey) DOM.googleApiKey.value = appState.googleApiKey;
        if (DOM.albertApiKey) DOM.albertApiKey.value = appState.albertApiKey;
        if (DOM.groqApiKey) DOM.groqApiKey.value = appState.groqApiKey;
        if (DOM.openrouterApiKey) DOM.openrouterApiKey.value = appState.openrouterApiKey;
        if (DOM.anthropicApiKey) DOM.anthropicApiKey.value = appState.anthropicApiKey;
        if (DOM.mistralApiKey) DOM.mistralApiKey.value = appState.mistralApiKey;


        // Synchroniser les pastilles de statut du plan de classe
        const seatingDotsSelector = document.getElementById('seatingStatusDotsSelector');
        if (seatingDotsSelector) {
            const currentDots = {
                ...DEFAULT_SEATING_STATUS_DOTS,
                ...(appState.seatingStatusDots || {})
            };
            seatingDotsSelector.querySelectorAll('input[type="checkbox"][data-dot-category]').forEach(cb => {
                const cat = cb.getAttribute('data-dot-category');
                const isChecked = Boolean(currentDots[cat]);
                cb.checked = isChecked;
                cb.closest('.seating-dot-option')?.classList.toggle('active', isChecked);
            });
        }

        // Confidentialité
        if (DOM.settingsPrivacyAnonymizeToggle) {
            DOM.settingsPrivacyAnonymizeToggle.checked = appState.anonymizeData;
        }

        // Synchroniser la pastille de couleur d'accentuation
        const accentSelector = document.getElementById('accentColorSelector');
        if (accentSelector) {
            const rawAccent = appState.accentColor || 'blue';
            const isCustomHex = typeof rawAccent === 'string' && /^#[0-9a-fA-F]{6}$/.test(rawAccent.trim());
            const currentAccent = isCustomHex ? 'custom' : (['blue', 'purple', 'pink', 'orange', 'green', 'teal'].includes(rawAccent) ? rawAccent : 'blue');


            accentSelector.querySelectorAll('.accent-color-swatch').forEach(swatch => {
                const swatchColor = swatch.getAttribute('data-color');
                const isActive = swatchColor === currentAccent;
                swatch.classList.toggle('active', isActive);
                swatch.setAttribute('aria-checked', String(isActive));
                if (swatchColor === 'custom' && isCustomHex) {
                    swatch.style.setProperty('--swatch-color', rawAccent.trim().toLowerCase());
                }
            });
        }

        this.updateModelDescription();
    },

    /**
     * Synchronise l'affichage des contrôles de style dépendants (libellés de longueur et de ton,
     * interrupteurs, état des consignes) depuis MonStyle et la position des curseurs.
     * Source unique d'affichage de la modale « Personnalisation du style ».
     */
    syncStyleControls() {
        const config = appState.subjects?.['MonStyle']?.iaConfig || DEFAULT_IA_CONFIG;
        const toneEnabled = config.enableTone ?? (config.tone !== undefined && config.tone !== 3);
        const instructionsEnabled = config.enableStyleInstructions !== false;

        if (DOM.iaLengthSlider && DOM.iaLengthSliderValue) {
            const words = parseInt(DOM.iaLengthSlider.value, 10);
            DOM.iaLengthSliderValue.textContent = `~${words} mots • ~${Math.round(words * APPROX_CHARS_PER_WORD)} car.`;
        }

        if (DOM.iaToneToggle) DOM.iaToneToggle.checked = toneEnabled;
        if (DOM.iaToneSlider) DOM.iaToneSlider.disabled = !toneEnabled;
        DOM.iaToneCollapsible?.classList.toggle('open', toneEnabled);

        const toneVal = parseInt(DOM.iaToneSlider?.value, 10) || 3;
        if (DOM.iaToneSliderValue) {
            DOM.iaToneSliderValue.textContent = toneEnabled
                ? (IA_TONE_LABELS[toneVal] || IA_TONE_LABELS[3])
                : 'Adaptatif (libre)';
        }

        if (DOM.iaStyleInstructionsToggle) DOM.iaStyleInstructionsToggle.checked = instructionsEnabled;
        if (DOM.iaStyleInstructions) DOM.iaStyleInstructions.disabled = !instructionsEnabled;
    },

    /**
     * Met à jour la description du modèle IA sélectionné.
     */
    updateModelDescription() {
        const descEl = document.getElementById('aiModelDescription');
        if (DOM.aiModelSelect && descEl) {
            descEl.innerHTML = MODEL_DESCRIPTIONS[DOM.aiModelSelect.value] || "Description...";
        }
    },

    // État pour les transitions d'onglets des paramètres
    _currentSettingsTab: 'templates',
    _isSettingsTabAnimating: false,

    /**
     * Affiche un onglet spécifique dans la modale des paramètres avec animation iOS.
     * Utilise les mêmes transitions slide que la modale Bienvenue pour la cohérence.
     * @param {string} tabName - Nom de l'onglet à afficher ('templates', 'advanced', 'about')
     */
    showSettingsTab(tabName) {
        const tabOrder = ['templates', 'advanced', 'about'];

        if (this._isSettingsTabAnimating) return;

        // Synchroniser l'état avec le DOM
        const activeTabBtn = DOM.settingsModal.querySelector('.settings-tab.active');
        if (activeTabBtn?.dataset.tab) {
            this._currentSettingsTab = activeTabBtn.dataset.tab;
        }

        if (tabName === this._currentSettingsTab) return;

        const oldContent = document.getElementById(`${this._currentSettingsTab}TabContent`);
        const newContent = document.getElementById(`${tabName}TabContent`);
        if (!newContent) return;

        const currentIndex = tabOrder.indexOf(this._currentSettingsTab);
        const targetIndex = tabOrder.indexOf(tabName);
        const direction = targetIndex > currentIndex ? 'next' : 'prev';

        // Helper pour mettre à jour les états des boutons
        const updateTabButtons = () => {
            DOM.settingsModal.querySelectorAll('.settings-tab').forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            const btn = DOM.settingsModal.querySelector(`.settings-tab[data-tab="${tabName}"]`);
            if (btn) {
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
            }
        };

        // Helper pour les actions post-transition
        const onTransitionComplete = () => {
            if (tabName === 'templates' && App?.populatePreviewStudentSelect) {
                App.populatePreviewStudentSelect();
            }
            UI.initGliders();
            newContent.querySelectorAll('.ui-segmented-control').forEach(container => {
                if (container.classList.contains('has-glider')) {
                    UI.updateGlider(container, true);
                }
            });
        };

        // Vérifier si oldContent est visible
        const isOldContentVisible = oldContent && (
            oldContent.classList.contains('active') ||
            window.getComputedStyle(oldContent).display !== 'none'
        );

        // Premier affichage : instantané sans animation
        if (!isOldContentVisible) {
            DOM.settingsModal.querySelectorAll('.tab-content').forEach(c => {
                c.style.display = 'none';
                c.classList.remove('active');
            });
            updateTabButtons();
            newContent.style.display = 'block';
            newContent.classList.add('active');
            this._currentSettingsTab = tabName;
            setTimeout(onTransitionComplete, 50);
            return;
        }

        // Transition animée
        this._isSettingsTabAnimating = true;
        const outClass = direction === 'next' ? 'content-slide-out-left' : 'content-slide-out-right';
        const inClass = direction === 'next' ? 'content-slide-in-right' : 'content-slide-in-left';
        const animClasses = ['content-slide-out-left', 'content-slide-out-right', 'content-slide-in-left', 'content-slide-in-right'];

        updateTabButtons();

        // Lancer les deux animations simultanément - le CSS gère la superposition
        oldContent.classList.add(outClass);
        newContent.style.display = 'block';
        newContent.classList.add('active', inClass);

        // Nettoyer l'ancien contenu après sa sortie (350ms = durée animation sortie)
        setTimeout(() => {
            oldContent.style.display = 'none';
            oldContent.classList.remove('active', ...animClasses);
        }, 350);

        // Finaliser après l'animation d'entrée (400ms = durée animation entrée)
        setTimeout(() => {
            newContent.classList.remove(...animClasses);
            this._isSettingsTabAnimating = false;
            this._currentSettingsTab = tabName;
            onTransitionComplete();
        }, 400);
    },

    /**
     * Met à jour l'état activé/désactivé des boutons d'un stepper selon les bornes min/max.
     * @param {HTMLInputElement} input - Champ numérique dans le wrapper
     */
    updateSpinnerBounds(input) {
        if (!input || typeof input.closest !== 'function') return;
        const wrapper = input.closest('.number-input-wrapper');
        if (!wrapper) return;
        const val = parseFloat(input.value);
        const min = input.min !== '' && input.min !== undefined ? parseFloat(input.min) : -Infinity;
        const max = input.max !== '' && input.max !== undefined ? parseFloat(input.max) : Infinity;
        const decBtn = wrapper.querySelector('.number-spinner-btn.decrement');
        const incBtn = wrapper.querySelector('.number-spinner-btn.increment');
        if (decBtn) decBtn.disabled = !Number.isNaN(val) && val <= min;
        if (incBtn) incBtn.disabled = !Number.isNaN(val) && val >= max;
    },

};
