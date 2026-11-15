import { describe, it, expect } from 'vitest';
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
});
