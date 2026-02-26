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
import { AppreciationsManager } from './AppreciationsManager.js';
import { MassImportManager } from './MassImportManager.js';
import { StorageManager } from './StorageManager.js';

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
        document.querySelectorAll('.ui-stepper .ui-stepper-step[role="button"]').forEach(stepEl => {
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

        // Update header period badge
        const headerBadge = document.getElementById('wizardPeriodBadge');
        if (headerBadge) headerBadge.textContent = label;
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
        document.querySelectorAll('.ui-stepper .ui-stepper-step').forEach(el => {
            const step = parseInt(el.dataset.step);
            el.classList.remove('active', 'completed');
            if (step === this.currentStep) el.classList.add('active');
            if (step < this.currentStep) el.classList.add('completed');
        });



        // Update step content - scope to modal only
        const modal = document.getElementById('importWizardModal');
        if (modal) {
            modal.querySelectorAll('.wizard-step-content').forEach((el, i) => {
                const isActive = i + 1 === this.currentStep;
                el.classList.toggle('active', isActive);
                el.style.display = isActive ? 'block' : 'none';
            });
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
                        fileIconEl.innerHTML = '<iconify-icon icon="solar:file-text-linear"></iconify-icon>';
                    } else if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
                        fileIconEl.classList.add('type-excel');
                        fileIconEl.innerHTML = '<iconify-icon icon="solar:file-right-linear"></iconify-icon>';
                    } else {
                        fileIconEl.innerHTML = '<iconify-icon icon="solar:document-linear"></iconify-icon>';
                    }
                } else if (type === 'text') {
                    // Text Logic
                    fileIconEl.classList.add('type-text');
                    fileIconEl.innerHTML = '<iconify-icon icon="solar:keyboard-linear"></iconify-icon>';
                } else if (type === 'sample') {
                    // Sample logic
                    fileIconEl.classList.add('type-sample');
                    fileIconEl.innerHTML = '<iconify-icon icon="solar:list-linear"></iconify-icon>';
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
            warningEl.innerHTML = `<iconify-icon icon="solar:danger-triangle-linear"></iconify-icon> Une seule colonne détectée. Essayez un autre séparateur.`;
            warningEl.style.display = 'flex';
        } else if (warningEl) {
            warningEl.style.display = 'none';
        }
    },

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
            'mbn': 'solar:square-academic-cap-linear',
            'pronote': 'solar:mortarboard-linear',
            'vertical': 'solar:list-linear'
        };
        const icon = icons[format.type] || 'solar:document-text-linear';

        badge.innerHTML = `<iconify-icon icon="${icon}"></iconify-icon> ${format.name}`;
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

        const currentPeriod = appState.currentPeriod || 'S1';

        const buildOptionsHtml = (selectedValue) => {
            let html = '';

            // General options (no group)
            const generalOptions = [
                { v: 'IGNORE', t: 'Ignorer' },
                { v: 'NOM_PRENOM', t: 'Élève' },
                { v: 'STATUT', t: 'Statut' }
            ];
            html += generalOptions.map(o =>
                `<option value="${o.v}" ${o.v === selectedValue ? 'selected' : ''}>${o.t}</option>`
            ).join('');

            // Current period options (highlighted)
            const periodOptions = [
                { v: `DEV_${currentPeriod}`, t: `Nb notes ${currentPeriod}` },
                { v: `MOY_${currentPeriod}`, t: `Moy. ${currentPeriod}` },
                { v: `APP_${currentPeriod}`, t: `Appréciation ${currentPeriod}` },
                { v: `CTX_${currentPeriod}`, t: `Contexte ${currentPeriod}` }
            ];

            // Add separator for clarity
            html += `<option disabled>──────</option>`;

            html += periodOptions.map(o =>
                `<option value="${o.v}" ${o.v === selectedValue ? 'selected' : ''}>${o.t}</option>`
            ).join('');

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

        // Collect initial column mappings for cell-level styling
        const initialMappings = [];
        for (let i = 0; i < cols; i++) {
            initialMappings[i] = useSavedFormat ? (savedFormat[i] || 'IGNORE') : this._guessTypeTag(this.state.lines[0]?.[i] || '', i);
        }

        // Show ALL lines (container has max-height with scroll)
        const previewLines = this.state.lines;
        previewLines.forEach(line => {
            html += `<tr>`;
            for (let i = 0; i < cols; i++) {
                const fullContent = (line[i] || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                const cellContent = fullContent.length > 50 ? fullContent.substring(0, 47) + '...' : fullContent;
                const needsTooltip = fullContent.length > 50;

                const isStatusCol = initialMappings[i] === 'STATUT';

                if (isStatusCol && cellContent.trim()) {
                    const statusLower = cellContent.toLowerCase();
                    let statusType = 'default';
                    if (statusLower.includes('ppre')) statusType = 'ppre';
                    else if (statusLower.includes('pap')) statusType = 'pap';
                    else if (statusLower.includes('ulis')) statusType = 'ulis';
                    else if (statusLower.includes('nouveau')) statusType = 'nouveau';
                    else if (statusLower.includes('départ') || statusLower.includes('depart')) statusType = 'depart';

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
                this._applyColumnClasses();
                this._validateMappings();
                this._updatePreview();
            });
        });

        // Initial column classes, validation and preview
        this._applyColumnClasses();
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
            warningEl.innerHTML = `<iconify-icon icon="solar:danger-triangle-bold"></iconify-icon> Colonnes en doublon : plusieurs colonnes ont le même type`;
            warningEl.style.display = 'flex';
        } else if (warningEl) {
            warningEl.style.display = 'none';
        }
    },

    /**
     * Apply semantic col-* CSS classes to th/td based on current select values
     * Enables column-type-aware styling (color, width, alignment)
     * @private
     */
    _applyColumnClasses() {
        const table = document.querySelector('.import-mapping-table');
        if (!table) return;

        const tagToClass = {
            IGNORE: 'col-ignore',
            NOM_PRENOM: 'col-name',
            STATUT: 'col-status'
        };
        const prefixToClass = {
            MOY: 'col-grade',
            DEV: 'col-count',
            APP: 'col-appreciation',
            CTX: 'col-context'
        };

        const allClasses = ['col-name', 'col-status', 'col-grade', 'col-count', 'col-appreciation', 'col-context', 'col-ignore'];
        const selects = table.querySelectorAll('.mapping-select');
        const colClasses = [];

        selects.forEach((select, i) => {
            const val = select.value;
            const cls = tagToClass[val] ?? prefixToClass[val?.split('_')[0]] ?? null;
            colClasses[i] = cls;

            const th = select.closest('th');
            th?.classList.remove(...allClasses);
            if (cls) th?.classList.add(cls);
        });

        table.querySelectorAll('tbody tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            cells.forEach((td, i) => {
                td.classList.remove(...allClasses);
                if (colClasses[i]) td.classList.add(colClasses[i]);
            });
        });
    },

    /**
     * Guess column type using FORMAT-AWARE detection
     * Uses the detected PDF format for smarter mapping:
     * - MBN: Nom | Nb notes | Moy | Appréciation
     * - Pronote: Nom | Nb notes | Moy | (empty)
     * - Generic: Nom | Statut | [Moy, Appr] × N periods | Contexte
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
        if (index === totalCols - 1 && !Utils.isNumeric(sample)) return `CTX_${currentPeriod}`;

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
        if (index === totalCols - 1) return `CTX_${currentPeriod}`;
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
            'CTX_': ['contexte', 'ctx', 'instruction', 'observation']
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
        if (tag.startsWith('MOY_')) return `Moy. ${tag.split('_')[1]}`;
        if (tag.startsWith('APP_')) return `Appréciation ${tag.split('_')[1]}`;
        if (tag.startsWith('CTX_')) return `Contexte ${tag.split('_')[1]}`;
        if (tag.startsWith('DEV_')) return `Nb notes ${tag.split('_')[1]}`;
        return 'Ignorer';
    },

    /**
     * Map UI friendly name to internal tag
     * @private
     */
    _mapFriendlyToTag(friendly) {
        if (friendly === 'Nom & Prénom') return 'NOM_PRENOM';
        if (friendly === 'Statut') return 'STATUT';
        if (friendly.startsWith('Moy. ')) return `MOY_${friendly.split(' ')[1]}`;
        if (friendly.startsWith('Appréciation ')) return `APP_${friendly.split(' ')[1]}`;
        if (friendly.startsWith('Contexte ')) return `CTX_${friendly.split(' ')[1]}`;
        if (friendly.startsWith('Nb notes ')) return `DEV_${friendly.split(' ')[2]}`; // "Nb notes S1"
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

        StorageManager.saveAppState();
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
     * Update preview for step 3 — builds unified data table with column checkboxes
     */
    async _updatePreview() {

        // Build format map from NATIVE Selects
        const formatMap = {};
        document.querySelectorAll('.mapping-select').forEach(select => {
            const col = parseInt(select.dataset.colIndex);
            const val = select.value;
            if (!val || val === 'IGNORE') return;
            formatMap[val] = col;
        });

        this.state.formatMap = formatMap;

        // Always merge mode
        const skipHeader = this.state.hasHeader || false;
        const linesToProcess = skipHeader ? this.state.lines.slice(1) : this.state.lines;

        const preview = AppreciationsManager._prepareStudentListForImport(
            linesToProcess, formatMap, 'merge'
        );

        this.state.studentsToProcess = preview.studentsToProcess;
        this.state.newStudents = preview.newStudents;
        this.state.updatedStudents = preview.updatedStudents;
        this.state.departedStudents = preview.departedStudents;
        this.state.ignoredCount = preview.ignoredCount;

        // Build the new data table
        this._buildPreviewTable(preview, formatMap);

        // Update legend counts
        const updateCount = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        updateCount('wizardNewCount', preview.newStudents.length);
        updateCount('wizardUpdatedCount', preview.updatedStudents.length);
        updateCount('wizardDepartedCount', preview.departedStudents.length);

        // Show/hide departed toggle
        const departedAction = document.getElementById('wizardDepartedAction');
        if (departedAction) {
            departedAction.style.display = preview.departedStudents.length > 0 ? '' : 'none';
        }

        // Show/hide overwrite warning
        const overwriteWarning = document.getElementById('wizardOverwriteWarning');
        if (overwriteWarning) {
            overwriteWarning.style.display = preview.updatedStudents.length > 0 ? '' : 'none';
        }

        // Update footer info
        const mappedCols = Object.keys(formatMap).filter(k => k !== 'NOM_PRENOM');
        const colsBadgeEl = document.getElementById('wizardSelectedColsBadge');
        const colsInfoEl = document.getElementById('wizardSelectedColsInfo');
        if (colsBadgeEl) colsBadgeEl.textContent = mappedCols.length;
        if (colsInfoEl) colsInfoEl.textContent = `colonne${mappedCols.length > 1 ? 's' : ''} sélectionnée${mappedCols.length > 1 ? 's' : ''}`;

        // Update import button count
        const totalToImport = preview.studentsToProcess?.length || 0;
        const importCountEl = document.getElementById('wizardImportCount');
        const importBtn = document.getElementById('wizardImportOnlyBtn');
        if (importCountEl) importCountEl.textContent = totalToImport;
        if (importBtn) importBtn.disabled = totalToImport === 0;
    },

    /**
     * Build the unified preview data table with column checkboxes
     * @param {Object} preview - Result from _prepareStudentListForImport
     * @param {Object} formatMap - Column format mapping { tag: colIndex }
     */
    _buildPreviewTable(preview, formatMap) {
        const container = document.getElementById('wizardPreviewTableContainer');
        if (!container) return;

        const currentPeriod = appState.currentPeriod || 'T1';

        // Determine which data columns to show (exclude NOM_PRENOM, it's always the first col)
        const dataColumns = Object.entries(formatMap)
            .filter(([tag]) => tag !== 'NOM_PRENOM')
            .sort(([, a], [, b]) => a - b)
            .map(([tag]) => ({ tag, label: this._getColumnLabel(tag, currentPeriod) }));

        // Build status lookup maps (name → type)
        const newSet = new Set(preview.newStudents.map(s => `${s.nom}|${s.prenom}`));
        const updatedSet = new Set(preview.updatedStudents.map(s => `${s.nom}|${s.prenom}`));
        const departedSet = new Set(preview.departedStudents.map(s => `${s.nom}|${s.prenom}`));

        // Build rows: merge studentsToProcess + departed
        const allRows = [];

        // Add imported students (new + updated)
        for (const s of preview.studentsToProcess) {
            const key = `${s.nom}|${s.prenom}`;
            const type = newSet.has(key) ? 'new' : updatedSet.has(key) ? 'updated' : 'new';
            allRows.push({ student: s, type, hasData: true });
        }

        // Add departed students (not in file)
        for (const s of preview.departedStudents) {
            allRows.push({ student: s, type: 'departed', hasData: false });
        }

        // Sort: new first, then updated, then departed
        const typeOrder = { 'new': 0, 'updated': 1, 'departed': 2 };
        allRows.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);

        // Build HTML
        let html = '<table class="import-preview-table"><thead><tr>';

        // First column: student name (always present, locked checkbox)
        html += `<th class="col-name">
            <label class="preview-col-header locked">
                <input type="checkbox" checked disabled data-col-tag="NOM_PRENOM">
                <span>Élève</span>
            </label>
        </th>`;

        // Data columns with checkboxes
        for (const col of dataColumns) {
            html += `<th class="${this._getColClass(col.tag)}">
                <label class="preview-col-header">
                    <input type="checkbox" checked data-col-tag="${col.tag}">
                    <span>${col.label}</span>
                </label>
            </th>`;
        }

        html += '</tr></thead><tbody>';

        if (allRows.length === 0) {
            html += `<tr><td colspan="${dataColumns.length + 1}" class="preview-empty-cell" style="text-align:center;padding:32px;">Aucun élève détecté</td></tr>`;
        } else {
            for (const row of allRows) {
                const s = row.student;
                const rowClass = row.type === 'departed' ? ' class="row-departed"' : '';

                html += `<tr${rowClass}>`;

                // Name cell with status dot
                html += `<td>
                    <div class="preview-student-cell">
                        <span class="preview-status-dot dot-${row.type}"></span>
                        <span class="preview-student-name">${s.prenom || ''} <strong>${s.nom || ''}</strong></span>
                    </div>
                </td>`;

                // Data cells
                for (const col of dataColumns) {
                    const value = row.hasData ? this._extractCellValue(s, col.tag, currentPeriod) : '';
                    html += `<td class="${this._getColClass(col.tag)}">${this._formatCellValue(value, col.tag)}</td>`;
                }

                html += '</tr>';
            }
        }

        html += '</tbody></table>';
        container.innerHTML = `<div class="table-scroll-wrapper">${html}</div>`;

        // Bind checkbox toggles
        container.querySelectorAll('.preview-col-header input[type="checkbox"]:not(:disabled)').forEach(cb => {
            cb.addEventListener('change', () => this._toggleColumn(cb));
        });

        // Store columns state
        this.state._enabledColumns = new Set(dataColumns.map(c => c.tag));
    },

    /**
     * Toggle a data column on/off in the preview table
     * @param {HTMLInputElement} checkbox
     */
    _toggleColumn(checkbox) {
        const tag = checkbox.dataset.colTag;
        const table = document.querySelector('.import-preview-table');
        if (!table) return;

        const colIndex = Array.from(table.querySelectorAll('thead th')).findIndex(
            th => th.querySelector(`input[data-col-tag="${tag}"]`)
        );
        if (colIndex < 0) return;

        const isEnabled = checkbox.checked;
        table.querySelectorAll(`tr`).forEach(tr => {
            const cell = tr.children[colIndex];
            if (cell) cell.classList.toggle('col-disabled', !isEnabled);
        });

        // Update enabled columns set
        if (isEnabled) {
            this.state._enabledColumns?.add(tag);
        } else {
            this.state._enabledColumns?.delete(tag);
        }

        // Update footer info
        const count = this.state._enabledColumns?.size || 0;
        const colsBadgeEl = document.getElementById('wizardSelectedColsBadge');
        const colsInfoEl = document.getElementById('wizardSelectedColsInfo');
        if (colsBadgeEl) colsBadgeEl.textContent = count;
        if (colsInfoEl) colsInfoEl.textContent = `colonne${count > 1 ? 's' : ''} sélectionnée${count > 1 ? 's' : ''}`;
    },

    /**
 * Get human-readable label for a column tag
 * Uses same naming as Step 2 select options for consistency
 */
    _getColumnLabel(tag, period) {
        const p = tag.includes('_') ? tag.split('_')[1] : period;
        if (tag === 'STATUT') return 'Statut';
        if (tag.startsWith('MOY_')) return `Moy. ${p}`;
        if (tag.startsWith('DEV_')) return `Nb notes ${p}`;
        if (tag.startsWith('APP_')) return `Appréciation ${p}`;
        if (tag.startsWith('CTX_')) return `Contexte ${p}`;
        return tag;
    },

    /**
     * Map a column tag to its CSS class for consistent styling across tables
     * @private
     */
    _getColClass(tag) {
        if (tag === 'NOM_PRENOM') return 'col-name';
        if (tag === 'STATUT') return 'col-status';
        if (tag === 'IGNORE') return 'col-ignore';
        const prefix = tag?.split('_')[0];
        if (prefix === 'MOY') return 'col-grade';
        if (prefix === 'DEV') return 'col-count';
        if (prefix === 'APP') return 'col-appreciation';
        if (prefix === 'CTX') return 'col-context';
        return '';
    },
    /**
     * Extract cell value from student data for a given column tag
     */
    _extractCellValue(student, tag, currentPeriod) {
        if (tag === 'STATUT') return student.statuses?.join(', ') || '';
        const periodData = student.periods?.[currentPeriod];
        if (!periodData) return '';

        if (tag.startsWith('MOY_')) return periodData.grade ?? '';
        if (tag.startsWith('DEV_')) return periodData.evaluationCount ?? '';
        if (tag.startsWith('APP_')) return periodData.appreciation || '';
        if (tag.startsWith('CTX_')) return periodData.context || '';
        return '';
    },

    /**
     * Format a cell value for display in the preview table
     */
    _formatCellValue(value, tag) {
        if (value === '' || value === null || value === undefined) {
            return '<span class="preview-empty-cell">—</span>';
        }

        // Status badge
        if (tag === 'STATUT' && value) {
            const statusLower = value.toLowerCase();
            let statusType = 'default';
            if (statusLower.includes('ppre')) statusType = 'ppre';
            else if (statusLower.includes('pap')) statusType = 'pap';
            else if (statusLower.includes('ulis')) statusType = 'ulis';
            else if (statusLower.includes('nouveau')) statusType = 'nouveau';
            else if (statusLower.includes('départ') || statusLower.includes('depart')) statusType = 'depart';
            return `<span class="preview-status-badge status-${statusType}">${value}</span>`;
        }

        // Truncate long text (appreciation, context)
        const str = String(value);
        if (str.length > 60) {
            const escaped = str.substring(0, 57).replace(/</g, '&lt;');
            return `<span title="${str.replace(/"/g, '&quot;')}">${escaped}…</span>`;
        }

        return str.replace(/</g, '&lt;');
    },

    /**
     * Import students — always merge mode, respects column checkboxes
     */
    async _importOnly() {
        if (this.state.studentsToProcess.length === 0) return;

        this._saveFormat();

        const currentPeriod = appState.currentPeriod || 'T1';

        // Read enabled columns from checkboxes
        const enabledTags = new Set();
        document.querySelectorAll('.preview-col-header input[type="checkbox"]:checked').forEach(cb => {
            enabledTags.add(cb.dataset.colTag);
        });

        // Filter student data: strip disabled columns before import
        const filteredStudents = this.state.studentsToProcess.map(s => {
            const filtered = JSON.parse(JSON.stringify(s));

            // Strip status if unchecked
            if (!enabledTags.has('STATUT')) {
                filtered.statuses = [];
            }

            // Strip period-specific fields if unchecked
            const period = filtered.periods?.[currentPeriod];
            if (period) {
                if (!this._isTagEnabled(enabledTags, 'MOY_')) period.grade = undefined;
                if (!this._isTagEnabled(enabledTags, 'DEV_')) period.evaluationCount = undefined;
                if (!this._isTagEnabled(enabledTags, 'APP_')) period.appreciation = '';
                if (!this._isTagEnabled(enabledTags, 'CTX_')) period.context = '';
            }

            return filtered;
        });

        // Smart Replace: delete departed students if toggle is checked
        const deleteDeparted = document.getElementById('wizardDeleteDepartedToggle')?.checked;

        if (deleteDeparted && this.state.departedStudents?.length > 0) {
            const currentClassId = appState.currentClassId;
            const departedKeys = new Set(
                this.state.departedStudents.map(s => Utils.normalizeName(s.nom, s.prenom))
            );

            // Collect IDs of records to delete from IndexedDB
            const idsToDelete = appState.generatedResults
                .filter(r => r.classId === currentClassId && departedKeys.has(Utils.normalizeName(r.nom, r.prenom)))
                .map(r => r.id);

            // Remove from in-memory state
            appState.generatedResults = appState.generatedResults.filter(
                r => !(r.classId === currentClassId && departedKeys.has(Utils.normalizeName(r.nom, r.prenom)))
            );

            // Delete from IndexedDB (putAll is non-destructive upsert, won't remove records)
            if (idsToDelete.length > 0) {
                const { DBService } = await import('../services/DBService.js');
                await Promise.all(idsToDelete.map(id => DBService.delete('generatedResults', id)));
            }
        }

        await MassImportManager.importStudentsOnly(filteredStudents, this.state.ignoredCount || 0);
        this.close();
    },

    /**
     * Check if any tag with the given prefix is enabled
     */
    _isTagEnabled(enabledTags, prefix) {
        for (const tag of enabledTags) {
            if (tag.startsWith(prefix)) return true;
        }
        return false;
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

        // Reset departed toggle
        const departedToggle = document.getElementById('wizardDeleteDepartedToggle');
        if (departedToggle) departedToggle.checked = false;
        const departedAction = document.getElementById('wizardDepartedAction');
        if (departedAction) departedAction.style.display = 'none';

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
