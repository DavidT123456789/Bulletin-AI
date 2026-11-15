import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { getIcon } from 'iconify-icon';
import './icons-landing.js';
import './icons-app.js';
import { scanUsedIcons, extractIconCollections } from '../../scripts/generate-icons.js';

const APP_ROOT = path.resolve(__dirname, '../..');

describe('Local Iconify offline bundles integrity', () => {
    it.each([
        { target: 'landing', minCount: 20 },
        { target: 'app', minCount: 200 }
    ])('registers every icon used in "$target" in memory', ({ target, minCount }) => {
        const { iconsByPrefix, invalidTagIcons, unregisteredDynamicIcons, totalUnique } = scanUsedIcons(APP_ROOT, target);

        expect(invalidTagIcons).toEqual([]);
        expect(unregisteredDynamicIcons).toEqual([]);
        expect(totalUnique).toBeGreaterThanOrEqual(minCount);

        const missingFromBundle = [];
        for (const [prefix, names] of Object.entries(iconsByPrefix)) {
            for (const name of names) {
                const fullName = `${prefix}:${name}`;
                if (!getIcon(fullName)) {
                    missingFromBundle.push(fullName);
                }
            }
        }

        expect(missingFromBundle).toEqual([]);
    });

    it('detects unregistered dynamic icon templates before build', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-scan-'));
        try {
            fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
            fs.writeFileSync(
                path.join(tmpRoot, 'src', 'sample.js'),
                'const html = `<iconify-icon icon="solar:eye-${visible ? \'bold\' : \'linear\'}"></iconify-icon>`;'
            );
            const result = scanUsedIcons(tmpRoot, 'app');
            expect(result.unregisteredDynamicIcons).toEqual([
                { file: 'src/sample.js', template: 'solar:eye-${...}' }
            ]);
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    it('throws a clear error when extracting a nonexistent icon name', () => {
        expect(() =>
            extractIconCollections({ solar: ['definitely-nonexistent-icon-xyz'] }, APP_ROOT)
        ).toThrow(/Unknown Iconify icon\(s\) referenced in source/);
    });

    it('disables IntersectionObserver on iconify-icon so reparenting preserves rendering', async () => {
        const IconifyIconClass = customElements.get('iconify-icon');
        expect(IconifyIconClass?.prototype.__observerPatched).toBe(true);

        const observeSpy = vi.fn();
        const originalIO = globalThis.IntersectionObserver;
        globalThis.IntersectionObserver = vi.fn(() => ({
            observe: observeSpy,
            disconnect: vi.fn()
        }));

        const container = document.createElement('div');
        container.style.display = 'none';
        const icon = document.createElement('iconify-icon');
        icon.setAttribute('icon', 'ph:plus');

        try {
            container.appendChild(icon);
            document.body.appendChild(container);
            await new Promise((r) => setTimeout(r, 20));

            // Reparent (simulating teleport to document.body and back)
            document.body.appendChild(icon);
            await new Promise((r) => setTimeout(r, 20));

            expect(observeSpy).not.toHaveBeenCalled();
            expect(icon._observer).toBeFalsy();
            expect(icon._visible).toBe(true);
            expect(icon.shadowRoot?.querySelector('svg')).not.toBeNull();
        } finally {
            icon.remove();
            container.remove();
            globalThis.IntersectionObserver = originalIO;
        }
    });
});
