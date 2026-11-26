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
        // Nettoyer tous les timers différés et files de fermeture d'un test précédent
        clearTimeout(FocusPanelManager._uiUpdateTimeout);
        clearTimeout(FocusPanelManager._appreciationUITimeout);
        FocusPanelManager._settlePendingClose({ flush: false });
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
        const saveSpy = vi.spyOn(StorageManager, 'saveAppState');

        const contextInput = document.getElementById('focusContextInput');
        contextInput.value = 'Nouveau contexte';
        contextInput.dispatchEvent(new Event('input', { bubbles: true }));
        contextInput.dispatchEvent(new Event('blur', { bubbles: true }));

        const student = runtimeState.data.generatedResults[0];
        expect(SyncService._computeSyncState()).toBe('local-changes');
        expect(student.studentData.periods.T1.context).toBe('Nouveau contexte');
        // Persisté dès la sortie du champ et horodaté pour la fusion Cloud et le récapitulatif Sauvegarder/Restaurer
        expect(saveSpy).toHaveBeenCalled();
        expect(student.studentData.periods.T1._lastModified).toBeGreaterThan(now);
        expect(student._lastModified).toBeGreaterThan(now);
        saveSpy.mockRestore();
    });

    it('does not change the data hash when the context is typed then reverted to its original value', () => {
        const initialHash = StorageManager.computeCurrentDataHash();
        FocusPanelManager.open('student-1');

        const contextInput = document.getElementById('focusContextInput');
        contextInput.value = 'Temporaire';
        contextInput.dispatchEvent(new Event('input', { bubbles: true }));
        contextInput.value = 'Très investi';
        contextInput.dispatchEvent(new Event('input', { bubbles: true }));
        contextInput.dispatchEvent(new Event('blur', { bubbles: true }));

        expect(StorageManager.computeCurrentDataHash()).toBe(initialHash);
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

        it('adapts #focusCopyBtn actions and restores Prompt label when appreciation is empty', () => {
            vi.useFakeTimers();
            try {
                appState.generatedResults[0].appreciation = '';
                appState.generatedResults[0].studentData.periods.T1.appreciation = '';

                const copyPromptSpy = vi.spyOn(FocusPanelManager, '_copyPromptToClipboard').mockImplementation(() => {
                    FocusPanelManager._flashCopyFeedback('copied-prompt', 'Prompt copié !');
                });
                const previewSpy = vi.spyOn(FocusPanelManager, '_showPromptPreview').mockImplementation(() => {});
                const copyAppSpy = vi.spyOn(FocusPanelManager, 'copy').mockImplementation(() => {});

                FocusPanelManager.open('student-1');

                const copyBtn = document.getElementById('focusCopyBtn');
                const labelEl = copyBtn.querySelector('.btn-copy-label');

                // Empty state: Prompt mode active
                expect(copyBtn.dataset.copyMode).toBe('prompt');
                expect(copyBtn.disabled).toBe(false);
                expect(labelEl.textContent).toBe('Prompt');

                // Left click copies prompt and restores 'Prompt' after timeout
                copyBtn.click();
                expect(copyPromptSpy).toHaveBeenCalledTimes(1);
                expect(copyAppSpy).not.toHaveBeenCalled();
                expect(labelEl.textContent).toBe('Prompt copié !');

                vi.advanceTimersByTime(1600);
                expect(labelEl.textContent).toBe('Prompt');
                expect(copyBtn.classList.contains('copied-prompt')).toBe(false);

                // Right click in empty state opens prompt preview
                copyBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
                expect(previewSpy).toHaveBeenCalledTimes(1);

                // Typing/pasting an appreciation switches both buttons cleanly (Prompt→Copier, Générer→Régénérer)
                const appreciationEl = document.getElementById('focusAppreciationText');
                const generateBtn = document.getElementById('focusGenerateBtn');
                expect(generateBtn.textContent).toContain('Générer');

                appreciationEl.textContent = 'Appréciation collée depuis ChatGPT.';
                appreciationEl.dispatchEvent(new Event('input', { bubbles: true }));

                expect(copyBtn.dataset.copyMode).toBe('appreciation');
                expect(labelEl.textContent).toBe('Copier');
                expect(generateBtn.textContent).toContain('Régénérer');

                // Left click copies appreciation, right click copies prompt
                copyBtn.click();
                expect(copyAppSpy).toHaveBeenCalledTimes(1);

                copyBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
                expect(copyPromptSpy).toHaveBeenCalledTimes(2);

                // Clearing the appreciation immediately syncs both buttons back (Copier→Prompt, Régénérer→Générer)
                appreciationEl.textContent = '';
                appreciationEl.dispatchEvent(new Event('input', { bubbles: true }));

                expect(copyBtn.dataset.copyMode).toBe('prompt');
                expect(generateBtn.textContent).toContain('Générer');
            } finally {
                vi.restoreAllMocks();
                vi.useRealTimers();
            }
        });

        it('deanonymizes [PRÉNOM] on paste from external AI and preserves student classId in prepareStudentData', () => {
            appState.generatedResults[0].classId = 'class-3b';
            appState.generatedResults[0].appreciation = '';
            appState.generatedResults[0].studentData.periods.T1.appreciation = '';

            FocusPanelManager.open('student-1');

            const prepared = FocusPanelManager._prepareStudentData('student-1', 'T1', appState.generatedResults[0]);
            expect(prepared.classId).toBe('class-3b');

            const appreciationEl = document.getElementById('focusAppreciationText');
            const range = document.createRange();
            range.selectNodeContents(appreciationEl);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
            Object.defineProperty(pasteEvent, 'clipboardData', {
                value: { getData: () => '[PRÉNOM] [NOM] progresse très bien ce trimestre.' }
            });
            appreciationEl.dispatchEvent(pasteEvent);

            expect(appreciationEl.textContent).toBe('Jean progresse très bien ce trimestre.');
            expect(document.getElementById('focusGenerateBtn').textContent).toContain('Régénérer');
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
            FocusPanelManager._isCancellingGeneration = false;
            cancelSpy.mockRestore();
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

        it('échappe le libellé et le data-tooltip dans FocusPanelHeader.renderStatusBadges (protection XSS)', async () => {
            const { FocusPanelHeader } = await import('./FocusPanelHeader.js');
            let headerBadges = document.getElementById('focusStatusBadges');
            if (!headerBadges) {
                headerBadges = document.createElement('div');
                headerBadges.id = 'focusStatusBadges';
                document.body.appendChild(headerBadges);
            }

            FocusPanelHeader.renderStatusBadges(['" onmouseover="alert(1)"><img src=x onerror=alert(2)>']);

            const container = document.getElementById('focusStatusBadges');
            expect(container.querySelector('img')).toBeNull();
            const badge = container.querySelector('.status-badge-clickable');
            expect(badge).not.toBeNull();
            expect(badge.getAttribute('onmouseover')).toBeNull();
            expect(badge.textContent).toContain('<img src=x onerror=alert(2)>');
            expect(badge.getAttribute('data-tooltip')).toContain('onmouseover');
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

    describe('Progressive Reveal & Button Synchronization', () => {
        beforeEach(() => {
            appState.currentAIModel = 'albert-openweight-medium';
            appState.albertApiKey = 'sk-test-valid-key';
            document.getElementById('focusRefinementOptions').innerHTML = `
                <button data-refine-type="concise">Concise</button>
                <button data-refine-type="encouraging">Encourageante</button>
                <button data-refine-type="polish">Peaufiner</button>
            `;
        });

        it('blocks FocusPanelManager.generate() before mutating UI when no API key is configured (B3)', async () => {
            appState.albertApiKey = '';
            appState.googleApiKey = '';
            const mockAm = { generateAppreciation: vi.fn() };
            FocusPanelManager.init(mockAm, null);
            FocusPanelManager.open('student-1');

            const generateBtn = document.getElementById('focusGenerateBtn');
            await FocusPanelManager.generate();

            expect(mockAm.generateAppreciation).not.toHaveBeenCalled();
            expect(generateBtn.classList.contains('is-loading')).toBe(false);
        });

        it('keeps Annuler active and secondary buttons disabled during progressive reveal, then unlocks all together with the generated badge', async () => {
            vi.useFakeTimers();
            try {
                const mockAm = {
                    generateAppreciation: vi.fn().mockResolvedValue({
                        appreciation: 'Nouvelle appréciation bienveillante et précise.',
                        evolutions: [],
                        timestamp: new Date().toISOString(),
                        studentData: { currentAIModel: 'gemini-2.5-flash' },
                        tokenUsage: { appreciation: { total_tokens: 42 } }
                    })
                };
                FocusPanelManager.init(mockAm, null);
                FocusPanelManager.open('student-1');

                const generateBtn = document.getElementById('focusGenerateBtn');
                const copyBtn = document.getElementById('focusCopyBtn');
                const conciseBtn = document.querySelector('[data-refine-type="concise"]');
                const badge = document.getElementById('focusAppreciationBadge');

                const genPromise = FocusPanelManager.generate();

                // Flush microtasks so generateAppreciation resolves and animateHtmlReveal starts
                await Promise.resolve();
                await Promise.resolve();
                // Advance past skeleton fade-out (150ms) into the middle of word reveal (200ms)
                await vi.advanceTimersByTimeAsync(200);

                // During progressive reveal: button MUST still be on "Annuler" and secondary buttons MUST still be disabled
                expect(generateBtn.classList.contains('is-loading')).toBe(true);
                expect(generateBtn.textContent).toContain('Annuler');
                expect(copyBtn.classList.contains('disabled')).toBe(true);
                expect(conciseBtn.classList.contains('disabled')).toBe(true);

                // Advance to exact end of progressive reveal (no extra +400ms dead wait)
                await vi.advanceTimersByTimeAsync(500);
                await genPromise;

                // Right after reveal completes: everything unlocks together and generated badge is preserved
                expect(generateBtn.classList.contains('is-loading')).toBe(false);
                expect(generateBtn.textContent).toContain('Régénérer');
                expect(copyBtn.classList.contains('disabled')).toBe(false);
                expect(conciseBtn.classList.contains('disabled')).toBe(false);
                expect(badge.classList.contains('generated')).toBe(true);
                expect(badge.classList.contains('visible')).toBe(true);
            } finally {
                vi.useRealTimers();
            }
        });

        it('cancels progressive reveal and restores previous appreciation if user clicks Annuler during reveal', async () => {
            vi.useFakeTimers();
            try {
                const originalAppreciation = runtimeState.data.generatedResults[0].studentData.periods.T1.appreciation;
                const mockAm = {
                    generateAppreciation: vi.fn().mockResolvedValue({
                        appreciation: 'Texte qui sera annulé pendant le fondu.',
                        evolutions: [],
                        timestamp: new Date().toISOString()
                    })
                };
                FocusPanelManager.init(mockAm, null);
                FocusPanelManager.open('student-1');

                const genPromise = FocusPanelManager.generate();

                await Promise.resolve();
                await Promise.resolve();
                await vi.advanceTimersByTimeAsync(200);

                // User cancels while progressive reveal is running
                FocusPanelManager._cancelGenerationForStudent('student-1');
                await vi.advanceTimersByTimeAsync(1000);
                await genPromise;

                // Previous appreciation is preserved in state and restored in DOM
                expect(runtimeState.data.generatedResults[0].studentData.periods.T1.appreciation).toBe(originalAppreciation);
                expect(document.getElementById('focusAppreciationText').textContent).toContain('Bon travail.');
                expect(document.getElementById('focusGenerateBtn').textContent).toContain('Régénérer');
            } finally {
                vi.useRealTimers();
            }
        });

        it('close({ discardChanges: true }) ne sauvegarde aucune saisie DOM sale ni au blur ni via _saveContext', () => {
            FocusPanelManager.init(null, null);
            FocusPanelManager.open('student-1');

            const saveSpy = vi.spyOn(StorageManager, 'saveAppState').mockResolvedValue();
            const gradeInput = document.getElementById('focusCurrentGradeInput');
            const contextInput = document.getElementById('focusContextInput');

            FocusPanelManager._isGradeEdited = true;
            FocusPanelManager._isContextEdited = true;
            FocusPanelManager._isAppreciationEdited = true;
            gradeInput.value = '2,0';
            contextInput.value = 'Texte non voulu';
            contextInput.focus();

            FocusPanelManager.close({ discardChanges: true });

            expect(saveSpy).not.toHaveBeenCalled();
            expect(runtimeState.data.generatedResults[0].studentData.periods.T1.grade).toBe(14.25);
            expect(runtimeState.data.generatedResults[0].studentData.periods.T1.context).toBe('Très investi');
            expect(FocusPanelManager.isOpen()).toBe(false);
            saveSpy.mockRestore();
        });

        it('sauvegarde immédiatement une note modifiée au blur sur #focusCurrentGradeInput', () => {
            FocusPanelManager.init(null, null);
            FocusPanelManager.open('student-1');

            const saveSpy = vi.spyOn(StorageManager, 'saveAppState').mockResolvedValue();
            const gradeInput = document.getElementById('focusCurrentGradeInput');

            gradeInput.value = '17,5';
            gradeInput.dispatchEvent(new Event('input', { bubbles: true }));
            gradeInput.dispatchEvent(new Event('blur'));

            expect(runtimeState.data.generatedResults[0].studentData.periods.T1.grade).toBe(17.5);
            expect(saveSpy).toHaveBeenCalled();
            saveSpy.mockRestore();
        });

        it('restaure le tooltip du bouton Fermer en sortie d\'édition d\'en-tête même si _tippy avait été détruit', async () => {
            const { FocusPanelHeader } = await import('./FocusPanelHeader.js');
            const { TooltipsUI } = await import('./TooltipsManager.js');
            const updateTooltipSpy = vi.spyOn(TooltipsUI, 'updateTooltip').mockImplementation((el, text) => {
                el.setAttribute('data-tooltip', text);
            });

            const closeBtn = document.createElement('button');
            closeBtn.id = 'focusBackBtn';
            document.body.appendChild(closeBtn);
            const header = document.querySelector('.focus-header');
            const readMode = document.querySelector('.focus-header-read');
            const editMode = document.querySelector('.focus-header-edit');

            FocusPanelHeader._exitEditModeUI(header, readMode, editMode, null);

            expect(updateTooltipSpy).toHaveBeenCalledWith(closeBtn, 'Fermer');
            expect(closeBtn.getAttribute('data-tooltip')).toBe('Fermer');
            updateTooltipSpy.mockRestore();
        });

        it('réinitialise _isClosing, annule le timer 500ms et applique les mises à jour différées lors d’une réouverture rapide', () => {
            vi.useFakeTimers();
            try {
                const mockListView = { updateStudentRow: vi.fn(() => true) };
                FocusPanelManager.init(null, mockListView);
                FocusPanelManager.open('student-1');

                FocusPanelManager.close();
                expect(FocusPanelManager._isClosing).toBe(true);
                expect(FocusPanelManager._closeDeferredTimer).not.toBeNull();

                // Mise à jour survenant pendant la fenêtre de fermeture de 500ms -> mise en file différée
                FocusPanelManager._updateListRow(runtimeState.data.generatedResults[0]);
                expect(FocusPanelManager._deferredRowUpdates.size).toBe(1);
                expect(mockListView.updateStudentRow).not.toHaveBeenCalled();

                // Réouverture rapide (< 500ms) : _isClosing repasse à false, timer annulé, ligne différée appliquée une seule fois
                FocusPanelManager.open('student-2');
                expect(FocusPanelManager._isClosing).toBe(false);
                expect(FocusPanelManager._closeDeferredTimer).toBeNull();
                expect(FocusPanelManager._deferredRowUpdates.size).toBe(0);
                expect(mockListView.updateStudentRow).toHaveBeenCalledTimes(1);
                expect(mockListView.updateStudentRow).toHaveBeenCalledWith('student-1');

                // Avancer de 600ms ne doit déclencher aucune seconde exécution parasite
                vi.advanceTimersByTime(600);
                expect(mockListView.updateStudentRow).toHaveBeenCalledTimes(1);
            } finally {
                vi.useRealTimers();
            }
        });
    });
});
