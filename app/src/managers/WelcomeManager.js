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
import { ClassManager } from './ClassManager.js';
import { StudentDataManager } from './StudentDataManager.js';
import { ClassUIManager } from './ClassUIManager.js';

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

        // Reset welcomeFinishAndHideBtn state (in case modal is reopened)
        if (DOM.welcomeFinishAndHideBtn) {
            DOM.welcomeFinishAndHideBtn.disabled = false;
            DOM.welcomeFinishAndHideBtn.innerHTML = `
                <span class="rocket-container">
                    <iconify-icon icon="solar:rocket-bold"></iconify-icon>
                </span>
                Commencer
            `.trim();
        }

        // Reset checkbox and cards selection based on existing classes (in case modal is reopened)
        const hasExistingClasses = ClassManager.getAllClasses?.().length > 0;
        const defaultStartMode = hasExistingClasses ? 'empty' : 'demo';
        
        const loadDemoCheckbox = document.getElementById('welcomeLoadDemoCheckbox');
        if (loadDemoCheckbox) {
            loadDemoCheckbox.checked = !hasExistingClasses;
        }
        const startCards = document.querySelectorAll('#welcome-step-4 .welcome-start-card');
        startCards.forEach(c => {
            const isActive = c.getAttribute('data-value') === defaultStartMode;
            c.classList.toggle('active', isActive);
            c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        // Reset period system cards to current settings (in case modal is reopened)
        const currentPeriodSystem = appState.periodSystem || 'trimestres';
        const periodCards = document.querySelectorAll('#welcomePeriodCards .welcome-start-card');
        periodCards.forEach(c => {
            const isActive = c.getAttribute('data-value') === currentPeriodSystem;
            c.classList.toggle('active', isActive);
            c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        const activeRadioId = currentPeriodSystem === 'semestres' ? 'welcomePeriodSystemSemestres' : 'welcomePeriodSystemTrimestres';
        const activeRadio = document.getElementById(activeRadioId);
        if (activeRadio) activeRadio.checked = true;

        const totalWelcomeSteps = 5;
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
                input.disabled = !!existingKey;
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
                placeholder: "Clé API Mistral...",
                linkUrl: "https://console.mistral.ai/api-keys/",
                linkIcon: '<iconify-icon icon="solar:cat-linear" style="color: #fd6f00;"></iconify-icon>'
            },
            google: {
                placeholder: "Clé API Google (AIzaSy...)",
                linkUrl: "https://aistudio.google.com/app/apikey",
                linkIcon: '<iconify-icon icon="ph:google-logo" style="color: #4285f4;"></iconify-icon>'
            },
            openrouter: {
                placeholder: "Clé API OpenRouter (sk-or-...)",
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
            if (DOM.welcomeNextStepInfo) {
                DOM.welcomeNextStepInfo.style.display = 'none';
            }

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

            currentWelcomeStep = step;
        };


        const finishWelcome = () => {
            localStorage.setItem(CONFIG.LS_FIRST_VISIT_KEY, 'true');
            const selectedSystem = document.querySelector('input[name="welcomePeriodSystemRadio"]:checked').value;
            if (appState.periodSystem !== selectedSystem) {
                appState.periodSystem = selectedSystem;
                UI.updatePeriodSystemUI();
            }
            StorageManager.saveAppState();
            UI.closeModal(DOM.welcomeModal);
            UI.updateGenerateButtonState();

            // Refresh UI if demo data was loaded
            setTimeout(() => {
                AppreciationsManager.renderResults();
                UI.updateStats?.();
                ClassUIManager.updateHeaderDisplay();
                ClassUIManager.updateStudentCount();
            }, 300);
        };

        const validateWelcomeApiKey = async () => {
            if (validateApiKeyCallback) {
                await validateApiKeyCallback(
                    currentProvider, // Use dynamic provider
                    DOM.welcomeApiKeyInput,
                    DOM.welcomeApiKeyError,
                    DOM.welcomeValidateApiKeyBtn,
                    () => {
                        if (DOM.welcomeApiKeyInput) {
                            DOM.welcomeApiKeyInput.disabled = true;
                        }
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
            if (DOM.welcomeNextStepInfo) {
                DOM.welcomeNextStepInfo.style.display = 'none';
            }
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


        addClickListener(DOM.welcomeFinishAndHideBtn, async () => {
            const loadDemoCheckbox = document.getElementById('welcomeLoadDemoCheckbox');
            if (loadDemoCheckbox && loadDemoCheckbox.checked) {
                const selectedSystem = document.querySelector('input[name="welcomePeriodSystemRadio"]:checked').value;
                if (appState.periodSystem !== selectedSystem) {
                    appState.periodSystem = selectedSystem;
                    UI.updatePeriodSystemUI();
                }

                try {
                    // Temporarily change button to show loading loop
                    DOM.welcomeFinishAndHideBtn.disabled = true;
                    DOM.welcomeFinishAndHideBtn.innerHTML = '<iconify-icon icon="line-md:loading-twotone-loop" style="margin-right: 6px;"></iconify-icon> Initialisation...';
                    
                    await this._injectDemoClass(selectedSystem);
                } catch (error) {
                    UI.showNotification('Erreur lors de l\'injection des données de démo.', 'error');
                }
            }
            finishWelcome();
        });
        addClickListener(DOM.closeWelcomeModalBtn, () => UI.closeModal(DOM.welcomeModal));
        addClickListener(DOM.welcomeValidateApiKeyBtn, validateWelcomeApiKey);

        addClickListener(DOM.welcomeSkipApiKeyBtn, () => {
            UI.showNotification("Configuration de la clé API ignorée. Vous pourrez l'ajouter plus tard dans les paramètres.", 'info');
            DOM.welcomeNextBtn.disabled = false;
            DOM.welcomeNextBtn.click();
        });

        // Interactivité des cartes d'onboarding (Mode Découverte / Base Vierge)
        startCards.forEach(card => {
            const selectCard = () => {
                startCards.forEach(c => {
                    c.classList.remove('active');
                    c.setAttribute('aria-pressed', 'false');
                });
                card.classList.add('active');
                card.setAttribute('aria-pressed', 'true');
                const val = card.getAttribute('data-value');
                if (loadDemoCheckbox) {
                    loadDemoCheckbox.checked = (val === 'demo');
                }
            };

            card.addEventListener('click', selectCard, { signal });
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectCard();
                }
            }, { signal });
        });

        // Interactivité des cartes de rythme scolaire (Trimestres / Semestres)
        periodCards.forEach(card => {
            const selectCard = () => {
                periodCards.forEach(c => {
                    c.classList.remove('active');
                    c.setAttribute('aria-pressed', 'false');
                });
                card.classList.add('active');
                card.setAttribute('aria-pressed', 'true');
                const val = card.getAttribute('data-value');
                const radio = document.getElementById(val === 'semestres' ? 'welcomePeriodSystemSemestres' : 'welcomePeriodSystemTrimestres');
                if (radio) {
                    radio.checked = true;
                    radio.dispatchEvent(new Event('change', { bubbles: true }));
                }
            };

            card.addEventListener('click', selectCard, { signal });
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectCard();
                }
            }, { signal });
        });

        // Gestion du bouton Mode Démo
        addClickListener(document.getElementById('activateDemoModeBtn'), () => this.activateDemoMode());
    },

    /**
     * Active le mode démo
     * Permet d'utiliser l'application sans clé API avec des données simulées
     */
    async activateDemoMode() {
        appState.isDemoMode = true;
        UI.showNotification("Mode Démo activé ! Génération simulée.", "success");
        UI.closeModal(DOM.welcomeModal);
        UI.updateGenerateButtonState();
        UI.updateHeaderPremiumLook();

        try {
            await this._injectDemoClass(appState.periodSystem);
            setTimeout(() => {
                AppreciationsManager.renderResults();
                UI.updateStats?.();
                ClassUIManager.updateHeaderDisplay();
                ClassUIManager.updateStudentCount();
            }, 300);
        } catch (_) { /* silent fallback */ }
    },

    /**
     * Crée une classe "Exemple" avec 8 élèves pré-remplis (P1)
     * @param {string} periodSystem - 'trimestres' ou 'semestres'
     * @private
     */
    async _injectDemoClass(periodSystem) {
        // Guard: skip if a demo class already exists
        const existingDemo = ClassManager.getAllClasses().find(c => c.name === 'Classe Exemple');
        if (existingDemo) {
            await ClassManager.switchClass(existingDemo.id);
            return;
        }

        const { getDemoClassData } = await import('../data/SampleData.js');
        const { className, students } = getDemoClassData(periodSystem);

        const newClass = ClassManager.createClass(className);
        await ClassManager.switchClass(newClass.id);

        const currentPeriod = periodSystem === 'semestres' ? 'S1' : 'T1';
        appState.currentPeriod = currentPeriod;

        const results = [];
        for (const studentData of students) {
            const photoFile = studentData.photoFile;
            delete studentData.photoFile;

            const result = StudentDataManager.createPendingResult(studentData);
            results.push({ result, photoFile });
            appState.generatedResults.push(result);
        }

        await ClassManager._filterResultsByClass(newClass.id);
        await StorageManager.saveAppState();

        // Fetch demo photos in parallel (non-blocking)
        this._loadDemoPhotos(results);
    },

    /**
     * Charge les photos démo et les assigne aux résultats élèves
     * @param {Array<{result: Object, photoFile: string}>} entries
     * @private
     */
    async _loadDemoPhotos(entries) {
        const photoPromises = entries.map(async ({ result, photoFile }) => {
            if (!photoFile) return;
            try {
                const response = await fetch(`./images/Demo/${photoFile}`);
                if (!response.ok) return;
                const blob = await response.blob();
                const base64 = await this._blobToBase64(blob);
                result.studentPhoto = {
                    data: base64,
                    source: 'demo',
                    uploadedAt: new Date().toISOString()
                };
            } catch (_) { /* photo optionnelle */ }
        });

        await Promise.all(photoPromises);
        await StorageManager.saveAppState();

        // Refresh UI to display loaded photos
        AppreciationsManager.renderResults?.();
    },

    /**
     * @private
     */
    _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
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
