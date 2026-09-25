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
        journalThreshold: 2,
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
        appState.journalThreshold = 2;
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
        it('should render new structured draft preview markup with prominent save button', () => {
            const html = JournalManager.renderDraftPreview();

            expect(html).toContain('id="journalDraftPreview"');
            expect(html).toContain('class="journal-draft-title"');
            expect(html).toContain('Nouvelle observation');
            expect(html).toContain('id="journalDraftPills"');
            expect(html).toContain('id="journalSelectedTags"');
            expect(html).toContain('id="journalNoteInput"');
            expect(html).toContain('id="journalCharCount"');
            expect(html).toContain('id="journalDraftCancelBtn"');
            expect(html).toContain('id="journalDraftCancelFooterBtn"');
            expect(html).toContain('id="journalDraftSaveBtn"');
            expect(html).toContain('Enregistrer');
        });

        it('should render edit mode with appropriate title and pre-filled data', () => {
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
        });
    });
});
