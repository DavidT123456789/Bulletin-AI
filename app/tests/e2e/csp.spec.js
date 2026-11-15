import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readAppCspHeader() {
    const headersPath = path.resolve(__dirname, '../../public/_headers');
    const raw = await fs.readFile(headersPath, 'utf-8');
    const match = raw.match(/^\s*Content-Security-Policy:\s*(.+)$/m);
    if (!match) {
        throw new Error('Content-Security-Policy header not found in public/_headers');
    }
    return match[1].trim();
}

test.describe('CSP & inline handler compliance (public/_headers)', () => {
    test('app.html + Personalization demo avatar fallback produce zero CSP violations', async ({ page }) => {
        const cspHeader = await readAppCspHeader();
        const scriptSrc = cspHeader
            .split(';')
            .map((directive) => directive.trim())
            .find((directive) => directive.startsWith('script-src '));
        expect(scriptSrc).toBeTruthy();
        expect(scriptSrc).not.toContain("'unsafe-inline'");

        const pageErrors = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));

        await page.addInitScript(() => {
            window.__cspViolations = [];
            document.addEventListener('securitypolicyviolation', (e) => {
                window.__cspViolations.push({
                    effectiveDirective: e.effectiveDirective,
                    violatedDirective: e.violatedDirective,
                    blockedURI: e.blockedURI,
                    sourceFile: e.sourceFile,
                    lineNumber: e.lineNumber
                });
            });

            if (sessionStorage.getItem('__e2e_csp_seeded')) return;
            sessionStorage.setItem('__e2e_csp_seeded', '1');
            localStorage.clear();
            localStorage.setItem('appreciationGeneratorFirstVisit_v8', 'true');
            localStorage.setItem('appreciationGeneratorState_v6.2', JSON.stringify({
                generatedResults: [],
                globalSettings: {
                    theme: 'dark',
                    currentAIModel: 'gemini-3.6-flash',
                    periodSystem: 'trimestres',
                    currentPeriod: 'T1',
                    currentSubject: 'Maths',
                    classes: [{ id: 'class-1', name: 'Classe Test', year: '2026', subject: 'Maths', periodSystem: 'trimestres' }],
                    currentClassId: 'class-1'
                }
            }));
        });

        await page.route('**/*', async (route) => {
            const req = route.request();
            const url = req.url();

            if (url.includes('/images/Demo/')) {
                await route.abort();
                return;
            }

            if (req.resourceType() === 'document') {
                const response = await route.fetch();
                await route.fulfill({
                    response,
                    headers: {
                        ...response.headers(),
                        'content-security-policy': cspHeader
                    }
                });
                return;
            }

            await route.continue();
        });

        await page.goto('/app.html');
        await expect(page).toHaveTitle(/Bulletin AI/);

        await page.locator('#headerMenuBtn').click();
        await page.locator('#personalizationBtn').click();
        await expect(page.locator('#personalizationModal')).toBeVisible();

        const avatar = page.locator('#previewStudentAvatar');
        await expect(avatar.locator('.avatar-initials-fallback')).toBeVisible();
        await expect(avatar.locator('img')).toBeHidden();
        const firstInitials = await avatar.locator('.avatar-initials-fallback').textContent();

        await page.locator('#previewNextStudentBtn').click();
        await expect(avatar.locator('.avatar-initials-fallback')).toBeVisible();
        await expect(avatar.locator('img')).toBeHidden();
        const secondInitials = await avatar.locator('.avatar-initials-fallback').textContent();
        expect(secondInitials).not.toBe(firstInitials);

        const cspViolations = await page.evaluate(() => window.__cspViolations);
        expect(cspViolations).toEqual([]);
        expect(pageErrors).toEqual([]);
    });
});
