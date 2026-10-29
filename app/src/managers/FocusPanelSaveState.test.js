import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appState, runtimeState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';
import { SyncService } from '../services/SyncService.js';
import { FocusPanelManager } from './FocusPanelManager.js';

vi.mock('../services/DBService.js', () => ({
    DBService: {
        putAll: vi.fn().mockResolvedValue(true)
    }
}));

describe('FocusPanelManager and Save State integrity', () => {
    beforeEach(() => {
        localStorage.clear();
        runtimeState.data.generatedResults = [
            {
                id: 'student-1',
                nom: 'Dupont',
                prenom: 'Jean',
                studentData: {
                    statuses: [],
                    periods: {
                        T1: {
                            grade: 14.25,
                            appreciation: '**Bon travail.** Régulier et attentif.',
                            context: 'Très investi'
                        }
                    }
                },
                generationPeriod: 'T1',
                wasGenerated: true,
                appreciation: '**Bon travail.** Régulier et attentif.'
            },
            {
                id: 'student-2',
                nom: 'Martin',
                prenom: 'Sophie',
                studentData: {
                    statuses: [],
                    periods: {
                        T1: {
                            grade: 16.0,
                            appreciation: 'Excellent travail.',
                            context: 'Participation active'
                        }
                    }
                },
                generationPeriod: 'T1',
                wasGenerated: true,
                appreciation: 'Excellent travail.'
            }
        ];
        appState.generatedResults = runtimeState.data.generatedResults;
        appState.filteredResults = runtimeState.data.generatedResults;
        appState.currentPeriod = 'T1';

        document.body.innerHTML = `
            <div id="focusPanel" tabindex="-1">
                <div class="focus-main-page">
                    <div class="focus-header">
                        <div class="focus-title" id="focusStudentName"></div>
                        <div class="focus-header-read"></div>
                        <div class="focus-header-edit"></div>
                        <div id="focusAvatarContainer"></div>
                        <div id="focusStatusBadges"></div>
                    </div>
                    <div class="focus-content">
                        <div id="focusPreviousGrades"></div>
                        <span id="focusCurrentGradeLabel"></span>
                        <input id="focusCurrentGradeInput" />
                        <textarea id="focusContextInput"></textarea>
                        <span id="focusAppreciationTitle"></span>
                        <span id="focusAppreciationBadge"></span>
                        <div id="focusAppreciationText" contenteditable="true"></div>
                        <button id="focusGenerateBtn"></button>
                        <button id="focusCopyBtn"><iconify-icon icon="solar:copy-linear"></iconify-icon><span class="btn-copy-label">Copier</span></button>
                        <div id="focusRefinementOptions"></div>
                        <div id="focusWordCount"></div>
                        <div id="focusHistoryUndoBtn"></div>
                        <div id="focusHistoryRedoBtn"></div>
                        <div id="focusSourceIndicator"></div>
                        <div id="focusJournalSection"></div>
                        <div id="focusJournalContent"></div>
                        <span id="focusPrevBtn"></span>
                        <span id="focusNextBtn"></span>
                    </div>
                </div>
            </div>
            <div id="focusPanelBackdrop"></div>
            <button id="headerMenuBtn"></button>
            <button id="cloudSaveMenuBtn"><iconify-icon></iconify-icon><span class="cloud-save-label"></span></button>
            <button id="cloudLoadMenuBtn"></button>
            <span id="cloudSaveHint"></span>
            <span id="cloudLoadHint"></span>
        `;

        FocusPanelManager._listenersAttached = false;
        FocusPanelManager.init(null, null);
    });

    it('does not alter sync state or mutate data on opening and closing the panel', () => {
        const initialHash = StorageManager.computeCurrentDataHash();
        const now = 10000;
        SyncService.lastSyncTime = now;
        localStorage.setItem('bulletin_last_sync', now.toString());
        localStorage.setItem('bulletin_last_modified', now.toString());
        localStorage.setItem('bulletin_last_sync_hash', initialHash);

        expect(SyncService._computeSyncState()).toBe('in-sync');

        // Open focus panel
        FocusPanelManager.open('student-1');

        expect(SyncService._computeSyncState()).toBe('in-sync');
        expect(StorageManager.computeCurrentDataHash()).toBe(initialHash);
        expect(runtimeState.data.generatedResults[0].studentData.periods.T1.grade).toBe(14.25);
        expect(runtimeState.data.generatedResults[0].studentData.periods.T1.appreciation).toBe('**Bon travail.** Régulier et attentif.');

        // Close focus panel
        FocusPanelManager.close();

        expect(SyncService._computeSyncState()).toBe('in-sync');
        expect(StorageManager.computeCurrentDataHash()).toBe(initialHash);
        expect(localStorage.getItem('bulletin_last_modified')).toBe(now.toString());
        expect(runtimeState.data.generatedResults[0].studentData.periods.T1.grade).toBe(14.25);
        expect(runtimeState.data.generatedResults[0].studentData.periods.T1.appreciation).toBe('**Bon travail.** Régulier et attentif.');
    });

    it('does not alter sync state when switching between students without editing', () => {
        const initialHash = StorageManager.computeCurrentDataHash();
        const now = 10000;
        SyncService.lastSyncTime = now;
        localStorage.setItem('bulletin_last_sync', now.toString());
        localStorage.setItem('bulletin_last_modified', now.toString());
        localStorage.setItem('bulletin_last_sync_hash', initialHash);

        FocusPanelManager.open('student-1');
        FocusPanelManager.open('student-2');
        FocusPanelManager.close();

        expect(SyncService._computeSyncState()).toBe('in-sync');
        expect(StorageManager.computeCurrentDataHash()).toBe(initialHash);
    });

    it('marks local-changes when the user actually edits the appreciation', () => {
        const initialHash = StorageManager.computeCurrentDataHash();
        const now = 10000;
        SyncService.lastSyncTime = now;
        localStorage.setItem('bulletin_last_sync', now.toString());
        localStorage.setItem('bulletin_last_modified', now.toString());
        localStorage.setItem('bulletin_last_sync_hash', initialHash);

        FocusPanelManager.open('student-1');

        const appreciationEl = document.getElementById('focusAppreciationText');
        appreciationEl.innerHTML = 'Nouvelle appréciation saisie par le professeur.';
        appreciationEl.dispatchEvent(new Event('input', { bubbles: true }));
        appreciationEl.dispatchEvent(new Event('blur', { bubbles: true }));

        expect(SyncService._computeSyncState()).toBe('local-changes');
        expect(StorageManager.computeCurrentDataHash()).not.toBe(initialHash);
    });

    it('marks local-changes when the user actually edits the grade', () => {
        const initialHash = StorageManager.computeCurrentDataHash();
        const now = 10000;
        SyncService.lastSyncTime = now;
        localStorage.setItem('bulletin_last_sync', now.toString());
        localStorage.setItem('bulletin_last_modified', now.toString());
        localStorage.setItem('bulletin_last_sync_hash', initialHash);

        FocusPanelManager.open('student-1');

        const gradeInput = document.getElementById('focusCurrentGradeInput');
        gradeInput.value = '17.5';
        gradeInput.dispatchEvent(new Event('input', { bubbles: true }));
        FocusPanelManager.close();

        expect(SyncService._computeSyncState()).toBe('local-changes');
        expect(runtimeState.data.generatedResults[0].studentData.periods.T1.grade).toBe(17.5);
    });

    it('marks local-changes when the user actually edits the context', () => {
        const initialHash = StorageManager.computeCurrentDataHash();
        const now = 10000;
        SyncService.lastSyncTime = now;
        localStorage.setItem('bulletin_last_sync', now.toString());
        localStorage.setItem('bulletin_last_modified', now.toString());
        localStorage.setItem('bulletin_last_sync_hash', initialHash);

        FocusPanelManager.open('student-1');

        const contextInput = document.getElementById('focusContextInput');
        contextInput.value = 'Nouveau contexte';
        contextInput.dispatchEvent(new Event('input', { bubbles: true }));
        contextInput.dispatchEvent(new Event('blur', { bubbles: true }));

        expect(SyncService._computeSyncState()).toBe('local-changes');
        expect(runtimeState.data.generatedResults[0].studentData.periods.T1.context).toBe('Nouveau contexte');
    });

    describe('Copy feedback and cancellation guard', () => {
        it('flashes copy feedback and restores original label properly', () => {
            vi.useFakeTimers();
            const copyBtn = document.getElementById('focusCopyBtn');
            const labelEl = copyBtn.querySelector('.btn-copy-label');

            FocusPanelManager._flashCopyFeedback('copied', 'Copié !');
            expect(labelEl.textContent).toBe('Copié !');
            expect(copyBtn.classList.contains('copied')).toBe(true);

            // Fast forward time
            vi.advanceTimersByTime(1600);
            expect(labelEl.textContent).toBe('Copier');
            expect(copyBtn.classList.contains('copied')).toBe(false);
            vi.useRealTimers();
        });

        it('resets previous timer cleanly on rapid consecutive copy clicks', () => {
            vi.useFakeTimers();
            const copyBtn = document.getElementById('focusCopyBtn');
            const labelEl = copyBtn.querySelector('.btn-copy-label');

            FocusPanelManager._flashCopyFeedback('copied', 'Copié !');
            vi.advanceTimersByTime(1000); // 1000ms in

            // Second click before timeout expires
            FocusPanelManager._flashCopyFeedback('copied-prompt', 'Prompt copié !');
            expect(labelEl.textContent).toBe('Prompt copié !');
            expect(copyBtn.classList.contains('copied-prompt')).toBe(true);

            // 600ms later (first timer would have expired at 1500ms, but new timer has 900ms left)
            vi.advanceTimersByTime(600);
            expect(labelEl.textContent).toBe('Prompt copié !');

            // Complete the remaining time
            vi.advanceTimersByTime(1000);
            expect(labelEl.textContent).toBe('Copier');
            vi.useRealTimers();
        });

        it('ignores generate button clicks within 350ms of generation start to prevent accidental cancellation', () => {
            const cancelSpy = vi.spyOn(FocusPanelManager, '_cancelGenerationForStudent').mockImplementation(() => {});
            FocusPanelManager.currentStudentId = 'student-1';
            FocusPanelManager._activeGenerations.set('student-1', new AbortController());
            FocusPanelManager._activeGenerationStartTime = Date.now();

            const generateBtn = document.getElementById('focusGenerateBtn');
            // Click immediately (0ms elapsed)
            generateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(cancelSpy).not.toHaveBeenCalled();

            // Click after 400ms
            FocusPanelManager._activeGenerationStartTime = Date.now() - 400;
            generateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(cancelSpy).toHaveBeenCalledWith('student-1');

            FocusPanelManager._activeGenerations.clear();
        });

        it('qualifies newly checked Nouveau/Départ with the active period and keeps inactive history when merging header checkboxes', async () => {
            const { FocusPanelHeader } = await import('./FocusPanelHeader.js');
            const allCheckboxValues = ['Nouveau', 'Départ', 'PPRE', 'PAP', 'ULIS', 'Délégué'];
            const merge = (base, checked, period) => FocusPanelHeader.mergeEditedStatuses(base, checked, allCheckboxValues, period);

            // T2 : conserve "Nouveau T2" et "PAI" quand "Nouveau" reste coché et qu'on ajoute "ULIS"
            expect(merge(['Nouveau T2', 'PAI'], ['Nouveau', 'ULIS'], 'T2')).toEqual(['Nouveau T2', 'ULIS', 'PAI']);
            // T2 : retire "Nouveau T2" quand "Nouveau" est décoché, conserve les statuts importés
            expect(merge(['Nouveau T2', 'PAI', 'AESH'], ['PAP'], 'T2')).toEqual(['PAP', 'PAI', 'AESH']);
            // Saisie manuelle : Nouveau/Départ cochés sont qualifiés par la période active
            expect(merge([], ['Nouveau', 'Départ', 'PPRE'], 'T2')).toEqual(['Nouveau T2', 'Départ T2', 'PPRE']);
            // T3 : "Nouveau T2" (inactif, case non cochée) est conservé comme historique
            expect(merge(['Nouveau T2'], [], 'T3')).toEqual(['Nouveau T2']);
            // T3 : recocher "Nouveau" requalifie le statut sur la période active
            expect(merge(['Nouveau T2'], ['Nouveau'], 'T3')).toEqual(['Nouveau T3']);
            // Statut historique sans période : conservé tel quel
            expect(merge(['Nouveau'], ['Nouveau'], 'T3')).toEqual(['Nouveau']);
        });

        it('checks status boxes in edit mode according to the active period', async () => {
            const { FocusPanelHeader } = await import('./FocusPanelHeader.js');
            const editMode = document.querySelector('.focus-header-edit');
            editMode.innerHTML = `
                <input type="text" id="headerPrenomInput">
                <input type="text" id="headerNomInput">
                <div class="status-checkboxes">
                    <label><input type="checkbox" value="Nouveau"> Nouveau</label>
                    <label><input type="checkbox" value="Départ"> Départ</label>
                </div>
            `;
            appState.generatedResults = [
                { id: 's-period', nom: 'DUPONT', prenom: 'Alice', studentData: { statuses: ['Nouveau T2', 'Départ T3'], periods: {} } }
            ];
            FocusPanelHeader.callbacks.getIsCreationMode = () => false;
            FocusPanelHeader.callbacks.getCurrentStudentId = () => 's-period';
            const nouveauCb = editMode.querySelector('input[value="Nouveau"]');
            const departCb = editMode.querySelector('input[value="Départ"]');

            appState.currentPeriod = 'T2';
            FocusPanelHeader.toggleEditMode(true);
            expect(nouveauCb.checked).toBe(true);
            expect(departCb.checked).toBe(false);

            appState.currentPeriod = 'T3';
            FocusPanelHeader.toggleEditMode(true);
            expect(nouveauCb.checked).toBe(false);
            expect(departCb.checked).toBe(true);
        });

        it('pre-selects Nouveau in creation mode only in later periods (T2/T3/S2) when class already has students', async () => {
            const { FocusPanelHeader } = await import('./FocusPanelHeader.js');
            const editMode = document.querySelector('.focus-header-edit');
            editMode.innerHTML = `
                <input type="text" id="headerPrenomInput">
                <input type="text" id="headerNomInput">
                <div class="status-checkboxes">
                    <label><input type="checkbox" value="Nouveau"> Nouveau</label>
                    <label><input type="checkbox" value="Départ"> Départ</label>
                    <label><input type="checkbox" value="PPRE"> PPRE</label>
                </div>
            `;

            FocusPanelHeader.callbacks.getIsCreationMode = () => true;
            FocusPanelHeader.callbacks.getCurrentStudentId = () => null;

            // Cas 1 : En T1 -> Nouveau NON pré-coché même si la classe a des élèves
            appState.currentPeriod = 'T1';
            FocusPanelHeader.toggleEditMode(true);
            const nouveauCb = editMode.querySelector('input[value="Nouveau"]');
            expect(nouveauCb.checked).toBe(false);
            expect(FocusPanelHeader._originalHeaderValues.statuses).toEqual([]);

            // Cas 2 : En T2 avec élèves existants dans la classe -> Nouveau pré-coché ("Nouveau T2")
            appState.currentPeriod = 'T2';
            FocusPanelHeader.toggleEditMode(true);
            expect(nouveauCb.checked).toBe(true);
            expect(FocusPanelHeader._originalHeaderValues.statuses).toEqual(['Nouveau T2']);

            // Cas 3 : En T2 mais classe vide -> Nouveau NON pré-coché
            appState.generatedResults = [];
            FocusPanelHeader.toggleEditMode(true);
            expect(nouveauCb.checked).toBe(false);
            expect(FocusPanelHeader._originalHeaderValues.statuses).toEqual([]);
        });
    });

    describe('Manual Edit & Student Creation Lifecycle', () => {
        beforeEach(() => {
            const editMode = document.querySelector('.focus-header-edit');
            editMode.innerHTML = `
                <input type="text" id="headerPrenomInput">
                <input type="text" id="headerNomInput">
                <div id="focusStatusCheckboxes" class="focus-status-selection">
                    <label><input type="checkbox" value="Nouveau"> Nouveau</label>
                    <label><input type="checkbox" value="PPRE"> PPRE</label>
                </div>
            `;
            FocusPanelManager._listenersAttached = false;
            FocusPanelManager.init(null, null);
        });

        it('keeps edit mode open and returns false when validating creation mode with empty name inputs', async () => {
            const { FocusPanelHeader } = await import('./FocusPanelHeader.js');
            FocusPanelManager.openNew();

            const header = document.querySelector('.focus-header');
            const editMode = document.querySelector('.focus-header-edit');
            expect(header.classList.contains('editing')).toBe(true);
            expect(editMode.classList.contains('visible')).toBe(true);

            const saved = FocusPanelHeader.toggleEditMode(false, false);
            expect(saved).toBe(false);
            expect(FocusPanelManager.isCreationMode).toBe(true);
            expect(header.classList.contains('editing')).toBe(true);
            expect(editMode.classList.contains('visible')).toBe(true);
            expect(appState.generatedResults).toHaveLength(2);
        });

        it('captures grade, context, and appreciation typed before header validation in creation mode and unlocks Journal', async () => {
            const { FocusPanelHeader } = await import('./FocusPanelHeader.js');
            FocusPanelManager.openNew();

            const avatarEl = document.querySelector('#focusAvatarContainer .student-avatar');
            expect(avatarEl.classList.contains('student-avatar--empty-name')).toBe(true);
            expect(document.getElementById('focusJournalSection').style.display).toBe('none');

            const prenomInput = document.getElementById('headerPrenomInput');
            const nomInput = document.getElementById('headerNomInput');
            prenomInput.value = 'Lucas';
            nomInput.value = 'Bernard';
            FocusPanelHeader._updateLiveAvatarInitials();

            expect(avatarEl.classList.contains('student-avatar--empty-name')).toBe(false);
            expect(avatarEl.querySelector('.student-avatar__initials').textContent).toBe('LB');

            // Teacher fills lower cards BEFORE clicking the header checkmark
            document.getElementById('focusCurrentGradeInput').value = '15,5';
            document.getElementById('focusContextInput').value = 'Élève sérieux et curieux';
            const appreciationEl = document.getElementById('focusAppreciationText');
            appreciationEl.classList.remove('empty');
            appreciationEl.textContent = 'Très bon trimestre, continuez ainsi.';

            const saved = FocusPanelHeader.toggleEditMode(false, false);
            expect(saved).toBe(true);
            expect(FocusPanelManager.isCreationMode).toBe(false);
            expect(appState.generatedResults).toHaveLength(3); // No duplicate push into aliased filteredResults

            const created = appState.generatedResults[2];
            expect(created.prenom).toBe('Lucas');
            expect(created.nom).toBe('BERNARD');
            expect(created.studentData.periods.T1.grade).toBe(15.5);
            expect(created.studentData.periods.T1.context).toBe('Élève sérieux et curieux');
            expect(created.studentData.periods.T1.appreciation).toBe('Très bon trimestre, continuez ainsi.');
            expect(created.appreciationSource).toBe('manual');
            expect(document.getElementById('focusJournalSection').style.display).not.toBe('none');
        });

        it('auto-commits creation header when focusing lower content cards or clicking Generate once a name is entered', async () => {
            FocusPanelManager.openNew();

            document.getElementById('headerPrenomInput').value = 'Emma';
            document.getElementById('headerNomInput').value = 'Moreau';

            const contextInput = document.getElementById('focusContextInput');
            contextInput.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

            expect(FocusPanelManager.isCreationMode).toBe(false);
            expect(document.querySelector('.focus-header').classList.contains('editing')).toBe(false);
            expect(appState.generatedResults).toHaveLength(3);
            expect(appState.generatedResults[2].prenom).toBe('Emma');
            expect(appState.generatedResults[2].nom).toBe('MOREAU');
        });

        it('discards creation on explicit cancel (close button / Escape) but auto-saves on normal panel close when name is filled', async () => {
            const { FocusPanelHeader } = await import('./FocusPanelHeader.js');

            // 1. Explicit cancel discards creation even if name is typed
            FocusPanelManager.openNew();
            document.getElementById('headerPrenomInput').value = 'Fantôme';
            FocusPanelHeader.toggleEditMode(false, true);
            expect(appState.generatedResults).toHaveLength(2);
            expect(FocusPanelManager.isCreationMode).toBe(false);

            // 2. Closing via backdrop (normal close) auto-saves when name is typed
            FocusPanelManager.openNew();
            document.getElementById('headerPrenomInput').value = 'Chloé';
            document.getElementById('headerNomInput').value = 'Petit';
            FocusPanelManager.close();
            expect(appState.generatedResults).toHaveLength(3);
            expect(appState.generatedResults[2].prenom).toBe('Chloé');
            expect(appState.generatedResults[2].nom).toBe('PETIT');
        });

        it('moves focus from Prénom to NOM on Enter when NOM is empty, and validates on Enter once NOM is filled', () => {
            FocusPanelManager.openNew();

            const prenomInput = document.getElementById('headerPrenomInput');
            const nomInput = document.getElementById('headerNomInput');
            const focusSpy = vi.spyOn(nomInput, 'focus');

            prenomInput.value = 'Léo';
            prenomInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

            expect(focusSpy).toHaveBeenCalledTimes(1);
            expect(FocusPanelManager.isCreationMode).toBe(true);
            expect(document.querySelector('.focus-header').classList.contains('editing')).toBe(true);

            nomInput.value = 'Garnier';
            nomInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

            expect(FocusPanelManager.isCreationMode).toBe(false);
            expect(document.querySelector('.focus-header').classList.contains('editing')).toBe(false);
            expect(appState.generatedResults).toHaveLength(3);
            expect(appState.generatedResults[2].prenom).toBe('Léo');
            expect(appState.generatedResults[2].nom).toBe('GARNIER');
        });

        it('preserves the avatar DOM node on save for smooth spring transitions and skips persistence when nothing changed', async () => {
            const { FocusPanelHeader } = await import('./FocusPanelHeader.js');
            FocusPanelManager.open('student-1');

            const saveSpy = vi.spyOn(StorageManager, 'saveAppState');
            const avatarBefore = document.querySelector('#focusAvatarContainer .student-avatar');
            expect(avatarBefore).toBeTruthy();

            // 1. Open and validate without changes -> fast path (0 persistence calls)
            FocusPanelHeader.toggleEditMode(true);
            FocusPanelHeader.toggleEditMode(false, false);
            expect(saveSpy).not.toHaveBeenCalled();
            expect(document.querySelector('#focusAvatarContainer .student-avatar')).toBe(avatarBefore);

            // 2. Open, modify name, and validate -> saves changes while preserving the same .student-avatar DOM node
            FocusPanelHeader.toggleEditMode(true);
            document.getElementById('headerPrenomInput').value = 'Jean-Baptiste';
            FocusPanelHeader.toggleEditMode(false, false);
            expect(saveSpy).toHaveBeenCalledTimes(1);
            expect(document.querySelector('#focusAvatarContainer .student-avatar')).toBe(avatarBefore);
            expect(avatarBefore.querySelector('.student-avatar__initials').textContent).toBe('JD');
            saveSpy.mockRestore();
        });
    });
});
