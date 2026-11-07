/**
 * @fileoverview Listeners de la modale des paramètres
 * @module managers/listeners/SettingsModalListeners
 */

import { appState } from '../../state/State.js';
import { DOM } from '../../utils/DOM.js';
import { Utils } from '../../utils/Utils.js';
import { BackupImportManager } from '../BackupImportManager.js';
import { UI } from '../UIManager.js';
import { StorageManager } from '../StorageManager.js';
import { CloudActionsManager } from '../CloudActionsManager.js';
import { ApiValidationManager } from '../ApiValidationManager.js';
import { SettingsUIManager } from '../SettingsUIManager.js';
import { EventHandlersManager } from '../EventHandlersManager.js';
import { AppreciationsManager } from '../AppreciationsManager.js';
import { FormUI } from '../FormUIManager.js';

import { DEMO_STUDENT_PROFILES, DEFAULT_IA_CONFIG } from '../../config/Config.js';
import { MODEL_SHORT_NAMES } from '../../config/models.js';

let App = null;

/** Clé de persistance de l'onglet actif du volet d'aperçu (Aperçu / Prompt). */
const PREVIEW_TAB_STORAGE_KEY = 'labPreviewTab';

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
            length: parseInt(DOM.iaLengthSlider?.value || DEFAULT_IA_CONFIG.length, 10),
            tone: parseInt(DOM.iaToneSlider?.value || 3, 10),
            enableTone: DOM.iaToneToggle ? DOM.iaToneToggle.checked : false,
            styleInstructions: DOM.iaStyleInstructions?.value || '',
            enableStyleInstructions: DOM.iaStyleInstructionsToggle?.checked !== false,
            voice: document.querySelector('input[name="iaVoiceRadio"]:checked')?.value || 'default',
            discipline: DOM.iaDiscipline?.value || ''
        };
    },

    /**
     * Ouvre la modale « Personnalisation du style » et met en évidence un réglage.
     * Point d'entrée unique pour les raccourcis externes (statistiques, Focus, Guide).
     * @param {string} [focusId] - ID du contrôle (ou du volet) à mettre en évidence
     */
    openPersonalization(focusId) {
        UI.openModal(DOM.personalizationModal);
        if (focusId) {
            UI.highlightSettingsElement(focusId, { parentSelector: '.settings-row' });
        }
    },

    /**
     * Configure les listeners de la modale des paramètres.
     * @param {Function} addClickListener - Helper pour ajouter un listener click
     */
    setup(addClickListener) {
        // Chaque ouverture démarre une session d'aperçu vierge, annulable via snapshot
        document.addEventListener('settings-modal-open', (e) => {
            if (e.detail?.modalId === 'personalizationModal') {
                SettingsUIManager.createSnapshot();
                this._resetPreviewSession();
                this._updateNavArrowsState();
                requestAnimationFrame(() => {
                    this._updateStudentContextAndPrompt();
                    this._autoResizeStyleInstructions();
                });
            }
        });

        DOM.periodSystemRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                EventHandlersManager.handlePeriodSystemChange(e);
                StorageManager.saveAppState();
                // Note: Glider animation is handled by the listener in initGliders()
                // Sync lab preview with new period system
                setTimeout(() => this._updateStudentContextAndPrompt(), 100);
            });
        });

        // Toggle pour le basculement automatique entre APIs (sauvegarde immédiate)
        if (DOM.enableApiFallbackToggle) {
            DOM.enableApiFallbackToggle.addEventListener('change', (e) => {
                appState.enableApiFallback = e.target.checked;
                SettingsUIManager.updateApiStatusDisplay();
                StorageManager.saveAppState();
            });
        }

        // Sauvegarde immédiate des préférences (Anonymisation RGPD, Seuils d'évolution, Pastilles Plan de classe)
        if (DOM.settingsPrivacyAnonymizeToggle) {
            DOM.settingsPrivacyAnonymizeToggle.addEventListener('change', (e) => {
                appState.anonymizeData = e.target.checked;
                StorageManager.saveAppState();
            });
        }

        const syncEvolutionThresholds = () => {
            SettingsUIManager.syncEvolutionThresholdsFromDOM();
            StorageManager.saveAppState();
            AppreciationsManager.renderResults();
        };
        DOM.settingsEvolutionThresholdPositive?.addEventListener('change', syncEvolutionThresholds);
        DOM.settingsEvolutionThresholdNegative?.addEventListener('change', syncEvolutionThresholds);

        document.getElementById('seatingStatusDotsSelector')?.addEventListener('change', (e) => {
            if (!e.target?.closest?.('input[type="checkbox"][data-dot-category]')) return;
            SettingsUIManager.syncSeatingStatusDotsFromDOM();
            StorageManager.saveAppState();
        });

        // API validation - delegated to ApiValidationManager
        addClickListener(DOM.validateOpenaiApiKeyBtn, () => ApiValidationManager.validateApiKey('openai'));
        addClickListener(DOM.validateGoogleApiKeyBtn, () => ApiValidationManager.validateApiKey('google'));
        addClickListener(DOM.validateAlbertApiKeyBtn, () => ApiValidationManager.validateApiKey('albert'));
        addClickListener(DOM.validateGroqApiKeyBtn, () => ApiValidationManager.validateApiKey('groq'));
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

        [DOM.openaiApiKey, DOM.googleApiKey, DOM.albertApiKey, DOM.groqApiKey, DOM.openrouterApiKey, DOM.anthropicApiKey, DOM.mistralApiKey].forEach(input => {
            if (input) input.addEventListener('input', ApiValidationManager.handleApiKeyInput);
        });

        // Bouton pour ouvrir l'accordion des clés API
        this._setupApiKeysAccordion(addClickListener);

        // Configuration Ollama (IA locale)
        this._setupOllamaListeners(addClickListener);

        // Listeners pour les réglages de style IA
        this._setupIASliders();

        // Settings modal interactions
        this._setupModalInteractions(addClickListener);

        // Volet d'aperçu : onglets Aperçu / Prompt et boutons de copie
        this._setupPreviewPane();

        // Reset Lab Style button
        addClickListener(DOM.resetLabStyleBtn, () => SettingsUIManager.resetPersonalStyle());

        // Listen for reset events to update prompt preview
        document.addEventListener('personalizationReset', () => {
            this._markPreviewCacheStale();
            this._updateStudentContextAndPrompt();
            this._autoResizeStyleInstructions();
        });

        // Re-calculate textarea size on window resize when modal is open
        window.addEventListener('resize', Utils.debounce(() => {
            if (this._isPersonalizationOpen()) {
                this._autoResizeStyleInstructions();
            }
        }, 150));
    },

    /**
     * @returns {boolean} true si la modale « Personnalisation du style » est affichée
     * @private
     */
    _isPersonalizationOpen() {
        return DOM.personalizationModal?.style.display === 'flex';
    },

    /**
     * Configure le volet d'aperçu : bascule Aperçu / Prompt (persistée) et boutons de copie.
     * @private
     */
    _setupPreviewPane() {
        const tabRadios = [...document.querySelectorAll('input[name="labPreviewTab"]')];
        const panels = document.querySelectorAll('[data-lab-panel]');

        const showPanel = (tab) => {
            panels.forEach(panel => { panel.hidden = panel.dataset.labPanel !== tab; });
        };

        if (tabRadios.length) {
            const savedTab = localStorage.getItem(PREVIEW_TAB_STORAGE_KEY);
            const initialTab = tabRadios.some(radio => radio.value === savedTab) ? savedTab : tabRadios[0].value;
            tabRadios.forEach(radio => {
                radio.checked = radio.value === initialTab;
                radio.addEventListener('change', () => {
                    if (!radio.checked) return;
                    showPanel(radio.value);
                    localStorage.setItem(PREVIEW_TAB_STORAGE_KEY, radio.value);
                });
            });
            showPanel(initialTab);
        }

        document.getElementById('copyPromptBtn')?.addEventListener('click', () => {
            const promptEl = DOM.settingsPreviewPrompt;
            if (!promptEl || promptEl.classList.contains('placeholder')) {
                UI.showNotification('Sélectionnez un élève pour afficher le prompt.', 'warning');
                return;
            }
            this._copyToClipboard(promptEl.textContent.trim(), 'Prompt copié !');
        });

        // Le bouton n'est visible qu'une fois une appréciation générée (pied de carte)
        document.getElementById('copyPreviewAppreciationBtn')?.addEventListener('click', () => {
            this._copyToClipboard(DOM.settingsPreviewResult?.textContent.trim(), 'Appréciation copiée !');
        });
    },

    /**
     * Copie un texte dans le presse-papiers avec retour utilisateur.
     * @param {string} text - Texte à copier
     * @param {string} successMessage - Notification affichée en cas de succès
     * @private
     */
    async _copyToClipboard(text, successMessage) {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            UI.showNotification(successMessage, 'success');
        } catch {
            UI.showNotification('Échec de la copie', 'error');
        }
    },

    _setupApiKeysAccordion(addClickListener) {
        const openApiKeysBtn = document.getElementById('openApiKeysAccordionBtn');
        if (openApiKeysBtn) {
            openApiKeysBtn.addEventListener('click', () => {
                // Use centralized highlight utility
                UI.highlightSettingsElement('apiKeysAccordion', {
                    tab: 'settings-engine',
                    parentSelector: null
                });
            });
        }
    },


    _setupOllamaListeners(addClickListener) {
        if (DOM.ollamaEnabledToggle) {
            DOM.ollamaEnabledToggle.addEventListener('change', async (e) => {
                appState.ollamaEnabled = e.target.checked;
                StorageManager.saveAppState();
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
                appState.ollamaBaseUrl = e.target.value.trim();
                StorageManager.saveAppState();
            });
        }

    },

    /**
     * Marque toutes les appréciations en cache comme obsolètes suite à un changement de réglages.
     * @private
     */
    _markPreviewCacheStale() {
        if (!this.previewCache) return;
        Object.values(this.previewCache).forEach(entry => { entry.stale = true; });
    },

    /**
     * Applique une modification de style en temps réel (appState → affichage → prompt).
     * La génération utilise ainsi immédiatement la valeur courante.
     * @param {Object} patch - Propriétés de MonStyle.iaConfig à mettre à jour
     * @param {Object} [options]
     * @param {boolean} [options.refreshPrompt=true] - Recalculer immédiatement le prompt affiché
     * @private
     */
    _applyStyleChange(patch, { refreshPrompt = true } = {}) {
        Object.assign(SettingsUIManager.getPersonalStyleConfig(), patch);
        FormUI.syncStyleControls();
        this._markPreviewCacheStale();
        if (this.previewCache?.[DOM.previewStudentSelect?.value]) {
            this._setGenerateButtonState('dirty');
            SettingsUIManager.showPreviewRefreshHint();
        }
        if (refreshPrompt) {
            this._refreshPromptPreview();
        }
    },

    _setupIASliders() {
        DOM.iaLengthSlider?.addEventListener('input', () => {
            this._applyStyleChange({ length: parseInt(DOM.iaLengthSlider.value, 10) });
        });

        if (DOM.iaToneSlider) {
            // Manipuler le curseur active implicitement le ton imposé
            DOM.iaToneSlider.addEventListener('input', () => {
                this._applyStyleChange({ tone: parseInt(DOM.iaToneSlider.value, 10), enableTone: true });
            });
        }

        DOM.iaToneToggle?.addEventListener('change', () => {
            this._applyStyleChange({ enableTone: DOM.iaToneToggle.checked });
        });

        if (DOM.iaStyleInstructions) {
            const refreshPromptDebounced = Utils.debounce(() => this._refreshPromptPreview(), 300);
            DOM.iaStyleInstructions.addEventListener('input', () => {
                this._autoResizeStyleInstructions();
                this._applyStyleChange({ styleInstructions: DOM.iaStyleInstructions.value }, { refreshPrompt: false });
                refreshPromptDebounced();
            });
        }

        DOM.iaStyleInstructionsToggle?.addEventListener('change', () => {
            this._applyStyleChange({ enableStyleInstructions: DOM.iaStyleInstructionsToggle.checked });
        });

        // Discipline (optionnelle) : vocabulaire propre à la matière
        DOM.iaDiscipline?.addEventListener('input', () => {
            this._applyStyleChange({ discipline: DOM.iaDiscipline.value });
        });

        document.querySelectorAll('input[name="iaVoiceRadio"]').forEach(radio => {
            radio.addEventListener('change', (e) => this._applyStyleChange({ voice: e.target.value }));
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

        // Navigation arrow buttons & keyboard (← / →) for preview student
        const stepStudent = (delta) => {
            const select = DOM.previewStudentSelect;
            const nextIndex = (select?.selectedIndex ?? -1) + delta;
            if (!select || nextIndex < 0 || nextIndex >= select.options.length) return;
            if (document.activeElement && document.activeElement !== document.body && document.activeElement !== DOM.personalizationModal) {
                document.activeElement.blur?.();
            }
            select.selectedIndex = nextIndex;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        };
        document.getElementById('previewPrevStudentBtn')?.addEventListener('click', () => stepStudent(-1));
        document.getElementById('previewNextStudentBtn')?.addEventListener('click', () => stepStudent(1));

        document.addEventListener('keydown', (e) => {
            if (!this._isPersonalizationOpen()) return;
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            const activeEl = document.activeElement;
            const isTextInput = activeEl && (
                activeEl.tagName === 'TEXTAREA' ||
                activeEl.isContentEditable ||
                (activeEl.tagName === 'INPUT' && ['text', 'search', 'number', 'password', 'url', 'email'].includes(activeEl.type))
            );
            const isKeyboardSlider = activeEl?.tagName === 'INPUT' && activeEl.type === 'range' && activeEl.matches?.(':focus-visible');
            if (isTextInput || isKeyboardSlider) return;

            e.preventDefault();
            stepStudent(e.key === 'ArrowLeft' ? -1 : 1);
        });

        // Listen to main period changes to sync lab
        // [FIX] Use custom event dispatched by UI.setPeriod for reliable sync
        document.addEventListener('periodChanged', () => {
            if (this._isPersonalizationOpen()) {
                this._updateStudentContextAndPrompt();
            }
        });

        // Preview refresh button - only for AI generation
        DOM.refreshPreviewBtn?.addEventListener('click', () => this._handlePreviewRefresh());
    },

    /**
     * Updates the enabled/disabled state of navigation arrows and the displayed name
     */
    _updateNavArrowsState() {
        const select = DOM.previewStudentSelect;
        if (!select || select.selectedIndex < 0) return;

        const { selectedIndex, options } = select;
        const nameDisplay = document.getElementById('previewStudentNameDisplay');
        if (nameDisplay) nameDisplay.textContent = options[selectedIndex].text;

        const counterDisplay = document.getElementById('previewStudentCounter');
        if (counterDisplay) counterDisplay.textContent = `${selectedIndex + 1}/${options.length}`;

        // Sync student avatar with photo
        const avatarEl = document.getElementById('previewStudentAvatar');
        const student = DEMO_STUDENT_PROFILES.find(s => s.id === options[selectedIndex].value);
        if (avatarEl && student) {
            const photoUrl = student.photo || `./images/Demo/${student.nom.toLowerCase()}.jpg`;
            const initials = `${student.prenom?.[0] || ''}${student.nom?.[0] || ''}`.toUpperCase();
            avatarEl.innerHTML = `
                <img src="${photoUrl}" alt="${student.prenom} ${student.nom}" class="header-student-avatar-img"
                    onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='inline-flex';" />
                <span class="avatar-initials-fallback" style="display:none;">${initials}</span>
            `;
        }

        // Sync arrow states (+ accessible labels naming the target student)
        const syncArrow = (btn, targetIndex, prefix) => {
            if (!btn) return;
            btn.disabled = targetIndex < 0 || targetIndex >= options.length;
            if (!btn.disabled) btn.setAttribute('aria-label', `${prefix} - ${options[targetIndex].text}`);
        };
        syncArrow(document.getElementById('previewPrevStudentBtn'), selectedIndex - 1, 'Élève précédent');
        syncArrow(document.getElementById('previewNextStudentBtn'), selectedIndex + 1, 'Élève suivant');
    },

    /**
     * Ajuste la hauteur des consignes à leur contenu, dans les bornes min/max définies en CSS.
     * @private
     */
    _autoResizeStyleInstructions(retryCount = 0) {
        const textarea = DOM.iaStyleInstructions;
        if (!textarea) return;

        if (textarea.offsetHeight === 0 && textarea.offsetWidth === 0) {
            if (retryCount < 10) {
                requestAnimationFrame(() => this._autoResizeStyleInstructions(retryCount + 1));
            }
            return;
        }

        const { minHeight, maxHeight, borderTopWidth, borderBottomWidth } = getComputedStyle(textarea);
        const min = parseFloat(minHeight) || 0;
        const max = parseFloat(maxHeight) || Infinity;
        const borders = parseFloat(borderTopWidth) + parseFloat(borderBottomWidth);

        textarea.style.height = 'auto';
        const targetHeight = Math.min(Math.max(textarea.scrollHeight + borders, min), max);
        textarea.style.height = `${targetHeight}px`;
        textarea.style.overflowY = textarea.scrollHeight + borders > max ? 'auto' : 'hidden';
    },

    /**
     * Démarre une session d'aperçu vierge (cache vidé, carte et bouton réinitialisés).
     * @private
     */
    _resetPreviewSession() {
        this.previewCache = {};
        this.lastPreviewIndex = -1;
        SettingsUIManager.hidePreviewRefreshHint();
        this._renderPreviewEmptyState();
    },

    /**
     * Résout la période affichée par le laboratoire selon le système périodique actif.
     * @returns {{ periodKeys: string[], currentPeriod: string }}
     * @private
     */
    _resolveLabPeriod() {
        const isSemestres = appState.periodSystem === 'semestres';
        const periodKeys = isSemestres ? ['S1', 'S2'] : ['T1', 'T2', 'T3'];
        const defaultPeriod = periodKeys[periodKeys.length - 1];
        const currentPeriod = periodKeys.includes(appState.currentPeriod) ? appState.currentPeriod : defaultPeriod;
        return { periodKeys, currentPeriod };
    },

    /**
     * Met à jour le bouton de génération de l'aperçu via le socle unifié UI.
     * @param {'idle'|'done'|'dirty'|'loading'} state
     * @private
     */
    _setGenerateButtonState(state) {
        UI.setGenerateButtonState?.(DOM.refreshPreviewBtn, state);
    },

    /**
     * Applique l'état visuel de la carte d'appréciation.
     * @param {'empty'|'loading'|'content'|'error'} state
     * @private
     */
    _setResultState(state) {
        DOM.settingsPreviewResultGroup?.classList.toggle('is-empty', state === 'empty');
        DOM.settingsPreviewResult?.classList.toggle('placeholder', state === 'empty');
        DOM.settingsPreviewResult?.classList.toggle('has-error', state === 'error');
        if (DOM.previewMetaContainer) DOM.previewMetaContainer.hidden = state !== 'content';
    },

    /**
     * Renders the preview output empty state card
     * @private
     */
    _renderPreviewEmptyState() {
        this._setResultState('empty');
        this._setGenerateButtonState('idle');
        if (DOM.settingsPreviewResult) {
            DOM.settingsPreviewResult.innerHTML = `
                <div class="preview-empty-state">
                    <iconify-icon class="preview-empty-icon" icon="solar:stars-line-duotone"></iconify-icon>
                    <div class="preview-empty-title">Prêt pour l'aperçu</div>
                    <div class="preview-empty-subtitle">Ajustez vos réglages puis cliquez sur <strong>Générer</strong> pour tester le rendu sur cet élève.</div>
                </div>
            `;
        }
    },

    /**
     * Affiche une erreur dans la carte d'appréciation.
     * @param {string} title - Titre de l'erreur
     * @param {string} message - Détail
     * @param {string} [hint] - Piste de résolution
     * @private
     */
    _renderPreviewError(title, message, hint = '') {
        this._setResultState('error');
        if (!DOM.settingsPreviewResult) return;
        DOM.settingsPreviewResult.innerHTML = `
            <div class="preview-error-message">
                <strong><iconify-icon icon="solar:danger-circle-linear"></iconify-icon> ${title}</strong>
                <p>${message}</p>
                ${hint ? `<small>${hint}</small>` : ''}
            </div>`;
    },

    /**
     * Affiche une appréciation (depuis le cache ou une génération) et ses métadonnées.
     * @param {{ appreciation: string, modelUsed: string, tokenUsage: Object }} entry
     * @param {Object} [options]
     * @param {boolean} [options.animate=false] - Révélation progressive du texte
     * @private
     */
    async _renderPreviewResult(entry, { animate = false } = {}) {
        const previewResult = DOM.settingsPreviewResult;
        if (!previewResult) return;

        const cleanText = Utils.decodeHtmlEntities(Utils.cleanMarkdown(entry.appreciation)).trim();
        this._setResultState('loading');
        if (animate) {
            await UI.animateHtmlReveal(previewResult, cleanText, { speed: 'fast' });
        } else {
            previewResult.innerHTML = cleanText;
        }

        UI.updateWordCount('settingsPreviewWordCount', entry.appreciation);

        if (DOM.previewModelBadge) {
            const { tooltip } = Utils.getGenerationModeInfo({
                studentData: { currentAIModel: entry.modelUsed },
                tokenUsage: entry.tokenUsage
            });
            DOM.previewModelBadge.innerHTML = `<iconify-icon icon="solar:stars-line-duotone"></iconify-icon> ${MODEL_SHORT_NAMES[entry.modelUsed] || entry.modelUsed}`;
            DOM.previewModelBadge.setAttribute('data-tooltip', tooltip);
            DOM.previewModelBadge.hidden = false;
            UI.initTooltips();
        }

        this._setResultState('content');
    },

    /**
     * Affiche le prompt qui sera envoyé à l'IA (aucun appel réseau).
     * @param {Object} studentData - Données élève synchronisées sur la période du laboratoire
     * @param {Object} settings - Réglages de style courants
     * @private
     */
    _renderPromptPreview(studentData, settings) {
        const promptEl = DOM.settingsPreviewPrompt;
        if (!promptEl) return;
        try {
            promptEl.textContent = AppreciationsManager.getAllPrompts(studentData, settings).appreciation;
            promptEl.classList.remove('placeholder');
        } catch (promptError) {
            promptEl.textContent = `Erreur lors de la génération du prompt : ${promptError.message}`;
        }
    },

    /**
     * Recalcule uniquement le prompt pour l'élève courant (sans reconstruire la carte élève).
     * @private
     */
    _refreshPromptPreview() {
        const studentId = DOM.previewStudentSelect?.value;
        const studentResult = DEMO_STUDENT_PROFILES.find(r => r.id === studentId);
        if (!studentResult?.studentData) return;
        const { currentPeriod } = this._resolveLabPeriod();
        this._renderPromptPreview({ ...studentResult.studentData, currentPeriod }, this._getCurrentSettings());
    },

    /**
     * Rendu HTML du badge de statut d'appréciation pour la période courante du tableau.
     * @param {boolean} hasGenerated - true si une appréciation est générée pour cet élève
     * @returns {string}
     * @private
     */
    _renderCurrentPeriodBadge(hasGenerated) {
        return hasGenerated
            ? '<span class="pending-app-badge is-generated"><iconify-icon icon="solar:check-circle-linear"></iconify-icon> Générée ci-dessous</span>'
            : '<span class="pending-app-badge"><iconify-icon icon="solar:clock-circle-linear"></iconify-icon> En attente</span>';
    },

    /**
     * Updates student context display and prompt preview (no AI call)
     */
    _updateStudentContextAndPrompt() {
        const studentId = DOM.previewStudentSelect?.value;
        if (!studentId) return;

        const cached = this.previewCache?.[studentId];
        if (cached) {
            this._renderPreviewResult(cached);
            this._setGenerateButtonState(cached.stale ? 'dirty' : 'done');
            if (cached.stale) {
                SettingsUIManager.showPreviewRefreshHint();
            } else {
                SettingsUIManager.hidePreviewRefreshHint();
            }
        } else {
            SettingsUIManager.hidePreviewRefreshHint();
            this._renderPreviewEmptyState();
        }

        // Lab uses ONLY demo profiles for consistent, reliable testing
        const studentResult = DEMO_STUDENT_PROFILES.find(r => r.id === studentId);
        if (!studentResult?.studentData) return;

        const data = studentResult.studentData;
        const { periodKeys, currentPeriod } = this._resolveLabPeriod();
        const currentPeriodIndex = periodKeys.indexOf(currentPeriod);

        // Show ALL periods up to current (History + Current)
        const historyRows = periodKeys.slice(0, currentPeriodIndex + 1).map(period => {
            const pData = data.periods?.[period];
            const pGrade = pData?.grade ?? null;
            const isCurrent = period === currentPeriod;

            let pApp;
            let cellTitle = '';
            if (isCurrent) {
                pApp = this._renderCurrentPeriodBadge(Boolean(cached?.appreciation));
            } else if (pData?.appreciation) {
                pApp = pData.appreciation;
                cellTitle = ` title="${pData.appreciation.replace(/"/g, '&quot;')}"`;
            } else {
                pApp = '<span class="empty-val">-</span>';
            }

            const gradeHtml = pGrade !== null
                ? `<span class="grade-bubble ${Utils.getGradeClass(pGrade)}">${pGrade.toFixed(1).replace('.', ',')}</span>`
                : '<span class="empty-val">-</span>';

            return `
                <tr class="preview-row ${isCurrent ? 'is-current' : ''}">
                    <td class="period-cell"><span class="period-name">${period}</span>${isCurrent ? '<span class="current-badge">Actuel</span>' : ''}</td>
                    <td class="grade-cell">${gradeHtml}</td>
                    <td class="lab-app-cell"${cellTitle}>${pApp}</td>
                </tr>
            `;
        }).join('');

        // Display student context
        const studentDataEl = DOM.settingsPreviewStudentData;
        const nameDisplay = document.getElementById('previewStudentNameDisplay');

        if (studentDataEl) {
            const instructions = data.periods?.[currentPeriod]?.context || '';
            const statusBadges = data.statuses?.map(s => {
                const info = Utils.getStatusBadgeInfo(s);
                return `<span class="${info.className}">${info.label}</span>`;
            }).join(' ') || '';

            const newContent = `
                ${statusBadges ? `<div class="preview-statuses">${statusBadges}</div>` : ''}
                ${instructions ? `
                    <div class="preview-context-callout">
                        <span class="preview-context-tag"><iconify-icon icon="solar:notes-linear"></iconify-icon> Contexte</span>
                        <span class="preview-context-text">${instructions}</span>
                    </div>
                ` : ''}
                <table class="preview-history-table">
                    <thead>
                        <tr>
                            <th class="col-period">Période</th>
                            <th class="col-grade">Moyenne</th>
                            <th>Appréciation</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${historyRows}
                    </tbody>
                </table>
            `;

            const currentIndex = DOM.previewStudentSelect.selectedIndex;
            const shouldAnimateSlide = this.lastPreviewIndex !== -1 && currentIndex !== this.lastPreviewIndex;
            const slideOffset = currentIndex < this.lastPreviewIndex ? -15 : 15;
            this.lastPreviewIndex = currentIndex;

            if (!shouldAnimateSlide) {
                studentDataEl.innerHTML = newContent;
                UI.initTooltips();
            } else {
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

                    UI.initTooltips();
                }, 200);
            }
        }

        // [FIX] Sync studentData.currentPeriod with the lab period so the prompt matches the table
        this._renderPromptPreview({ ...data, currentPeriod }, this._getCurrentSettings());
    },

    /**
     * Pistes de résolution selon le message d'erreur de génération.
     * @param {string} message
     * @returns {string}
     * @private
     */
    _getGenerationErrorHint(message) {
        if (/API|key|clé/.test(message)) return 'Vérifiez votre clé API dans Paramètres › IA & Clés.';
        if (/quota|rate|limit/.test(message)) return 'Quota atteint : patientez quelques minutes ou changez de modèle.';
        if (/network|fetch|connexion/.test(message)) return 'Vérifiez votre connexion internet.';
        return 'Réessayez ou vérifiez vos paramètres.';
    },

    async _handlePreviewRefresh() {
        SettingsUIManager.hidePreviewRefreshHint();
        const studentId = DOM.previewStudentSelect?.value;

        // Lab uses ONLY demo profiles
        const studentResult = DEMO_STUDENT_PROFILES.find(r => r.id === studentId);
        if (!studentResult) {
            this._renderPreviewError('Profil introuvable', 'Sélectionnez un autre élève de démonstration.');
            return;
        }

        // Vérifier qu'une clé API est configurée (ou Ollama activé)
        if (!UI.checkAPIKeyPresence(true)) {
            const isOllama = (appState.currentAIModel || '').startsWith('ollama');
            const title = isOllama ? 'Ollama non activé' : 'Clé API manquante';
            const message = isOllama
                ? 'Activez Ollama dans Paramètres › IA & Clés pour utiliser ce modèle local.'
                : 'Configurez une clé API dans Paramètres › IA & Clés pour tester le rendu.';
            this._renderPreviewError(title, message);
            UI.showNotification(message, 'error');
            return;
        }

        this._setGenerateButtonState('loading');
        this._setResultState('loading');
        if (DOM.settingsPreviewResult) {
            DOM.settingsPreviewResult.innerHTML = '<div class="loading-state-centered"><div class="loading-spinner"></div><span>Génération en cours…</span></div>';
        }

        // [FIX] Sync studentData.currentPeriod with the lab period (prompt preview + AI generation)
        const { currentPeriod } = this._resolveLabPeriod();
        const syncedStudentData = { ...studentResult.studentData, currentPeriod };
        const currentSettings = this._getCurrentSettings();
        this._renderPromptPreview(syncedStudentData, currentSettings);

        try {
            const result = await AppreciationsManager.generateAppreciation(syncedStudentData, true, currentSettings);

            // Save to session cache so it persists when navigating back to this student
            const entry = {
                appreciation: result.appreciation,
                modelUsed: result.modelUsed || appState.currentAIModel,
                tokenUsage: {
                    appreciation: result.usage,
                    generationTimeMs: result.generationTimeMs
                }
            };
            this.previewCache[studentId] = entry;

            // L'utilisateur a changé d'élève pendant la génération : résultat conservé en cache uniquement
            if (DOM.previewStudentSelect?.value !== studentId) return;

            await this._renderPreviewResult(entry, { animate: true });

            // Update current period table cell with generated status badge
            const currentAppCell = DOM.settingsPreviewStudentData?.querySelector('.preview-row.is-current .lab-app-cell');
            if (currentAppCell) {
                currentAppCell.innerHTML = this._renderCurrentPeriodBadge(true);
            }

            this._setGenerateButtonState('done');
        } catch (error) {
            const errorMessage = error.message || 'Erreur inconnue';
            UI.showNotification(`Erreur de génération : ${errorMessage}`, 'error');
            if (DOM.previewStudentSelect?.value !== studentId) return;
            this._renderPreviewError('Échec de la génération', errorMessage, this._getGenerationErrorHint(errorMessage));
            this._setGenerateButtonState('idle');
        }
    },

    _setupModalInteractions(addClickListener) {
        DOM.settingsModal.addEventListener('click', (e) => {
            if (e.target === DOM.settingsModal) {
                SettingsUIManager.saveSettings(false);
            }
        });

        // Empêche la prise de focus persistante à la souris sur les boutons du stepper
        DOM.settingsModal.addEventListener('mousedown', (e) => {
            if (e.target.closest?.('.number-spinner-btn')) {
                e.preventDefault();
            }
        });

        // Gestion des boutons d'incrémentation/décrémentation personnalisés
        DOM.settingsModal.addEventListener('click', (e) => {
            const spinnerBtn = e.target.closest('.number-spinner-btn');
            if (!spinnerBtn || spinnerBtn.disabled) return;
            spinnerBtn.blur();

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
            FormUI.updateSpinnerBounds(input);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        DOM.settingsModal.addEventListener('input', (e) => {
            if (e.target?.matches?.('.number-input-wrapper input[type="number"]')) {
                FormUI.updateSpinnerBounds(e.target);
            }
        });

        DOM.settingsModal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation(); // Empêcher le handler global de recevoir cet événement
                SettingsUIManager.saveSettings(false);
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
                        BackupImportManager.showSelectionModal(event.target.result);
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
            btn.innerHTML = '<iconify-icon icon="solar:restart-linear" class="rotate-icon"></iconify-icon> Recherche...';

            try {
                const startTime = Date.now();
                const minDuration = 1800;

                const updateCheckPromise = window.checkForUpdates ? window.checkForUpdates() : Promise.resolve();
                const networkProbePromise = fetch('./version.json?t=' + Date.now()).catch(() => null);

                let currentHash = window.currentBuildHash || '';
                const [_, probeRes] = await Promise.all([
                    updateCheckPromise,
                    networkProbePromise,
                    new Promise((resolve) => {
                        const elapsed = Date.now() - startTime;
                        const remaining = Math.max(0, minDuration - elapsed);
                        setTimeout(resolve, remaining);
                    })
                ]);

                if (probeRes && probeRes.ok) {
                    try {
                        const probeData = await probeRes.clone().json();
                        if (probeData?.hash) {
                            currentHash = probeData.hash;
                            window.currentBuildHash = currentHash;
                        }
                    } catch {
                        // ignore json parse error
                    }
                }

                const isUpdateAvailable = window.appState?.isUpdateAvailable;

                if (isUpdateAvailable) {
                    btn.innerHTML = '<iconify-icon icon="solar:download-minimalistic-bold" style="color: var(--primary-color);"></iconify-icon> Mise à jour dispo !';
                    UI.showNotification("Une nouvelle version est disponible !", "info", 4000, { icon: 'solar:download-minimalistic-linear' });
                    await new Promise((r) => setTimeout(r, 1600));
                } else {
                    btn.innerHTML = '<iconify-icon icon="solar:check-circle-bold" style="color: var(--success-color);"></iconify-icon> À jour !';
                    const buildInfo = currentHash ? ` (Build ${currentHash})` : '';
                    UI.showNotification(`Votre application est à jour${buildInfo}.`, "success");
                    await new Promise((r) => setTimeout(r, 1400));
                }
            } catch (e) {
                console.error("Update check failed", e);
                btn.innerHTML = '<iconify-icon icon="solar:danger-triangle-bold" style="color: var(--warning-color);"></iconify-icon> Erreur';
                UI.showNotification("Impossible de vérifier les mises à jour.", "warning");
                await new Promise((r) => setTimeout(r, 1400));
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalContent;
                const badge = btn.querySelector('#settingsBuildBadge');
                if (badge && window.currentBuildHash) {
                    badge.textContent = window.currentBuildHash;
                }
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

        addClickListener(DOM.closeSettingsModalBtn, () => SettingsUIManager.saveSettings(false));

        // Cloud sync - Google Drive connection
        if (DOM.connectGoogleBtn) {
            DOM.connectGoogleBtn.addEventListener('click', async () => {
                try {
                    DOM.connectGoogleBtn.innerHTML = '<span class="icon-spin-wrapper"><iconify-icon icon="logos:google-drive"></iconify-icon></span> Connexion...';
                    DOM.connectGoogleBtn.disabled = true;

                    // Dynamic import of SyncService
                    const { SyncService } = await import('../../services/SyncService.js');
                    const connected = await SyncService.connect('google');

                    if (connected) {
                        await this.updateCloudSyncUI();
                        UI.showNotification('Google Drive connecté ! Utilisez les boutons Sauvegarder/Charger.', 'success');
                    } else {
                        await this.updateCloudSyncUI();
                        DOM.connectGoogleBtn.disabled = false;
                        UI.showNotification('Connexion annulée.', 'warning');
                    }
                } catch (error) {
                    console.error('Google sync connection error:', error);
                    await this.updateCloudSyncUI();
                    DOM.connectGoogleBtn.disabled = false;
                    const errorMsg = error?.message || error?.result?.error?.message || 'Erreur inconnue';
                    UI.showNotification('Erreur de connexion : ' + errorMsg, 'error');
                }
            });
        }

        // Cloud Save / Restore (orchestration partagée avec le menu principal)
        const bindSettingsCloudAction = (btn, action, onSuccess) => {
            if (!btn) return;
            const restHtml = btn.innerHTML;
            const onProgress = (label) => {
                btn.disabled = Boolean(label);
                btn.innerHTML = label
                    ? `<iconify-icon icon="ph:spinner-gap-bold" class="rotate-icon"></iconify-icon> ${label}`
                    : restHtml;
            };
            btn.addEventListener('click', async () => {
                if (await action({ onProgress })) {
                    onSuccess();
                } else {
                    this.updateCloudSyncUI();
                }
            });
        };

        bindSettingsCloudAction(
            document.getElementById('cloudSaveBtn'),
            (hooks) => CloudActionsManager.save(hooks),
            () => refreshDataTab()
        );
        bindSettingsCloudAction(
            document.getElementById('cloudLoadBtn'),
            (hooks) => CloudActionsManager.restore(hooks),
            () => refreshDataTab()
        );

        // --- Copie de sécurité pré-restauration dans les Paramètres > Données ---
        const preRestoreCard = document.getElementById('preRestoreSnapshotCard');
        const preRestoreInfo = document.getElementById('preRestoreSnapshotInfo');
        const restoreSnapshotBtn = document.getElementById('restoreSnapshotBtn');
        const discardSnapshotBtn = document.getElementById('discardSnapshotBtn');

        const updatePreRestoreCard = async () => {
            if (!preRestoreCard) return;
            try {
                const snapshot = await StorageManager.getPreRestoreSnapshot();
                if (snapshot && snapshot.generatedResults?.length > 0) {
                    const count = Utils.countUniqueStudents(snapshot.generatedResults, snapshot.classes);
                    const dateStr = snapshot.createdAt
                        ? new Date(snapshot.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                        : '';
                    if (preRestoreInfo) {
                        preRestoreInfo.textContent = `Sauvegardé automatiquement avant la dernière restauration : ${count} élève${count > 1 ? 's' : ''}${dateStr ? ` (${dateStr})` : ''}.`;
                    }
                    preRestoreCard.style.display = 'flex';
                } else {
                    preRestoreCard.style.display = 'none';
                }
            } catch {
                preRestoreCard.style.display = 'none';
            }
        };

        const refreshDataTab = () => {
            updatePreRestoreCard();
            this.updateCloudSyncUI();
        };

        document.addEventListener('settings-modal-open', refreshDataTab);
        document.addEventListener('settings-data-tab-open', refreshDataTab);
        document.addEventListener('app-data-restored', refreshDataTab);
        document.addEventListener('sync-status-changed', () => this.updateCloudSyncUI());

        const dataTabBtn = document.querySelector('button[onclick*="settings-data"]');
        if (dataTabBtn) {
            dataTabBtn.addEventListener('click', refreshDataTab);
        }

        if (restoreSnapshotBtn) {
            restoreSnapshotBtn.addEventListener('click', async () => {
                const snapshot = await StorageManager.getPreRestoreSnapshot();
                if (!snapshot) {
                    UI.showNotification('Aucune copie de sécurité disponible.', 'warning');
                    updatePreRestoreCard();
                    return;
                }
                const count = Utils.countUniqueStudents(snapshot.generatedResults, snapshot.classes);
                const confirmed = await UI.showCustomConfirm(
                    `Restaurer l'état précédent (<strong>${count} élève${count > 1 ? 's' : ''}</strong>) ?<br><br>Vos données actuelles seront remplacées par cette copie.`,
                    null, null,
                    {
                        title: 'Restaurer la copie antérieure ?',
                        confirmText: 'Restaurer',
                        cancelText: 'Annuler',
                        isDanger: false
                    }
                );
                if (confirmed && await CloudActionsManager.undoRestore()) {
                    refreshDataTab();
                }
            });
        }

        if (discardSnapshotBtn) {
            discardSnapshotBtn.addEventListener('click', async () => {
                await StorageManager.clearPreRestoreSnapshot();
                updatePreRestoreCard();
                UI.showNotification('Copie de sécurité supprimée.', 'info');
            });
        }

        // Cloud sync - Google Drive DISCONNECTION
        if (DOM.disconnectGoogleBtn) {
            DOM.disconnectGoogleBtn.addEventListener('click', async () => {
                try {
                    DOM.disconnectGoogleBtn.innerHTML = '<iconify-icon icon="ph:spinner-gap-bold" class="rotate-icon"></iconify-icon> <span>Déconnexion...</span>';
                    DOM.disconnectGoogleBtn.disabled = true;

                    const { SyncService } = await import('../../services/SyncService.js');
                    await SyncService.disconnect();

                    await this.updateCloudSyncUI();
                    UI.showNotification('Déconnecté de Google Drive.', 'info');
                } catch (error) {
                    console.error('Google sync disconnection error:', error);
                    DOM.disconnectGoogleBtn.innerHTML = '<iconify-icon icon="solar:logout-2-linear"></iconify-icon> <span>Déconnecter</span>';
                    DOM.disconnectGoogleBtn.disabled = false;
                    const errorMsg = error?.message || error?.result?.error?.message || 'Erreur inconnue';
                    UI.showNotification('Erreur de déconnexion : ' + errorMsg, 'error');
                }
            });
        }
    },

    /**
     * Updates the Google Drive Cloud Sync UI state (account name, email, badge, buttons, and actions row).
     */
    async updateCloudSyncUI() {
        try {
            const { SyncService } = await import('../../services/SyncService.js');
            const connectionState = SyncService.getConnectionState?.() || (SyncService.isConnected() ? 'connected' : 'disconnected');
            const isConfigured = connectionState !== 'disconnected';
            const connectBtn = DOM.connectGoogleBtn || document.getElementById('connectGoogleBtn');
            const disconnectBtn = DOM.disconnectGoogleBtn || document.getElementById('disconnectGoogleBtn');
            const statusBadge = DOM.googleSyncStatus || document.getElementById('googleSyncStatus');
            const titleBadge = DOM.googleSyncBadge || document.getElementById('googleSyncBadge');
            const nameEl = DOM.googleSyncName || document.getElementById('googleSyncName');
            const emailEl = DOM.googleSyncEmail || document.getElementById('googleSyncEmail');
            const cloudActionsBar = document.getElementById('cloudActionsBar');
            const lastSaveEl = document.getElementById('cloudLastSave');

            if (isConfigured) {
                if (titleBadge) {
                    titleBadge.style.display = 'inline-flex';
                    const badgeVariant = connectionState === 'connected' ? 'data-badge-success' : connectionState === 'local' ? 'data-badge-neutral' : 'data-badge-warning';
                    const badgeLabel = connectionState === 'connected' ? 'Connecté' : connectionState === 'local' ? 'Mode hors-ligne' : 'Session expirée';
                    titleBadge.className = `data-badge ${badgeVariant}`;
                    titleBadge.innerHTML = `<span class="data-badge-dot"></span>${badgeLabel}`;
                }
                // Masquer le badge en double à côté du nom de l'utilisateur
                if (statusBadge) statusBadge.style.display = 'none';

                // Fetch account profile
                const userInfo = await SyncService.getUserInfo().catch(() => null);
                if (nameEl) {
                    nameEl.textContent = userInfo?.displayName || 'Compte Google Drive';
                }
                if (emailEl) {
                    emailEl.textContent = userInfo?.email || (connectionState === 'connected' ? 'Compte connecté' : connectionState === 'local' ? 'Connexion réseau indisponible' : 'Reconnexion automatique à la prochaine action');
                }

                if (connectBtn) {
                    const isExpired = connectionState === 'expired';
                    connectBtn.style.display = isExpired ? 'inline-flex' : 'none';
                    connectBtn.disabled = false;
                    connectBtn.innerHTML = `<iconify-icon icon="logos:google-drive"></iconify-icon> ${isExpired ? 'Reconnecter' : 'Connecter'}`;
                }
                if (disconnectBtn) {
                    disconnectBtn.style.display = 'inline-flex';
                    disconnectBtn.disabled = false;
                    disconnectBtn.innerHTML = '<iconify-icon icon="solar:logout-2-linear"></iconify-icon> <span>Déconnecter</span>';
                }
                if (cloudActionsBar) cloudActionsBar.style.display = 'flex';

                if (lastSaveEl && SyncService.lastSyncTime) {
                    const date = new Date(SyncService.lastSyncTime);
                    const formatted = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' à ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    lastSaveEl.textContent = `Dernière sauvegarde : ${formatted}`;
                } else if (lastSaveEl && !lastSaveEl.textContent) {
                    lastSaveEl.textContent = 'Prêt à synchroniser';
                }
            } else {
                if (titleBadge) titleBadge.style.display = 'none';
                if (statusBadge) {
                    statusBadge.textContent = 'Non connecté';
                    statusBadge.className = 'provider-status';
                }
                if (nameEl) {
                    nameEl.textContent = 'Google Drive';
                }
                if (emailEl) {
                    emailEl.textContent = 'Sauvegardez vos données en associant votre compte Google';
                }
                if (connectBtn) {
                    connectBtn.style.display = 'inline-flex';
                    connectBtn.disabled = false;
                    connectBtn.innerHTML = '<iconify-icon icon="logos:google-drive"></iconify-icon> Connecter';
                }
                if (disconnectBtn) {
                    disconnectBtn.style.display = 'none';
                }
                if (cloudActionsBar) {
                    cloudActionsBar.style.display = 'none';
                }
            }
        } catch (e) {
            console.warn('[SettingsModal] Error updating cloud sync UI:', e);
        }
    }
};
