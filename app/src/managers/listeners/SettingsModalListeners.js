/**
 * @fileoverview Listeners de la modale des paramètres
 * @module managers/listeners/SettingsModalListeners
 */

import { appState } from '../../state/State.js';
import { DOM } from '../../utils/DOM.js';
import { Utils } from '../../utils/Utils.js';
import { UI } from '../UIManager.js';
import { StorageManager } from '../StorageManager.js';
import { ApiValidationManager } from '../ApiValidationManager.js';
import { SettingsUIManager } from '../SettingsUIManager.js';
import { EventHandlersManager } from '../EventHandlersManager.js';
import { AppreciationsManager } from '../AppreciationsManager.js';

import { DEMO_STUDENT_PROFILES } from '../../config/Config.js';

let App = null;

export const SettingsModalListeners = {
    init(appInstance) {
        App = appInstance;
        this.lastPreviewIndex = -1; // Track index for directional animation
    },

    /**
     * Configure les listeners de la modale des paramètres.
     * @param {Function} addClickListener - Helper pour ajouter un listener click
     */
    setup(addClickListener) {
        DOM.periodSystemRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                EventHandlersManager.handlePeriodSystemChange(e);
                // Note: Glider animation is handled by the listener in initGliders()
                // Sync lab preview with new period system
                setTimeout(() => this._updateStudentContextAndPrompt(), 100);
            });
        });

        DOM.personalizationToggle.addEventListener('change', (e) => {
            appState.useSubjectPersonalization = e.target.checked;
            SettingsUIManager.updatePersonalizationState();
        });

        // Toggle pour le basculement automatique entre APIs
        if (DOM.enableApiFallbackToggle) {
            DOM.enableApiFallbackToggle.addEventListener('change', (e) => {
                appState.enableApiFallback = e.target.checked;
            });
        }

        // API validation - delegated to ApiValidationManager
        addClickListener(DOM.validateOpenaiApiKeyBtn, () => ApiValidationManager.validateApiKey('openai'));
        addClickListener(DOM.validateGoogleApiKeyBtn, () => ApiValidationManager.validateApiKey('google'));
        addClickListener(DOM.validateOpenrouterApiKeyBtn, () => ApiValidationManager.validateApiKey('openrouter'));
        addClickListener(DOM.validateAnthropicApiKeyBtn, () => ApiValidationManager.validateApiKey('anthropic'));
        addClickListener(DOM.validateMistralApiKeyBtn, () => ApiValidationManager.validateApiKey('mistral'));

        // Bouton "Tester tout" pour vérifier toutes les connexions
        addClickListener(DOM.testAllConnectionsBtn, () => SettingsUIManager.testAllConnections());

        // Mise à jour du modèle + rafraîchir l'affichage du modèle actif dans le statut
        DOM.aiModelSelect?.addEventListener('change', (e) => {
            App.handleAiModelSelectChange(e);
            SettingsUIManager.updateApiStatusDisplay();
        });

        [DOM.openaiApiKey, DOM.googleApiKey, DOM.openrouterApiKey, DOM.anthropicApiKey, DOM.mistralApiKey].forEach(input => {
            if (input) input.addEventListener('input', ApiValidationManager.handleApiKeyInput);
        });

        // Bouton pour ouvrir l'accordion des clés API
        this._setupApiKeysAccordion(addClickListener);

        // Cartes de statut API cliquables pour déclencher la validation
        this._setupApiStatusCards();

        // Configuration Ollama (IA locale)
        this._setupOllamaListeners(addClickListener);

        // Listeners pour les sliders IA
        this._setupIASliders();

        // Settings modal interactions
        this._setupModalInteractions(addClickListener);
    },

    _setupApiKeysAccordion(addClickListener) {
        const openApiKeysBtn = document.getElementById('openApiKeysAccordionBtn');
        if (openApiKeysBtn) {
            openApiKeysBtn.addEventListener('click', () => {
                const accordion = document.getElementById('apiKeysAccordion');
                if (accordion) {
                    accordion.open = true;
                    accordion.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }
    },

    _setupApiStatusCards() {
        const statusCardMap = {
            'googleApiStatus': 'google',
            'openaiApiStatus': 'openai',
            'openrouterApiStatus': 'openrouter',
            'anthropicApiStatus': 'anthropic',
            'mistralApiStatus': 'mistral'
        };
        Object.entries(statusCardMap).forEach(([cardId, provider]) => {
            const card = document.getElementById(cardId);
            if (card) {
                card.addEventListener('click', () => {
                    const accordion = document.getElementById('apiKeysAccordion');
                    if (accordion) {
                        accordion.open = true;
                        // Scroll vers la section correspondante
                        const inputId = `${provider}ApiKey`;
                        const inputSection = document.getElementById(inputId)?.closest('.api-key-group');
                        if (inputSection) {
                            inputSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }

                    // Ne revalider que si nécessaire (pas déjà validé) pour éviter le spam API
                    if (!appState.validatedApiKeys[provider]) {
                        ApiValidationManager.validateApiKey(provider);
                    }
                });
            }
        });
    },

    _setupOllamaListeners(addClickListener) {
        if (DOM.ollamaEnabledToggle) {
            DOM.ollamaEnabledToggle.addEventListener('change', async (e) => {
                appState.ollamaEnabled = e.target.checked;
                if (e.target.checked) {
                    await SettingsUIManager.validateOllamaConnection();
                } else {
                    SettingsUIManager.updateOllamaStatus('not-configured');
                }
            });
        }

        if (DOM.validateOllamaBtn) {
            addClickListener(DOM.validateOllamaBtn, async () => {
                await SettingsUIManager.validateOllamaConnection();
            });
        }

        if (DOM.ollamaBaseUrl) {
            DOM.ollamaBaseUrl.addEventListener('change', (e) => {
                appState.ollamaBaseUrl = e.target.value;
            });
        }

        if (DOM.ollamaApiStatus) {
            DOM.ollamaApiStatus.addEventListener('click', () => {
                const accordion = document.getElementById('apiKeysAccordion');
                if (accordion) accordion.open = true;
                const ollamaSection = document.getElementById('ollamaConfigGroup');
                if (ollamaSection) {
                    ollamaSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }
    },



    _setupIASliders() {
        if (DOM.iaLengthSlider) {
            DOM.iaLengthSlider.addEventListener('input', (e) => {
                const lengthVal = parseInt(e.target.value);
                const approxChars = Math.round(lengthVal * 6.5);
                const lengthDisplay = document.getElementById('iaLengthSliderValue');
                if (lengthDisplay) lengthDisplay.textContent = `~ ${lengthVal} mots (≈ ${approxChars} car.)`;

                // [FIX] Update appState in real-time so generation uses current value immediately
                if (!appState.subjects['MonStyle']) {
                    appState.subjects['MonStyle'] = { iaConfig: {} };
                }
                if (!appState.subjects['MonStyle'].iaConfig) {
                    appState.subjects['MonStyle'].iaConfig = {};
                }
                appState.subjects['MonStyle'].iaConfig.length = lengthVal;

                SettingsUIManager.showPreviewRefreshHint();
            });
        }

        if (DOM.iaToneSlider) {
            DOM.iaToneSlider.addEventListener('input', (e) => {
                const toneVal = parseInt(e.target.value);
                const toneLabels = {
                    1: 'Très encourageant et positif',
                    2: 'Encourageant et bienveillant',
                    3: 'Équilibré, factuel et neutre',
                    4: 'Strict mais juste',
                    5: 'Très strict et formel'
                };
                const toneDisplay = document.getElementById('iaToneSliderValue');
                if (toneDisplay) toneDisplay.textContent = toneLabels[toneVal] || 'Équilibré, factuel et neutre';

                // [FIX] Update appState in real-time so generation uses current value immediately
                if (appState.subjects['MonStyle']?.iaConfig) {
                    appState.subjects['MonStyle'].iaConfig.tone = toneVal;
                }

                SettingsUIManager.showPreviewRefreshHint();
            });

            // Rendre les repères cliquables
            const toneTicksContainer = DOM.iaToneSlider.nextElementSibling;
            if (toneTicksContainer && toneTicksContainer.classList.contains('slider-ticks')) {
                const ticks = toneTicksContainer.querySelectorAll('.tick');
                ticks.forEach((tick, index) => {
                    tick.addEventListener('click', () => {
                        DOM.iaToneSlider.value = index + 1;
                        DOM.iaToneSlider.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                });
            }
        }

        if (DOM.iaStyleInstructions) {
            DOM.iaStyleInstructions.addEventListener('input', () => {
                // [FIX] Update appState in real-time so generation uses current value immediately
                if (appState.subjects['MonStyle']?.iaConfig) {
                    appState.subjects['MonStyle'].iaConfig.styleInstructions = DOM.iaStyleInstructions.value;
                }

                SettingsUIManager.showPreviewRefreshHint();
            });
        }

        document.querySelectorAll('input[name="iaVoiceRadio"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                // [FIX] Update appState in real-time so generation uses current value immediately
                if (appState.subjects['MonStyle']?.iaConfig) {
                    appState.subjects['MonStyle'].iaConfig.voice = e.target.value;
                }

                SettingsUIManager.showPreviewRefreshHint();
                this._updateStudentContextAndPrompt(); // Update prompt preview on voice change
            });
        });

        // Preview student selection - auto-update context and prompt (no AI call)
        if (DOM.previewStudentSelect) {
            DOM.previewStudentSelect.addEventListener('change', () => {
                this._updateStudentContextAndPrompt();
                this._updateNavArrowsState();
            });
            // Initial display when modal opens
            setTimeout(() => {
                this._updateStudentContextAndPrompt();
                this._updateNavArrowsState();
            }, 100);
        }

        // Navigation arrow buttons for preview student
        const prevBtn = document.getElementById('previewPrevStudentBtn');
        const nextBtn = document.getElementById('previewNextStudentBtn');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                const select = DOM.previewStudentSelect;
                if (select && select.selectedIndex > 0) {
                    select.selectedIndex = select.selectedIndex - 1;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const select = DOM.previewStudentSelect;
                if (select && select.selectedIndex < select.options.length - 1) {
                    select.selectedIndex = select.selectedIndex + 1;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }

        // Listen to main period changes to sync lab
        if (DOM.mainPeriodSelector) {
            // Use event delegation since radios are dynamically created
            DOM.mainPeriodSelector.addEventListener('change', () => {
                setTimeout(() => this._updateStudentContextAndPrompt(), 100);
            });
        }

        // Settings changes should update prompt preview automatically
        if (DOM.iaLengthSlider) {
            DOM.iaLengthSlider.addEventListener('input', () => {
                this._updateStudentContextAndPrompt();
            });
        }
        if (DOM.iaToneSlider) {
            DOM.iaToneSlider.addEventListener('input', () => {
                this._updateStudentContextAndPrompt();
            });
        }
        if (DOM.iaStyleInstructions) {
            DOM.iaStyleInstructions.addEventListener('input', Utils.debounce(() => {
                this._updateStudentContextAndPrompt();
            }, 300));
        }

        // Preview refresh button - only for AI generation
        if (DOM.refreshPreviewBtn) {
            DOM.refreshPreviewBtn.addEventListener('click', async () => {
                await this._handlePreviewRefresh();
            });
        }
    },

    /**
     * Updates the enabled/disabled state of navigation arrows and the displayed name
     */
    _updateNavArrowsState() {
        const select = DOM.previewStudentSelect;
        const prevBtn = document.getElementById('previewPrevStudentBtn');
        const nextBtn = document.getElementById('previewNextStudentBtn');
        const nameDisplay = document.getElementById('previewStudentNameDisplay');

        if (!select) return;

        // Sync text display
        if (nameDisplay && select.selectedIndex >= 0) {
            nameDisplay.textContent = select.options[select.selectedIndex].text;
        }

        // Sync arrow states
        if (prevBtn) {
            prevBtn.disabled = select.selectedIndex <= 0;
            // Add aria-label for accessibility
            if (!prevBtn.disabled) {
                const prevName = select.options[select.selectedIndex - 1].text;
                prevBtn.setAttribute('aria-label', `Élève précédent - ${prevName}`);
            }
        }
        if (nextBtn) {
            nextBtn.disabled = select.selectedIndex >= select.options.length - 1;
            // Add aria-label for accessibility
            if (!nextBtn.disabled) {
                const nextName = select.options[select.selectedIndex + 1].text;
                nextBtn.setAttribute('aria-label', `Élève suivant - ${nextName}`);
            }
        }
    },

    /**
     * Updates student context display and prompt preview (no AI call)
     */
    _updateStudentContextAndPrompt() {
        const studentId = DOM.previewStudentSelect?.value;
        if (!studentId) return;

        // Determine period system and current period
        const periodSystem = appState.periodSystem || 'trimestres';
        const periodKeys = periodSystem === 'semestres' ? ['S1', 'S2'] : ['T1', 'T2', 'T3'];
        const defaultPeriod = periodSystem === 'semestres' ? 'S2' : 'T3';

        let currentPeriod = appState.currentPeriod || defaultPeriod;
        if (!periodKeys.includes(currentPeriod)) {
            currentPeriod = defaultPeriod;
        }

        // Lab uses ONLY demo profiles for consistent, reliable testing
        const studentResult = DEMO_STUDENT_PROFILES.find(r => r.id === studentId);
        if (!studentResult?.studentData) return;

        const data = studentResult.studentData;

        const periodData = data.periods?.[currentPeriod];
        const grade = periodData?.grade ?? '-';

        let historyRows = '';
        const currentPeriodIndex = periodKeys.indexOf(currentPeriod);

        periodKeys.forEach((period, index) => {
            // Show ALL periods up to current (History + Current)
            if (index > currentPeriodIndex) return;

            const pData = data.periods?.[period];
            const pGrade = pData?.grade ?? null;
            const isCurrent = period === currentPeriod;

            // Appreciation content
            let pApp;
            if (isCurrent) {
                pApp = '<em class="to-generate" style="opacity:0.7;">(à générer)</em>';
            } else {
                pApp = pData?.appreciation ? (pData.appreciation.length > 60 ? pData.appreciation.substring(0, 60) + '...' : pData.appreciation) : '<em>-</em>';
            }

            // Grade styling
            let gradeHtml = '-';
            if (pGrade !== null) {
                const gradeClass = Utils.getGradeClass(pGrade);
                gradeHtml = `<div class="grade-pill ${gradeClass}" style="margin:0;">${pGrade.toFixed(1).replace('.', ',')}</div>`;
            }

            historyRows += `
                <tr class="overview-row ${isCurrent ? 'current-period' : ''}">
                    <td class="period-cell">${period}${isCurrent ? ' <span class="actuel-badge">ACTUEL</span>' : ''}</td>
                    <td class="grade-cell" style="text-align:center;">${gradeHtml}</td>
                    <td class="appreciation-cell">${pApp}</td>
                </tr>
            `;
        });

        // Display student context
        const studentDataEl = document.getElementById('settingsPreviewStudentData');
        const nameDisplay = document.getElementById('previewStudentNameDisplay');

        if (studentDataEl) {
            // Prepare new content
            const instructions = data.negativeInstructions || data.instructions || '';
            const statusBadges = data.statuses?.map(s => {
                const info = Utils.getStatusBadgeInfo(s);
                return `<span class="${info.className}">${info.label}</span>`;
            }).join(' ') || '';

            const newContent = `
                <div class="preview-context-header" style="margin-bottom:15px;">
                    ${statusBadges ? `<div class="preview-statuses" style="margin-bottom:8px;">${statusBadges}</div>` : ''}
                    ${instructions ? `<div class="preview-instructions-full"><i class="fas fa-info-circle"></i> ${instructions}</div>` : ''}
                </div>
                
                <div class="preview-history-section">
                    <table class="preview-history-table">
                        <thead>
                            <tr><th>Période</th><th style="text-align:center;">Moyenne</th><th>Appréciation</th></tr>
                        </thead>
                        <tbody>
                            ${historyRows}
                        </tbody>
                    </table>
                </div>
            `;

            // Animate transition with direction
            const select = DOM.previewStudentSelect;
            const currentIndex = select ? select.selectedIndex : 0;

            // Determine direction (default to next/slide-left if unknown)
            let slideOffset = 15; // Slide from right (Next)
            if (this.lastPreviewIndex !== -1 && currentIndex < this.lastPreviewIndex) {
                slideOffset = -15; // Slide from left (Prev)
            }
            this.lastPreviewIndex = currentIndex;

            studentDataEl.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            studentDataEl.style.opacity = '0';
            studentDataEl.style.transform = `translateX(${slideOffset}px)`;

            if (nameDisplay) {
                nameDisplay.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                nameDisplay.style.opacity = '0.5';
                nameDisplay.style.transform = `translateX(${slideOffset / 2}px)`;
            }

            setTimeout(() => {
                studentDataEl.innerHTML = newContent;
                studentDataEl.style.opacity = '1';
                studentDataEl.style.transform = 'translateX(0)';

                if (nameDisplay) {
                    nameDisplay.style.opacity = '1';
                    nameDisplay.style.transform = 'translateX(0)';
                }
            }, 200);
        }

        // Display prompt preview (no AI call)
        const currentSettings = {
            length: parseInt(DOM.iaLengthSlider?.value || 60),
            tone: parseInt(DOM.iaToneSlider?.value || 3),
            styleInstructions: DOM.iaStyleInstructions?.value || '',
            voice: document.querySelector('input[name="iaVoiceRadio"]:checked')?.value || 'default'
        };

        const previewPromptEl = document.getElementById('settingsPreviewPrompt');
        if (previewPromptEl) {
            try {
                const prompts = AppreciationsManager.getAllPrompts(studentResult.studentData, currentSettings);
                previewPromptEl.textContent = prompts.appreciation;
                previewPromptEl.classList.remove('placeholder');
            } catch (promptError) {
                console.warn('Could not generate prompt preview:', promptError);
                previewPromptEl.textContent = 'Erreur lors de la génération du prompt : ' + promptError.message;
            }
        }
    },

    async _handlePreviewRefresh() {
        SettingsUIManager.hidePreviewRefreshHint();
        const previewResult = document.getElementById('settingsPreviewResult');
        const previewStatus = document.getElementById('previewStatus');
        const studentId = DOM.previewStudentSelect?.value;

        if (!studentId) {
            if (previewResult) {
                previewResult.innerHTML = '<span style="color:var(--warning-color);"><i class="fas fa-exclamation-triangle"></i> Sélectionnez un profil dans la liste.</span>';
            }
            return;
        }

        // Lab uses ONLY demo profiles
        const studentResult = DEMO_STUDENT_PROFILES.find(r => r.id === studentId);
        if (!studentResult) {
            if (previewResult) {
                previewResult.innerHTML = '<span style="color:var(--error-color);"><i class="fas fa-exclamation-circle"></i> Profil introuvable. Veuillez en sélectionner un autre.</span>';
            }
            return;
        }

        // Context is already displayed by _updateStudentContextAndPrompt, no need to rebuild

        // Vérifier qu'une clé API est configurée (ou Ollama activé)
        const currentModel = appState.currentAIModel || 'gemini-2.0-flash';
        let hasApiKey = false;
        let isOllama = currentModel.startsWith('ollama');

        if (isOllama) {
            // Ollama est local, pas de clé API mais doit être activé
            hasApiKey = !!appState.ollamaEnabled;
        } else if (currentModel.startsWith('gemini')) {
            hasApiKey = !!appState.googleApiKey;
        } else if (currentModel.startsWith('openai') || currentModel.startsWith('gpt')) {
            hasApiKey = !!appState.openaiApiKey;
        } else {
            hasApiKey = !!appState.openrouterApiKey;
        }

        if (!hasApiKey) {
            if (previewResult) {
                if (isOllama) {
                    previewResult.innerHTML = `< span style = "color:var(--error-color);" ><i class="fas fa-server"></i> <strong>Ollama non activé</strong><br><br>Activez Ollama dans l'onglet <strong>Avancé</strong> pour utiliser le laboratoire d'aperçu avec ce modèle local.</span>`;
                } else {
                    previewResult.innerHTML = `<span style="color:var(--error-color);"><i class="fas fa-key"></i> <strong>Clé API manquante</strong><br><br>Configurez une clé API dans l'onglet <strong>Avancé</strong> pour utiliser le laboratoire d'aperçu.</span>`;
                }
            }
            const notifMsg = isOllama
                ? 'Ollama non activé. Activez-le dans l\'onglet Avancé.'
                : 'Clé API non configurée. Configurez-la dans l\'onglet Avancé.';
            UI.showNotification(notifMsg, 'error');
            SettingsUIManager.showPreviewRefreshHint();
            if (previewStatus) {
                const statusMsg = isOllama
                    ? '<i class="fas fa-server" style="margin-right: 6px;"></i> Activez Ollama puis réessayez.'
                    : '<i class="fas fa-key" style="margin-right: 6px;"></i> Configurez une clé API puis réessayez.';
                previewStatus.innerHTML = statusMsg;
            }
            return;
        }

        // Afficher le loading
        DOM.refreshPreviewBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération...';
        DOM.refreshPreviewBtn.disabled = true;
        if (previewResult) {
            previewResult.innerHTML = '<div class="loading-state-centered"><div class="loading-spinner"></div><span>Génération en cours...</span></div>';
            previewResult.classList.remove('placeholder');
        }

        try {
            const currentSettings = {
                length: parseInt(DOM.iaLengthSlider?.value || 60),
                tone: parseInt(DOM.iaToneSlider?.value || 3),
                styleInstructions: DOM.iaStyleInstructions?.value || '',
                voice: document.querySelector('input[name="iaVoiceRadio"]:checked')?.value || 'default'
            };

            // Display the prompt that will be sent to the AI
            const previewPromptEl = document.getElementById('settingsPreviewPrompt');
            if (previewPromptEl) {
                try {
                    const prompts = AppreciationsManager.getAllPrompts(studentResult.studentData, currentSettings);
                    previewPromptEl.textContent = prompts.appreciation;
                    previewPromptEl.classList.remove('placeholder');
                } catch (promptError) {
                    console.warn('Could not generate prompt preview:', promptError);
                    previewPromptEl.textContent = 'Erreur lors de la génération du prompt : ' + promptError.message;
                }
            }

            const result = await AppreciationsManager.generateAppreciation(studentResult.studentData, true, currentSettings);

            if (previewResult) {
                previewResult.innerHTML = Utils.decodeHtmlEntities(Utils.cleanMarkdown(result.appreciation));
                previewResult.classList.remove('has-error', 'placeholder');
            }

            const wordCountEl = document.getElementById('settingsPreviewWordCount');
            if (wordCountEl) {
                const wordCount = Utils.countWords(result.appreciation);
                const charCount = Utils.countCharacters(result.appreciation);
                wordCountEl.textContent = `${wordCount} mots • ${charCount} car.`;
            }

            const metaContainer = document.getElementById('previewMetaContainer');
            if (metaContainer) metaContainer.style.display = 'block';

        } catch (error) {
            console.error('Preview Error:', error);

            let errorMessage = error.message || 'Erreur inconnue';
            let errorExplanation = '';

            if (errorMessage.includes('API') || errorMessage.includes('key') || errorMessage.includes('clé')) {
                errorExplanation = 'Vérifiez votre clé API dans l\'onglet Avancé.';
            } else if (errorMessage.includes('quota') || errorMessage.includes('rate') || errorMessage.includes('limit')) {
                errorExplanation = 'Quota API dépassé. Attendez quelques minutes ou changez de modèle.';
            } else if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('connexion')) {
                errorExplanation = 'Vérifiez votre connexion internet.';
            } else {
                errorExplanation = 'Réessayez ou vérifiez vos paramètres.';
            }

            if (previewResult) {
                previewResult.innerHTML = `
                    <div class="preview-error-message">
                        <strong><i class="fas fa-exclamation-circle"></i> Échec de la génération</strong>
                        <p>${errorMessage}</p>
                        <small>${errorExplanation}</small>
                    </div>`;
                previewResult.classList.add('has-error');
                previewResult.classList.remove('placeholder');
            }

            UI.showNotification(`Erreur de génération : ${errorMessage}`, 'error');
            SettingsUIManager.showPreviewRefreshHint();
            if (previewStatus) {
                previewStatus.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right: 6px; color: var(--error-color);"></i> Échec. Corrigez le problème et réessayez.';
            }

        } finally {
            DOM.refreshPreviewBtn.innerHTML = '<i class="fas fa-play"></i> Générer';
            DOM.refreshPreviewBtn.disabled = false;
        }
    },

    _setupModalInteractions(addClickListener) {
        DOM.settingsModal.addEventListener('click', (e) => {
            if (e.target === DOM.settingsModal) SettingsUIManager.cancelSettings();
        });



        // Gestion des boutons d'incrémentation/décrémentation personnalisés
        DOM.settingsModal.addEventListener('click', (e) => {
            const spinnerBtn = e.target.closest('.number-spinner-btn');
            if (!spinnerBtn) return;

            const wrapper = spinnerBtn.closest('.number-input-wrapper');
            const input = wrapper?.querySelector('input[type="number"]');
            if (!input) return;

            const step = parseFloat(input.step) || 0.1;
            const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
            const max = input.max !== '' ? parseFloat(input.max) : Infinity;
            let currentValue = parseFloat(input.value) || 0;

            if (spinnerBtn.classList.contains('increment')) {
                currentValue = Math.min(currentValue + step, max);
            } else if (spinnerBtn.classList.contains('decrement')) {
                currentValue = Math.max(currentValue - step, min);
            }

            input.value = Math.round(currentValue * 10) / 10;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        DOM.settingsModal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation(); // Empêcher le handler global de recevoir cet événement
                SettingsUIManager.cancelSettings();
            }
        });

        addClickListener(DOM.importSettingsBtn, App.handleImportSettingsBtnClick);

        // Event listener for settings import file input
        const importSettingsInput = document.getElementById('importSettingsInput');
        if (importSettingsInput) {
            importSettingsInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        StorageManager.importSettings(event.target.result);
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                }
            });
        }

        addClickListener(DOM.exportSettingsBtn, StorageManager.exportSettings.bind(StorageManager));

        // Full backup export/import
        addClickListener(DOM.exportFullBackupBtn, StorageManager.exportToJson.bind(StorageManager));
        addClickListener(DOM.importFullBackupBtn, () => {
            DOM.importBackupInput?.click();
        });

        // Event listener for full backup file input
        if (DOM.importBackupInput) {
            DOM.importBackupInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        StorageManager.importBackup(event.target.result, { mergeData: true });
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                }
            });
        }

        addClickListener(DOM.resetAllSettingsBtn, StorageManager.resetAllSettings.bind(StorageManager));

        // Factory reset (deletes everything)
        const factoryResetBtn = document.getElementById('factoryResetBtn');
        if (factoryResetBtn) {
            factoryResetBtn.addEventListener('click', () => {
                StorageManager.factoryReset();
            });
        }

        addClickListener(DOM.saveSettingsBtn, SettingsUIManager.saveSettings.bind(SettingsUIManager));
        addClickListener(DOM.cancelSettingsBtn, SettingsUIManager.cancelSettings.bind(SettingsUIManager));
        addClickListener(DOM.closeSettingsModalBtn, SettingsUIManager.cancelSettings.bind(SettingsUIManager));

        // Cloud sync - Google Drive connection
        if (DOM.connectGoogleBtn) {
            DOM.connectGoogleBtn.addEventListener('click', async () => {
                try {
                    // Show RGPD warning first
                    if (DOM.syncRgpdWarning) {
                        DOM.syncRgpdWarning.style.display = 'flex';
                    }

                    DOM.connectGoogleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connexion...';
                    DOM.connectGoogleBtn.disabled = true;

                    // Dynamic import of SyncService
                    const { SyncService } = await import('../../services/SyncService.js');
                    const connected = await SyncService.connect('google');

                    if (connected) {
                        DOM.googleSyncStatus.textContent = 'Connecté';
                        DOM.googleSyncStatus.classList.add('connected');
                        DOM.connectGoogleBtn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Synchronisation...';

                        // Find parent card and add connected class
                        const card = DOM.connectGoogleBtn.closest('.sync-provider-card');
                        if (card) card.classList.add('connected');

                        // Perform initial sync to download any existing cloud data
                        try {
                            const syncResult = await SyncService.sync();
                            if (syncResult.stats?.classesImported > 0 || syncResult.stats?.imported > 0) {
                                UI.showNotification(`Google Drive connecté ! ${syncResult.stats.classesImported || 0} classe(s) et ${syncResult.stats.imported || 0} élève(s) importés.`, 'success');
                            } else {
                                UI.showNotification('Google Drive connecté ! Vos données seront synchronisées.', 'success');
                            }
                        } catch (syncError) {
                            console.warn('[SyncService] Initial sync failed:', syncError);
                            UI.showNotification('Google Drive connecté !', 'success');
                        }

                        // Update UI to show connected state with disconnect button
                        DOM.connectGoogleBtn.innerHTML = '<i class="fas fa-check"></i> Connecté';
                        DOM.connectGoogleBtn.classList.add('btn-success');
                        DOM.connectGoogleBtn.style.display = 'none';
                        if (DOM.disconnectGoogleBtn) {
                            DOM.disconnectGoogleBtn.style.display = 'inline-flex';
                        }
                    } else {
                        DOM.connectGoogleBtn.innerHTML = 'Connecter';
                        DOM.connectGoogleBtn.disabled = false;
                        UI.showNotification('Connexion annulée.', 'warning');
                    }
                } catch (error) {
                    console.error('Google sync connection error:', error);
                    DOM.connectGoogleBtn.innerHTML = 'Connecter';
                    DOM.connectGoogleBtn.disabled = false;
                    UI.showNotification('Erreur de connexion : ' + error.message, 'error');
                }
            });
        }

        // Cloud sync - Google Drive DISCONNECTION
        if (DOM.disconnectGoogleBtn) {
            DOM.disconnectGoogleBtn.addEventListener('click', async () => {
                try {
                    DOM.disconnectGoogleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    DOM.disconnectGoogleBtn.disabled = true;

                    const { SyncService } = await import('../../services/SyncService.js');
                    await SyncService.disconnect();

                    // Reset UI to disconnected state
                    DOM.googleSyncStatus.textContent = 'Non connecté';
                    DOM.googleSyncStatus.classList.remove('connected');
                    if (DOM.googleSyncEmail) {
                        DOM.googleSyncEmail.textContent = '';
                        DOM.googleSyncEmail.style.display = 'none';
                    }
                    DOM.connectGoogleBtn.innerHTML = 'Connecter';
                    DOM.connectGoogleBtn.classList.remove('btn-success');
                    DOM.connectGoogleBtn.disabled = false;
                    DOM.connectGoogleBtn.style.display = 'inline-flex';
                    DOM.disconnectGoogleBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
                    DOM.disconnectGoogleBtn.disabled = false;
                    DOM.disconnectGoogleBtn.style.display = 'none';

                    const card = DOM.connectGoogleBtn.closest('.sync-provider-card');
                    if (card) card.classList.remove('connected');

                    if (DOM.syncRgpdWarning) {
                        DOM.syncRgpdWarning.style.display = 'none';
                    }

                    UI.showNotification('Déconnecté de Google Drive.', 'info');
                } catch (error) {
                    console.error('Google sync disconnection error:', error);
                    DOM.disconnectGoogleBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
                    DOM.disconnectGoogleBtn.disabled = false;
                    UI.showNotification('Erreur de déconnexion : ' + error.message, 'error');
                }
            });
        }
    }
};
