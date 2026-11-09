/**
 * @fileoverview Tests unitaires pour FocusPanelStatus
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FocusPanelStatus } from './FocusPanelStatus.js';
import { appState } from '../state/State.js';
import { SpeechSynthesisManager } from './SpeechSynthesisManager.js';

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
        showNotification: vi.fn(),
        updateTooltip: vi.fn()
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
        PROMPT_HASH_PREFIX: 'hash_',
        getPromptHash: vi.fn((data) => {
            if (data.context === 'MODIFIED') return 'hash_new';
            return 'hash_initial';
        })
    }
}));

vi.mock('./SpeechSynthesisManager.js', () => ({
    SpeechSynthesisManager: {
        isPlaying: vi.fn(() => false),
        cancel: vi.fn()
    }
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

        it('devrait donner la priorité à l\'erreur sur le flag de génération active', () => {
            activeGenerations.add('student-1');
            const student = {
                id: 'student-1',
                errorMessage: 'Quota API dépassé',
                errorPeriod: 'T1',
                appreciation: 'Texte conservé.',
                studentData: {
                    periods: {
                        T1: { appreciation: 'Texte conservé.' }
                    }
                }
            };

            const status = FocusPanelStatus.getAppreciationStatus(student, 'T1');
            expect(status.state).toBe('error');
            expect(status.hasError).toBe(true);
            expect(status.isGenerating).toBe(false);
            expect(status.isRegenerationError).toBe(true);
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

        it('devrait ignorer une ancienne erreur de génération si l\'appréciation est manuelle/dictée', () => {
            const student = {
                id: 'student-1',
                errorMessage: 'Clé API Mistral manquante. Veuillez la configurer dans les paramètres.',
                errorPeriod: 'T1',
                wasGenerated: false,
                appreciationSource: 'manual',
                appreciation: 'Travail sérieux et régulier ce trimestre.',
                generationPeriod: 'T1',
                studentData: {
                    periods: {
                        T1: { appreciation: 'Travail sérieux et régulier ce trimestre.' }
                    }
                }
            };

            const status = FocusPanelStatus.getAppreciationStatus(student, 'T1');
            expect(status.hasError).toBe(false);
            expect(status.state).toBe('uptodate');
            expect(status.appreciation).toBe('Travail sérieux et régulier ce trimestre.');
        });

        it('devrait détecter un état dirty lorsque le promptHash diffère', () => {
            const student = {
                id: 'student-1',
                promptHash: 'hash_initial',
                generationPeriod: 'T1',
                appreciation: 'Texte initial.',
                wasGenerated: false,
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
            expect(status.tooltip).toContain('Cliquez pour marquer comme vérifiée');
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

        it('devrait redevenir uptodate lorsque le promptHash est resynchronisé après réécriture manuelle', () => {
            // Contexte modifié (génère 'hash_new')
            const student = {
                id: 'student-1',
                promptHash: 'hash_new',
                generationPeriod: 'T1',
                appreciation: 'Texte réécrit manuellement après modification du contexte.',
                wasGenerated: false,
                appreciationSource: 'manual',
                studentData: {
                    context: 'MODIFIED',
                    periods: {
                        T1: { appreciation: 'Texte réécrit manuellement après modification du contexte.' }
                    }
                }
            };

            const status = FocusPanelStatus.getAppreciationStatus(student, 'T1');
            expect(status.state).toBe('uptodate');
            expect(status.isDirty).toBe(false);
        });

        it('ne devrait pas signaler dirty une empreinte d\'ancien format (migration du prompt sans fausse alerte)', () => {
            const student = {
                id: 'student-1',
                promptHash: '1a2b3c4d',
                generationPeriod: 'T1',
                appreciation: 'Texte généré avant la mise à jour du prompt.',
                studentData: {
                    context: 'MODIFIED',
                    periods: {
                        T1: { appreciation: 'Texte généré avant la mise à jour du prompt.' }
                    }
                }
            };

            expect(FocusPanelStatus.checkDirtyState(student)).toBe(false);
            expect(FocusPanelStatus.getAppreciationStatus(student, 'T1').state).toBe('uptodate');
        });
    });

    describe('isBulkRefreshable', () => {
        it('devrait inclure les appréciations IA non retouchées dont les données ont changé et les erreurs de génération', () => {
            const dirtyAiStudent = {
                id: 'student-ai',
                promptHash: 'hash_initial',
                generationPeriod: 'T1',
                appreciation: 'Texte généré par IA.',
                wasGenerated: true,
                appreciationSource: 'ai',
                studentData: {
                    context: 'MODIFIED',
                    periods: { T1: { appreciation: 'Texte généré par IA.' } }
                }
            };
            const errorStudent = {
                id: 'student-err',
                errorMessage: 'Erreur réseau',
                errorPeriod: 'T1',
                studentData: { periods: { T1: { appreciation: '' } } }
            };

            expect(FocusPanelStatus.isBulkRefreshable(dirtyAiStudent, 'T1')).toBe(true);
            expect(FocusPanelStatus.isBulkRefreshable(errorStudent, 'T1')).toBe(true);
        });

        it('devrait exclure de l\'actualisation de masse les appréciations manuelles, retouchées ou importées', () => {
            const dirtyManualStudent = {
                id: 'student-manual',
                promptHash: 'hash_initial',
                generationPeriod: 'T1',
                appreciation: 'Texte retouché par le professeur.',
                wasGenerated: false,
                appreciationSource: 'manual',
                studentData: {
                    context: 'MODIFIED',
                    periods: { T1: { appreciation: 'Texte retouché par le professeur.' } }
                }
            };
            const dirtyImportedStudent = {
                id: 'student-imported',
                promptHash: 'hash_initial',
                generationPeriod: 'T1',
                appreciation: 'Texte importé depuis Pronote.',
                wasGenerated: false,
                appreciationSource: 'imported',
                studentData: {
                    context: 'MODIFIED',
                    periods: { T1: { appreciation: 'Texte importé depuis Pronote.' } }
                }
            };
            const manualOverOldError = {
                ...dirtyManualStudent,
                promptHash: 'hash_new',
                errorMessage: 'Ancienne erreur IA',
                errorPeriod: 'T1'
            };

            expect(FocusPanelStatus.checkDirtyState(dirtyManualStudent)).toBe(true);
            expect(FocusPanelStatus.isBulkRefreshable(dirtyManualStudent, 'T1')).toBe(false);
            expect(FocusPanelStatus.checkDirtyState(dirtyImportedStudent)).toBe(true);
            expect(FocusPanelStatus.isBulkRefreshable(dirtyImportedStudent, 'T1')).toBe(false);
            expect(FocusPanelStatus.isBulkRefreshable(manualOverOldError, 'T1')).toBe(false);
        });
    });

    describe('updateWordCount', () => {
        beforeEach(() => {
            SpeechSynthesisManager.isPlaying.mockReturnValue(false);
            SpeechSynthesisManager.cancel.mockClear();
            document.body.innerHTML = `
                <div id="focusAppreciationText" contenteditable="true"></div>
                <span id="focusWordCount"></span>
            `;
        });

        it('devrait purger les balises résiduelles (<br>, <div><br></div>) et masquer le compteur de mots quand le champ contenteditable devient vide', () => {
            const appreciationEl = document.getElementById('focusAppreciationText');
            const wordCountEl = document.getElementById('focusWordCount');
            wordCountEl.textContent = '12 mots';
            appreciationEl.innerHTML = '<div><br></div>';

            FocusPanelStatus.updateWordCount();

            expect(appreciationEl.innerHTML).toBe('');
            expect(appreciationEl.classList.contains('empty')).toBe(true);
            expect(wordCountEl.textContent).toBe('');
        });

        it('ne devrait pas vider le DOM ni ajouter .empty lorsqu\'un squelette de chargement est affiché', () => {
            const appreciationEl = document.getElementById('focusAppreciationText');
            appreciationEl.innerHTML = '<div class="appreciation-skeleton"><div class="skeleton-line"></div></div>';

            FocusPanelStatus.updateWordCount();

            expect(appreciationEl.querySelector('.appreciation-skeleton')).not.toBeNull();
            expect(appreciationEl.classList.contains('empty')).toBe(false);
        });
    });
});
