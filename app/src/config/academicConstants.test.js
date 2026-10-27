/**
 * @fileoverview Tests unitaires pour les constantes métier scolaires (SSOT 1 & 3)
 * @module config/academicConstants.test
 */

import { describe, it, expect } from 'vitest';
import { APP_VERSION, RAW_APP_VERSION, SCHEMA_VERSIONS, CONFIG } from './constants.js';
import {
    STUDENT_STATUS_REGISTRY,
    STATUS_DESCRIPTIONS,
    GDPR_SENSITIVE_STATUS_PATTERN,
    DEFAULT_GDPR_SENSITIVE_PROMPT_INSTRUCTION,
    resolveStudentStatus,
    getStatusDescription,
    getSelectableStatusLabels,
    getMovementStatusLabels,
    PERIOD_SYSTEMS,
    ALL_PERIODS,
    getPeriodsForSystem,
    getPreviousPeriod,
    GRADE_BRACKETS,
    GRADE_RANGES,
    GRADE_BRACKET_IDS,
    GRADE_BRACKET_CLASSES,
    getGradeBracketIndex,
    getGradeBracket,
    getGradeCssClass,
    computeGradeDistributionArray,
    computeGradeDistributionMap,
} from './academicConstants.js';

describe('SSOT 1 — Versions et Schémas de persistance (constants.js)', () => {
    it('expose APP_VERSION alimenté par __APP_VERSION__ et synchronisé avec package.json', () => {
        expect(typeof APP_VERSION).toBe('string');
        expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+ Beta$/);
        expect(RAW_APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('centralise SCHEMA_VERSIONS en lecture seule et synchronise CONFIG', () => {
        expect(Object.isFrozen(SCHEMA_VERSIONS)).toBe(true);
        expect(SCHEMA_VERSIONS.LS_APP_STATE_KEY).toBe('appreciationGeneratorState_v6.2');
        expect(SCHEMA_VERSIONS.LS_FIRST_VISIT_KEY).toBe('appreciationGeneratorFirstVisit_v8');
        expect(CONFIG.LS_APP_STATE_KEY).toBe(SCHEMA_VERSIONS.LS_APP_STATE_KEY);
        expect(CONFIG.LS_FIRST_VISIT_KEY).toBe(SCHEMA_VERSIONS.LS_FIRST_VISIT_KEY);
    });
});

describe('SSOT 3 — STUDENT_STATUS_REGISTRY & Neutralisation RGPD (Art. 9)', () => {
    it('définit les 9 statuts canoniques immuables (Nouveau, Départ, PPRE, PAP, PAI, AESH, ULIS, Geva-Sco, Délégué)', () => {
        expect(Object.isFrozen(STUDENT_STATUS_REGISTRY)).toBe(true);
        const ids = Object.values(STUDENT_STATUS_REGISTRY).map(s => s.id);
        expect(ids).toEqual(['Nouveau', 'Départ', 'PPRE', 'PAP', 'PAI', 'AESH', 'ULIS', 'Geva-Sco', 'Délégué']);
    });

    it('garantit qu’aucune consigne de prompt médico-scolaire ne contient son acronyme médical brut (RGPD Art. 9)', () => {
        const sensitiveKeys = ['PAP', 'PPRE', 'ULIS', 'PAI', 'AESH', 'GEVASCO'];
        for (const key of sensitiveKeys) {
            const entry = STUDENT_STATUS_REGISTRY[key];
            expect(entry.promptInstruction).toBeTruthy();
            expect(entry.promptInstruction).not.toMatch(/\b(PAP|PPRE|ULIS|PAI|AESH|Geva-Sco|GevaSco|PPS|MDPH)\b/i);
        }
        expect(DEFAULT_GDPR_SENSITIVE_PROMPT_INSTRUCTION).not.toMatch(/\b(PAP|PPRE|ULIS|PAI|AESH|Geva-Sco)\b/i);
        expect(GDPR_SENSITIVE_STATUS_PATTERN.test('Élève dyslexique avec TDAH')).toBe(true);
    });

    it('résout les variantes de casse, d’accents, d’alias et de périodes via resolveStudentStatus', () => {
        expect(resolveStudentStatus('PAP')?.id).toBe('PAP');
        expect(resolveStudentStatus('  pap T1 ')?.id).toBe('PAP');
        expect(resolveStudentStatus('PPRE')?.id).toBe('PPRE');
        expect(resolveStudentStatus('ulis')?.id).toBe('ULIS');
        expect(resolveStudentStatus('PAI Asthme')?.id).toBe('PAI');
        expect(resolveStudentStatus('aesh')?.id).toBe('AESH');
        expect(resolveStudentStatus('Geva-Sco')?.id).toBe('Geva-Sco');
        expect(resolveStudentStatus('gevasco')?.id).toBe('Geva-Sco');
        expect(resolveStudentStatus('pps')?.id).toBe('Geva-Sco');
        expect(resolveStudentStatus('mdph')?.id).toBe('Geva-Sco');
        expect(resolveStudentStatus('Nouveau T2')?.id).toBe('Nouveau');
        expect(resolveStudentStatus('Départ S1')?.id).toBe('Départ');
        expect(resolveStudentStatus('depart')?.id).toBe('Départ');
        expect(resolveStudentStatus('Délégué')?.id).toBe('Délégué');
        expect(resolveStudentStatus('Éco-délégué')?.id).toBe('Délégué');
        expect(resolveStudentStatus('delegue')?.id).toBe('Délégué');
    });

    it('gère les cas limites (null, undefined, vide, statut inconnu) dans resolveStudentStatus et getStatusDescription', () => {
        expect(resolveStudentStatus(null)).toBeNull();
        expect(resolveStudentStatus(undefined)).toBeNull();
        expect(resolveStudentStatus('   ')).toBeNull();
        expect(resolveStudentStatus('Statut Libre')).toBeNull();

        expect(getStatusDescription('ULIS')).toBe(STATUS_DESCRIPTIONS.ULIS);
        expect(getStatusDescription('Nouveau T2')).toBe(STATUS_DESCRIPTIONS.Nouveau);
        expect(getStatusDescription('Statut Libre')).toBe('Statut Libre');
        expect(getStatusDescription(null)).toBe('');
    });

    it('fournit les listes de statuts sélectionnables en UI et les statuts de mouvement', () => {
        expect(getSelectableStatusLabels({ includeMovement: true })).toEqual([
            'Nouveau', 'Départ', 'PPRE', 'PAP', 'PAI', 'AESH', 'ULIS', 'Délégué'
        ]);
        expect(getSelectableStatusLabels({ includeMovement: false })).toEqual([
            'PPRE', 'PAP', 'PAI', 'AESH', 'ULIS', 'Délégué'
        ]);
        expect(getMovementStatusLabels('T2')).toEqual(['Nouveau T2', 'Départ T2']);
        expect(getMovementStatusLabels()).toEqual(['Nouveau', 'Départ']);
    });
});

describe('SSOT 3 — Périodes scolaires (PERIOD_SYSTEMS)', () => {
    it('retourne les périodes par système et gère le repli sur trimestres', () => {
        expect(PERIOD_SYSTEMS.trimestres).toEqual(['T1', 'T2', 'T3']);
        expect(PERIOD_SYSTEMS.semestres).toEqual(['S1', 'S2']);
        expect(ALL_PERIODS).toEqual(['T1', 'T2', 'T3', 'S1', 'S2']);

        expect(getPeriodsForSystem('trimestres')).toEqual(['T1', 'T2', 'T3']);
        expect(getPeriodsForSystem('semestres')).toEqual(['S1', 'S2']);
        expect(getPeriodsForSystem(undefined)).toEqual(['T1', 'T2', 'T3']);
        expect(getPeriodsForSystem('inconnu')).toEqual(['T1', 'T2', 'T3']);
    });

    it('calcule la période précédente (getPreviousPeriod) pour trimestres, semestres et limites', () => {
        expect(getPreviousPeriod('T1')).toBeNull();
        expect(getPreviousPeriod('T2')).toBe('T1');
        expect(getPreviousPeriod('T3')).toBe('T2');
        expect(getPreviousPeriod('S1')).toBeNull();
        expect(getPreviousPeriod('S2')).toBe('S1');
        expect(getPreviousPeriod(null)).toBeNull();
        expect(getPreviousPeriod('T4')).toBeNull();
    });
});

describe('SSOT 3 — Tranches et seuils de notes (GRADE_BRACKETS)', () => {
    it('expose les 5 tranches canoniques (0-4, 4-8, 8-12, 12-16, 16-20)', () => {
        expect(GRADE_BRACKETS).toHaveLength(5);
        expect(GRADE_RANGES).toBe(GRADE_BRACKETS);
        expect(GRADE_BRACKET_IDS).toEqual(['0-4', '4-8', '8-12', '12-16', '16-20']);
        expect(GRADE_BRACKET_CLASSES).toEqual([
            'grade-range-0-4',
            'grade-range-4-8',
            'grade-range-8-12',
            'grade-range-12-16',
            'grade-range-16-20',
        ]);
    });

    it('associe chaque note aux bonnes bornes (0, 3.99, 4, 8, 12, 16, 20) et gère NaN/null', () => {
        expect(getGradeBracketIndex(0)).toBe(0);
        expect(getGradeBracketIndex(3.99)).toBe(0);
        expect(getGradeBracketIndex(4)).toBe(1);
        expect(getGradeBracketIndex(7.99)).toBe(1);
        expect(getGradeBracketIndex(8)).toBe(2);
        expect(getGradeBracketIndex(11.99)).toBe(2);
        expect(getGradeBracketIndex(12)).toBe(3);
        expect(getGradeBracketIndex(15.99)).toBe(3);
        expect(getGradeBracketIndex(16)).toBe(4);
        expect(getGradeBracketIndex(20)).toBe(4);

        expect(getGradeBracketIndex(NaN)).toBe(-1);
        expect(getGradeBracketIndex(null)).toBe(-1);
        expect(getGradeBracket(null)).toBeNull();
        expect(getGradeCssClass(14)).toBe('grade-range-12-16');
        expect(getGradeCssClass(NaN)).toBe('');
    });

    it('calcule la distribution en tableau et en objet (cas nominal et limites)', () => {
        const sample = [2, 3.5, 4, 7.5, 8, 10, 11.9, 12, 15, 16, 19.5, NaN, 'Abs', null];
        expect(computeGradeDistributionArray(sample)).toEqual([2, 2, 3, 2, 2]);
        expect(computeGradeDistributionMap(sample)).toEqual({
            '0-4': 2,
            '4-8': 2,
            '8-12': 3,
            '12-16': 2,
            '16-20': 2,
        });

        expect(computeGradeDistributionArray(null)).toEqual([0, 0, 0, 0, 0]);
        expect(computeGradeDistributionMap(undefined)).toEqual({
            '0-4': 0,
            '4-8': 0,
            '8-12': 0,
            '12-16': 0,
            '16-20': 0,
        });
    });
});
