import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HistoryManager } from './HistoryManager.js';
import { appState } from '../state/State.js';
import { EventHandlersManager } from './EventHandlersManager.js';
import { UI } from './UIManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { FocusPanelAnalysis } from './FocusPanelAnalysis.js';
import { FocusPanelHistory } from './FocusPanelHistory.js';
import { FocusPanelHeader } from './FocusPanelHeader.js';
import { FocusPanelJournal } from './FocusPanelJournal.js';
import { PwaInstallManager } from './PwaInstallManager.js';

describe('HistoryManager', () => {
    beforeEach(() => {
        HistoryManager.destroy();
    });

    afterEach(() => {
        HistoryManager.destroy();
        vi.restoreAllMocks();
    });

    it('devrait initialiser l’état de base sur init()', () => {
        const replaceSpy = vi.spyOn(history, 'replaceState');
        HistoryManager.init();
        expect(replaceSpy).toHaveBeenCalledWith(
            expect.objectContaining({ appBase: true }),
            '',
            ''
        );
    });

    it('devrait empiler un élément et appeler pushState', () => {
        const pushSpy = vi.spyOn(history, 'pushState');
        const closeCb = vi.fn();

        HistoryManager.pushState('testPanel', closeCb);

        expect(HistoryManager.isOpen('testPanel')).toBe(true);
        expect(pushSpy).toHaveBeenCalledWith(
            expect.objectContaining({ uiOpen: true, uiId: 'testPanel' }),
            '',
            ''
        );
    });

    it('devrait dépiler et appeler le closeCallback du sommet lors d’un popstate', () => {
        HistoryManager.init();
        const closeCb1 = vi.fn();
        const closeCb2 = vi.fn();

        HistoryManager.pushState('panel1', closeCb1);
        HistoryManager.pushState('panel2', closeCb2);

        expect(HistoryManager.getStack().length).toBe(2);

        // Simuler un événement popstate du navigateur
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));

        expect(closeCb2).toHaveBeenCalledWith({ causedByHistory: true });
        expect(closeCb1).not.toHaveBeenCalled();
        expect(HistoryManager.isOpen('panel2')).toBe(false);
        expect(HistoryManager.isOpen('panel1')).toBe(true);
    });

    it('devrait gérer la fermeture manuelle sans déclencher le closeCallback', () => {
        HistoryManager.init();
        const backSpy = vi.spyOn(history, 'back').mockImplementation(() => {});
        const closeCb = vi.fn();

        HistoryManager.pushState('manualModal', closeCb);
        expect(HistoryManager.isOpen('manualModal')).toBe(true);

        HistoryManager.handleManualClose('manualModal');

        expect(HistoryManager.isOpen('manualModal')).toBe(false);
        expect(closeCb).not.toHaveBeenCalled();
        expect(backSpy).toHaveBeenCalled();
    });

    it('devrait ignorer le popstate immédiat provoqué par un handleManualClose', () => {
        HistoryManager.init();
        vi.spyOn(history, 'back').mockImplementation(() => {});
        const closeCb = vi.fn();

        HistoryManager.pushState('itemA', closeCb);
        HistoryManager.handleManualClose('itemA');

        // Simuler le popstate qui fait suite au history.back()
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));

        expect(closeCb).not.toHaveBeenCalled();
    });

    it('devrait piéger le premier retour à la racine et alerter avec une notification', () => {
        const notifSpy = vi.fn();
        window.UI = { showNotification: notifSpy };

        HistoryManager.init();
        const pushSpy = vi.spyOn(history, 'pushState');

        // Popstate à la racine (pile vide)
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));

        expect(pushSpy).toHaveBeenCalledWith(
            expect.objectContaining({ appBase: true }),
            '',
            ''
        );
        expect(notifSpy).toHaveBeenCalledWith(
            "Appuyez à nouveau pour quitter l'application",
            'info',
            2500,
            expect.any(Object)
        );

        delete window.UI;
    });

    it('ne devrait jamais appeler history.back() si l’état actif n’est pas un état UI (protection landing page)', () => {
        HistoryManager.init();
        const backSpy = vi.spyOn(history, 'back').mockImplementation(() => {});

        // On simule un élément dans la pile mais l'état d'historique actuel est à la base (non uiOpen)
        HistoryManager._stack.push({ id: 'desyncedModal', closeCallback: vi.fn() });
        history.replaceState({ appBase: true }, '', '');

        HistoryManager.handleManualClose('desyncedModal');

        expect(HistoryManager.isOpen('desyncedModal')).toBe(false);
        // back ne doit PAS avoir été appelé pour ne pas quitter app.html vers la landing page
        expect(backSpy).not.toHaveBeenCalled();
    });

    it('ne devrait jamais dupliquer un identifiant déjà présent plus bas dans la pile', () => {
        HistoryManager.init();
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        const cb1Updated = vi.fn();

        HistoryManager.pushState('layer1', cb1);
        HistoryManager.pushState('layer2', cb2);
        HistoryManager.pushState('layer1', cb1Updated);

        expect(HistoryManager.getStack().map(s => s.id)).toEqual(['layer1', 'layer2']);

        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        expect(cb2).toHaveBeenCalledWith({ causedByHistory: true });

        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        expect(cb1Updated).toHaveBeenCalledWith({ causedByHistory: true });
        expect(cb1).not.toHaveBeenCalled();
    });

    describe('Intégrations Mobile Back (Filtres stats, Focus Panel, PWA)', () => {
        beforeEach(() => {
            document.body.innerHTML = '';
            appState.activeStatFilter = null;
            vi.spyOn(AppreciationsManager, 'renderResults').mockImplementation(() => {});
        });

        it('devrait empiler statFilter à l’activation d’une carte stat et retirer le filtre au bouton Retour (popstate)', () => {
            document.body.innerHTML = `
                <div class="stats-container">
                    <div class="stat-card" id="cardValidated" data-stat-id="validated" data-count="5"></div>
                </div>
            `;
            const card = document.getElementById('cardValidated');

            EventHandlersManager.handleStatFilterClick(card);
            expect(appState.activeStatFilter).toBe('validated');
            expect(card.classList.contains('active-filter')).toBe(true);
            expect(HistoryManager.isOpen('statFilter')).toBe(true);

            // Retour mobile -> désactive le filtre sans quitter l'application
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            expect(appState.activeStatFilter).toBeNull();
            expect(card.classList.contains('active-filter')).toBe(false);
            expect(HistoryManager.isOpen('statFilter')).toBe(false);
        });

        it('devrait nettoyer statFilter dans HistoryManager lors d’une désactivation manuelle', () => {
            document.body.innerHTML = `
                <div class="stats-container">
                    <div class="stat-card" id="cardValidated" data-stat-id="validated" data-count="5"></div>
                </div>
            `;
            const card = document.getElementById('cardValidated');
            const manualCloseSpy = vi.spyOn(HistoryManager, 'handleManualClose');

            EventHandlersManager.handleStatFilterClick(card);
            expect(HistoryManager.isOpen('statFilter')).toBe(true);

            // Second clic sur la même carte -> désactivation manuelle
            EventHandlersManager.handleStatFilterClick(card);
            expect(appState.activeStatFilter).toBeNull();
            expect(manualCloseSpy).toHaveBeenCalledWith('statFilter');
            expect(HistoryManager.isOpen('statFilter')).toBe(false);
        });

        it('devrait fermer uniquement la sous-page Analyse IA (focusAnalysis) au bouton Retour sans fermer le Focus Panel', () => {
            document.body.innerHTML = `
                <div id="focusPagesContainer">
                    <div id="focusMainPage"></div>
                    <div id="focusAnalysisPage" inert></div>
                </div>
            `;
            const closePanelCb = vi.fn();
            HistoryManager.pushState('focusPanel', closePanelCb);

            FocusPanelAnalysis.init({ getCurrentStudentId: () => null });
            FocusPanelAnalysis.show();

            expect(FocusPanelAnalysis.isVisible()).toBe(true);
            expect(HistoryManager.isOpen('focusAnalysis')).toBe(true);

            // 1er Retour : ferme uniquement la page d'analyse
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            expect(FocusPanelAnalysis.isVisible()).toBe(false);
            expect(HistoryManager.isOpen('focusAnalysis')).toBe(false);
            expect(closePanelCb).not.toHaveBeenCalled();
            expect(HistoryManager.isOpen('focusPanel')).toBe(true);
        });

        it('devrait fermer le popover d’historique (focusHistoryPopover) au bouton Retour', () => {
            document.body.innerHTML = `<button id="focusHistoryIndicator"></button>`;
            vi.spyOn(FocusPanelHistory, '_getState').mockReturnValue({
                currentIndex: 1,
                versions: [
                    { content: 'V1', timestamp: Date.now() - 1000, source: 'ai' },
                    { content: 'V2', timestamp: Date.now(), source: 'manual' }
                ]
            });

            FocusPanelHistory.showPopover();
            expect(document.getElementById('historyPopover')).not.toBeNull();
            expect(HistoryManager.isOpen('focusHistoryPopover')).toBe(true);

            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            expect(document.getElementById('historyPopover')).toBeNull();
            expect(HistoryManager.isOpen('focusHistoryPopover')).toBe(false);
        });

        it('devrait annuler le mode édition de l’en-tête élève (focusHeaderEdit) au bouton Retour sans fermer la fiche', () => {
            document.body.innerHTML = `
                <div class="focus-header">
                    <div id="focusAvatarContainer"><div class="student-avatar"><span class="student-avatar__initials">JD</span></div></div>
                    <div class="focus-header-read"></div>
                    <div class="focus-header-edit">
                        <input id="headerNomInput" value="DUPONT" />
                        <input id="headerPrenomInput" value="Jean" />
                    </div>
                </div>
            `;
            appState.generatedResults = [{ id: 's1', nom: 'DUPONT', prenom: 'Jean', studentData: { statuses: [] } }];
            FocusPanelHeader.callbacks.getCurrentStudentId = () => 's1';
            FocusPanelHeader.callbacks.getIsCreationMode = () => false;

            FocusPanelHeader.toggleEditMode(true);
            expect(document.querySelector('.focus-header').classList.contains('editing')).toBe(true);
            expect(HistoryManager.isOpen('focusHeaderEdit')).toBe(true);

            document.getElementById('headerPrenomInput').value = 'Modifié';
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));

            expect(document.querySelector('.focus-header').classList.contains('editing')).toBe(false);
            expect(HistoryManager.isOpen('focusHeaderEdit')).toBe(false);
            expect(appState.generatedResults[0].prenom).toBe('Jean');
        });

        it('devrait fermer l’ajout rapide et le popover de seuil du Journal (focusJournalQuickAdd / focusJournalThreshold) au bouton Retour', () => {
            document.body.innerHTML = `
                <div id="focusJournalSection">
                    <div id="journalThresholdControl">
                        <button id="journalThresholdBtn"></button>
                    </div>
                    <div id="focusJournalContent">
                        <div id="journalDraftPreview">
                            <textarea id="journalNoteInput"></textarea>
                            <button id="journalDraftSaveBtn" disabled><span>Enregistrer</span></button>
                        </div>
                    </div>
                </div>
            `;
            FocusPanelJournal.init({ getCurrentStudentId: () => 's1' });

            FocusPanelJournal.toggleQuickAdd(true, true);
            expect(FocusPanelJournal.isEditing()).toBe(true);
            expect(HistoryManager.isOpen('focusJournalQuickAdd')).toBe(true);

            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            expect(HistoryManager.isOpen('focusJournalQuickAdd')).toBe(false);

            document.getElementById('journalThresholdBtn').click();
            expect(document.getElementById('journalThresholdControl').classList.contains('open')).toBe(true);
            expect(HistoryManager.isOpen('focusJournalThreshold')).toBe(true);

            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            expect(document.getElementById('journalThresholdControl').classList.contains('open')).toBe(false);
            expect(HistoryManager.isOpen('focusJournalThreshold')).toBe(false);
        });

        it('devrait fermer la modale d’installation PWA (pwaModalOverlay) au bouton Retour', () => {
            PwaInstallManager._showIOSInstallModal();
            expect(document.getElementById('pwaModalOverlay')).not.toBeNull();
            expect(HistoryManager.isOpen('pwaModalOverlay')).toBe(true);

            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            expect(HistoryManager.isOpen('pwaModalOverlay')).toBe(false);
            expect(document.getElementById('pwaModalOverlay').classList.contains('visible')).toBe(false);
        });

        it('devrait gérer les étapes multiples d’un Wizard (1 -> 2 -> 3 -> Retour -> 2 -> Retour -> 1 -> Retour -> Fermer) sans pushState pendant popstate', () => {
            HistoryManager.init();
            const pushSpy = vi.spyOn(history, 'pushState');
            const backSpy = vi.spyOn(history, 'back').mockImplementation(() => {});

            let currentStep = 1;
            const closeModalCb = vi.fn();
            const prevStepCb = vi.fn(() => {
                if (currentStep > 1) currentStep--;
            });

            // Ouverture de la modale à l'étape 1
            HistoryManager.pushState('importWizardModal', closeModalCb);
            // Passage 1 -> 2 puis 2 -> 3
            currentStep = 2;
            HistoryManager.pushState('importWizardStep', prevStepCb);
            currentStep = 3;
            HistoryManager.pushState('importWizardStep', prevStepCb);

            expect(HistoryManager.getStack().map(s => s.id)).toEqual(['importWizardModal', 'importWizardStep']);
            expect(HistoryManager.getStack()[1].steps).toBe(2);
            expect(pushSpy).toHaveBeenCalledTimes(3);

            pushSpy.mockClear();

            // 1er Retour mobile : étape 3 -> 2 (sans ré-empiler pendant popstate)
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            expect(currentStep).toBe(2);
            expect(HistoryManager.isOpen('importWizardStep')).toBe(true);
            expect(HistoryManager.getStack()[1].steps).toBe(1);
            expect(pushSpy).not.toHaveBeenCalled();
            expect(closeModalCb).not.toHaveBeenCalled();

            // 2e Retour mobile : étape 2 -> 1 (dépile importWizardStep)
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            expect(currentStep).toBe(1);
            expect(HistoryManager.isOpen('importWizardStep')).toBe(false);
            expect(pushSpy).not.toHaveBeenCalled();
            expect(closeModalCb).not.toHaveBeenCalled();

            // 3e Retour mobile : ferme la modale
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            expect(closeModalCb).toHaveBeenCalledWith({ causedByHistory: true });
            expect(HistoryManager.getStack().length).toBe(0);
            expect(backSpy).not.toHaveBeenCalled();
        });

        it('devrait supporter le recul partiel (stepCount: 1) et la fermeture complète depuis l’étape 3 d’un Wizard', () => {
            HistoryManager.init();
            const backSpy = vi.spyOn(history, 'back').mockImplementation(() => {});
            const prevStepCb = vi.fn();

            HistoryManager.pushState('importWizardStep', prevStepCb);
            HistoryManager.pushState('importWizardStep', prevStepCb);
            HistoryManager.pushState('importWizardStep', prevStepCb);
            expect(HistoryManager.getStack()[0].steps).toBe(3);

            // Bouton UI "Précédent" (4 -> 3) : décrémente d'1 cran
            HistoryManager.handleManualClose('importWizardStep', { stepCount: 1 });
            expect(HistoryManager.isOpen('importWizardStep')).toBe(true);
            expect(HistoryManager.getStack()[0].steps).toBe(2);
            expect(backSpy).toHaveBeenCalledTimes(1);

            backSpy.mockClear();

            // Fermeture complète depuis l'étape 3 : dépile les 2 étapes restantes
            HistoryManager.handleManualClose('importWizardStep');
            expect(HistoryManager.isOpen('importWizardStep')).toBe(false);
            expect(backSpy).toHaveBeenCalledTimes(2);
        });

        it('devrait remplacer l’entrée d’historique (replaceState) sans history.back lors d’un handoff menu -> modale (replaceNext: true)', () => {
            HistoryManager.init();
            const backSpy = vi.spyOn(history, 'back').mockImplementation(() => {});
            const replaceSpy = vi.spyOn(history, 'replaceState');
            const pushSpy = vi.spyOn(history, 'pushState');

            HistoryManager.pushState('headerMenu', vi.fn());
            pushSpy.mockClear();
            replaceSpy.mockClear();

            HistoryManager.handleManualClose('headerMenu', { replaceNext: true });
            HistoryManager.pushState('appSettingsModal', vi.fn());

            expect(backSpy).not.toHaveBeenCalled();
            expect(pushSpy).not.toHaveBeenCalled();
            expect(replaceSpy).toHaveBeenCalledWith(
                expect.objectContaining({ uiOpen: true, uiId: 'appSettingsModal' }),
                '',
                ''
            );
            expect(HistoryManager.getStack().map(s => s.id)).toEqual(['appSettingsModal']);
        });
    });
});
