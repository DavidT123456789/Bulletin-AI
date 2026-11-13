import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initHeroMockup } from './main.js';

const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf-8');

function mountLandingHero() {
    const parser = new DOMParser();
    const doc = parser.parseFromString(indexHtml, 'text/html');
    const hero = doc.getElementById('hero');
    document.body.innerHTML = '';
    document.body.appendChild(hero);
}

describe('Landing Hero Mockup — Bouton Copier', () => {
    let writeTextMock;

    beforeEach(() => {
        vi.useFakeTimers();

        global.IntersectionObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
        global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

        writeTextMock = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: writeTextMock }
        });

        mountLandingHero();
        initHeroMockup();
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('ne mute ni ne recrée les nœuds du bouton Copier lors des clics sur les tons, élèves ou retouches', async () => {
        const copyBtn = document.getElementById('mockup-copy-btn');
        const copySvg = copyBtn.querySelector('.mockup-copy-icon--copy');
        const checkSvg = copyBtn.querySelector('.mockup-copy-icon--check');
        const label = copyBtn.querySelector('.mockup-copy-label');

        const mutations = [];
        const observer = new MutationObserver((records) => {
            mutations.push(...records);
        });
        observer.observe(copyBtn, { childList: true, subtree: true, attributes: true, characterData: true });

        document.querySelector('[data-mockup-tone="neutre"]').click();
        document.querySelector('[data-mockup-tone="exigeant"]').click();
        document.querySelector('[data-mockup-tone="bienveillant"]').click();
        document.querySelector('[data-mockup-refine="concise"]').click();
        document.querySelector('[data-mockup-refine="polish"]').click();
        document.querySelector('[data-mockup-student="sophie"]').click();
        document.querySelector('[data-mockup-student="lucas"]').click();

        await Promise.resolve();
        observer.disconnect();

        expect(mutations).toHaveLength(0);
        expect(copyBtn.querySelector('.mockup-copy-icon--copy')).toBe(copySvg);
        expect(copyBtn.querySelector('.mockup-copy-icon--check')).toBe(checkSvg);
        expect(copyBtn.querySelector('.mockup-copy-label')).toBe(label);
        expect(copyBtn.classList.contains('is-copied')).toBe(false);
        expect(label.textContent).toBe('Copier');
    });

    it('bascule Copier -> Copié -> Copier sans recréer les icônes SVG et copie le texte actif', () => {
        const copyBtn = document.getElementById('mockup-copy-btn');
        const copySvg = copyBtn.querySelector('.mockup-copy-icon--copy');
        const checkSvg = copyBtn.querySelector('.mockup-copy-icon--check');
        const label = copyBtn.querySelector('.mockup-copy-label');

        document.querySelector('[data-mockup-tone="exigeant"]').click();
        document.querySelector('[data-mockup-refine="concise"]').click();
        copyBtn.click();

        expect(writeTextMock).toHaveBeenCalledTimes(1);
        expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('bavardages doivent cesser'));
        expect(copyBtn.classList.contains('is-copied')).toBe(true);
        expect(label.textContent).toBe('Copié');
        expect(copyBtn.querySelector('.mockup-copy-icon--copy')).toBe(copySvg);
        expect(copyBtn.querySelector('.mockup-copy-icon--check')).toBe(checkSvg);

        vi.advanceTimersByTime(1600);

        expect(copyBtn.classList.contains('is-copied')).toBe(false);
        expect(label.textContent).toBe('Copier');
        expect(copyBtn.querySelector('.mockup-copy-icon--copy')).toBe(copySvg);
        expect(copyBtn.querySelector('.mockup-copy-icon--check')).toBe(checkSvg);
    });

    it('réinitialise immédiatement l état Copié au changement de ton et annule le minuteur précédent', () => {
        const copyBtn = document.getElementById('mockup-copy-btn');
        const label = copyBtn.querySelector('.mockup-copy-label');

        copyBtn.click();
        expect(copyBtn.classList.contains('is-copied')).toBe(true);

        vi.advanceTimersByTime(1000);
        document.querySelector('[data-mockup-tone="neutre"]').click();

        expect(copyBtn.classList.contains('is-copied')).toBe(false);
        expect(label.textContent).toBe('Copier');

        // Un second clic juste après ne doit pas être écrasé à t=1600ms par l'ancien timer
        copyBtn.click();
        vi.advanceTimersByTime(700);
        expect(copyBtn.classList.contains('is-copied')).toBe(true);

        vi.advanceTimersByTime(900);
        expect(copyBtn.classList.contains('is-copied')).toBe(false);
    });

    it('gère sans erreur un presse-papiers indisponible ou en échec', async () => {
        const copyBtn = document.getElementById('mockup-copy-btn');

        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
        });
        expect(() => copyBtn.click()).not.toThrow();
        await Promise.resolve();
        expect(copyBtn.classList.contains('is-copied')).toBe(true);

        vi.advanceTimersByTime(1600);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: undefined
        });
        expect(() => copyBtn.click()).not.toThrow();
        expect(copyBtn.classList.contains('is-copied')).toBe(true);
    });
});
