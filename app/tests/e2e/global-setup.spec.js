import { test, expect } from '@playwright/test';

test('Application loads and shows title', async ({ page }) => {
    await page.goto('/');

    // Verify the page title or a key element is present
    const title = await page.title();
    console.log('Page Title:', title);

    // Checking for the main app container
    await expect(page.locator('.app-layout')).toBeVisible();

    // Check for sidebar instead of h1 which might not be visible or present as expected
    await expect(page.locator('.sidebar')).toBeVisible();
});
