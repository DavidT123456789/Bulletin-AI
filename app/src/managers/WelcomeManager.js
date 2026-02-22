/**
 * @fileoverview Gestionnaire du welcome modal et de l'onboarding
 * @module managers/WelcomeManager
 * 
 * Responsabilités :
 * - Affichage et navigation du guide de bienvenue
 * - Activation du mode démo
 * - Configuration initiale (clé API, système de périodes)
 */

import { appState } from '../state/State.js';
import { CONFIG } from '../config/Config.js';
import { PROVIDER_DEFAULT_MODELS } from '../config/models.js';
import { DOM } from '../utils/DOM.js';
import { UI } from './UIManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { StorageManager } from './StorageManager.js';
import { ImportWizardManager } from './ImportWizardManager.js';

let validateApiKeyCallback = null;
let welcomeModalAbortController = null;

export const WelcomeManager = {
    /**
     * Définit le callback pour la validation de clé API
     * @param {Function} callback - Fonction de validation
     */
    setValidateApiKeyCallback(callback) {
        validateApiKeyCallback = callback;
    },

    /**
     * Vérifie si c'est la première visite et affiche le welcome modal si nécessaire
     */
    handleFirstVisit() {
        if (!localStorage.getItem(CONFIG.LS_FIRST_VISIT_KEY)) {
            UI.openModal(DOM.welcomeModal);
            this.setupWelcomeModal();
        }
    },

    /**
     * Configure le welcome modal avec tous ses écouteurs d'événements
     */
    setupWelcomeModal() {
        // Supprimer les anciens écouteurs d'événements pour éviter l'accumulation
        if (welcomeModalAbortController) {
            welcomeModalAbortController.abort();
        }
        welcomeModalAbortController = new AbortController();
        const signal = welcomeModalAbortController.signal;

        let currentWelcomeStep = 1;
        const totalWelcomeSteps = 4;
        let isAnimating = false;
        let currentProvider = 'mistral';

        // Helpers Defined First
        const addClickListener = (element, handler) => {
            if (element) element.addEventListener('click', handler, { signal });
        };

        const cleanAnimationClasses = (el) => {
            el.classList.remove('slide-in-right', 'slide-in-left', 'slide-out-left', 'slide-out-right');
        };

        // Helper to update input and button state for current provider
        const updateProviderKeyState = (provider) => {
            const input = DOM.welcomeApiKeyInput;
            const validateBtn = DOM.welcomeValidateApiKeyBtn;

            // Get the correct existing key based on provider
            let existingKey = '';
            if (provider === 'google') {
                existingKey = appState.googleApiKey;
            } else if (provider === 'openrouter') {
                existingKey = appState.openrouterApiKey;
            } else if (provider === 'mistral') {
                existingKey = appState.mistralApiKey;
            }

            if (input) {
                input.value = existingKey || '';
            }

            if (validateBtn) {
                // Reset all button state classes
                validateBtn.classList.remove('ready', 'validated');

                if (existingKey) {
                    validateBtn.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon> Validée';
                    validateBtn.classList.add('validated');
                    validateBtn.disabled = true;
                    DOM.welcomeNextBtn.disabled = false;
                } else {
                    validateBtn.innerHTML = 'Valider';
                    // Default state (grey) - no class needed
                    validateBtn.disabled = false;
                    // Only disable next if no key for any provider and not in demo mode
                    DOM.welcomeNextBtn.disabled = !appState.isDemoMode;
                }
            }
        };

        // Provider Selection Logic (new radio-based selector)
        const providerSelector = document.getElementById('welcomeProviderSelector');
        const getKeyLink = document.getElementById('welcomeGetKeyLink');

        // Provider configuration
        const providerConfig = {
            mistral: {
                placeholder: "Collez votre clé API Mistral ici...",
                linkUrl: "https://console.mistral.ai/api-keys/",
                linkIcon: '<iconify-icon icon="solar:cat-linear" style="color: #fd6f00;"></iconify-icon>'
            },
            google: {
                placeholder: "Collez votre clé API Google ici (AIzaSy...)",
                linkUrl: "https://aistudio.google.com/app/apikey",
                linkIcon: '<iconify-icon icon="logos:google-icon"></iconify-icon>'
            },
            openrouter: {
                placeholder: "Collez votre clé API OpenRouter ici (sk-or-...)",
                linkUrl: "https://openrouter.ai/keys",
                linkIcon: '<iconify-icon icon="solar:bolt-linear" style="color: var(--secondary-color);"></iconify-icon>'
            }
        };

        if (providerSelector) {
            providerSelector.addEventListener('change', (e) => {
                if (e.target.type !== 'radio') return;

                const provider = e.target.value;
                currentProvider = provider;

                const config = providerConfig[provider];

                // Update input placeholder
                if (DOM.welcomeApiKeyInput) {
                    DOM.welcomeApiKeyInput.placeholder = config.placeholder;
                }

                // Update "Get key" link
                if (getKeyLink) {
                    getKeyLink.href = config.linkUrl;
                    getKeyLink.innerHTML = `${config.linkIcon} Obtenir ma clé`;
                }

                // Update input value and validation state for this provider
                updateProviderKeyState(currentProvider);
            }, { signal });
        }

        const showWelcomeStep = (step, direction = 'next') => {
            // ... (keep existing implementation)
            if (isAnimating) return;

            const oldStepEl = document.getElementById(`welcome-step-${currentWelcomeStep}`);
            const newStepEl = document.getElementById(`welcome-step-${step}`);

            if (!newStepEl || step === currentWelcomeStep) return;

            isAnimating = true;

            // Clean previous animation classes
            document.querySelectorAll('.welcome-step').forEach(cleanAnimationClasses);

            // Animate out the current step
            if (oldStepEl) {
                const outClass = direction === 'next' ? 'slide-out-left' : 'slide-out-right';
                oldStepEl.classList.add(outClass);

                // Remove active class after animation
                setTimeout(() => {
                    oldStepEl.classList.remove('active');
                    cleanAnimationClasses(oldStepEl);
                }, 400);
            }

            // Animate in the new step
            const inClass = direction === 'next' ? 'slide-in-right' : 'slide-in-left';
            newStepEl.classList.add('active', inClass);

            // Update navigation state
            setTimeout(() => {
                cleanAnimationClasses(newStepEl);
                isAnimating = false;
            }, 500);

            // Update dots
            DOM.welcomeDots.querySelectorAll('.dot').forEach((dot, index) => dot.classList.toggle('active', index + 1 === step));
            DOM.welcomePrevBtn.style.visibility = step === 1 ? 'hidden' : 'visible';
            DOM.welcomeNextBtn.style.display = step === totalWelcomeSteps ? 'none' : 'inline-flex';
            DOM.welcomeFinishOptions.style.display = step === totalWelcomeSteps ? 'flex' : 'none';
            DOM.welcomeNextStepInfo.style.display = 'none';

            // Si la clé existe, bouton next actif
            if (step === 2) {
                // Check current provider key if available (simplified check)
                const hasApiKey = appState.googleApiKey || appState.openrouterApiKey || appState.mistralApiKey || appState.isDemoMode;
                // Note: We don't block next button anymore based on key presence because of "Continue without key" button
                // But for the main "Next" button in nav bar, let's keep it enabled generally to allow skipping via nav if user really wants?
                // Actually, step 2 usually requires action. "Next" button logic:
                // If user clicks "Next" without key, it might be weird. 
                // Let's rely on the specific buttons in the step content.
                DOM.welcomeNextBtn.disabled = !hasApiKey;

                // Reset error message
                if (DOM.welcomeApiKeyError) DOM.welcomeApiKeyError.style.display = 'none';

                // Initialize glider for provider selector IMMEDIATELY (before slide-in animation completes)
                // This prevents the "popping" effect where the glider appears with a delay
                const providerSelectorEl = document.getElementById('welcomeProviderSelector');
                if (providerSelectorEl) {
                    // First, ensure the glider element exists
                    let glider = providerSelectorEl.querySelector('.ui-glider');
                    if (!glider) {
                        glider = document.createElement('div');
                        glider.className = 'ui-glider';
                        glider.style.transition = 'none'; // No animation on first appearance
                        providerSelectorEl.prepend(glider);
                        providerSelectorEl.classList.add('has-glider');
                    }

                    // Position it immediately on the checked radio
                    const checked = providerSelectorEl.querySelector('input:checked');
                    if (checked) {
                        const label = providerSelectorEl.querySelector(`label[for="${checked.id}"]`);
                        if (label) {
                            // Use requestAnimationFrame to ensure DOM is ready
                            requestAnimationFrame(() => {
                                glider.style.width = `${label.offsetWidth}px`;
                                glider.style.left = `${label.offsetLeft}px`;
                                // Re-enable transitions after initial positioning
                                requestAnimationFrame(() => {
                                    glider.style.transition = 'left 0.35s cubic-bezier(0.32, 0.72, 0, 1), width 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
                                });
                            });
                        }
                    }
                }
            } else {
                DOM.welcomeNextBtn.disabled = false;
            }

            if (DOM.welcomeLoadSampleBtn.disabled && step === 4) DOM.welcomeNextStepInfo.style.display = 'block';
            currentWelcomeStep = step;
        };


        const finishWelcome = (hidePermanently) => {
            if (hidePermanently) localStorage.setItem(CONFIG.LS_FIRST_VISIT_KEY, 'true');
            const selectedSystem = document.querySelector('input[name="welcomePeriodSystemRadio"]:checked').value;
            if (appState.periodSystem !== selectedSystem) {
                appState.periodSystem = selectedSystem;
                UI.updatePeriodSystemUI();
            }
            StorageManager.saveAppState();
            UI.closeModal(DOM.welcomeModal);
            UI.updateGenerateButtonState();

            // Check if sample data was loaded and needs to be imported
            const sampleData = sessionStorage.getItem('pendingSampleData');
            if (sampleData) {
                sessionStorage.removeItem('pendingSampleData');

                setTimeout(() => {
                    ImportWizardManager.openWithData(sampleData);
                }, 400);
            }
        };

        const validateWelcomeApiKey = async () => {
            if (validateApiKeyCallback) {
                await validateApiKeyCallback(
                    currentProvider, // Use dynamic provider
                    DOM.welcomeApiKeyInput,
                    DOM.welcomeApiKeyError,
                    DOM.welcomeValidateApiKeyBtn,
                    () => {
                        // ✅ Auto-sélection du modèle compatible avec la clé validée
                        // Évite l'erreur "clé OpenRouter requise" quand l'utilisateur a configuré Mistral
                        const recommendedModel = PROVIDER_DEFAULT_MODELS[currentProvider];
                        if (recommendedModel && appState.currentAIModel !== recommendedModel) {
                            // Le modèle actuel n'est pas compatible avec la clé validée
                            // → Basculer automatiquement vers un modèle qui fonctionne
                            appState.currentAIModel = recommendedModel;
                            StorageManager.saveAppState();

                            // Mettre à jour le select du modèle dans les paramètres si présent
                            if (DOM.aiModelSelect) {
                                DOM.aiModelSelect.value = recommendedModel;
                            }
                        }

                        DOM.welcomeNextBtn.disabled = false;
                        setTimeout(() => DOM.welcomeNextBtn.click(), 500);
                    }
                );
            }
        };

        // Pré-remplir le champ API key et montrer l'état validé si une clé existe
        const existingGoogleKey = appState.googleApiKey;
        const existingOpenRouterKey = appState.openrouterApiKey;
        const existingMistralKey = appState.mistralApiKey;

        // Helper to select a provider and update UI
        const selectProvider = (providerId) => {
            const radio = document.getElementById(providerId);
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        };

        if (DOM.welcomeApiKeyInput) {
            if (existingMistralKey) {
                // Mistral key exists - keep default Mistral provider
                DOM.welcomeApiKeyInput.value = existingMistralKey;
                // Mark as validated
                if (DOM.welcomeValidateApiKeyBtn) {
                    DOM.welcomeValidateApiKeyBtn.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon> Validée';
                    DOM.welcomeValidateApiKeyBtn.classList.remove('ready');
                    DOM.welcomeValidateApiKeyBtn.classList.add('validated');
                    DOM.welcomeValidateApiKeyBtn.disabled = true;
                }
                DOM.welcomeNextBtn.disabled = false;
            } else if (existingGoogleKey) {
                // Switch to Google provider
                selectProvider('providerGoogle');
                currentProvider = 'google';
                DOM.welcomeApiKeyInput.value = existingGoogleKey;
                // Mark as validated
                if (DOM.welcomeValidateApiKeyBtn) {
                    DOM.welcomeValidateApiKeyBtn.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon> Validée';
                    DOM.welcomeValidateApiKeyBtn.classList.remove('ready');
                    DOM.welcomeValidateApiKeyBtn.classList.add('validated');
                    DOM.welcomeValidateApiKeyBtn.disabled = true;
                }
                DOM.welcomeNextBtn.disabled = false;
            } else if (existingOpenRouterKey) {
                // Switch to OpenRouter provider
                selectProvider('providerOpenRouter');
                currentProvider = 'openrouter';
                DOM.welcomeApiKeyInput.value = existingOpenRouterKey;
                // Mark as validated
                if (DOM.welcomeValidateApiKeyBtn) {
                    DOM.welcomeValidateApiKeyBtn.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon> Validée';
                    DOM.welcomeValidateApiKeyBtn.classList.remove('ready');
                    DOM.welcomeValidateApiKeyBtn.classList.add('validated');
                    DOM.welcomeValidateApiKeyBtn.disabled = true;
                }
                DOM.welcomeNextBtn.disabled = false;
            }
        }

        // Initialize first step without animation
        const initFirstStep = () => {
            const firstStepEl = document.getElementById('welcome-step-1');
            if (firstStepEl) {
                document.querySelectorAll('.welcome-step').forEach(s => s.classList.remove('active'));
                firstStepEl.classList.add('active');
            }
            DOM.welcomeDots.querySelectorAll('.dot').forEach((dot, index) => dot.classList.toggle('active', index === 0));
            DOM.welcomePrevBtn.style.visibility = 'hidden';
            DOM.welcomeNextBtn.style.display = 'inline-flex';
            DOM.welcomeFinishOptions.style.display = 'none';
            DOM.welcomeNextStepInfo.style.display = 'none';
            DOM.welcomeNextBtn.disabled = false;
            currentWelcomeStep = 1;
        };

        initFirstStep();

        // Toggle button style based on input content (grey when empty, orange when key is present)
        if (DOM.welcomeApiKeyInput) {
            DOM.welcomeApiKeyInput.addEventListener('input', (e) => {
                const validateBtn = DOM.welcomeValidateApiKeyBtn;
                if (!validateBtn) return;

                const hasValue = e.target.value.trim().length > 0;

                // Don't change if already validated
                if (validateBtn.classList.contains('validated')) return;

                if (hasValue) {
                    validateBtn.classList.add('ready');
                } else {
                    validateBtn.classList.remove('ready');
                }
            }, { signal });
        }

        addClickListener(DOM.welcomeNextBtn, () => {
            if (currentWelcomeStep < totalWelcomeSteps) {
                showWelcomeStep(currentWelcomeStep + 1, 'next');
            }
        });

        addClickListener(DOM.welcomePrevBtn, () => {
            if (currentWelcomeStep > 1) {
                showWelcomeStep(currentWelcomeStep - 1, 'prev');
            }
        });


        addClickListener(DOM.welcomeFinishBtn, () => finishWelcome(false));
        addClickListener(DOM.welcomeFinishAndHideBtn, () => finishWelcome(true));
        addClickListener(DOM.closeWelcomeModalBtn, () => UI.closeModal(DOM.welcomeModal));
        addClickListener(DOM.welcomeValidateApiKeyBtn, validateWelcomeApiKey);

        addClickListener(DOM.welcomeSkipApiKeyBtn, () => {
            UI.showNotification("Configuration de la clé API ignorée. Vous pourrez l'ajouter plus tard dans les paramètres.", 'info');
            DOM.welcomeNextBtn.disabled = false;
            DOM.welcomeNextBtn.click();
        });

        addClickListener(DOM.welcomeLoadSampleBtn, () => {
            const selectedSystem = document.querySelector('input[name="welcomePeriodSystemRadio"]:checked').value;
            if (appState.periodSystem !== selectedSystem) {
                appState.periodSystem = selectedSystem;
                UI.updatePeriodSystemUI();
            }
            AppreciationsManager.loadSampleData();
            DOM.welcomeNextStepInfo.style.display = 'block';
            DOM.welcomeLoadSampleBtn.disabled = true;
            DOM.welcomeLoadSampleBtn.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon> Données chargées !';
            // User needs to click Terminer to finish
            UI.showNotification('Données exemple prêtes ! Cliquez sur "Terminer" pour continuer.', 'success');
        });

        // Gestion du bouton Mode Démo
        addClickListener(document.getElementById('activateDemoModeBtn'), () => this.activateDemoMode());
    },

    /**
     * Active le mode démo
     * Permet d'utiliser l'application sans clé API avec des données simulées
     */
    activateDemoMode() {
        appState.isDemoMode = true;
        UI.showNotification("Mode Démo activé ! Génération simulée.", "success");
        UI.closeModal(DOM.welcomeModal);
        UI.updateGenerateButtonState();
        UI.updateHeaderPremiumLook();

        // Charger les données d'exemple
        AppreciationsManager.loadSampleData();
    },

    /**
     * Relance le guide de bienvenue
     * @param {Event} e - L'événement click
     */
    handleRelaunchWelcomeGuide(e) {
        e.preventDefault();
        UI.closeAllModals();
        // Délai pour permettre l'animation de fermeture avant d'ouvrir le welcomeModal
        setTimeout(() => {
            UI.openModal(DOM.welcomeModal);
            this.setupWelcomeModal();
        }, 300);
    }
};
