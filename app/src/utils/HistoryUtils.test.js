/**
 * @fileoverview Tests unitaires à haut ROI pour HistoryUtils (SSOT historique de versions)
 */

import { describe, it, expect } from 'vitest';
import * as HistoryUtils from './HistoryUtils.js';

describe('HistoryUtils', () => {
    describe('pushToState (append non destructeur & déduplication)', () => {
        it('conserve les variantes IA existantes quand on crée une nouvelle version depuis un index antérieur', () => {
            const state = { versions: [], currentIndex: -1 };
            HistoryUtils.pushToState(state, 'Version initiale IA', 'original', 'ai');
            HistoryUtils.pushToState(state, 'Version concise IA', 'concise', 'ai');

            // Retour à la version initiale (1/2)
            HistoryUtils.undo(state);
            expect(state.currentIndex).toBe(0);

            // Nouvel essai IA (Encourageante) -> ajouté en fin (3/3), sans détruire Concise
            const changed = HistoryUtils.pushToState(state, 'Version encourageante IA', 'encouraging', 'ai');
            expect(changed).toBe(true);
            expect(state.versions).toHaveLength(3);
            expect(state.currentIndex).toBe(2);
            expect(state.versions.map(v => v.source)).toEqual(['original', 'concise', 'encouraging']);
        });

        it('déduplique sans créer de doublon lorsqu’un texte identique existe déjà dans la pile', () => {
            const state = { versions: [], currentIndex: -1 };
            HistoryUtils.pushToState(state, 'Texte A', 'original', 'ai');
            HistoryUtils.pushToState(state, 'Texte B', 'concise', 'ai');

            // Re-pousser Texte A -> repositionne sur l'index 0 sans dupliquer
            expect(HistoryUtils.pushToState(state, 'Texte A', 'edit', 'manual')).toBe(true);
            expect(state.versions).toHaveLength(2);
            expect(state.currentIndex).toBe(0);

            // Re-pousser le texte déjà courant -> no-op
            expect(HistoryUtils.pushToState(state, 'Texte A', 'edit', 'manual')).toBe(false);
        });

        it('plafonne la pile à MAX_VERSIONS et ignore les entrées nulles ou vides', () => {
            const state = { versions: [], currentIndex: -1 };
            expect(HistoryUtils.pushToState(null, 'Test')).toBe(false);
            expect(HistoryUtils.pushToState(state, '')).toBe(false);
            expect(HistoryUtils.pushToState(state, '   ')).toBe(false);

            for (let i = 1; i <= HistoryUtils.MAX_VERSIONS + 3; i++) {
                HistoryUtils.pushToState(state, `Version ${i}`, 'edit', 'manual');
            }
            expect(state.versions).toHaveLength(HistoryUtils.MAX_VERSIONS);
            expect(state.currentIndex).toBe(HistoryUtils.MAX_VERSIONS - 1);
            expect(state.versions[0].content).toBe('Version 4');
        });
    });

    describe('upsertEditVersion (coalescence de session d’édition)', () => {
        it('crée une seule entrée edit et la met à jour sur place durant la même session de frappe', () => {
            const state = { versions: [], currentIndex: -1 };
            HistoryUtils.pushToState(state, 'Texte IA initial', 'original', 'ai');

            let session = HistoryUtils.createEditSession();
            const r1 = HistoryUtils.upsertEditVersion(state, 'Texte IA initial modifié', session);
            expect(r1.changed).toBe(true);
            expect(state.versions).toHaveLength(2);
            expect(state.currentIndex).toBe(1);
            session = r1.session;
            expect(session.active).toBe(true);

            // Frappe suivante dans la même session -> mise à jour in-place (toujours 2 versions)
            const r2 = HistoryUtils.upsertEditVersion(state, 'Texte IA initial modifié et complété', session);
            expect(r2.changed).toBe(true);
            expect(state.versions).toHaveLength(2);
            expect(state.versions[1].content).toBe('Texte IA initial modifié et complété');
        });

        it('retire la version temporaire et revient à originIndex si l’utilisateur rétablit le texte exact d’origine', () => {
            const state = { versions: [], currentIndex: -1 };
            HistoryUtils.pushToState(state, 'Texte origine', 'original', 'ai');

            let session = HistoryUtils.createEditSession();
            const r1 = HistoryUtils.upsertEditVersion(state, 'Texte origine + ajout', session);
            expect(state.versions).toHaveLength(2);
            session = r1.session;

            const r2 = HistoryUtils.upsertEditVersion(state, 'Texte origine', session);
            expect(r2.changed).toBe(true);
            expect(state.versions).toHaveLength(1);
            expect(state.currentIndex).toBe(0);
            expect(r2.session.active).toBe(false);
        });
    });

    describe('getStudentPeriodState & recordStudentVersion', () => {
        it('migre l’ancien historyState vers generationPeriod et isole chaque période', () => {
            const result = {
                id: 's1',
                generationPeriod: 'T1',
                appreciation: 'Ancien texte T1',
                historyState: {
                    versions: [{ content: 'Ancien texte T1', source: 'original', appreciationSource: 'ai' }],
                    currentIndex: 0
                },
                studentData: {
                    periods: { T1: { appreciation: 'Ancien texte T1' }, T2: { appreciation: '' } }
                }
            };

            const t1State = HistoryUtils.getStudentPeriodState(result, 'T1', { createIfMissing: false });
            expect(result.historyState).toBeNull();
            expect(t1State.versions).toHaveLength(1);

            const t2State = HistoryUtils.getStudentPeriodState(result, 'T2', { createIfMissing: false });
            expect(t2State.versions).toHaveLength(0);
        });

        it('préserve la source explicite (ex. dictation) avec autoSeed: false sur une appréciation vierge', () => {
            const result = {
                id: 's2',
                appreciation: 'Dicté au micro.',
                appreciationSource: 'manual',
                wasGenerated: false,
                studentData: { periods: { T1: { appreciation: 'Dicté au micro.' } } }
            };

            const added = HistoryUtils.recordStudentVersion(result, 'T1', 'Dicté au micro.', 'dictation', { autoSeed: false });
            expect(added).toBe(true);
            expect(result.historyPerPeriod.T1.versions).toHaveLength(1);
            expect(result.historyPerPeriod.T1.versions[0].source).toBe('dictation');
        });
    });

    describe('normalizeHistoryState, remapHistoryPeriods & mergeHistoryPerPeriod', () => {
        it('hydrate et assainit un historique persisté avec repli sur fallbackContent', () => {
            const hydrated = HistoryUtils.normalizeHistoryState(null, 'Synthèse initiale.', { source: 'original', appreciationSource: 'ai' });
            expect(hydrated.versions).toHaveLength(1);
            expect(hydrated.currentIndex).toBe(0);
            expect(hydrated.versions[0].source).toBe('original');

            const outOfBounds = HistoryUtils.normalizeHistoryState({
                versions: [{ content: 'V1', source: 'original' }, { content: 'V2', source: 'concise' }],
                currentIndex: 99
            }, 'V2');
            expect(outOfBounds.currentIndex).toBe(1);
        });

        it('remappe les clés de périodes lors d’une bascule Trimestres ↔ Semestres en gardant la pile la plus riche', () => {
            const mapped = HistoryUtils.remapHistoryPeriods({
                T1: { versions: [{ content: 'A' }], currentIndex: 0 },
                T2: { versions: [{ content: 'B1' }, { content: 'B2' }], currentIndex: 1 }
            }, (p) => (p === 'T1' ? 'S1' : 'S2'));

            expect(Object.keys(mapped)).toEqual(['S1', 'S2']);
            expect(mapped.S2.versions).toHaveLength(2);
        });

        it('fusionne historyPerPeriod en conservant la liste la plus complète par période', () => {
            const local = { T1: { versions: [{ content: 'L1' }, { content: 'L2' }], currentIndex: 1 } };
            const remote = {
                T1: { versions: [{ content: 'R1' }], currentIndex: 0 },
                T2: { versions: [{ content: 'R2' }], currentIndex: 0 }
            };
            const merged = HistoryUtils.mergeHistoryPerPeriod(local, remote);
            expect(merged.T1.versions).toHaveLength(2);
            expect(merged.T2.versions).toHaveLength(1);
        });
    });
});
