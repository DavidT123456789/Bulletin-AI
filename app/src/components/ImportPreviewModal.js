import { Component } from '../core/Component.js';
import { bus } from '../core/EventBus.js';
import { appState, massImportMappingState, setCurrentImportPreviewData } from '../state/State.js';
import { AppreciationsManager } from '../managers/AppreciationsManager.js';
import { Utils } from '../utils/Utils.js';

export class ImportPreviewModal extends Component {
    constructor() {
        super('importPreviewModal'); // Pass the ID of the root element
    }

    init() {
        this.cacheDOM();
        this.bindEvents();
    }

    cacheDOM() {
        super.cacheDOM();
    }

    bindEvents() {
        this.addEvent('closeImportPreviewModalBtn', 'click', () => this.close());
        this.addEvent('cancelImportPreviewBtn', 'click', () => this.close());

        this.addEvent('separatorSelect', 'change', () => this.updatePreview());
        this.addEvent('customSeparatorInput', 'input', () => this.updatePreview());
        this.addEvent('strategyMerge', 'change', () => this.updatePreview());
        this.addEvent('strategyReplace', 'change', () => this.updatePreview());
        this.addEvent('saveMappingCheckbox', 'change', () => {
            // Logic to save mapping state if needed, or handled in updatePreview
        });

        // Mapping selects
        const selects = this.root.querySelectorAll('select.mapping-select');
        selects.forEach(select => {
            select.addEventListener('change', () => this.updatePreview());
        });

        this.addEvent('confirmImportPreviewBtn', 'click', () => {
            bus.emit('confirm-mass-import');
        });
    }

    _getSeparator() {
        const selected = DOM.separatorSelect.value;
        if (selected === 'custom') {
            return DOM.customSeparatorInput.value || '\t';
        }
        if (selected === 'tab') {
            return '\t';
        }
        return selected;
    }

    updatePreview() {
        const strategy = DOM.strategyMergeRadio.checked ? 'merge' : 'replace';
        const grid = DOM.importPreviewGrid;
        const warning = DOM.importPreviewReplaceWarning;
        const strategyContainer = DOM.importStrategyContainer;

        const separator = this._getSeparator();
        massImportMappingState.separator = separator;
        if (massImportMappingState.rawData.length > 0) {
            massImportMappingState.lines = massImportMappingState.rawData.map(line =>
                (separator === '\t' ? line.split(/\t+/) : line.split(separator)).map(p => p.trim())
            );
        }

        const selects = this.root.querySelectorAll('select.mapping-select');
        const formatMap = {};
        let isMappingValid = false;
        selects.forEach(s => {
            const val = s.value;
            if (val !== 'IGNORE') {
                formatMap[val] = parseInt(s.dataset.colIndex, 10);
            }
            if (val === 'NOM_PRENOM') {
                isMappingValid = true;
            }
        });

        const previewData = AppreciationsManager._prepareStudentListForImport(
            massImportMappingState.lines,
            formatMap,
            strategy
        );
        setCurrentImportPreviewData(previewData);

        DOM.importPreviewModalTitle.innerHTML = `<i class="fas fa-tasks"></i> Configurer et prévisualiser l'import`;
        let summaryHTML = `<p><i class="fas fa-info-circle"></i> Analyse : <strong>${previewData.studentsToProcess.length} élèves</strong> seront traités.`;
        if (previewData.ignoredCount > 0) {
            summaryHTML += ` <span class="tooltip" data-tooltip="Lignes vides ou sans nom/prénom.">${previewData.ignoredCount} ligne(s) ignorée(s).</span>`;
        }
        summaryHTML += '</p>';

        if (!isMappingValid) {
            summaryHTML = `<p><i class="fas fa-exclamation-triangle" style="color:var(--error-color);"></i> Le champ "Nom & Prénom" est obligatoire. Veuillez l'assigner à une colonne ci-dessous.</p>`;
            const mappingAccordion = this.root.querySelector('details.details-accordion');
            if (mappingAccordion && !mappingAccordion.open) {
                mappingAccordion.open = true;
            }
        }
        DOM.importSummaryText.innerHTML = summaryHTML;
        DOM.importSummaryText.style.textAlign = 'left';
        DOM.confirmImportPreviewBtn.disabled = !isMappingValid;

        if (appState.generatedResults.length > 0) {
            strategyContainer.style.display = 'block';
        } else {
            strategyContainer.style.display = 'none';
        }

        const populateList = (colId, countEl, data) => {
            const colEl = document.getElementById(colId);
            if (!colEl) return;
            const listEl = colEl.querySelector('ul');

            colEl.style.display = 'block';
            countEl.textContent = data.length;

            if (data.length > 0) {
                colEl.classList.remove('is-empty');
                listEl.innerHTML = data.map(s => `<li>${s.prenom} ${s.nom}</li>`).join('');
            } else {
                colEl.classList.add('is-empty');
                listEl.innerHTML = '<li class="empty-list-placeholder">Aucun élève.</li>';
            }
        };

        if (strategy === 'merge') {
            grid.style.display = 'grid';
            warning.style.display = 'none';
            grid.classList.remove('replace-mode');

            document.getElementById('import-preview-updated-col').style.display = 'block';
            populateList('import-preview-new-col', DOM.newCount, previewData.newStudents);
            populateList('import-preview-updated-col', DOM.updatedCount, previewData.updatedStudents);
            populateList('import-preview-departed-col', DOM.departedCount, previewData.departedStudents);

        } else { // Replace mode
            grid.style.display = 'grid';
            grid.classList.add('replace-mode');
            warning.style.display = 'block';
            warning.innerHTML = `⚠️ <strong>Attention :</strong> Cette action supprimera vos <strong>${appState.generatedResults.length} élèves</strong> actuels et les remplacera par les <strong>${previewData.newStudents.length}</strong> de cet import.`;

            document.getElementById('import-preview-updated-col').style.display = 'none';
            populateList('import-preview-new-col', DOM.newCount, previewData.newStudents);
            populateList('import-preview-departed-col', DOM.departedCount, previewData.departedStudents);
            DOM.updatedCount.textContent = '0';
        }
    }

    open() {
        if (this.root) {
            this.root.style.display = 'block';
            this.root.setAttribute('aria-hidden', 'false');
        }
    }

    close() {
        if (this.root) {
            this.root.style.display = 'none';
            this.root.setAttribute('aria-hidden', 'true');
        }
    }
}
