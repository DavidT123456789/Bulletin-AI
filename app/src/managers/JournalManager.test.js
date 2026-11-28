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
            expect(summary.notes[1].uiTagLabels).toEqual(['Progrès']);
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

        it('exclut les entrées privées (isPrivate) de la synthèse IA et des compteurs tout en les affichant en timeline', () => {
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

            // 1 seule occurrence non-privée de bavardage -> ne franchit pas le seuil 2
            expect(JournalManager.getSignificantTagIds('student-1', 'T1')).toEqual([]);
            const synth = JournalManager.synthesizeForPrompt('student-1', 'T1');
            expect(synth).not.toContain('Incident confidentiel famille');
            expect(synth).toContain('Bonne intervention orale');

            // Une entrée privée n'est jamais marquée "isolée" pour l'IA
            const counts = JournalManager.countTags('student-1', 'T1', { excludePrivate: true });
            expect(JournalManager.isEntryIsolated(priv, counts, 2)).toBe(false);

            // Bascule de privé à public via updateEntry -> devient visible pour l'IA
            JournalManager.updateEntry('student-1', priv.id, { isPrivate: false });
            expect(JournalManager.getSignificantTagIds('student-1', 'T1')).toEqual(['bavardage']);
            expect(JournalManager.synthesizeForPrompt('student-1', 'T1')).toContain('Incident confidentiel famille');

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

        it('calcule getAISummary en mode Hors IA, sous le seuil et combiné tags + notes', () => {
            // Hors IA
            appState.journalIncludeInAI = false;
            JournalManager.addEntry('student-1', { tags: ['bavardage'], note: 'Bavarde' });
            const offSummary = JournalManager.getAISummary('student-1', 'T1');
            expect(offSummary.includedInAI).toBe(false);
            expect(offSummary.displayText).toBe('');

            // Actif, tag seul sous le seuil (threshold = 2), note privée exclue
            appState.journalIncludeInAI = true;
            appState.generatedResults[0].journal = [];
            JournalManager.addEntry('student-1', { tags: ['bavardage'], note: '' });
            JournalManager.addEntry('student-1', { tags: [], note: 'Note perso', isPrivate: true });
            const belowSummary = JournalManager.getAISummary('student-1', 'T1');
            expect(belowSummary.includedInAI).toBe(true);
            expect(belowSummary.tags).toEqual([]);
            expect(belowSummary.notes).toEqual([]);
            expect(belowSummary.privateCount).toBe(1);
            expect(belowSummary.displayText).toBe('');

            // Seuil atteint + note écrite -> résumé combiné exact
            JournalManager.addEntry('student-1', { tags: ['bavardage'], note: '' });
            JournalManager.addEntry('student-1', { tags: ['participation+'], note: 'Aide ses camarades' });
            const combined = JournalManager.getAISummary('student-1', 'T1');
            expect(combined.tags.map(t => t.label)).toEqual(['Bavardage']);
            expect(combined.notes).toHaveLength(1);
            expect(combined.displayText).toContain('Bavardage');
            expect(combined.displayText).not.toContain('(×2)');
            expect(combined.displayText).toContain('Aide ses camarades');
        });

        it('traduit Attitude + / Attitude - en libellés IA explicites tout en gardant les badges UI courts', () => {
            expect(JournalManager.getPromptLabel('attitude+')).toBe('Attitude positive');
            expect(JournalManager.getPromptLabel('attitude-')).toBe('Attitude à revoir');
            expect(JournalManager.getPromptLabel('bavardage')).toBe('Bavardage');
            expect(JournalManager.getPromptLabel('inconnu')).toBe('inconnu');

            // 1. Sous le seuil avec note -> UI lisible sans crochets, prompt avec préfixe [Attitude à revoir]
            JournalManager.addEntry('student-1', { tags: ['attitude-'], note: 'Soupirs répétés en classe' });
            const underSummary = JournalManager.getAISummary('student-1', 'T1');
            expect(underSummary.displayText).toBe('Attitude à revoir : « Soupirs répétés en classe »');
            expect(underSummary.displayText).not.toContain('[');
            expect(underSummary.transmittedCount).toBe(1);
            expect(underSummary.compactText).toBe('1 observation');
            expect(underSummary.transmittedTagIds).toEqual(['attitude-']);
            expect(JournalManager.synthesizeForPrompt('student-1', 'T1'))
                .toBe('Notes: "[Attitude à revoir] Soupirs répétés en classe"');

            // 2. Au-dessus du seuil -> Observations utilise le promptLabel, timeline conserve "Attitude -"
            JournalManager.addEntry('student-1', { tags: ['attitude-'], note: '' });
            JournalManager.addEntry('student-1', { tags: ['attitude+'], note: '' });
            JournalManager.addEntry('student-1', { tags: ['attitude+'], note: '' });
            const summary = JournalManager.getAISummary('student-1', 'T1');
            expect(summary.tags.map(t => t.label)).toEqual(['Attitude à revoir', 'Attitude positive']);
            expect(summary.displayText).not.toContain('Attitude -');
            expect(summary.displayText).not.toContain('Attitude +');
            expect(summary.transmittedCount).toBe(4);
            expect(summary.compactText).toBe('4 observations');

            const synth = JournalManager.synthesizeForPrompt('student-1', 'T1');
            expect(synth).toContain('Observations: Attitude à revoir, Attitude positive');
            expect(synth).not.toContain('Attitude -');
            expect(synth).not.toContain('Attitude +');

            // Les badges UI conservent les libellés compacts
            const html = JournalManager.renderTimeline('student-1', 'T1');
            expect(html).toContain('Attitude -');
            expect(html).toContain('Attitude +');
        });

        it('garantit la cohérence SSOT (transmittedTagIds, compactText invariant selon le seuil, below-threshold par tag)', () => {
            // Note rédigée unique avec tag "progres" + note privée "remarque"
            JournalManager.addEntry('student-1', {
                tags: ['progres'],
                note: 'Méthode bien appliquée lors de l\'exercice en autonomie.'
            });
            JournalManager.addEntry('student-1', {
                tags: [],
                note: 'Point parents prévu vendredi.',
                isPrivate: true
            });

            // Identique en Dès 1, Dès 2 et Dès 3 : pas de bascule visuelle, ni de doublon, ni de variation du prompt
            const syntheses = [];
            for (const threshold of [1, 2, 3]) {
                appState.journalThreshold = threshold;
                const summary = JournalManager.getAISummary('student-1', 'T1');
                expect(summary.transmittedTagIds).toEqual(['progres']);
                expect(summary.transmittedCount).toBe(1);
                expect(summary.compactText).toBe('1 observation');
                expect(summary.displayText).toContain('Progrès : « Méthode bien appliquée');
                expect(summary.displayText).not.toContain('[Progrès]');
                syntheses.push(JournalManager.synthesizeForPrompt('student-1', 'T1'));
            }
            expect(syntheses[0]).toBe('Notes: "[Progrès] Méthode bien appliquée lors de l\'exercice en autonomie."');
            expect(syntheses[1]).toBe(syntheses[0]);
            expect(syntheses[2]).toBe(syntheses[0]);

            // excludeRemarque filtre le tag technique tout en préservant l'id sur les vrais tags
            appState.journalThreshold = 2;
            JournalManager.addEntry('student-1', { tags: [], note: 'Note libre publique' });
            const withoutRemarque = JournalManager.getAggregatedCounts('student-1', 'T1', {
                excludePrivate: true,
                excludeRemarque: true
            });
            expect(withoutRemarque.map(t => t.id)).toEqual(['progres']);

            // Entrée multi-tags sans note : un tag au-dessus du seuil, l'autre en dessous -> grisage par tag
            appState.generatedResults[0].journal = [];
            JournalManager.addEntry('student-1', { tags: ['participation+'], note: '' });
            JournalManager.addEntry('student-1', { tags: ['participation+', 'progres'], note: '' });
            const timelineHtml = JournalManager.renderTimeline('student-1', 'T1');
            expect(timelineHtml).not.toContain('journal-entry  isolated');
            expect(timelineHtml).toContain('class="journal-tag below-threshold"');
            expect(JournalManager.getAISummary('student-1', 'T1').transmittedTagIds).toEqual(['participation+']);
        });

        it('exclut le tag technique remarque des signaux IA même au-dessus du seuil, tout en le conservant dans countTags', () => {
            JournalManager.addEntry('student-1', { tags: [], note: 'Note libre 1' });
            JournalManager.addEntry('student-1', { tags: [], note: 'Note libre 2' });

            // Compteur UI conservé
            expect(JournalManager.countTags('student-1', 'T1')).toEqual({ remarque: 2 });
            expect(JournalManager.getAggregatedCounts('student-1', 'T1')).toHaveLength(1);

            // Exclu des signaux transmis à l'IA et des tendances
            expect(JournalManager.getSignificantTagIds('student-1', 'T1')).toEqual([]);
            const summary = JournalManager.getAISummary('student-1', 'T1');
            expect(summary.tags).toEqual([]);
            expect(summary.displayText).not.toContain('Remarque');

            const synth = JournalManager.synthesizeForPrompt('student-1', 'T1');
            expect(synth).not.toContain('Observations:');
            expect(synth).not.toContain('Remarque');
            expect(synth).toContain('Notes: "Note libre 1" | "Note libre 2"');
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

    describe('renderTimeline period isolation & virtual class threshold targeting', () => {
        it('ne compte pas les tags d\'autres périodes quand renderTimeline est appelé sans argument period', () => {
            appState.currentPeriod = 'T2';
            appState.journalThreshold = 2;
            appState.generatedResults = [{
                id: 'student-1',
                name: 'DUPONT Jean',
                journal: [
                    { id: 'j_t1', date: '2026-10-01T10:00:00.000Z', tags: ['bavardage'], note: '', period: 'T1' },
                    { id: 'j_t2', date: '2026-11-01T10:00:00.000Z', tags: ['bavardage'], note: '', period: 'T2' }
                ]
            }];

            const html = JournalManager.renderTimeline('student-1');
            expect(html).toContain('isolated');
            expect(html).toContain('below-threshold');
        });

        it('cible la classe physique de l\'élève (et non une classe virtuelle) lors du changement de seuil ou navigation clavier', () => {
            vi.useFakeTimers();
            const physicalClass = { id: 'grp-3a-1', name: '3A Grp 1', journalThreshold: 2, journalIncludeInAI: true };
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
                            <input type="checkbox" id="journalIncludeAIToggle" checked>
                            <div id="journalThresholdStepperBlock">
                                <div id="journalThresholdSegmented" data-active-index="1">
                                    <button type="button" class="ui-segment journal-threshold-option" data-threshold="1">Dès 1</button>
                                    <button type="button" class="ui-segment journal-threshold-option active" data-threshold="2">Dès 2</button>
                                    <button type="button" class="ui-segment journal-threshold-option" data-threshold="3">Dès 3</button>
                                </div>
                                <span id="thresholdHintText"></span>
                            </div>
                            <div id="journalAiOffHint" class="is-hidden"></div>
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

                // Clic sur "Dès 1" en vue classe virtuelle -> met à jour grp-3a-1 (et non virtual_3a)
                const opt1 = document.querySelector('.journal-threshold-option[data-threshold="1"]');
                opt1.click();
                vi.runAllTimers();

                expect(physicalClass.journalThreshold).toBe(1);
                expect(typeof physicalClass.journalSettingsUpdatedAt).toBe('number');
                expect(updateClassSpy).toHaveBeenCalledWith(
                    'grp-3a-1',
                    expect.objectContaining({ journalThreshold: 1, journalSettingsUpdatedAt: expect.any(Number) })
                );
                expect(document.getElementById('journalThresholdSegmented').dataset.activeIndex).toBe('0');
                expect(document.getElementById('journalThresholdValue').textContent).toContain('1 observation');

                // Flèche droite sur "Dès 1" -> bascule proprement sur "Dès 2"
                opt1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
                vi.runAllTimers();
                expect(physicalClass.journalThreshold).toBe(2);
                expect(document.getElementById('journalThresholdSegmented').dataset.activeIndex).toBe('1');
            } finally {
                updateClassSpy.mockRestore();
                vi.useRealTimers();
            }
        });
    });
});
