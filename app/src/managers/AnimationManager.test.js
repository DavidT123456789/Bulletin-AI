/**
 * @fileoverview Tests unitaires à haut ROI pour AnimationManager.animateHtmlReveal
 * Protège contre les conditions de course lors d'appels concurrents ou annulés (ex. changement rapide de version d'historique).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnimationManager } from './AnimationManager.js';

describe('AnimationManager.animateHtmlReveal', () => {
    let container;

    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        AnimationManager.cancelHtmlReveal(container);
        container.remove();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('affiche toujours la dernière version quand un second animateHtmlReveal supplante le premier en cours d\'animation', async () => {
        const firstPromise = AnimationManager.animateHtmlReveal(container, 'Version 1 ancienne en cours d apparition.');
        // Laisse fadeOutSkeleton (microtâche) injecter les spans de la version 1
        await Promise.resolve();
        await Promise.resolve();
        expect(container.classList.contains('progressive-reveal-container')).toBe(true);
        expect(container.textContent).toBe('Version 1 ancienne en cours d apparition.');

        // Changement de version pendant l'animation de la version 1
        const secondPromise = AnimationManager.animateHtmlReveal(container, 'Version 2 finale attendue.');

        // La première animation doit retourner false sans annuler la seconde
        await expect(firstPromise).resolves.toBe(false);

        // Laisse la seconde animation aller jusqu'au bout
        await vi.runAllTimersAsync();
        await expect(secondPromise).resolves.toBe(true);

        expect(container.innerHTML).toBe('Version 2 finale attendue.');
        expect(container.classList.contains('progressive-reveal-container')).toBe(false);
        expect(container._activeRevealId).toBeNull();
        expect(container._cancelHtmlReveal).toBeNull();
    });

    it('gère une rafale synchrone de 4 appels consécutifs (avant même la fin de fadeOutSkeleton) sans corrompre le rendu final', async () => {
        const p1 = AnimationManager.animateHtmlReveal(container, 'V1');
        const p2 = AnimationManager.animateHtmlReveal(container, 'V2');
        const p3 = AnimationManager.animateHtmlReveal(container, 'V3');
        const p4 = AnimationManager.animateHtmlReveal(container, 'Version finale 4');

        await vi.runAllTimersAsync();

        expect(await p1).toBe(false);
        expect(await p2).toBe(false);
        expect(await p3).toBe(false);
        expect(await p4).toBe(true);
        expect(container.innerHTML).toBe('Version finale 4');
        expect(container.classList.contains('progressive-reveal-container')).toBe(false);
    });

    it('annule proprement pendant fadeOutSkeleton si un nouvel appel ou AbortSignal survient', async () => {
        container.innerHTML = '<div class="appreciation-skeleton"></div>';
        const controller = new AbortController();

        const firstPromise = AnimationManager.animateHtmlReveal(container, 'Texte annulé', { signal: controller.signal });
        controller.abort();

        await expect(firstPromise).resolves.toBe(false);
        expect(container._activeRevealId).toBeNull();
        expect(container.classList.contains('progressive-reveal-container')).toBe(false);

        // Un appel ultérieur après annulation fonctionne normalement
        const secondPromise = AnimationManager.animateHtmlReveal(container, 'Texte conservé');
        await vi.runAllTimersAsync();
        await expect(secondPromise).resolves.toBe(true);
        expect(container.innerHTML).toBe('Texte conservé');
    });

    it('gère les cas limites (conteneur null, signal déjà avorté, prefers-reduced-motion)', async () => {
        expect(await AnimationManager.animateHtmlReveal(null, 'Test')).toBe(false);

        const aborted = new AbortController();
        aborted.abort();
        expect(await AnimationManager.animateHtmlReveal(container, 'Ignoré', { signal: aborted.signal })).toBe(false);

        const originalMatchMedia = window.matchMedia;
        window.matchMedia = vi.fn().mockReturnValue({ matches: true });
        try {
            const done = await AnimationManager.animateHtmlReveal(container, 'Instantané');
            expect(done).toBe(true);
            expect(container.innerHTML).toBe('Instantané');
        } finally {
            window.matchMedia = originalMatchMedia;
        }
    });
});
