/**
 * @fileoverview Import Wizard Modal Manager
 * 3-step wizard: Data input → Mapping → Confirm
 * Now includes Hub Modal for unified entry point
 * @module managers/ImportWizardManager
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { detectSeparator, parseLine, detectVerticalFormat, convertVerticalToTabular } from '../utils/ImportUtils.js';
import { autoConvertPdf } from '../utils/PdfParsers.js';
import { UI } from './UIManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { ClassManager } from './ClassManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { HistoryManager } from './HistoryManager.js';

/**
 * Import Wizard Manager
 * @namespace ImportWizardManager
 */
export const ImportWizardManager = {
    currentStep: 1,
    state: {
        newStudents: [],
        updatedStudents: [],
        departedStudents: [],
        hasHeader: false,
        currentSource: null // 'file', 'text', 'sample'
    },

    /**
     * Initialize the wizard
     */
    init() {
        this._bindHubEvents();
        this._bindEvents();
    },

    /**
     * Bind Hub Modal events
     */
    _bindHubEvents() {
        const backdrop = document.getElementById('importHubBackdrop');
        if (!backdrop) return;

        // Also open hub from FAB button
        const fabBtn = document.getElementById('addStudentFab');
        fabBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openHub();
        });

        // Close hub
        document.getElementById('importHubCloseBtn')?.addEventListener('click', () => this.closeHub());

        // Close on backdrop click
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) this.closeHub();
        });

        // Choice cards
        backdrop.querySelectorAll('.import-hub-card').forEach(card => {
            card.addEventListener('click', () => {
                const action = card.dataset.action;
                this.closeHub();

                // Delay to allow Hub closing animation to complete (400ms + buffer)
                // Prevents Focus Panel from appearing under the closing backdrop on mobile
                const delay = action === 'individual' ? 450 : 0;

                setTimeout(() => {
                    if (action === 'individual') {
                        FocusPanelManager.openNew();
                    } else if (action === 'mass') {
                        this.open();
                    }
                }, delay);
            });

            // Keyboard support
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.click();
                }
            });
        });

        // Escape key closes hub
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && backdrop.classList.contains('active')) {
                this.closeHub();
            }
        });
    },

    /**
     * Open the Hub Modal
     * Requires at least one class to exist
     */
    openHub() {
        // Check if any classes exist first
        if (ClassManager.getAllClasses().length === 0) {
            UI.showNotification('Créez d\'abord une classe avant d\'ajouter des élèves', 'warning');
            ClassUIManager.openDropdown();
            setTimeout(() => ClassUIManager.showNewClassPrompt(), 100);
            return;
        }

        const backdrop = document.getElementById('importHubBackdrop');
        if (backdrop) {
            // [UX Mobile] Push History State
            HistoryManager.pushState('importHub', (options) => this.closeHub(options));

            backdrop.classList.add('active');
            document.body.style.overflow = 'hidden';

            // Focus first card for accessibility
            setTimeout(() => {
                backdrop.querySelector('.import-hub-card')?.focus();
            }, 100);
        }
    },

    /**
     * Close the Hub Modal
     */
    closeHub(options = {}) {
        const backdrop = document.getElementById('importHubBackdrop');
        if (backdrop) {
            // [UX Mobile] History Cleanup
            if (!options.causedByHistory && backdrop.classList.contains('active')) {
                HistoryManager.handleManualClose('importHub');
            }

            backdrop.classList.remove('active');
            document.body.style.overflow = '';
        }
    },

    /**
     * Bind all wizard events
     */
    _bindEvents() {
        const modal = document.getElementById('importWizardModal');
        if (!modal) return;

        // Note: openImportPanelBtn now opens Hub, not wizard directly (handled in _bindHubEvents)

        // Close buttons
        document.getElementById('closeImportWizardBtn')?.addEventListener('click', () => this.close());
        document.getElementById('wizardStep1CancelBtn')?.addEventListener('click', () => this.close());

        // Step 1 Next button
        document.getElementById('wizardStep1NextBtn')?.addEventListener('click', () => this.nextStep());

        // Step 2 navigation buttons
        document.getElementById('wizardStep2PrevBtn')?.addEventListener('click', () => this.prevStep());
        document.getElementById('wizardStep2NextBtn')?.addEventListener('click', () => this.nextStep());

        // Step 3 Prev button
        document.getElementById('wizardStep3PrevBtn')?.addEventListener('click', () => this.prevStep());

        // STEPPER NAVIGATION - Clickable steps
        document.querySelectorAll('.import-wizard-stepper .wizard-step[role="button"]').forEach(stepEl => {
            stepEl.addEventListener('click', () => {
                const targetStep = parseInt(stepEl.dataset.step);
                if (targetStep && targetStep !== this.state.currentStep) {
                    // Only allow going back, or forward if valid
                    if (targetStep < this.state.currentStep) {
                        this._setStep(targetStep);
                    } else if (targetStep === this.state.currentStep + 1 && this._canProceedToNextStep()) {
                        this._setStep(targetStep);
                    }
                }
            });
        });

        // Step 1: Drop zone
        const dropZone = document.getElementById('wizardDropZone');
        if (dropZone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => {
                dropZone.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); });
            });
            ['dragenter', 'dragover'].forEach(e => {
                dropZone.addEventListener(e, () => dropZone.classList.add('dragging'));
            });
            ['dragleave', 'drop'].forEach(e => {
                dropZone.addEventListener(e, () => dropZone.classList.remove('dragging'));
            });
            dropZone.addEventListener('drop', e => {
                if (e.dataTransfer.files.length > 0) this._handleFile(e.dataTransfer.files[0]);
            });
            dropZone.addEventListener('click', () => document.getElementById('wizardFileInput')?.click());
        }

        document.getElementById('wizardFileInput')?.addEventListener('change', e => {
            if (e.target.files.length > 0) {
                this._handleFile(e.target.files[0]);
                // Reset input to allow re-selecting the same file
                e.target.value = '';
            }
        });

        // Step 1: Textarea
        document.getElementById('wizardDataTextarea')?.addEventListener('input',
            Utils.debounce(() => {
                // Determine if this is a manual paste/edit
                const currentText = document.getElementById('wizardDataTextarea')?.value;
                if (currentText && !this.state.currentSource) {
                    this._setDropZone('text');
                } else if (!currentText) {
                    this._resetFile();
                }
                this._processData();
            }, 300));

        // Step 1: Sample data (button in guide panel)
        document.getElementById('guideSampleBtn')?.addEventListener('click', () => this._loadSample());



        // Step 1: Remove file button
        document.getElementById('wizardRemoveFileBtn')?.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent drop zone click
            this._resetFile();
        });

        // Step 2: Separator change - reparse with user-selected separator
        document.getElementById('wizardSeparatorSelect')?.addEventListener('change', () => this._reparseWithSelectedSeparator());

        // Step 2: "Détection auto" button - forces re-detection of column types
        document.getElementById('wizardAutoDetectBtn')?.addEventListener('click', () => {
            this._forceAutoDetect();
            UI.showNotification('Détection automatique relancée', 'info');
        });

        // Step 3: Import button (single action)
        document.getElementById('wizardImportOnlyBtn')?.addEventListener('click', () => this._importOnly());

        // Close on backdrop click
        modal.addEventListener('click', e => {
            if (e.target === modal) this.close();
        });

        // Escape key
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                this.close();
            }
        });
    },

    /**
     * Open the wizard modal
     * Requires at least one class to exist
     */
    open() {
        // Check if any classes exist first
        if (ClassManager.getAllClasses().length === 0) {
            UI.showNotification('Créez d\'abord une classe avant d\'importer des élèves', 'warning');
            ClassUIManager.openDropdown();
            setTimeout(() => ClassUIManager.showNewClassPrompt(), 100);
            return;
        }

        const modal = document.getElementById('importWizardModal');
        if (modal) {
            this.currentStep = 1;
            this._updateUI();
            this._updateHeaderPeriodBadge(); // Show current period in guide
            this._updateClassBadge(); // Show current class name in header
            UI.openModal(modal);
        }
    },

    /**
     * Update the class name badge in the wizard header
     * @private
     */
    _updateClassBadge() {
        const badge = document.getElementById('wizardClassBadge');
        if (!badge) return;

        const currentClass = ClassManager.getCurrentClass();
        badge.textContent = currentClass?.name || '';
    },

    /**
     * Update the period badge in the guide panel
     * Shows the full period label (Semestre 1, Trimestre 2, etc.) for clarity
     * @private
     */
    _updateHeaderPeriodBadge() {
        const periodCode = appState.currentPeriod || 'S1';
        let label = periodCode;

        // Convert short codes to full labels
        if (periodCode.startsWith('S')) {
            label = `Semestre ${periodCode.substring(1)}`;
        } else if (periodCode.startsWith('T')) {
            label = `Trimestre ${periodCode.substring(1)}`;
        }

        // Update guide panel badge
        const guideBadge = document.getElementById('guidePeriodBadge');
        if (guideBadge) guideBadge.textContent = label;
    },

    /**
     * Open the wizard modal with pre-filled data
     * Requires at least one class to exist
     * @param {string} dataText - The data to pre-fill in the textarea
     */
    openWithData(dataText) {
        // Check if any classes exist first
        if (ClassManager.getAllClasses().length === 0) {
            UI.showNotification('Créez d\'abord une classe avant d\'importer des élèves', 'warning');
            ClassUIManager.openDropdown();
            setTimeout(() => ClassUIManager.showNewClassPrompt(), 100);
            return;
        }

        const modal = document.getElementById('importWizardModal');
        if (modal) {
            this.currentStep = 1;
            this._updateUI();
            UI.openModal(modal);

            // Pre-fill the textarea with sample data
            const textarea = document.getElementById('wizardDataTextarea');
            if (textarea && dataText) {
                textarea.value = dataText;
                this._processData();
            }
        }
    },

    /**
     * Close the wizard modal
     */
    close() {
        const modal = document.getElementById('importWizardModal');
        if (modal) {
            UI.closeModal(modal);
            this._reset();
        }
    },

    /**
     * Go to next step
     */
    nextStep() {
        if (this.currentStep === 1 && !this.state.rawData) {
            UI.showNotification('Veuillez entrer des données à importer', 'warning');
            return;
        }
        if (this.currentStep < 3) {
            this.currentStep++;
            this._updateUI();
        }
    },

    /**
     * Go to previous step
     */
    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this._updateUI();
        }
    },

    /**
     * Go to specific step (public method)
     */
    goToStep(step) {
        if (step >= 1 && step <= 3) {
            this.currentStep = step;
            this._updateUI();
        }
    },

    /**
     * Set step (internal alias)
     * @private
     */
    _setStep(step) {
        this.goToStep(step);
    },

    /**
     * Check if we can proceed to next step
     * @private
     */
    _canProceedToNextStep() {
        if (this.currentStep === 1) {
            return this.state.lines && this.state.lines.length > 0;
        }
        if (this.currentStep === 2) {
            return this.state.columnCount > 0;
        }
        return false;
    },

    /**
     * Update UI based on current step
     */
    _updateUI() {
        // Update stepper visual states
        document.querySelectorAll('.import-wizard-stepper .wizard-step').forEach(el => {
            const step = parseInt(el.dataset.step);
            el.classList.remove('active', 'completed');
            if (step === this.currentStep) el.classList.add('active');
            if (step < this.currentStep) el.classList.add('completed');
        });

        // Update stepper arrows
        const prevArrow = document.getElementById('wizardStepperPrev');
        const nextArrow = document.getElementById('wizardStepperNext');
        if (prevArrow) prevArrow.disabled = this.currentStep <= 1;
        if (nextArrow) {
            nextArrow.disabled = this.currentStep >= 3;
            // Change icon on last step to show it's the end
            const icon = nextArrow.querySelector('i');
            if (icon && this.currentStep >= 3) {
                icon.className = 'fas fa-check';
            } else if (icon) {
                icon.className = 'fas fa-chevron-right';
            }
        }

        // Update step content - scope to modal only
        const modal = document.getElementById('importWizardModal');
        if (modal) {
            modal.querySelectorAll('.wizard-step-content').forEach((el, i) => {
                const isActive = i + 1 === this.currentStep;
                el.classList.toggle('active', isActive);
                el.style.display = isActive ? 'block' : 'none';
            });
        }

        // Update Step 3 action buttons visibility
        const step3Actions = document.getElementById('wizardStep3Actions');
        if (step3Actions) {
            step3Actions.style.display = this.currentStep === 3 ? 'flex' : 'none';
        }

        // Update guide panel content based on current step
        this._updateGuidePanel();

        // Update preview if on step 3
        if (this.currentStep === 3) {
            this._updatePreview();
        }
    },

    /**
     * Update the guide panel to show contextual content for current step
     * @private
     */
    _updateGuidePanel() {
        const guideContents = document.querySelectorAll('.guide-content');
        guideContents.forEach(content => {
            const step = parseInt(content.dataset.guideStep);
            content.classList.toggle('active', step === this.currentStep);
        });
    },

    /**
     * Handle file drop/select
     */
    async _handleFile(file) {
        const dropZone = document.getElementById('wizardDropZone');
        const statusText = document.getElementById('wizardStatusText');


        // Update file info in UI
        this._setDropZone('file', file.name, file);

        // Helper to show/hide loading state
        const setLoading = (loading, text = 'Extraction du PDF...') => {
            if (dropZone) dropZone.classList.toggle('loading', loading);
            if (statusText) statusText.textContent = text;
        };

        // Gestion des PDFs avec extraction de texte
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            try {
                setLoading(true, 'Extraction du PDF...');

                const { extractTextFromPdf } = await import('../utils/PdfUtils.js');
                const textContent = await extractTextFromPdf(file);

                document.getElementById('wizardDataTextarea').value = textContent;
                this._animateTextUpdate();
                setLoading(false);
                this._processData();
                // No success notification - badge in footer provides feedback
            } catch (error) {
                console.error('Erreur extraction PDF:', error);
                setLoading(false);
                UI.showNotification('Erreur PDF: ' + error.message, 'error');
            }
            return;
        }


        // Fichiers texte standard
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById('wizardDataTextarea').value = e.target.result;
            this._animateTextUpdate();
            this._processData();
        };
        reader.readAsText(file);
    },

    /**
     * Update drop zone UI state 
     * @param {string} type - 'file' | 'text' | 'sample'
     * @param {string} name - Display name
     * @param {File} file - Optional file object for icon detection
     */
    _setDropZone(type, name = null, file = null) {
        const dropZoneEmpty = document.getElementById('wizardDropZoneEmpty');
        const dropZoneFilled = document.getElementById('wizardDropZoneFilled');
        const fileNameEl = document.getElementById('wizardFileName');
        const fileIconEl = document.getElementById('wizardFileIcon');

        this.state.currentSource = type;

        if (dropZoneFilled) {
            dropZoneEmpty.style.display = 'none';
            dropZoneFilled.style.display = 'block';

            // Set Drop Zone State Class
            const dropZone = document.getElementById('wizardDropZone');
            if (dropZone) dropZone.classList.add('has-file');

            // Set Name
            let displayName = name;
            if (!displayName) {
                if (type === 'text') displayName = 'Saisie manuelle / Coller';
                if (type === 'sample') displayName = 'Données d\'exemple';
            }
            if (fileNameEl) fileNameEl.textContent = displayName;

            // Set Icon
            if (fileIconEl) {
                fileIconEl.className = 'file-preview-icon'; // Reset class
                fileIconEl.innerHTML = ''; // Reset content

                if (type === 'file' && file) {
                    // File Logic
                    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                        fileIconEl.classList.add('type-pdf');
                        fileIconEl.innerHTML = '<i class="fas fa-file-pdf"></i>';
                    } else if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
                        fileIconEl.classList.add('type-excel');
                        fileIconEl.innerHTML = '<i class="fas fa-file-excel"></i>';
                    } else {
                        fileIconEl.innerHTML = '<i class="fas fa-file-alt"></i>';
                    }
                } else if (type === 'text') {
                    // Text Logic
                    fileIconEl.classList.add('type-text');
                    fileIconEl.innerHTML = '<i class="fas fa-keyboard"></i>';
                } else if (type === 'sample') {
                    // Sample logic
                    fileIconEl.classList.add('type-sample');
                    fileIconEl.innerHTML = '<i class="fas fa-table"></i>';
                }
            }
        }
    },

    /**
     * Reset file UI to empty state
     */
    _resetFileUI() {
        const dropZoneEmpty = document.getElementById('wizardDropZoneEmpty');
        const dropZoneFilled = document.getElementById('wizardDropZoneFilled');
        const fileInput = document.getElementById('wizardFileInput');
        const dropZone = document.getElementById('wizardDropZone');
        const badgeSlot = document.getElementById('wizardFileBadgeSlot');

        // Check if we need to animate exit (only if filled is currently visible)
        if (dropZoneFilled && dropZoneFilled.style.display !== 'none') {
            dropZoneFilled.classList.add('is-exiting');

            // Wait for animation (250ms)
            setTimeout(() => {
                if (dropZoneEmpty) dropZoneEmpty.style.display = 'flex';
                if (dropZoneFilled) {
                    dropZoneFilled.style.display = 'none';
                    dropZoneFilled.classList.remove('is-exiting');
                }
                // Remove class from parent
                if (dropZone) dropZone.classList.remove('has-file');
                if (badgeSlot) badgeSlot.innerHTML = '';
            }, 250);
        } else {
            // Instant reset (initial state or already hidden)
            if (dropZoneEmpty) dropZoneEmpty.style.display = 'flex';
            if (dropZoneFilled) dropZoneFilled.style.display = 'none';
            if (dropZone) dropZone.classList.remove('has-file');
            if (badgeSlot) badgeSlot.innerHTML = '';
        }

        if (fileInput) fileInput.value = '';
    },

    /**
     * Full reset of file and data
     */
    _resetFile() {
        // Clear textarea
        const textarea = document.getElementById('wizardDataTextarea');
        if (textarea) textarea.value = '';

        // Reset UI
        this._resetFileUI();

        // Process empty data to clear state
        this.state.currentSource = null;
        this._processData();
    },

    /**
     * Load sample data from shared source
     */
    _loadSample() {
        import('../data/SampleData.js').then(({ getSampleImportData }) => {
            const sample = getSampleImportData();

            // Set UI state first
            this._setDropZone('sample');

            const textarea = document.getElementById('wizardDataTextarea');
            if (textarea) {
                textarea.value = sample;
                this._animateTextUpdate();
            }

            this._processData();
        });
    },

    /**
     * Trigger text arrival animation
     * Uses standard 'text-blur-reveal' from animations.css
     * @private
     */
    _animateTextUpdate() {
        const textarea = document.getElementById('wizardDataTextarea');

        if (textarea) {
            textarea.classList.remove('text-blur-reveal'); // Reset
            // Force reflow to restart animation
            void textarea.offsetWidth;
            textarea.classList.add('text-blur-reveal');
        }
    },

    /**
     * Process data from textarea
     */
    _processData() {
        let text = document.getElementById('wizardDataTextarea')?.value?.trim() || '';

        // Reset detected format
        this.state.detectedFormat = null;

        // Auto-détection et conversion des formats PDF (architecture modulaire)
        const pdfResult = text ? autoConvertPdf(text) : null;
        if (pdfResult) {
            text = pdfResult.data;
            const textarea = document.getElementById('wizardDataTextarea');
            if (textarea) textarea.value = text;
            // No notification - badge in footer provides visual feedback
            // Store detected format for badge AND for format-aware column detection
            this.state.detectedFormat = {
                type: pdfResult.name.includes('mbn') ? 'mbn' : 'pronote',
                name: pdfResult.description,
                parserName: pdfResult.name // Full parser name for intelligent mapping
            };
        }
        // Auto-détection et conversion du format vertical multi-lignes
        else if (text && detectVerticalFormat(text)) {
            text = convertVerticalToTabular(text);
            const textarea = document.getElementById('wizardDataTextarea');
            if (textarea) textarea.value = text;
            // No notification - badge provides feedback
            this.state.detectedFormat = { type: 'vertical', name: 'Format vertical Pronote' };
        }

        // Update format badge visibility
        this._updateFormatBadge();

        this.state.rawData = text;

        const step1NextBtn = document.getElementById('wizardStep1NextBtn');
        const clearBtn = document.getElementById('wizardClearBtn');

        // Toggle clear button visibility
        if (clearBtn) clearBtn.style.display = text ? 'inline-flex' : 'none';

        if (!text) {
            this.state.lines = [];
            // Disable Step 1 Next button when no data
            if (step1NextBtn) step1NextBtn.disabled = true;
            return;
        }

        // Auto-detect separator and update the select
        const detectedSep = detectSeparator(text);
        this._updateSeparatorSelect(detectedSep);

        const separator = detectedSep;
        this.state.separator = separator;

        const rawLines = text.split('\n').filter(l => l.trim());
        this.state.lines = rawLines.map(l => parseLine(l, separator));
        this.state.columnCount = Math.max(...this.state.lines.map(l => l.length));

        // Enable Step 1 Next button when we have data
        if (step1NextBtn) step1NextBtn.disabled = this.state.lines.length === 0;

        // Update Step 1 line count indicator (in footer)
        const lineCountContainer = document.getElementById('wizardStep1LineCount');
        const lineCountBadge = document.getElementById('wizardLineCountBadge');
        if (lineCountContainer && lineCountBadge) {
            if (this.state.lines.length > 0) {
                lineCountBadge.textContent = this.state.lines.length;
                lineCountContainer.style.display = 'flex';
            } else {
                lineCountContainer.style.display = 'none';
            }
        }

        // Build mapping table
        this._buildMappingTable();

        // Step 1 Preview (Magic Pills)
        this._updateStep1Preview();

        // Warn if only 1 column detected (likely wrong separator)
        this._checkSingleColumnWarning();
    },

    /**
     * Check and show warning if only 1 column is detected
     * @private
     */
    _checkSingleColumnWarning() {
        let warningEl = document.getElementById('wizardSingleColumnWarning');

        if (this.state.columnCount === 1 && this.state.lines.length > 0) {
            if (!warningEl) {
                warningEl = document.createElement('div');
                warningEl.id = 'wizardSingleColumnWarning';
                warningEl.className = 'mapping-warning';
                const preview = document.getElementById('wizardStep1Preview');
                preview?.insertAdjacentElement('afterend', warningEl);
            }
            warningEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Une seule colonne détectée. Essayez un autre séparateur.`;
            warningEl.style.display = 'flex';
        } else if (warningEl) {
            warningEl.style.display = 'none';
        }
    },

    /**
     * Update the visual format detection badge
     * Shows when MBN, Pronote or other formats are detected
     * Badge is now displayed in the footer for better UX
     * @private
     */
    /**
     * Update the visual format detection badge
     * Shows when MBN, Pronote or other formats are detected
     * Badge is now displayed in the drop zone
     * @private
     */
    _updateFormatBadge() {
        // Reuse existing slot in drop zone if available, else create new one there
        const badgeSlot = document.getElementById('wizardFileBadgeSlot');

        // Clear existing badge
        if (badgeSlot) badgeSlot.innerHTML = '';

        if (!this.state.detectedFormat || !badgeSlot) {
            return;
        }

        const format = this.state.detectedFormat;
        const badge = document.createElement('div');

        const icons = {
            'mbn': 'fa-school',
            'pronote': 'fa-graduation-cap',
            'vertical': 'fa-list'
        };
        const icon = icons[format.type] || 'fa-file-lines';

        badge.innerHTML = `<i class="fas ${icon}"></i> ${format.name}`;
        badge.className = `format-detection-badge format-${format.type}`;

        badgeSlot.appendChild(badge);
    },

    /**
     * Update separator select to match detected value
     * @param {string} separator - The detected separator
     */
    _updateSeparatorSelect(separator) {
        const select = document.getElementById('wizardSeparatorSelect');
        if (!select) return;

        // Map separator to select value
        if (separator === '\t') {
            select.value = 'tab';
        } else if (['|', ';', ','].includes(separator)) {
            select.value = separator;
        } else {
            select.value = 'tab'; // Default fallback
        }
    },

    /**
     * Reparse data with the user-selected separator (no auto-detection)
     * Called when user manually changes the separator dropdown
     * @private
     */
    _reparseWithSelectedSeparator() {
        const text = this.state.rawData;
        if (!text) return;

        // Use the user-selected separator instead of auto-detecting
        const separator = this._getSeparator();
        this.state.separator = separator;

        const rawLines = text.split('\n').filter(l => l.trim());
        this.state.lines = rawLines.map(l => parseLine(l, separator));
        this.state.columnCount = Math.max(...this.state.lines.map(l => l.length));

        // Rebuild mapping table with new column structure
        this._buildMappingTable();

        // Update preview pills
        this._updateStep1Preview();
    },

    /**
     * Update Step 1 visual feedback (Mapping Pills)
     * @private
     */
    _updateStep1Preview() {
        const container = document.getElementById('wizardStep1Preview');
        const pillsContainer = document.getElementById('wizardPreviewPills');
        const countEl = document.getElementById('wizardPreviewCount');
        const sepEl = document.getElementById('wizardPreviewSeparator');

        if (!container || !pillsContainer || this.state.lines.length === 0) {
            if (container) container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        countEl.textContent = this.state.lines.length;

        const separatorNames = { '\t': 'Tabulation', '|': 'Barre (|)', ';': 'Point-virgule', ',': 'Virgule' };
        sepEl.textContent = separatorNames[this.state.separator] || 'Autre';

        // Detect header (auto-detection only now)
        const firstLine = this.state.lines[0];
        this.state.hasHeader = this._detectHeader(firstLine);

        // Guess types for pills
        const sampleLine = this.state.hasHeader && this.state.lines.length > 1 ? this.state.lines[1] : this.state.lines[0];
        const types = sampleLine.map((cell, i) => this._guessTypeForPill(cell, i, this.state.lines[0]));

        pillsContainer.innerHTML = types.map((t, i) => `
            <div class="mapping-pill ${t.cssClass}">
                <span class="mapping-pill-col">${i + 1}</span>
                <span>${t.label}</span>
            </div>
        `).join('');
    },

    /**
     * Detect if first line is likely a header
     * @private
     */
    _detectHeader(line) {
        if (!line || line.length === 0) return false;
        const keywords = ['nom', 'prénom', 'eleve', 'élève', 'moy', 'note', 'app', 'statut', 'contexte'];
        return line.some(cell => {
            const low = cell.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return keywords.some(kw => low.includes(kw));
        }) && !line.some(cell => Utils.isNumeric(cell));
    },

    /**
     * Guess type for pill visualization using pattern-based detection
     * @private
     */
    _guessTypeForPill(sample, index, headerLine = null) {
        // Use the same pattern-based detection as the mapping table
        const tag = this._guessTypeTag(sample, index);

        // Convert internal TAG to display label and CSS class
        if (tag === 'NOM_PRENOM') return { label: 'Nom', cssClass: 'type-name' };
        if (tag === 'STATUT') return { label: 'Statut', cssClass: 'type-status' };
        if (tag === 'INSTRUCTIONS') return { label: 'Contexte', cssClass: 'type-context' };
        if (tag.startsWith('MOY_')) return { label: 'Note', cssClass: 'type-grade' };
        if (tag.startsWith('APP_')) return { label: 'Appr.', cssClass: 'type-app' };
        if (tag.startsWith('CTX_')) return { label: 'Ctx.', cssClass: 'type-context' };

        return { label: 'Ignoré', cssClass: 'type-ignored' };
    },

    /**
     * Get current separator
     */
    _getSeparator() {
        const select = document.getElementById('wizardSeparatorSelect');
        const val = select?.value || 'tab';
        return val === 'tab' ? '\t' : val;
    },

    /**
     * Build mapping table for step 2 - CLEANED UP VERSION with native selects
     * @param {boolean} forceAuto - If true, ignores saved format and uses auto-detection
     */
    _buildMappingTable(forceAuto = false) {
        const container = document.getElementById('wizardMappingContainer');
        if (!container || this.state.lines.length === 0) return;

        // Update student count badge (now in footer)
        const countBadge = document.getElementById('wizardCountBadge2');
        if (countBadge) {
            countBadge.textContent = this.state.lines.length;
        }

        const cols = this.state.columnCount;

        // Build options dynamically based on CURRENT period only
        // This simplifies the dropdown significantly - no need to show all periods
        const currentPeriod = appState.currentPeriod || 'S1';
        const periodLabel = currentPeriod.startsWith('S')
            ? `Semestre ${currentPeriod.slice(1)}`
            : `Trimestre ${currentPeriod.slice(1)}`;

        const buildOptionsHtml = (selectedValue) => {
            let html = '';

            // General options (no group)
            const generalOptions = [
                { v: 'IGNORE', t: 'Ignorer' },
                { v: 'NOM_PRENOM', t: 'Nom & Prénom' },
                { v: 'STATUT', t: 'Statut' }
            ];
            html += generalOptions.map(o =>
                `<option value="${o.v}" ${o.v === selectedValue ? 'selected' : ''}>${o.t}</option>`
            ).join('');

            // Current period options (highlighted)
            const periodOptions = [
                { v: `DEV_${currentPeriod}`, t: `Nb éval. (${currentPeriod})` },
                { v: `MOY_${currentPeriod}`, t: `Moyenne (${currentPeriod})` },
                { v: `APP_${currentPeriod}`, t: `Appréciation (${currentPeriod})` },
                { v: `CTX_${currentPeriod}`, t: `Contexte (${currentPeriod})` }
            ];

            // Add separator for clarity
            html += `<option disabled>──────</option>`;

            html += periodOptions.map(o =>
                `<option value="${o.v}" ${o.v === selectedValue ? 'selected' : ''}>${o.t}</option>`
            ).join('');

            // Global context
            html += `<option disabled>──────</option>`;
            html += `<option value="INSTRUCTIONS" ${selectedValue === 'INSTRUCTIONS' ? 'selected' : ''}>Instructions (Global)</option>`;

            return html;
        };

        // Try to load saved format (only if not forcing auto and column count matches)
        const savedFormat = forceAuto ? null : this._loadSavedFormat();
        const useSavedFormat = savedFormat && Object.keys(savedFormat).length === cols;

        // UX: Show feedback when saved format is applied (only once per wizard session)
        const autoDetectBtn = document.getElementById('wizardAutoDetectBtn');
        if (useSavedFormat) {
            // Only show notification if not already shown this session
            if (!this.state._formatNotificationShown) {
                UI.showNotification('Format précédent appliqué • Cliquez "Détection auto" pour changer', 'info');
                this.state._formatNotificationShown = true;
            }
            autoDetectBtn?.classList.add('format-applied');
        } else {
            autoDetectBtn?.classList.remove('format-applied');
        }

        // Build table with NATIVE selects
        let html = `<table class="import-mapping-table vertical-align">
            <thead><tr>`;

        for (let i = 0; i < cols; i++) {
            // Determine initial value: use saved format if available and matching, otherwise auto-detect
            let initialValue = useSavedFormat ? (savedFormat[i] || 'IGNORE') : this._guessTypeTag(this.state.lines[0]?.[i] || '', i);

            html += `<th>
                <select class="mapping-select" data-col-index="${i}">
                    ${buildOptionsHtml(initialValue)}
                </select>
            </th>`;
        }
        html += `</tr></thead><tbody>`;

        // Show ALL lines (container has max-height with scroll)
        const previewLines = this.state.lines;
        previewLines.forEach(line => {
            html += `<tr>`;
            for (let i = 0; i < cols; i++) {
                const fullContent = (line[i] || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                const cellContent = fullContent.length > 50 ? fullContent.substring(0, 47) + '...' : fullContent;
                const needsTooltip = fullContent.length > 50;

                // Special styling for status column (column 1 typically)
                const isStatusCol = i === 1; // Statut is typically column 1

                if (isStatusCol && cellContent.trim()) {
                    // Determine status type for CSS class
                    const statusLower = cellContent.toLowerCase();
                    let statusType = 'default';
                    if (statusLower.includes('ppre')) statusType = 'ppre';
                    else if (statusLower.includes('pap')) statusType = 'pap';
                    else if (statusLower.includes('ulis')) statusType = 'ulis';
                    else if (statusLower.includes('nouveau')) statusType = 'nouveau';
                    else if (statusLower.includes('départ') || statusLower.includes('depart')) statusType = 'depart';

                    // Render as colored badge (with tooltip if truncated)
                    html += `<td${needsTooltip ? ` title="${fullContent}"` : ''}><span class="status-badge-cell status-${statusType}" data-status="${cellContent}">${cellContent}</span></td>`;
                } else {
                    html += `<td${needsTooltip ? ` class="has-tooltip" title="${fullContent}"` : ''}>${cellContent}</td>`;
                }
            }
            html += `</tr>`;
        });

        html += '</tbody></table>';

        // Wrap table in scroll wrapper for proper scrollbar containment
        container.innerHTML = `<div class="table-scroll-wrapper">${html}</div>`;
        container.classList.add('horizontal-scroll');

        // Bind change events to native selects with duplicate validation
        container.querySelectorAll('.mapping-select').forEach(select => {
            select.addEventListener('change', () => {
                this._validateMappings();
                this._updatePreview();
            });
        });

        // Initial validation and preview
        this._validateMappings();
        this._updatePreview();
    },

    /**
     * Validate mapping selections - detect and highlight duplicates
     * @private
     */
    _validateMappings() {
        const selects = document.querySelectorAll('.mapping-select');
        const valueCounts = {};

        // Count occurrences of each value (excluding IGNORE)
        selects.forEach(select => {
            const val = select.value;
            if (val && val !== 'IGNORE') {
                valueCounts[val] = (valueCounts[val] || 0) + 1;
            }
        });

        // Find duplicates
        const duplicates = Object.keys(valueCounts).filter(k => valueCounts[k] > 1);

        // Apply visual feedback to each select
        selects.forEach(select => {
            const isDuplicate = duplicates.includes(select.value);
            select.classList.toggle('mapping-duplicate', isDuplicate);
        });

        // Show/hide warning message
        let warningEl = document.getElementById('wizardMappingWarning');
        if (duplicates.length > 0) {
            if (!warningEl) {
                warningEl = document.createElement('div');
                warningEl.id = 'wizardMappingWarning';
                warningEl.className = 'mapping-warning';
                const container = document.getElementById('wizardMappingContainer');
                container?.parentNode.insertBefore(warningEl, container);
            }
            warningEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Colonnes en doublon : plusieurs colonnes ont le même type`;
            warningEl.style.display = 'flex';
        } else if (warningEl) {
            warningEl.style.display = 'none';
        }
    },

    /**
     * Guess column type using FORMAT-AWARE detection
     * Uses the detected PDF format for smarter mapping:
     * - MBN: Nom | Nb notes | Moy | Appréciation
     * - Pronote: Nom | Nb notes | Moy | (empty)
     * - Generic: Nom | Statut | [Moy, Appr] × N périodes | Contexte
     * @private
     */
    _guessTypeTag(sample, index) {
        const totalCols = this.state.columnCount;
        const periods = Utils.getPeriods(); // Needed for generic multi-period data
        // CRITICAL: Use the CURRENT period selected by user, not periods[0]
        const currentPeriod = appState.currentPeriod || 'S1';

        // Format-specific detection for PDF sources
        const format = this.state.detectedFormat;
        if (format?.parserName) {
            return this._guessTypeTagForFormat(format.parserName, index, totalCols, currentPeriod, sample);
        }

        // === GENERIC FALLBACK for non-PDF data ===

        // 1. Try to guess from header first if we have one
        if (this.state.lines.length > 0) {
            const headerLine = this.state.lines[0];
            // Only use header logic if we actually detected a header row
            if (this.state.hasHeader) {
                const headerTag = this._detectTypeFromHeader(index, headerLine);
                if (headerTag) return headerTag;
            }
        }

        // 2. Structural Guessing (based on column position)

        // Col 0: ALWAYS Name
        if (index === 0) return 'NOM_PRENOM';

        // Col 1: Status OR Grade depending on content
        if (index === 1) {
            // If it's a number, it's likely the first grade, not status
            if (Utils.isNumeric(sample)) {
                return `MOY_${currentPeriod}`;
            }
            return 'STATUT';
        }

        // Last column: Context, unless it's a number
        if (index === totalCols - 1 && !Utils.isNumeric(sample)) return 'INSTRUCTIONS';

        // Remaining columns: Heuristic based on total width
        // If we have few columns (e.g., 3-5), we probably have [Name, (Status), Grade, App, (Context)]
        // This is a SINGLE PERIOD import -> Use currentPeriod
        const isSinglePeriod = totalCols <= 6;

        if (isSinglePeriod) {
            // Find grade column (numeric)
            if (Utils.isNumeric(sample)) {
                return `MOY_${currentPeriod}`;
            }
            // Find appreciation column (long text)
            if (sample.length > 5) {
                return `APP_${currentPeriod}`;
            }
        } else {
            // MULTI-PERIOD import (wide structure) -> Use sequential mapping
            const dataColIndex = index - 2; // Offset for Name + Status
            const periodIndex = Math.floor(dataColIndex / 2);
            /* 
               Note: This sequential mapping might still be imperfect if periods aren't perfectly aligned, 
               but it's better than nothing for bulk historical imports. 
               Ideally, we rely on headers for multi-period files.
            */
            const isGradeCol = dataColIndex % 2 === 0;

            if (periodIndex < periods.length) {
                const period = periods[periodIndex];
                return isGradeCol ? `MOY_${period}` : `APP_${period}`;
            }
        }

        // Fallback
        return 'IGNORE';
    },

    /**
     * Format-specific column type detection for known PDF formats
     * Each parser has a known output structure - use that knowledge!
     * @private
     * @param {string} parserName - The PDF parser that was used (e.g., 'mbn-bilan')
     * @param {number} index - Column index
     * @param {number} totalCols - Total number of columns
     * @param {string} currentPeriod - Current period (S1, T1, etc.)
     * @param {string} sample - Sample value from first data row for this column
     */
    _guessTypeTagForFormat(parserName, index, totalCols, currentPeriod, sample = '') {
        // MBN Bilan Appréciations: NOM Prénom | Dev | Moy | Appréciation
        // Output structure from convertMbnBilan: exactly 4 columns
        if (parserName === 'mbn-bilan') {
            switch (index) {
                case 0: return 'NOM_PRENOM';
                case 1: return `DEV_${currentPeriod}`;  // Nombre d'évaluations
                case 2: return `MOY_${currentPeriod}`;  // Moyenne
                case 3: {
                    // Smart detection: if ALL appreciation values are empty, set to IGNORE
                    const isColumnEmpty = this._isColumnEmpty(index);
                    return isColumnEmpty ? 'IGNORE' : `APP_${currentPeriod}`;
                }
                default: return 'IGNORE';
            }
        }

        // Pronote Bilan: NOM Prénom | Dev | Moy | (empty for context)
        // Output structure from convertPronoteReport: 4 columns, last often empty
        if (parserName === 'pronote-bilan') {
            switch (index) {
                case 0: return 'NOM_PRENOM';
                case 1: return `DEV_${currentPeriod}`;  // Nombre d'évaluations
                case 2: return `MOY_${currentPeriod}`;  // Moyenne
                case 3: return 'IGNORE';  // Usually empty in Pronote PDF
                default: return 'IGNORE';
            }
        }

        // Unknown format - use generic detection
        if (index === 0) return 'NOM_PRENOM';
        if (index === 1) return 'STATUT';
        if (index === totalCols - 1) return 'INSTRUCTIONS';
        return 'IGNORE';
    },

    /**
     * Check if a column is entirely empty across all data rows
     * Used to detect columns that should be ignored (e.g., unfilled appreciations)
     * @private
     * @param {number} colIndex - Column index to check
     * @returns {boolean} True if all values in this column are empty
     */
    _isColumnEmpty(colIndex) {
        if (!this.state.lines || this.state.lines.length === 0) return true;

        // Check all rows (or up to first 20 for performance)
        const linesToCheck = this.state.lines.slice(0, 20);

        return linesToCheck.every(line => {
            const value = line[colIndex];
            return !value || value.trim() === '';
        });
    },

    /**
     * Setup scroll shadow indicator on mapping table
     * @private
     */
    _setupScrollShadow(container) {
        const checkScroll = () => {
            const hasScroll = container.scrollWidth > container.clientWidth;
            const isScrolledToEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 10;
            container.classList.toggle('has-scroll', hasScroll && !isScrolledToEnd);
        };
        checkScroll();
        container.addEventListener('scroll', checkScroll);
    },

    /**
     * Try to detect column type from header text
     * Returns internal TAG or null if no match found
     * @private
     */
    _detectTypeFromHeader(index, headerLine) {
        if (!headerLine || headerLine.length <= index) return null;

        const periods = Utils.getPeriods();
        const title = headerLine[index].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

        // 1. Check exact/keyword matches for standard columns
        const keywords = {
            'NOM_PRENOM': ['nom', 'prenom', 'eleve', 'etudiant'],
            'STATUT': ['statut'],
            'INSTRUCTIONS': ['contexte', 'instruction', 'observation']
        };

        const matchKeyword = (t, kw) => new RegExp(`(^|\\s)${kw}(\\s|$)`, 'i').test(t);

        for (const [tag, kws] of Object.entries(keywords)) {
            if (kws.some(kw => matchKeyword(title, kw))) return tag;
        }

        // 2. Check for Period-specific columns (Moy, App, Ctx)
        // Patterns to look for: "Moyenne T1", "App S2", "Note T3"
        const periodPrefixes = {
            'MOY_': ['moy', 'note'],
            'APP_': ['app', 'com', 'obs'],
            'CTX_': ['contexte', 'ctx']
        };

        for (const [prefix, kws] of Object.entries(periodPrefixes)) {
            if (kws.some(kw => title.includes(kw))) {
                // Try to find period code (T1, S2...)
                const periodMatch = title.match(/([ts])\s?(\d)/i);
                if (periodMatch) {
                    const p = (periodMatch[1] + periodMatch[2]).toUpperCase();
                    if (periods.includes(p)) return prefix + p;
                }

                // If no specific period found in header, but we found "Moyenne", "Note", etc.
                // We could infer it matches the current period, but that's risky for headers.
                // Better to return null and let structural guessing handle it.
            }
        }

        return null;
    },

    /**
     * Load saved format from appState
     * @private
     */
    _loadSavedFormat() {
        if (!appState.massImportFormats) return null;
        const systemFormats = appState.massImportFormats[appState.periodSystem];
        if (!systemFormats) return null;

        const formatString = systemFormats[appState.currentPeriod];
        if (!formatString) return null;

        return formatString.split(' | ').map(tag => tag.trim().replace(/[{}]/g, ''));
    },

    /**
     * Map internal tag (NOM_PRENOM) to UI friendly name
     * @private
     */
    _mapTagToFriendly(tag) {
        if (tag === 'NOM_PRENOM') return 'Nom & Prénom';
        if (tag === 'STATUT') return 'Statut';
        if (tag === 'INSTRUCTIONS') return 'Contexte (global)';
        if (tag.startsWith('MOY_')) return `Moy. ${tag.split('_')[1]}`;
        if (tag.startsWith('APP_')) return `Appréciation ${tag.split('_')[1]}`;
        if (tag.startsWith('CTX_')) return `Contexte ${tag.split('_')[1]}`;
        return 'Ignorer';
    },

    /**
     * Map UI friendly name to internal tag
     * @private
     */
    _mapFriendlyToTag(friendly) {
        if (friendly === 'Nom & Prénom') return 'NOM_PRENOM';
        if (friendly === 'Statut') return 'STATUT';
        if (friendly === 'Contexte (global)' || friendly === 'Contexte') return 'INSTRUCTIONS';
        if (friendly.startsWith('Moy. ')) return `MOY_${friendly.split(' ')[1]}`;
        if (friendly.startsWith('Appréciation ')) return `APP_${friendly.split(' ')[1]}`;
        if (friendly.startsWith('Contexte ')) return `CTX_${friendly.split(' ')[1]}`;
        return 'IGNORE';
    },

    /**
     * Save current format to appState
     * @private
     */
    _saveFormat() {
        const tags = [];
        const selects = document.querySelectorAll('.mapping-select');
        const sortedSelects = Array.from(selects).sort((a, b) =>
            parseInt(a.dataset.colIndex) - parseInt(b.dataset.colIndex)
        );

        sortedSelects.forEach(select => {
            tags.push(`{${select.value}}`);
        });

        const formatString = tags.join(' | ');

        if (!appState.massImportFormats) appState.massImportFormats = {};
        if (!appState.massImportFormats[appState.periodSystem]) appState.massImportFormats[appState.periodSystem] = {};

        appState.massImportFormats[appState.periodSystem][appState.currentPeriod] = formatString;

        // Save to storage
        import('./StorageManager.js').then(({ StorageManager }) => StorageManager.saveAppState());
    },

    /**
     * Force auto-detection of column types (ignores saved format)
     * @private
     */
    _forceAutoDetect() {
        // Clear any saved format to force fresh detection
        this.state.useAutoDetect = true;

        // Rebuild the mapping table with fresh auto-detection
        this._buildMappingTable(true); // true = force auto
    },

    /**
     * Update preview for step 3
     */
    async _updatePreview() {
        const { AppreciationsManager } = await import('./AppreciationsManager.js');

        // Build format map from NATIVE Selects (direct value reading - much simpler!)
        const formatMap = {};
        document.querySelectorAll('.mapping-select').forEach(select => {
            const col = parseInt(select.dataset.colIndex);
            const val = select.value;

            if (!val || val === 'IGNORE') return;
            formatMap[val] = col;
        });

        this.state.formatMap = formatMap;

        // Update period badge
        const periodBadge = document.getElementById('wizardPeriodBadge');
        if (periodBadge) {
            const period = appState.currentPeriod || 'T1';
            const periodNumber = period.replace(/\D/g, ''); // Extract number (1, 2, 3)
            const periodType = period.startsWith('S') ? 'Semestre' : 'Trimestre';
            periodBadge.textContent = `${periodType} ${periodNumber}`;
        }

        const strategy = document.querySelector('input[name="wizardStrategy"]:checked')?.value || 'merge';
        // Use auto-detected hasHeader from state
        const skipHeader = this.state.hasHeader || false;

        const linesToProcess = skipHeader ? this.state.lines.slice(1) : this.state.lines;

        const preview = AppreciationsManager._prepareStudentListForImport(
            linesToProcess, formatMap, strategy
        );

        this.state.studentsToProcess = preview.studentsToProcess;
        this.state.newStudents = preview.newStudents;
        this.state.updatedStudents = preview.updatedStudents;
        this.state.departedStudents = preview.departedStudents;
        this.state.ignoredCount = preview.ignoredCount;

        // Update lists with type-specific rendering
        this._populateList('wizardNewList', 'wizardNewCount', preview.newStudents, 'new');
        this._populateList('wizardUpdatedList', 'wizardUpdatedCount', preview.updatedStudents, 'updated');
        this._populateList('wizardDepartedList', 'wizardDepartedCount', preview.departedStudents, 'departed');

        // Hide/show strategy section based on whether there are existing students
        // If no existing students, strategy options (Merge/Replace) are irrelevant
        const strategySection = document.querySelector('.import-strategy-section');
        const hasExistingStudentsInClass = preview.updatedStudents.length > 0 || preview.departedStudents.length > 0;
        if (strategySection) {
            strategySection.style.display = hasExistingStudentsInClass ? '' : 'none';
        }

        // Hide "Updated" column header if empty (first import scenario)
        const updatedCol = document.getElementById('wizardUpdatedList')?.closest('.import-preview-col');
        if (updatedCol) {
            updatedCol.style.display = preview.updatedStudents.length > 0 ? '' : 'none';
        }

        // Update import button count
        const importCountEl = document.getElementById('wizardImportCount');
        const importBtn = document.getElementById('wizardImportOnlyBtn');
        const totalToImport = preview.studentsToProcess?.length || 0;

        if (importCountEl) {
            importCountEl.textContent = totalToImport;
        }
        if (importBtn) {
            importBtn.disabled = totalToImport === 0;
        }
    },

    /**
     * Populate a preview list with enhanced student info
     * @param {string} listId - DOM element ID for the list
     * @param {string} countId - DOM element ID for the count badge
     * @param {Array} students - Array of student objects
     * @param {string} type - List type: 'new', 'updated', or 'departed'
     */
    _populateList(listId, countId, students, type = 'new') {
        const list = document.getElementById(listId);
        const count = document.getElementById(countId);

        // Animate count update if changed
        if (count) {
            const oldVal = parseInt(count.textContent || '0');
            const newVal = students.length;
            count.textContent = newVal;

            if (oldVal !== newVal) {
                count.classList.remove('pop');
                void count.offsetWidth; // Trigger reflow
                count.classList.add('pop');
            }
        }

        if (list) {
            if (students.length === 0) {
                list.innerHTML = `<li class="empty-state-li">Aucun élève</li>`;
            } else {
                list.innerHTML = students.map((s, index) => {
                    if (!s) return '';

                    const initials = `${(s.prenom && s.prenom[0] ? s.prenom[0] : '').toUpperCase()}${(s.nom && s.nom[0] ? s.nom[0] : '').toUpperCase()}`;
                    const fullName = `${s.prenom || ''} <strong>${s.nom || ''}</strong>`;

                    // Generate secondary info based on list type
                    let secondaryInfo = '';
                    if (type === 'new' && s.email) {
                        secondaryInfo = `<span class="li-secondary">${s.email}</span>`;
                    } else if (type === 'updated' && s._changeInfo) {
                        secondaryInfo = `<span class="li-change"><i class="fas fa-arrow-right"></i> ${s._changeInfo}</span>`;
                    } else if (type === 'departed') {
                        secondaryInfo = `<span class="li-secondary">Absent du fichier</span>`;
                    }

                    return `
                    <li>
                        <div class="li-avatar">
                            <span>${initials}</span>
                        </div>
                        <div class="li-info">
                            <span class="li-name">${fullName}</span>
                            ${secondaryInfo}
                        </div>
                    </li>
                `}).join('');
            }
        }
    },

    /**
     * Import students only (no AI)
     */
    async _importOnly() {
        if (this.state.studentsToProcess.length === 0) return;

        this._saveFormat();

        const { MassImportManager } = await import('./MassImportManager.js');
        const strategy = document.querySelector('input[name="wizardStrategy"]:checked')?.value || 'merge';

        // FIX: Confirmation before destructive replace operation
        if (strategy === 'replace') {
            const currentClassId = appState.currentClassId;
            const currentClassStudents = appState.generatedResults?.filter(r =>
                r.classId === currentClassId
            ) || [];
            const currentCount = currentClassStudents.length;

            if (currentCount > 0) {
                const className = ClassManager.getCurrentClass()?.name || 'cette classe';
                // Count students with photos
                const photosCount = currentClassStudents.filter(s => s.studentPhoto?.data).length;
                const photoWarning = photosCount > 0
                    ? `\n📷 ${photosCount} photo(s) seront préservées si les noms correspondent.`
                    : '';

                const confirmed = await new Promise(resolve => {
                    UI.showCustomConfirm(
                        `⚠️ Mode "Remplacer" sélectionné\n\n` +
                        `Cette action va remplacer les ${currentCount} élève(s) de "${className}" par les données importées.\n` +
                        `Les autres classes ne seront pas affectées.${photoWarning}\n\n` +
                        `Continuer ?`,
                        () => resolve(true),
                        () => resolve(false)
                    );
                });

                if (!confirmed) {
                    UI.showNotification('Import annulé', 'info');
                    return;
                }
            }

            // SMART REPLACE: Preserve photos by matching student names
            // Build a map of existing photos by normalized name
            const photoMap = new Map();
            for (const student of currentClassStudents) {
                if (student.studentPhoto?.data) {
                    // Normalize name: UPPERCASE + trim for matching
                    const normalizedName = `${(student.nom || '').toUpperCase().trim()}|${(student.prenom || '').trim().toLowerCase()}`;
                    photoMap.set(normalizedName, student.studentPhoto);
                }
            }

            // Store photo map in state for MassImportManager to use
            this.state._preservedPhotos = photoMap;

            // CRITICAL: Only remove students from CURRENT class, keep other classes intact
            appState.generatedResults = appState.generatedResults.filter(r =>
                r.classId !== currentClassId
            );
        }

        await MassImportManager.importStudentsOnly(this.state.studentsToProcess, this.state.ignoredCount || 0, this.state._preservedPhotos);

        // Clean up
        delete this.state._preservedPhotos;

        this.close();
    },

    /**
     * Reset wizard state
     */
    _reset() {
        this.currentStep = 1;
        this.state = {
            rawData: '',
            lines: [],
            separator: '\t',
            columnCount: 0,
            formatMap: {},
            studentsToProcess: [],
            newStudents: [],
            updatedStudents: [],
            departedStudents: [],
            detectedFormat: null,
            _formatNotificationShown: false,
            currentSource: null
        };
        document.getElementById('wizardDataTextarea').value = '';

        // Reset Drop Zone UI
        this._resetFileUI();

        // Clean up dynamically created warning elements
        document.getElementById('wizardMappingWarning')?.remove();
        document.getElementById('wizardSingleColumnWarning')?.remove();

        // Clean up format badge
        const formatBadge = document.getElementById('wizardFormatBadge');
        if (formatBadge) formatBadge.remove();

        // Hide line count
        const lineCount = document.getElementById('wizardStep1LineCount');
        if (lineCount) lineCount.style.display = 'none';

        // Hide clear button
        const clearBtn = document.getElementById('wizardClearBtn');
        if (clearBtn) clearBtn.style.display = 'none';

        this._updateUI();
    }
};
