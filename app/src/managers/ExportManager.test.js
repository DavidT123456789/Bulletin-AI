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

            expect(button.innerHTML).toContain('ph:check');
            expect(button.classList.contains('copied')).toBe(true);
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

        it('should escape HTML in class name inside #print-header to prevent DOM XSS', () => {
            document.body.innerHTML = '<div class="main-content"></div>';
            appState.filteredResults = [{ id: '1' }];
            appState.currentClassId = 'c-xss';
            appState.classes = [{ id: 'c-xss', name: '<img src=x onerror=alert(1)>' }];

            let injectedHeader = null;
            mockPrint.mockImplementationOnce(() => {
                injectedHeader = document.getElementById('print-header');
            });

            ExportManager.exportToPdf();

            expect(injectedHeader).not.toBeNull();
            expect(injectedHeader.querySelector('img')).toBeNull();
            expect(injectedHeader.textContent).toContain('<img src=x onerror=alert(1)>');
            window.onafterprint?.();
            document.body.innerHTML = '';
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
                    { title: 'Synthèse Globale', isIntro: true, text: 'Classe dynamique en progrès.' },
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
            expect(document.title).toContain('Conseil-de-classe_3°B_T2');

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
                statuses: ['Délégué', 'PAP', 'PAI', 'AESH', 'ULIS'],
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

            // Exclusions RGPD & données internes
            expect(capturedHtml).not.toContain('PAP');
            expect(capturedHtml).not.toContain('PAI');
            expect(capturedHtml).not.toContain('AESH');
            expect(capturedHtml).not.toContain('ULIS');
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
    });
});
