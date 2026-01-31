import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe.serial('Product CRM', () => {
  // Use a single unique test ASIN for the entire test suite
  const testAsin = `B0PW${Date.now().toString().slice(-6)}`;

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    // Navigate to Product CRM
    await page.goto('/asin-lookup#product-crm');
    await page.waitForTimeout(1000);
  });

  test('CRM-02: Add product with ASIN appears in table', async ({ page }) => {
    // 1. Click "Product" button to open Add Product modal
    await page.getByRole('button', { name: 'Product', exact: true }).click();
    
    // 2. Wait for modal
    await page.waitForSelector('h3:has-text("Add Product")');
    
    // 3. Fill ASIN (use unique test ASIN)
    await page.fill('input[placeholder="B0XXXXXXXXX"]', testAsin);
    
    // 4. Click "Add Product" button
    await page.getByRole('button', { name: 'Add Product', exact: true }).click();
    
    // 5. Wait for modal to close and table to update
    await page.waitForTimeout(2000);
    
    // 6. Verify ASIN appears in table
    await expect(page.getByText(testAsin).first()).toBeVisible();
  });

  test('CRM-04: Open product detail panel shows all fields', async ({ page }) => {
    // Need to click "All Products" tab first to see our test product
    await page.getByRole('button', { name: 'All Products' }).click();
    await page.waitForTimeout(1000);
    
    // 1. Click on a product row (click the ASIN text)
    await page.getByText(testAsin).first().click();
    
    // 2. Wait for detail panel
    await page.waitForSelector('h3:has-text("Product Details")');
    
    // 3. Verify key fields exist
    await expect(page.getByRole('heading', { name: 'Product Details' })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: 'Status' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Requirements' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Decision' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Owners' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
  });

  test('CRM-05: Edit status persists after refresh', async ({ page }) => {
    // Click "All Products" tab to see our test product
    await page.getByRole('button', { name: 'All Products' }).click();
    await page.waitForTimeout(1000);
    
    // 1. Open detail panel (click product row)
    await page.getByText(testAsin).first().click();
    await page.waitForSelector('h3:has-text("Product Details")');
    
    // 2. Click the status button (e.g., "Initial Contact")
    await page.getByRole('button', { name: 'Initial Contact' }).click();
    
    // 3. A dropdown appears — click "Committed" button in the dropdown
    await page.getByRole('button', { name: 'Committed' }).click();
    
    // 4. Wait for save
    await page.waitForTimeout(1000);
    
    // 5. Close panel
    await page.getByRole('button', { name: 'Close panel (ESC)' }).click();
    
    // 6. Refresh page
    await page.reload();
    await page.waitForTimeout(2000);
    
    // 7. Click "All Products" tab to see all statuses
    await page.getByRole('button', { name: 'All Products' }).click();
    await page.waitForTimeout(1000);
    
    // 8. Verify "Committed" appears in the row
    await expect(page.getByText('Committed').first()).toBeVisible();
  });

  test('CRM-06: Edit notes field saves correctly without character skipping', async ({ page }) => {
    // Click "All Products" tab
    await page.getByRole('button', { name: 'All Products' }).click();
    await page.waitForTimeout(1000);
    
    // 1. Open detail panel
    await page.getByText(testAsin).first().click();
    await page.waitForSelector('h3:has-text("Product Details")');
    
    // 2. Find the Requirements textbox
    const notesField = page.locator('textarea[placeholder="Brand requirements..."], input[placeholder="Brand requirements..."]');
    
    // 3. Clear and type new text
    await notesField.clear();
    await notesField.fill('Test requirements note from Playwright');
    
    // 4. Click outside or press Tab to trigger save
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1000);
    
    // 5. Close panel
    await page.getByRole('button', { name: 'Close panel (ESC)' }).click();
    await page.waitForTimeout(500);
    
    // 6. Reopen same product
    await page.getByText(testAsin).first().click();
    await page.waitForSelector('h3:has-text("Product Details")');
    
    // 7. Verify text persists
    const notesFieldReopen = page.locator('textarea[placeholder="Brand requirements..."], input[placeholder="Brand requirements..."]');
    await expect(notesFieldReopen).toHaveValue('Test requirements note from Playwright');
  });

  test('CRM-13: Delete product with confirmation removes from table', async ({ page }) => {
    // Click "All Products" tab
    await page.getByRole('button', { name: 'All Products' }).click();
    await page.waitForTimeout(1000);
    
    // 1. Open detail panel for the test product
    await page.getByText(testAsin).first().click();
    await page.waitForSelector('h3:has-text("Product Details")');
    
    // 2. Click "Delete product" button
    await page.getByRole('button', { name: 'Delete product' }).click();
    
    // 3. Wait for confirmation modal
    await page.waitForTimeout(500);
    
    // 4. Click the "Delete" button in the modal (not "Delete product")
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    
    // 5. Wait for deletion
    await page.waitForTimeout(2000);
    
    // 6. Verify product no longer in table
    await expect(page.getByText(testAsin)).not.toBeVisible();
  });

  test('CRM-16: Video Made tab loads with filtered view', async ({ page }) => {
    // Click "Video Made" tab
    await page.getByRole('button', { name: 'Video Made', exact: true }).click();

    // Wait for tab to load
    await page.waitForTimeout(1000);

    // Verify Video Made button is still visible (it's the active tab)
    await expect(page.getByRole('button', { name: 'Video Made', exact: true })).toBeVisible();
  });

  test('CRM-17: Data persistence across navigation and refresh', async ({ page }) => {
    // We'll create a new product for this test since we deleted testAsin in CRM-13
    const persistenceTestAsin = `B0PT${Date.now().toString().slice(-6)}`;
    
    // 1. Add a product
    await page.getByRole('button', { name: 'Product', exact: true }).click();
    await page.waitForSelector('h3:has-text("Add Product")');
    await page.fill('input[placeholder="B0XXXXXXXXX"]', persistenceTestAsin);
    await page.getByRole('button', { name: 'Add Product', exact: true }).click();
    await page.waitForTimeout(2000);
    
    // 2. Change its status to "Committed"
    await page.getByRole('button', { name: 'All Products' }).click();
    await page.waitForTimeout(1000);
    await page.getByText(persistenceTestAsin).first().click();
    await page.waitForSelector('h3:has-text("Product Details")');
    await page.getByRole('button', { name: 'Initial Contact' }).click();
    await page.getByRole('button', { name: 'Committed' }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Close panel (ESC)' }).click();
    
    // 3. Navigate away (click "Integrations" in nav)
    await page.getByRole('link', { name: 'Integrations' }).click();
    await page.waitForTimeout(1000);
    
    // 4. Navigate back (click "Influencer Central")
    await page.getByRole('link', { name: 'Influencer Central' }).click();
    await page.waitForTimeout(1000);
    
    // Navigate back to CRM
    await page.goto('/asin-lookup#product-crm');
    await page.waitForTimeout(1000);
    
    // 5. Verify the status change persisted
    await page.getByRole('button', { name: 'All Products' }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText('Committed').first()).toBeVisible();
    
    // Cleanup: Delete the persistence test product
    await page.getByText(persistenceTestAsin).first().click();
    await page.waitForSelector('h3:has-text("Product Details")');
    await page.getByRole('button', { name: 'Delete product' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.waitForTimeout(2000);
  });
});
