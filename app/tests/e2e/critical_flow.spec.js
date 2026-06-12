import { test, expect } from '@playwright/test';

test.describe('Critical Flow: Import and Generation', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/app.html');

        // Define initial state with dummy API key to enable functionality
        // Also inject a default class to bypass the "no classes" check for opening Import Hub
        const initialState = {
            settings: {
                googleApiKey: 'dummy_test_key',
                theme: 'dark',
                classes: [{ id: 'class-1', name: 'Classe Test', year: '2026', subject: 'Maths' }],
                currentClassId: 'class-1'
            }
        };

        await page.evaluate((state) => {
            localStorage.clear();
            localStorage.setItem('appreciationGeneratorFirstVisit_v8', 'true');
            localStorage.setItem('appreciationGeneratorState_v6.2', JSON.stringify(state));
        }, initialState);

        await page.goto('/app.html');
    });

    test('User can switch to Mass Import tab and input data', async ({ page }) => {
        // 1. Check title
        await expect(page).toHaveTitle(/Bulletin AI/);

        // 2. Click the floating action button to open Import Hub
        await page.locator('#addStudentFab').click();
        await expect(page.locator('#importHubBackdrop')).toHaveClass(/active/);

        // 3. Click the mass import card
        await page.locator('.import-hub-card[data-action="mass"]').click();
        await expect(page.locator('#importWizardModal')).toHaveClass(/visible/);

        // 4. Enter Data in the Wizard Textarea
        const dummyData = "MARTIN Lucas\t\t15\tBon travail\nDUPONT Emma\t\t12\tPeut mieux faire";
        await page.locator('#wizardDataTextarea').fill(dummyData);

        // 5. Verify Next button becomes enabled
        const nextBtn = page.locator('#wizardStep1NextBtn');
        await expect(nextBtn).toBeVisible();
        await expect(nextBtn).toBeEnabled();
    });

    test('User can open Settings modal', async ({ page }) => {
        // 1. Open the header menu dropdown first
        await page.locator('#headerMenuBtn').click();

        // 2. Click Settings Button
        await page.locator('#settingsButton').click();

        // 3. Verify Modal Opens
        const modal = page.locator('#appSettingsModal');
        await expect(modal).toBeVisible();
        await expect(page.locator('#settingsModalTitle')).toContainText('Paramètres');

        // 4. Close Modal
        await page.locator('#closeSettingsModalBtn').click();
        await expect(modal).not.toBeVisible();
    });
});
