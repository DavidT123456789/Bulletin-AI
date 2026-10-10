import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HistoryManager } from './HistoryManager.js';

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
});
