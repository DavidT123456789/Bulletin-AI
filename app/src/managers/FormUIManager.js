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
import { DEFAULT_IA_CONFIG, MAX_CHARS_CONFIG } from '../config/Config.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { ThemeManager } from './ThemeManager.js';

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
        const normalizedMaxChars = Utils.normalizeMaxChars?.(iaConfig.maxChars) ?? null;
        if (DOM.iaMaxCharsInput) {
            const isPreset = normalizedMaxChars !== null && Boolean(MAX_CHARS_CONFIG?.presets?.includes(normalizedMaxChars));
            DOM.iaMaxCharsInput.value = (normalizedMaxChars && !isPreset) ? String(normalizedMaxChars) : '';
        }
        if (DOM.iaStyleInstructions) DOM.iaStyleInstructions.value = iaConfig.styleInstructions ?? '';
        if (DOM.iaDiscipline) DOM.iaDiscipline.value = iaConfig.discipline ?? '';

        document.querySelectorAll('input[name="iaVoiceRadio"]').forEach(radio => {
            radio.checked = radio.value === (iaConfig.voice || 'default');
        });
        const voiceSelector = document.getElementById('iaVoiceSelector');
        if (voiceSelector?.classList?.contains('has-glider')) {
            UI.updateGlider?.(voiceSelector);
        }

        this.syncStyleControls();

        if (DOM.aiModelSelect) DOM.aiModelSelect.value = appState.currentAIModel;
        if (DOM.openaiApiKey) DOM.openaiApiKey.value = appState.openaiApiKey;
        if (DOM.googleApiKey) DOM.googleApiKey.value = appState.googleApiKey;
        if (DOM.albertApiKey) DOM.albertApiKey.value = appState.albertApiKey;
        if (DOM.groqApiKey) DOM.groqApiKey.value = appState.groqApiKey;
        if (DOM.openrouterApiKey) DOM.openrouterApiKey.value = appState.openrouterApiKey;
        if (DOM.anthropicApiKey) DOM.anthropicApiKey.value = appState.anthropicApiKey;
        if (DOM.mistralApiKey) DOM.mistralApiKey.value = appState.mistralApiKey;


        // Confidentialité
        if (DOM.settingsPrivacyAnonymizeToggle) {
            DOM.settingsPrivacyAnonymizeToggle.checked = appState.anonymizeData;
        }

        // Synchroniser la pastille de couleur d'accentuation et replier le tiroir personnalisé
        document.getElementById('customPickerPanel')?.classList.remove('open');
        ThemeManager.applyAccentColor(appState.accentColor);
    },

    /**
     * Synchronise l'affichage des contrôles de style dépendants (libellé de longueur,
     * limite de caractères, interrupteur des consignes) depuis MonStyle et la position du curseur.
     * Source unique d'affichage de la modale « Personnalisation du style ».
     */
    syncStyleControls() {
        const config = appState.subjects?.['MonStyle']?.iaConfig || DEFAULT_IA_CONFIG;
        const instructionsEnabled = config.enableStyleInstructions !== false;
        const maxChars = Utils.normalizeMaxChars?.(config.maxChars) ?? null;
        const maxCharsEnabled = maxChars !== null;

        if (DOM.iaLengthSlider && DOM.iaLengthSliderValue) {
            const words = parseInt(DOM.iaLengthSlider.value, 10);
            const approxChars = Math.round((words * APPROX_CHARS_PER_WORD) / 10) * 10;
            const safeWordCap = maxCharsEnabled
                ? (Utils.computeSafeWordCap?.(maxChars) ?? Math.max(8, Math.floor((maxChars * 0.86) / APPROX_CHARS_PER_WORD)))
                : null;
            DOM.iaLengthSliderValue.textContent = (maxCharsEnabled && words > safeWordCap)
                ? `~${words} → ${safeWordCap} mots max`
                : `~${words} mots • ~${approxChars} car.`;
        }

        const isPresetMaxChars = maxCharsEnabled && Boolean(MAX_CHARS_CONFIG?.presets?.includes(maxChars));
        if (DOM.iaMaxCharsToggle) DOM.iaMaxCharsToggle.checked = maxCharsEnabled;
        if (DOM.iaMaxCharsInput) {
            DOM.iaMaxCharsInput.disabled = !maxCharsEnabled;
            if (!maxCharsEnabled || isPresetMaxChars) {
                if (typeof document === 'undefined' || document.activeElement !== DOM.iaMaxCharsInput) {
                    DOM.iaMaxCharsInput.value = '';
                }
            } else if (!DOM.iaMaxCharsInput.value) {
                DOM.iaMaxCharsInput.value = String(maxChars);
            }
        }
        DOM.iaMaxCharsCollapsible?.classList?.toggle('open', maxCharsEnabled);
        if (DOM.iaMaxCharsValue) {
            DOM.iaMaxCharsValue.textContent = maxCharsEnabled ? `Max ${maxChars} car.` : 'Désactivée';
        }
        DOM.iaMaxCharsPresets?.querySelectorAll?.('[data-max-chars]')?.forEach(btn => {
            const isActive = maxCharsEnabled && Number(btn.dataset.maxChars) === maxChars;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
        });

        if (DOM.iaStyleInstructionsToggle) DOM.iaStyleInstructionsToggle.checked = instructionsEnabled;
        if (DOM.iaStyleInstructions) DOM.iaStyleInstructions.disabled = !instructionsEnabled;
    },

    /**
     * Résout la limite de caractères active depuis les contrôles DOM (toggle, champ libre, preset actif)
     * avec repli sur la configuration stockée ou la valeur par défaut.
     * @param {number|string|null} [fallbackMaxChars=null]
     * @returns {number|null}
     */
    resolveMaxCharsFromDOM(fallbackMaxChars = null) {
        if (!DOM.iaMaxCharsToggle?.checked) return null;
        const defaultLimit = MAX_CHARS_CONFIG?.defaultValue ?? 400;
        const activePresetVal = DOM.iaMaxCharsPresets?.querySelector?.('.max-chars-preset-btn.active')?.dataset?.maxChars;
        const storedMaxChars = fallbackMaxChars ?? appState.subjects?.['MonStyle']?.iaConfig?.maxChars;
        return Utils.normalizeMaxChars?.(DOM.iaMaxCharsInput?.value)
            ?? Utils.normalizeMaxChars?.(activePresetVal)
            ?? Utils.normalizeMaxChars?.(storedMaxChars)
            ?? defaultLimit;
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
