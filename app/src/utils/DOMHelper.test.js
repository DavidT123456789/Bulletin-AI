/**
 * @fileoverview Tests unitaires pour DOMHelper (sanitizeHTML, escapeHTML)
 * @module utils/DOMHelper.test
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { DOMHelper } from './DOMHelper.js';

describe('DOMHelper.sanitizeHTML', () => {
    const tooltipOptions = {
        allowedTags: new Set(['STRONG', 'EM', 'B', 'I', 'BR', 'SPAN', 'DIV', 'KBD']),
        sanitizeAttr: (_tag, name, value) => (name === 'class' ? value : null)
    };

    const originalDOMParser = globalThis.DOMParser;

    afterEach(() => {
        globalThis.DOMParser = originalDOMParser;
    });

    it('conserve le formatage riche autorisé et les classes légitimes', () => {
        const input = "<div class='tooltip-note-multiline'><strong>Moyenne (14/20)</strong><br><span class=\"kbd-hint\">Modifier</span></div>";
        const result = DOMHelper.sanitizeHTML(input, tooltipOptions);

        expect(result).toBe('<div class="tooltip-note-multiline"><strong>Moyenne (14/20)</strong><br><span class="kbd-hint">Modifier</span></div>');
    });

    it('supprime intégralement les balises dangereuses (img, script, svg, iframe) et leurs enfants', () => {
        const payload = 'Statut <img src=x onerror="alert(1)"><script>window.__xss=1</script><svg onload="alert(2)"></svg><iframe src="https://evil.test"></iframe>';
        const result = DOMHelper.sanitizeHTML(payload, tooltipOptions);

        expect(result).toBe('Statut ');
        expect(result).not.toMatch(/<img|<script|<svg|<iframe|onerror|onload/i);
    });

    it('retire les attributs non autorisés (onclick, style, href) et déroule les balises non listées', () => {
        const payload = '<span class="kbd-hint" onclick="alert(1)" style="color:red">OK</span> <a href="javascript:alert(2)">Lien</a>';
        const result = DOMHelper.sanitizeHTML(payload, tooltipOptions);

        expect(result).toBe('<span class="kbd-hint">OK</span> Lien');
    });

    it('gère les cas limites (null, undefined, vide, texte brut, chevron non-balise)', () => {
        expect(DOMHelper.sanitizeHTML(null, tooltipOptions)).toBe('');
        expect(DOMHelper.sanitizeHTML(undefined, tooltipOptions)).toBe('');
        expect(DOMHelper.sanitizeHTML('', tooltipOptions)).toBe('');
        expect(DOMHelper.sanitizeHTML('Texte simple 100&nbsp;%', tooltipOptions)).toBe('Texte simple 100&nbsp;%');
        expect(DOMHelper.sanitizeHTML('Observation isolée (< 3×)', tooltipOptions)).toBe('Observation isolée (&lt; 3×)');
    });

    it('bascule sur un échappement HTML complet si DOMParser est indisponible', () => {
        globalThis.DOMParser = undefined;
        const result = DOMHelper.sanitizeHTML('<strong>Test</strong><img src=x onerror=alert(1)>', tooltipOptions);

        expect(result).toBe('&lt;strong&gt;Test&lt;/strong&gt;&lt;img src=x onerror=alert(1)&gt;');
    });
});

describe('DOMHelper.bindInlineEditable', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('capture le texte initial au focusin, annule sur Escape, valide sur Enter sans modificateur et déclenche onCommit au focusout', () => {
        document.body.innerHTML = `<div id="box"><ul><li contenteditable="true">  Texte   initial  </li></ul></div>`;
        const box = document.getElementById('box');
        const li = box.querySelector('li');
        const onCancel = vi.fn();
        const onCommit = vi.fn();

        DOMHelper.bindInlineEditable(box, {
            selector: 'li[contenteditable="true"]',
            onCancel,
            onCommit
        });

        li.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(li._initialTextBeforeEdit).toBe('Texte initial');

        const blurSpy = vi.spyOn(li, 'blur');
        li.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
        li.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
        expect(blurSpy).not.toHaveBeenCalled();

        li.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(blurSpy).toHaveBeenCalledTimes(1);

        li.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(onCancel).toHaveBeenCalledWith(li);

        li.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        expect(onCommit).toHaveBeenCalledWith(li);
    });
});

describe('DOMHelper.runPrintSession', () => {
    it('applique mode/titre/@page, restaure de manière idempotente sur onafterprint et nettoie même si window.print lève une erreur', () => {
        const originalTitle = document.title;
        const prevAfterPrint = vi.fn();
        const setup = vi.fn();
        const cleanup = vi.fn();
        window.onafterprint = prevAfterPrint;

        const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {
            expect(document.title).toBe('Rapport-Test');
            expect(document.body.dataset.printMode).toBe('report');
            expect(document.getElementById('print-dynamic-page-style')?.textContent).toContain('landscape');
        });

        DOMHelper.runPrintSession({
            mode: 'report',
            title: 'Rapport-Test',
            pageCss: '@page { size: landscape; }',
            setup,
            cleanup
        });

        expect(setup).toHaveBeenCalledTimes(1);
        expect(printSpy).toHaveBeenCalledTimes(1);

        // Premier onafterprint restaure tout et invoque l'ancien handler
        window.onafterprint?.();
        expect(document.title).toBe(originalTitle);
        expect(document.body.dataset.printMode).toBeUndefined();
        expect(document.getElementById('print-dynamic-page-style')).toBeNull();
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(prevAfterPrint).toHaveBeenCalledTimes(1);
        expect(window.onafterprint).toBe(prevAfterPrint);

        // Cas d'erreur dans window.print : nettoyage immédiat sans invoquer prevAfterPrint
        const errCleanup = vi.fn();
        printSpy.mockImplementationOnce(() => { throw new Error('print-fail'); });
        expect(() => DOMHelper.runPrintSession({
            mode: 'seating',
            title: 'Plan-Erreur',
            pageCss: '@page { size: landscape; }',
            cleanup: errCleanup
        })).toThrow('print-fail');
        expect(errCleanup).toHaveBeenCalledTimes(1);
        expect(document.body.dataset.printMode).toBeUndefined();
        expect(document.getElementById('print-dynamic-page-style')).toBeNull();
        expect(prevAfterPrint).toHaveBeenCalledTimes(1);

        printSpy.mockRestore();
        window.onafterprint = null;
    });
});
