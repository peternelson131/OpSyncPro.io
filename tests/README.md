# OpSyncPro E2E Test Suite

Automated end-to-end tests for OpSyncPro UAT using Playwright.

## Prerequisites

- Node.js 18+ installed
- Access to UAT environment: `https://uat.opsyncpro.io`
- Test credentials configured in `.env.test`

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install chromium
   ```

3. **Configure test credentials:**
   
   Create a `.env.test` file in the project root (already gitignored):
   ```env
   TEST_EMAIL=your-test-email@example.com
   TEST_PASSWORD=your-test-password
   ```

## Running Tests

### Run all tests
```bash
npm run test:e2e
```

### Run specific test file
```bash
npx playwright test tests/auth.spec.ts
```

### Run tests in headed mode (see browser)
```bash
npx playwright test --headed
```

### Run tests in debug mode
```bash
npx playwright test --debug
```

### Run tests with UI mode (interactive)
```bash
npx playwright test --ui
```

## Test Structure

```
tests/
├── helpers/
│   └── auth.ts           # Shared authentication helper
├── auth.spec.ts          # Authentication tests (login, logout, password reset)
├── product-crm.spec.ts   # Product CRM tests (add, edit, delete, persistence)
├── pages.spec.ts         # Page load tests (all main pages)
└── README.md             # This file
```

## Test Coverage

### Authentication Tests (`auth.spec.ts`)
- ✅ AUTH-01: Login with valid credentials
- ✅ AUTH-02: Password reset page display
- ✅ AUTH-03: Logout clears session

### Product CRM Tests (`product-crm.spec.ts`)
- ✅ CRM-02: Add product with ASIN
- ✅ CRM-04: Open product detail panel
- ✅ CRM-05: Edit product status with persistence
- ✅ CRM-06: Edit notes field without character skipping
- ✅ CRM-13: Delete product with confirmation
- ✅ CRM-16: Video Made tab filtered view
- ✅ CRM-17: Data persistence across navigation

### Page Load Tests (`pages.spec.ts`)
- ✅ IMP-01: Catalog Import page
- ✅ LIST-01: Listings page
- ✅ ACCT-01: Account Settings page
- ✅ INT-01: Integrations page
- ✅ WN-01: WhatNot Analysis page
- ✅ QL-01: Quick List settings page

**Total Tests:** 16

## Test Data Cleanup

All product CRM tests use unique test ASINs and include automatic cleanup in `afterEach` hooks. Test products are deleted after each test to avoid data pollution.

## Reports

After running tests, view the HTML report:
```bash
npx playwright show-report
```

## Troubleshooting

### Tests fail with timeout
- Increase timeout in `playwright.config.ts`
- Check if UAT environment is accessible
- Run with `--headed` to see what's happening

### Login fails
- Verify credentials in `.env.test`
- Check if password was recently changed
- Run auth tests first: `npx playwright test tests/auth.spec.ts --headed`

### Products not deleting
- Check afterEach cleanup logic
- Manually verify test products don't exist before running
- Check Supabase database for orphaned test data

### Selectors not finding elements
- Run with `--headed` to inspect the UI
- Use Playwright Inspector: `npx playwright test --debug`
- Check if UI changed (update selectors accordingly)

## CI/CD Integration

To run tests in CI:
```bash
# Set environment variables
export TEST_EMAIL="your-email"
export TEST_PASSWORD="your-password"

# Run tests
npm run test:e2e
```

Tests are configured to:
- Run with retries (2 retries on failure)
- Capture screenshots on failure
- Capture videos on failure
- Run in parallel (configurable in playwright.config.ts)

## Reference

These tests are based on the manual regression test results documented in:
`/Users/jcsdirect/clawd/memory/regression-results-v2.md`

All test case IDs (AUTH-XX, CRM-XX, etc.) correspond to the manual test cases for traceability.
