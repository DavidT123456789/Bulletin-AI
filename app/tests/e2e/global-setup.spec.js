import { test, expect } from '@playwright/test';

test('Application loads and shows title', async ({ page }) => {
    await page.goto('/app.html');

    // Verify the page title or a key element is present
    const title = await page.title();
    console.log('Page Title:', title);

    // Checking for the main app container
    await expect(page.locator('.app-layout')).toBeVisible();

    // Check for main content wrapper which is visible on load
    await expect(page.locator('.main-content-wrapper')).toBeVisible();
});
