/**
 * @fileoverview Tests unitaires ciblés pour ImportWizardManager (transitions d'étapes & handoff du Hub)
 * @module managers/ImportWizardManager.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { appState } from '../state/State.js';

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
        bindScrollAffordances: vi.fn(),
        updateScrollAffordances: vi.fn()
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
        isOpen: vi.fn(() => true),
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
        instances: new Map(),
        enhance: vi.fn(),
        refresh: vi.fn(),
        updateDisplay: vi.fn(),
        closeAll: vi.fn()
    }
}));

import { ImportWizardManager } from './ImportWizardManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { TrombinoscopeManager } from './TrombinoscopeManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { HistoryManager } from './HistoryManager.js';
import { UI } from './UIManager.js';

const realUpdatePreview = ImportWizardManager._updatePreview;

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

        // Navigation avant (1 -> 2) : slide-next requis + empilement importWizardStep
        ImportWizardManager.goToStep(2);
        expect(step2.classList.contains('active')).toBe(true);
        expect(step2.classList.contains('slide-next')).toBe(true);
        expect(guide2.classList.contains('active')).toBe(true);
        expect(guide2.classList.contains('slide-next')).toBe(true);
        expect(HistoryManager.pushState).toHaveBeenCalledWith('importWizardStep', expect.any(Function));

        // Navigation arrière (2 -> 1) : slide-prev requis + retrait importWizardStep
        ImportWizardManager.goToStep(1);
        expect(step1.classList.contains('active')).toBe(true);
        expect(step1.classList.contains('slide-prev')).toBe(true);
        expect(step1.classList.contains('slide-next')).toBe(false);
        expect(guide1.classList.contains('slide-prev')).toBe(true);
        expect(HistoryManager.handleManualClose).toHaveBeenCalledWith('importWizardStep');
    });

    it('abaisse le z-index du Hub (.is-handing-off) sans délai mort pour les 3 modales centrées et le nettoie après transition', async () => {
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

            await vi.advanceTimersByTimeAsync(0);
            expect(targetMock).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(250);
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

describe('ImportWizardManager — Sécurité XSS DOM & Rejet Excel (.xlsx/.xls)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = `
            <div id="importWizardModal" class="modal import-wizard-modal">
                <div class="wizard-step-content active" id="wizardStep1">
                    <div id="wizardDropZone" class="has-file">
                        <div id="wizardDropZoneEmpty" style="display:none;"></div>
                        <div id="wizardDropZoneFilled" style="display:block;">
                            <div id="wizardFileIcon"></div>
                            <span id="wizardFileName"></span>
                            <div id="wizardFileBadgeSlot"></div>
                        </div>
                        <input type="file" id="wizardFileInput" />
                    </div>
                    <span id="wizardDividerText"></span>
                    <textarea id="wizardDataTextarea"></textarea>
                </div>
                <div class="wizard-step-content" id="wizardStep2">
                    <div id="wizardMappingContainer"></div>
                </div>
            </div>
        `;
        ImportWizardManager.state.currentSource = null;
        ImportWizardManager.state.lines = [];
        ImportWizardManager.state.columnCount = 0;
        ImportWizardManager._updatePreview = vi.fn();
    });

    it('rejette les fichiers .xlsx/.xls sans lire le binaire et guide vers CSV / copier-coller', async () => {
        const readSpy = vi.spyOn(FileReader.prototype, 'readAsText');
        const xlsxFile = new File(['PK\x03\x04'], 'notes.xlsx', {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });

        await ImportWizardManager._handleFile(xlsxFile);

        expect(readSpy).not.toHaveBeenCalled();
        expect(ImportWizardManager.state.currentSource).toBeNull();
        expect(UI.showNotification).toHaveBeenCalledWith(expect.stringContaining('CSV'), 'warning');
        readSpy.mockRestore();
    });

    it('échappe les vecteurs XSS dans _buildMappingTable, _applyColumnClasses et _formatCellValue', () => {
        const xssPayload = '<img src=x onerror=alert(1)>';
        ImportWizardManager.state.lines = [
            ['DUPONT Jean', xssPayload, '14']
        ];
        ImportWizardManager.state.columnCount = 3;
        ImportWizardManager.state.hasHeader = false;
        ImportWizardManager.state.detectedFormat = null;
        const guessSpy = vi.spyOn(ImportWizardManager, '_guessTypeTag').mockImplementation((_, idx) => (['NOM_PRENOM', 'STATUT', 'MOY_T1'][idx] || 'IGNORE'));

        ImportWizardManager._buildMappingTable(true);
        guessSpy.mockRestore();

        const table = document.querySelector('.import-mapping-table');
        expect(table).not.toBeNull();
        expect(table.querySelector('img')).toBeNull();
        expect(table.querySelector('tbody td .tag-badge--sm')?.textContent).toBe(xssPayload);

        // Changement de type de colonne : STATUT -> APP_T1 puis retour à STATUT
        const selects = table.querySelectorAll('.mapping-select');
        selects[1].value = 'APP_T1';
        ImportWizardManager._applyColumnClasses();
        expect(table.querySelector('img')).toBeNull();
        expect(table.querySelectorAll('tbody td')[1].textContent).toBe(xssPayload);

        selects[1].value = 'STATUT';
        ImportWizardManager._applyColumnClasses();
        expect(table.querySelector('img')).toBeNull();

        // Étape 3 : _formatCellValue sur STATUT et sur texte libre
        const statusHtml = ImportWizardManager._formatCellValue(xssPayload, 'STATUT');
        const textHtml = ImportWizardManager._formatCellValue(xssPayload, 'APP_T1');
        const sandbox = document.createElement('div');
        sandbox.innerHTML = `${statusHtml}${textHtml}`;
        expect(sandbox.querySelector('img')).toBeNull();
        expect(sandbox.textContent).toContain(xssPayload);
    });
});

describe('ImportWizardManager — Affichage conditionnel du panneau Règles (Étape 3)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ImportWizardManager._updatePreview = realUpdatePreview;
        document.body.innerHTML = `
            <div id="importWizardModal" class="modal import-wizard-modal">
                <div class="wizard-guide-panel" id="wizardGuidePanel">
                    <div class="guide-content" data-guide-step="3">
                        <strong id="wizardNewCount">0</strong>
                        <strong id="wizardUpdatedCount">0</strong>
                        <strong id="wizardDepartedCount">0</strong>
                        <div id="wizardDepartedAction" style="display: none;">
                            <input type="checkbox" id="wizardDeleteDepartedToggle" />
                        </div>
                        <div class="guide-divider" id="wizardRulesDivider" style="display: none;"></div>
                        <div class="guide-section guide-section-rules" id="wizardRulesSection" style="display: none;">
                            <p id="wizardDepartedRuleText" style="display: none;">Les élèves absents du fichier sont conservés.</p>
                            <p id="wizardOverwriteWarning" style="display: none;">Les données existantes des colonnes cochées seront écrasées.</p>
                        </div>
                    </div>
                </div>
                <textarea id="wizardDataTextarea"></textarea>
                <div id="wizardStep1LineCount" style="display:none;"></div>
                <span id="wizardSelectedColsBadge">0</span>
                <span id="wizardSelectedColsInfo"></span>
                <span id="wizardImportCount">0</span>
                <button id="wizardImportOnlyBtn"></button>
            </div>
        `;
        ImportWizardManager.state.lines = [['MARTIN Lucas', '12.5']];
        ImportWizardManager.state.hasHeader = false;
        vi.spyOn(ImportWizardManager, '_buildPreviewTable').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('masque entièrement la section Règles sur une nouvelle classe (0 mis à jour, 0 absent)', async () => {
        vi.spyOn(AppreciationsManager, '_prepareStudentListForImport').mockReturnValue({
            studentsToProcess: [{ nom: 'MARTIN', prenom: 'Lucas' }],
            newStudents: [{ nom: 'MARTIN', prenom: 'Lucas' }],
            updatedStudents: [],
            departedStudents: [],
            ignoredCount: 0
        });

        await ImportWizardManager._updatePreview();

        expect(document.getElementById('wizardNewCount').textContent).toBe('1');
        expect(document.getElementById('wizardRulesDivider').style.display).toBe('none');
        expect(document.getElementById('wizardRulesSection').style.display).toBe('none');
        expect(document.getElementById('wizardDepartedRuleText').style.display).toBe('none');
        expect(document.getElementById('wizardOverwriteWarning').style.display).toBe('none');
        expect(document.getElementById('wizardDepartedAction').style.display).toBe('none');
    });

    it('affiche uniquement l\'alerte d\'écrasement quand il y a des mises à jour sans absents', async () => {
        vi.spyOn(AppreciationsManager, '_prepareStudentListForImport').mockReturnValue({
            studentsToProcess: [{ nom: 'MARTIN', prenom: 'Lucas' }],
            newStudents: [],
            updatedStudents: [{ nom: 'MARTIN', prenom: 'Lucas' }],
            departedStudents: [],
            ignoredCount: 0
        });

        await ImportWizardManager._updatePreview();

        expect(document.getElementById('wizardRulesDivider').style.display).toBe('');
        expect(document.getElementById('wizardRulesSection').style.display).toBe('');
        expect(document.getElementById('wizardOverwriteWarning').style.display).toBe('');
        expect(document.getElementById('wizardDepartedRuleText').style.display).toBe('none');
        expect(document.getElementById('wizardDepartedAction').style.display).toBe('none');
    });

    it('affiche la règle sur les absents + le toggle quand absents > 0 et réinitialise au _reset()', async () => {
        vi.spyOn(AppreciationsManager, '_prepareStudentListForImport').mockReturnValue({
            studentsToProcess: [{ nom: 'MARTIN', prenom: 'Lucas' }],
            newStudents: [{ nom: 'MARTIN', prenom: 'Lucas' }],
            updatedStudents: [],
            departedStudents: [{ nom: 'DURAND', prenom: 'Sophie' }],
            ignoredCount: 0
        });

        await ImportWizardManager._updatePreview();

        expect(document.getElementById('wizardRulesSection').style.display).toBe('');
        expect(document.getElementById('wizardDepartedAction').style.display).toBe('');
        expect(document.getElementById('wizardDepartedRuleText').style.display).toBe('');
        expect(document.getElementById('wizardOverwriteWarning').style.display).toBe('none');

        ImportWizardManager._syncDepartedToggleState(true);
        expect(document.getElementById('wizardDepartedRuleText').textContent).toBe(
            'Les élèves absents du fichier seront supprimés de la classe.'
        );

        ImportWizardManager._reset();
        expect(document.getElementById('wizardRulesDivider').style.display).toBe('none');
        expect(document.getElementById('wizardRulesSection').style.display).toBe('none');
        expect(document.getElementById('wizardDepartedRuleText').style.display).toBe('none');
        expect(document.getElementById('wizardOverwriteWarning').style.display).toBe('none');
    });
});

describe('ImportWizardManager — Auto-mapping TSV Pronote/Excel & en-tête (B2, F8)', () => {
    beforeEach(() => {
        appState.currentPeriod = 'T1';
        appState.periodSystem = 'trimestres';
        appState.massImportFormats = { trimestres: {}, semestres: {} };
        document.body.innerHTML = `
            <div id="importWizardModal">
                <textarea id="wizardDataTextarea"></textarea>
                <button id="wizardStep1NextBtn" disabled></button>
                <div id="wizardStep1LineCount" style="display:none;"><span id="wizardLineCountBadge">0</span></div>
                <span id="wizardCountBadge2">0</span>
                <select id="wizardSeparatorSelect"><option value="tab">Tab</option><option value=";">;</option><option value=",">,</option></select>
                <div id="wizardMappingContainer"></div>
            </div>
        `;
        vi.spyOn(ImportWizardManager, '_updatePreview').mockResolvedValue();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        ImportWizardManager._reset();
    });

    it('détecte l\'en-tête Élève/Moyenne/Appréciation, mappe sur NOM_PRENOM/MOY_T1/APP_T1 et exclut l\'en-tête du compteur et du tableau (B2)', () => {
        const tsv = [
            'Élève\tMoyenne\tAppréciation',
            'DURAND Sophie\t11,5\t',
            'BERNARD Thomas\t16,0\tTrès bon trimestre, travail rigoureux.',
            'GARCIA Léa\t14,5\tBon investissement en classe.',
            'ROUX Maxime\t8,5\tDes difficultés mais de la bonne volonté.'
        ].join('\n');

        document.getElementById('wizardDataTextarea').value = tsv;
        ImportWizardManager._processData();

        expect(ImportWizardManager.state.hasHeader).toBe(true);
        expect(document.getElementById('wizardStep1NextBtn').disabled).toBe(false);
        expect(document.getElementById('wizardCountBadge2').textContent).toBe('4');

        const selects = Array.from(document.querySelectorAll('.mapping-select')).map(s => s.value);
        expect(selects).toEqual(['NOM_PRENOM', 'MOY_T1', 'APP_T1']);

        const bodyRows = document.querySelectorAll('.import-mapping-table tbody tr');
        expect(bodyRows.length).toBe(4);
        expect(bodyRows[0].textContent).toContain('DURAND Sophie');
        expect(bodyRows[0].textContent).not.toContain('Moyenne');
    });

    it('mappe correctement un tableau sans en-tête contenant des moyennes décimales françaises (B2 repli)', () => {
        const tsv = [
            'DURAND Sophie\t11,5\tÉlève sérieuse et régulière.',
            'BERNARD Thomas\t16,0\tExcellent trimestre.'
        ].join('\n');

        document.getElementById('wizardDataTextarea').value = tsv;
        ImportWizardManager._processData();

        expect(ImportWizardManager.state.hasHeader).toBe(false);
        expect(document.getElementById('wizardCountBadge2').textContent).toBe('2');
        const selects = Array.from(document.querySelectorAll('.mapping-select')).map(s => s.value);
        expect(selects[0]).toBe('NOM_PRENOM');
        expect(selects[1]).toBe('MOY_T1');
    });

    it('active le bouton Suivant dès un événement paste ou change sur le champ texte (F8)', async () => {
        vi.useFakeTimers();
        try {
            ImportWizardManager._bindEvents();
            const textarea = document.getElementById('wizardDataTextarea');
            const nextBtn = document.getElementById('wizardStep1NextBtn');
            expect(nextBtn.disabled).toBe(true);

            textarea.value = 'DURAND Sophie\t14,5';
            textarea.dispatchEvent(new Event('paste'));
            await vi.advanceTimersByTimeAsync(10);

            expect(nextBtn.disabled).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });
});
