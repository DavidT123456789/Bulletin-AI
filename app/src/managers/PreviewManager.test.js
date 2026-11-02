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
    describe('populatePreviewStudentSelect', () => {
        it('should not throw when called', () => {
            expect(() => PreviewManager.populatePreviewStudentSelect()).not.toThrow();
        });
    });
});
