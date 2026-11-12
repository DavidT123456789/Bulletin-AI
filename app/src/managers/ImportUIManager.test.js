/**
 * @fileoverview Tests unitaires pour ImportUIManager.js
 * @module managers/ImportUIManager.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
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
        massImportPreview: {
            style: { display: 'none', animation: '' },
            innerHTML: '',
            offsetHeight: 0,
            appendChild: vi.fn()
        },
        importGenerateBtn: { disabled: false, innerHTML: '', dataset: {} },
        clearImportBtn: { disabled: false, style: { display: 'none' } },
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
        DOM.massImportPreview.style.display = 'none';
        DOM.massImportPreview.innerHTML = '';
    });

    describe('init()', () => {
        it('should initialize with UI and App instances', () => {
            const ui = { initTooltips: vi.fn() };
            const app = { updateImportPreview: vi.fn() };

            ImportUI.init(ui, app);

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

        it('should guess mapping from content when no saved format', () => {
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
        let mockCountEl;
        let mockSepNameEl;
        let mockPillsContainer;
        let mockActionsContainer;

        beforeEach(() => {
            mockCountEl = { textContent: '' };
            mockSepNameEl = { textContent: '' };
            mockPillsContainer = { innerHTML: '' };
            mockActionsContainer = { style: { display: '' } };

            document.getElementById = vi.fn((id) => {
                if (id === 'previewStudentCount') return mockCountEl;
                if (id === 'previewSeparatorName') return mockSepNameEl;
                if (id === 'previewMappingPills') return mockPillsContainer;
                if (id === 'massImportActions') return mockActionsContainer;
                return null;
            });
        });

        it('should hide preview when no text', () => {
            DOM.massData.value = '';

            ImportUI.updateMassImportPreview();

            expect(DOM.massImportPreview.style.display).toBe('none');
        });

        it('should hide preview when only whitespace', () => {
            DOM.massData.value = '   \n  \t  ';

            ImportUI.updateMassImportPreview();

            expect(DOM.massImportPreview.style.display).toBe('none');
        });

        it('should show actions container when text is present', () => {
            DOM.massData.value = 'Jean Dupont\t15\nMarie Martin\t14';

            ImportUI.updateMassImportPreview();

            expect(mockActionsContainer.style.display).toBe('flex');
        });

        it('should update student count element', () => {
            DOM.massData.value = 'Jean Dupont\t15\nMarie Martin\t14';

            ImportUI.updateMassImportPreview();

            expect(mockCountEl.textContent).toBe(2);
        });

        it('should update separator name element', () => {
            DOM.massData.value = 'Jean Dupont\t15';
            Utils.detectSeparator.mockReturnValue('\t');

            ImportUI.updateMassImportPreview();

            expect(mockSepNameEl.textContent).toBe('Tabulation');
        });

        it('should show preview block when text is present', () => {
            DOM.massData.value = 'Jean Dupont\t15';

            ImportUI.updateMassImportPreview();

            expect(DOM.massImportPreview.style.display).toBe('block');
        });

        it('should append warning when only one column detected', () => {
            DOM.massData.value = 'JeanDupont15\nMarieMartin14';
            Utils.detectSeparator.mockReturnValue('\t');

            ImportUI.updateMassImportPreview();

            expect(DOM.massImportPreview.appendChild).toHaveBeenCalled();
        });

        it('should call initTooltips after update', () => {
            DOM.massData.value = 'Jean Dupont\t15';

            ImportUI.updateMassImportPreview();

            expect(mockUI.initTooltips).toHaveBeenCalled();
        });

        it('should disable import button when no text', () => {
            DOM.massData.value = '';

            ImportUI.updateMassImportPreview();

            expect(DOM.importGenerateBtn.disabled).toBe(true);
        });

        it('should enable import button when text is present', () => {
            DOM.massData.value = 'Jean Dupont\t15';

            ImportUI.updateMassImportPreview();

            expect(DOM.importGenerateBtn.disabled).toBe(false);
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
            ImportUI.setMassImportProcessingState(true);
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
