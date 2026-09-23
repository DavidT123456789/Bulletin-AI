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
});
