import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  const email = process.env.TEST_EMAIL || 'petenelson13@gmail.com';
  const password = process.env.TEST_PASSWORD || 'PlDHqf8XXKsgBt';

  test('AUTH-01: Login with valid credentials redirects to Product CRM', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Fill in credentials
    await page.fill('input[placeholder="Enter your username"]', email);
    await page.fill('input[placeholder="Enter your password"]', password);

    // Click sign in button
    await page.click('button:has-text("Sign In")');

    // Wait for redirect to Product CRM
    await page.waitForURL('**/asin-lookup#product-crm', { timeout: 10000 });

    // Verify we're on the Product CRM page
    expect(page.url()).toContain('asin-lookup#product-crm');
    
    // Verify page loaded successfully by checking for the heading
    await expect(page.getByRole('heading', { name: 'Product CRM' })).toBeVisible();
  });

  test('AUTH-02: Password reset page displays correctly', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Click "Forgot password?" link
    await page.click('button:has-text("Forgot password?")');

    // Wait for password reset page to load
    await page.waitForLoadState('networkidle');

    // Verify heading (use h3 role to avoid multiple matches)
    await expect(page.locator('h3:has-text("Reset Your Password")')).toBeVisible();

    // Verify email field exists (look for any input field on password reset page)
    await expect(page.locator('input').first()).toBeVisible();

    // Verify send reset link button
    await expect(page.locator('button:has-text("Send Reset Link")')).toBeVisible();

    // Verify back to login link
    await expect(page.locator('text=Back to Login').or(page.locator('text=Back to login'))).toBeVisible();
  });

  test('AUTH-03: Logout clears session and redirects to login', async ({ page }) => {
    // First, login
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.fill('input[placeholder="Enter your username"]', email);
    await page.fill('input[placeholder="Enter your password"]', password);
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/asin-lookup#product-crm', { timeout: 10000 });

    // Now logout
    // Look for logout button (might be in nav, dropdown, or sidebar)
    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Log out"), a:has-text("Logout"), a:has-text("Log out")').first();
    await logoutButton.click();

    // Wait for redirect to login page
    await page.waitForURL('**/login', { timeout: 10000 });

    // Verify we're on login page
    expect(page.url()).toContain('/login');
    await expect(page.locator('input[placeholder="Enter your username"]')).toBeVisible();
  });
});
