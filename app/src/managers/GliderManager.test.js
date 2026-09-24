/**
 * @fileoverview Tests unitaires pour GliderManager
 * @module managers/GliderManager.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GliderManager } from './GliderManager.js';

describe('GliderManager', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('devrait positionner le glider sur l\'élément avec la classe .active', () => {
        const container = document.createElement('div');
        container.className = 'ui-segmented-control';

        const btn1 = document.createElement('button');
        btn1.className = 'seg-btn';
        Object.defineProperty(btn1, 'offsetWidth', { value: 60, configurable: true });
        Object.defineProperty(btn1, 'offsetLeft', { value: 0, configurable: true });

        const btn2 = document.createElement('button');
        btn2.className = 'seg-btn active';
        Object.defineProperty(btn2, 'offsetWidth', { value: 80, configurable: true });
        Object.defineProperty(btn2, 'offsetLeft', { value: 60, configurable: true });

        const glider = document.createElement('div');
        glider.className = 'ui-glider';

        container.appendChild(glider);
        container.appendChild(btn1);
        container.appendChild(btn2);
        document.body.appendChild(container);

        GliderManager.update(container, false);

        expect(glider.style.width).toBe('80px');
        expect(glider.style.left).toBe('60px');
    });

    it('devrait positionner le glider sur le radio coché', () => {
        const container = document.createElement('div');
        container.className = 'ui-segmented-control';

        const radio1 = document.createElement('input');
        radio1.type = 'radio';
        radio1.id = 'opt1';
        radio1.name = 'opt';

        const label1 = document.createElement('label');
        label1.htmlFor = 'opt1';
        Object.defineProperty(label1, 'offsetWidth', { value: 50, configurable: true });
        Object.defineProperty(label1, 'offsetLeft', { value: 0, configurable: true });

        const radio2 = document.createElement('input');
        radio2.type = 'radio';
        radio2.id = 'opt2';
        radio2.name = 'opt';
        radio2.checked = true;

        const label2 = document.createElement('label');
        label2.htmlFor = 'opt2';
        Object.defineProperty(label2, 'offsetWidth', { value: 70, configurable: true });
        Object.defineProperty(label2, 'offsetLeft', { value: 50, configurable: true });

        const glider = document.createElement('div');
        glider.className = 'ui-glider';

        container.appendChild(glider);
        container.appendChild(radio1);
        container.appendChild(label1);
        container.appendChild(radio2);
        container.appendChild(label2);
        document.body.appendChild(container);

        GliderManager.update(container, true);

        expect(glider.style.width).toBe('70px');
        expect(glider.style.left).toBe('50px');
    });

    it('devrait retenter une fois en requestAnimationFrame si la largeur initiale est 0 mais le conteneur visible', () => {
        const container = document.createElement('div');
        container.className = 'ui-segmented-control visible';
        Object.defineProperty(container, 'offsetWidth', { value: 120, configurable: true });

        const btn = document.createElement('button');
        btn.className = 'active';
        let width = 0;
        Object.defineProperty(btn, 'offsetWidth', { get: () => width, configurable: true });
        Object.defineProperty(btn, 'offsetLeft', { value: 10, configurable: true });

        const glider = document.createElement('div');
        glider.className = 'ui-glider';

        container.appendChild(glider);
        container.appendChild(btn);
        document.body.appendChild(container);

        let rafCallback;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            rafCallback = cb;
            return 1;
        });

        GliderManager.update(container, false);

        expect(glider.style.width).toBe('0px');
        expect(rafCallback).toBeDefined();

        // Simuler l'apparition / le calcul de dimensions après reflow
        width = 90;
        rafCallback();

        expect(glider.style.width).toBe('90px');
        expect(glider.style.left).toBe('10px');
    });

    it('devrait mettre la largeur à 0 si aucun élément actif n\'est trouvé', () => {
        const container = document.createElement('div');
        container.className = 'ui-segmented-control';
        const glider = document.createElement('div');
        glider.className = 'ui-glider';
        container.appendChild(glider);

        GliderManager.update(container);
        expect(glider.style.width).toBe('0px');
    });

    it('devrait gérer gracieusement un conteneur null ou sans glider', () => {
        expect(() => GliderManager.update(null)).not.toThrow();
        const emptyContainer = document.createElement('div');
        expect(() => GliderManager.update(emptyContainer)).not.toThrow();
    });
});
