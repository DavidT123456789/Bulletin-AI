/**
 * @fileoverview Tests unitaires pour FocusPanelHistory
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FocusPanelHistory } from './FocusPanelHistory.js';
import { appState } from '../state/State.js';

vi.mock('../state/State.js', () => ({
    appState: {
        currentPeriod: 'T1',
        generatedResults: []
    }
}));

vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
}));

describe('FocusPanelHistory', () => {
    let mockResult;

    beforeEach(() => {
        appState.currentPeriod = 'T1';
        mockResult = {
            id: 'student-1',
            appreciation: 'Version 1',
            studentData: {
                currentAIModel: 'gemini-2.5-flash',
                periods: {
                    T1: {
                        appreciation: 'Version 1'
                    },
                    T2: {
                        appreciation: ''
                    }
                }
            },
            historyPerPeriod: {}
        };
        appState.generatedResults = [mockResult];

        document.body.innerHTML = `
            <div id="focusHistoryIndicator" class="history-indicator-btn">
                <span class="history-count">0</span>
            </div>
            <div id="focusAppreciationText" class="focus-appreciation-text filled">Version 1</div>
        `;

        FocusPanelHistory.init({
            onContentChange: vi.fn(),
            onHistoryChange: vi.fn()
        });
    });

    afterEach(() => {
        const popover = document.getElementById('historyPopover');
        if (popover) popover.remove();
        document.body.innerHTML = '';
        vi.clearAllMocks();
    });

    it('devrait charger un élève et retourner les infos de version', () => {
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('Version 1', 'original');
        FocusPanelHistory.push('Version 2', 'edit');

        const info = FocusPanelHistory.getCurrentVersionInfo();
        expect(info.total).toBe(2);
        expect(info.current).toBe(2);
        expect(FocusPanelHistory.canUndo()).toBe(true);
        expect(FocusPanelHistory.canRedo()).toBe(false);
    });

    it('ne devrait JAMAIS détruire l\'historique si l\'appréciation est temporairement vide', () => {
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('Version 1', 'original');
        FocusPanelHistory.push('Version 2', 'edit');

        // Simuler que l'utilisateur a effacé le texte
        mockResult.studentData.periods.T1.appreciation = '';
        mockResult.appreciation = '';

        const info = FocusPanelHistory.getCurrentVersionInfo();
        expect(info.total).toBe(2);
        expect(FocusPanelHistory.getVersionCount()).toBe(2);
    });

    it('devrait restaurer la version courante lors d\'un Undo si l\'éditeur a été vidé', () => {
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('Version 1', 'original');
        FocusPanelHistory.push('Version 2', 'edit');

        const textEl = document.getElementById('focusAppreciationText');
        textEl.textContent = '';
        textEl.classList.add('empty');

        FocusPanelHistory.undo();

        // Le texte est restauré et les périodes synchronisées
        expect(mockResult.appreciation).toBe('Version 2');
        expect(mockResult.studentData.periods.T1.appreciation).toBe('Version 2');
    });

    it('devrait basculer l\'affichage du popover (toggle) lors de clics successifs', () => {
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('Version 1', 'original');
        FocusPanelHistory.push('Version 2', 'edit');

        FocusPanelHistory.showPopover();
        expect(document.getElementById('historyPopover')).not.toBeNull();
        const indicator = document.getElementById('focusHistoryIndicator');
        expect(indicator.classList.contains('active')).toBe(true);

        // Deuxième appel : ferme le popover
        FocusPanelHistory.showPopover();
        expect(document.getElementById('historyPopover')).toBeNull();
        expect(indicator.classList.contains('active')).toBe(false);
    });

    it('devrait isoler l\'historique par période', () => {
        mockResult.studentData.periods.T1.appreciation = '';
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('T1 Version 1', 'original');
        FocusPanelHistory.push('T1 Version 2', 'edit');

        expect(FocusPanelHistory.getCurrentVersionInfo().total).toBe(2);

        // Bascule vers T2
        appState.currentPeriod = 'T2';
        FocusPanelHistory.load('student-1');

        expect(FocusPanelHistory.getCurrentVersionInfo().total).toBe(0);

        // Ajout d'une version en T2
        FocusPanelHistory.push('T2 Version 1', 'original');
        expect(FocusPanelHistory.getCurrentVersionInfo().total).toBe(1);

        // Revenir en T1
        appState.currentPeriod = 'T1';
        FocusPanelHistory.load('student-1');
        expect(FocusPanelHistory.getCurrentVersionInfo().total).toBe(2);
    });

    it('devrait associer à chaque type de retouche son icône et sa classe de couleur dédiées dans le popover d\'historique', () => {
        const concise = FocusPanelHistory._getVersionPresentation({ source: 'concise' }, 1);
        const encouraging = FocusPanelHistory._getVersionPresentation({ source: 'encouraging' }, 1);
        const demanding = FocusPanelHistory._getVersionPresentation({ source: 'demanding' }, 1);
        const polish = FocusPanelHistory._getVersionPresentation({ source: 'polish' }, 1);

        expect(concise.icon).toContain('solar:minimize-square-linear');
        expect(concise.typeClass).toBe('source-concise');
        expect(encouraging.icon).toContain('solar:heart-linear');
        expect(encouraging.typeClass).toBe('source-encouraging');
        expect(demanding.title).toBe('Version exigeante');
        expect(demanding.icon).toContain('solar:target-linear');
        expect(demanding.typeClass).toBe('source-demanding');
        expect(polish.icon).toContain('solar:stars-line-linear');
        expect(polish.typeClass).toBe('source-polish');

        const custom = FocusPanelHistory._getVersionPresentation(
            { source: 'custom', customInstruction: 'Insister sur l\'écrit' },
            1
        );
        expect(custom.title).toBe('« Insister sur l\'écrit »');
        expect(custom.icon).toContain('solar:pen-2-linear');
        expect(custom.typeClass).toBe('source-custom');
    });

    it('ne devrait pas déclencher de restauration ni de sauvegarde si l\'utilisateur clique sur la version déjà actuelle', () => {
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('Version 1', 'original');
        FocusPanelHistory.push('Version 2', 'concise');

        FocusPanelHistory._callbacks.onContentChange.mockClear();
        FocusPanelHistory.restoreVersion(1);

        expect(FocusPanelHistory._callbacks.onContentChange).not.toHaveBeenCalled();
    });

    it('devrait échapper les chevrons HTML dans l\'aperçu du popover', () => {
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('Version 1', 'original');
        FocusPanelHistory.push('Moyenne < 10/20 mais en progrès > T1', 'edit');

        FocusPanelHistory.showPopover();
        const previews = document.querySelectorAll('#historyPopover .history-version-preview');
        expect(previews[0].textContent).toBe('Moyenne < 10/20 mais en progrès > T1');
    });

    it('coalesce les frappes d’une même session en une seule entrée edit et sauvegarde le brouillon avant undo', () => {
        FocusPanelHistory.load('student-1');
        expect(FocusPanelHistory.getCurrentVersionInfo()).toEqual({ current: 1, total: 1 });

        // Frappe 1 puis frappe 2 dans la même session -> 1 seule nouvelle version 'edit' mise à jour sur place
        FocusPanelHistory.flushEditSession('Version 1 retouchée');
        expect(FocusPanelHistory.getCurrentVersionInfo()).toEqual({ current: 2, total: 2 });
        FocusPanelHistory.flushEditSession('Version 1 retouchée et affinée');
        expect(FocusPanelHistory.getCurrentVersionInfo()).toEqual({ current: 2, total: 2 });
        expect(mockResult.historyPerPeriod.T1.versions[1].content).toBe('Version 1 retouchée et affinée');

        // Revenir au texte exact d'origine retire la version temporaire
        FocusPanelHistory.flushEditSession('Version 1');
        expect(FocusPanelHistory.getCurrentVersionInfo()).toEqual({ current: 1, total: 1 });

        // Ctrl+Z avec frappe non encore committée : canUndoWithPending détecte le brouillon, undo le sauvegarde puis recule
        const textEl = document.getElementById('focusAppreciationText');
        textEl.textContent = 'Version 1 modifiée sans blur';
        expect(FocusPanelHistory.canUndoWithPending(textEl.textContent)).toBe(true);
        FocusPanelHistory.undo();
        expect(FocusPanelHistory.getCurrentVersionInfo()).toEqual({ current: 1, total: 2 });
        expect(mockResult.appreciation).toBe('Version 1');
        expect(FocusPanelHistory.canRedo()).toBe(true);
    });

    it('conserve les variantes IA précédentes quand on applique une nouvelle retouche depuis une version antérieure', () => {
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('Version concise', 'concise');
        FocusPanelHistory.undo(); // retour sur Version 1 (1/2)

        FocusPanelHistory.push('Version encourageante', 'encouraging');
        expect(FocusPanelHistory.getCurrentVersionInfo()).toEqual({ current: 3, total: 3 });
        expect(mockResult.historyPerPeriod.T1.versions.map(v => v.content)).toEqual([
            'Version 1',
            'Version concise',
            'Version encourageante'
        ]);
    });

    it('affiche le stepper en mode récupération (0/1) quand une appréciation unique est effacée et verrouille pendant une génération', async () => {
        const { FocusPanelStatus } = await import('./FocusPanelStatus.js');
        const activeGens = new Map();
        FocusPanelStatus.init({
            getCurrentStudentId: () => 'student-1',
            getActiveGenerations: () => activeGens
        });

        document.body.innerHTML = `
            <div id="historyNavigationGroup" style="display: none;">
                <button type="button" id="focusHistoryPrevBtn" class="history-nav-btn disabled"></button>
                <button type="button" id="focusHistoryIndicator" class="history-indicator-btn"><span class="history-count">0</span></button>
                <button type="button" id="focusHistoryNextBtn" class="history-nav-btn disabled"></button>
            </div>
            <div id="focusAppreciationText" class="focus-appreciation-text filled">Version 1</div>
        `;

        FocusPanelHistory.load('student-1');
        FocusPanelStatus.updateHistoryIndicator();

        const group = document.getElementById('historyNavigationGroup');
        const prevBtn = document.getElementById('focusHistoryPrevBtn');
        const countEl = document.querySelector('#focusHistoryIndicator .history-count');

        // 1 seule version remplie -> masqué
        expect(group.style.display).toBe('none');

        // L'utilisateur efface tout -> visible en 0/1 avec < actif (soft-disabled, jamais native disabled)
        const textEl = document.getElementById('focusAppreciationText');
        textEl.textContent = '';
        textEl.classList.add('empty');
        FocusPanelStatus.updateHistoryIndicator();

        expect(group.style.display).toBe('inline-flex');
        expect(countEl.textContent).toBe('0/1');
        expect(prevBtn.disabled).toBe(false);
        expect(prevBtn.classList.contains('disabled')).toBe(false);

        // Pendant une génération IA -> verrouillé (is-busy + .disabled sans native disabled)
        activeGens.set('student-1', new AbortController());
        FocusPanelStatus.updateHistoryIndicator();
        expect(group.classList.contains('is-busy')).toBe(true);
        expect(prevBtn.classList.contains('disabled')).toBe(true);
        expect(prevBtn.disabled).toBe(false);
    });

    it('rend des boutons accessibles avec compteur de mots, aria-current et fermeture Escape isolée', () => {
        mockResult.studentData.periods.T1.appreciation = '';
        mockResult.appreciation = '';
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('Un', 'original');
        FocusPanelHistory.push('Très bon trimestre en maths', 'concise');
        document.getElementById('focusAppreciationText').textContent = 'Très bon trimestre en maths';

        FocusPanelHistory.showPopover();
        const popover = document.getElementById('historyPopover');
        const items = popover.querySelectorAll('.history-version-item');

        expect(items).toHaveLength(2);
        expect(items[0].tagName).toBe('BUTTON');
        expect(items[0].getAttribute('aria-current')).toBe('true');
        expect(items[1].hasAttribute('aria-current')).toBe(false);

        const metas = [...popover.querySelectorAll('.history-time')].map(el => el.textContent);
        expect(metas[0]).toMatch(/^5 mots · /);
        expect(metas[1]).toMatch(/^1 mot · /);

        // Escape ferme le popover et empêche la fermeture d'une modale / panneau sous-jacent
        const underlyingEscapeSpy = vi.fn();
        document.addEventListener('keydown', underlyingEscapeSpy);
        try {
            const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
            document.dispatchEvent(escEvent);

            expect(document.getElementById('historyPopover')).toBeNull();
            expect(escEvent.defaultPrevented).toBe(true);
            expect(underlyingEscapeSpy).not.toHaveBeenCalled();

            // Une fois fermé, Escape se propage normalement
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            expect(underlyingEscapeSpy).toHaveBeenCalledTimes(1);
        } finally {
            document.removeEventListener('keydown', underlyingEscapeSpy);
        }
    });

    it('applique place-above quand le déclencheur est dans la moitié inférieure du viewport', () => {
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('Version 1', 'original');
        FocusPanelHistory.push('Version 2', 'edit');

        const indicator = document.getElementById('focusHistoryIndicator');
        vi.spyOn(indicator, 'getBoundingClientRect').mockReturnValue({
            top: 620,
            bottom: 646,
            left: 500,
            right: 540,
            width: 40,
            height: 26
        });

        FocusPanelHistory.showPopover();
        const popover = document.getElementById('historyPopover');
        expect(popover.classList.contains('place-above')).toBe(true);
        expect(popover.style.bottom).not.toBe('');
        expect(popover.style.top).toBe('');
    });

    it('réinitialise le statut copié de la période lors de la restauration d\'une version antérieure', () => {
        FocusPanelHistory.load('student-1');
        FocusPanelHistory.push('Version 1', 'original');
        FocusPanelHistory.push('Version 2', 'concise');
        mockResult.copied = true;
        mockResult.studentData.periods.T1.copied = true;

        FocusPanelHistory.restoreVersion(0);

        expect(mockResult.copied).toBe(false);
        expect(mockResult.studentData.periods.T1.copied).toBe(false);
    });

    it('ne corrompt pas l\'historique et affiche la bonne version lors d\'un double undo ou d\'une ouverture popover pendant l\'animation', () => {
        vi.useFakeTimers();
        try {
            mockResult.wasGenerated = true;
            mockResult.appreciationSource = 'ai';
            FocusPanelHistory.load('student-1');
            FocusPanelHistory.push('Version 2 concise', 'concise');
            FocusPanelHistory.push('Version 3 encourageante', 'encouraging');
            document.getElementById('focusAppreciationText').textContent = 'Version 3 encourageante';

            // 1er undo -> lance la phase de sortie (180ms), DOM contient encore Version 3
            FocusPanelHistory.undo();
            expect(FocusPanelHistory.getCurrentVersionInfo()).toEqual({ current: 2, total: 3 });

            // 2e undo avant la fin des 180ms -> doit descendre à 1/3 sans enregistrer Version 3 comme édition manuelle
            vi.advanceTimersByTime(60);
            FocusPanelHistory.undo();
            expect(FocusPanelHistory.getCurrentVersionInfo()).toEqual({ current: 1, total: 3 });
            expect(mockResult.historyPerPeriod.T1.versions.map(v => v.source)).toEqual(['original', 'concise', 'encouraging']);
            expect(document.getElementById('focusAppreciationText').textContent).toBe('Version 1');

            // Ouverture du popover pendant la phase d'entrée ne doit pas non plus ajouter d'entrée fantôme
            FocusPanelHistory.showPopover();
            expect(mockResult.historyPerPeriod.T1.versions).toHaveLength(3);
            FocusPanelHistory.closePopover();

            vi.runAllTimers();
            expect(document.getElementById('focusAppreciationText').textContent).toBe('Version 1');
            expect(document.getElementById('focusAppreciationText').classList.contains('history-animating')).toBe(false);
        } finally {
            FocusPanelHistory.reset();
            vi.useRealTimers();
        }
    });

    it('annule l\'animation d\'historique en cours si l\'enseignant change d\'élève pendant les 180ms de transition', () => {
        vi.useFakeTimers();
        try {
            const student2 = {
                id: 'student-2',
                appreciation: 'Appréciation Élève 2',
                studentData: { periods: { T1: { appreciation: 'Appréciation Élève 2' } } },
                historyPerPeriod: {}
            };
            appState.generatedResults.push(student2);

            FocusPanelHistory.load('student-1');
            FocusPanelHistory.push('Version 2 Élève 1', 'concise');
            const textEl = document.getElementById('focusAppreciationText');
            textEl.textContent = 'Version 2 Élève 1';

            // Lance un undo sur Élève 1 (timer 180ms en cours), puis bascule immédiatement sur Élève 2
            FocusPanelHistory.undo();
            FocusPanelHistory.load('student-2');
            textEl.textContent = 'Appréciation Élève 2';

            vi.runAllTimers();
            expect(textEl.textContent).toBe('Appréciation Élève 2');
        } finally {
            FocusPanelHistory.reset();
            vi.useRealTimers();
        }
    });
});
