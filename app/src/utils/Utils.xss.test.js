import { describe, it, expect } from 'vitest';
import { Utils } from './Utils.js';
import { JournalManager } from '../managers/JournalManager.js';
import { StudentPhotoManager } from '../managers/StudentPhotoManager.js';

describe('Utils & Managers — Protection XSS (T-05 / Bug B-04)', () => {
    it('Utils.escapeHtml échappe correctement les 5 caractères spéciaux HTML', () => {
        const raw = `<img src="x" onerror='alert(1)'> & </script>`;
        const escaped = Utils.escapeHtml(raw);
        expect(escaped).toBe('&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt; &amp; &lt;/script&gt;');
    });

    // TODO(Lot 4): Retirer .fails une fois le bug corrigé
    it.fails('T-05 (Bug B-04) : neutralise les 4 vecteurs XSS dans Utils.cleanMarkdown, JournalManager.renderTimeline et StudentPhotoManager.getAvatarHTML tout en préservant le formatage <strong>', () => {
        const vectors = [
            '<img src=x onerror=alert(1)>',
            '"><script>alert(2)</script>',
            '&lt;img src=x onerror=alert(3)&gt; **gras**',
            '</textarea><script>alert(4)</script>'
        ];

        // 1. Pipeline Utils.cleanMarkdown (et chaîne legacy decodeHtmlEntities(cleanMarkdown(...)))
        const formatted3 = Utils.decodeHtmlEntities(Utils.cleanMarkdown(vectors[2]));
        expect(formatted3).toContain('<strong>gras</strong>');
        expect(formatted3).not.toContain('<img');

        const formatted1 = Utils.cleanMarkdown(`${vectors[0]} **gras**`);
        expect(formatted1).toContain('<strong>gras</strong>');
        expect(formatted1).not.toContain('<img');

        // 2. JournalManager.renderTimeline & renderDraftPreview
        const entries = vectors.map((note, idx) => ({
            id: `entry-${idx}`,
            date: '2026-10-15T10:00:00.000Z',
            tags: ['participation'],
            note
        }));

        const timelineHtml = JournalManager.renderTimeline(entries, 2);
        expect(timelineHtml).not.toContain('<img src=x');
        expect(timelineHtml).not.toContain('<script>');
        expect(timelineHtml).not.toContain('</textarea>');

        const draftHtml = JournalManager.renderDraftPreview(entries[3]);
        expect(draftHtml).not.toContain('<script>');
        expect(draftHtml).not.toContain('</textarea>');

        // 3. StudentPhotoManager.getAvatarHTML (attribut alt et src)
        const avatarHtml = StudentPhotoManager.getAvatarHTML({
            id: 's-xss',
            prenom: 'Jean" onerror="alert(1)',
            nom: '"><script>alert(2)</script>',
            studentPhoto: {
                data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
            }
        });

        const container = document.createElement('div');
        container.innerHTML = avatarHtml;
        const img = container.querySelector('img');
        expect(img).not.toBeNull();
        expect(img.getAttribute('onerror')).toBeNull();
        expect(container.querySelector('script')).toBeNull();
    });
});
