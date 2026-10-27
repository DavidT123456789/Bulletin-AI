/**
 * @fileoverview Unit tests for ClassDashboardManager safe modal handling
 * @module managers/ClassDashboardManager.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClassDashboardManager } from './ClassDashboardManager.js';
import { appState } from '../state/State.js';

describe('ClassDashboardManager - Safe DOM handling', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        ClassDashboardManager.modal = null;
        ClassDashboardManager._listenersBound = false;
        ClassDashboardManager.cachedSynthesisHTML = null;
        ClassDashboardManager.cachedSynthesisClassId = null;
        ClassDashboardManager.cachedSynthesisPeriod = null;
    });

    it('devrait exécuter restoreOrResetAISection sans erreur même si le modal est absent du DOM (null)', () => {
        appState.currentClassId = 'class-1';
        appState.currentPeriod = 'T1';

        expect(() => {
            ClassDashboardManager.restoreOrResetAISection();
        }).not.toThrow();
    });

    it('devrait exécuter resetAISection sans erreur même si le modal est absent du DOM (null)', () => {
        expect(() => {
            ClassDashboardManager.resetAISection();
        }).not.toThrow();
    });

    it('devrait automatiquement trouver et lier le modal quand il est présent dans le DOM', () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent"></div>
                <button id="generateSynthesisBtn"></button>
                <div id="aiRefinementToolbar"></div>
                <button id="revertSynthesisBtn"></button>
            </div>
        `;

        expect(ClassDashboardManager.modal).toBeNull();
        const modal = ClassDashboardManager._ensureModal();

        expect(modal).not.toBeNull();
        expect(ClassDashboardManager.modal).toBe(modal);
        expect(ClassDashboardManager._listenersBound).toBe(true);

        expect(() => {
            ClassDashboardManager.resetAISection();
        }).not.toThrow();

        const content = document.getElementById('aiSynthesisContent');
        expect(content.innerHTML).toContain('ai-placeholder');
    });

    it('devrait restaurer l\'analyse enregistrée sans planter quand le modal existe', () => {
        document.body.innerHTML = `
            <div id="classDashboardModal">
                <div id="aiSynthesisContent"></div>
                <button id="generateSynthesisBtn"></button>
                <div id="aiRefinementToolbar"></div>
                <button id="revertSynthesisBtn"></button>
                <button id="copyDashboardSynthesisBtn"></button>
            </div>
        `;

        appState.currentClassId = 'class-1';
        appState.currentPeriod = 'T1';
        appState.classes = [
            {
                id: 'class-1',
                name: '3ème A',
                analyses: {
                    T1: {
                        content: '<p>Excellente dynamique de classe.</p>',
                        dataHash: 'hash123'
                    }
                }
            }
        ];

        expect(() => {
            ClassDashboardManager.restoreOrResetAISection();
        }).not.toThrow();

        const content = document.getElementById('aiSynthesisContent');
        expect(content.innerHTML).toBe('<p>Excellente dynamique de classe.</p>');
    });

    it('devrait pseudonymiser les prénoms et nettoyer les noms dans buildAIPrompt quand anonymizeData est actif', () => {
        appState.anonymizeData = true;
        appState.currentPeriod = 'T2';

        const { userPrompt } = ClassDashboardManager.buildAIPrompt({
            count: 25,
            average: 12.5,
            median: 12.5,
            min: 8,
            max: 18,
            stdDev: 2.0,
            distribution: { '0-4': 0, '4-8': 2, '8-12': 10, '12-16': 10, '16-20': 3 },
            hasEvolutionData: true,
            avgEvolution: 0.8,
            progressCount: 14,
            stableCount: 8,
            regressionCount: 3,
            topProgressions: [{ prenom: 'Lucas', nom: 'Martin', evolution: 2.4 }],
            appreciationsList: [
                { prenom: 'Lucas', nom: 'Martin', text: 'Lucas Martin a bien progressé.' }
            ]
        });

        expect(userPrompt).toContain('Élève #1 (+2.4)');
        expect(userPrompt).toContain('• Élève #1 : Élève #1 a bien progressé.');
        expect(userPrompt).not.toMatch(/\bLucas\b/i);
        expect(userPrompt).not.toMatch(/\bMartin\b/i);
    });
});
