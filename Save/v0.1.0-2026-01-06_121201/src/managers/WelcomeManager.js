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
import { DOM } from '../utils/DOM.js';
import { UI } from './UIManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { StorageManager } from './StorageManager.js';

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
        let currentProvider = 'google';

        // Helpers Defined First
        const addClickListener = (element, handler) => {
            if (element) element.addEventListener('click', handler, { signal });
        };

        const cleanAnimationClasses = (el) => {
            el.classList.remove('slide-in-right', 'slide-in-left', 'slide-out-left', 'slide-out-right');
        };

        // Provider Selection Logic (uses CSS-only styling, no glider animation)
        const providerPills = document.querySelectorAll('.provider-pill');

        // Helper to update input and button state for current provider
        const updateProviderKeyState = (provider) => {
            const input = DOM.welcomeApiKeyInput;
            const validateBtn = DOM.welcomeValidateApiKeyBtn;
            const existingKey = provider === 'google' ? appState.googleApiKey : appState.openrouterApiKey;

            if (input) {
                input.value = existingKey || '';
            }

            if (validateBtn) {
                if (existingKey) {
                    validateBtn.innerHTML = '<i class="fas fa-check"></i> Validée';
                    validateBtn.classList.add('btn-success');
                    validateBtn.disabled = true;
                    DOM.welcomeNextBtn.disabled = false;
                } else {
                    validateBtn.innerHTML = '<i class="fas fa-key"></i> Valider';
                    validateBtn.classList.remove('btn-success');
                    validateBtn.disabled = false;
                    // Only disable next if no key for any provider and not in demo mode
                    DOM.welcomeNextBtn.disabled = !appState.isDemoMode;
                }
            }
        };

        providerPills.forEach(pill => {
            addClickListener(pill, (e) => {
                const target = e.currentTarget;
                if (target.classList.contains('disabled')) return;

                // Update Pills UI
                providerPills.forEach(p => p.classList.remove('active'));
                target.classList.add('active');

                currentProvider = target.dataset.provider;

                // Update Input & Link UI
                const link = document.querySelector('.get-key-link-mini');

                if (currentProvider === 'google') {
                    if (DOM.welcomeApiKeyInput) {
                        DOM.welcomeApiKeyInput.placeholder = "Collez votre clé API Google ici (AIzaSy...)";
                    }
                    if (link) {
                        link.href = "https://aistudio.google.com/app/apikey";
                        link.innerHTML = '<i class="fab fa-google"></i> Obtenir ma clé';
                    }
                } else {
                    if (DOM.welcomeApiKeyInput) {
                        DOM.welcomeApiKeyInput.placeholder = "Collez votre clé API OpenRouter ici (sk-or-...)";
                    }
                    if (link) {
                        link.href = "https://openrouter.ai/keys";
                        link.innerHTML = '<i class="fas fa-bolt"></i> Obtenir ma clé';
                    }
                }

                // Update input value and validation state for this provider
                updateProviderKeyState(currentProvider);
            });
        });

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
                const hasApiKey = appState.googleApiKey || appState.openRouterApiKey || appState.isDemoMode;
                // Note: We don't block next button anymore based on key presence because of "Continue without key" button
                // But for the main "Next" button in nav bar, let's keep it enabled generally to allow skipping via nav if user really wants?
                // Actually, step 2 usually requires action. "Next" button logic:
                // If user clicks "Next" without key, it might be weird. 
                // Let's rely on the specific buttons in the step content.
                DOM.welcomeNextBtn.disabled = !hasApiKey;

                // Reset error message
                if (DOM.welcomeApiKeyError) DOM.welcomeApiKeyError.style.display = 'none';
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

                // Wait for UI to be fully ready, then open the proper import wizard with data
                setTimeout(() => {
                    import('./ImportWizardManager.js').then(({ ImportWizardManager }) => {
                        ImportWizardManager.openWithData(sampleData);
                    });
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
                        DOM.welcomeNextBtn.disabled = false;
                        setTimeout(() => DOM.welcomeNextBtn.click(), 500);
                    }
                );
            }
        };

        // Pré-remplir le champ API key et montrer l'état validé si une clé existe
        const existingGoogleKey = appState.googleApiKey;
        const existingOpenRouterKey = appState.openrouterApiKey;

        if (DOM.welcomeApiKeyInput) {
            if (existingGoogleKey) {
                DOM.welcomeApiKeyInput.value = existingGoogleKey;
                // Mark as validated
                if (DOM.welcomeValidateApiKeyBtn) {
                    DOM.welcomeValidateApiKeyBtn.innerHTML = '<i class="fas fa-check"></i> Validée';
                    DOM.welcomeValidateApiKeyBtn.classList.add('btn-success');
                    DOM.welcomeValidateApiKeyBtn.disabled = true;
                }
                DOM.welcomeNextBtn.disabled = false;
            } else if (existingOpenRouterKey) {
                // Switch to OpenRouter provider
                const openRouterPill = document.querySelector('.provider-pill[data-provider="openrouter"]');
                if (openRouterPill) openRouterPill.click();
                DOM.welcomeApiKeyInput.value = existingOpenRouterKey;
                // Mark as validated
                if (DOM.welcomeValidateApiKeyBtn) {
                    DOM.welcomeValidateApiKeyBtn.innerHTML = '<i class="fas fa-check"></i> Validée';
                    DOM.welcomeValidateApiKeyBtn.classList.add('btn-success');
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
            DOM.welcomeLoadSampleBtn.innerHTML = '<i class="fas fa-check"></i> Données chargées !';
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
