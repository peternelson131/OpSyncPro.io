import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe.serial('ASIN Correlation Finder Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    
    // Navigate to Influencer Central
    await page.goto('/asin-lookup');
    await page.waitForTimeout(500);

    // Click Asin Correlation Finder in sidebar
    await page.getByRole('button', { name: 'Asin Correlation Finder' }).click();
    
    // Wait for the page to load
    await page.waitForTimeout(1000);
  });

  test('CORR-01: Page loads with search input and Search button', async ({ page }) => {
    // Verify main heading
    await expect(page.getByRole('heading', { name: 'ASIN Correlation Finder', level: 1 })).toBeVisible({ timeout: 10000 });

    // Verify description paragraph
    await expect(page.getByText('Find similar and related Amazon products')).toBeVisible();

    // Verify ASIN input textbox
    const asinInput = page.getByRole('textbox', { name: /Enter ASIN/i }).or(
      page.getByPlaceholder(/B08N5WRWNW/i)
    );
    await expect(asinInput.first()).toBeVisible();

    // Verify Search button
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
  });

  test('CORR-02: Empty search shows validation or placeholder state', async ({ page }) => {
    // Verify the "getting started" heading is visible (placeholder state)
    await expect(page.getByRole('heading', { name: 'Enter an ASIN to get started', level: 3 })).toBeVisible();

    // Verify instructional paragraphs
    await expect(page.getByText('Find products similar to any Amazon listing')).toBeVisible();
    await expect(page.getByText('Tip: You can find an ASIN on any Amazon product page')).toBeVisible();
    await expect(page.getByText('Look in the product details section or the URL')).toBeVisible();
  });

  test('CORR-03: Search input accepts ASIN format text', async ({ page }) => {
    // Find the ASIN input field
    const asinInput = page.getByRole('textbox', { name: /Enter ASIN/i }).or(
      page.getByPlaceholder(/B08N5WRWNW/i)
    );

    // Type a test ASIN
    await asinInput.first().fill('B08N5WRWNW');

    // Verify the value is in the input
    await expect(asinInput.first()).toHaveValue('B08N5WRWNW');
  });

  test('CORR-04: Search button triggers search', async ({ page }) => {
    // Find and fill the ASIN input field
    const asinInput = page.getByRole('textbox', { name: /Enter ASIN/i }).or(
      page.getByPlaceholder(/B08N5WRWNW/i)
    );
    await asinInput.first().fill('B08N5WRWNW');

    // Click the Search button
    await page.getByRole('button', { name: 'Search' }).click();

    // Wait a moment for the search to initiate
    await page.waitForTimeout(1000);

    // Verify either:
    // 1. Loading state appears
    // 2. Results appear
    // 3. The "getting started" message disappears
    const searchTriggered = await page.getByText(/loading/i).isVisible({ timeout: 2000 }).catch(() => false) ||
                            await page.getByText(/result/i).isVisible({ timeout: 2000 }).catch(() => false) ||
                            !(await page.getByRole('heading', { name: 'Enter an ASIN to get started', level: 3 }).isVisible({ timeout: 2000 }).catch(() => true));

    // At least one indicator that search was triggered should be true
    expect(searchTriggered).toBeTruthy();
  });
});
