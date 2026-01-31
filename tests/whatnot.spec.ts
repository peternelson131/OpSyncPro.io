import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe.serial('WhatNot Analysis Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    
    // Navigate to Influencer Central
    await page.goto('/asin-lookup');
    await page.waitForTimeout(500);

    // Click WhatNot Analysis in sidebar
    await page.getByRole('button', { name: 'WhatNot Analysis' }).click();
    
    // Wait for the page to load (check for heading instead of URL)
    await page.waitForTimeout(1000);
  });

  test('WN-02: Page loads with file upload area and expected columns list', async ({ page }) => {
    // Verify main heading
    await expect(page.getByRole('heading', { name: 'WhatNot Lot Analysis', level: 1 })).toBeVisible({ timeout: 10000 });

    // Verify description paragraph
    await expect(page.getByText('Import manifests, enrich with Keepa, assess demand')).toBeVisible();

    // Verify Choose File button exists
    await expect(page.getByRole('button', { name: 'Choose File' })).toBeVisible();

    // Verify upload area text
    await expect(page.getByText('Drop WhatNot manifest here')).toBeVisible();
    await expect(page.getByText(/or click to browse/i)).toBeVisible();

    // Verify "Expected columns:" section exists
    await expect(page.getByText('Expected columns:')).toBeVisible();

    // Verify required column listed
    await expect(page.getByText(/ASIN.*required/i)).toBeVisible();

    // Verify optional columns are listed
    await expect(page.getByText(/Item Description.*Title/i)).toBeVisible();
    await expect(page.getByText(/Qty.*Quantity/i)).toBeVisible();
    await expect(page.getByText(/Unit Retail.*Price/i)).toBeVisible();
    await expect(page.getByText(/Brand.*Condition.*Lot ID.*optional/i)).toBeVisible();
  });

  test('WN-03: Upload area shows supported file types', async ({ page }) => {
    // Verify supported file types are displayed
    await expect(page.getByText(/\.xlsx.*\.xls.*\.csv/i).or(
      page.getByText(/Supports.*xlsx.*xls.*csv/i)
    )).toBeVisible();

    // Alternatively, check if file input has accept attribute
    const fileInput = page.locator('input[type="file"]');
    const fileInputExists = await fileInput.count() > 0;
    
    if (fileInputExists) {
      const acceptAttr = await fileInput.getAttribute('accept');
      // Accept attribute should include xlsx, xls, or csv
      const hasFileTypeValidation = acceptAttr && (
        acceptAttr.includes('xlsx') || 
        acceptAttr.includes('xls') || 
        acceptAttr.includes('csv') ||
        acceptAttr.includes('spreadsheet')
      );
      
      // Either visible text or accept attribute should indicate file types
      expect(hasFileTypeValidation).toBeTruthy();
    }
  });

  test('WN-04: Expected columns are listed (ASIN required, plus optional columns)', async ({ page }) => {
    // Verify ASIN is marked as required
    const asinListItem = page.getByRole('listitem').filter({ hasText: /ASIN/i });
    await expect(asinListItem).toBeVisible();
    await expect(asinListItem).toContainText(/required/i);

    // Verify Item Description / Title is listed
    await expect(page.getByRole('listitem').filter({ 
      hasText: /Item Description.*Title/i 
    })).toBeVisible();

    // Verify Qty / Quantity is listed
    await expect(page.getByRole('listitem').filter({ 
      hasText: /Qty.*Quantity/i 
    })).toBeVisible();

    // Verify Unit Retail / Price is listed
    await expect(page.getByRole('listitem').filter({ 
      hasText: /Unit Retail.*Price/i 
    })).toBeVisible();

    // Verify optional columns are listed
    await expect(page.getByRole('listitem').filter({ 
      hasText: /Brand.*Condition.*Lot ID.*optional/i 
    })).toBeVisible();
  });

  test('WN-05: Choose File button is present and clickable', async ({ page }) => {
    // Verify Choose File button is visible
    const chooseFileButton = page.getByRole('button', { name: 'Choose File' });
    await expect(chooseFileButton).toBeVisible();

    // Verify file input element exists and is configured correctly
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();

    // Verify accept attribute has correct file types
    const acceptAttr = await fileInput.getAttribute('accept');
    expect(acceptAttr).toContain('xlsx');
    expect(acceptAttr).toContain('xls');
    expect(acceptAttr).toContain('csv');
  });
});
