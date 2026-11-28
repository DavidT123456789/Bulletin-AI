/**
 * @fileoverview Tests unitaires pour JournalManager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JournalManager } from './JournalManager.js';
import { FocusPanelJournal } from './FocusPanelJournal.js';
import { ClassManager } from './ClassManager.js';
import { appState, userSettings } from '../state/State.js';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        currentPeriod: 'T1',
        currentClassId: null,
        classes: [],
        journalIncludeNotes: true,
        journalIncludeTags: true,
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
        appState.journalIncludeNotes = true;
        appState.journalIncludeTags = true;
        delete appState.journalIncludeInAI;
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
        it('returns period-specific title and channel-aware subtitle', () => {
            appState.classes = [{ id: 'c1', name: '3A', journalIncludeNotes: true, journalIncludeTags: true }];
            const bothOn = JournalManager.getEmptyStateCopy('c1', 'T2');
            expect(bothOn.title).toContain('T2');
            expect(bothOn.subtitle).toContain('tags et observations écrites transmis à l\'IA');

            appState.classes[0].journalIncludeTags = false;
            expect(JournalManager.getEmptyStateCopy('c1', 'T2').subtitle).toContain('observations écrites transmises à l\'IA');

            appState.classes[0].journalIncludeNotes = false;
            appState.classes[0].journalIncludeTags = true;
            expect(JournalManager.getEmptyStateCopy('c1', 'T2').subtitle).toContain('tags transmis à l\'IA');

            appState.classes[0].journalIncludeTags = false;
            expect(JournalManager.getEmptyStateCopy('c1', 'T2').subtitle).toContain('bloc-notes personnel');
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

        it('n\'affiche pas le faux tag technique Remarque sur les notes libres et expose uiTagLabels/standaloneLabels', () => {
            JournalManager.addEntry('student-1', {
                tags: [],
                note: 'Observation libre publique'
            });
            JournalManager.addEntry('student-1', {
                tags: [],
                note: 'Point parents prévu vendredi.',
                isPrivate: true
            });
            JournalManager.addEntry('student-1', {
                tags: ['progres'],
                note: 'Méthode bien appliquée'
            });

            const html = JournalManager.renderTimeline('student-1', 'T1');
            expect(html).not.toContain('Remarque');
            expect(html).toContain('journal-entry-note--standalone');
            expect(html).toContain('Observation libre publique');
            expect(html).toContain('Point parents prévu vendredi.');
            expect(html).toContain('journal-private-badge');
            expect(html).toContain('Progrès');

            const summary = JournalManager.getAISummary('student-1', 'T1');
            expect(summary.standaloneLabels).toEqual([]);
            expect(summary.notes).toHaveLength(2);
            expect(summary.notes[0].uiTagLabels).toEqual([]);
            expect(summary.notes[1].uiTagLabels).toEqual(['Progrès (1×)']);
            expect(summary.compactText).toBe('1 tag · 2 obs. écrites');
        });
    });

    describe('synthesizeForPrompt & canaux indépendants (Observations écrites / Tags / Hors IA)', () => {
        it('transmet une note rédigée sans tag et transmet tout tag non privé avec sa fréquence (N×)', () => {
            JournalManager.addEntry('student-1', {
                tags: [],
                note: 'Excellent exposé oral devant la classe'
            });

            const synthesis = JournalManager.synthesizeForPrompt('student-1', 'T1');
            expect(synthesis).toBe('Notes: "Excellent exposé oral devant la classe"');
            expect(synthesis).not.toContain('Observations:');

            JournalManager.addEntry('student-1', { tags: ['bavardage'], note: '' });
            expect(JournalManager.synthesizeForPrompt('student-1', 'T1'))
                .toBe('Observations: Bavardage (1×). Notes: "Excellent exposé oral devant la classe"');

            JournalManager.addEntry('student-1', { tags: ['bavardage'], note: '' });
            expect(JournalManager.synthesizeForPrompt('student-1', 'T1'))
                .toBe('Observations: Bavardage (2×). Notes: "Excellent exposé oral devant la classe"');
        });

        it('pilote indépendamment Observations écrites et Tags (4 combinaisons + migration legacy journalIncludeInAI)', () => {
            appState.classes = [
                { id: 'c-both', name: '3A', journalIncludeNotes: true, journalIncludeTags: true },
                { id: 'c-notes', name: '3B', journalIncludeNotes: true, journalIncludeTags: false },
                { id: 'c-tags', name: '3C', journalIncludeNotes: false, journalIncludeTags: true },
                { id: 'c-off', name: '3D', journalIncludeNotes: false, journalIncludeTags: false },
                { id: 'c-legacy-off', name: '3E', journalIncludeInAI: false }
            ];
            const entries = [
                { id: 'j1', period: 'T1', tags: ['oubli'], note: '' },
                { id: 'j2', period: 'T1', tags: ['progres'], note: 'Méthode bien appliquée en autonomie.' },
                { id: 'j3', period: 'T1', tags: ['remarque'], note: 'Point parents vendredi.', isPrivate: true }
            ];

            // 1. ON / ON (Sophie) : 2 tags (Oubli 1× + Progrès 1× sur la note) · 1 obs. écrite, zéro doublon
            const both = JournalManager.getAISummary({ id: 's1', classId: 'c-both', journal: entries }, 'T1');
            expect(both.compactText).toBe('2 tags · 1 obs. écrite');
            expect(both.standaloneLabels).toEqual(['Oubli d\'affaires (1×)']);
            expect(both.transmittedTagIds).toEqual(['oubli', 'progres']);
            expect(JournalManager.synthesizeForPrompt({ id: 's1', classId: 'c-both', journal: entries }, 'T1'))
                .toBe('Observations: Oubli d\'affaires (1×). Notes: "[Progrès (1×)] Méthode bien appliquée en autonomie."');

            // 2. Observations écrites ON / Tags OFF : aucune fuite de tag (y compris retrait du préfixe [Progrès])
            const notesOnly = JournalManager.getAISummary({ id: 's2', classId: 'c-notes', journal: entries }, 'T1');
            expect(notesOnly.compactText).toBe('1 observation écrite');
            expect(notesOnly.tags).toEqual([]);
            expect(notesOnly.transmittedTagIds).toEqual([]);
            expect(notesOnly.notes).toEqual([{ text: 'Méthode bien appliquée en autonomie.', extraTagLabels: [], uiTagLabels: [] }]);
            expect(JournalManager.synthesizeForPrompt({ id: 's2', classId: 'c-notes', journal: entries }, 'T1'))
                .toBe('Notes: "Méthode bien appliquée en autonomie."');

            // 3. Observations écrites OFF / Tags ON : uniquement les tags avec fréquences, zéro texte libre
            const tagsOnly = JournalManager.getAISummary({ id: 's3', classId: 'c-tags', journal: entries }, 'T1');
            expect(tagsOnly.compactText).toBe('2 tags');
            expect(tagsOnly.notes).toEqual([]);
            expect(tagsOnly.standaloneLabels).toEqual(['Oubli d\'affaires (1×)', 'Progrès (1×)']);
            expect(JournalManager.synthesizeForPrompt({ id: 's3', classId: 'c-tags', journal: entries }, 'T1'))
                .toBe('Observations: Oubli d\'affaires (1×), Progrès (1×)');

            // 4. OFF / OFF & legacy journalIncludeInAI: false -> Hors IA total
            expect(JournalManager.isIncludedInAI('c-off')).toBe(false);
            expect(JournalManager.synthesizeForPrompt({ id: 's4', classId: 'c-off', journal: entries }, 'T1')).toBe('');
            expect(JournalManager.isIncludedInAI('c-legacy-off')).toBe(false);
            expect(JournalManager.isNotesIncludedInAI('c-legacy-off')).toBe(false);
            expect(JournalManager.isTagsIncludedInAI('c-legacy-off')).toBe(false);
        });

        it('préfixe une note rédigée par le libellé de son tag (1×) sans dupliquer les tags répétés (2×+)', () => {
            JournalManager.addEntry('student-1', {
                tags: ['bavardage'],
                note: 'avec son voisin'
            });
            expect(JournalManager.synthesizeForPrompt('student-1', 'T1'))
                .toBe('Notes: "[Bavardage (1×)] avec son voisin"');

            JournalManager.addEntry('student-1', {
                tags: ['bavardage'],
                note: ''
            });
            const synth2 = JournalManager.synthesizeForPrompt('student-1', 'T1');
            expect(synth2).toBe('Observations: Bavardage (2×). Notes: "avec son voisin"');
            expect(synth2).not.toContain('[Bavardage');
        });

        it('exclut les entrées privées (isPrivate) de la synthèse IA et conserve un seuil interne ≥2 pour les tendances de classe', () => {
            const priv = JournalManager.addEntry('student-1', {
                tags: ['bavardage'],
                note: 'Incident confidentiel famille',
                isPrivate: true
            });
            JournalManager.addEntry('student-1', {
                tags: ['bavardage'],
                note: ''
            });
            const pub = JournalManager.addEntry('student-1', {
                tags: ['participation+'],
                note: 'Bonne intervention orale',
                isPrivate: false
            });

            expect(priv.isPrivate).toBe(true);
            expect(pub.isPrivate).toBeUndefined();

            // Tendances de classe (ClassDashboard) : exige ≥2 occurrences non privées
            expect(JournalManager.getSignificantTagIds('student-1', 'T1')).toEqual([]);
            const synth = JournalManager.synthesizeForPrompt('student-1', 'T1');
            expect(synth).not.toContain('Incident confidentiel famille');
            expect(synth).toContain('Bavardage (1×)');
            expect(synth).toContain('Bonne intervention orale');

            // Bascule de privé à public -> atteint 2× pour les tendances de classe
            JournalManager.updateEntry('student-1', priv.id, { isPrivate: false });
            expect(JournalManager.getSignificantTagIds('student-1', 'T1')).toEqual(['bavardage']);
            expect(JournalManager.synthesizeForPrompt('student-1', 'T1')).toContain('Bavardage (2×)');

            // Re-marquer privé -> ré-apparaît avec le badge Privé dans la timeline HTML
            JournalManager.updateEntry('student-1', priv.id, { isPrivate: true });
            const html = JournalManager.renderTimeline('student-1', 'T1');
            expect(html).toContain('journal-private-badge');
            expect(html).toContain('is-private');
        });

        it('transmet plus de 3 notes rédigées non-privées sans troncature silencieuse à 3', () => {
            for (let i = 1; i <= 5; i++) {
                JournalManager.addEntry('student-1', {
                    tags: [],
                    note: `Observation numéro ${i}`
                });
            }
            const synth = JournalManager.synthesizeForPrompt('student-1', 'T1');
            for (let i = 1; i <= 5; i++) {
                expect(synth).toContain(`Observation numéro ${i}`);
            }
        });

        it('traduit Attitude + / Attitude - en libellés IA explicites avec fréquence tout en gardant les badges UI courts', () => {
            expect(JournalManager.getPromptLabel('attitude+')).toBe('Attitude positive');
            expect(JournalManager.getPromptLabel('attitude-')).toBe('Attitude à revoir');
            expect(JournalManager.getPromptLabel('bavardage')).toBe('Bavardage');
            expect(JournalManager.getPromptLabel('inconnu')).toBe('inconnu');

            JournalManager.addEntry('student-1', { tags: ['attitude-'], note: 'Soupirs répétés en classe' });
            const singleSummary = JournalManager.getAISummary('student-1', 'T1');
            expect(singleSummary.displayText).toBe('Attitude à revoir (1×) : « Soupirs répétés en classe »');
            expect(singleSummary.transmittedCount).toBe(1);
            expect(singleSummary.compactText).toBe('1 tag · 1 obs. écrite');
            expect(singleSummary.transmittedTagIds).toEqual(['attitude-']);
            expect(JournalManager.synthesizeForPrompt('student-1', 'T1'))
                .toBe('Notes: "[Attitude à revoir (1×)] Soupirs répétés en classe"');

            JournalManager.addEntry('student-1', { tags: ['attitude-'], note: '' });
            JournalManager.addEntry('student-1', { tags: ['attitude+'], note: '' });
            JournalManager.addEntry('student-1', { tags: ['attitude+'], note: '' });
            const summary = JournalManager.getAISummary('student-1', 'T1');
            expect(summary.tags.map(t => t.formattedLabel)).toEqual(['Attitude à revoir (2×)', 'Attitude positive (2×)']);
            expect(summary.displayText).not.toContain('Attitude -');
            expect(summary.displayText).not.toContain('Attitude +');
            expect(summary.transmittedCount).toBe(4);
            expect(summary.compactText).toBe('2 tags · 1 obs. écrite');

            const synth = JournalManager.synthesizeForPrompt('student-1', 'T1');
            expect(synth).toContain('Observations: Attitude à revoir (2×), Attitude positive (2×)');
            expect(synth).not.toContain('Attitude -');
            expect(synth).not.toContain('Attitude +');

            // Les badges UI conservent les libellés compacts
            const html = JournalManager.renderTimeline('student-1', 'T1');
            expect(html).toContain('Attitude -');
            expect(html).toContain('Attitude +');
        });

        it('exclut le tag technique remarque des signaux IA tout en le conservant dans countTags', () => {
            JournalManager.addEntry('student-1', { tags: [], note: 'Note libre 1' });
            JournalManager.addEntry('student-1', { tags: [], note: 'Note libre 2' });

            expect(JournalManager.countTags('student-1', 'T1')).toEqual({ remarque: 2 });
            expect(JournalManager.getAggregatedCounts('student-1', 'T1')).toHaveLength(1);
            expect(JournalManager.getAggregatedCounts('student-1', 'T1', { excludeRemarque: true })).toEqual([]);

            expect(JournalManager.getSignificantTagIds('student-1', 'T1')).toEqual([]);
            const summary = JournalManager.getAISummary('student-1', 'T1');
            expect(summary.tags).toEqual([]);
            expect(summary.compactText).toBe('2 observations écrites');
            expect(summary.displayText).not.toContain('Remarque');

            const synth = JournalManager.synthesizeForPrompt('student-1', 'T1');
            expect(synth).toBe('Notes: "Note libre 1" | "Note libre 2"');
        });
    });

    describe('FocusPanelJournal.resetEditingState()', () => {
        it('réinitialise synchroniquement le brouillon, les tags et le bouton +/× sans laisser de reliquat', () => {
            document.body.innerHTML = `
                <div class="journal-section editing" id="focusJournalSection">
                    <button type="button" id="focusJournalNoteBtn" aria-label="Fermer" aria-expanded="true"></button>
                    <div id="focusJournalContent">
                        ${JournalManager.renderDraftPreview()}
                    </div>
                </div>
            `;
            const draft = document.getElementById('journalDraftPreview');
            draft.classList.add('visible', 'is-editing');
            const input = document.getElementById('journalNoteInput');
            input.value = 'Brouillon en cours';
            const saveBtn = document.getElementById('journalDraftSaveBtn');
            saveBtn.disabled = false;
            FocusPanelJournal._editingJournalEntryId = 'j_123';
            FocusPanelJournal._selectedJournalTags = ['bavardage'];
            FocusPanelJournal._isDraftPrivate = true;

            FocusPanelJournal.resetEditingState({ silentHistory: true });

            expect(FocusPanelJournal.getEditingEntryId()).toBeNull();
            expect(FocusPanelJournal._selectedJournalTags).toEqual([]);
            expect(FocusPanelJournal._isDraftPrivate).toBe(false);
            expect(document.getElementById('focusJournalSection').classList.contains('editing')).toBe(false);
            expect(draft.classList.contains('visible')).toBe(false);
            expect(draft.classList.contains('is-editing')).toBe(false);
            expect(input.value).toBe('');
            expect(saveBtn.disabled).toBe(true);
            const noteBtn = document.getElementById('focusJournalNoteBtn');
            expect(noteBtn.getAttribute('aria-label')).toBe('Ajouter une observation');
            expect(noteBtn.getAttribute('aria-expanded')).toBe('false');
        });
    });

    describe('FocusPanelJournal animation lifecycle guards', () => {
        const mountJournalDOM = () => {
            document.body.innerHTML = `
                <div class="journal-section" id="focusJournalSection">
                    <span id="focusJournalTitle"></span>
                    <span id="focusJournalEmptyHint"></span>
                    <span id="focusJournalCount"></span>
                    <button type="button" id="focusJournalNoteBtn" aria-label="Ajouter une observation" aria-expanded="false"></button>
                    <div class="journal-content" id="focusJournalContent"></div>
                    <div id="journalThresholdControl">
                        <button type="button" id="journalThresholdBtn"><span id="journalThresholdValue"></span></button>
                    </div>
                </div>
            `;
        };

        beforeEach(() => {
            FocusPanelJournal._lastRenderedContext = null;
            FocusPanelJournal._clearCloseTimer();
            FocusPanelJournal.resetEditingState({ silentHistory: true });
            FocusPanelJournal._callbacks = {
                getCurrentStudentId: () => 'student-1',
                onStatusRefresh: vi.fn()
            };
        });

        it('n\'applique .fade-in sur la timeline qu\'au changement d\'élève ou de période (zéro clignotement local)', () => {
            mountJournalDOM();
            JournalManager.addEntry('student-1', { tags: ['progres'], note: 'Bon début' });
            const student1 = appState.generatedResults[0];

            // 1er rendu pour student-1:T1 -> fade-in actif
            FocusPanelJournal.render(student1);
            expect(document.querySelector('.journal-timeline').classList.contains('fade-in')).toBe(true);

            // Re-rendu pour le même élève/période (ex. changement de seuil) -> pas de fade-in
            FocusPanelJournal.render(student1);
            expect(document.querySelector('.journal-timeline').classList.contains('fade-in')).toBe(false);

            // Changement d'élève -> fade-in réactivé
            appState.generatedResults.push({
                id: 'student-2',
                name: 'MARTIN Claire',
                journal: [{ id: 'j_2', date: '2026-10-01T10:00:00.000Z', tags: ['participation+'], note: '', period: 'T1' }]
            });
            FocusPanelJournal.render(appState.generatedResults[1]);
            expect(document.querySelector('.journal-timeline').classList.contains('fade-in')).toBe(true);
        });

        it('enregistre synchroniquement dans _saveEntry, resynchronise immédiatement le bouton × -> + et annule le timer si resetEditingState survient', () => {
            vi.useFakeTimers();
            try {
                mountJournalDOM();
                const student1 = appState.generatedResults[0];
                FocusPanelJournal.render(student1);
                FocusPanelJournal.toggleQuickAdd(true, true);

                const section = document.getElementById('focusJournalSection');
                const noteBtn = document.getElementById('focusJournalNoteBtn');
                expect(section.classList.contains('editing')).toBe(true);
                expect(noteBtn.getAttribute('aria-expanded')).toBe('true');

                FocusPanelJournal._selectedJournalTags = ['progres'];
                document.getElementById('journalNoteInput').value = 'Excellente progression';

                FocusPanelJournal._saveEntry();

                // Donnée persistée synchroniquement (aucune race condition si navigation immédiate)
                expect(student1.journal).toHaveLength(1);
                expect(student1.journal[0].note).toBe('Excellente progression');

                // Bouton × -> + synchronisé dès le clic (sans attendre 250ms)
                expect(section.classList.contains('editing')).toBe(false);
                expect(noteBtn.getAttribute('aria-expanded')).toBe('false');
                expect(document.querySelector('.journal-crossfade-wrapper.is-visible')).not.toBeNull();

                // Nettoyage anticipé annule le timer et retire le wrapper crossfade proprement
                FocusPanelJournal.resetEditingState({ silentHistory: true });
                expect(FocusPanelJournal._closeTimer).toBeNull();
                expect(document.querySelector('.journal-crossfade-wrapper')).toBeNull();

                vi.advanceTimersByTime(300);
                expect(student1.journal).toHaveLength(1);
            } finally {
                vi.useRealTimers();
            }
        });

        it('exécute la fermeture et la sauvegarde sans délai en mode prefers-reduced-motion: reduce', () => {
            const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true });
            try {
                mountJournalDOM();
                const student1 = appState.generatedResults[0];
                FocusPanelJournal.render(student1);
                FocusPanelJournal.toggleQuickAdd(true, true);

                FocusPanelJournal._selectedJournalTags = ['bavardage'];
                FocusPanelJournal._saveEntry();

                // Exécution synchrone immédiate sans timer ni crossfade-wrapper résiduel
                expect(FocusPanelJournal._closeTimer).toBeNull();
                expect(document.querySelector('.journal-crossfade-wrapper')).toBeNull();
                expect(document.getElementById('journalDraftPreview').classList.contains('visible')).toBe(false);
                expect(student1.journal).toHaveLength(1);
            } finally {
                matchMediaSpy.mockRestore();
            }
        });

        it('ne recrée pas les nœuds DOM de la timeline lors de l\'annulation de Nouvelle observation', () => {
            const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true });
            try {
                mountJournalDOM();
                JournalManager.addEntry('student-1', { tags: ['progres'], note: 'Déjà présent' });
                const student1 = appState.generatedResults[0];

                FocusPanelJournal.render(student1);
                const existingEntryNode = document.querySelector('.journal-entry');
                expect(existingEntryNode).not.toBeNull();

                FocusPanelJournal.toggleQuickAdd(true, true);
                FocusPanelJournal.toggleQuickAdd(false);

                // Exactement le même nœud DOM conservé (zéro innerHTML inutile)
                expect(document.querySelector('.journal-entry')).toBe(existingEntryNode);
            } finally {
                matchMediaSpy.mockRestore();
            }
        });

        it('termine la fermeture exactement sur transitionend(grid-template-rows), libère .is-collapsing, ferme le popover et rafraîchit les brumes de scroll', () => {
            vi.useFakeTimers();
            try {
                mountJournalDOM();
                const bindScrollAffordances = vi.fn();
                FocusPanelJournal._callbacks.bindScrollAffordances = bindScrollAffordances;
                JournalManager.addEntry('student-1', { tags: ['progres'], note: 'Bon travail' });
                const student1 = appState.generatedResults[0];

                FocusPanelJournal.render(student1);
                bindScrollAffordances.mockClear();

                const contentEl = document.getElementById('focusJournalContent');
                const thresholdControl = document.getElementById('journalThresholdControl');
                Object.defineProperty(contentEl, 'offsetHeight', { configurable: true, value: 360 });

                FocusPanelJournal.toggleQuickAdd(true, true);
                thresholdControl.classList.add('open');

                FocusPanelJournal.toggleQuickAdd(false);

                const draftPreview = document.getElementById('journalDraftPreview');
                expect(draftPreview.classList.contains('closing')).toBe(true);
                expect(contentEl.classList.contains('is-collapsing')).toBe(true);
                expect(contentEl.style.maxHeight).toBe('');
                expect(thresholdControl.classList.contains('open')).toBe(false);

                // Un transitionend sur une autre propriété (ex. opacity) ne doit pas clore prématurément
                const opacityEv = new Event('transitionend');
                Object.defineProperty(opacityEv, 'propertyName', { value: 'opacity' });
                draftPreview.dispatchEvent(opacityEv);
                expect(draftPreview.classList.contains('visible')).toBe(true);
                expect(contentEl.classList.contains('is-collapsing')).toBe(true);

                // Le transitionend sur grid-template-rows conclut proprement en un seul appel
                const gridEv = new Event('transitionend');
                Object.defineProperty(gridEv, 'propertyName', { value: 'grid-template-rows' });
                draftPreview.dispatchEvent(gridEv);

                expect(draftPreview.classList.contains('visible')).toBe(false);
                expect(draftPreview.classList.contains('closing')).toBe(false);
                expect(contentEl.classList.contains('is-collapsing')).toBe(false);
                expect(FocusPanelJournal._closeTimer).toBeNull();
                expect(bindScrollAffordances).toHaveBeenCalledTimes(1);

                // Le timer fallback ne déclenche pas de second nettoyage après transitionend
                vi.advanceTimersByTime(300);
                expect(bindScrollAffordances).toHaveBeenCalledTimes(1);
            } finally {
                vi.useRealTimers();
            }
        });

        it('annule proprement listener transitionend et .is-collapsing lors d\'une réouverture en cours de fermeture', () => {
            vi.useFakeTimers();
            try {
                mountJournalDOM();
                JournalManager.addEntry('student-1', { tags: ['progres'], note: 'Bon travail' });
                const student1 = appState.generatedResults[0];
                FocusPanelJournal.render(student1);

                const contentEl = document.getElementById('focusJournalContent');
                Object.defineProperty(contentEl, 'offsetHeight', { configurable: true, value: 320 });

                FocusPanelJournal.toggleQuickAdd(true, true);
                FocusPanelJournal.toggleQuickAdd(false);
                expect(contentEl.classList.contains('is-collapsing')).toBe(true);

                // Réouverture immédiate avant la fin de la transition
                FocusPanelJournal.toggleQuickAdd(true, true);
                expect(contentEl.classList.contains('is-collapsing')).toBe(false);
                expect(FocusPanelJournal._closeTimer).toBeNull();

                // Un transitionend tardif ne doit pas refermer le brouillon rouvert
                const draftPreview = document.getElementById('journalDraftPreview');
                const gridEv = new Event('transitionend');
                Object.defineProperty(gridEv, 'propertyName', { value: 'grid-template-rows' });
                draftPreview.dispatchEvent(gridEv);
                vi.advanceTimersByTime(300);

                expect(draftPreview.classList.contains('visible')).toBe(true);
                expect(document.getElementById('focusJournalSection').classList.contains('editing')).toBe(true);
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('renderTimeline period isolation & channel switch UI', () => {
        it('ne mélange pas les entrées d\'autres périodes quand renderTimeline et getAISummary sont appelés sur la période courante', () => {
            appState.currentPeriod = 'T2';
            appState.generatedResults = [{
                id: 'student-1',
                name: 'DUPONT Jean',
                journal: [
                    { id: 'j_t1', date: '2026-10-01T10:00:00.000Z', tags: ['bavardage'], note: 'Note T1', period: 'T1' },
                    { id: 'j_t2', date: '2026-11-01T10:00:00.000Z', tags: ['bavardage'], note: '', period: 'T2' }
                ]
            }];

            const html = JournalManager.renderTimeline('student-1');
            expect(html).not.toContain('Note T1');
            expect(html).not.toContain('journal-isolated-badge');
            expect(JournalManager.getAISummary('student-1').standaloneLabels).toEqual(['Bavardage (1×)']);
        });

        it('cible la classe physique de l\'élève (et non une classe virtuelle) lors du basculement des switches Observations écrites / Tags', () => {
            vi.useFakeTimers();
            const physicalClass = { id: 'grp-3a-1', name: '3A Grp 1', journalIncludeNotes: true, journalIncludeTags: true };
            appState.classes = [physicalClass];
            userSettings.academic.classes = [physicalClass];
            appState.currentClassId = 'virtual_3a';
            appState.generatedResults = [{
                id: 'stu-v1',
                classId: 'grp-3a-1',
                name: 'ROBERT Léo',
                journal: [{ id: 'j1', date: '2026-11-01T10:00:00.000Z', tags: ['bavardage'], note: '', period: 'T1' }]
            }];

            const updateClassSpy = vi.spyOn(ClassManager, 'updateClass').mockImplementation((id, updates) => {
                if (id === physicalClass.id) Object.assign(physicalClass, updates);
                return physicalClass;
            });

            document.body.innerHTML = `
                <div class="journal-section" id="focusJournalSection">
                    <span id="focusJournalTitle"></span>
                    <span id="focusJournalEmptyHint"></span>
                    <span id="focusJournalCount"></span>
                    <button type="button" id="focusJournalNoteBtn"></button>
                    <div class="journal-content" id="focusJournalContent"></div>
                    <div id="journalThresholdControl">
                        <button type="button" id="journalThresholdBtn">
                            <iconify-icon id="journalThresholdIcon"></iconify-icon>
                            <span id="journalThresholdValue"></span>
                        </button>
                        <div id="journalThresholdPopover">
                            <span id="journalThresholdScope"></span>
                            <input type="checkbox" id="journalIncludeNotesToggle" checked>
                            <input type="checkbox" id="journalIncludeTagsToggle" checked>
                            <div id="journalAiPopoverHint"></div>
                        </div>
                    </div>
                </div>
            `;

            try {
                FocusPanelJournal._lastRenderedContext = null;
                FocusPanelJournal.init({
                    getCurrentStudentId: () => 'stu-v1',
                    onStatusRefresh: vi.fn()
                });
                FocusPanelJournal.render(appState.generatedResults[0]);

                expect(document.getElementById('journalThresholdScope').textContent).toBe('Classe : 3A Grp 1');
                expect(document.getElementById('journalThresholdValue').textContent).toContain('1 tag');

                // Désactiver Tags en vue classe virtuelle -> met à jour grp-3a-1
                const tagsToggle = document.getElementById('journalIncludeTagsToggle');
                expect(tagsToggle.checked).toBe(true);
                tagsToggle.checked = false;
                tagsToggle.dispatchEvent(new Event('change', { bubbles: true }));
                vi.runAllTimers();

                expect(physicalClass.journalIncludeTags).toBe(false);
                expect(physicalClass.journalIncludeNotes).toBe(true);
                expect(typeof physicalClass.journalSettingsUpdatedAt).toBe('number');
                expect(updateClassSpy).toHaveBeenCalledWith(
                    'grp-3a-1',
                    expect.objectContaining({
                        journalIncludeNotes: true,
                        journalIncludeTags: false,
                        journalSettingsUpdatedAt: expect.any(Number)
                    })
                );
                expect(document.getElementById('journalThresholdValue').textContent).toBe('Aucune observation écrite à transmettre');

                // Réactiver Tags -> revient à 1 tag
                tagsToggle.checked = true;
                tagsToggle.dispatchEvent(new Event('change', { bubbles: true }));
                vi.runAllTimers();
                expect(physicalClass.journalIncludeTags).toBe(true);
                expect(document.getElementById('journalThresholdValue').textContent).toContain('1 tag');
            } finally {
                updateClassSpy.mockRestore();
                vi.useRealTimers();
            }
        });

        it('met à jour en place les classes monotones (.is-tags-excluded / .is-notes-excluded / .is-ai-excluded), le placeholder et le pied de carte sans détruire les <iconify-icon>', () => {
            vi.useFakeTimers();
            const physicalClass = { id: 'cls-1', name: '3ème A', journalIncludeNotes: true, journalIncludeTags: true };
            appState.classes = [physicalClass];
            userSettings.academic.classes = [physicalClass];
            appState.currentClassId = 'cls-1';
            appState.currentPeriod = 'T1';
            appState.generatedResults = [{
                id: 'stu-1',
                classId: 'cls-1',
                name: 'DUPONT Thomas',
                journal: [
                    { id: 'j1', date: '2026-11-28T10:00:00.000Z', tags: ['oubli'], note: '', period: 'T1' },
                    { id: 'j2', date: '2026-11-28T09:00:00.000Z', tags: ['progres'], note: 'Méthode bien appliquée.', period: 'T1' }
                ]
            }];

            const updateClassSpy = vi.spyOn(ClassManager, 'updateClass').mockImplementation((id, updates) => {
                if (id === physicalClass.id) Object.assign(physicalClass, updates);
                return physicalClass;
            });
            const statusRefreshSpy = vi.fn();

            document.body.innerHTML = `
                <div class="journal-section" id="focusJournalSection">
                    <span id="focusJournalTitle"></span>
                    <span id="focusJournalEmptyHint"></span>
                    <span id="focusJournalCount"></span>
                    <button type="button" id="focusJournalNoteBtn"></button>
                    <div class="journal-content" id="focusJournalContent"></div>
                    <div id="journalThresholdControl">
                        <button type="button" id="journalThresholdBtn">
                            <iconify-icon id="journalThresholdIcon" icon="solar:stars-line-duotone"></iconify-icon>
                            <span id="journalThresholdValue"></span>
                        </button>
                        <div id="journalThresholdPopover">
                            <span id="journalThresholdScope"></span>
                            <input type="checkbox" id="journalIncludeNotesToggle" checked>
                            <input type="checkbox" id="journalIncludeTagsToggle" checked>
                            <div id="journalAiPopoverHint"></div>
                        </div>
                    </div>
                </div>
            `;

            try {
                FocusPanelJournal._lastRenderedContext = null;
                FocusPanelJournal.init({
                    getCurrentStudentId: () => 'stu-1',
                    onStatusRefresh: statusRefreshSpy
                });
                FocusPanelJournal.render(appState.generatedResults[0]);

                const section = document.getElementById('focusJournalSection');
                const entryNodesBefore = Array.from(document.querySelectorAll('.journal-entry'));
                const timelineIconsBefore = Array.from(document.querySelectorAll('#journalTimelineContainer .journal-tag iconify-icon'));
                const headerIconsBefore = Array.from(document.querySelectorAll('#focusJournalCount .journal-count-tag iconify-icon'));
                const notesToggle = document.getElementById('journalIncludeNotesToggle');
                const tagsToggle = document.getElementById('journalIncludeTagsToggle');
                const noteInput = document.getElementById('journalNoteInput');
                const popoverHint = document.getElementById('journalAiPopoverHint');

                expect(entryNodesBefore).toHaveLength(2);
                expect(timelineIconsBefore).toHaveLength(2);
                expect(headerIconsBefore).toHaveLength(2);
                expect(document.getElementById('journalThresholdValue').textContent).toBe("Transmis à l'IA : 2 tags · 1 obs. écrite");
                expect(noteInput.placeholder).toBe("Observation écrite (optionnel, transmise à l'IA)…");
                expect(popoverHint.textContent).toBe('Les entrées Privé ne sont jamais transmises.');

                // 1. Couper Tags -> conserve les couleurs sémantiques, met à jour le pied de carte et les infobulles d'en-tête
                tagsToggle.checked = false;
                tagsToggle.dispatchEvent(new Event('change', { bubbles: true }));
                vi.runAllTimers();

                expect(Array.from(document.querySelectorAll('.journal-entry'))).toEqual(entryNodesBefore);
                expect(Array.from(document.querySelectorAll('#journalTimelineContainer .journal-tag iconify-icon'))).toEqual(timelineIconsBefore);
                expect(Array.from(document.querySelectorAll('#focusJournalCount .journal-count-tag iconify-icon'))).toEqual(headerIconsBefore);
                expect(section.classList.contains('is-ai-excluded')).toBe(false);
                expect(document.getElementById('journalThresholdValue').textContent).toBe("Transmis à l'IA : 1 observation écrite");
                expect(statusRefreshSpy).toHaveBeenCalledWith({ dirtyOnly: true });

                // 2. Couper aussi Observations écrites -> mode bloc-notes perso (OFF/OFF : garde les couleurs, passe le pied de carte en cadenas)
                notesToggle.checked = false;
                notesToggle.dispatchEvent(new Event('change', { bubbles: true }));
                vi.runAllTimers();

                expect(Array.from(document.querySelectorAll('#journalTimelineContainer .journal-tag iconify-icon'))).toEqual(timelineIconsBefore);
                expect(section.classList.contains('is-ai-excluded')).toBe(true);
                expect(document.getElementById('journalThresholdIcon').getAttribute('icon')).toBe('solar:lock-keyhole-minimalistic-linear');
                expect(document.getElementById('journalThresholdValue').textContent).toBe("Journal personnel · Non transmis à l'IA");
                expect(noteInput.placeholder).toBe('Observation personnelle (optionnel)…');
                expect(popoverHint.textContent).toBe("Journal personnel : rien n'est transmis à l'IA.");

                // 3. Réactiver uniquement Tags -> Tags ON, Observations écrites OFF
                tagsToggle.checked = true;
                tagsToggle.dispatchEvent(new Event('change', { bubbles: true }));
                vi.runAllTimers();

                expect(section.classList.contains('is-ai-excluded')).toBe(false);
                expect(document.getElementById('journalThresholdValue').textContent).toBe("Transmis à l'IA : 2 tags");
                expect(noteInput.placeholder).toBe("Note personnelle (optionnel, non transmise à l'IA)…");

                // 4. Journal vide avec les 2 canaux actifs
                notesToggle.checked = true;
                notesToggle.dispatchEvent(new Event('change', { bubbles: true }));
                vi.runAllTimers();
                appState.generatedResults[0].journal = [];
                FocusPanelJournal.render(appState.generatedResults[0]);
                expect(document.getElementById('journalThresholdValue').textContent).toBe('Aucune observation transmise');
                expect(document.getElementById('journalNoteInput').placeholder).toBe("Observation écrite (optionnel, transmise à l'IA)…");
            } finally {
                updateClassSpy.mockRestore();
                vi.useRealTimers();
            }
        });
    });
});
