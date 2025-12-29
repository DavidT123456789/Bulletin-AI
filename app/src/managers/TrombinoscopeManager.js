/**
 * @fileoverview Trombinoscope Manager - Photo extraction from class photos
 * Phase 2 of Student Photo Feature
 * @module managers/TrombinoscopeManager
 */

import { appState } from '../state/State.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';

/**
 * Manages the trombinoscope photo import workflow
 * @namespace TrombinoscopeManager
 */
export const TrombinoscopeManager = {
    /** Current step in the wizard */
    _currentStep: 1,

    /** Uploaded trombinoscope image data */
    _trombiImage: null,

    /** Detected/manual photo zones */
    _photoZones: [],

    /** Student-to-zone assignments */
    _assignments: new Map(),

    /**
     * Initialize the manager and set up event listeners
     */
    init() {
        this._setupEventListeners();
    },

    /**
     * Set up event listeners for the wizard
     * @private
     */
    _setupEventListeners() {
        // Hub card click
        const hubCard = document.querySelector('[data-action="photos"]');
        if (hubCard) {
            hubCard.addEventListener('click', () => this.open());
            hubCard.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.open();
                }
            });
        }

        // Modal controls
        const closeBtn = document.getElementById('closeTrombiWizardBtn');
        if (closeBtn) closeBtn.addEventListener('click', () => this.close());

        // Step 1 cancel button
        const cancelBtn = document.getElementById('trombiStep1CancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());

        const backdrop = document.getElementById('trombiWizardBackdrop');
        if (backdrop) backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) this.close();
        });

        // Drop zone
        const dropZone = document.getElementById('trombiDropZone');
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });
            dropZone.addEventListener('drop', (e) => this._handleDrop(e));
            dropZone.addEventListener('click', () => {
                document.getElementById('trombiFileInput')?.click();
            });
        }

        const fileInput = document.getElementById('trombiFileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this._handleFileSelect(e));
        }

        // Navigation buttons
        document.getElementById('trombiStep1NextBtn')?.addEventListener('click', () => this._goToStep(2));
        document.getElementById('trombiStep2PrevBtn')?.addEventListener('click', () => this._goToStep(1));
        document.getElementById('trombiStep2NextBtn')?.addEventListener('click', () => this._goToStep(3));
        document.getElementById('trombiStep3PrevBtn')?.addEventListener('click', () => this._goToStep(2));
        document.getElementById('trombiConfirmBtn')?.addEventListener('click', () => this._confirmImport());
    },

    /**
     * Open the trombinoscope wizard
     */
    open() {
        // Close the hub first
        const hubBackdrop = document.getElementById('importHubBackdrop');
        if (hubBackdrop) hubBackdrop.classList.remove('visible');

        // Reset state
        this._reset();

        // Show wizard
        const modal = document.getElementById('trombiWizardModal');
        if (modal) {
            modal.classList.add('visible');
            this._goToStep(1);
        }
    },

    /**
     * Close the wizard
     */
    close() {
        const modal = document.getElementById('trombiWizardModal');
        if (modal) modal.classList.remove('visible');
        this._reset();
    },

    /**
     * Reset wizard state
     * @private
     */
    _reset() {
        this._currentStep = 1;
        this._trombiImage = null;
        this._photoZones = [];
        this._assignments.clear();

        // Clear UI
        const preview = document.getElementById('trombiPreview');
        if (preview) preview.innerHTML = '';

        const nextBtn = document.getElementById('trombiStep1NextBtn');
        if (nextBtn) nextBtn.disabled = true;
    },

    /**
     * Navigate to a specific step
     * @param {number} step - Step number (1-3)
     * @private
     */
    _goToStep(step) {
        this._currentStep = step;

        // Update step indicators
        document.querySelectorAll('.trombi-wizard-step').forEach((el, idx) => {
            el.classList.toggle('active', idx + 1 === step);
            el.classList.toggle('completed', idx + 1 < step);
        });

        // Show/hide step content
        document.querySelectorAll('.trombi-step-content').forEach((el, idx) => {
            el.style.display = idx + 1 === step ? 'block' : 'none';
        });

        // Step-specific logic
        if (step === 2) {
            this._renderAssignmentGrid();
        } else if (step === 3) {
            this._renderPreview();
        }
    },

    /**
     * Handle file drop
     * @param {DragEvent} e
     * @private
     */
    _handleDrop(e) {
        e.preventDefault();
        const dropZone = document.getElementById('trombiDropZone');
        if (dropZone) dropZone.classList.remove('dragover');

        const file = e.dataTransfer?.files?.[0];
        if (file) this._processImage(file);
    },

    /**
     * Handle file input selection
     * @param {Event} e
     * @private
     */
    _handleFileSelect(e) {
        const file = e.target?.files?.[0];
        if (file) this._processImage(file);
    },

    /**
     * Process uploaded image
     * @param {File} file
     * @private
     */
    async _processImage(file) {
        if (!file.type.startsWith('image/')) {
            UI.showNotification('Veuillez sélectionner une image', 'warning');
            return;
        }

        // Read and display preview
        const reader = new FileReader();
        reader.onload = (e) => {
            this._trombiImage = e.target.result;

            const preview = document.getElementById('trombiPreview');
            if (preview) {
                preview.innerHTML = `
                    <div class="trombi-image-container">
                        <img src="${this._trombiImage}" alt="Trombinoscope" class="trombi-image">
                        <div class="trombi-image-overlay" id="trombiOverlay">
                            <!-- Photo zones will be rendered here -->
                        </div>
                    </div>
                `;
            }

            // Enable next button
            const nextBtn = document.getElementById('trombiStep1NextBtn');
            if (nextBtn) nextBtn.disabled = false;

            // Auto-detect faces (placeholder - could use AI in future)
            this._autoDetectZones();
        };
        reader.readAsDataURL(file);
    },

    /**
     * Auto-detect photo zones (grid-based for now)
     * Future: Could use face detection API
     * @private
     */
    _autoDetectZones() {
        // For now, create a simple grid based on student count
        const studentCount = appState.generatedResults.length;
        if (studentCount === 0) {
            UI.showNotification('Aucun élève dans la classe. Importez d\'abord les données.', 'warning');
            return;
        }

        // Create grid zones (5 columns by default)
        const cols = Math.min(5, studentCount);
        const rows = Math.ceil(studentCount / cols);

        this._photoZones = [];
        for (let i = 0; i < studentCount; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            this._photoZones.push({
                id: i,
                x: col / cols,
                y: row / rows,
                width: 1 / cols,
                height: 1 / rows
            });
        }

        this._renderZoneOverlay();
    },

    /**
     * Render zone overlay on the image
     * @private
     */
    _renderZoneOverlay() {
        const overlay = document.getElementById('trombiOverlay');
        if (!overlay) return;

        overlay.innerHTML = this._photoZones.map((zone, idx) => `
            <div class="trombi-zone" 
                 data-zone-id="${zone.id}"
                 style="left: ${zone.x * 100}%; top: ${zone.y * 100}%; 
                        width: ${zone.width * 100}%; height: ${zone.height * 100}%">
                <span class="zone-number">${idx + 1}</span>
            </div>
        `).join('');
    },

    /**
     * Render the student-to-zone assignment grid
     * @private
     */
    _renderAssignmentGrid() {
        const container = document.getElementById('trombiAssignmentGrid');
        if (!container) return;

        const students = appState.generatedResults;

        container.innerHTML = `
            <div class="assignment-header">
                <span>Élève</span>
                <span>Zone photo</span>
            </div>
            ${students.map((student, idx) => `
                <div class="assignment-row" data-student-id="${student.id}">
                    <div class="assignment-student">
                        ${StudentPhotoManager.getAvatarHTML(student, 'sm')}
                        <span>${student.prenom} ${student.nom}</span>
                    </div>
                    <select class="assignment-select" data-student-id="${student.id}">
                        <option value="">-- Aucune --</option>
                        ${this._photoZones.map((zone, zIdx) => `
                            <option value="${zone.id}" ${zIdx === idx ? 'selected' : ''}>
                                Zone ${zIdx + 1}
                            </option>
                        `).join('')}
                    </select>
                </div>
            `).join('')}
        `;

        // Pre-populate assignments
        students.forEach((student, idx) => {
            if (idx < this._photoZones.length) {
                this._assignments.set(student.id, this._photoZones[idx].id);
            }
        });

        // Listen for changes
        container.querySelectorAll('.assignment-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const studentId = e.target.dataset.studentId;
                const zoneId = e.target.value ? parseInt(e.target.value) : null;
                if (zoneId !== null) {
                    this._assignments.set(studentId, zoneId);
                } else {
                    this._assignments.delete(studentId);
                }
            });
        });
    },

    /**
     * Render final preview before import
     * @private
     */
    _renderPreview() {
        const container = document.getElementById('trombiPreviewGrid');
        if (!container) return;

        const assignedCount = this._assignments.size;
        const students = appState.generatedResults;

        container.innerHTML = `
            <div class="preview-summary">
                <i class="fas fa-check-circle"></i>
                <span><strong>${assignedCount}</strong> photos seront associées sur ${students.length} élèves</span>
            </div>
            <div class="preview-list">
                ${Array.from(this._assignments.entries()).map(([studentId, zoneId]) => {
            const student = students.find(s => s.id === studentId);
            if (!student) return '';
            return `
                        <div class="preview-item">
                            ${StudentPhotoManager.getAvatarHTML(student, 'sm')}
                            <span>${student.prenom} ${student.nom}</span>
                            <span class="zone-badge">Zone ${zoneId + 1}</span>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    },

    /**
     * Confirm and execute the photo import
     * @private
     */
    async _confirmImport() {
        if (this._assignments.size === 0) {
            UI.showNotification('Aucune photo à importer', 'warning');
            return;
        }

        // Extract photos from zones and assign
        const img = document.querySelector('.trombi-image');
        if (!img) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const targetSize = 200;
        canvas.width = targetSize;
        canvas.height = targetSize;

        const assignments = [];

        for (const [studentId, zoneId] of this._assignments) {
            const zone = this._photoZones[zoneId];
            if (!zone) continue;

            // Calculate crop coordinates
            const sx = zone.x * img.naturalWidth;
            const sy = zone.y * img.naturalHeight;
            const sw = zone.width * img.naturalWidth;
            const sh = zone.height * img.naturalHeight;

            // Draw cropped zone to canvas
            ctx.clearRect(0, 0, targetSize, targetSize);
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetSize, targetSize);

            const photoData = canvas.toDataURL('image/jpeg', 0.85);
            assignments.push({ studentId, photoData });
        }

        // Bulk assign
        const count = await StudentPhotoManager.bulkAssignPhotos(assignments);

        if (count > 0) {
            UI.showNotification(`${count} photos importées avec succès`, 'success');
            // Trigger UI refresh
            window.dispatchEvent(new CustomEvent('studentsUpdated'));
        }

        this.close();
    }
};
