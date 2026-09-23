/**
 * @fileoverview Unit tests for minimalist RestoreTransitionManager
 * @module managers/RestoreTransitionManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RestoreTransitionManager } from './RestoreTransitionManager.js';
import { ModalUI } from './ModalUIManager.js';

vi.mock('./ModalUIManager.js', () => ({
    ModalUI: {
        closeAllModals: vi.fn()
    }
}));

describe('RestoreTransitionManager', () => {
    let mainWrapper;

    beforeEach(() => {
        document.body.innerHTML = '<div class="main-content-wrapper"></div>';
        document.body.className = '';
        mainWrapper = document.querySelector('.main-content-wrapper');
        sessionStorage.clear();
        vi.useFakeTimers();

        window.App = {
            rehydrateAll: vi.fn().mockResolvedValue(true),
            updateUIOnLoad: vi.fn()
        };
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('devrait appliquer le voile fluide, réhydrater l\'état et nettoyer sans afficher de modale intrusive', async () => {
        const rehydrateSpy = vi.fn().mockResolvedValue(true);

        const promise = RestoreTransitionManager.rehydrateAndTransition({
            onRehydrate: rehydrateSpy
        });

        expect(ModalUI.closeAllModals).toHaveBeenCalled();
        expect(document.body.classList.contains('is-restoring-data')).toBe(true);
        expect(mainWrapper.classList.contains('is-restoring-data')).toBe(true);

        // Advance past dwell timer
        await vi.advanceTimersByTimeAsync(300);
        await promise;

        expect(rehydrateSpy).toHaveBeenCalled();
        expect(document.body.classList.contains('is-restoring-data')).toBe(false);
        expect(mainWrapper.classList.contains('is-restoring-data')).toBe(false);
        expect(RestoreTransitionManager.isActive()).toBe(false);
    });

    it('devrait utiliser App.rehydrateAll par défaut si onRehydrate n\'est pas fourni', async () => {
        const promise = RestoreTransitionManager.rehydrateAndTransition();

        await vi.advanceTimersByTimeAsync(300);
        await promise;

        expect(window.App.rehydrateAll).toHaveBeenCalled();
        expect(document.body.classList.contains('is-restoring-data')).toBe(false);
    });

    it('devrait nettoyer les classes d\'état même si une erreur survient lors de la réhydratation', async () => {
        const failingTask = vi.fn().mockRejectedValue(new Error('Test failure'));

        await expect(
            RestoreTransitionManager.rehydrateAndTransition({ onRehydrate: failingTask })
        ).rejects.toThrow('Test failure');

        expect(document.body.classList.contains('is-restoring-data')).toBe(false);
        expect(mainWrapper.classList.contains('is-restoring-data')).toBe(false);
        expect(RestoreTransitionManager.isActive()).toBe(false);
    });

    it('devrait gérer la transition de rechargement d\'usine', async () => {
        const onBeforeReload = vi.fn();
        const reloadSpy = vi.fn();
        Object.defineProperty(window, 'location', {
            writable: true,
            value: { reload: reloadSpy }
        });

        await RestoreTransitionManager.performReloadTransition({
            onBeforeReload
        });

        expect(document.body.classList.contains('is-restoring-data')).toBe(true);
        expect(onBeforeReload).toHaveBeenCalled();

        vi.advanceTimersByTime(350);
        expect(reloadSpy).toHaveBeenCalled();
    });
});
