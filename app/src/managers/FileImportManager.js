/**
 * @fileoverview Gestionnaire des imports de fichiers et données en masse
 * @module managers/FileImportManager
 * 
 * Responsabilités :
 * - Gestion du trigger d'import en masse
 * - Gestion des fichiers importés
 * 
 * Note: La modale d'import preview a été migrée vers ImportWizardManager
 */

import { appState, massImportMappingState, setMassImportMappingState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { detectSeparator, parseLine } from '../utils/ImportUtils.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';

export const FileImportManager = {
    /**
     * Déclenche le processus d'import en masse
     * Parse les données, détecte le séparateur et ouvre la modale de prévisualisation
     */
    handleMassImportTrigger() {
        if (!UI.checkAPIKeyPresence()) return;
        const massData = DOM.massData?.value?.trim();
        if (!massData) {
            UI.showNotification('Veuillez coller ou importer des données avant de générer.', 'warning');
            return;
        }
        this.handleMassImportWithData(massData);
    },

    /**
     * Déclenche l'import avec des données fournies directement
     * @param {string} dataText - Les données texte à importer
     */
    handleMassImportWithData(dataText) {
        if (!dataText || !dataText.trim()) {
            UI.showNotification('Aucune donnée à importer.', 'warning');
            return;
        }

        const rawLines = dataText.split('\n').filter(line => line.trim() !== '');
        const separator = detectSeparator(dataText);
        let lines = [], columnCount = 0;

        if (rawLines.length > 0) {
            lines = rawLines.map(line => parseLine(line, separator));
            columnCount = Math.max(...lines.map(p => p.length));
        }

        setMassImportMappingState({ rawData: rawLines, lines, columnCount, separator, formatMap: {} });

        // Open the new Import Wizard instead of old modal
        import('./ImportWizardManager.js').then(({ ImportWizardManager }) => {
            ImportWizardManager.openWithData(dataText);
        });
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
                // Open import wizard with file content
                import('./ImportWizardManager.js').then(({ ImportWizardManager }) => {
                    ImportWizardManager.openWithData(content);
                });
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
        if (DOM.massData) DOM.massData.value = '';
        if (DOM.massImportActions) DOM.massImportActions.style.display = 'none';
        if (DOM.clearImportBtn) DOM.clearImportBtn.style.display = 'none';
        if (DOM.massImportPreview) {
            DOM.massImportPreview.style.display = 'none';
            DOM.massImportPreview.innerHTML = '';
        }
        setMassImportMappingState({ rawData: [], lines: [], columnCount: 0, separator: '\t', formatMap: {} });
    },

    handleMassDataInput() {
        const hasData = DOM.massData?.value?.trim().length > 0;
        if (DOM.massImportActions) DOM.massImportActions.style.display = hasData ? 'flex' : 'none';
        if (DOM.clearImportBtn) DOM.clearImportBtn.style.display = hasData ? 'inline-flex' : 'none';
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
