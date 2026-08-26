/**
 * @fileoverview Tests unitaires pour FocusPanelStatus
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FocusPanelStatus } from './FocusPanelStatus.js';
import { appState } from '../state/State.js';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        currentPeriod: 'T1',
        useSubjectPersonalization: false,
        currentSubject: 'Générique'
    }
}));

vi.mock('./UIManager.js', () => ({
    UI: {
        showNotification: vi.fn()
    }
}));

vi.mock('./StatsUIManager.js', () => ({
    StatsUI: {}
}));

vi.mock('./FocusPanelHistory.js', () => ({
    FocusPanelHistory: {}
}));

vi.mock('./JournalManager.js', () => ({
    JournalManager: {
        getThreshold: vi.fn(() => 2)
    }
}));

vi.mock('../services/PromptService.js', () => ({
    PromptService: {
        getPromptHash: vi.fn((data) => {
            if (data.context === 'MODIFIED') return 'hash_new';
            return 'hash_initial';
        })
    }
}));

vi.mock('./SpeechSynthesisManager.js', () => ({
    SpeechSynthesisManager: {}
}));

describe('FocusPanelStatus', () => {
    let activeGenerations;

    beforeEach(() => {
        appState.currentPeriod = 'T1';
        activeGenerations = new Set();
        FocusPanelStatus.init({
            getCurrentStudentId: () => 'student-1',
            getActiveGenerations: () => activeGenerations,
            onUpdateGenerateButton: vi.fn()
        });
    });

    describe('hasRealContent', () => {
        it('devrait retourner false pour des valeurs vides ou nulles', () => {
            expect(FocusPanelStatus.hasRealContent(null)).toBe(false);
            expect(FocusPanelStatus.hasRealContent(undefined)).toBe(false);
            expect(FocusPanelStatus.hasRealContent('')).toBe(false);
            expect(FocusPanelStatus.hasRealContent('   ')).toBe(false);
        });

        it('devrait retourner false pour des placeholders', () => {
            expect(FocusPanelStatus.hasRealContent('Aucune appréciation enregistrée')).toBe(false);
            expect(FocusPanelStatus.hasRealContent('Cliquez sur générer pour créer...')).toBe(false);
            expect(FocusPanelStatus.hasRealContent('<span class="empty">Placeholder</span>')).toBe(false);
        });

        it('devrait retourner true pour du vrai contenu', () => {
            expect(FocusPanelStatus.hasRealContent('Très bon trimestre, travail sérieux et régulier.')).toBe(true);
        });
    });

    describe('getAppreciationStatus', () => {
        it('devrait identifier un élève sans appréciation (state: empty)', () => {
            const student = {
                id: 'student-1',
                studentData: { periods: { T1: { appreciation: '' } } }
            };

            const status = FocusPanelStatus.getAppreciationStatus(student, 'T1');
            expect(status.state).toBe('empty');
            expect(status.hasContent).toBe(false);
            expect(status.hasError).toBe(false);
            expect(status.isRegenerationError).toBe(false);
        });

        it('devrait identifier une génération en cours (state: generating)', () => {
            activeGenerations.add('student-1');
            const student = {
                id: 'student-1',
                studentData: { periods: { T1: { appreciation: 'Texte existant' } } }
            };

            const status = FocusPanelStatus.getAppreciationStatus(student, 'T1');
            expect(status.state).toBe('generating');
            expect(status.isGenerating).toBe(true);
            expect(status.tooltip).toBe('Génération en cours...');
        });

        it('devrait gérer l\'échec de 1ère génération (state: error, hasContent: false)', () => {
            const student = {
                id: 'student-1',
                errorMessage: 'Quota API dépassé',
                errorPeriod: 'T1',
                studentData: { periods: { T1: { appreciation: '' } } }
            };

            const status = FocusPanelStatus.getAppreciationStatus(student, 'T1');
            expect(status.state).toBe('error');
            expect(status.hasError).toBe(true);
            expect(status.hasContent).toBe(false);
            expect(status.isRegenerationError).toBe(false);
            expect(status.errorMessage).toBe('Quota API dépassé');
            expect(status.tooltip).toBe('Quota API dépassé');
        });

        it('devrait gérer l\'échec de régénération avec préservation du texte existant (state: error, isRegenerationError: true)', () => {
            const student = {
                id: 'student-1',
                errorMessage: 'Échec après 1 modèle (gemini-3.7-flash)',
                errorPeriod: 'T1',
                appreciation: 'Excellent travail ce trimestre.',
                generationPeriod: 'T1',
                studentData: {
                    periods: {
                        T1: { appreciation: 'Excellent travail ce trimestre.' }
                    }
                }
            };

            const status = FocusPanelStatus.getAppreciationStatus(student, 'T1');
            expect(status.state).toBe('error');
            expect(status.hasError).toBe(true);
            expect(status.hasContent).toBe(true);
            expect(status.isRegenerationError).toBe(true);
            expect(status.appreciation).toBe('Excellent travail ce trimestre.');
            expect(status.tooltip).toContain('Échec de la régénération');
            expect(status.tooltip).toContain('Ancienne version conservée');
        });

        it('ne doit pas propager une erreur d\'une période à une autre', () => {
            const student = {
                id: 'student-1',
                errorMessage: 'Erreur T1',
                errorPeriod: 'T1',
                studentData: {
                    periods: {
                        T1: { appreciation: '' },
                        T2: { appreciation: 'Appréciation T2 valide.' }
                    }
                }
            };

            const statusT2 = FocusPanelStatus.getAppreciationStatus(student, 'T2');
            expect(statusT2.hasError).toBe(false);
            expect(statusT2.state).toBe('uptodate');
            expect(statusT2.appreciation).toBe('Appréciation T2 valide.');
        });

        it('devrait détecter un état dirty lorsque le promptHash diffère', () => {
            const student = {
                id: 'student-1',
                promptHash: 'hash_initial',
                generationPeriod: 'T1',
                appreciation: 'Texte initial.',
                studentData: {
                    context: 'MODIFIED',
                    periods: {
                        T1: { appreciation: 'Texte initial.' }
                    }
                }
            };

            const status = FocusPanelStatus.getAppreciationStatus(student, 'T1');
            expect(status.state).toBe('dirty');
            expect(status.isDirty).toBe(true);
            expect(status.hasContent).toBe(true);
        });

        it('devrait identifier une appréciation à jour (state: uptodate)', () => {
            const student = {
                id: 'student-1',
                promptHash: 'hash_initial',
                generationPeriod: 'T1',
                appreciation: 'Texte parfait.',
                studentData: {
                    periods: {
                        T1: { appreciation: 'Texte parfait.' }
                    }
                }
            };

            const status = FocusPanelStatus.getAppreciationStatus(student, 'T1');
            expect(status.state).toBe('uptodate');
            expect(status.hasContent).toBe(true);
            expect(status.isDirty).toBe(false);
            expect(status.hasError).toBe(false);
        });
    });
});
