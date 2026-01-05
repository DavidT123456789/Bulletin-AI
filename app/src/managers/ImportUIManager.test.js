/**
 * @fileoverview Tests unitaires pour ImportUIManager.js
 * @module managers/ImportUIManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock des dépendances
vi.mock('../state/State.js', () => ({
    appState: {
        massImportFormats: {},
        periodSystem: 'trimestre',
        currentPeriod: 'T1'
    }
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {
        massData: { value: '' },
        clearImportBtn: { style: { display: 'none' } },
        massImportPreview: { style: { display: 'none' }, innerHTML: '' },
        importPreviewModal: { querySelector: vi.fn() },
        separatorSelect: { value: '' },
        customSeparatorInput: { style: { display: 'none' }, value: '' },
        mappingHeaders: {
            querySelector: vi.fn(() => null),
            hasChildNodes: vi.fn(() => false),
            appendChild: vi.fn(),
            querySelectorAll: vi.fn(() => [])
        },
        mappingPreviewData: { innerHTML: '' },
        importSavedFormatInfo: { innerHTML: '', style: { display: 'none' } },
        strategyMergeRadio: { checked: false },
        saveMappingCheckbox: { checked: false },
        importGenerateBtn: { disabled: false, innerHTML: '', dataset: {} },
        clearImportBtn: { disabled: false, style: { display: 'none' } },
        massData: { disabled: false, value: '' },
        importFileBtn: { disabled: false },
        loadSampleDataLink: { disabled: false },
        dropZone: { classList: { toggle: vi.fn() } }
    }
}));

vi.mock('../utils/Utils.js', () => ({
    Utils: {
        getPeriods: vi.fn(() => ['T1', 'T2', 'T3']),
        isNumeric: vi.fn((val) => !isNaN(parseFloat(val)) && isFinite(val)),
        detectSeparator: vi.fn(() => '\t')
    }
}));

vi.mock('./ModalUIManager.js', () => ({
    ModalUI: {
        openModal: vi.fn()
    }
}));

import { ImportUI } from './ImportUIManager.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { appState } from '../state/State.js';
import { ModalUI } from './ModalUIManager.js';

describe('ImportUIManager', () => {
    let mockUI;
    let mockApp;

    beforeEach(() => {
        vi.clearAllMocks();

        mockUI = {
            initTooltips: vi.fn()
        };
        mockApp = {
            updateImportPreview: vi.fn()
        };

        ImportUI.init(mockUI, mockApp);

        // Reset DOM mocks
        DOM.massData.value = '';
        DOM.clearImportBtn.style.display = 'none';
        DOM.massImportPreview.style.display = 'none';
        DOM.massImportPreview.innerHTML = '';
    });

    describe('init()', () => {
        it('should initialize with UI and App instances', () => {
            const ui = { initTooltips: vi.fn() };
            const app = { updateImportPreview: vi.fn() };

            ImportUI.init(ui, app);

            // Vérifier que l'init ne lance pas d'erreur
            expect(true).toBe(true);
        });
    });

    describe('_getMappingOptions()', () => {
        it('should return array of mapping options', () => {
            const options = ImportUI._getMappingOptions();

            expect(Array.isArray(options)).toBe(true);
            expect(options.length).toBeGreaterThan(0);
        });

        it('should include IGNORE option first', () => {
            const options = ImportUI._getMappingOptions();

            expect(options[0]).toEqual({ v: 'IGNORE', t: 'Ignorer' });
        });

        it('should include NOM_PRENOM option', () => {
            const options = ImportUI._getMappingOptions();

            const nomOption = options.find(o => o.v === 'NOM_PRENOM');
            expect(nomOption).toBeDefined();
            expect(nomOption.t).toBe('Nom & Prénom');
        });

        it('should include STATUT and INSTRUCTIONS options', () => {
            const options = ImportUI._getMappingOptions();

            expect(options.find(o => o.v === 'STATUT')).toBeDefined();
            expect(options.find(o => o.v === 'INSTRUCTIONS')).toBeDefined();
        });

        it('should include period-based options for each period', () => {
            Utils.getPeriods.mockReturnValue(['T1', 'T2', 'T3']);

            const options = ImportUI._getMappingOptions();

            expect(options.find(o => o.v === 'MOY_T1')).toBeDefined();
            expect(options.find(o => o.v === 'APP_T1')).toBeDefined();
            expect(options.find(o => o.v === 'MOY_T2')).toBeDefined();
            expect(options.find(o => o.v === 'APP_T2')).toBeDefined();
        });
    });

    describe('_guessInitialMapping()', () => {
        it('should use saved format if available', () => {
            appState.massImportFormats = {
                trimestre: {
                    T1: '{NOM_PRENOM} | {MOY_T1} | {IGNORE}'
                }
            };
            appState.periodSystem = 'trimestre';
            appState.currentPeriod = 'T1';

            const selects = [
                { value: '' },
                { value: '' },
                { value: '' }
            ];
            const firstLineData = ['Jean Dupont', '15', 'Commentaire'];
            const options = [
                { v: 'NOM_PRENOM', t: 'Nom & Prénom' },
                { v: 'MOY_T1', t: 'Moy. T1' },
                { v: 'IGNORE', t: 'Ignorer' }
            ];

            ImportUI._guessInitialMapping(selects, firstLineData, options);

            expect(selects[0].value).toBe('NOM_PRENOM');
            expect(selects[1].value).toBe('MOY_T1');
            expect(selects[2].value).toBe('IGNORE');
        });

        it('should guess mapping from headers when no saved format', () => {
            appState.massImportFormats = {};

            const selects = [
                { value: '' },
                { value: '' },
                { value: '' }
            ];
            const firstLineData = ['Nom Élève', '15.5', 'Instructions'];
            const options = [
                { v: 'IGNORE', t: 'Ignorer' },
                { v: 'NOM_PRENOM', t: 'Nom & Prénom' },
                { v: 'MOY_T1', t: 'Moy. T1' },
                { v: 'INSTRUCTIONS', t: 'Instructions' }
            ];

            ImportUI._guessInitialMapping(selects, firstLineData, options);

            // La fonction doit avoir assigné les valeurs
            expect(selects.some(s => s.value !== '')).toBe(true);
        });

        it('should set all selects to IGNORE if empty data', () => {
            appState.massImportFormats = {};

            const selects = [
                { value: '' },
                { value: '' }
            ];
            const firstLineData = ['', ''];
            const options = [{ v: 'IGNORE', t: 'Ignorer' }];

            ImportUI._guessInitialMapping(selects, firstLineData, options);

            expect(selects[0].value).toBe('IGNORE');
            expect(selects[1].value).toBe('IGNORE');
        });
    });

    describe('updateMassImportPreview()', () => {
        it('should hide preview when no text', () => {
            DOM.massData.value = '';

            ImportUI.updateMassImportPreview();

            expect(DOM.clearImportBtn.style.display).toBe('none');
            expect(DOM.massImportPreview.style.display).toBe('none');
        });

        it('should show clear button when text is present', () => {
            DOM.massData.value = 'Jean Dupont\t15\nMarie Martin\t14';

            ImportUI.updateMassImportPreview();

            expect(DOM.clearImportBtn.style.display).toBe('inline-flex');
        });

        it('should hide preview when only whitespace', () => {
            DOM.massData.value = '   \n  \t  ';

            ImportUI.updateMassImportPreview();

            expect(DOM.massImportPreview.style.display).toBe('none');
        });

        it('should display student count in preview', () => {
            DOM.massData.value = 'Jean Dupont\t15\nMarie Martin\t14';

            ImportUI.updateMassImportPreview();

            expect(DOM.massImportPreview.innerHTML).toContain('2');
            expect(DOM.massImportPreview.innerHTML).toContain('élèves');
        });

        it('should use singular "élève" for single student', () => {
            DOM.massData.value = 'Jean Dupont\t15';

            ImportUI.updateMassImportPreview();

            expect(DOM.massImportPreview.innerHTML).toContain('1');
            expect(DOM.massImportPreview.innerHTML).toContain('élève');
            expect(DOM.massImportPreview.innerHTML).not.toContain('élèves');
        });

        it('should show warning when only one column detected', () => {
            DOM.massData.value = 'JeanDupont15\nMarieMartin14';
            Utils.detectSeparator.mockReturnValue('\t');

            ImportUI.updateMassImportPreview();

            expect(DOM.massImportPreview.innerHTML).toContain('⚠️');
        });

        it('should call initTooltips after update', () => {
            DOM.massData.value = 'Jean Dupont\t15';

            ImportUI.updateMassImportPreview();

            expect(mockUI.initTooltips).toHaveBeenCalled();
        });

        it('should display detected separator name', () => {
            DOM.massData.value = 'Jean Dupont\t15';
            Utils.detectSeparator.mockReturnValue('\t');

            ImportUI.updateMassImportPreview();

            expect(DOM.massImportPreview.innerHTML).toContain('Tabulation');
        });
    });

    describe('openImportPreviewModal()', () => {
        beforeEach(() => {
            DOM.importPreviewModal.querySelector = vi.fn(() => ({ open: false }));
            DOM.mappingHeaders.querySelector = vi.fn(() => document.createElement('tr'));
            DOM.mappingHeaders.querySelectorAll = vi.fn(() => []);
            // Ajouter appendChild au mock
            DOM.mappingPreviewData.appendChild = vi.fn();
        });

        it('should open the modal', () => {
            const mappingState = {
                lines: [['Jean', '15']],
                columnCount: 2,
                separator: '\t'
            };

            ImportUI.openImportPreviewModal(mappingState);

            expect(ModalUI.openModal).toHaveBeenCalledWith(DOM.importPreviewModal);
        });

        it('should set separator select to tab for tab separator', () => {
            const mappingState = {
                lines: [['Jean', '15']],
                columnCount: 2,
                separator: '\t'
            };

            ImportUI.openImportPreviewModal(mappingState);

            expect(DOM.separatorSelect.value).toBe('tab');
        });

        it('should set separator select for comma', () => {
            const mappingState = {
                lines: [['Jean', '15']],
                columnCount: 2,
                separator: ','
            };

            ImportUI.openImportPreviewModal(mappingState);

            expect(DOM.separatorSelect.value).toBe(',');
        });

        it('should handle custom separator', () => {
            const mappingState = {
                lines: [['Jean', '15']],
                columnCount: 2,
                separator: '#'
            };

            ImportUI.openImportPreviewModal(mappingState);

            expect(DOM.separatorSelect.value).toBe('custom');
            expect(DOM.customSeparatorInput.value).toBe('#');
        });

        it('should show saved format info when format exists', () => {
            appState.massImportFormats = {
                trimestre: { T1: '{NOM_PRENOM}' }
            };

            const mappingState = {
                lines: [['Jean', '15']],
                columnCount: 2,
                separator: '\t'
            };

            ImportUI.openImportPreviewModal(mappingState);

            expect(DOM.importSavedFormatInfo.style.display).toBe('flex');
        });

        it('should hide saved format info when no format exists', () => {
            appState.massImportFormats = {};

            const mappingState = {
                lines: [['Jean', '15']],
                columnCount: 2,
                separator: '\t'
            };

            ImportUI.openImportPreviewModal(mappingState);

            expect(DOM.importSavedFormatInfo.style.display).toBe('none');
        });

        it('should handle empty lines array', () => {
            const mappingState = {
                lines: [],
                columnCount: 0,
                separator: '\t'
            };

            ImportUI.openImportPreviewModal(mappingState);

            expect(DOM.mappingPreviewData.innerHTML).toContain('Aucune donnée');
        });

        it('should call App.updateImportPreview', () => {
            const mappingState = {
                lines: [['Jean', '15']],
                columnCount: 2,
                separator: '\t'
            };

            ImportUI.openImportPreviewModal(mappingState);

            expect(mockApp.updateImportPreview).toHaveBeenCalled();
        });
    });

    describe('setMassImportProcessingState()', () => {
        it('should disable elements when processing', () => {
            ImportUI.setMassImportProcessingState(true);

            expect(DOM.importGenerateBtn.disabled).toBe(true);
            expect(DOM.clearImportBtn.disabled).toBe(true);
            expect(DOM.massData.disabled).toBe(true);
        });

        it('should enable elements when not processing', () => {
            // First set to processing
            ImportUI.setMassImportProcessingState(true);
            // Then set to not processing
            ImportUI.setMassImportProcessingState(false);

            expect(DOM.importGenerateBtn.disabled).toBe(false);
            expect(DOM.clearImportBtn.disabled).toBe(false);
            expect(DOM.massData.disabled).toBe(false);
        });

        it('should toggle dropZone processing class', () => {
            ImportUI.setMassImportProcessingState(true);

            expect(DOM.dropZone.classList.toggle).toHaveBeenCalledWith('processing', true);
        });

        it('should show loading spinner when processing', () => {
            DOM.importGenerateBtn.innerHTML = 'Générer';

            ImportUI.setMassImportProcessingState(true);

            expect(DOM.importGenerateBtn.innerHTML).toContain('loading-spinner');
            expect(DOM.importGenerateBtn.innerHTML).toContain('Traitement...');
        });

        it('should restore original button content when done', () => {
            DOM.importGenerateBtn.innerHTML = '<i class="fas fa-bolt"></i> Générer';
            DOM.importGenerateBtn.dataset.originalContent = DOM.importGenerateBtn.innerHTML;

            ImportUI.setMassImportProcessingState(false);

            expect(DOM.importGenerateBtn.innerHTML).toContain('Générer');
        });

        it('should set default button content if no original saved', () => {
            DOM.importGenerateBtn.dataset.originalContent = '';

            ImportUI.setMassImportProcessingState(false);

            expect(DOM.importGenerateBtn.innerHTML).toContain('Générer');
        });
    });
});
