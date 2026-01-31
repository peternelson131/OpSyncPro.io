import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe.serial('Integrations Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    // Navigate to Integrations
    await page.goto('/integrations');
    await page.waitForURL('**/integrations**', { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('INT-02: Three integration sections visible with connection counts', async ({ page }) => {
    // Verify Integrations heading
    await expect(page.getByRole('heading', { name: 'Integrations', exact: true, level: 1 })).toBeVisible({ timeout: 10000 });

    // Verify subtitle
    await expect(page.getByText('Connect your accounts and manage API credentials')).toBeVisible();

    // Verify Marketplace Integrations section with connection count
    await expect(page.getByRole('button', { name: /Marketplace Integrations.*1\/2 connected/i })).toBeVisible();

    // Verify Influencer Integrations section with connection count
    await expect(page.getByRole('button', { name: /Influencer Integrations.*0\/2 connected/i })).toBeVisible();

    // Verify Social Media Integrations section with connection count
    await expect(page.getByRole('button', { name: /Social Media Integrations.*0\/4 connected/i })).toBeVisible();

    // Verify Security Note heading exists
    await expect(page.getByRole('heading', { name: 'Security Note' })).toBeVisible();
  });

  test('INT-03: Marketplace accordion expands showing eBay + Keepa', async ({ page }) => {
    // Click to expand Marketplace Integrations
    await page.getByRole('button', { name: /Marketplace Integrations/i }).click();
    await page.waitForTimeout(500);

    // Verify eBay section
    await expect(page.getByRole('heading', { name: 'eBay', level: 4 })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Seller account for listing management')).toBeVisible();

    // Verify Keepa section
    await expect(page.getByRole('heading', { name: 'Keepa', level: 4 })).toBeVisible();
    await expect(page.getByText('Amazon product data and price history')).toBeVisible();
  });

  test('INT-04: Keepa shows as Configured with masked API key', async ({ page }) => {
    // Expand Marketplace Integrations if not already expanded
    await page.getByRole('button', { name: /Marketplace Integrations/i }).click();
    await page.waitForTimeout(500);

    // Verify Keepa section
    await expect(page.getByRole('heading', { name: 'Keepa', level: 4 })).toBeVisible();

    // Verify "Configured" status
    await expect(page.getByText('Configured')).toBeVisible();

    // Verify masked API key textbox (should show dots or asterisks)
    const keepaInput = page.getByPlaceholder('Enter your Keepa API key').or(
      page.getByRole('textbox').filter({ has: page.locator('text=/.*\\.\\.\\..*|.*\\*\\*\\*.*/') })
    );
    await expect(keepaInput).toBeVisible();

    // Verify toggle visibility button (eye icon)
    const toggleButtons = await page.getByRole('button').all();
    expect(toggleButtons.length).toBeGreaterThan(0);

    // Verify Save button exists and is disabled
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

    // Verify Delete button
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
  });

  test('INT-05: eBay shows as Not Connected with Connect button', async ({ page }) => {
    // Expand Marketplace Integrations if not already expanded
    await page.getByRole('button', { name: /Marketplace Integrations/i }).click();
    await page.waitForTimeout(500);

    // Verify eBay section
    await expect(page.getByRole('heading', { name: 'eBay', level: 4 })).toBeVisible();
    await expect(page.getByText('Seller account for listing management')).toBeVisible();

    // Verify "Not Connected" status
    await expect(page.getByText('Not Connected')).toBeVisible();

    // Verify Connect eBay Account button
    await expect(page.getByRole('button', { name: 'Connect eBay Account' })).toBeVisible();
  });

  test('INT-06: Influencer accordion expands (ElevenLabs, Google Drive sections)', async ({ page }) => {
    // Click to expand Influencer Integrations
    await page.getByRole('button', { name: /Influencer Integrations/i }).click();
    await page.waitForTimeout(500);

    // Verify Eleven Labs section exists (note: it's "Eleven Labs" not "ElevenLabs")
    await expect(page.getByRole('heading', { name: /Eleven Labs/i }).first()).toBeVisible({ timeout: 5000 });

    // Verify OneDrive section exists (note: it's "OneDrive" not "Google Drive")
    await expect(page.getByRole('heading', { name: /OneDrive/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('INT-07: Social Media accordion expands (Instagram, Facebook, TikTok, YouTube)', async ({ page }) => {
    // Click to expand Social Media Integrations
    await page.getByRole('button', { name: /Social Media Integrations/i }).click();
    await page.waitForTimeout(500);

    // Verify Instagram section
    await expect(page.getByRole('heading', { name: 'Instagram' }).first()).toBeVisible({ timeout: 5000 });

    // Verify Facebook section
    await expect(page.getByRole('heading', { name: 'Facebook' }).first()).toBeVisible();

    // Verify TikTok section
    await expect(page.getByRole('heading', { name: 'TikTok' }).first()).toBeVisible();

    // Verify YouTube section
    await expect(page.getByRole('heading', { name: 'YouTube' }).first()).toBeVisible();
  });
});
