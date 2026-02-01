import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for OpSyncPro UAT
 */
export default defineConfig({
  testDir: './tests/e2e',
  
  /* Run tests in files in parallel */
  fullyParallel: false,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests */
  workers: 1,
  
  /* Reporter to use */
  reporter: [
    ['html'],
    ['list']
  ],
  
  /* Shared settings for all the projects below */
  use: {
    /* Base URL */
    baseURL: 'https://uat.opsyncpro.io',
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Screenshots on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure */
    video: 'retain-on-failure',
    
    /* Extended timeout for network operations */
    actionTimeout: 30000,
    navigationTimeout: 60000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  /* Timeout per test */
  timeout: 120000,
});
