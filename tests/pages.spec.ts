import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe('Page Load Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('IMP-01: Catalog Import page loads with controls', async ({ page }) => {
    // Expand Catalog section first
    const catalogButton = page.getByRole('button', { name: 'Catalog', exact: true });
    const isExpanded = await catalogButton.getAttribute('aria-expanded').catch(() => null);
    if (isExpanded !== 'true') {
      await catalogButton.click();
      await page.waitForTimeout(300);
    }

    // Navigate to Catalog Import
    await page.getByRole('button', { name: 'Catalog Import' }).click();

    // Wait for navigation
    await page.waitForURL('**/asin-catalog-import**', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Verify heading
    await expect(page.getByText('Catalog Import')).toBeVisible({ timeout: 10000 });

    // Verify import controls
    await expect(
      page.locator('button:has-text("Import from File")').or(
        page.locator('button:has-text("Import")')
      )
    ).toBeVisible();

    // Verify search or table exists
    await expect(
      page.locator('input[type="search"], input[placeholder*="search" i]').or(
        page.locator('table, [role="table"]')
      )
    ).toBeVisible();
  });

  test('LIST-01: Listings page loads with structure', async ({ page }) => {
    // Navigate to Marketplace Central / Listings
    await page.getByRole('link', { name: 'Marketplace Central' }).click();

    // Wait for navigation to complete
    await page.waitForURL('**/ebay-central**', { timeout: 10000 });
    
    // Wait for loading state to clear
    await page.waitForTimeout(2000);

    // Verify heading or key elements
    await expect(
      page.locator('text=Your eBay Listings').or(
        page.locator('text=Listings').or(
          page.locator('text=eBay Listings').or(
            page.locator('text=Marketplace Tools')
          )
        )
      )
    ).toBeVisible({ timeout: 10000 });

    // Verify key controls exist
    await expect(
      page.locator('button:has-text("Sync")').or(
        page.locator('button:has-text("Active")').or(
          page.locator('button:has-text("Listings")')
        )
      )
    ).toBeVisible();

    // Verify table structure exists (even if empty)
    await expect(
      page.locator('table, [role="table"]').or(
        page.locator('text=No listings found').or(
          page.locator('text=Loading')
        )
      )
    ).toBeVisible();
  });

  test('ACCT-01: Account Settings shows profile info', async ({ page }) => {
    // Navigate to Account Settings
    await page.getByRole('link', { name: 'Account' }).click();

    // Wait for navigation
    await page.waitForURL('**/account**', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Verify heading
    await expect(page.locator('text=Account Settings')).toBeVisible({ timeout: 10000 });

    // Verify profile section exists
    await expect(
      page.locator('text=Profile').or(
        page.locator('text=Full Name').or(
          page.locator('text=Email')
        )
      )
    ).toBeVisible();

    // Verify email is displayed (from test credentials)
    await expect(page.locator('text=petenelson13@gmail.com')).toBeVisible();
  });

  test('INT-01: Integrations page shows connection status', async ({ page }) => {
    // Navigate to Integrations
    await page.getByRole('link', { name: 'Integrations' }).click();

    // Wait for navigation
    await page.waitForURL('**/integrations**', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Verify heading
    await expect(page.locator('text=Integrations')).toBeVisible({ timeout: 10000 });

    // Verify integration categories exist
    await expect(
      page.locator('text=Marketplace').or(
        page.locator('text=eBay').or(
          page.locator('text=Keepa')
        )
      )
    ).toBeVisible();

    // Verify at least one integration card is visible
    await expect(
      page.locator('text=Connected').or(
        page.locator('text=Not Connected').or(
          page.locator('text=Connect')
        )
      )
    ).toBeVisible();
  });

  test('WN-01: WhatNot Analysis page loads', async ({ page }) => {
    // Expand Other section first
    const otherButton = page.getByRole('button', { name: 'Other', exact: true });
    const isExpanded = await otherButton.getAttribute('aria-expanded').catch(() => null);
    if (isExpanded !== 'true') {
      await otherButton.click();
      await page.waitForTimeout(300);
    }

    // Navigate to WhatNot Analysis
    await page.getByRole('button', { name: 'WhatNot Analysis' }).click();

    // Wait for navigation
    await page.waitForURL('**/whatnot**', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Verify heading
    await expect(
      page.locator('text=WhatNot').or(
        page.locator('text=Lot Analysis')
      )
    ).toBeVisible({ timeout: 10000 });

    // Verify file upload interface exists
    await expect(
      page.locator('input[type="file"]').or(
        page.locator('text=Drop').or(
          page.locator('text=Upload').or(
            page.locator('text=browse')
          )
        )
      )
    ).toBeVisible();
  });

  test('QL-01: Quick List settings page loads', async ({ page }) => {
    // Navigate to Marketplace Central first
    await page.getByRole('link', { name: 'Marketplace Central' }).click();
    await page.waitForURL('**/ebay-central**', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Expand eBay Tools section if needed
    const ebayToolsButton = page.getByRole('button', { name: 'eBay Tools', exact: true });
    const isExpanded = await ebayToolsButton.getAttribute('aria-expanded').catch(() => null);
    if (isExpanded !== 'true') {
      await ebayToolsButton.click();
      await page.waitForTimeout(300);
    }

    // Then navigate to Quick List
    await page.getByRole('button', { name: 'Quick List' }).click();

    // Wait for page to load
    await page.waitForURL('**/auto-list**', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Verify heading
    await expect(page.locator('text=Quick List')).toBeVisible({ timeout: 10000 });

    // Verify tabs exist
    await expect(
      page.locator('text=Create Listing').or(
        page.locator('text=Settings')
      )
    ).toBeVisible();

    // Click Settings tab
    await page.getByText('Settings').click();
    await page.waitForTimeout(500);

    // Verify settings sections
    await expect(
      page.locator('text=Business Policies').or(
        page.locator('text=SKU Settings').or(
          page.locator('text=Policy')
        )
      )
    ).toBeVisible();
  });
});
