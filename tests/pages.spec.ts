import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe('Page Load Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('IMP-01: Catalog Import page loads with controls', async ({ page }) => {
    // Navigate to Influencer Central first
    await page.goto('/asin-lookup');
    await page.waitForTimeout(500);

    // Click Catalog Import in sidebar (it's always visible, no need to expand)
    await page.getByRole('button', { name: 'Catalog Import' }).click();

    // Wait for hash navigation
    await page.waitForURL('**/asin-lookup#catalog-import', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Verify heading
    await expect(page.getByRole('heading', { name: 'Catalog Import' })).toBeVisible({ timeout: 10000 });

    // Verify import controls
    await expect(page.getByRole('button', { name: 'Import from File' })).toBeVisible();
  });

  test('LIST-01: Listings page loads with structure', async ({ page }) => {
    // Navigate to Marketplace Central / Listings
    await page.goto('/ebay-central');

    // Wait for navigation to complete
    await page.waitForURL('**/ebay-central**', { timeout: 10000 });
    
    // Wait for loading state to clear
    await page.waitForTimeout(2000);

    // Verify heading
    await expect(page.getByRole('heading', { name: 'Your eBay Listings' })).toBeVisible({ timeout: 10000 });

    // Verify key controls exist
    await expect(page.getByRole('button', { name: 'Active' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sync eBay' })).toBeVisible();

    // Verify table structure exists
    await expect(page.locator('table')).toBeVisible();
  });

  test('ACCT-01: Account Settings shows profile info', async ({ page }) => {
    // Navigate to Account Settings
    await page.goto('/account');

    // Wait for navigation
    await page.waitForURL('**/account**', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Verify heading
    await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible({ timeout: 10000 });

    // Verify profile section exists
    await expect(page.getByRole('heading', { name: 'Profile Information' })).toBeVisible();

    // Verify email is displayed (from test credentials)
    await expect(page.getByText('petenelson13@gmail.com')).toBeVisible();
  });

  test('INT-01: Integrations page shows connection status', async ({ page }) => {
    // Navigate to Integrations
    await page.goto('/integrations');

    // Wait for navigation
    await page.waitForURL('**/integrations**', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Verify heading
    await expect(page.getByRole('heading', { name: 'Integrations', exact: true })).toBeVisible({ timeout: 10000 });

    // Verify integration categories exist
    await expect(page.getByRole('heading', { name: 'Marketplace Integrations', exact: true })).toBeVisible();

    // Verify connection status is shown
    await expect(page.getByText(/connected/i).first()).toBeVisible();
  });

  test('WN-01: WhatNot Analysis page loads', async ({ page }) => {
    // Navigate to Influencer Central first
    await page.goto('/asin-lookup');
    await page.waitForTimeout(500);

    // Click WhatNot Analysis in sidebar (it's always visible under "Other")
    await page.getByRole('button', { name: 'WhatNot Analysis' }).click();

    // Wait for hash navigation
    await page.waitForURL('**/asin-lookup#whatnot-analysis', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Verify heading or WhatNot text is visible
    await expect(page.getByText(/WhatNot/i).first()).toBeVisible({ timeout: 10000 });

    // Verify file upload or analysis interface exists
    await expect(
      page.locator('input[type="file"]').or(
        page.getByText(/upload/i).or(
          page.getByText(/drop/i)
        )
      ).first()
    ).toBeVisible();
  });

  test('QL-01: Quick List settings page loads', async ({ page }) => {
    // Navigate to Marketplace Central first
    await page.goto('/ebay-central');
    await page.waitForURL('**/ebay-central**', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Click Quick List in sidebar (it's always visible under eBay Tools)
    await page.getByRole('button', { name: 'Quick List' }).click();

    // Wait for page to load (could be hash-based or separate route)
    await page.waitForTimeout(2000);

    // Verify Quick List heading
    await expect(page.getByRole('heading', { name: 'Quick List', exact: true })).toBeVisible({ timeout: 10000 });
  });
});
