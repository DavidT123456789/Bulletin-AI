/**
 * @fileoverview Tests unitaires ciblés pour ImportWizardManager (transitions d'étapes & handoff du Hub)
 * @module managers/ImportWizardManager.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../state/State.js', () => ({
    appState: {
        currentClassId: 'class-1',
        currentPeriod: 'T1',
        generatedResults: [],
        filteredResults: []
    }
}));

vi.mock('./UIManager.js', () => ({
    UI: {
        openModal: vi.fn(),
        closeModal: vi.fn(),
        showNotification: vi.fn(),
        initTooltips: vi.fn()
    }
}));

vi.mock('./FocusPanelManager.js', () => ({
    FocusPanelManager: {
        openNew: vi.fn(),
        bindScrollAffordances: vi.fn()
    }
}));

vi.mock('./ClassManager.js', () => ({
    ClassManager: {
        getAllClasses: vi.fn(() => [{ id: 'class-1', name: '3A' }]),
        getCurrentClass: vi.fn(() => ({ id: 'class-1', name: '3A' })),
        isDemoClass: vi.fn(() => false),
        hasStudentsInOtherClasses: vi.fn(() => true),
        createClass: vi.fn(() => ({ id: 'class-new', name: 'Nouvelle classe' })),
        switchClass: vi.fn()
    }
}));

vi.mock('./ClassUIManager.js', () => ({
    ClassUIManager: {
        updateHeaderDisplay: vi.fn(),
        renderClassList: vi.fn(),
        showPickExistingStudentsModal: vi.fn()
    }
}));

vi.mock('./HistoryManager.js', () => ({
    HistoryManager: {
        pushState: vi.fn(),
        handleManualClose: vi.fn()
    }
}));

vi.mock('./TrombinoscopeManager.js', () => ({
    TrombinoscopeManager: {
        open: vi.fn()
    }
}));

vi.mock('./DropdownManager.js', () => ({
    DropdownManager: {
        closeAll: vi.fn()
    }
}));

import { ImportWizardManager } from './ImportWizardManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { TrombinoscopeManager } from './TrombinoscopeManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { UI } from './UIManager.js';

describe('ImportWizardManager — Harmonisation des animations d\'ouverture & handoff Hub', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();

        document.body.innerHTML = `
            <div class="import-hub-backdrop" id="importHubBackdrop">
                <div class="import-hub-modal">
                    <div id="importHubDemoAlert" style="display:none;"></div>
                    <div class="import-hub-choices">
                        <div class="import-hub-card" data-action="individual" tabindex="0"></div>
                        <div class="import-hub-card" data-action="mass" tabindex="0"></div>
                        <div class="import-hub-card" data-action="photos" tabindex="0"></div>
                        <div class="import-hub-card" data-action="existing" tabindex="0"></div>
                    </div>
                </div>
            </div>
            <div id="importWizardModal" class="modal import-wizard-modal">
                <div class="modal-content">
                    <div class="import-wizard-guide">
                        <div class="guide-content active" data-guide-step="1"></div>
                        <div class="guide-content" data-guide-step="2"></div>
                        <div class="guide-content" data-guide-step="3"></div>
                    </div>
                    <div class="import-wizard-body">
                        <div class="wizard-step-content active" id="wizardStep1">
                            <textarea id="wizardDataTextarea"></textarea>
                        </div>
                        <div class="wizard-step-content" id="wizardStep2">
                            <div id="wizardMappingContainer"><div class="table-scroll-wrapper"></div></div>
                        </div>
                        <div class="wizard-step-content" id="wizardStep3"></div>
                    </div>
                </div>
            </div>
        `;

        ImportWizardManager.currentStep = 1;
        ImportWizardManager._hubHandoffTimer = null;
        ImportWizardManager._closeResetTimer = null;
        ImportWizardManager._renderMappingTable = vi.fn();
        ImportWizardManager._updatePreview = vi.fn();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('n\'applique aucune classe slide-next/slide-prev à l\'ouverture initiale, mais les applique lors de goToStep()', () => {
        ImportWizardManager.open();

        const step1 = document.getElementById('wizardStep1');
        const step2 = document.getElementById('wizardStep2');
        const guide1 = document.querySelector('.guide-content[data-guide-step="1"]');
        const guide2 = document.querySelector('.guide-content[data-guide-step="2"]');

        expect(UI.openModal).toHaveBeenCalledTimes(1);
        expect(step1.classList.contains('active')).toBe(true);
        expect(step1.classList.contains('slide-next')).toBe(false);
        expect(step1.classList.contains('slide-prev')).toBe(false);
        expect(guide1.classList.contains('active')).toBe(true);
        expect(guide1.classList.contains('slide-next')).toBe(false);

        // Navigation avant (1 -> 2) : slide-next requis
        ImportWizardManager.goToStep(2);
        expect(step2.classList.contains('active')).toBe(true);
        expect(step2.classList.contains('slide-next')).toBe(true);
        expect(guide2.classList.contains('active')).toBe(true);
        expect(guide2.classList.contains('slide-next')).toBe(true);

        // Navigation arrière (2 -> 1) : slide-prev requis
        ImportWizardManager.goToStep(1);
        expect(step1.classList.contains('active')).toBe(true);
        expect(step1.classList.contains('slide-prev')).toBe(true);
        expect(step1.classList.contains('slide-next')).toBe(false);
        expect(guide1.classList.contains('slide-prev')).toBe(true);
    });

    it('abaisse le z-index du Hub (.is-handing-off) sans délai mort pour les 3 modales centrées et le nettoie après transition', () => {
        ImportWizardManager._bindHubEvents();
        const backdrop = document.getElementById('importHubBackdrop');

        for (const [action, targetMock] of [
            ['mass', UI.openModal],
            ['photos', TrombinoscopeManager.open],
            ['existing', ClassUIManager.showPickExistingStudentsModal]
        ]) {
            vi.clearAllMocks();
            ImportWizardManager.openHub();
            expect(backdrop.classList.contains('active')).toBe(true);
            expect(backdrop.classList.contains('is-handing-off')).toBe(false);

            backdrop.querySelector(`.import-hub-card[data-action="${action}"]`).click();

            expect(backdrop.classList.contains('active')).toBe(false);
            expect(backdrop.classList.contains('is-handing-off')).toBe(true);

            vi.advanceTimersByTime(0);
            expect(targetMock).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(250);
            expect(backdrop.classList.contains('is-handing-off')).toBe(false);
        }
    });

    it('attend la dissipation rapide du Hub (140ms) sans .is-handing-off avant de faire glisser le tiroir latéral Individuel', () => {
        ImportWizardManager._bindHubEvents();
        const backdrop = document.getElementById('importHubBackdrop');

        ImportWizardManager.openHub();
        backdrop.querySelector('.import-hub-card[data-action="individual"]').click();

        expect(backdrop.classList.contains('active')).toBe(false);
        expect(backdrop.classList.contains('is-handing-off')).toBe(false);
        expect(FocusPanelManager.openNew).not.toHaveBeenCalled();

        vi.advanceTimersByTime(140);
        expect(FocusPanelManager.openNew).toHaveBeenCalledTimes(1);
    });
});
