import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe('Page Load Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('IMP-01: Catalog Import page loads with controls', async ({ page }) => {
    // Navigate to Catalog Import
    await page.click('text=Catalog Import, a[href*="catalog"]');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify heading
    await expect(page.locator('text=Catalog Import')).toBeVisible();

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
    await page.click('text=Marketplace Central, text=Listings, a[href*="ebay"], a[href*="listing"]');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify heading
    await expect(
      page.locator('text=Your eBay Listings').or(
        page.locator('text=Listings').or(
          page.locator('text=eBay Listings')
        )
      )
    ).toBeVisible();

    // Verify key controls exist
    await expect(
      page.locator('button:has-text("Sync")').or(
        page.locator('button:has-text("Active")')
      )
    ).toBeVisible();

    // Verify table structure exists (even if empty)
    await expect(
      page.locator('table, [role="table"]').or(
        page.locator('text=No listings found')
      )
    ).toBeVisible();
  });

  test('ACCT-01: Account Settings shows profile info', async ({ page }) => {
    // Navigate to Account Settings
    await page.click('text=Account, a[href*="account"]');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify heading
    await expect(page.locator('text=Account Settings')).toBeVisible();

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
    await page.click('text=Integrations, a[href*="integration"]');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify heading
    await expect(page.locator('text=Integrations')).toBeVisible();

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
    // Navigate to WhatNot Analysis
    await page.click('text=WhatNot, a[href*="whatnot"]');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify heading
    await expect(
      page.locator('text=WhatNot').or(
        page.locator('text=Lot Analysis')
      )
    ).toBeVisible();

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
    // Navigate to Quick List
    await page.click('text=Quick List, a[href*="auto-list"], a[href*="quick"]');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify heading
    await expect(page.locator('text=Quick List')).toBeVisible();

    // Verify tabs exist
    await expect(
      page.locator('text=Create Listing').or(
        page.locator('text=Settings')
      )
    ).toBeVisible();

    // Click Settings tab
    await page.click('text=Settings');
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
