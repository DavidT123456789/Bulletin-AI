/**
 * @fileoverview Tests unitaires pour LazyManagers (déduplication, idempotence, reprise sur erreur, prefetch)
 * @module utils/LazyManagers.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createLazyManagerLoader,
    prefetchOnHover,
    withLazyManager,
    _resetLazyManagersForTests
} from './LazyManagers.js';

describe('LazyManagers', () => {
    beforeEach(() => {
        _resetLazyManagersForTests();
        delete window.TestLazyManager;
        delete window.UI;
    });

    it('déduplique les appels concurrents, n\'appelle init() qu\'une seule fois et expose sur window', async () => {
        const initSpy = vi.fn();
        const managerInstance = { init: initSpy, open: vi.fn() };
        let resolveImport;
        const importFn = vi.fn(() => new Promise((resolve) => {
            resolveImport = resolve;
        }));

        const load = createLazyManagerLoader('TestLazyManager', importFn);

        const p1 = load();
        const p2 = load();
        expect(importFn).toHaveBeenCalledTimes(1);

        resolveImport(managerInstance);
        const [m1, m2] = await Promise.all([p1, p2]);

        expect(m1).toBe(managerInstance);
        expect(m2).toBe(managerInstance);
        expect(window.TestLazyManager).toBe(managerInstance);
        expect(initSpy).toHaveBeenCalledTimes(1);

        const m3 = await load();
        expect(m3).toBe(managerInstance);
        expect(importFn).toHaveBeenCalledTimes(1);
        expect(initSpy).toHaveBeenCalledTimes(1);
    });

    it('permet une nouvelle tentative si le chargement réseau initial échoue', async () => {
        const managerInstance = { init: vi.fn() };
        const importFn = vi.fn()
            .mockRejectedValueOnce(new Error('ChunkLoadError'))
            .mockResolvedValueOnce(managerInstance);

        const load = createLazyManagerLoader('TestLazyManager', importFn);

        await expect(load()).rejects.toThrow('ChunkLoadError');
        const recovered = await load();

        expect(recovered).toBe(managerInstance);
        expect(importFn).toHaveBeenCalledTimes(2);
        expect(managerInstance.init).toHaveBeenCalledTimes(1);
    });

    it('rejette proprement si le module chargé est nul/invalide', async () => {
        const load = createLazyManagerLoader('TestLazyManager', () => Promise.resolve(null));
        await expect(load()).rejects.toThrow('TestLazyManager');
    });

    it('prefetchOnHover déclenche le loader une seule fois sur pointerenter/focus et ignore null/erreurs', async () => {
        expect(() => prefetchOnHover(null, vi.fn())).not.toThrow();

        const btn = document.createElement('button');
        const loader = vi.fn().mockRejectedValue(new Error('offline'));

        prefetchOnHover(btn, loader);
        prefetchOnHover(btn, loader); // Idempotent sur le même élément

        btn.dispatchEvent(new Event('pointerenter'));
        btn.dispatchEvent(new Event('pointerenter'));
        expect(loader).toHaveBeenCalledTimes(1);

        await Promise.resolve();
    });

    it('withLazyManager exécute le callback et notifie l\'utilisateur si le chunk échoue', async () => {
        const showNotification = vi.fn();
        window.UI = { showNotification };
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const manager = { open: vi.fn(() => 'opened') };
        const okResult = await withLazyManager(() => Promise.resolve(manager), (m) => m.open());
        expect(okResult).toBe('opened');
        expect(showNotification).not.toHaveBeenCalled();

        // Sans callback : retourne l'instance directement ; sur module nul : retourne null
        expect(await withLazyManager(() => Promise.resolve(manager))).toBe(manager);
        expect(await withLazyManager(() => Promise.resolve(null), vi.fn())).toBeNull();

        // Échec réseau/chunk : notifie par défaut et retourne null sans rejeter
        const failResult = await withLazyManager(
            () => Promise.reject(new Error('Failed to fetch dynamically imported module')),
            vi.fn()
        );
        expect(failResult).toBeNull();
        expect(showNotification).toHaveBeenCalledTimes(1);
        expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('Impossible de charger'), 'error');

        // Option silent: pas de toast utilisateur
        showNotification.mockClear();
        const silentResult = await withLazyManager(
            () => Promise.reject(new Error('Network offline')),
            vi.fn(),
            { silent: true }
        );
        expect(silentResult).toBeNull();
        expect(showNotification).not.toHaveBeenCalled();

        // Erreur applicative dans onLoaded : se propage sans faux toast réseau
        await expect(
            withLazyManager(() => Promise.resolve(manager), () => {
                throw new Error('Action bug');
            })
        ).rejects.toThrow('Action bug');
        expect(showNotification).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
    });
});
