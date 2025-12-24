/**
 * @fileoverview Tests unitaires pour RateLimiter
 * @module utils/RateLimiter.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock des dépendances avant l'import
vi.mock('../config/models.js', () => ({
    RATE_LIMITS: {
        'gemini-2.5-flash': { delayMs: 2000, rpm: 30 },
        'openai-gpt-4o-mini': { delayMs: 500, rpm: 60 },
        'default': { delayMs: 1000, rpm: 30 }
    }
}));

vi.mock('../state/State.js', () => ({
    appState: {
        currentAIModel: 'gemini-2.5-flash'
    }
}));

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: vi.fn(key => store[key] || null),
        setItem: vi.fn((key, value) => { store[key] = value; }),
        removeItem: vi.fn(key => { delete store[key]; }),
        clear: vi.fn(() => { store = {}; })
    };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Import après les mocks
import { RateLimiter } from './RateLimiter.js';

describe('RateLimiter', () => {
    beforeEach(() => {
        // Reset l'état entre chaque test
        RateLimiter.reset();
        RateLimiter.resetAdaptiveDelays();
        localStorageMock.clear();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getDelayForModel', () => {
        it('retourne le délai configuré pour un modèle connu', () => {
            const delay = RateLimiter.getDelayForModel('gemini-2.5-flash');
            expect(delay).toBe(2000);
        });

        it('retourne le délai par défaut pour un modèle inconnu', () => {
            const delay = RateLimiter.getDelayForModel('modele-inconnu');
            expect(delay).toBe(1000);
        });

        it('retourne le délai adaptatif si configuré', () => {
            // Simuler un délai adaptatif en appelant markError429
            RateLimiter.markError429('gemini-2.5-flash', '');
            const delay = RateLimiter.getDelayForModel('gemini-2.5-flash');
            // Le délai devrait être doublé (2000 * 2 = 4000)
            expect(delay).toBe(4000);
        });
    });

    describe('getWaitTime', () => {
        it('retourne 0 si aucune requête précédente', () => {
            const waitTime = RateLimiter.getWaitTime('openai-gpt-4o-mini');
            expect(waitTime).toBe(0);
        });

        it('retourne le temps restant après une requête', async () => {
            // Marquer une requête
            RateLimiter.markSuccess('openai-gpt-4o-mini');

            // Attendre un peu
            await new Promise(resolve => setTimeout(resolve, 100));

            // Le temps d'attente devrait être ~400ms (500 - 100)
            const waitTime = RateLimiter.getWaitTime('openai-gpt-4o-mini');
            expect(waitTime).toBeGreaterThan(300);
            expect(waitTime).toBeLessThan(500);
        });
    });

    describe('waitIfNeeded', () => {
        it('n\'attend pas si aucune requête précédente', async () => {
            const start = Date.now();
            await RateLimiter.waitIfNeeded('openai-gpt-4o-mini');
            const elapsed = Date.now() - start;

            expect(elapsed).toBeLessThan(100);
        });

        it('appelle le callback onWait quand il faut attendre', async () => {
            // D'abord marquer une requête
            RateLimiter.markSuccess('openai-gpt-4o-mini');

            const onWait = vi.fn();

            // Utiliser un mock pour éviter d'attendre vraiment
            vi.spyOn(RateLimiter, 'sleep').mockResolvedValue();

            await RateLimiter.waitIfNeeded('openai-gpt-4o-mini', onWait);

            expect(onWait).toHaveBeenCalled();
            expect(onWait.mock.calls[0][0]).toBeGreaterThan(0);
        });
    });

    describe('markSuccess', () => {
        it('incrémente le compteur de succès', () => {
            RateLimiter.markSuccess('gemini-2.5-flash');
            const stats = RateLimiter.getStats('gemini-2.5-flash');
            expect(stats.successStreak).toBe(1);
        });

        it('réduit le délai après plusieurs succès consécutifs', () => {
            const model = 'gemini-2.5-flash';
            const initialDelay = RateLimiter.getDelayForModel(model);

            // 3 succès = seuil par défaut
            for (let i = 0; i < 3; i++) {
                RateLimiter.markSuccess(model);
            }

            const newDelay = RateLimiter.getDelayForModel(model);
            expect(newDelay).toBeLessThan(initialDelay);
        });
    });

    describe('markError429', () => {
        it('double le délai après une erreur 429', () => {
            const model = 'openai-gpt-4o-mini';
            const initialDelay = RateLimiter.getBaseDelayForModel(model);

            RateLimiter.markError429(model, '');

            const newDelay = RateLimiter.getDelayForModel(model);
            expect(newDelay).toBe(initialDelay * 2);
        });

        it('utilise le temps suggéré par l\'API si disponible', () => {
            const model = 'openai-gpt-4o-mini';
            RateLimiter.markError429(model, 'Rate limit exceeded. Please retry in 5.5s');

            // Le délai est plafonné à 5x la base (500ms * 5 = 2500ms)
            // Donc même si l'API suggère 5.5s, le max est 2500ms
            const newDelay = RateLimiter.getDelayForModel(model);
            expect(newDelay).toBe(2500);
        });

        it('reset le compteur de succès', () => {
            const model = 'gemini-2.5-flash';
            RateLimiter.markSuccess(model);
            RateLimiter.markSuccess(model);

            expect(RateLimiter.getStats(model).successStreak).toBe(2);

            RateLimiter.markError429(model, '');

            expect(RateLimiter.getStats(model).successStreak).toBe(0);
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

    describe('estimateTime', () => {
        it('calcule le temps total pour N requêtes', () => {
            const estimate = RateLimiter.estimateTime(5, 'gemini-2.5-flash');

            // 5 * (2000 délai + 2000 génération) = 20000ms = 20s
            expect(estimate.totalMs).toBe(20000);
            expect(estimate.perItemMs).toBe(4000);
            expect(estimate.delayMs).toBe(2000);
        });

        it('utilise le modèle actuel par défaut', () => {
            const estimate = RateLimiter.estimateTime(1);
            expect(estimate.delayMs).toBe(2000); // gemini-2.5-flash
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
            RateLimiter.markSuccess('gemini-2.5-flash');
            RateLimiter.markSuccess('openai-gpt-4o-mini');

            RateLimiter.reset('gemini-2.5-flash');

            expect(RateLimiter.getWaitTime('gemini-2.5-flash')).toBe(0);
            expect(RateLimiter.getWaitTime('openai-gpt-4o-mini')).toBeGreaterThan(0);
        });

        it('reset tous les modèles sans argument', () => {
            RateLimiter.markSuccess('gemini-2.5-flash');
            RateLimiter.markSuccess('openai-gpt-4o-mini');

            RateLimiter.reset();

            expect(RateLimiter.getWaitTime('gemini-2.5-flash')).toBe(0);
            expect(RateLimiter.getWaitTime('openai-gpt-4o-mini')).toBe(0);
        });
    });

    describe('persistance localStorage', () => {
        it('sauvegarde les délais adaptatifs', () => {
            RateLimiter.markError429('gemini-2.5-flash', '');

            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                'bulletinAI_adaptiveRateLimits',
                expect.any(String)
            );
        });

        it('charge les délais au reset', () => {
            localStorageMock.getItem.mockReturnValueOnce(
                JSON.stringify({ 'gemini-2.5-flash': 5000 })
            );

            // Forcer le rechargement
            RateLimiter._loadAdaptiveDelays();

            // Le délai devrait être chargé depuis localStorage
            expect(RateLimiter.getDelayForModel('gemini-2.5-flash')).toBe(5000);
        });
    });

    describe('getStats', () => {
        it('retourne les statistiques complètes', () => {
            RateLimiter.markSuccess('gemini-2.5-flash');
            RateLimiter.markSuccess('gemini-2.5-flash');

            const stats = RateLimiter.getStats('gemini-2.5-flash');

            expect(stats).toMatchObject({
                model: 'gemini-2.5-flash',
                baseDelay: 2000,
                successStreak: 2,
                isAdapted: false,
            });
        });
    });
});
