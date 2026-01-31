import { Page } from '@playwright/test';

/**
 * Login helper function for authenticated tests
 * Logs in with test credentials and waits for redirect to Product CRM
 */
export async function loginAsUser(page: Page): Promise<void> {
  const email = process.env.TEST_EMAIL || 'petenelson13@gmail.com';
  const password = process.env.TEST_PASSWORD || 'PlDHqf8XXKsgBt';

  // Navigate to login page
  await page.goto('/login');

  // Wait for login form to be visible
  await page.waitForLoadState('networkidle');

  // Fill in credentials using placeholder selectors
  await page.fill('input[placeholder="Enter your username"]', email);
  await page.fill('input[placeholder="Enter your password"]', password);

  // Click sign in button
  await page.click('button:has-text("Sign In")');

  // Wait for redirect to Product CRM
  await page.waitForURL('**/asin-lookup#product-crm', { timeout: 10000 });
  
  // Wait for page to be fully loaded
  await page.waitForLoadState('networkidle');
}
