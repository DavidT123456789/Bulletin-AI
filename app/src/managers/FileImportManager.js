/**
 * @fileoverview Gestionnaire des imports de fichiers et données en masse
 * @module managers/FileImportManager
 * 
 * Responsabilités :
 * - Gestion du trigger d'import en masse
 * - Prévisualisation et configuration du mapping de colonnes
 * - Confirmation et exécution de l'import
 * - Gestion des formats d'import sauvegardés
 */

import { appState, massImportMappingState, currentImportPreviewData, setMassImportMappingState, setCurrentImportPreviewData } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { detectSeparator, parseLine } from '../utils/ImportUtils.js';
import { UI } from './UIManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { StorageManager } from './StorageManager.js';

export const FileImportManager = {
    /**
     * Déclenche le processus d'import en masse
     * Parse les données, détecte le séparateur et ouvre la modale de prévisualisation
     */
    handleMassImportTrigger() {
        if (!UI.checkAPIKeyPresence()) return;
        const massData = DOM.massData.value.trim();
        if (!massData) {
            UI.showNotification('Veuillez coller ou importer des données avant de générer.', 'warning');
            return;
        }

        const rawLines = massData.split('\n').filter(line => line.trim() !== '');
        const separator = detectSeparator(massData);
        let lines = [], columnCount = 0;

        if (rawLines.length > 0) {
            lines = rawLines.map(line => parseLine(line, separator));
            columnCount = Math.max(...lines.map(p => p.length));
        }

        setMassImportMappingState({ rawData: rawLines, lines, columnCount, separator, formatMap: {} });
        UI.openImportPreviewModal(massImportMappingState);
    },

    /**
     * Gère la confirmation de la prévisualisation d'import
     * Construit le format map, détermine la stratégie et lance l'import
     */
    async handleImportPreviewConfirmation() {
        const selects = DOM.importPreviewModal.querySelectorAll('select.mapping-select');
        const formatMap = {};
        selects.forEach(s => {
            const val = s.value;
            if (val !== 'IGNORE') {
                formatMap[val] = parseInt(s.dataset.colIndex, 10);
            }
        });

        const strategy = DOM.strategyMergeRadio.checked ? 'merge' : 'replace';
        const { studentsToProcess, ignoredCount, departedStudents } = currentImportPreviewData;

        if (strategy === 'replace') {
            appState.generatedResults = [];
        } else if (strategy === 'merge' && departedStudents.length > 0) {
            const departedStudentNames = new Set(departedStudents.map(s => Utils.normalizeName(s.nom, s.prenom)));
            appState.generatedResults.forEach(result => {
                const studentKey = Utils.normalizeName(result.nom, result.prenom);
                if (departedStudentNames.has(studentKey)) {
                    result.studentData.statuses = [`Départ ${appState.currentPeriod}`];
                    if (!result.studentData.periods[appState.currentPeriod]) {
                        result.studentData.periods[appState.currentPeriod] = { grade: null, appreciation: '' };
                    }
                }
            });
        }

        if (DOM.saveMappingCheckbox.checked) {
            let formatString = Array.from(selects).map(s => `{{${s.value}}}`).join(' | ');
            if (!appState.massImportFormats[appState.periodSystem]) appState.massImportFormats[appState.periodSystem] = {};
            appState.massImportFormats[appState.periodSystem][appState.currentPeriod] = formatString;
            StorageManager.saveAppState();
            UI.showNotification("Format d'import sauvegardé pour cette période !", "info");
        }

        UI.closeModal(DOM.importPreviewModal);
        await AppreciationsManager.processMassImport(studentsToProcess, ignoredCount);
    },

    /**
     * Gère l'import sans génération d'appréciations
     * Crée des cartes élèves qui pourront être générées plus tard
     */
    async handleImportOnlyConfirmation() {
        const selects = DOM.importPreviewModal.querySelectorAll('select.mapping-select');
        const formatMap = {};
        selects.forEach(s => {
            const val = s.value;
            if (val !== 'IGNORE') {
                formatMap[val] = parseInt(s.dataset.colIndex, 10);
            }
        });

        const strategy = DOM.strategyMergeRadio.checked ? 'merge' : 'replace';
        const { studentsToProcess, ignoredCount, departedStudents } = currentImportPreviewData;

        if (strategy === 'replace') {
            appState.generatedResults = [];
        } else if (strategy === 'merge' && departedStudents.length > 0) {
            const departedStudentNames = new Set(departedStudents.map(s => Utils.normalizeName(s.nom, s.prenom)));
            appState.generatedResults.forEach(result => {
                const studentKey = Utils.normalizeName(result.nom, result.prenom);
                if (departedStudentNames.has(studentKey)) {
                    result.studentData.statuses = [`Départ ${appState.currentPeriod}`];
                    if (!result.studentData.periods[appState.currentPeriod]) {
                        result.studentData.periods[appState.currentPeriod] = { grade: null, appreciation: '' };
                    }
                }
            });
        }

        if (DOM.saveMappingCheckbox.checked) {
            let formatString = Array.from(selects).map(s => `{{${s.value}}}`).join(' | ');
            if (!appState.massImportFormats[appState.periodSystem]) appState.massImportFormats[appState.periodSystem] = {};
            appState.massImportFormats[appState.periodSystem][appState.currentPeriod] = formatString;
            StorageManager.saveAppState();
        }

        UI.closeModal(DOM.importPreviewModal);

        // Import dynamique pour éviter la dépendance circulaire
        const { MassImportManager } = await import('./MassImportManager.js');
        await MassImportManager.importStudentsOnly(studentsToProcess, ignoredCount);
    },

    /**
     * Récupère le séparateur depuis la modale de configuration
     * @returns {string} Le caractère séparateur
     */
    _getSeparatorFromModal() {
        const selected = DOM.separatorSelect.value;
        if (selected === 'custom') {
            return DOM.customSeparatorInput.value || '\t';
        }
        if (selected === 'tab') {
            return '\t';
        }
        return selected;
    },

    /**
     * Met à jour la prévisualisation d'import
     * Recalcule les colonnes, valide le mapping et affiche les résultats
     */
    updateImportPreview() {
        const strategy = DOM.strategyMergeRadio.checked ? 'merge' : 'replace';
        const grid = DOM.importPreviewGrid;
        const warning = DOM.importPreviewReplaceWarning;
        const strategyContainer = DOM.importStrategyContainer;

        const separator = this._getSeparatorFromModal();
        massImportMappingState.separator = separator;
        if (massImportMappingState.rawData.length > 0) {
            massImportMappingState.lines = massImportMappingState.rawData.map(line =>
                (separator === '\t' ? line.split(/\t+/) : line.split(separator)).map(p => p.trim())
            );
        }

        const selects = DOM.importPreviewModal.querySelectorAll('select.mapping-select');
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
            const mappingAccordion = DOM.importPreviewModal.querySelector('details.details-accordion');
            if (mappingAccordion && !mappingAccordion.open) {
                mappingAccordion.open = true;
            }
        }
        DOM.importSummaryText.innerHTML = summaryHTML;
        DOM.importSummaryText.style.textAlign = 'left';
        // Désactiver le bouton d'import si le mapping est invalide
        if (DOM.importOnlyBtn) DOM.importOnlyBtn.disabled = !isMappingValid;

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
    },

    /**
     * Oublie le format d'import sauvegardé pour la période courante
     * Réinitialise le mapping automatique
     */
    forgetSavedImportFormat() {
        if (appState.massImportFormats[appState.periodSystem]) {
            delete appState.massImportFormats[appState.periodSystem][appState.currentPeriod];
        }
        StorageManager.saveAppState();
        UI.showNotification("Format mémorisé oublié.", "info");

        const { lines } = massImportMappingState;
        const selects = DOM.mappingHeaders.querySelectorAll('select.mapping-select');
        const options = UI._getMappingOptions();
        UI._guessInitialMapping(selects, lines[0] || [], options);

        const infoBox = DOM.importSavedFormatInfo;
        infoBox.style.display = 'none';

        this.updateImportPreview();
    },

    /**
     * Gère l'import d'un fichier
     * @param {File} file - Le fichier à importer
     */
    handleFileImport(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const content = e.target.result;
            if (file.name.endsWith('.json')) {
                StorageManager.importSettings(content);
            } else {
                DOM.massData.value = content;
                // Dynamically import to avoid circular dependency
                const { ImportUI } = await import('./ImportUIManager.js');
                ImportUI.updateMassImportPreview();
                UI.showNotification("Fichier chargé. Vérifiez l'aperçu.", "success");
            }
        };
        reader.readAsText(file);
    },

    // --- Event Handlers ---

    handleImportFileBtnClick() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.txt,.tsv,.json';
        input.onchange = (e) => this.handleFileImport(e.target.files[0]);
        input.click();
    },

    handleClearImportClick() {
        DOM.massData.value = '';
        DOM.massImportActions.style.display = 'none';
        DOM.clearImportBtn.style.display = 'none';
        DOM.massImportPreview.style.display = 'none';
        DOM.massImportPreview.innerHTML = '';
        setMassImportMappingState({ rawData: [], lines: [], columnCount: 0, separator: '\t', formatMap: {} });
    },

    handleMassDataInput() {
        const hasData = DOM.massData.value.trim().length > 0;
        DOM.massImportActions.style.display = hasData ? 'flex' : 'none';
        DOM.clearImportBtn.style.display = hasData ? 'inline-flex' : 'none';
    },

    handleMassDataPaste() {
        setTimeout(() => {
            this.handleMassDataInput();
        }, 0);
    },

    handleCancelImportOutputClick() {
        // Import dynamique pour éviter la dépendance circulaire
        import('./MassImportManager.js').then(({ MassImportManager }) => {
            MassImportManager.cancelImport();
        });
    }
};
