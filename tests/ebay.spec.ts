import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe.serial('eBay Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    
    // Navigate to Marketplace Central
    await page.getByRole('link', { name: 'Marketplace Central' }).click();
    
    // Wait for navigation to eBay Central
    await page.waitForURL('**/ebay-central', { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('EBAY-01: Listings page loads with table headers and search', async ({ page }) => {
    // Verify main heading
    await expect(page.getByRole('heading', { name: 'Your eBay Listings', level: 1 })).toBeVisible({ timeout: 10000 });

    // Verify description paragraph
    await expect(page.getByText('Manage and monitor your eBay listing prices')).toBeVisible();

    // Verify search textbox
    await expect(page.getByRole('textbox', { name: /search listings/i })).toBeVisible();

    // Verify table exists with column headers using columnheader role
    await expect(page.getByRole('columnheader', { name: /Image/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Title/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Current Price/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Strategy/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Qty/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Min Price/i })).toBeVisible();

    // Table structure verified - "No listings found" message exists in DOM
    // but may not always be visible depending on filtering state
  });

  test('EBAY-02: Sidebar navigation between eBay Tools, Listings, Price Strategies, Quick List', async ({ page }) => {
    // Verify Marketplace Tools heading in sidebar
    await expect(page.getByRole('heading', { name: 'Marketplace Tools' })).toBeVisible();

    // Verify eBay Tools button
    await expect(page.getByRole('button', { name: 'eBay Tools' })).toBeVisible();

    // Verify Listings button
    await expect(page.getByRole('button', { name: 'Listings' })).toBeVisible();

    // Verify Price Strategies button
    await expect(page.getByRole('button', { name: 'Price Strategies' })).toBeVisible();

    // Verify Quick List button
    await expect(page.getByRole('button', { name: 'Quick List' })).toBeVisible();

    // Test navigation to Quick List
    await page.getByRole('button', { name: 'Quick List' }).click();
    await page.waitForTimeout(500);

    // Verify Quick List page loads
    await expect(page.getByRole('heading', { name: 'Quick List', level: 1 })).toBeVisible({ timeout: 5000 });

    // Navigate back to Listings
    await page.getByRole('button', { name: 'Listings' }).click();
    await page.waitForTimeout(500);

    // Verify back on Listings page
    await expect(page.getByRole('heading', { name: 'Your eBay Listings', level: 1 })).toBeVisible({ timeout: 5000 });
  });

  test('EBAY-03: Quick List page loads with all form sections', async ({ page }) => {
    // Navigate to Quick List
    await page.getByRole('button', { name: 'Quick List' }).click();
    await page.waitForTimeout(1000);

    // Verify main heading
    await expect(page.getByRole('heading', { name: 'Quick List', level: 1 })).toBeVisible();

    // Verify description
    await expect(page.getByText('Create an eBay listing from an Amazon ASIN in seconds')).toBeVisible();

    // Verify action buttons at top
    await expect(page.getByRole('button', { name: 'Create Listing' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();

    // Verify Business Policies section
    await expect(page.getByRole('heading', { name: /Business Policies.*Required/i, level: 3 })).toBeVisible();

    // Verify Merchant Location section
    await expect(page.getByRole('heading', { name: /Merchant Location.*Required/i, level: 3 })).toBeVisible();

    // Verify SKU Settings section
    await expect(page.getByRole('heading', { name: 'SKU Settings', level: 3 })).toBeVisible();

    // Verify Custom Description Note section
    await expect(page.getByRole('heading', { name: 'Custom Description Note', level: 3 })).toBeVisible();
  });

  test('EBAY-04: Quick List Settings form has required fields', async ({ page }) => {
    // Navigate to Quick List
    await page.getByRole('button', { name: 'Quick List' }).click();
    await page.waitForTimeout(1000);

    // Verify Shipping / Fulfillment Policy ID field
    await expect(page.getByText('Shipping / Fulfillment Policy ID')).toBeVisible();
    await expect(page.getByPlaceholder(/107540197026/i)).toBeVisible();

    // Verify Payment Policy ID field
    await expect(page.getByText('Payment Policy ID')).toBeVisible();
    await expect(page.getByPlaceholder(/243561626026/i)).toBeVisible();

    // Verify Return Policy ID field
    await expect(page.getByText('Return Policy ID')).toBeVisible();
    await expect(page.getByPlaceholder(/243561625026/i)).toBeVisible();

    // Verify Merchant Location field
    await expect(page.getByPlaceholder(/loc-94e1f3a0/i)).toBeVisible();

    // Verify SKU Prefix field with default value
    const skuPrefixInput = page.getByRole('textbox').filter({ hasText: 'ql_' }).or(
      page.locator('input[value="ql_"]')
    );
    await expect(skuPrefixInput.first()).toBeVisible({ timeout: 5000 });

    // Verify Custom Description Note field
    await expect(page.getByPlaceholder(/Ships from Wisconsin/i)).toBeVisible();

    // Verify character count for description
    await expect(page.getByText('0/1000 characters')).toBeVisible();

    // Verify Save Settings button
    await expect(page.getByRole('button', { name: 'Save Settings' })).toBeVisible();
  });

  test('EBAY-05: Sync eBay button is visible and clickable', async ({ page }) => {
    // Should be on Listings page by default after navigation
    // Verify Sync eBay button exists
    const syncButton = page.getByRole('button', { name: 'Sync eBay' });
    await expect(syncButton).toBeVisible({ timeout: 10000 });

    // Verify button is enabled (clickable) - don't actually click it
    await expect(syncButton).toBeEnabled();
  });

  test('EBAY-06: Vacation mode toggle is visible with OFF state', async ({ page }) => {
    // Should be on Listings page by default after navigation
    // Verify Vacation mode button with OFF state
    const vacationButton = page.getByRole('button', { name: /Vacation.*OFF/i });
    await expect(vacationButton).toBeVisible({ timeout: 10000 });

    // Verify it's clickable (enabled)
    await expect(vacationButton).toBeEnabled();
  });
});
