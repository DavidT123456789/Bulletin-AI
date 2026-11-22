/**
 * @fileoverview Tests unitaires pour JournalManager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JournalManager } from './JournalManager.js';
import { appState, userSettings } from '../state/State.js';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        currentPeriod: 'T1',
        currentClassId: null,
        classes: [],
        journalThreshold: 2,
        journalIncludeInAI: true,
        generatedResults: []
    },
    userSettings: {
        academic: {
            classes: []
        }
    }
}));

vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
}));

vi.mock('./FocusPanelStatus.js', () => ({
    FocusPanelStatus: {
        refreshAppreciationStatus: vi.fn()
    }
}));

describe('JournalManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        appState.currentPeriod = 'T1';
        appState.currentClassId = null;
        appState.classes = [];
        appState.periodSystem = 'trimestres';
        appState.journalThreshold = 2;
        appState.journalIncludeInAI = true;
        appState.generatedResults = [
            {
                id: 'student-1',
                name: 'DUPONT Jean',
                journal: []
            }
        ];
    });

    describe('addEntry', () => {
        it('should add entry with tags and note', () => {
            const entry = JournalManager.addEntry('student-1', {
                tags: ['participation+'],
                note: 'Très actif en classe'
            });

            expect(entry).not.toBeNull();
            expect(entry.tags).toEqual(['participation+']);
            expect(entry.note).toBe('Très actif en classe');
            expect(entry.period).toBe('T1');
            expect(appState.generatedResults[0].journal.length).toBe(1);
        });

        it('should default tags to remarque if note is provided without tags', () => {
            const entry = JournalManager.addEntry('student-1', {
                tags: [],
                note: 'Observation sans tag préalable'
            });

            expect(entry).not.toBeNull();
            expect(entry.tags).toEqual(['remarque']);
            expect(entry.note).toBe('Observation sans tag préalable');
        });

        it('should return null if both tags and note are empty', () => {
            const entry = JournalManager.addEntry('student-1', {
                tags: [],
                note: ''
            });

            expect(entry).toBeNull();
            expect(appState.generatedResults[0].journal.length).toBe(0);
        });

        it('should return null if student does not exist', () => {
            const entry = JournalManager.addEntry('unknown-student', {
                tags: ['travail+'],
                note: 'Test'
            });

            expect(entry).toBeNull();
        });
    });

    describe('updateEntry', () => {
        it('should update tags and note of an existing entry', () => {
            const created = JournalManager.addEntry('student-1', {
                tags: ['bavardage'],
                note: 'Avertissement oral'
            });

            const updated = JournalManager.updateEntry('student-1', created.id, {
                tags: ['bavardage', 'travail-'],
                note: 'Bavardage répété et travail incomplet'
            });

            expect(updated).not.toBeNull();
            expect(updated.tags).toEqual(['bavardage', 'travail-']);
            expect(updated.note).toBe('Bavardage répété et travail incomplet');
        });

        it('should default tags to remarque if tags are removed but note remains', () => {
            const created = JournalManager.addEntry('student-1', {
                tags: ['oubli'],
                note: 'Oubli du manuel'
            });

            const updated = JournalManager.updateEntry('student-1', created.id, {
                tags: [],
                note: 'Oubli du manuel'
            });

            expect(updated.tags).toEqual(['remarque']);
        });
    });

    describe('deleteEntry', () => {
        it('should delete existing entry and return true', () => {
            const created = JournalManager.addEntry('student-1', {
                tags: ['participation+'],
                note: 'Super'
            });

            expect(appState.generatedResults[0].journal.length).toBe(1);

            const deleted = JournalManager.deleteEntry('student-1', created.id);
            expect(deleted).toBe(true);
            expect(appState.generatedResults[0].journal.length).toBe(0);
        });
    });

    describe('renderDraftPreview', () => {
        it('should render flat direct-toggle draft preview markup without dropdowns or duplicate controls', () => {
            const html = JournalManager.renderDraftPreview();

            expect(html).toContain('id="journalDraftPreview"');
            expect(html).toContain('class="journal-draft-title"');
            expect(html).toContain('Nouvelle observation');
            expect(html).toContain('id="journalDraftPills"');
            expect(html).toContain('id="journalNoteInput"');
            expect(html).toContain('id="journalCharCount"');
            expect(html).toContain('id="journalDraftCancelFooterBtn"');
            expect(html).toContain('id="journalDraftSaveBtn"');
            expect(html).toContain('Enregistrer');
            expect(html).toContain('id="journalNoteMicBtn"');
            expect(html).not.toContain('journal-pill-dropdown');
            expect(html).not.toContain('id="journalSelectedTags"');
            expect(html).not.toContain('id="journalDraftCancelBtn"');
            expect(html).not.toContain('data-tag-id="remarque"');
            expect((html.match(/class="journal-pill-btn journal-pill-direct/g) || []).length).toBe(9);
        });

        it('should render edit mode with pre-selected direct pill and pre-filled data', () => {
            const entry = {
                id: 'j_test_1',
                date: '2026-09-24T12:00:00.000Z',
                tags: ['participation+'],
                note: 'Note de test',
                period: 'T1'
            };

            const html = JournalManager.renderDraftPreview(entry);

            expect(html).toContain('Modifier l\'observation');
            expect(html).toContain('Note de test');
            expect(html).toContain('Mettre à jour');
            expect(html).toContain('is-editing');
            expect(html).toContain('id="journalNoteMicBtn"');
            expect(html).toMatch(/journal-pill-direct selected"[\s\S]*?data-tag-id="participation\+"/);
            expect(html).toContain('aria-pressed="true"');
        });
    });

    describe('getEmptyStateCopy', () => {
        it('returns period-specific title and AI-aware subtitle', () => {
            appState.classes = [{ id: 'c1', name: '3A', journalIncludeInAI: true }];
            const aiOn = JournalManager.getEmptyStateCopy('c1', 'T2');
            expect(aiOn.title).toContain('T2');
            expect(aiOn.subtitle).toContain('transmis à l\'IA');

            appState.classes[0].journalIncludeInAI = false;
            const aiOff = JournalManager.getEmptyStateCopy('c1', 'T2');
            expect(aiOff.subtitle).toContain('bloc-notes personnel');
        });
    });

    describe('renderTimeline', () => {
        it('should render interactive empty state when no entries exist', () => {
            const html = JournalManager.renderTimeline('student-1', 'T1');

            expect(html).toContain('journal-empty-interactive');
            expect(html).toContain('role="button"');
            expect(html).toContain('Aucune observation pour le T1');
            expect(html).toContain('Ajouter');
        });

        it('should render entry with action buttons when entries exist', () => {
            JournalManager.addEntry('student-1', {
                tags: ['participation+'],
                note: 'Élève actif'
            });

            const html = JournalManager.renderTimeline('student-1', 'T1');

            expect(html).toContain('journal-timeline');
            expect(html).toContain('journal-entry-actions');
            expect(html).toContain('journal-entry-edit');
            expect(html).toContain('journal-entry-delete');
            expect(html).toContain('Élève actif');
        });
    });

    describe('synthesizeForPrompt & isEntryIsolated (notes rédigées vs tags rapides & mode Hors IA)', () => {
        it('transmet toujours une note rédigée même si son tag est sous le seuil ≥2 et ne la marque jamais isolée', () => {
            const entry = JournalManager.addEntry('student-1', {
                tags: [],
                note: 'Excellent exposé oral devant la classe'
            });

            const counts = JournalManager.countTags('student-1', 'T1');
            expect(JournalManager.isEntryIsolated(entry, counts, 2)).toBe(false);

            const synthesis = JournalManager.synthesizeForPrompt('student-1', 'T1');
            expect(synthesis).toContain('Notes: "Excellent exposé oral devant la classe"');
            expect(synthesis).not.toContain('Observations:');
        });

        it('continue de filtrer les tags rapides sans texte sous le seuil et les marque isolés', () => {
            const singleTag = JournalManager.addEntry('student-1', {
                tags: ['bavardage'],
                note: ''
            });

            const counts = JournalManager.countTags('student-1', 'T1');
            expect(JournalManager.isEntryIsolated(singleTag, counts, 2)).toBe(true);
            expect(JournalManager.synthesizeForPrompt('student-1', 'T1')).toBe('');

            // À la 2e occurrence, le tag atteint le seuil
            JournalManager.addEntry('student-1', { tags: ['bavardage'], note: '' });
            const counts2 = JournalManager.countTags('student-1', 'T1');
            expect(JournalManager.isEntryIsolated(singleTag, counts2, 2)).toBe(false);
            expect(JournalManager.synthesizeForPrompt('student-1', 'T1')).toContain('Observations: Bavardage');
        });

        it('respecte le mode bloc-notes personnel (Hors IA) global et par classe', () => {
            appState.classes = [
                { id: 'c1', name: '3A', journalIncludeInAI: false },
                { id: 'c2', name: '3B', journalIncludeInAI: true }
            ];
            appState.generatedResults = [
                { id: 's1', classId: 'c1', journal: [] },
                { id: 's2', classId: 'c2', journal: [] }
            ];

            const e1 = JournalManager.addEntry('s1', { tags: ['bavardage'], note: 'Avertissement' });
            JournalManager.addEntry('s1', { tags: ['bavardage'], note: '' });
            JournalManager.addEntry('s2', { tags: ['participation+'], note: 'Très pertinent' });

            // Classe c1 en mode Hors IA : rien transmis, rien grisé comme isolé
            expect(JournalManager.isIncludedInAI('c1')).toBe(false);
            expect(JournalManager.getSignificantTagIds('s1', 'T1')).toEqual([]);
            expect(JournalManager.synthesizeForPrompt('s1', 'T1')).toBe('');
            expect(JournalManager.isEntryIsolated(e1, { bavardage: 1 }, 2, 'c1')).toBe(false);

            // Classe c2 active malgré c1 désactivée
            expect(JournalManager.isIncludedInAI('c2')).toBe(true);
            expect(JournalManager.synthesizeForPrompt('s2', 'T1')).toContain('Très pertinent');

            // État vide affiche le sous-titre bloc-notes personnel en mode Hors IA
            appState.generatedResults[0].journal = [];
            expect(JournalManager.renderTimeline('s1', 'T1')).toContain('Mode bloc-notes personnel');
        });

        it('préfixe une note rédigée par le libellé de son tag explicite quand le tag est sous le seuil, sans dupliquer les tags déjà significatifs ni "remarque"', () => {
            // 1. Tag explicite sous seuil + note -> préfixe "[Bavardage]"
            JournalManager.addEntry('student-1', {
                tags: ['bavardage'],
                note: 'avec son voisin'
            });
            expect(JournalManager.synthesizeForPrompt('student-1', 'T1'))
                .toBe('Notes: "[Bavardage] avec son voisin"');

            // 2. Si le tag devient significatif (2e occurrence), il passe dans Observations: sans doublon de préfixe
            JournalManager.addEntry('student-1', {
                tags: ['bavardage'],
                note: ''
            });
            const synth2 = JournalManager.synthesizeForPrompt('student-1', 'T1');
            expect(synth2).toContain('Observations: Bavardage');
            expect(synth2).toContain('Notes: "avec son voisin"');
            expect(synth2).not.toContain('[Bavardage]');
        });
    });
});
