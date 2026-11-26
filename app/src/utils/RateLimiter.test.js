/**
 * @fileoverview Tests unitaires pour RateLimiter (version réactive)
 * @module utils/RateLimiter.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock des dépendances avant l'import - plus besoin de RATE_LIMITS
vi.mock('../state/State.js', () => ({
    appState: {
        currentAIModel: 'gemini-2.5-flash'
    }
}));

// Import après les mocks
import { RateLimiter } from './RateLimiter.js';

describe('RateLimiter (réactif)', () => {
    beforeEach(() => {
        // Reset l'état entre chaque test
        RateLimiter.reset();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getWaitTime', () => {
        it('retourne 0 si aucune requête précédente et pas de backoff', () => {
            const waitTime = RateLimiter.getWaitTime('openai-gpt-4o-mini');
            expect(waitTime).toBe(0);
        });

        it('retourne le temps minimum après une requête récente', async () => {
            RateLimiter.markSuccess('openai-gpt-4o-mini');

            // Juste après une requête, on doit attendre le délai minimum
            const waitTime = RateLimiter.getWaitTime('openai-gpt-4o-mini');
            expect(waitTime).toBeGreaterThanOrEqual(0);
            expect(waitTime).toBeLessThanOrEqual(RateLimiter.MIN_DELAY_MS);
        });

        it('retourne 0 après le délai minimum écoulé', async () => {
            RateLimiter.markSuccess('test-model');

            // Simuler l'écoulement du temps
            await new Promise(resolve => setTimeout(resolve, RateLimiter.MIN_DELAY_MS + 50));

            const waitTime = RateLimiter.getWaitTime('test-model');
            expect(waitTime).toBe(0);
        });
    });

    describe('waitIfNeeded', () => {
        it('n\'attend pas s\'il n\'y a pas de backoff', async () => {
            const start = Date.now();
            await RateLimiter.waitIfNeeded('nouveau-modele');
            const elapsed = Date.now() - start;

            expect(elapsed).toBeLessThan(100);
        });

        it('appelle le callback onWait quand il y a un backoff', async () => {
            // Mock sleep first
            vi.spyOn(RateLimiter, 'sleep').mockResolvedValue();

            // Simuler une erreur 429 pour créer un backoff
            RateLimiter.markError429('test-model', 'retry in 1s');

            const onWait = vi.fn();

            await RateLimiter.waitIfNeeded('test-model', onWait);

            expect(onWait).toHaveBeenCalled();
            expect(onWait.mock.calls[0][0]).toBeGreaterThan(0);
        });
    });

    describe('markSuccess', () => {
        it('réduit progressivement le backoff', () => {
            const model = 'test-model';

            // Créer un backoff
            const initialBackoff = RateLimiter.markError429(model, '');
            expect(RateLimiter.getStats(model).backoff).toBe(initialBackoff);

            // Chaque succès réduit le backoff
            RateLimiter.markSuccess(model);
            const afterOneSuccess = RateLimiter.getStats(model).backoff;
            expect(afterOneSuccess).toBeLessThan(initialBackoff);

            RateLimiter.markSuccess(model);
            const afterTwoSuccesses = RateLimiter.getStats(model).backoff;
            expect(afterTwoSuccesses).toBeLessThan(afterOneSuccess);
        });

        it('le backoff disparaît après suffisamment de succès', () => {
            const model = 'test-model';

            // Créer un petit backoff
            RateLimiter.markError429(model, 'retry in 2s');

            // Suffisamment de succès pour effacer le backoff
            for (let i = 0; i < 10; i++) {
                RateLimiter.markSuccess(model);
            }

            expect(RateLimiter.getStats(model).hasBackoff).toBe(false);
        });
    });

    describe('markError429', () => {
        it('crée un backoff avec la valeur par défaut si pas de retry-after', () => {
            const model = 'test-model';
            const backoff = RateLimiter.markError429(model, 'Generic 429 error');

            expect(backoff).toBe(5000); // Valeur par défaut
            expect(RateLimiter.getStats(model).hasBackoff).toBe(true);
        });

        it('utilise le temps suggéré par l\'API', () => {
            const model = 'test-model';
            const backoff = RateLimiter.markError429(model, 'Please retry in 3.5s');

            // 3.5s + 0.5s marge = 4s
            expect(backoff).toBe(4000);
        });

        it('retourne le backoff configuré', () => {
            const model = 'test-model';
            const backoff = RateLimiter.markError429(model, '');

            expect(typeof backoff).toBe('number');
            expect(backoff).toBeGreaterThan(0);
        });
    });

    describe('extractRetryAfter', () => {
        it('extrait le temps de "Please retry in Xs"', () => {
            const result = RateLimiter.extractRetryAfter('Please retry in 3.5s');
            // 3.5s + 0.5s marge = 4s = 4000ms
            expect(result).toBe(4000);
        });

        it('extrait le temps de messages variés', () => {
            expect(RateLimiter.extractRetryAfter('Rate limit. Retry in 10s')).toBe(10500);
            expect(RateLimiter.extractRetryAfter('retry in 1.5s please')).toBe(2000);
        });

        it('retourne null si pas de temps trouvé', () => {
            expect(RateLimiter.extractRetryAfter('Erreur générique')).toBeNull();
            expect(RateLimiter.extractRetryAfter('')).toBeNull();
        });
    });

    describe('waitForRetryAfter', () => {
        it('attend le temps suggéré par l\'API', async () => {
            vi.spyOn(RateLimiter, 'sleep').mockResolvedValue();
            const onWait = vi.fn();

            const result = await RateLimiter.waitForRetryAfter('retry in 5s', onWait);

            expect(result).toBe(true);
            expect(onWait).toHaveBeenCalledWith(5500); // 5s + 0.5s marge
            expect(RateLimiter.sleep).toHaveBeenCalledWith(5500, null);
        });

        it('retourne false si pas de temps trouvé', async () => {
            const result = await RateLimiter.waitForRetryAfter('Erreur sans temps');
            expect(result).toBe(false);
        });

        it('refuse d\'attendre plus de 2 minutes', async () => {
            const result = await RateLimiter.waitForRetryAfter('retry in 180s');
            expect(result).toBe(false);
        });
    });

    describe('estimateTime', () => {
        it('calcule le temps sans backoff', () => {
            const estimate = RateLimiter.estimateTime(5);

            // 5 * (200ms min + 2000ms génération) = 11000ms
            expect(estimate.totalMs).toBe(5 * (RateLimiter.MIN_DELAY_MS + 2000));
            expect(estimate.hasBackoff).toBe(false);
        });

        it('prend en compte le backoff existant', () => {
            RateLimiter.markError429('test-model', 'retry in 5s');

            const estimate = RateLimiter.estimateTime(5, 'test-model');

            expect(estimate.hasBackoff).toBe(true);
            expect(estimate.perItemMs).toBeGreaterThan(RateLimiter.MIN_DELAY_MS + 2000);
        });
    });

    describe('formatTime', () => {
        it('formate les secondes', () => {
            expect(RateLimiter.formatTime(5000)).toBe('5 sec');
            expect(RateLimiter.formatTime(45000)).toBe('45 sec');
        });

        it('formate les minutes et secondes', () => {
            expect(RateLimiter.formatTime(90000)).toBe('1 min 30 sec');
            expect(RateLimiter.formatTime(120000)).toBe('2 min');
        });

        it('arrondit au supérieur', () => {
            expect(RateLimiter.formatTime(4500)).toBe('5 sec');
        });
    });

    describe('reset', () => {
        it('reset un modèle spécifique', () => {
            RateLimiter.markError429('model-a', '');
            RateLimiter.markError429('model-b', '');

            RateLimiter.reset('model-a');

            expect(RateLimiter.getStats('model-a').hasBackoff).toBe(false);
            expect(RateLimiter.getStats('model-b').hasBackoff).toBe(true);
        });

        it('reset tous les modèles sans argument', () => {
            RateLimiter.markError429('model-a', '');
            RateLimiter.markError429('model-b', '');

            RateLimiter.reset();

            expect(RateLimiter.getStats('model-a').hasBackoff).toBe(false);
            expect(RateLimiter.getStats('model-b').hasBackoff).toBe(false);
        });
    });

    describe('getStats', () => {
        it('retourne les statistiques sans backoff', () => {
            const stats = RateLimiter.getStats('nouveau-modele');

            expect(stats).toMatchObject({
                model: 'nouveau-modele',
                backoff: 0,
                hasBackoff: false,
                backoffFormatted: 'aucun'
            });
        });

        it('retourne les statistiques avec backoff', () => {
            RateLimiter.markError429('test-model', 'retry in 5s');

            const stats = RateLimiter.getStats('test-model');

            expect(stats.model).toBe('test-model');
            expect(stats.hasBackoff).toBe(true);
            expect(stats.backoff).toBeGreaterThan(0);
            expect(stats.backoffFormatted).toMatch(/sec/);
        });
    });

    describe('sleep', () => {
        it('peut être interrompu par AbortSignal', async () => {
            const controller = new AbortController();

            // Démarrer le sleep et l'avorter immédiatement
            const sleepPromise = RateLimiter.sleep(10000, controller.signal);
            controller.abort();

            await expect(sleepPromise).rejects.toThrow('Aborted');
        });

        it('rejette immédiatement si signal déjà avorté', async () => {
            const controller = new AbortController();
            controller.abort();

            await expect(RateLimiter.sleep(1000, controller.signal)).rejects.toThrow('Aborted');
        });
    });
});
