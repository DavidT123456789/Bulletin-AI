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
import { FormUI } from '../FormUIManager.js';

import { DEMO_STUDENT_PROFILES, DEFAULT_IA_CONFIG } from '../../config/Config.js';
import { MODEL_SHORT_NAMES } from '../../config/models.js';

let App = null;

export const SettingsModalListeners = {
    init(appInstance) {
        App = appInstance;
        this.lastPreviewIndex = -1; // Track index for directional animation
        this.previewCache = {}; // Cache for lab session previews
    },

    /**
     * Builds current IA settings from DOM inputs.
     * Single source of truth for both prompt preview and AI generation.
     * @returns {Object} Current settings object
     * @private
     */
    _getCurrentSettings() {
        return {
            length: parseInt(DOM.iaLengthSlider?.value || DEFAULT_IA_CONFIG.length),
            tone: parseInt(DOM.iaToneSlider?.value || 3),
            styleInstructions: DOM.iaStyleInstructions?.value || '',
            enableStyleInstructions: DOM.iaStyleInstructionsToggle?.checked !== false,
            voice: document.querySelector('input[name="iaVoiceRadio"]:checked')?.value || 'default',
            discipline: DOM.iaDiscipline?.value || ''
        };
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

        DOM.personalizationToggle.addEventListener('change', async (e) => {
            appState.useSubjectPersonalization = e.target.checked;
            SettingsUIManager.updatePersonalizationState();
            // Rafraîchir les valeurs affichées (sliders) pour refléter les nouvelles valeurs
            FormUI.updateSettingsFields();
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



        // Configuration Ollama (IA locale)
        this._setupOllamaListeners(addClickListener);

        // Listeners pour les sliders IA
        this._setupIASliders();

        // Settings modal interactions
        this._setupModalInteractions(addClickListener);

        // Inspector toggle button for personalization modal
        this._setupInspectorToggle();

        // Reset Lab Style button
        addClickListener(DOM.resetLabStyleBtn, () => SettingsUIManager.resetPersonalStyle());
    },

    /**
     * Setup Inspector toggle button for the personalization modal
     * @private
     */
    _setupInspectorToggle() {
        const toggleBtn = document.getElementById('toggleInspectorBtn');
        const grid = document.querySelector('.personalization-grid');
        const modalContent = document.querySelector('.personalization-modal-content');

        if (!toggleBtn || !grid) return;

        // Restore state from localStorage (hidden by default)
        const isVisible = localStorage.getItem('inspectorVisible') === 'true';
        if (isVisible) {
            grid.classList.add('inspector-visible');
            modalContent?.classList.add('inspector-visible');
            toggleBtn.classList.add('active');
        }

        toggleBtn.addEventListener('click', () => {
            const nowVisible = grid.classList.toggle('inspector-visible');
            modalContent?.classList.toggle('inspector-visible', nowVisible);
            toggleBtn.classList.toggle('active', nowVisible);
            localStorage.setItem('inspectorVisible', nowVisible);
        });

        // Copy prompt button
        const copyBtn = document.getElementById('copyPromptBtn');
        const promptContainer = document.getElementById('settingsPreviewPrompt');
        if (copyBtn && promptContainer) {
            copyBtn.addEventListener('click', async () => {
                const text = promptContainer.textContent?.trim();
                if (!text || text === 'Le prompt s\'affichera ici après avoir rafraîchi l\'aperçu.') {
                    UI.showNotification('Générez d\'abord un aperçu pour copier le prompt.', 'warning');
                    return;
                }
                try {
                    await navigator.clipboard.writeText(text);
                    UI.showNotification('Prompt copié !', 'success');
                } catch {
                    UI.showNotification('Échec de la copie', 'error');
                }
            });
        }
    },

    _setupApiKeysAccordion(addClickListener) {
        const openApiKeysBtn = document.getElementById('openApiKeysAccordionBtn');
        if (openApiKeysBtn) {
            openApiKeysBtn.addEventListener('click', () => {
                // Use centralized highlight utility
                UI.highlightSettingsElement('apiKeysAccordion', {
                    tab: 'advanced',
                    useParentFormGroup: false
                });
            });
        }
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
                    1: 'Très encourageant',
                    2: 'Bienveillant',
                    3: 'Libre (par défaut)',
                    4: 'Exigeant',
                    5: 'Strict'
                };
                const toneDisplay = document.getElementById('iaToneSliderValue');
                if (toneDisplay) toneDisplay.textContent = toneLabels[toneVal] || 'Libre (par défaut)';

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
                // [FIX] Ensure MonStyle structure exists before updating
                if (!appState.subjects['MonStyle']) {
                    appState.subjects['MonStyle'] = { iaConfig: { ...DEFAULT_IA_CONFIG } };
                }
                if (!appState.subjects['MonStyle'].iaConfig) {
                    appState.subjects['MonStyle'].iaConfig = { ...DEFAULT_IA_CONFIG };
                }
                appState.subjects['MonStyle'].iaConfig.styleInstructions = DOM.iaStyleInstructions.value;

                SettingsUIManager.showPreviewRefreshHint();
            });

            DOM.iaStyleInstructions.addEventListener('input', Utils.debounce(() => {
                StorageManager.saveAppState();
            }, 1500)); // Save 1.5s after last keystroke
        }

        if (DOM.iaStyleInstructionsToggle) {
            DOM.iaStyleInstructionsToggle.addEventListener('change', () => {
                // Ensure MonStyle structure exists
                if (!appState.subjects['MonStyle']) {
                    appState.subjects['MonStyle'] = { iaConfig: { ...DEFAULT_IA_CONFIG } };
                }
                if (!appState.subjects['MonStyle'].iaConfig) {
                    appState.subjects['MonStyle'].iaConfig = { ...DEFAULT_IA_CONFIG };
                }
                appState.subjects['MonStyle'].iaConfig.enableStyleInstructions = DOM.iaStyleInstructionsToggle.checked;

                SettingsUIManager.updatePersonalizationState();
                SettingsUIManager.showPreviewRefreshHint();
                this._updateStudentContextAndPrompt();
                StorageManager.saveAppState();
            });
        }

        // Discipline field listener (optional field for subject-specific vocabulary)
        if (DOM.iaDiscipline) {
            DOM.iaDiscipline.addEventListener('input', () => {
                // Ensure MonStyle structure exists
                if (!appState.subjects['MonStyle']) {
                    appState.subjects['MonStyle'] = { iaConfig: { ...DEFAULT_IA_CONFIG } };
                }
                if (!appState.subjects['MonStyle'].iaConfig) {
                    appState.subjects['MonStyle'].iaConfig = { ...DEFAULT_IA_CONFIG };
                }
                appState.subjects['MonStyle'].iaConfig.discipline = DOM.iaDiscipline.value;

                SettingsUIManager.showPreviewRefreshHint();
                this._updateStudentContextAndPrompt();
            });

            // Auto-save with debounce
            DOM.iaDiscipline.addEventListener('input', Utils.debounce(() => {
                StorageManager.saveAppState();
            }, 1500));
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
        // [FIX] Use custom event dispatched by UI.setPeriod for reliable sync
        document.addEventListener('periodChanged', () => {
            // Only update if personalization modal is visible (display:flex when open)
            const modal = document.getElementById('personalizationModal');
            if (modal && modal.style.display === 'flex') {
                this._updateStudentContextAndPrompt();
            }
        });

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

        // Check cache for restoration
        const previewResult = document.getElementById('settingsPreviewResult');
        const metaContainer = document.getElementById('previewMetaContainer');
        const cached = this.previewCache?.[studentId];

        if (cached) {
            // RESTORE FROM CACHE
            if (previewResult) {
                const cleanText = Utils.decodeHtmlEntities(Utils.cleanMarkdown(cached.appreciation));
                previewResult.innerHTML = cleanText;
                previewResult.classList.remove('placeholder', 'has-error');
            }

            // Restore Meta Badges
            const wordCountEl = document.getElementById('settingsPreviewWordCount');
            if (wordCountEl) {
                const wordCount = Utils.countWords(cached.appreciation);
                const charCount = Utils.countCharacters(cached.appreciation);
                wordCountEl.textContent = `${wordCount} mots • ${charCount} car.`;
            }

            const modelBadgeEl = document.getElementById('previewModelBadge');
            if (modelBadgeEl) {
                const modelName = MODEL_SHORT_NAMES[cached.modelUsed] || cached.modelUsed;

                // [FIX] Synchronize tooltip with Standard Utils
                const mockResult = {
                    studentData: { currentAIModel: cached.modelUsed },
                    tokenUsage: cached.tokenUsage // Now available in cache
                };
                const { tooltip } = Utils.getGenerationModeInfo(mockResult);

                modelBadgeEl.innerHTML = `<iconify-icon icon="solar:magic-stick-3-bold-duotone"></iconify-icon> ${modelName}`;
                modelBadgeEl.setAttribute('data-tooltip', tooltip);
                modelBadgeEl.removeAttribute('title');
                modelBadgeEl.style.display = 'flex';
                UI.initTooltips();
            }

            if (metaContainer) metaContainer.style.display = 'flex';

            // Restore Button Style (Regenerate)
            if (DOM.refreshPreviewBtn) {
                DOM.refreshPreviewBtn.innerHTML = '<iconify-icon icon="solar:refresh-bold"></iconify-icon> Régénérer';
                DOM.refreshPreviewBtn.classList.add('btn-regenerate');
            }

        } else {
            // NO CACHE -> RESET TO INITIAL STATE
            if (previewResult) {
                previewResult.textContent = 'Cliquez sur "Générer" pour voir l\'impact de vos réglages en direct.';
                previewResult.classList.add('placeholder');
                previewResult.classList.remove('has-error');
            }

            if (metaContainer) {
                metaContainer.style.display = 'none';
            }

            if (DOM.refreshPreviewBtn) {
                DOM.refreshPreviewBtn.innerHTML = '<iconify-icon icon="solar:play-bold"></iconify-icon> Générer';
                DOM.refreshPreviewBtn.classList.remove('btn-regenerate');
            }
        }

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
            const instructions = data.periods?.[currentPeriod]?.context || '';
            const statusBadges = data.statuses?.map(s => {
                const info = Utils.getStatusBadgeInfo(s);
                return `<span class="${info.className}">${info.label}</span>`;
            }).join(' ') || '';

            const newContent = `
                <div class="preview-context-header" style="margin-bottom:15px;">
                    ${statusBadges ? `<div class="preview-statuses" style="margin-bottom:8px;">${statusBadges}</div>` : ''}
                    ${instructions ? `<div class="preview-instructions-full"><iconify-icon icon="solar:info-circle-bold"></iconify-icon> ${instructions}</div>` : ''}
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
        const currentSettings = this._getCurrentSettings();

        const previewPromptEl = document.getElementById('settingsPreviewPrompt');
        if (previewPromptEl) {
            try {
                // [FIX] Sync studentData.currentPeriod with appState.currentPeriod
                // to ensure prompt inspector displays same period as table preview
                const syncedStudentData = { ...studentResult.studentData, currentPeriod };
                const prompts = AppreciationsManager.getAllPrompts(syncedStudentData, currentSettings);
                previewPromptEl.textContent = prompts.appreciation;
                previewPromptEl.classList.remove('placeholder');
            } catch (promptError) {
                previewPromptEl.textContent = 'Erreur lors de la génération du prompt : ' + promptError.message;
            }
        }
    },

    async _handlePreviewRefresh() {
        SettingsUIManager.hidePreviewRefreshHint();
        let generationSuccess = false;
        const previewResult = document.getElementById('settingsPreviewResult');
        const previewStatus = document.getElementById('previewStatus');
        const studentId = DOM.previewStudentSelect?.value;

        if (!studentId) {
            if (previewResult) {
                previewResult.innerHTML = '<span style="color:var(--warning-color);"><iconify-icon icon="solar:danger-triangle-bold"></iconify-icon> Sélectionnez un profil dans la liste.</span>';
            }
            return;
        }

        // Lab uses ONLY demo profiles
        const studentResult = DEMO_STUDENT_PROFILES.find(r => r.id === studentId);
        if (!studentResult) {
            if (previewResult) {
                previewResult.innerHTML = '<span style="color:var(--error-color);"><iconify-icon icon="solar:danger-circle-bold"></iconify-icon> Profil introuvable. Veuillez en sélectionner un autre.</span>';
            }
            return;
        }

        // Context is already displayed by _updateStudentContextAndPrompt, no need to rebuild

        // [FIX] Determine current period same as in _updateStudentContextAndPrompt
        const periodSystem = appState.periodSystem || 'trimestres';
        const periodKeys = periodSystem === 'semestres' ? ['S1', 'S2'] : ['T1', 'T2', 'T3'];
        const defaultPeriod = periodSystem === 'semestres' ? 'S2' : 'T3';
        let currentPeriod = appState.currentPeriod || defaultPeriod;
        if (!periodKeys.includes(currentPeriod)) {
            currentPeriod = defaultPeriod;
        }

        // Vérifier qu'une clé API est configurée (ou Ollama activé)
        const currentModel = appState.currentAIModel || 'gemini-2.5-flash';
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
                    previewResult.innerHTML = `<span style="color:var(--error-color);"><iconify-icon icon="solar:server-square-bold"></iconify-icon> <strong>Ollama non activé</strong><br><br>Activez Ollama dans l'onglet <strong>Avancé</strong> pour utiliser le laboratoire d'aperçu avec ce modèle local.</span>`;
                } else {
                    previewResult.innerHTML = `<span style="color:var(--error-color);"><iconify-icon icon="solar:key-minimalistic-square-bold"></iconify-icon> <strong>Clé API manquante</strong><br><br>Configurez une clé API dans l'onglet <strong>Avancé</strong> pour utiliser le laboratoire d'aperçu.</span>`;
                }
            }
            const notifMsg = isOllama
                ? 'Ollama non activé. Activez-le dans l\'onglet Avancé.'
                : 'Clé API non configurée. Configurez-la dans l\'onglet Avancé.';
            UI.showNotification(notifMsg, 'error');
            SettingsUIManager.showPreviewRefreshHint();
            if (previewStatus) {
                const statusMsg = isOllama
                    ? '<iconify-icon icon="solar:server-square-bold" style="margin-right: 6px;"></iconify-icon> Activez Ollama puis réessayez.'
                    : '<iconify-icon icon="solar:key-minimalistic-square-bold" style="margin-right: 6px;"></iconify-icon> Configurez une clé API puis réessayez.';
                previewStatus.innerHTML = statusMsg;
            }
            return;
        }

        // Afficher le loading
        DOM.refreshPreviewBtn.innerHTML = '<iconify-icon icon="solar:spinner-bold-duotone" class="icon-spin"></iconify-icon> Génération...';
        DOM.refreshPreviewBtn.disabled = true;
        if (previewResult) {
            previewResult.innerHTML = '<div class="loading-state-centered"><div class="loading-spinner"></div><span>Génération en cours...</span></div>';
            previewResult.classList.remove('placeholder');
        }

        try {
            const currentSettings = this._getCurrentSettings();

            // [FIX] Sync studentData.currentPeriod with appState.currentPeriod
            // Used for both prompt preview and AI generation
            const syncedStudentData = { ...studentResult.studentData, currentPeriod };

            // Display the prompt that will be sent to the AI
            const previewPromptEl = document.getElementById('settingsPreviewPrompt');
            if (previewPromptEl) {
                try {
                    const prompts = AppreciationsManager.getAllPrompts(syncedStudentData, currentSettings);
                    previewPromptEl.textContent = prompts.appreciation;
                    previewPromptEl.classList.remove('placeholder');
                } catch (promptError) {
                    previewPromptEl.textContent = 'Erreur lors de la génération du prompt : ' + promptError.message;
                }
            }

            const result = await AppreciationsManager.generateAppreciation(syncedStudentData, true, currentSettings);

            // Save to session cache so it persists when navigating back to this student
            this.previewCache[studentId] = {
                appreciation: result.appreciation,
                modelUsed: result.modelUsed || appState.currentAIModel,
                tokenUsage: {
                    appreciation: result.usage,
                    generationTimeMs: result.generationTimeMs
                },
                timestamp: Date.now()
            };

            if (previewResult) {
                const cleanText = Utils.decodeHtmlEntities(Utils.cleanMarkdown(result.appreciation));
                previewResult.classList.remove('has-error', 'placeholder');
                // Apply word-by-word reveal animation
                await UI.typewriterReveal(previewResult, cleanText, { speed: 'fast' });
            }

            const wordCountEl = document.getElementById('settingsPreviewWordCount');
            if (wordCountEl) {
                const wordCount = Utils.countWords(result.appreciation);
                const charCount = Utils.countCharacters(result.appreciation);
                wordCountEl.textContent = `${wordCount} mots • ${charCount} car.`;
            }

            // Display the AI model used for this generation
            const modelBadgeEl = document.getElementById('previewModelBadge');
            if (modelBadgeEl) {
                const modelUsed = result.modelUsed || appState.currentAIModel;
                const modelDisplayName = MODEL_SHORT_NAMES[modelUsed] || modelUsed;

                // [FIX] Enable Single Source of Truth for tooltip info
                // Create a mock result object compatible with Utils.getGenerationModeInfo
                // Preview 'result' has different structure ({usage, generationTimeMs}) than full result ({tokenUsage: {appreciation: ... }})
                const mockResult = {
                    studentData: { currentAIModel: modelUsed },
                    tokenUsage: {
                        appreciation: result.usage,
                        generationTimeMs: result.generationTimeMs
                    }
                };

                // Get standardized tooltip
                const { tooltip } = Utils.getGenerationModeInfo(mockResult);

                modelBadgeEl.innerHTML = `<iconify-icon icon="solar:magic-stick-3-bold-duotone"></iconify-icon> ${modelDisplayName}`;
                modelBadgeEl.setAttribute('data-tooltip', tooltip);
                modelBadgeEl.removeAttribute('title'); // Remove native tooltip
                modelBadgeEl.style.display = 'flex';

                // Refresh tooltips to apply Tippy
                UI.initTooltips();
            }

            const metaContainer = document.getElementById('previewMetaContainer');
            if (metaContainer) metaContainer.style.display = 'flex';

            generationSuccess = true;

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
                        <strong><iconify-icon icon="solar:danger-circle-bold"></iconify-icon> Échec de la génération</strong>
                        <p>${errorMessage}</p>
                        <small>${errorExplanation}</small>
                    </div>`;
                previewResult.classList.add('has-error');
                previewResult.classList.remove('placeholder');
            }

            UI.showNotification(`Erreur de génération : ${errorMessage}`, 'error');
            SettingsUIManager.showPreviewRefreshHint();
            if (previewStatus) {
                previewStatus.innerHTML = '<iconify-icon icon="solar:danger-triangle-bold" style="margin-right: 6px; color: var(--error-color);"></iconify-icon> Échec. Corrigez le problème et réessayez.';
            }

        } finally {
            if (generationSuccess) {
                DOM.refreshPreviewBtn.innerHTML = '<iconify-icon icon="solar:refresh-bold"></iconify-icon> Régénérer';
                DOM.refreshPreviewBtn.classList.add('btn-regenerate');
            } else {
                DOM.refreshPreviewBtn.innerHTML = '<iconify-icon icon="solar:play-bold"></iconify-icon> Générer';
                DOM.refreshPreviewBtn.classList.remove('btn-regenerate');
            }
            DOM.refreshPreviewBtn.disabled = false;
        }
    },

    _setupModalInteractions(addClickListener) {
        // Clear preview cache and reset UI when closing the modal
        const clearCache = () => {
            this.previewCache = {};

            // Reset UI State immediately
            const previewResult = document.getElementById('settingsPreviewResult');
            if (previewResult) {
                previewResult.textContent = 'Cliquez sur "Générer" pour voir l\'impact de vos réglages en direct.';
                previewResult.classList.add('placeholder');
                previewResult.classList.remove('has-error');
            }
            const meta = document.getElementById('previewMetaContainer');
            if (meta) meta.style.display = 'none';

            if (DOM.refreshPreviewBtn) {
                DOM.refreshPreviewBtn.innerHTML = '<i class="fas fa-play"></i> Générer';
                DOM.refreshPreviewBtn.classList.remove('btn-regenerate');
            }
        };

        // Explicitly handle Personalization Modal (Lab context)
        const personalizationModal = document.getElementById('personalizationModal');
        if (personalizationModal) {
            personalizationModal.addEventListener('click', (e) => {
                if (e.target === personalizationModal) clearCache();
            });
            const pCloseBtns = personalizationModal.querySelectorAll('#cancelPersonalizationBtn, #savePersonalizationBtn, #closePersonalizationModalBtn, .close-button');
            pCloseBtns.forEach(btn => btn.addEventListener('click', clearCache));
        }

        DOM.settingsModal.addEventListener('click', (e) => {
            if (e.target === DOM.settingsModal) {
                clearCache();
                SettingsUIManager.cancelSettings();
            }
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
                clearCache();
                SettingsUIManager.cancelSettings();
            }
        });

        // Safeguard: Global Escape listener for Personalization Modal to ensure cache clear
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const pModal = document.getElementById('personalizationModal');
                if (pModal && (pModal.style.display === 'flex' || pModal.style.display === 'block')) {
                    clearCache();
                }
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

        // Update Check Buttons (Multiple IDs handled to avoid collision)
        const updateCheckHandler = async (btn) => {
            if (!btn) return;
            btn.disabled = true;
            const originalContent = btn.innerHTML;
            btn.innerHTML = '<iconify-icon icon="solar:spinner-bold-duotone" class="icon-spin"></iconify-icon> Vérification...';

            try {
                if (window.checkForUpdates) {
                    await window.checkForUpdates();
                    // Wait a bit to ensure potential PWA events fire
                    await new Promise(r => setTimeout(r, 1000));
                    UI.showNotification("Vérification des mises à jour terminée", "info");
                } else {
                    UI.showNotification("Fonction de mise à jour non disponible", "warning");
                }
            } catch (e) {
                console.error("Update check failed", e);
                UI.showNotification("Erreur lors de la vérification", "error");
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalContent;
            }
        };

        const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
        if (checkUpdatesBtn) addClickListener(checkUpdatesBtn, () => updateCheckHandler(checkUpdatesBtn));



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
                    DOM.connectGoogleBtn.innerHTML = '<iconify-icon icon="solar:spinner-bold-duotone" class="icon-spin"></iconify-icon> Connexion...';
                    DOM.connectGoogleBtn.disabled = true;

                    // Dynamic import of SyncService
                    const { SyncService } = await import('../../services/SyncService.js');
                    const connected = await SyncService.connect('google');

                    if (connected) {
                        DOM.googleSyncStatus.textContent = 'Connecté';
                        DOM.googleSyncStatus.classList.add('connected');

                        // Find parent card and add connected class
                        const card = DOM.connectGoogleBtn.closest('.sync-provider-card');
                        if (card) card.classList.add('connected');

                        // Show Save/Load actions bar
                        const actionsBar = document.getElementById('cloudActionsBar');
                        if (actionsBar) actionsBar.style.display = 'flex';

                        // Update UI to show connected state with disconnect button
                        DOM.connectGoogleBtn.innerHTML = '<iconify-icon icon="ph:check-bold"></iconify-icon> Connecté';
                        DOM.connectGoogleBtn.classList.add('btn-success');
                        DOM.connectGoogleBtn.style.display = 'none';
                        if (DOM.disconnectGoogleBtn) {
                            DOM.disconnectGoogleBtn.style.display = 'inline-flex';
                        }

                        UI.showNotification('Google Drive connecté ! Utilisez les boutons Sauvegarder/Charger.', 'success');
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

        // Cloud Save button
        const cloudSaveBtn = document.getElementById('cloudSaveBtn');
        if (cloudSaveBtn) {
            cloudSaveBtn.addEventListener('click', async () => {
                try {
                    cloudSaveBtn.innerHTML = '<iconify-icon icon="solar:spinner-bold-duotone" class="icon-spin"></iconify-icon> Sauvegarde...';
                    cloudSaveBtn.disabled = true;

                    const { SyncService } = await import('../../services/SyncService.js');
                    await SyncService.saveToCloud();

                    // Update last save time
                    const lastSaveEl = document.getElementById('cloudLastSave');
                    if (lastSaveEl) {
                        const now = new Date();
                        lastSaveEl.textContent = `Dernière sauvegarde : ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
                    }

                    UI.showNotification('Données sauvegardées sur Google Drive !', 'success');
                } catch (error) {
                    console.error('Cloud save error:', error);
                    UI.showNotification('Erreur de sauvegarde : ' + error.message, 'error');
                } finally {
                    cloudSaveBtn.innerHTML = '<iconify-icon icon="solar:upload-minimalistic-bold"></iconify-icon> Sauvegarder';
                    cloudSaveBtn.disabled = false;
                }
            });
        }

        // Cloud Load button
        const cloudLoadBtn = document.getElementById('cloudLoadBtn');
        if (cloudLoadBtn) {
            cloudLoadBtn.addEventListener('click', async () => {
                // Confirm before overwriting local data
                UI.showCustomConfirm(
                    'Charger les données depuis Google Drive ? Vos données locales seront remplacées.',
                    async () => {
                        try {
                            cloudLoadBtn.innerHTML = '<iconify-icon icon="solar:spinner-bold-duotone" class="icon-spin"></iconify-icon> Chargement...';
                            cloudLoadBtn.disabled = true;

                            const { SyncService } = await import('../../services/SyncService.js');
                            const result = await SyncService.loadFromCloud();

                            if (result.success) {
                                UI.showNotification('Données chargées depuis Google Drive !', 'success');
                                // Reload page to reflect new data
                                setTimeout(() => window.location.reload(), 1000);
                            } else {
                                UI.showNotification('Aucune donnée trouvée sur Google Drive.', 'warning');
                            }
                        } catch (error) {
                            console.error('Cloud load error:', error);
                            UI.showNotification('Erreur de chargement : ' + error.message, 'error');
                        } finally {
                            cloudLoadBtn.innerHTML = '<iconify-icon icon="solar:download-minimalistic-bold"></iconify-icon> Charger';
                            cloudLoadBtn.disabled = false;
                        }
                    }
                );
            });
        }

        // Cloud sync - Google Drive DISCONNECTION
        if (DOM.disconnectGoogleBtn) {
            DOM.disconnectGoogleBtn.addEventListener('click', async () => {
                try {
                    DOM.disconnectGoogleBtn.innerHTML = '<iconify-icon icon="solar:spinner-bold-duotone" class="icon-spin"></iconify-icon>';
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
                    DOM.disconnectGoogleBtn.innerHTML = '<iconify-icon icon="solar:logout-2-bold"></iconify-icon>';
                    DOM.disconnectGoogleBtn.disabled = false;
                    DOM.disconnectGoogleBtn.style.display = 'none';

                    // Hide Save/Load actions bar
                    const actionsBar = document.getElementById('cloudActionsBar');
                    if (actionsBar) actionsBar.style.display = 'none';

                    const card = DOM.connectGoogleBtn.closest('.sync-provider-card');
                    if (card) card.classList.remove('connected');

                    UI.showNotification('Déconnecté de Google Drive.', 'info');
                } catch (error) {
                    console.error('Google sync disconnection error:', error);
                    DOM.disconnectGoogleBtn.innerHTML = '<iconify-icon icon="solar:logout-2-bold"></iconify-icon>';
                    DOM.disconnectGoogleBtn.disabled = false;
                    UI.showNotification('Erreur de déconnexion : ' + error.message, 'error');
                }
            });
        }
    }
};
