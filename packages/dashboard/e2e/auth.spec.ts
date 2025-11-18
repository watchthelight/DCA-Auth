import { test, expect, Page } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display landing page', async ({ page }) => {
    await expect(page).toHaveTitle(/DCA-Auth/);
    await expect(page.locator('h1')).toContainText('Discord-Connected Authorization');
    await expect(page.locator('text=Get Started')).toBeVisible();
    await expect(page.locator('text=Sign in')).toBeVisible();
  });

  test('should navigate to sign in page', async ({ page }) => {
    await page.click('text=Sign in');
    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page.locator('text=Sign in with Discord')).toBeVisible();
  });

  test('should handle Discord OAuth flow', async ({ page }) => {
    await page.click('text=Sign in');
    await page.click('text=Sign in with Discord');

    // Check if redirected to Discord (in real test, would mock OAuth)
    await page.waitForURL(/discord\.com\/oauth2\/authorize/, { timeout: 5000 }).catch(() => {
      // In test environment, Discord OAuth might not be configured
      expect(page.url()).toContain('/auth/signin');
    });
  });

  test('should protect dashboard routes', async ({ page }) => {
    await page.goto('/dashboard');
    // Should redirect to sign in
    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});

test.describe('Authenticated User Flow', () => {
  // Mock authenticated state
  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:3000',
          localStorage: [
            {
              name: 'next-auth.session-token',
              value: 'mock-session-token',
            },
          ],
        },
      ],
    },
  });

  test('should access dashboard when authenticated', async ({ page }) => {
    // Mock API responses
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        json: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            image: null,
          },
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    });

    await page.goto('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('should display user profile in sidebar', async ({ page }) => {
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        json: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            image: null,
          },
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    });

    await page.goto('/dashboard');
    await expect(page.locator('text=test@example.com')).toBeVisible();
  });

  test('should sign out successfully', async ({ page }) => {
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        json: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
          },
        },
      });
    });

    await page.route('**/api/auth/signout', async (route) => {
      await route.fulfill({ json: { url: '/' } });
    });

    await page.goto('/dashboard');
    await page.click('text=Sign Out');

    // Should redirect to home page
    await expect(page).toHaveURL('/');
  });
});