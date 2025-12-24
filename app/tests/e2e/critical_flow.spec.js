import { test, expect } from '@playwright/test';

test.describe('Critical Flow: Import and Generation', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');

        // Define initial state with dummy API key to enable functionality
        const initialState = {
            settings: {
                googleApiKey: 'dummy_test_key',
                theme: 'dark'
            }
        };

        await page.evaluate((state) => {
            localStorage.clear();
            localStorage.setItem('appreciationGeneratorFirstVisit_v8', 'true');
            localStorage.setItem('appreciationGeneratorState_v6.2', JSON.stringify(state));
        }, initialState);

        await page.reload();
    });

    test('User can switch to Mass Import tab and input data', async ({ page }) => {
        // 1. Check title
        await expect(page).toHaveTitle(/Bulletin AI/);

        // 2. Open Sidebar if not visible (it is visible by default usually)
        const sidebar = page.locator('#inputSection');
        await expect(sidebar).toBeVisible();

        // 3. Click Mass Import Tab
        await page.locator('#massImportTab').click({ force: true });
        await expect(page.locator('#massImportSection')).toBeVisible({ timeout: 10000 });

        // 4. Enter Data
        const dummyData = "MARTIN Lucas\t\t15\tBon travail\nDUPONT Emma\t\t12\tPeut mieux faire";
        await page.locator('#massData').fill(dummyData);

        // 5. Verify Preview button exists
        const previewBtn = page.locator('#importGenerateBtn');
        await expect(previewBtn).toBeVisible();
        await expect(previewBtn).toBeEnabled();
    });

    test('User can open Settings modal', async ({ page }) => {
        // 1. Click Settings Button
        await page.locator('#settingsButton').click();

        // 2. Verify Modal Opens
        const modal = page.locator('#settingsModal');
        await expect(modal).toBeVisible();
        await expect(page.locator('#settingsModalTitle')).toContainText('Paramètres');

        // 3. Close Modal
        await page.locator('#closeSettingsModalBtn').click();
        await expect(modal).not.toBeVisible();
    });
});
