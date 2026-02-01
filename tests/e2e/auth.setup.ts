import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const authFile = '.auth/user.json';

/**
 * Authentication setup for all tests
 * Logs in with Pete's test credentials
 */
setup('authenticate', async ({ page }) => {
  const email = 'petenelson13@gmail.com';
  const password = 'TempPass2026!';
  
  console.log('🔐 Authenticating as:', email);
  
  // Navigate to UAT
  await page.goto('/');
  
  // Wait for page to load
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  
  // Find username and password fields
  const usernameInput = page.locator('input[placeholder*="username" i], input[name="username"], input[type="text"]').first();
  const passwordInput = page.locator('input[placeholder*="password" i], input[name="password"], input[type="password"]').first();
  
  // Fill in credentials
  await usernameInput.fill(email);
  await passwordInput.fill(password);
  
  console.log('Credentials filled, clicking Sign In...');
  
  // Click Sign In button
  const signInButton = page.locator('button:has-text("Sign In")').first();
  await signInButton.click();
  
  console.log('Waiting for navigation...');
  
  // Wait for URL to change (indicates successful login)
  await page.waitForURL(url => !url.pathname.includes('login') && !url.pathname.includes('sign'), { timeout: 60000 });
  
  // Wait for page to fully load
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  
  // Give it a bit more time to render
  await page.waitForTimeout(3000);
  
  // Verify we're logged in by checking for app elements
  const appElements = page.locator('text=/Product CRM|Catalog|ASIN Catalog|CRM|Influencer/i');
  const isLoggedIn = await appElements.first().isVisible({ timeout: 10000 }).catch(() => false);
  
  if (isLoggedIn) {
    console.log('✅ Login successful - app loaded');
  } else {
    console.log('⚠️ Warning: App elements not immediately visible, but continuing...');
  }
  
  // Ensure .auth directory exists
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  
  // Save session state
  await page.context().storageState({ path: authFile });
  
  console.log('✅ Session state saved');
});
