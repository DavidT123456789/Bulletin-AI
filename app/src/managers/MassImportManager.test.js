/**
 * @fileoverview Tests for MassImportManager
 * @module managers/MassImportManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        currentPeriod: 'T1',
        currentAIModel: 'gemini-2.5-flash',
        generatedResults: [],
        importJustCompleted: false
    },
    runtimeState: {
        process: {
            isMassImportCancelled: false
        }
    },
    userSettings: {
        academic: {
            currentClassId: null
        }
    }
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {
        massData: { value: '' },
        massImportErrorActions: { innerHTML: '' },
        emptyStateCard: { style: { display: '' } },
        resultsDiv: { innerHTML: '', appendChild: vi.fn() }
    }
}));

vi.mock('../utils/Utils.js', async (importOriginal) => ({
    Utils: {
        ...(await importOriginal()).Utils,
        normalizeName: (nom, prenom) => `${nom}_${prenom}`.toLowerCase(),
        translateErrorMessage: (msg) => msg,
        detectGender: (prenom) => 'M',
        getPeriodLabel: (period, long) => period,
        getPeriods: () => ['T1', 'T2', 'T3'],
        countWords: (text) => text.split(/\s+/).length
    }
}));

// Mock managers
const mockAm = {
    generateAppreciation: vi.fn(),
    createResultObject: vi.fn((nom, prenom, appreciation, evolutions, studentData, prompts, tokenUsage, errorMessage) => ({
        id: 'test-id-' + nom,
        nom, prenom, appreciation, evolutions, studentData,
        errorMessage,
        timestamp: new Date().toISOString()
    })),
    renderResults: vi.fn()
};

const mockApp = {};

const mockUI = {
    showOutputProgressArea: vi.fn(),
    hideOutputProgressArea: vi.fn(),
    updateOutputProgress: vi.fn(),
    resetProgressBar: vi.fn(),
    showNotification: vi.fn(),
    showHeaderProgress: vi.fn(),
    hideHeaderProgress: vi.fn(),
    updateGenerateButtonState: vi.fn(),
    populateResultCard: vi.fn(() => {
        const div = document.createElement('div');
        div.classList = { add: vi.fn(), remove: vi.fn() };
        div.querySelectorAll = vi.fn(() => []);
        div.querySelector = vi.fn(() => null);
        div.scrollIntoView = vi.fn();
        div.dataset = {};
        return div;
    }),
    showSkeletonInCard: vi.fn(),
    activateCardBadge: vi.fn(),
    fadeOutSkeleton: vi.fn(() => Promise.resolve()),
    typewriterReveal: vi.fn(() => Promise.resolve()),
    updateMassImportPreview: vi.fn()
};

import { MassImportManager } from './MassImportManager.js';
import { ListViewManager } from './ListViewManager.js';
import { appState } from '../state/State.js';

describe('MassImportManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        MassImportManager.init(mockAm, mockApp, mockUI);
        MassImportManager.massImportAbortController = null;
        appState.generatedResults = [];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('init', () => {
        it('should initialize the manager with dependencies', () => {
            MassImportManager.init(mockAm, mockApp, mockUI);
            expect(true).toBe(true);
        });
    });

    describe('cancelImport', () => {
        it('should abort the import if controller exists', () => {
            MassImportManager.massImportAbortController = new AbortController();
            const abortSpy = vi.spyOn(MassImportManager.massImportAbortController, 'abort');

            MassImportManager.cancelImport();

            expect(abortSpy).toHaveBeenCalled();
        });

        it('should do nothing if no controller exists', () => {
            MassImportManager.massImportAbortController = null;
            expect(() => MassImportManager.cancelImport()).not.toThrow();
        });
    });

    describe('processMassImport', () => {
        it('should create abort controller on start', async () => {
            mockAm.generateAppreciation.mockResolvedValue({
                id: 'test-id',
                appreciation: 'Test appreciation',
                studentData: { periods: {} },
                evolutions: [],
                errorMessage: null
            });

            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] }
            ];

            await MassImportManager.processMassImport(students, 0);

            expect(MassImportManager.massImportAbortController).toBeNull();
        });

        it('should call generateAppreciation for each student', async () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] },
                { nom: 'DUPONT', prenom: 'Emma', periods: { T1: { grade: 12 } }, statuses: [] }
            ];

            mockAm.generateAppreciation.mockResolvedValue({
                id: 'test-id',
                appreciation: 'Test',
                studentData: { periods: {} },
                evolutions: []
            });

            await MassImportManager.processMassImport(students, 0);

            expect(mockAm.generateAppreciation).toHaveBeenCalledTimes(2);
        });

        it('should handle generation errors gracefully', async () => {
            const students = [
                { nom: 'ERROR', prenom: 'Student', periods: { T1: { grade: 10 } }, statuses: [] }
            ];

            mockAm.generateAppreciation.mockRejectedValue(new Error('AI Error'));

            await MassImportManager.processMassImport(students, 0);

            expect(mockAm.createResultObject).toHaveBeenCalledWith(
                'ERROR', 'Student', '', [],
                expect.any(Object), {}, {},
                expect.stringContaining('Erreur IA')
            );
        });

        it('should call renderResults after completion', async () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] }
            ];

            mockAm.generateAppreciation.mockResolvedValue({
                id: 'test-id',
                appreciation: 'Test',
                studentData: { periods: {} },
                evolutions: []
            });

            await MassImportManager.processMassImport(students, 0);

            expect(mockAm.renderResults).toHaveBeenCalled();
        });

        it('should handle user cancellation during row typewriter animation without throwing an error notification', async () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] },
                { nom: 'DUPONT', prenom: 'Emma', periods: { T1: { grade: 12 } }, statuses: [] }
            ];

            mockAm.generateAppreciation.mockImplementation(async (sd) => ({
                id: 'gen-' + sd.nom,
                appreciation: `Appréciation pour ${sd.prenom}`,
                studentData: { ...sd, periods: { T1: { grade: sd.periods.T1.grade, appreciation: `Appréciation pour ${sd.prenom}` } } },
                evolutions: []
            }));

            vi.spyOn(ListViewManager, 'updateRow').mockImplementation(async () => {
                // L'utilisateur clique sur "Annuler" pendant l'animation typewriter du 1er élève
                MassImportManager.cancelImport();
            });

            await MassImportManager.processMassImport(students, 0);

            expect(mockAm.generateAppreciation).toHaveBeenCalledTimes(1);
            expect(mockUI.showNotification).not.toHaveBeenCalledWith(
                expect.stringContaining('erreur inattendue'),
                'error'
            );
            expect(mockUI.showNotification).toHaveBeenCalledWith(
                'Génération interrompue (1/2 générée).',
                'info'
            );
            const lucas = appState.generatedResults.find(r => r.nom === 'MARTIN');
            expect(lucas?.appreciation).toBe('Appréciation pour Lucas');
        });

        it('should display "Génération annulée." when cancelled during the first student generation', async () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] }
            ];

            mockAm.generateAppreciation.mockImplementation(async (_sd, _preview, _cfg, signal) => {
                MassImportManager.cancelImport();
                const abortErr = new Error('Opération annulée');
                abortErr.name = 'AbortError';
                if (signal?.aborted) throw abortErr;
            });

            await MassImportManager.processMassImport(students, 0);

            expect(mockUI.showNotification).not.toHaveBeenCalledWith(
                expect.stringContaining('erreur inattendue'),
                'error'
            );
            expect(mockUI.showNotification).toHaveBeenCalledWith(
                'Génération annulée.',
                'info'
            );
        });
    });

    describe('_createPendingCards', () => {
        it('should create result IDs for each student', () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] },
                { nom: 'DUPONT', prenom: 'Emma', periods: { T1: { grade: 12 } }, statuses: [] }
            ];

            const resultIds = MassImportManager._createPendingCards(students);

            expect(resultIds.length).toBe(2);
            expect(mockAm.createResultObject).toHaveBeenCalledTimes(2);
        });

        it('should add pending results to generatedResults', () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] }
            ];

            MassImportManager._createPendingCards(students);

            expect(appState.generatedResults.length).toBe(1);
            expect(appState.generatedResults[0].isPending).toBe(true);
        });

        it('should use existing results when existingId is provided', () => {
            const existingResult = { id: 'existing-1', nom: 'MARTIN', prenom: 'Lucas', isPending: false };
            appState.generatedResults = [existingResult];

            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', existingId: 'existing-1', periods: { T1: { grade: 15 } }, statuses: [] }
            ];

            const resultIds = MassImportManager._createPendingCards(students);

            expect(resultIds).toContain('existing-1');
            expect(appState.generatedResults[0].isPending).toBe(true);
        });

        it('should call renderResults after creating cards', () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] }
            ];

            MassImportManager._createPendingCards(students);

            expect(mockAm.renderResults).toHaveBeenCalled();
        });
    });

    describe('T-07 — Concurrence lors d\'un changement de classe/période en plein lot (Bug C-01)', () => {
        it('T-07 (Bug C-01) : processMassImport conserve le contexte de classe et de période initial si l\'utilisateur change de classe (6e-A -> 3e-B) et de période (T1 -> T2) pendant le lot', async () => {
            appState.currentClassId = '6e-A';
            appState.currentPeriod = 'T1';
            appState.generatedResults = [
                {
                    id: 's1',
                    classId: '6e-A',
                    nom: 'MARTIN',
                    prenom: 'Lucas',
                    studentData: { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 14, appreciation: '' }, T2: { grade: 12, appreciation: '' } } },
                    historyPerPeriod: {}
                },
                {
                    id: 's2',
                    classId: '6e-A',
                    nom: 'DUPONT',
                    prenom: 'Emma',
                    studentData: { nom: 'DUPONT', prenom: 'Emma', periods: { T1: { grade: 16, appreciation: '' }, T2: { grade: 15, appreciation: '' } } },
                    historyPerPeriod: {}
                }
            ];

            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 14 } }, statuses: [] },
                { nom: 'DUPONT', prenom: 'Emma', periods: { T1: { grade: 16 } }, statuses: [] }
            ];

            let callIndex = 0;
            mockAm.generateAppreciation.mockImplementation(async (sd) => {
                callIndex++;
                if (callIndex === 2) {
                    // Pendant la génération du 2e élève, l'utilisateur change de classe et de période dans l'UI
                    appState.currentClassId = '3e-B';
                    appState.currentPeriod = 'T2';
                }
                return {
                    id: `gen-${callIndex}`,
                    classId: appState.currentClassId,
                    appreciation: `Appréciation T1 pour ${sd.prenom}`,
                    studentData: { ...sd, periods: { T1: { grade: sd.periods.T1.grade, appreciation: `Appréciation T1 pour ${sd.prenom}` } } },
                    evolutions: []
                };
            });

            await MassImportManager.processMassImport(students, 0);

            // Aucun doublon ne doit avoir été créé par unshift dans 3e-B : il doit toujours y avoir exactement 2 élèves
            expect(appState.generatedResults).toHaveLength(2);
            const emma = appState.generatedResults.find(r => r.id === 's2');
            expect(emma.classId).toBe('6e-A');
            expect(emma.studentData.periods.T1.appreciation).toBe('Appréciation T1 pour Emma');
            expect(emma.studentData.periods.T2.appreciation).toBe('');
        });
    });

    describe('importStudentsOnly — fusion & intégrité (B1, B4)', () => {
        it('préserve les statuts existants lors d\'une fusion sans colonne Statut (B1) et efface une erreur IA résiduelle lors d\'un import d\'appréciation (B4)', async () => {
            const { StorageManager } = await import('./StorageManager.js');
            const { ClassManager } = await import('./ClassManager.js');
            const saveSpy = vi.spyOn(StorageManager, 'saveAppState').mockResolvedValue();
            const filterSpy = vi.spyOn(ClassManager, '_filterResultsByClass').mockResolvedValue();
            appState.currentClassId = 'cls-demo';
            appState.currentPeriod = 'T1';
            appState.generatedResults = [
                {
                    id: 'st-durand',
                    classId: 'cls-demo',
                    nom: 'DURAND',
                    prenom: 'Sophie',
                    appreciation: 'Ancienne appréciation',
                    errorMessage: 'Erreur IA : Clé API manquante.',
                    errorPeriod: 'T1',
                    studentData: {
                        statuses: ['PPRE'],
                        periods: { T1: { grade: 9.0, appreciation: 'Ancienne appréciation', context: 'Accompagnement' } }
                    }
                },
                {
                    id: 'st-bernard',
                    classId: 'cls-demo',
                    nom: 'BERNARD',
                    prenom: 'Thomas',
                    appreciation: '',
                    errorMessage: 'Erreur IA : Clé API manquante.',
                    errorPeriod: 'T1',
                    studentData: {
                        statuses: ['DÉLÉGUÉ'],
                        periods: { T1: { grade: 15.0, appreciation: '', context: '' } }
                    }
                }
            ];

            await MassImportManager.importStudentsOnly([
                {
                    nom: 'DURAND',
                    prenom: 'Sophie',
                    statuses: [], // Aucun statut importé
                    periods: { T1: { grade: 11.5, appreciation: '', context: '' } }
                },
                {
                    nom: 'BERNARD',
                    prenom: 'Thomas',
                    statuses: ['PAP'], // Statut explicitement importé
                    periods: { T1: { grade: 16.0, appreciation: 'Très bon trimestre.', context: '' } }
                }
            ], 0);

            const durand = appState.generatedResults.find(r => r.id === 'st-durand');
            const bernard = appState.generatedResults.find(r => r.id === 'st-bernard');

            // B1 : PPRE préservé quand statuses est vide, mis à jour quand non vide
            expect(durand.studentData.statuses).toEqual(['PPRE']);
            expect(durand.studentData.periods.T1.grade).toBe(11.5);
            expect(durand.studentData.periods.T1.appreciation).toBe('Ancienne appréciation');
            expect(bernard.studentData.statuses).toEqual(['PAP']);

            // B4 : l'import d'une appréciation valide nettoie errorMessage/errorPeriod
            expect(bernard.appreciation).toBe('Très bon trimestre.');
            expect(bernard.errorMessage).toBeNull();
            expect(bernard.errorPeriod).toBeNull();
            // Sans appréciation importée, on ne masque pas une erreur préexistante silencieusement
            expect(durand.errorMessage).toBe('Erreur IA : Clé API manquante.');

            saveSpy.mockRestore();
            filterSpy.mockRestore();
        });

        it('réinitialise le statut copié uniquement si une nouvelle appréciation différente est importée pour la période', async () => {
            appState.currentPeriod = 'T1';
            appState.currentClassId = 'c1';
            appState.generatedResults = [
                {
                    id: 'st-same',
                    classId: 'c1',
                    nom: 'MARTIN',
                    prenom: 'Lucas',
                    appreciation: 'Texte inchangé.',
                    copied: true,
                    generationPeriod: 'T1',
                    studentData: {
                        nom: 'MARTIN',
                        prenom: 'Lucas',
                        periods: {
                            T1: { grade: 14, appreciation: 'Texte inchangé.', context: '', copied: true },
                            T2: { grade: 15, appreciation: 'Texte T2.', context: '', copied: true }
                        }
                    }
                },
                {
                    id: 'st-updated',
                    classId: 'c1',
                    nom: 'DUPONT',
                    prenom: 'Léa',
                    appreciation: 'Ancien texte.',
                    copied: true,
                    generationPeriod: 'T1',
                    studentData: {
                        nom: 'DUPONT',
                        prenom: 'Léa',
                        periods: {
                            T1: { grade: 12, appreciation: 'Ancien texte.', context: '', copied: true },
                            T2: { grade: 13, appreciation: 'Texte T2.', context: '', copied: true }
                        }
                    }
                }
            ];

            const { StorageManager } = await import('./StorageManager.js');
            const { ClassManager } = await import('./ClassManager.js');
            const saveSpy = vi.spyOn(StorageManager, 'saveAppState').mockResolvedValue();
            const filterSpy = vi.spyOn(ClassManager, '_filterResultsByClass').mockResolvedValue();

            await MassImportManager.importStudentsOnly([
                {
                    nom: 'MARTIN',
                    prenom: 'Lucas',
                    periods: { T1: { grade: 14.5, appreciation: 'Texte inchangé.', context: '' } }
                },
                {
                    nom: 'DUPONT',
                    prenom: 'Léa',
                    periods: { T1: { grade: 13, appreciation: 'Nouvelle appréciation importée.', context: '' } }
                }
            ], 0);

            const martin = appState.generatedResults.find(r => r.id === 'st-same');
            const dupont = appState.generatedResults.find(r => r.id === 'st-updated');

            expect(martin.studentData.periods.T1.copied).toBe(true);
            expect(martin.studentData.periods.T2.copied).toBe(true);
            expect(dupont.studentData.periods.T1.copied).toBe(false);
            expect(dupont.studentData.periods.T2.copied).toBe(true);

            saveSpy.mockRestore();
            filterSpy.mockRestore();
        });
    });

    describe('generateAllPending — garde préalable sans clé API (B3)', () => {
        it('bloque immédiatement sans lancer processMassImport si checkAPIKeyPresence retourne false', async () => {
            mockUI.checkAPIKeyPresence = vi.fn(() => false);
            const processSpy = vi.spyOn(MassImportManager, 'processMassImport');

            await MassImportManager.generateAllPending();

            expect(mockUI.checkAPIKeyPresence).toHaveBeenCalledTimes(1);
            expect(processSpy).not.toHaveBeenCalled();
            expect(mockAm.generateAppreciation).not.toHaveBeenCalled();

            delete mockUI.checkAPIKeyPresence;
            processSpy.mockRestore();
        });
    });
});
