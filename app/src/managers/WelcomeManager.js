/**
 * @fileoverview Gestionnaire du welcome modal et de l'onboarding
 * @module managers/WelcomeManager
 * 
 * Responsabilités :
 * - Affichage et navigation du guide de bienvenue
 * - Injection de la classe Exemple à la première visite
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
            this.setupWelcomeModal();
            UI.openModal(DOM.welcomeModal);
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
                    <iconify-icon icon="solar:rocket-linear"></iconify-icon>
                </span>
                Commencer
            `.trim();
        }

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

        const totalWelcomeSteps = 4;
        let isAnimating = false;
        let currentProvider = 'google';
        let hasSkippedApiKey = false;
        let isWelcomeCompleted = false;

        // Helpers Defined First
        const addClickListener = (element, handler) => {
            if (element) element.addEventListener('click', handler, { signal });
        };

        const cleanAnimationClasses = (el) => {
            el.classList.remove('slide-in-right', 'slide-in-left', 'slide-out-left', 'slide-out-right');
        };

        const hasAnyConfiguredKey = () => Boolean(
            appState.googleApiKey ||
            appState.groqApiKey ||
            appState.openrouterApiKey ||
            appState.mistralApiKey ||
            appState.openaiApiKey ||
            appState.anthropicApiKey ||
            appState.ollamaEnabled ||
            hasSkippedApiKey
        );

        // Helper to update input and button state for current provider
        const updateProviderKeyState = (provider) => {
            const input = DOM.welcomeApiKeyInput;
            const validateBtn = DOM.welcomeValidateApiKeyBtn;

            const keyByProvider = {
                google: appState.googleApiKey,
                groq: appState.groqApiKey,
                openrouter: appState.openrouterApiKey,
                mistral: appState.mistralApiKey
            };
            const existingKey = keyByProvider[provider] || '';

            if (input) {
                input.value = existingKey;
                input.disabled = Boolean(existingKey);
            }

            if (validateBtn) {
                validateBtn.classList.remove('ready', 'validated');

                if (existingKey) {
                    validateBtn.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon> Validée';
                    validateBtn.classList.add('validated');
                    validateBtn.disabled = true;
                } else {
                    validateBtn.innerHTML = 'Valider';
                    validateBtn.disabled = false;
                }
            }

            if (DOM.welcomeNextBtn && currentWelcomeStep === 2) {
                DOM.welcomeNextBtn.disabled = !hasAnyConfiguredKey();
            }
        };

        // Provider Selection Logic (new radio-based selector)
        const providerSelector = document.getElementById('welcomeProviderSelector');
        const getKeyLink = document.getElementById('welcomeGetKeyLink');

        // Provider configuration
        const providerConfig = {
            google: {
                placeholder: "Clé API Google (AIzaSy...)",
                linkUrl: "https://aistudio.google.com/app/apikey",
                linkIcon: '<iconify-icon icon="logos:google-icon"></iconify-icon>',
                linkText: "Obtenir ma clé (100% gratuite sans CB)"
            },
            groq: {
                placeholder: "Clé API Groq (gsk_...)",
                linkUrl: "https://console.groq.com/keys",
                linkIcon: '<iconify-icon icon="solar:bolt-circle-bold" style="color: #f55036;"></iconify-icon>',
                linkText: "Obtenir ma clé (100% gratuite sans CB)"
            },
            mistral: {
                placeholder: "Clé API Mistral...",
                linkUrl: "https://console.mistral.ai/api-keys/",
                linkIcon: '<iconify-icon icon="solar:cat-linear" style="color: #fd6f00;"></iconify-icon>',
                linkText: "Obtenir ma clé (La Plateforme)"
            },
            openrouter: {
                placeholder: "Clé API OpenRouter (sk-or-...)",
                linkUrl: "https://openrouter.ai/keys",
                linkIcon: '<iconify-icon icon="solar:bolt-linear" style="color: var(--secondary-color);"></iconify-icon>',
                linkText: "Obtenir ma clé"
            }
        };

        if (providerSelector) {
            providerSelector.addEventListener('change', (e) => {
                if (e.target.type !== 'radio') return;

                const provider = e.target.value;
                const config = providerConfig[provider];
                if (!config) return;

                currentProvider = provider;

                if (DOM.welcomeApiKeyInput) {
                    DOM.welcomeApiKeyInput.placeholder = config.placeholder;
                }

                if (getKeyLink) {
                    getKeyLink.href = config.linkUrl;
                    getKeyLink.innerHTML = `${config.linkIcon} ${config.linkText || 'Obtenir ma clé'}`;
                }

                updateProviderKeyState(currentProvider);
            }, { signal });
        }

        const showWelcomeStep = (step, direction = 'next') => {
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
            if (step === totalWelcomeSteps) {
                DOM.welcomeFinishAndHideBtn?.focus?.();
            }

            if (step === 2) {
                DOM.welcomeNextBtn.disabled = !hasAnyConfiguredKey();

                // Reset error message
                if (DOM.welcomeApiKeyError) DOM.welcomeApiKeyError.style.display = 'none';

                // Initialize glider for provider selector IMMEDIATELY (before slide-in animation completes)
                const providerSelectorEl = document.getElementById('welcomeProviderSelector');
                if (providerSelectorEl) {
                    let glider = providerSelectorEl.querySelector('.ui-glider');
                    if (!glider) {
                        glider = document.createElement('div');
                        glider.className = 'ui-glider';
                        glider.style.transition = 'none';
                        providerSelectorEl.prepend(glider);
                        providerSelectorEl.classList.add('has-glider');
                    }

                    const checked = providerSelectorEl.querySelector('input:checked');
                    if (checked) {
                        const label = providerSelectorEl.querySelector(`label[for="${checked.id}"]`);
                        if (label) {
                            requestAnimationFrame(() => {
                                glider.style.width = `${label.offsetWidth}px`;
                                glider.style.left = `${label.offsetLeft}px`;
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

        /**
         * Finalise le guide de bienvenue de façon idempotente (bouton Commencer, croix ×, touche Échap ou Retour mobile).
         * @param {Object} [options]
         * @param {boolean} [options.showLoading=false] - Affiche l'état de chargement sur le bouton Commencer
         * @param {boolean} [options.skipCloseModal=false] - Ne rappelle pas UI.closeModal si la fermeture est déjà en cours
         */
        const completeWelcome = async ({ showLoading = false, skipCloseModal = false } = {}) => {
            if (isWelcomeCompleted) return;
            isWelcomeCompleted = true;

            localStorage.setItem(CONFIG.LS_FIRST_VISIT_KEY, 'true');

            const selectedSystem = document.querySelector('input[name="welcomePeriodSystemRadio"]:checked')?.value || appState.periodSystem || 'trimestres';
            if (appState.periodSystem !== selectedSystem) {
                appState.periodSystem = selectedSystem;
                UI.updatePeriodSystemUI();
            }

            if (!skipCloseModal && !showLoading) {
                UI.closeModal(DOM.welcomeModal);
            }

            const classes = ClassManager.getAllClasses?.() || [];
            if (classes.length === 0) {
                try {
                    if (showLoading && DOM.welcomeFinishAndHideBtn) {
                        DOM.welcomeFinishAndHideBtn.disabled = true;
                        DOM.welcomeFinishAndHideBtn.innerHTML = '<iconify-icon icon="line-md:loading-twotone-loop" style="margin-right: 6px;"></iconify-icon> Initialisation...';
                    }
                    await this._injectDemoClass(selectedSystem);
                } catch (_) {
                    if (showLoading) {
                        UI.showNotification('Erreur lors de l\'injection des données de démo.', 'error');
                    }
                }
            }

            StorageManager.saveAppState();
            AppreciationsManager.renderResults();
            UI.updateStats?.();
            ClassUIManager.updateHeaderDisplay();
            ClassUIManager.updateStudentCount();

            if (!skipCloseModal && showLoading) {
                UI.closeModal(DOM.welcomeModal);
            }
            UI.updateGenerateButtonState();
        };

        const validateWelcomeApiKey = async () => {
            if (validateApiKeyCallback) {
                await validateApiKeyCallback(
                    currentProvider,
                    DOM.welcomeApiKeyInput,
                    DOM.welcomeApiKeyError,
                    DOM.welcomeValidateApiKeyBtn,
                    () => {
                        if (DOM.welcomeApiKeyInput) {
                            DOM.welcomeApiKeyInput.disabled = true;
                        }
                        const recommendedModel = PROVIDER_DEFAULT_MODELS[currentProvider];
                        if (recommendedModel && appState.currentAIModel !== recommendedModel) {
                            appState.currentAIModel = recommendedModel;
                            StorageManager.saveAppState();

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

        // Helper to select a provider and update UI
        const selectProvider = (providerId) => {
            const radio = document.getElementById(providerId);
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        };

        // Pré-remplir le champ API key et montrer l'état validé si une clé existe (ou réinitialiser sur Google)
        const initialProviderMap = [
            { key: appState.googleApiKey, provider: 'google', radioId: 'providerGoogle' },
            { key: appState.groqApiKey, provider: 'groq', radioId: 'providerGroq' },
            { key: appState.mistralApiKey, provider: 'mistral', radioId: 'providerMistral' },
            { key: appState.openrouterApiKey, provider: 'openrouter', radioId: 'providerOpenRouter' }
        ];
        const activeEntry = initialProviderMap.find(entry => Boolean(entry.key)) || initialProviderMap[0];
        currentProvider = activeEntry.provider;
        selectProvider(activeEntry.radioId);
        updateProviderKeyState(currentProvider);

        // Initialize first step without animation
        const initFirstStep = () => {
            document.querySelectorAll('.welcome-step').forEach(s => {
                s.classList.remove('active');
                cleanAnimationClasses(s);
            });
            const firstStepEl = document.getElementById('welcome-step-1');
            if (firstStepEl) {
                firstStepEl.classList.add('active');
            }
            DOM.welcomeDots.querySelectorAll('.dot').forEach((dot, index) => dot.classList.toggle('active', index === 0));
            DOM.welcomePrevBtn.style.visibility = 'hidden';
            DOM.welcomeNextBtn.style.display = 'inline-flex';
            DOM.welcomeFinishOptions.style.display = 'none';
            DOM.welcomeNextBtn.disabled = false;
            currentWelcomeStep = 1;
        };

        initFirstStep();

        // Toggle button style based on input content (grey when empty, orange when key is present) + Enter key support
        if (DOM.welcomeApiKeyInput) {
            DOM.welcomeApiKeyInput.addEventListener('input', (e) => {
                const validateBtn = DOM.welcomeValidateApiKeyBtn;
                if (!validateBtn || validateBtn.classList.contains('validated')) return;

                const hasValue = e.target.value.trim().length > 0;
                validateBtn.classList.toggle('ready', hasValue);
            }, { signal });

            DOM.welcomeApiKeyInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target.value.trim().length > 0 && !DOM.welcomeValidateApiKeyBtn?.disabled) {
                    e.preventDefault();
                    validateWelcomeApiKey();
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

        addClickListener(DOM.welcomeFinishAndHideBtn, () => completeWelcome({ showLoading: true }));
        addClickListener(DOM.closeWelcomeModalBtn, () => completeWelcome({ showLoading: false }));

        // Prise en charge de la touche Échap et de la fermeture externe (ex: bouton Retour mobile via HistoryManager)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !isWelcomeCompleted && UI.activeModal === DOM.welcomeModal) {
                e.preventDefault();
                e.stopPropagation();
                completeWelcome({ showLoading: false });
            }
        }, { signal });

        document.addEventListener('welcome-modal-close', () => {
            if (!isWelcomeCompleted) {
                completeWelcome({ showLoading: false, skipCloseModal: true });
            }
        }, { signal });

        addClickListener(DOM.welcomeValidateApiKeyBtn, validateWelcomeApiKey);

        addClickListener(DOM.welcomeSkipApiKeyBtn, () => {
            hasSkippedApiKey = true;
            UI.showNotification("Configuration de la clé API ignorée. Vous pourrez l'ajouter plus tard dans les paramètres.", 'info');
            DOM.welcomeNextBtn.disabled = false;
            DOM.welcomeNextBtn.click();
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
    },

    /**
     * Crée une classe "Exemple" avec 8 élèves pré-remplis (P1)
     * @param {string} periodSystem - 'trimestres' ou 'semestres'
     * @private
     */
    async _injectDemoClass(periodSystem) {
        // Guard: skip if a demo class already exists
        const existingDemo = ClassManager.getAllClasses().find(c => ClassManager.isDemoClass(c.id));
        if (existingDemo) {
            await ClassManager.switchClass(existingDemo.id);
            return;
        }

        const { getDemoClassData } = await import('../data/SampleData.js');
        const { className, students } = getDemoClassData(periodSystem);

        const newClass = ClassManager.createClass(className);
        newClass.isDemo = true;
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
        e?.preventDefault?.();
        UI.closeAllModals();
        // Délai pour permettre l'animation de fermeture avant d'ouvrir le welcomeModal
        setTimeout(() => {
            this.setupWelcomeModal();
            UI.openModal(DOM.welcomeModal);
        }, 300);
    }
};
