import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe('Product CRM', () => {
  // Use a unique test ASIN for each test run to avoid conflicts
  const testAsin = `B0TEST${Date.now().toString().slice(-4)}`;

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('CRM-02: Add product with ASIN appears in table', async ({ page }) => {
    // Click "+ Product" button
    await page.click('button:has-text("+ Product"), button:has-text("Add Product")');

    // Wait for add product modal/form
    await page.waitForTimeout(500);

    // Fill in ASIN
    await page.fill('input[placeholder*="ASIN" i], input[name*="asin" i]', testAsin);

    // Select initial status (if dropdown exists)
    const statusDropdown = page.locator('select, [role="combobox"]').filter({ hasText: /status/i }).first();
    if (await statusDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
      await statusDropdown.click();
      await page.click('text=Initial Contact');
    }

    // Click "Add Product" button to submit
    await page.click('button:has-text("Add Product"), button:has-text("Add"), button[type="submit"]');

    // Wait for product to appear in table
    await page.waitForTimeout(1000);

    // Verify product appears in table
    await expect(page.locator(`text=${testAsin}`)).toBeVisible({ timeout: 10000 });
  });

  test('CRM-04: Open product detail panel shows all fields', async ({ page }) => {
    // First, add a product to test with
    await page.click('button:has-text("+ Product"), button:has-text("Add Product")');
    await page.waitForTimeout(500);
    await page.fill('input[placeholder*="ASIN" i], input[name*="asin" i]', testAsin);
    await page.click('button:has-text("Add Product"), button:has-text("Add"), button[type="submit"]');
    await page.waitForTimeout(1000);

    // Click on the product row to open detail panel
    await page.click(`text=${testAsin}`);

    // Wait for detail panel to open
    await page.waitForTimeout(1000);

    // Verify key sections are visible in detail panel
    await expect(page.locator('text=Status').or(page.locator('select, [role="combobox"]').first())).toBeVisible();
    await expect(page.locator('text=Requirements, textarea, input[name*="requirement" i]').first()).toBeVisible();
    
    // Verify close button exists
    await expect(page.locator('button:has-text("Close"), button[aria-label*="close" i]')).toBeVisible();
  });

  test('CRM-05: Edit status persists after refresh', async ({ page }) => {
    // First, add a product
    await page.click('button:has-text("+ Product"), button:has-text("Add Product")');
    await page.waitForTimeout(500);
    await page.fill('input[placeholder*="ASIN" i], input[name*="asin" i]', testAsin);
    await page.click('button:has-text("Add Product"), button:has-text("Add"), button[type="submit"]');
    await page.waitForTimeout(1000);

    // Open product detail panel
    await page.click(`text=${testAsin}`);
    await page.waitForTimeout(1000);

    // Change status to "Committed"
    const statusDropdown = page.locator('select, [role="combobox"]').filter({ hasText: /status|none|initial/i }).first();
    await statusDropdown.click();
    await page.click('text=Committed');
    
    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Close panel
    await page.click('button:has-text("Close"), button[aria-label*="close" i]');
    await page.waitForTimeout(500);

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Open product again
    await page.click(`text=${testAsin}`);
    await page.waitForTimeout(1000);

    // Verify status is "Committed"
    await expect(page.locator('text=Committed')).toBeVisible();
  });

  test('CRM-06: Edit notes field saves correctly without character skipping', async ({ page }) => {
    const testNote = 'Test requirements: Product must be shipped within 5 business days.';

    // First, add a product
    await page.click('button:has-text("+ Product"), button:has-text("Add Product")');
    await page.waitForTimeout(500);
    await page.fill('input[placeholder*="ASIN" i], input[name*="asin" i]', testAsin);
    await page.click('button:has-text("Add Product"), button:has-text("Add"), button[type="submit"]');
    await page.waitForTimeout(1000);

    // Open product detail panel
    await page.click(`text=${testAsin}`);
    await page.waitForTimeout(1000);

    // Find and fill requirements textarea
    const requirementsField = page.locator('textarea, input[name*="requirement" i]').first();
    await requirementsField.click();
    await requirementsField.fill(testNote);

    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Close and reopen panel
    await page.click('button:has-text("Close"), button[aria-label*="close" i]');
    await page.waitForTimeout(500);
    await page.click(`text=${testAsin}`);
    await page.waitForTimeout(1000);

    // Verify the complete text is saved
    const savedText = await page.locator('textarea, input[name*="requirement" i]').first().inputValue();
    expect(savedText).toBe(testNote);
  });

  test('CRM-13: Delete product with confirmation removes from table', async ({ page }) => {
    // First, add a product
    await page.click('button:has-text("+ Product"), button:has-text("Add Product")');
    await page.waitForTimeout(500);
    await page.fill('input[placeholder*="ASIN" i], input[name*="asin" i]', testAsin);
    await page.click('button:has-text("Add Product"), button:has-text("Add"), button[type="submit"]');
    await page.waitForTimeout(1000);

    // Verify product exists
    await expect(page.locator(`text=${testAsin}`)).toBeVisible();

    // Open product detail panel
    await page.click(`text=${testAsin}`);
    await page.waitForTimeout(1000);

    // Click delete button
    await page.click('button:has-text("Delete"), button[aria-label*="delete" i]');

    // Wait for confirmation modal
    await page.waitForTimeout(500);

    // Confirm deletion
    await page.click('button:has-text("Delete"), button:has-text("Confirm")');

    // Wait for deletion to complete
    await page.waitForTimeout(1000);

    // Verify product is removed from table
    await expect(page.locator(`text=${testAsin}`)).not.toBeVisible({ timeout: 5000 });
  });

  test('CRM-16: Video Made tab loads with filtered view', async ({ page }) => {
    // Click "Video Made" tab
    await page.click('button:has-text("Video Made"), a:has-text("Video Made")');

    // Wait for tab to load
    await page.waitForLoadState('networkidle');

    // Verify heading or filter indication
    await expect(
      page.locator('text=Video Made').or(
        page.locator('text=Products with videos')
      )
    ).toBeVisible();
  });

  test('CRM-17: Data persistence across navigation and refresh', async ({ page }) => {
    const testNote = 'Persistence test note';

    // Add product
    await page.click('button:has-text("+ Product"), button:has-text("Add Product")');
    await page.waitForTimeout(500);
    await page.fill('input[placeholder*="ASIN" i], input[name*="asin" i]', testAsin);
    await page.click('button:has-text("Add Product"), button:has-text("Add"), button[type="submit"]');
    await page.waitForTimeout(1000);

    // Open and edit product
    await page.click(`text=${testAsin}`);
    await page.waitForTimeout(1000);
    
    // Add note
    const requirementsField = page.locator('textarea, input[name*="requirement" i]').first();
    await requirementsField.fill(testNote);
    await page.waitForTimeout(2000);

    // Close panel
    await page.click('button:has-text("Close"), button[aria-label*="close" i]');

    // Navigate to different tab
    await page.click('button:has-text("Video Made"), a:has-text("Video Made")');
    await page.waitForTimeout(1000);

    // Navigate back
    await page.click('button:has-text("All Products"), a:has-text("All Products"), button:has-text("Product CRM")');
    await page.waitForTimeout(1000);

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify product still exists
    await expect(page.locator(`text=${testAsin}`)).toBeVisible();

    // Open product and verify note persisted
    await page.click(`text=${testAsin}`);
    await page.waitForTimeout(1000);
    const savedText = await page.locator('textarea, input[name*="requirement" i]').first().inputValue();
    expect(savedText).toBe(testNote);
  });

  // Cleanup: Delete test product after all tests
  test.afterEach(async ({ page }) => {
    try {
      // Try to find and delete the test product if it exists
      const productExists = await page.locator(`text=${testAsin}`).isVisible({ timeout: 2000 }).catch(() => false);
      
      if (productExists) {
        await page.click(`text=${testAsin}`);
        await page.waitForTimeout(1000);
        await page.click('button:has-text("Delete"), button[aria-label*="delete" i]');
        await page.waitForTimeout(500);
        await page.click('button:has-text("Delete"), button:has-text("Confirm")');
        await page.waitForTimeout(1000);
      }
    } catch (error) {
      // Cleanup failed, but don't fail the test
      console.log('Cleanup failed for test product:', testAsin);
    }
  });
});
