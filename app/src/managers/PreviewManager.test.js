/**
 * @fileoverview Tests for PreviewManager module.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PreviewManager } from './PreviewManager.js';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        currentPeriod: 'T1',
        currentSettingsSubject: 'Mathématiques',
        generatedResults: [
            { id: 'student-1', nom: 'Dupont', prenom: 'Marie' },
            { id: 'student-2', nom: 'Martin', prenom: 'Jean' }
        ]
    }
}));


vi.mock('../utils/DOM.js', () => ({
    DOM: {
        previewStudentSelect: {
            // Note: getPreviewStudentData() uses profile keys ('excellent', etc.)
            // while populatePreviewStudentSelect() now uses real student IDs
            value: 'excellent',
            innerHTML: '',
            appendChild: vi.fn()
        }
    }
}));


vi.mock('./UIManager.js', () => ({
    UI: {
        updateWordCount: vi.fn()
    }
}));

describe('PreviewManager', () => {
    describe('getTestProfiles', () => {
        it('should return all four test profiles', () => {
            const profiles = PreviewManager.getTestProfiles();

            expect(profiles).toHaveProperty('excellent');
            expect(profiles).toHaveProperty('average');
            expect(profiles).toHaveProperty('struggling');
            expect(profiles).toHaveProperty('progressing');
        });

        it('should have correct grade for excellent profile', () => {
            const profiles = PreviewManager.getTestProfiles();
            expect(profiles.excellent.grade).toBe(18);
        });

        it('should have correct grade for average profile', () => {
            const profiles = PreviewManager.getTestProfiles();
            expect(profiles.average.grade).toBe(12);
        });

        it('should have correct grade for struggling profile', () => {
            const profiles = PreviewManager.getTestProfiles();
            expect(profiles.struggling.grade).toBe(8);
        });

        it('should have correct grade for progressing profile', () => {
            const profiles = PreviewManager.getTestProfiles();
            expect(profiles.progressing.grade).toBe(13);
        });

        it('should have context for each profile', () => {
            const profiles = PreviewManager.getTestProfiles();

            expect(profiles.excellent.context).toBeTruthy();
            expect(profiles.average.context).toBeTruthy();
            expect(profiles.struggling.context).toBeTruthy();
            expect(profiles.progressing.context).toBeTruthy();
        });
    });

    describe('getPreviewStudentData', () => {
        it('should return student data with correct structure', () => {
            const data = PreviewManager.getPreviewStudentData();

            expect(data).toHaveProperty('nom', 'TEST');
            expect(data).toHaveProperty('prenom', 'Élève');
            expect(data).toHaveProperty('periods');
            expect(data).toHaveProperty('currentPeriod');
            expect(data).toHaveProperty('subject');
            expect(data).toHaveProperty('negativeInstructions');
            expect(data).toHaveProperty('statuses');
            expect(data).toHaveProperty('prompts');
        });

        it('should have empty statuses array', () => {
            const data = PreviewManager.getPreviewStudentData();
            expect(data.statuses).toEqual([]);
        });

        it('should have empty prompts object', () => {
            const data = PreviewManager.getPreviewStudentData();
            expect(data.prompts).toEqual({});
        });

        it('should use grade from selected profile', () => {
            const data = PreviewManager.getPreviewStudentData();
            // DOM mock has 'excellent' selected which has grade 18
            expect(data.periods['T1'].grade).toBe(18);
        });
    });

    describe('displayPreviewStudentData', () => {
        beforeEach(() => {
            // Setup DOM elements
            document.body.innerHTML = `
                <div id="previewAppreciationResult"></div>
                <div id="previewPromptUsed"></div>
            `;
        });

        it('should update result element with appreciation', () => {
            const result = { appreciation: 'Test appreciation text', prompt: 'Test prompt' };
            PreviewManager.displayPreviewStudentData(result);

            const resultEl = document.getElementById('previewAppreciationResult');
            expect(resultEl.innerHTML).toBe('Test appreciation text');
        });

        it('should update prompt element with prompt text', () => {
            const result = { appreciation: 'Test appreciation', prompt: 'Test prompt text' };
            PreviewManager.displayPreviewStudentData(result);

            const promptEl = document.getElementById('previewPromptUsed');
            expect(promptEl.textContent).toBe('Test prompt text');
        });

        it('should handle missing DOM elements gracefully', () => {
            document.body.innerHTML = '';
            const result = { appreciation: 'Test', prompt: 'Prompt' };

            expect(() => PreviewManager.displayPreviewStudentData(result)).not.toThrow();
        });
    });

    describe('resetSettingsPreview', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div id="previewAppreciationResult">Some content</div>
                <div id="settingsPreviewWordCount">50 mots</div>
            `;
        });

        it('should reset result element with placeholder text', () => {
            PreviewManager.resetSettingsPreview();

            const resultEl = document.getElementById('previewAppreciationResult');
            expect(resultEl.innerHTML).toContain('Cliquez sur "Actualiser"');
        });

        it('should reset word count to 0 mots • 0 car.', () => {
            PreviewManager.resetSettingsPreview();

            const wordCountEl = document.getElementById('settingsPreviewWordCount');
            expect(wordCountEl.textContent).toBe('0 mots • 0 car.');
        });

        it('should handle missing DOM elements gracefully', () => {
            document.body.innerHTML = '';
            expect(() => PreviewManager.resetSettingsPreview()).not.toThrow();
        });
    });

    describe('populatePreviewStudentSelect', () => {
        it('should not throw when called', () => {
            expect(() => PreviewManager.populatePreviewStudentSelect()).not.toThrow();
        });
    });
});
