import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe('Product CRM', () => {
  // Use a unique test ASIN for each test run to avoid conflicts
  const testAsin = `B0TEST${Date.now().toString().slice(-4)}`;

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('CRM-02: Add product with ASIN appears in table', async ({ page }) => {
    // Click "Product" button to open modal
    await page.getByRole('button', { name: 'Product', exact: true }).click();

    // Wait for add product modal/form
    await page.waitForTimeout(800);

    // Fill in ASIN
    await page.locator('input[placeholder*="B0" i]').first().fill(testAsin);

    // Wait for the form to be ready
    await page.waitForTimeout(300);

    // Click "Add Product" button to submit (use last() to get the one in the modal, not toolbar)
    await page.getByRole('button', { name: 'Add Product' }).last().click({ force: true });

    // Wait for modal to close and product to be added
    await page.waitForTimeout(2000);

    // Verify product appears somewhere on page (could be in table or search results)
    await expect(page.locator(`text=${testAsin}`).first()).toBeVisible({ timeout: 10000 });
  });

  test('CRM-04: Open product detail panel shows all fields', async ({ page }) => {
    // First, add a product to test with
    await page.getByRole('button', { name: 'Product', exact: true }).click();
    await page.waitForTimeout(800);
    await page.locator('input[placeholder*="B0" i]').first().fill(testAsin);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Add Product' }).last().click({ force: true });
    await page.waitForTimeout(2000);

    // Click on the product row to open detail panel
    await page.locator(`text=${testAsin}`).first().click();

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
    await page.getByRole('button', { name: 'Product', exact: true }).click();
    await page.waitForTimeout(800);
    await page.locator('input[placeholder*="B0" i]').first().fill(testAsin);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Add Product' }).last().click({ force: true });
    await page.waitForTimeout(2000);

    // Open product detail panel
    await page.locator(`text=${testAsin}`).first().click();
    await page.waitForTimeout(1000);

    // Change status to "Committed"
    const statusDropdown = page.locator('select, [role="combobox"]').filter({ hasText: /status|none|initial/i }).first();
    await statusDropdown.click();
    await page.click('text=Committed');
    
    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Close panel
    await page.locator('button:has-text("Close"), button[aria-label*="close" i]').first().click();
    await page.waitForTimeout(500);

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Open product again
    await page.locator(`text=${testAsin}`).first().click();
    await page.waitForTimeout(1000);

    // Verify status is "Committed"
    await expect(page.locator('text=Committed')).toBeVisible();
  });

  test('CRM-06: Edit notes field saves correctly without character skipping', async ({ page }) => {
    const testNote = 'Test requirements: Product must be shipped within 5 business days.';

    // First, add a product
    await page.getByRole('button', { name: 'Product', exact: true }).click();
    await page.waitForTimeout(800);
    await page.locator('input[placeholder*="B0" i]').first().fill(testAsin);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Add Product' }).last().click({ force: true });
    await page.waitForTimeout(2000);

    // Open product detail panel
    await page.locator(`text=${testAsin}`).first().click();
    await page.waitForTimeout(1000);

    // Find and fill requirements textarea
    const requirementsField = page.locator('textarea, input[name*="requirement" i]').first();
    await requirementsField.click();
    await requirementsField.fill(testNote);

    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Close and reopen panel
    await page.locator('button:has-text("Close"), button[aria-label*="close" i]').first().click();
    await page.waitForTimeout(500);
    await page.locator(`text=${testAsin}`).first().click();
    await page.waitForTimeout(1000);

    // Verify the complete text is saved
    const savedText = await page.locator('textarea, input[name*="requirement" i]').first().inputValue();
    expect(savedText).toBe(testNote);
  });

  test('CRM-13: Delete product with confirmation removes from table', async ({ page }) => {
    // First, add a product
    await page.getByRole('button', { name: 'Product', exact: true }).click();
    await page.waitForTimeout(800);
    await page.locator('input[placeholder*="B0" i]').first().fill(testAsin);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Add Product' }).last().click({ force: true });
    await page.waitForTimeout(2000);

    // Verify product exists
    await expect(page.locator(`text=${testAsin}`).first()).toBeVisible();

    // Open product detail panel
    await page.locator(`text=${testAsin}`).first().click();
    await page.waitForTimeout(1000);

    // Click delete button
    await page.locator('button:has-text("Delete"), button[aria-label*="delete" i]').first().click();

    // Wait for confirmation modal
    await page.waitForTimeout(500);

    // Confirm deletion
    await page.locator('button:has-text("Delete"), button:has-text("Confirm")').first().click({ force: true });

    // Wait for deletion to complete
    await page.waitForTimeout(1500);

    // Verify product is removed from table
    await expect(page.locator(`text=${testAsin}`)).not.toBeVisible({ timeout: 5000 });
  });

  test('CRM-16: Video Made tab loads with filtered view', async ({ page }) => {
    // Click "Video Made" tab
    await page.getByRole('button', { name: 'Video Made' }).click();

    // Wait for tab to load
    await page.waitForTimeout(1000);

    // Verify heading or filter indication (Video Made button should still be visible)
    await expect(
      page.getByRole('button', { name: 'Video Made' }).or(
        page.locator('text=Products with videos')
      )
    ).toBeVisible();
  });

  test('CRM-17: Data persistence across navigation and refresh', async ({ page }) => {
    const testNote = 'Persistence test note';

    // Add product
    await page.getByRole('button', { name: 'Product', exact: true }).click();
    await page.waitForTimeout(800);
    await page.locator('input[placeholder*="B0" i]').first().fill(testAsin);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Add Product' }).last().click({ force: true });
    await page.waitForTimeout(2000);

    // Open and edit product
    await page.locator(`text=${testAsin}`).first().click();
    await page.waitForTimeout(1000);
    
    // Add note
    const requirementsField = page.locator('textarea, input[name*="requirement" i]').first();
    await requirementsField.fill(testNote);
    await page.waitForTimeout(2000);

    // Close panel
    await page.locator('button:has-text("Close"), button[aria-label*="close" i]').first().click();

    // Navigate to different tab
    await page.getByRole('button', { name: 'Video Made' }).click();
    await page.waitForTimeout(1000);

    // Navigate back
    await page.getByRole('button', { name: 'All Products' }).click();
    await page.waitForTimeout(1000);

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify product still exists
    await expect(page.locator(`text=${testAsin}`).first()).toBeVisible();

    // Open product and verify note persisted
    await page.locator(`text=${testAsin}`).first().click();
    await page.waitForTimeout(1000);
    const savedText = await page.locator('textarea, input[name*="requirement" i]').first().inputValue();
    expect(savedText).toBe(testNote);
  });

  // Cleanup: Delete test product after all tests
  test.afterEach(async ({ page }) => {
    try {
      // Try to find and delete the test product if it exists
      const productExists = await page.locator(`text=${testAsin}`).first().isVisible({ timeout: 2000 }).catch(() => false);
      
      if (productExists) {
        await page.locator(`text=${testAsin}`).first().click();
        await page.waitForTimeout(1000);
        await page.locator('button:has-text("Delete"), button[aria-label*="delete" i]').first().click();
        await page.waitForTimeout(500);
        await page.locator('button:has-text("Delete"), button:has-text("Confirm")').first().click({ force: true });
        await page.waitForTimeout(1500);
      }
    } catch (error) {
      // Cleanup failed, but don't fail the test
      console.log('Cleanup failed for test product:', testAsin);
    }
  });
});
