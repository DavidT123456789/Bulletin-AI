/**
 * @fileoverview Tests unitaires pour ExportManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExportManager } from './ExportManager.js';

// Mock navigator.clipboard
const mockClipboard = {
    writeText: vi.fn(() => Promise.resolve())
};
Object.defineProperty(navigator, 'clipboard', {
    value: mockClipboard,
    writable: true,
    configurable: true
});

// Mock window.print
const mockPrint = vi.fn();
Object.defineProperty(window, 'print', {
    value: mockPrint,
    writable: true,
    configurable: true
});

// Mock des dépendances
vi.mock('../state/State.js', () => ({
    appState: {
        generatedResults: [],
        filteredResults: [],
        currentSubject: 'Français',
        currentPeriod: 'T1',
        periodSystem: 'trimestres'
    }
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {
        originalAppreciationText: {
            textContent: 'Original text',
            classList: { contains: vi.fn(() => false) }
        },
        suggestedAppreciationText: {
            textContent: 'Suggested text',
            classList: { contains: vi.fn(() => false) }
        },
        refinementModal: {
            querySelector: vi.fn(() => ({
                innerHTML: '',
                classList: { add: vi.fn(), remove: vi.fn() }
            }))
        }
    }
}));

vi.mock('../utils/Utils.js', () => ({
    Utils: {
        getPeriods: vi.fn(() => ['T1', 'T2', 'T3']),
        getPeriodLabel: vi.fn((p, short) => short ? p : `Trimestre ${p.slice(1)}`),
        decodeHtmlEntities: vi.fn(text => text)
    }
}));

vi.mock('./UIManager.js', () => ({
    UI: {
        showNotification: vi.fn()
    }
}));

vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn(),
        _downloadFile: vi.fn()
    }
}));

import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';

describe('ExportManager', () => {
    let mockApp;

    beforeEach(() => {
        mockApp = {};
        ExportManager.init(mockApp);

        // Reset mocks
        vi.clearAllMocks();
        mockClipboard.writeText.mockResolvedValue(undefined);

        // Reset appState
        appState.generatedResults = [];
        appState.filteredResults = [];
        appState.currentSubject = 'Français';
        appState.currentPeriod = 'T1';
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('init', () => {
        it('should initialize with app instance', () => {
            const appInstance = { test: true };
            ExportManager.init(appInstance);
            expect(true).toBe(true);
        });
    });

    describe('copyAppreciation', () => {
        const mockResult = {
            id: 'test-id-1',
            nom: 'MARTIN',
            prenom: 'Lucas',
            appreciation: 'Test appreciation',
            copied: false,
            studentData: {
                currentPeriod: 'T1',
                periods: { T1: { grade: 12.5 } }
            }
        };

        beforeEach(() => {
            appState.generatedResults = [mockResult];
            appState.filteredResults = [mockResult];
        });

        it('should return early if result not found', () => {
            ExportManager.copyAppreciation('non-existent', null);

            expect(mockClipboard.writeText).not.toHaveBeenCalled();
        });

        it('should show error if appreciation is empty', () => {
            appState.generatedResults = [{ ...mockResult, appreciation: '' }];
            appState.filteredResults = [{ ...mockResult, appreciation: '' }];

            ExportManager.copyAppreciation('test-id-1', null);

            expect(UI.showNotification).toHaveBeenCalledWith('Appréciation vide.', 'error');
        });

        it('should copy appreciation to clipboard', async () => {
            await ExportManager.copyAppreciation('test-id-1', null);

            expect(mockClipboard.writeText).toHaveBeenCalledWith('Test appreciation');
        });

        it('should mark result as copied', async () => {
            appState.generatedResults = [{ ...mockResult }];

            await ExportManager.copyAppreciation('test-id-1', null);

            // Wait for promise to resolve
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(appState.generatedResults[0].copied).toBe(true);
        });

        it('should save app state after copy', async () => {
            await ExportManager.copyAppreciation('test-id-1', null);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(StorageManager.saveAppState).toHaveBeenCalled();
        });

        it('should show success notification', async () => {
            await ExportManager.copyAppreciation('test-id-1', null);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(UI.showNotification).toHaveBeenCalledWith('Copiée !', 'success');
        });

        it('should update button state if button provided', async () => {
            const button = document.createElement('button');
            button.innerHTML = '<i class="fas fa-copy"></i>';
            button.classList.add = vi.fn();
            button.classList.remove = vi.fn();

            await ExportManager.copyAppreciation('test-id-1', button);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(button.innerHTML).toBe('<i class="fas fa-check"></i>');
            expect(button.classList.add).toHaveBeenCalledWith('copied');
        });

        it('should handle clipboard errors', async () => {
            mockClipboard.writeText.mockRejectedValueOnce(new Error('Clipboard error'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await ExportManager.copyAppreciation('test-id-1', null);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(UI.showNotification).toHaveBeenCalledWith('Échec copie.', 'error');

            consoleSpy.mockRestore();
        });
    });

    describe('copyRefinementText', () => {
        beforeEach(() => {
            DOM.originalAppreciationText.textContent = 'Original text';
            DOM.suggestedAppreciationText.textContent = 'Suggested text';
            DOM.originalAppreciationText.classList.contains = vi.fn(() => false);
            DOM.suggestedAppreciationText.classList.contains = vi.fn(() => false);
        });

        it('should copy original text when type is original', async () => {
            await ExportManager.copyRefinementText('original');

            expect(mockClipboard.writeText).toHaveBeenCalledWith('Original text');
        });

        it('should copy suggested text when type is suggested', async () => {
            await ExportManager.copyRefinementText('suggested');

            expect(mockClipboard.writeText).toHaveBeenCalledWith('Suggested text');
        });

        it('should show success notification with correct type', async () => {
            await ExportManager.copyRefinementText('original');

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(UI.showNotification).toHaveBeenCalledWith('Texte original copié !', 'success');
        });

        it('should show warning if text is empty', () => {
            DOM.originalAppreciationText.textContent = '';

            ExportManager.copyRefinementText('original');

            expect(UI.showNotification).toHaveBeenCalledWith('Aucun texte à copier.', 'warning');
            expect(mockClipboard.writeText).not.toHaveBeenCalled();
        });

        it('should show warning if text is placeholder', () => {
            DOM.originalAppreciationText.classList.contains = vi.fn(() => true);

            ExportManager.copyRefinementText('original');

            expect(UI.showNotification).toHaveBeenCalledWith('Aucun texte à copier.', 'warning');
        });
    });

    describe('copyAllResults', () => {
        it('should show warning if no results to copy', () => {
            appState.filteredResults = [];

            ExportManager.copyAllResults();

            expect(UI.showNotification).toHaveBeenCalledWith("Rien à copier.", "warning");
        });

        it('should copy all filtered results', async () => {
            appState.filteredResults = [
                { nom: 'MARTIN', prenom: 'Lucas', appreciation: 'Appreciation 1' },
                { nom: 'DURAND', prenom: 'Sophie', appreciation: 'Appreciation 2' }
            ];

            await ExportManager.copyAllResults();

            const expectedText = 'MARTIN Lucas\nAppreciation 1\n\nDURAND Sophie\nAppreciation 2';
            expect(mockClipboard.writeText).toHaveBeenCalledWith(expectedText);
        });

        it('should show success notification with count', async () => {
            appState.filteredResults = [
                { nom: 'MARTIN', prenom: 'Lucas', appreciation: 'Appreciation 1' },
                { nom: 'DURAND', prenom: 'Sophie', appreciation: 'Appreciation 2' }
            ];

            await ExportManager.copyAllResults();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(UI.showNotification).toHaveBeenCalledWith('2 appréciations copiées !', 'success');
        });
    });

    describe('exportToCsv', () => {
        it('should show warning if no data to export', () => {
            appState.generatedResults = [];

            ExportManager.exportToCsv();

            expect(UI.showNotification).toHaveBeenCalledWith('Aucune donnée à exporter.', 'warning');
        });

        it('should call _downloadFile with correct parameters', () => {
            appState.generatedResults = [{
                nom: 'MARTIN',
                prenom: 'Lucas',
                appreciation: 'Test',
                timestamp: '2025-01-01T12:00:00Z',
                errorMessage: null,
                strengthsWeaknesses: null,
                nextSteps: null,
                studentData: {
                    currentPeriod: 'T1',
                    subject: 'Français',
                    statuses: [],
                    negativeInstructions: '',
                    periods: {
                        T1: { grade: 12.5, appreciation: '' },
                        T2: { grade: null, appreciation: '' },
                        T3: { grade: null, appreciation: '' }
                    }
                }
            }];

            ExportManager.exportToCsv();

            expect(StorageManager._downloadFile).toHaveBeenCalled();
            const [content, filename, mimeType] = StorageManager._downloadFile.mock.calls[0];
            expect(content).toContain('MARTIN');
            expect(content).toContain('Lucas');
            expect(filename).toContain('bulletin-assistant_export_');
            expect(filename).toContain('.csv');
            expect(mimeType).toBe('text/csv;charset=utf-8;');
        });

        it('should show success notification', () => {
            appState.generatedResults = [{
                nom: 'MARTIN',
                prenom: 'Lucas',
                appreciation: 'Test',
                timestamp: '2025-01-01T12:00:00Z',
                studentData: {
                    currentPeriod: 'T1',
                    subject: 'Français',
                    statuses: [],
                    negativeInstructions: '',
                    periods: { T1: {}, T2: {}, T3: {} }
                }
            }];

            ExportManager.exportToCsv();

            expect(UI.showNotification).toHaveBeenCalledWith('Exporté en CSV.', 'success');
        });
    });

    describe('exportToPdf', () => {
        it('should show warning if no data to export', () => {
            appState.filteredResults = [];

            ExportManager.exportToPdf();

            expect(UI.showNotification).toHaveBeenCalledWith('Aucune donnée à exporter.', 'warning');
        });

        it('should show info notification before printing', () => {
            appState.filteredResults = [{ id: '1' }];

            ExportManager.exportToPdf();

            expect(UI.showNotification).toHaveBeenCalledWith("Préparation de l'export PDF...", 'info');
        });

        it('should call window.print', () => {
            appState.filteredResults = [{ id: '1' }];

            ExportManager.exportToPdf();

            expect(mockPrint).toHaveBeenCalled();
        });

        it('should set custom document title for print', () => {
            appState.filteredResults = [{ id: '1' }];
            const originalTitle = document.title;

            ExportManager.exportToPdf();

            expect(document.title).toContain('Appréciations');
            expect(document.title).toContain('Français');

            // Simulate afterprint
            if (window.onafterprint) {
                window.onafterprint();
            }
            // Title should be restored
        });
    });
});
