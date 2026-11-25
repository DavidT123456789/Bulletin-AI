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
vi.mock('../state/State.js', () => {
    const appState = {
        generatedResults: [],
        filteredResults: [],
        classes: [],
        currentClassId: null,
        currentSubject: 'Français',
        currentPeriod: 'T1',
        periodSystem: 'trimestres'
    };
    const userSettings = {
        academic: {
            get classes() { return appState.classes; },
            set classes(v) { appState.classes = v; },
            get currentClassId() { return appState.currentClassId; },
            set currentClassId(v) { appState.currentClassId = v; }
        }
    };
    return { appState, userSettings, runtimeState: { data: {} } };
});

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

vi.mock('../utils/Utils.js', async (importOriginal) => {
    const orig = (await importOriginal()).Utils;
    const esc = (text) => {
        if (!text) return text;
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };
    return {
        Utils: {
            ...orig,
            getPeriods: vi.fn(() => ['T1', 'T2', 'T3']),
            getPeriodLabel: vi.fn((p, short) => short ? p : `Trimestre ${p.slice(1)}`),
            decodeHtmlEntities: vi.fn(text => text),
            stripMarkdown: vi.fn(text => text),
            cleanMarkdown: vi.fn(text => esc(text)),
            getRelevantEvolution: vi.fn(() => null),
            getActiveStatuses: vi.fn((r) => r?.studentData?.statuses || []),
            isStudentDepartedBeforePeriod: vi.fn(() => false),
            sortResults: vi.fn(arr => arr),
            escapeHtml: vi.fn(esc),
            formatStudentName: vi.fn((nom, prenom, html = false) => html ? `<strong>${nom.toUpperCase()}</strong> <span class="student-prenom">${prenom}</span>` : `${nom.toUpperCase()} ${prenom}`)
        }
    };
});

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
        appState.classes = [];
        appState.currentClassId = null;
        appState.currentSubject = 'Français';
        appState.currentPeriod = 'T1';
    });

    afterEach(() => {
        vi.clearAllMocks();
        delete document.body.dataset.printMode;
        document.getElementById('print-report-root')?.remove();
        document.getElementById('print-dynamic-page-style')?.remove();
        window.onafterprint = null;
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
            generationPeriod: 'T1',
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

        it('should save state on success', async () => {
            await ExportManager.copyAppreciation('test-id-1', null);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(StorageManager.saveAppState).toHaveBeenCalled();
        });

        it('should update button state if button provided', async () => {
            const button = document.createElement('button');
            button.innerHTML = '<iconify-icon icon="solar:copy-linear"></iconify-icon>';

            await ExportManager.copyAppreciation('test-id-1', button);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(button.innerHTML).toContain('ph:check-bold');
            expect(button.classList.contains('copied')).toBe(true);
        });

        it('should restore original button icon even after rapid double-click', async () => {
            vi.useFakeTimers();
            try {
                const button = document.createElement('button');
                button.innerHTML = '<iconify-icon icon="solar:copy-linear"></iconify-icon>';
                const onAfterCopy = vi.fn();

                await ExportManager.copyAppreciation('test-id-1', button, onAfterCopy);
                expect(button.innerHTML).toContain('ph:check-bold');

                // Second rapid click while confirmation flash is still active
                vi.advanceTimersByTime(500);
                await ExportManager.copyAppreciation('test-id-1', button, onAfterCopy);

                // First timer would have fired at 1500ms, must be cancelled
                vi.advanceTimersByTime(1000);
                expect(onAfterCopy).not.toHaveBeenCalled();
                expect(button.classList.contains('copy-success')).toBe(true);

                // Second timer finishes at 2000ms total -> original icon restored
                vi.advanceTimersByTime(500);
                expect(button.innerHTML).toContain('solar:copy-linear');
                expect(button.classList.contains('copy-success')).toBe(false);
                expect(onAfterCopy).toHaveBeenCalledTimes(1);
            } finally {
                vi.useRealTimers();
            }
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

    describe('copyAllResults', () => {
        it('should show warning if no results to copy', () => {
            appState.filteredResults = [];

            ExportManager.copyAllResults();

            expect(UI.showNotification).toHaveBeenCalledWith("Rien à copier.", "warning");
        });

        it('should copy all filtered results', async () => {
            appState.filteredResults = [
                { nom: 'MARTIN', prenom: 'Lucas', appreciation: 'Appreciation 1', generationPeriod: 'T1' },
                { nom: 'DURAND', prenom: 'Sophie', appreciation: 'Appreciation 2', generationPeriod: 'T1' }
            ];

            await ExportManager.copyAllResults();

            const expectedText = 'MARTIN Lucas\nAppreciation 1\n\nDURAND Sophie\nAppreciation 2';
            expect(mockClipboard.writeText).toHaveBeenCalledWith(expectedText);
        });

        it('should show success notification with count', async () => {
            appState.filteredResults = [
                { nom: 'MARTIN', prenom: 'Lucas', appreciation: 'Appreciation 1', generationPeriod: 'T1' },
                { nom: 'DURAND', prenom: 'Sophie', appreciation: 'Appreciation 2', generationPeriod: 'T1' }
            ];

            await ExportManager.copyAllResults();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(UI.showNotification).toHaveBeenCalledWith('2 appréciations copiées !', 'success');
        });

        it('should not leak T1 root appreciation when copying in T2 without T2 appreciation', () => {
            appState.currentPeriod = 'T2';
            const student = {
                id: 't1-only',
                nom: 'MARTIN',
                prenom: 'Lucas',
                appreciation: 'Appréciation T1',
                generationPeriod: 'T1',
                studentData: { periods: { T1: { appreciation: 'Appréciation T1' }, T2: { grade: 14 } } }
            };
            appState.generatedResults = [student];
            appState.filteredResults = [student];

            ExportManager.copyAppreciation('t1-only', null);
            expect(mockClipboard.writeText).not.toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalledWith('Appréciation vide.', 'error');

            ExportManager.copyAllResults();
            expect(mockClipboard.writeText).not.toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalledWith('Aucune appréciation à copier pour cette période.', 'warning');
        });
    });

    describe('exportToCsv', () => {
        it('should show warning if no data to export', () => {
            appState.filteredResults = [];

            ExportManager.exportToCsv();

            expect(UI.showNotification).toHaveBeenCalledWith('Aucune donnée à exporter.', 'warning');
        });

        it('should call _downloadFile with correct parameters', () => {
            appState.filteredResults = [{
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
            expect(filename).toContain('bulletin-ai');
            expect(filename).toContain('.csv');
            expect(mimeType).toBe('text/csv;charset=utf-8;');
        });

        it('should show success notification', () => {
            appState.filteredResults = [{
                nom: 'MARTIN',
                prenom: 'Lucas',
                appreciation: 'Test',
                timestamp: '2025-01-01T12:00:00Z',
                studentData: {
                    currentPeriod: 'T1',
                    subject: 'Français',
                    statuses: [],
                    periods: { T1: {}, T2: {}, T3: {} }
                }
            }];
            appState.currentPeriod = 'T1';

            ExportManager.exportToCsv();

            expect(UI.showNotification).toHaveBeenCalledWith(expect.stringContaining('CSV exporté'), 'success');
        });

        it('should export configured iaConfig.discipline instead of internal MonStyle/Générique keys in CSV', () => {
            appState.currentSubject = 'MonStyle';
            appState.subjects = {
                MonStyle: { iaConfig: { discipline: 'Histoire-Géographie' } }
            };
            appState.filteredResults = [{
                nom: 'MARTIN',
                prenom: 'Lucas',
                appreciation: 'Test',
                timestamp: '2025-01-01T12:00:00Z',
                studentData: {
                    currentPeriod: 'T1',
                    subject: 'MonStyle',
                    statuses: [],
                    periods: { T1: { grade: 14, appreciation: 'Bon travail' }, T2: {}, T3: {} }
                }
            }];

            ExportManager.exportToCsv();
            const [content] = StorageManager._downloadFile.mock.calls[0];
            expect(content).toContain('Histoire-Géographie');
            expect(content).not.toContain('MonStyle');

            // Sans discipline configurée et avec clé interne Générique -> cellule vide, jamais "Générique"
            StorageManager._downloadFile.mockClear();
            appState.subjects = { MonStyle: { iaConfig: { discipline: '' } } };
            appState.currentSubject = 'Générique';
            appState.filteredResults[0].studentData.subject = 'Générique';
            ExportManager.exportToCsv();
            const [contentEmpty] = StorageManager._downloadFile.mock.calls[0];
            expect(contentEmpty).not.toContain('Générique');
        });

        it('should track copied status per period independently (T1 copied does not mark T2)', async () => {
            const student = {
                id: 'period-copy-1',
                nom: 'DUPONT',
                prenom: 'Alice',
                appreciation: 'Très bien en T1',
                generationPeriod: 'T1',
                studentData: {
                    periods: {
                        T1: { appreciation: 'Très bien en T1' },
                        T2: { appreciation: 'Poursuivre en T2' }
                    }
                }
            };
            appState.generatedResults = [student];
            appState.currentPeriod = 'T1';

            await ExportManager.copyAppreciation('period-copy-1', null);
            expect(Utils.isAppreciationCopied(student, 'T1')).toBe(true);
            expect(Utils.isAppreciationCopied(student, 'T2')).toBe(false);

            appState.currentPeriod = 'T2';
            await ExportManager.copyAppreciation('period-copy-1', null);
            expect(Utils.isAppreciationCopied(student, 'T2')).toBe(true);
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

        it('should render autonomous A4 portrait report in #print-report-root, escape XSS, and clean up after print', () => {
            appState.currentPeriod = 'T2';
            appState.currentSubject = 'Français';
            appState.currentClassId = 'c-xss';
            appState.classes = [{ id: 'c-xss', name: '<img src=x onerror=alert(1)>' }];
            appState.filteredResults = [
                {
                    id: '1',
                    nom: 'MARTIN',
                    prenom: 'Lucas',
                    evolutions: { T2: { delta: 1.5 } },
                    studentData: {
                        statuses: ['Délégué'],
                        periods: { T2: { grade: 14.5, appreciation: 'Très bon trimestre : efforts constants.' } }
                    }
                },
                {
                    id: '2',
                    nom: '<script>alert(1)</script>',
                    prenom: 'Zoé',
                    studentData: {
                        statuses: [],
                        periods: { T2: { grade: 11.5, appreciation: '' } }
                    }
                }
            ];

            Utils.getRelevantEvolution.mockImplementation((evolutions, period) => evolutions?.[period] || null);
            let rootEl = null;
            let capturedMode = '';
            let capturedPageCss = '';
            mockPrint.mockImplementationOnce(() => {
                capturedMode = document.body.dataset.printMode;
                rootEl = document.getElementById('print-report-root');
                capturedPageCss = document.getElementById('print-dynamic-page-style')?.textContent || '';
            });

            ExportManager.exportToPdf();
            Utils.getRelevantEvolution.mockImplementation(() => null);

            expect(capturedMode).toBe('report');
            expect(capturedPageCss).toContain('A4 portrait');
            expect(rootEl).not.toBeNull();
            expect(rootEl.querySelector('img')).toBeNull();
            expect(rootEl.querySelector('script')).toBeNull();
            expect(rootEl.textContent).toContain('<img src=x onerror=alert(1)>');
            expect(rootEl.textContent).toContain('Français');
            expect(rootEl.textContent).toContain('Moyenne 13,0/20');
            expect(rootEl.textContent).toContain('MARTIN Lucas');
            expect(rootEl.textContent).toContain('14,5/20');
            expect(rootEl.textContent).toContain('+1,5 pt');
            expect(rootEl.textContent).toContain('Délégué');
            expect(rootEl.innerHTML).toContain('trimestre&nbsp;:');
            expect(rootEl.textContent).toContain('Appréciation non rédigée.');
            expect(rootEl.querySelector('.pr-footer')).not.toBeNull();

            window.onafterprint?.();
            expect(document.getElementById('print-report-root')).toBeNull();
            expect(document.body.dataset.printMode).toBeUndefined();
        });
    });

    describe('copyStudentList', () => {
        beforeEach(() => {
            // Mock DOM environment for querySelectorAll
            document.body.innerHTML = '';
        });

        it('should show warning if no students to copy', () => {
            appState.filteredResults = [];

            ExportManager.copyStudentList();

            expect(UI.showNotification).toHaveBeenCalledWith("Aucun élève à copier.", "warning");
            expect(mockClipboard.writeText).not.toHaveBeenCalled();
        });

        it('should copy all visible students in NOM Prénom format if none selected', async () => {
            appState.filteredResults = [
                { id: '1', nom: 'martin', prenom: 'Lucas' },
                { id: '2', nom: 'durand', prenom: 'Sophie' }
            ];

            await ExportManager.copyStudentList();

            const expectedText = 'MARTIN Lucas\nDURAND Sophie';
            expect(mockClipboard.writeText).toHaveBeenCalledWith(expectedText);
            expect(UI.showNotification).toHaveBeenCalledWith('2 élèves copiés dans le presse-papiers !', 'success');
        });

        it('should copy only selected students if a selection exists', async () => {
            appState.filteredResults = [
                { id: '1', nom: 'martin', prenom: 'Lucas' },
                { id: '2', nom: 'durand', prenom: 'Sophie' },
                { id: '3', nom: 'legrand', prenom: 'Pierre' }
            ];

            // Mock selected students in the DOM
            document.body.innerHTML = `
                <table>
                    <tr class="student-row selected" data-student-id="1"></tr>
                    <tr class="student-row" data-student-id="2"></tr>
                    <tr class="student-row selected" data-student-id="3"></tr>
                </table>
            `;

            await ExportManager.copyStudentList();

            const expectedText = 'MARTIN Lucas\nLEGRAND Pierre';
            expect(mockClipboard.writeText).toHaveBeenCalledWith(expectedText);
            expect(UI.showNotification).toHaveBeenCalledWith('2 élèves de la sélection copiés dans le presse-papiers !', 'success');
        });

        it('should handle clipboard errors', async () => {
            appState.filteredResults = [{ id: '1', nom: 'martin', prenom: 'Lucas' }];
            mockClipboard.writeText.mockRejectedValueOnce(new Error('Clipboard error'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await ExportManager.copyStudentList();

            expect(UI.showNotification).toHaveBeenCalledWith("Échec de la copie.", "error");
            consoleSpy.mockRestore();
        });
    });

    describe('exportClassDashboardPdf', () => {
        it('affiche un avertissement si aucune statistique de classe n est disponible', () => {
            ExportManager.exportClassDashboardPdf({ stats: null });
            expect(UI.showNotification).toHaveBeenCalledWith('Aucune donnée à exporter pour la classe.', 'warning');
            expect(mockPrint).not.toHaveBeenCalled();
        });

        it('injecte une synthèse A4 portrait complète (KPIs, SVG, synthèse IA, listes) et nettoie après impression', () => {
            appState.currentClassId = 'c1';
            appState.classes = [{ id: 'c1', name: '3°B' }];
            appState.currentPeriod = 'T2';

            let capturedRootHtml = '';
            let capturedMode = '';
            let capturedPageCss = '';
            mockPrint.mockImplementationOnce(() => {
                capturedMode = document.body.dataset.printMode;
                capturedRootHtml = document.getElementById('print-report-root')?.innerHTML || '';
                capturedPageCss = document.getElementById('print-dynamic-page-style')?.textContent || '';
            });

            ExportManager.exportClassDashboardPdf({
                subject: 'Mathématiques',
                stats: {
                    count: 24,
                    average: 13.4,
                    median: 13.8,
                    min: 6.5,
                    max: 19.0,
                    stdDev: 2.8,
                    successRate: 83.3,
                    aboveTenCount: 20,
                    avgEvolution: 0.7,
                    hasEvolutionData: true,
                    heterogeneity: { label: 'Équilibrée' },
                    distribution: [0, 2, 4, 12, 6],
                    periodAverages: [
                        { period: 'T1', average: 12.7, count: 24 },
                        { period: 'T2', average: 13.4, count: 24 }
                    ],
                    topProgressions: [{ fullName: 'DURAND Léo', grade: 14.5, evolution: 2.3 }],
                    atRisk: [{ fullName: 'PETIT Zoé', grade: 7.5, evolution: -1.6 }]
                },
                synthesisSections: [
                    { title: 'Appréciation de classe', isIntro: true, text: 'Classe dynamique en progrès.' },
                    { title: 'Points d appui', isIntro: false, items: ['Participation orale active'], tone: 'success' }
                ]
            });

            expect(capturedMode).toBe('report');
            expect(capturedPageCss).toContain('A4 portrait');
            expect(capturedRootHtml).toContain('3°B');
            expect(capturedRootHtml).toContain('Mathématiques');
            expect(capturedRootHtml).toContain('13,4');
            expect(capturedRootHtml).toContain('DURAND Léo');
            expect(capturedRootHtml).toContain('PETIT Zoé');
            expect(capturedRootHtml).toContain('Classe dynamique en progrès.');
            expect(capturedRootHtml).toContain('Participation orale active');
            expect(capturedRootHtml).toContain('class="print-chart-svg"');
            expect(document.title).toContain('Bilan-de-classe_3°B_T2');

            window.onafterprint?.();
            expect(document.getElementById('print-report-root')).toBeNull();
            expect(document.getElementById('print-dynamic-page-style')).toBeNull();
            expect(document.body.dataset.printMode).toBeUndefined();
        });

        it('échappe les balises HTML potentiellement malveillantes (XSS) et supporte le repli sans T1', () => {
            appState.currentPeriod = 'T1';
            appState.filteredResults = [
                { id: '1', nom: '<img src=x onerror=alert(1)>', prenom: 'Test', studentData: { periods: { T1: { grade: 11 } } } }
            ];

            let rootEl = null;
            mockPrint.mockImplementationOnce(() => {
                rootEl = document.getElementById('print-report-root');
            });

            ExportManager.exportClassDashboardPdf(null);

            expect(rootEl).not.toBeNull();
            expect(rootEl.querySelector('img')).toBeNull();
            expect(rootEl.innerHTML).toContain('La comparaison inter-périodes');
            window.onafterprint?.();
        });
    });

    describe('exportStudentReportPdf', () => {
        const buildStudentFixture = () => ({
            id: 'stu-1',
            classId: 'c1',
            nom: 'MARTIN',
            prenom: 'Lucas',
            appreciation: 'Élève sérieux, poursuit ses efforts à l écrit.',
            strengthsWeaknesses: {
                strengths: ['Rigueur dans le travail'],
                weaknesses: ['Prise de parole encore timide']
            },
            nextSteps: ['Participer davantage à l oral'],
            studentData: {
                subject: 'Français',
                statuses: ['Délégué', 'PPRE', 'PAP', 'PAI', 'AESH', 'ULIS', 'DYS', 'TDAH', 'TSA', 'SEGPA', 'Suivi PAP', 'Aménagement PAI'],
                journal: [
                    { date: '2026-01-10', text: 'NOTE INTERNE CONFIDENTIELLE SANTE' }
                ],
                periods: {
                    T1: {
                        grade: 13.0,
                        context: 'CONTEXTE PRIVE ENSEIGNANT NE PAS IMPRIMER'
                    },
                    T2: {
                        grade: 15.0,
                        appreciation: 'Très bon trimestre en nette progression.',
                        context: 'CONFIDENTIEL FAMILLE'
                    }
                }
            }
        });

        it('affiche un avertissement si l élève est introuvable', () => {
            ExportManager.exportStudentReportPdf('unknown-id');
            expect(UI.showNotification).toHaveBeenCalledWith('Élève introuvable pour l\'export PDF.', 'warning');
            expect(mockPrint).not.toHaveBeenCalled();
        });

        it('exclut par défaut les statuts RGPD Art. 9 (PAP/PAI/AESH/ULIS), le contexte privé et le journal', () => {
            appState.currentClassId = 'c1';
            appState.classes = [{ id: 'c1', name: '4°2' }];
            appState.currentPeriod = 'T2';

            const student = buildStudentFixture();
            const peer = {
                id: 'stu-2',
                classId: 'c1',
                nom: 'DURAND',
                prenom: 'Emma',
                studentData: { periods: { T1: { grade: 11.0 }, T2: { grade: 12.0 } } }
            };
            appState.generatedResults = [student, peer];

            let capturedHtml = '';
            mockPrint.mockImplementationOnce(() => {
                capturedHtml = document.getElementById('print-report-root')?.innerHTML || '';
            });

            ExportManager.exportStudentReportPdf('stu-1');

            // Contenu attendu
            expect(capturedHtml).toContain('MARTIN Lucas');
            expect(capturedHtml).toContain('4°2');
            expect(capturedHtml).toContain('Délégué');
            expect(capturedHtml).toContain('15,0/20');
            expect(capturedHtml).toContain('+2,0 pt');
            expect(capturedHtml).toContain('Très bon trimestre en nette progression.');
            expect(capturedHtml).toContain('Rigueur dans le travail');
            expect(capturedHtml).toContain('Prise de parole encore timide');
            expect(capturedHtml).toContain('Participer davantage à l oral');
            expect(capturedHtml).toContain('class="print-chart-svg"');

            // Exclusions RGPD & données internes (canoniques + PPRE + libres/composites)
            expect(capturedHtml).not.toContain('PPRE');
            expect(capturedHtml).not.toContain('PAP');
            expect(capturedHtml).not.toContain('PAI');
            expect(capturedHtml).not.toContain('AESH');
            expect(capturedHtml).not.toContain('ULIS');
            expect(capturedHtml).not.toContain('DYS');
            expect(capturedHtml).not.toContain('TDAH');
            expect(capturedHtml).not.toContain('TSA');
            expect(capturedHtml).not.toContain('SEGPA');
            expect(capturedHtml).not.toContain('CONFIDENTIEL');
            expect(capturedHtml).not.toContain('NOTE INTERNE');

            window.onafterprint?.();
            expect(document.getElementById('print-report-root')).toBeNull();
        });

        it('inclut les statuts sensibles uniquement si includeSensitive est explicitement true et bloque les photos invalides / XSS', () => {
            appState.currentPeriod = 'T2';
            appState.currentSubject = 'Générique';
            const student = buildStudentFixture();
            student.studentData.subject = 'MonStyle';
            student.nextSteps = ['Organiser un planning de révision : Préparer en avance'];
            student.nom = '<script>alert(1)</script>';
            student.studentPhoto = { data: 'javascript:alert(1)' };
            appState.generatedResults = [student];

            let rootEl = null;
            mockPrint.mockImplementationOnce(() => {
                rootEl = document.getElementById('print-report-root');
            });

            ExportManager.exportStudentReportPdf('stu-1', { includeSensitive: true });

            expect(rootEl.querySelector('script')).toBeNull();
            expect(rootEl.querySelector('img.pr-avatar-img')).toBeNull();
            expect(rootEl.innerHTML).toContain('PAP');
            expect(rootEl.innerHTML).toContain('PAI');
            expect(rootEl.innerHTML).not.toContain('MonStyle');
            expect(rootEl.innerHTML).not.toContain('Générique');
            expect(rootEl.innerHTML).toContain('révision&nbsp;:');
            window.onafterprint?.();
        });

        it('affiche la discipline configurée dans MonStyle sur l en-tête PDF au lieu de la clé interne MonStyle', () => {
            appState.currentPeriod = 'T2';
            appState.currentSubject = 'MonStyle';
            appState.subjects = {
                MonStyle: { iaConfig: { discipline: 'Technologie' } }
            };
            const student = buildStudentFixture();
            student.studentData.subject = 'MonStyle';
            appState.generatedResults = [student];

            let capturedHtml = '';
            mockPrint.mockImplementationOnce(() => {
                capturedHtml = document.getElementById('print-report-root')?.innerHTML || '';
            });

            ExportManager.exportStudentReportPdf('stu-1');

            expect(capturedHtml).toContain('Technologie');
            expect(capturedHtml).not.toContain('MonStyle');
            window.onafterprint?.();
            appState.subjects = {};
        });

        it('cloisonne l analyse PDF sur la période demandée (T1 vs T2) sans fuite inter-périodes', () => {
            appState.currentPeriod = 'T2';
            const student = {
                id: 'stu-scoped',
                classId: 'c1',
                nom: 'DURAND',
                prenom: 'Camille',
                strengthsWeaknesses: { strengths: ['Ancien item T1'], weaknesses: [] },
                analysisGenerationPeriod: 'T1',
                analysisPerPeriod: {
                    T1: {
                        strengths: ['Acquis solides au T1'],
                        weaknesses: ['Orthographe fragile au T1'],
                        nextSteps: ['Relire chaque copie au T1'],
                        source: 'ai',
                        _lastModified: 1000
                    },
                    T2: {
                        strengths: ['Net progrès à l oral au T2'],
                        weaknesses: [],
                        nextSteps: ['Approfondir l argumentation au T2'],
                        source: 'manual',
                        _lastModified: 2000
                    }
                },
                studentData: {
                    periods: {
                        T1: { grade: 11.5, appreciation: 'Trimestre 1 correct.' },
                        T2: { grade: 14.5, appreciation: 'Trimestre 2 en progrès.' },
                        T3: { grade: null, appreciation: '' }
                    }
                }
            };
            appState.generatedResults = [student];

            let capturedT2 = '';
            mockPrint.mockImplementationOnce(() => {
                capturedT2 = document.getElementById('print-report-root')?.innerHTML || '';
            });
            ExportManager.exportStudentReportPdf('stu-scoped', { period: 'T2' });
            expect(capturedT2).toContain('Net progrès à l oral au T2');
            expect(capturedT2).toContain('Approfondir l argumentation au T2');
            expect(capturedT2).not.toContain('Acquis solides au T1');
            expect(capturedT2).not.toContain('Points de vigilance');
            window.onafterprint?.();

            let capturedT3 = '';
            mockPrint.mockImplementationOnce(() => {
                capturedT3 = document.getElementById('print-report-root')?.innerHTML || '';
            });
            ExportManager.exportStudentReportPdf('stu-scoped', { period: 'T3' });
            expect(capturedT3).not.toContain('Analyse pédagogique');
            expect(capturedT3).not.toContain('Acquis solides au T1');
            expect(capturedT3).not.toContain('Net progrès à l oral au T2');
            window.onafterprint?.();
        });

        it('normalise -0,02 en 0,0 neutre, ignore le DOM périmé, tolère sec.items absent et nettoie _runPrintSession sur erreur', () => {
            expect(ExportManager._formatNumberFr(-0.02, true)).toBe('0,0');
            expect(ExportManager._getDeltaToneClass(-0.02)).toBe('');
            expect(ExportManager._getDeltaToneClass(-0.1)).toBe('is-neg');
            expect(ExportManager._getDeltaToneClass(0.1)).toBe('is-pos');

            // DOM périmé d'une classe précédente ignoré
            appState.currentClassId = 'class-B';
            appState.currentPeriod = 'T2';
            document.body.innerHTML = `
                <div id="classDashboardModal">
                    <div id="aiSynthesisContent" data-class-id="class-A" data-period="T2">
                        <div class="ai-synthesis-text">
                            <div class="synthesis-section"><div class="synthesis-intro-text">Synthèse Classe A</div></div>
                        </div>
                    </div>
                </div>
            `;
            expect(ExportManager._extractDomSynthesisSections()).toEqual([]);

            // sec.items manquant / champs undefined ne crashent pas et n'injectent pas "undefined"
            let capturedHtml = '';
            mockPrint.mockImplementationOnce(() => {
                capturedHtml = document.getElementById('print-report-root')?.innerHTML || '';
            });
            ExportManager.exportClassDashboardPdf({
                stats: {
                    count: 1, average: 12, median: 12, min: 12, max: 12, stdDev: 0,
                    successRate: 100, avgEvolution: -0.02, distribution: [0, 0, 0, 1, 0],
                    hasEvolutionData: false, topProgressions: [], atRisk: []
                },
                synthesisSections: [
                    { isIntro: true, text: 'Bilan sain' },
                    { isIntro: false, title: 'Section incomplète' }
                ]
            });
            expect(capturedHtml).not.toContain('undefined');
            expect(capturedHtml).not.toContain('-0,0');
            expect(capturedHtml).not.toContain('pr-kpi-sub is-neg');
            window.onafterprint?.();

            // _runPrintSession nettoie le style et préserve l'ancien onafterprint même en cas d'exception
            const prevHandler = vi.fn();
            window.onafterprint = prevHandler;
            const cleanupSpy = vi.fn();
            expect(() => ExportManager._runPrintSession({
                mode: 'report',
                title: 'Test',
                pageCss: '@page { size: A4; }',
                setup: () => { throw new Error('boom'); },
                cleanup: cleanupSpy
            })).toThrow('boom');
            expect(document.getElementById('print-dynamic-page-style')).toBeNull();
            expect(document.body.dataset.printMode).toBeUndefined();
            expect(cleanupSpy).toHaveBeenCalledTimes(1);
            expect(window.onafterprint).toBe(prevHandler);
        });
    });
});
