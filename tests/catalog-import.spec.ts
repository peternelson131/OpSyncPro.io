import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe.serial('Catalog Import Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    // Navigate to Influencer Central
    await page.goto('/asin-lookup');
    await page.waitForTimeout(500);

    // Click Catalog Import in sidebar
    await page.getByRole('button', { name: 'Catalog Import' }).click();

    // Wait for hash navigation
    await page.waitForURL('**/asin-lookup#catalog-import', { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('IMP-02: Catalog Import page loads with upload area', async ({ page }) => {
    // Verify Catalog Import heading
    await expect(page.getByRole('heading', { name: 'Catalog Import' })).toBeVisible({ timeout: 10000 });

    // Verify upload area exists - look for common upload UI elements
    await expect(
      page.getByRole('button', { name: /import/i }).or(
        page.getByRole('button', { name: /upload/i }).or(
          page.getByText(/drop/i).or(
            page.locator('input[type="file"]')
          )
        )
      ).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('IMP-03: Upload area accepts drag-and-drop (verify drop zone element exists)', async ({ page }) => {
    // Look for drop zone indicators - common patterns include:
    // - Text mentioning "drag" or "drop"
    // - File input elements
    // - Upload zone divs
    
    const dropZoneExists = await page.getByText(/drag.*drop/i).or(
      page.getByText(/drop.*file/i).or(
        page.locator('[class*="drop"]').or(
          page.locator('[class*="upload"]').or(
            page.locator('input[type="file"]')
          )
        )
      )
    ).first().isVisible({ timeout: 5000 }).catch(() => false);

    // Also check for file input which enables drag-and-drop
    const fileInputExists = await page.locator('input[type="file"]').count() > 0;

    // At least one of these should be true
    expect(dropZoneExists || fileInputExists).toBeTruthy();
  });

  test('IMP-04: File type validation (verify accepted file types shown)', async ({ page }) => {
    // Look for file type information in the UI
    // Common patterns: "CSV", "Excel", "XLS", "XLSX", ".csv", etc.
    
    const fileTypeInfo = await page.getByText(/csv/i).or(
      page.getByText(/excel/i).or(
        page.getByText(/xls/i).or(
          page.getByText(/file type/i).or(
            page.getByText(/format/i)
          )
        )
      )
    ).first().isVisible({ timeout: 5000 }).catch(() => false);

    // Also check file input accept attribute
    const fileInput = page.locator('input[type="file"]');
    const hasAcceptAttr = await fileInput.count() > 0 && 
                          await fileInput.getAttribute('accept').then(attr => attr !== null).catch(() => false);

    // At least one should indicate accepted file types
    expect(fileTypeInfo || hasAcceptAttr).toBeTruthy();
  });
});
