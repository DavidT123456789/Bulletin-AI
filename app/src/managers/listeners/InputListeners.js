/**
 * @fileoverview Listeners de la section d'entrée (formulaires, imports)
 * @module managers/listeners/InputListeners
 */

import { DOM } from '../../utils/DOM.js';
import { Utils } from '../../utils/Utils.js';
import { AppreciationsManager } from '../AppreciationsManager.js';
import { FileImportManager } from '../FileImportManager.js';

let App = null;

export const InputListeners = {
    init(appInstance) {
        App = appInstance;
    },

    /**
     * Configure les listeners de la section d'entrée (formulaires, imports).
     * @param {Function} addClickListener - Helper pour ajouter un listener click
     */
    setup(addClickListener) {
        addClickListener(DOM.singleStudentTab, App.handleSingleStudentTabClick);
        addClickListener(DOM.massImportTab, App.handleMassImportTabClick);

        // Mass Import Listeners - delegated to FileImportManager
        addClickListener(DOM.importFileBtn, () => FileImportManager.handleImportFileBtnClick());
        addClickListener(DOM.clearImportBtn, () => FileImportManager.handleClearImportClick());
        addClickListener(DOM.loadSampleDataLink, () => AppreciationsManager.loadSampleData());
        addClickListener(DOM.cancelImportOutputBtn, () => FileImportManager.handleCancelImportOutputClick());

        if (DOM.massData) {
            DOM.massData.addEventListener('input', () => FileImportManager.handleMassDataInput());
            DOM.massData.addEventListener('paste', () => FileImportManager.handleMassDataPaste());
        }

        // Load Student Select - Charger un élève existant avec scroll vers la carte
        if (DOM.loadStudentSelect) {
            DOM.loadStudentSelect.addEventListener('change', (e) => {
                AppreciationsManager.loadStudentIntoForm(e.target.value);
            });
        }

        const inputs = [DOM.nomInput, DOM.prenomInput];

        Utils.getPeriods().forEach(p => {
            const gInput = document.getElementById(`moy${p}`);
            const aInput = document.getElementById(`app${p}`);
            if (gInput) inputs.push(gInput);
            if (aInput) inputs.push(aInput);
        });

        inputs.forEach(input => {
            if (input) {
                input.addEventListener('input', App.handleInputFieldChange);
                input.addEventListener('keydown', (e) => { if (e.key === 'Enter') App.handleInputEnterKey(e); });
            }
        });

        document.querySelectorAll('input[name="statuses"]').forEach(cb => {
            cb.addEventListener('change', App.handleInputFieldChange);
        });
    }
};
