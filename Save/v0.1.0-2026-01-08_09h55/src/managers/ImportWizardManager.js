/**
 * @fileoverview Import Wizard Modal Manager
 * 3-step wizard: Data input → Mapping → Confirm
 * Now includes Hub Modal for unified entry point
 * @module managers/ImportWizardManager
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { detectSeparator, parseLine } from '../utils/ImportUtils.js';
import { UI } from './UIManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { ClassManager } from './ClassManager.js';
import { ClassUIManager } from './ClassUIManager.js';

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
        hasHeader: false
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

                if (action === 'individual') {
                    // Open Focus Panel in creation mode
                    FocusPanelManager.openNew();
                } else if (action === 'mass') {
                    // Open Import Wizard
                    this.open();
                }
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
    closeHub() {
        const backdrop = document.getElementById('importHubBackdrop');
        if (backdrop) {
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
            if (e.target.files.length > 0) this._handleFile(e.target.files[0]);
        });

        // Step 1: Textarea
        document.getElementById('wizardDataTextarea')?.addEventListener('input',
            Utils.debounce(() => this._processData(), 300));

        // Step 1: Sample data
        document.getElementById('wizardSampleBtn')?.addEventListener('click', () => this._loadSample());

        // Step 1: Clear data
        document.getElementById('wizardClearBtn')?.addEventListener('click', () => {
            const textarea = document.getElementById('wizardDataTextarea');
            if (textarea) {
                textarea.value = '';
                textarea.focus();
                this._processData();
            }
        });

        // Step 2: Separator change
        document.getElementById('wizardSeparatorSelect')?.addEventListener('change', () => this._processData());

        // Step 2: Format toggle (Auto vs Saved)
        const formatToggle = document.getElementById('wizardSaveFormatToggle');
        const formatLabel = document.getElementById('formatToggleLabel');

        formatToggle?.addEventListener('change', () => {
            if (formatToggle.checked) {
                // Save current format
                this._saveFormat();
                if (formatLabel) formatLabel.textContent = 'Enregistré';
                UI.showNotification('Format enregistré pour les prochains imports', 'success');
            } else {
                // Switch back to auto-detection
                if (formatLabel) formatLabel.textContent = 'Auto';
                UI.showNotification('Détection automatique activée', 'info');
            }
        });

        // Check if a saved format exists on init
        this._initFormatToggle();

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
            UI.openModal(modal);
        }
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

        // Update preview if on step 3
        if (this.currentStep === 3) {
            this._updatePreview();
        }
    },

    /**
     * Handle file drop/select
     */
    _handleFile(file) {
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById('wizardDataTextarea').value = e.target.result;
            this._processData();
        };
        reader.readAsText(file);
    },

    /**
     * Load sample data from shared source
     */
    _loadSample() {
        import('../data/SampleData.js').then(({ getSampleImportData }) => {
            const sample = getSampleImportData();
            document.getElementById('wizardDataTextarea').value = sample;
            this._processData();
        });
    },

    /**
     * Process data from textarea
     */
    _processData() {
        const text = document.getElementById('wizardDataTextarea')?.value?.trim() || '';
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

        // Build mapping table
        this._buildMappingTable();

        // Step 1 Preview (Magic Pills)
        this._updateStep1Preview();
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
     */
    _buildMappingTable() {
        const container = document.getElementById('wizardMappingContainer');
        if (!container || this.state.lines.length === 0) return;

        // Update student count badge
        const countBadge = document.getElementById('wizardCountBadge');
        if (countBadge) {
            countBadge.textContent = this.state.lines.length;
        }

        const cols = this.state.columnCount;
        const periods = Utils.getPeriods();

        // Options with internal value and display text
        const options = [
            { v: 'IGNORE', t: 'Ignorer' },
            { v: 'NOM_PRENOM', t: 'Nom & Prénom' },
            { v: 'STATUT', t: 'Statut' },
            ...periods.flatMap(p => [
                { v: `MOY_${p}`, t: `Moy. ${p}` },
                { v: `APP_${p}`, t: `Appr. ${p}` },
                { v: `CTX_${p}`, t: `Contexte ${p}` }
            ]),
            { v: 'INSTRUCTIONS', t: 'Contexte (global)' }
        ];
        const optionsHTML = options.map(o => `<option value="${o.v}">${o.t}</option>`).join('');

        // Try to load saved format
        const savedFormat = this._loadSavedFormat();

        // Build table with NATIVE selects
        let html = `<table class="import-mapping-table vertical-align">
            <thead><tr>`;

        for (let i = 0; i < cols; i++) {
            // Determine initial value
            let initialValue = savedFormat?.[i] || this._guessTypeTag(this.state.lines[0]?.[i] || '', i);

            html += `<th>
                <select class="mapping-select" data-col-index="${i}">
                    ${options.map(o => `<option value="${o.v}" ${o.v === initialValue ? 'selected' : ''}>${o.t}</option>`).join('')}
                </select>
            </th>`;
        }
        html += `</tr></thead><tbody>`;

        // Show ALL lines (container has max-height with scroll)
        const previewLines = this.state.lines;
        previewLines.forEach(line => {
            html += `<tr>`;
            for (let i = 0; i < cols; i++) {
                const cellContent = (line[i] || '').substring(0, 50).replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

                    // Render as colored badge
                    html += `<td><span class="status-badge-cell status-${statusType}" data-status="${cellContent}">${cellContent}</span></td>`;
                } else {
                    html += `<td title="${cellContent}">${cellContent}</td>`;
                }
            }
            html += `</tr>`;
        });

        html += '</tbody></table>';

        // Wrap table in scroll wrapper for proper scrollbar containment
        container.innerHTML = `<div class="table-scroll-wrapper">${html}</div>`;
        container.classList.add('horizontal-scroll');

        // Bind SIMPLE change events to native selects
        container.querySelectorAll('.mapping-select').forEach(select => {
            select.addEventListener('change', () => this._updatePreview());
        });

        // Initial preview update
        this._updatePreview();
    },

    /**
     * Guess column type using PATTERN-BASED detection
     * Pattern: Nom | Statut | [Moy, Appr] × N périodes | Contexte
     * @private
     */
    _guessTypeTag(sample, index) {
        const periods = Utils.getPeriods();
        const totalCols = this.state.columnCount;

        // Col 0: ALWAYS Name
        if (index === 0) return 'NOM_PRENOM';

        // Col 1: ALWAYS Status (short text or empty after name)
        if (index === 1) return 'STATUT';

        // Last column: ALWAYS Context (instructions/remarques)
        if (index === totalCols - 1) return 'INSTRUCTIONS';

        // Remaining columns (index 2 to totalCols-2): alternating Moy/Appr pairs
        // Pattern: [Moy.T1, Appr.T1, Moy.T2, Appr.T2, ...]
        const dataColIndex = index - 2; // 0-based index in the data zone
        const periodIndex = Math.floor(dataColIndex / 2);
        const isGradeCol = dataColIndex % 2 === 0; // Even = grade, Odd = appreciation

        if (periodIndex < periods.length) {
            const period = periods[periodIndex];
            return isGradeCol ? `MOY_${period}` : `APP_${period}`;
        }

        // Fallback
        return 'IGNORE';
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
     * Binds events for custom dropdowns
     * @private
     */
    _bindCustomSelectEvents() {
        const wrappers = document.querySelectorAll('.custom-select-wrapper');

        // Helper function to close all open dropdowns
        const closeAllDropdowns = (exceptWrapper = null) => {
            document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
                if (w === exceptWrapper) return;

                // Find the portal in body or already in the wrapper
                const portal = document.body.querySelector(`.portal-dropdown[data-parent="${w.dataset.col}"]`);
                if (portal) {
                    w.appendChild(portal);
                    portal.classList.remove('open', 'portal-dropdown');
                    portal.removeAttribute('data-parent');
                    portal.style.cssText = '';
                }
                w.classList.remove('open');
            });
        };

        wrappers.forEach(wrapper => {
            const trigger = wrapper.querySelector('.custom-select-trigger');
            const optionsContainer = wrapper.querySelector('.custom-select-options');
            const options = wrapper.querySelectorAll('.custom-option');

            // Toggle dropdown
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = wrapper.classList.contains('open');

                // ALWAYS close all others first
                closeAllDropdowns(isOpen ? null : wrapper);

                if (isOpen) {
                    // Close self
                    const portal = document.body.querySelector(`.portal-dropdown[data-parent="${wrapper.dataset.col}"]`);
                    if (portal) {
                        wrapper.append(portal);
                        portal.classList.remove('open', 'portal-dropdown');
                        portal.style.cssText = '';
                    }
                    wrapper.classList.remove('open');
                } else {
                    // Open self (Portal Mode)
                    wrapper.classList.add('open');

                    // Mark options
                    optionsContainer.dataset.parent = wrapper.dataset.col;
                    optionsContainer.classList.add('portal-dropdown');

                    document.body.appendChild(optionsContainer);

                    // Calculate position (Fixed works better than absolute for portals to avoid scroll parent issues)
                    const rect = wrapper.getBoundingClientRect();

                    optionsContainer.style.position = 'fixed'; // FIXED to guarantee floating on top
                    optionsContainer.style.top = `${rect.bottom + 4}px`;
                    optionsContainer.style.left = `${rect.left}px`;
                    optionsContainer.style.minWidth = '220px'; // Explicit min-width
                    optionsContainer.style.width = 'max-content'; // Allow it to grow
                    optionsContainer.style.maxWidth = '300px';
                    optionsContainer.style.zIndex = '99999'; // Super high

                    // Check if it goes off screen bottom
                    const viewportHeight = window.innerHeight;
                    if (rect.bottom + 300 > viewportHeight) {
                        // Flip upwards if no space
                        optionsContainer.style.top = 'auto';
                        optionsContainer.style.bottom = `${viewportHeight - rect.top + 4}px`;
                    }

                    optionsContainer.classList.add('open');
                }
            });

            // Select option
            options.forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const value = option.dataset.value;
                    const text = option.textContent.trim();

                    // Update trigger text
                    trigger.querySelector('span').textContent = text;
                    trigger.classList.add('active'); // Highlight active state

                    // Update data-type for color coding
                    let newType = 'ignored';
                    if (value === 'Nom & Prénom') newType = 'name';
                    else if (value === 'Statut') newType = 'status';
                    else if (value.includes('Moy.')) newType = 'grade';
                    else if (value.includes('Appréciation')) newType = 'appreciation';
                    else if (value === 'Contexte') newType = 'context';
                    trigger.dataset.type = newType;

                    // Update wrapper data value
                    wrapper.dataset.selectedValue = value;

                    // Update selected visual state
                    options.forEach(opt => opt.classList.remove('selected'));
                    option.classList.add('selected');

                    // Close dropdown (return to parent)
                    if (document.body.contains(optionsContainer)) {
                        wrapper.appendChild(optionsContainer);
                        optionsContainer.classList.remove('open', 'portal-dropdown');
                        optionsContainer.style.cssText = '';
                    }
                    wrapper.classList.remove('open');

                    // Trigger preview update logic
                    this._updatePreview();
                });
            });
        });

        // Close on click outside
        const closeAll = (e) => {
            if (!e.target.closest('.custom-select-trigger') && !e.target.closest('.portal-dropdown')) {
                closeAllDropdowns();
            }
        };

        // Scroll listener - close all dropdowns on scroll
        const closeOnScroll = () => closeAllDropdowns();

        document.removeEventListener('click', this._closeDropdownsHandler);
        this._closeDropdownsHandler = closeAll;
        document.addEventListener('click', this._closeDropdownsHandler);

        // Also attach scroll listener to modal body to close on scroll
        const modalBody = document.querySelector('.import-wizard-body');
        if (modalBody) {
            modalBody.removeEventListener('scroll', closeOnScroll);
            modalBody.addEventListener('scroll', closeOnScroll);
        }
    },

    _closeDropdownsHandler: null, // Placeholder property

    /**
     * Guess column type with improved logic (ported from ImportUIManager)
     */
    _guessType(sample, index, headerLine = null) {
        const periods = Utils.getPeriods();

        // 1. Try keyword matching if headerLine is provided and looks like a header
        if (headerLine && headerLine.length > index) {
            const h = headerLine[index].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

            // Logique plus stricte : le mot-clé doit être au début du mot ou être le titre entier
            const matchKeyword = (title, kw) => {
                const regex = new RegExp(`(^|\\s)${kw}(\\s|$)`, 'i');
                return regex.test(title);
            };

            const headerKeywordMap = {
                'Nom & Prénom': ['nom', 'prenom', 'eleve', 'étudiant'],
                'Statut': ['statut'],
            };

            for (const [friendly, keywords] of Object.entries(headerKeywordMap)) {
                if (keywords.some(kw => matchKeyword(h, kw))) return friendly;
            }

            // Period specific keywords (Moy. T1, Appr. T1, Contexte T1)
            const periodKeyboards = {
                'Moy. ': ['moy', 'note', 'moyenne'],
                'Appréciation ': ['app', 'commentaire', 'appreciation'],
                'Contexte ': ['contexte', 'ctx', 'observation', 'remarque', 'instruction']
            };
            for (const [prefix, keywords] of Object.entries(periodKeyboards)) {
                if (keywords.some(kw => matchKeyword(h, kw))) {
                    // Try to find period in header (T1, T2, S1...)
                    const match = h.match(/([ts])\s?(\d)/i); // Adjusted regex to capture both letter and digit
                    if (match) {
                        const p = (match[1] + match[2]).toUpperCase();
                        if (periods.includes(p)) return prefix + p;
                    }
                }
            }
        }

        // 2. Fallback to content-based guessing

        // Index 0 is always Name
        if (index === 0) return 'Nom & Prénom';

        // Statut en 2ème position (index 1) - short text or empty
        if (index === 1 && (sample === '' || (sample.length < 10 && !Utils.isNumeric(sample)))) return 'Statut';

        // Contexte à la fin - long text, not a number
        if (index === this.state.columnCount - 1 && !Utils.isNumeric(sample) && sample.length > 15) return 'Contexte';

        // Content-based detection for remaining columns
        // If it's a number, it's a grade
        if (Utils.isNumeric(sample)) {
            // Determine which period based on position
            const gradeColumns = [];
            for (let i = 0; i < this.state.columnCount; i++) {
                const colSample = this.state.lines[0]?.[i] || '';
                if (Utils.isNumeric(colSample)) gradeColumns.push(i);
            }
            const gradeIndex = gradeColumns.indexOf(index);
            if (gradeIndex >= 0 && gradeIndex < periods.length) {
                return `Moy. ${periods[gradeIndex]}`;
            }
            return `Moy. ${periods[0]}`;
        }

        // Long text (>15 chars) is likely an appreciation
        if (sample.length > 15) {
            // Find which appreciation this is by counting text columns before it
            const textColumns = [];
            for (let i = 2; i < this.state.columnCount; i++) {
                const colSample = this.state.lines[0]?.[i] || '';
                if (!Utils.isNumeric(colSample) && colSample.length > 15) textColumns.push(i);
            }
            const appIndex = textColumns.indexOf(index);
            if (appIndex >= 0 && appIndex < periods.length) {
                return `Appréciation ${periods[appIndex]}`;
            }
            return `Appréciation ${periods[0]}`;
        }

        return 'Ignorer';
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
     * Initialize format toggle based on saved format existence
     * @private
     */
    _initFormatToggle() {
        const toggle = document.getElementById('wizardSaveFormatToggle');
        const label = document.getElementById('formatToggleLabel');
        if (!toggle) return;

        // Check if a format is saved for current period
        const savedFormat = appState.massImportFormats?.[appState.periodSystem]?.[appState.currentPeriod];

        if (savedFormat) {
            toggle.checked = true;
            if (label) label.textContent = 'Enregistré';
        } else {
            toggle.checked = false;
            if (label) label.textContent = 'Auto';
        }
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

        if (strategy === 'replace') appState.generatedResults = [];

        await MassImportManager.importStudentsOnly(this.state.studentsToProcess, this.state.ignoredCount || 0);

        this.close();
    },

    /**
     * Generate appreciations
     */
    async _generate() {
        if (this.state.studentsToProcess.length === 0) return;

        this._saveFormat();

        const { MassImportManager } = await import('./MassImportManager.js');
        const strategy = document.querySelector('input[name="wizardStrategy"]:checked')?.value || 'merge';

        if (strategy === 'replace') appState.generatedResults = [];

        this.close();
        await MassImportManager.processMassImport(this.state.studentsToProcess, 0);
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
            departedStudents: []
        };
        document.getElementById('wizardDataTextarea').value = '';
        this._updateUI();
    }
};
