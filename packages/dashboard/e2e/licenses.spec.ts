import { test, expect } from '@playwright/test';

test.describe('License Management', () => {
  // Setup authenticated context
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        json: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            roles: ['USER'],
          },
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    });

    // Mock licenses API
    await page.route('**/api/licenses', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            licenses: [
              {
                id: 'license-1',
                key: 'XXXX-XXXX-XXXX-1111',
                type: 'STANDARD',
                status: 'ACTIVE',
                product: { name: 'Product 1' },
                currentActivations: 1,
                maxActivations: 3,
                expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                createdAt: new Date().toISOString(),
              },
              {
                id: 'license-2',
                key: 'YYYY-YYYY-YYYY-2222',
                type: 'PREMIUM',
                status: 'ACTIVE',
                product: { name: 'Product 2' },
                currentActivations: 0,
                maxActivations: 5,
                expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                createdAt: new Date().toISOString(),
              },
            ],
            total: 2,
            page: 1,
            limit: 10,
          },
        });
      }
    });

    await page.goto('/dashboard/licenses');
  });

  test('should display licenses list', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Licenses');
    await expect(page.locator('text=XXXX-XXXX-XXXX-1111')).toBeVisible();
    await expect(page.locator('text=YYYY-YYYY-YYYY-2222')).toBeVisible();
    await expect(page.locator('text=Product 1')).toBeVisible();
    await expect(page.locator('text=Product 2')).toBeVisible();
  });

  test('should show license status badges', async ({ page }) => {
    const activeeBadges = page.locator('.badge:has-text("ACTIVE")');
    await expect(activeeBadges).toHaveCount(2);
  });

  test('should display activation counts', async ({ page }) => {
    await expect(page.locator('text=1 / 3')).toBeVisible();
    await expect(page.locator('text=0 / 5')).toBeVisible();
  });

  test('should filter licenses by status', async ({ page }) => {
    // Mock filtered API response
    await page.route('**/api/licenses?status=ACTIVE', async (route) => {
      await route.fulfill({
        json: {
          licenses: [
            {
              id: 'license-1',
              key: 'XXXX-XXXX-XXXX-1111',
              type: 'STANDARD',
              status: 'ACTIVE',
              product: { name: 'Product 1' },
              currentActivations: 1,
              maxActivations: 3,
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              createdAt: new Date().toISOString(),
            },
          ],
          total: 1,
        },
      });
    });

    // Select status filter
    await page.selectOption('select[name="status"]', 'ACTIVE');
    await page.waitForResponse('**/api/licenses?status=ACTIVE');

    await expect(page.locator('text=XXXX-XXXX-XXXX-1111')).toBeVisible();
  });

  test('should search licenses', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('XXXX');

    // Mock search API response
    await page.route('**/api/licenses?search=XXXX', async (route) => {
      await route.fulfill({
        json: {
          licenses: [
            {
              id: 'license-1',
              key: 'XXXX-XXXX-XXXX-1111',
              type: 'STANDARD',
              status: 'ACTIVE',
              product: { name: 'Product 1' },
              currentActivations: 1,
              maxActivations: 3,
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              createdAt: new Date().toISOString(),
            },
          ],
          total: 1,
        },
      });
    });

    await page.waitForResponse('**/api/licenses?search=XXXX');
    await expect(page.locator('text=XXXX-XXXX-XXXX-1111')).toBeVisible();
    await expect(page.locator('text=YYYY-YYYY-YYYY-2222')).not.toBeVisible();
  });

  test('should navigate to license details', async ({ page }) => {
    await page.route('**/api/licenses/license-1', async (route) => {
      await route.fulfill({
        json: {
          id: 'license-1',
          key: 'XXXX-XXXX-XXXX-1111',
          type: 'STANDARD',
          status: 'ACTIVE',
          product: {
            id: 'product-1',
            name: 'Product 1',
            description: 'Test product',
          },
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            username: 'testuser',
          },
          currentActivations: 1,
          maxActivations: 3,
          activations: [
            {
              id: 'activation-1',
              hardwareId: 'hardware-123',
              deviceName: 'Test Device',
              ipAddress: '192.168.1.1',
              activatedAt: new Date().toISOString(),
              lastSeenAt: new Date().toISOString(),
            },
          ],
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    });

    await page.click('text=XXXX-XXXX-XXXX-1111');
    await page.waitForURL('**/licenses/license-1');

    await expect(page.locator('h1')).toContainText('License Details');
    await expect(page.locator('text=XXXX-XXXX-XXXX-1111')).toBeVisible();
    await expect(page.locator('text=Test Device')).toBeVisible();
    await expect(page.locator('text=192.168.1.1')).toBeVisible();
  });
});

test.describe('Admin License Management', () => {
  test.beforeEach(async ({ page }) => {
    // Mock admin authentication
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        json: {
          user: {
            id: 'admin-user-id',
            email: 'admin@example.com',
            name: 'Admin User',
            roles: ['ADMIN'],
          },
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    });

    await page.goto('/dashboard/licenses');
  });

  test('should show create license button for admin', async ({ page }) => {
    await expect(page.locator('text=Create License')).toBeVisible();
  });

  test('should open create license modal', async ({ page }) => {
    await page.click('text=Create License');
    await expect(page.locator('h2:has-text("Create New License")')).toBeVisible();
    await expect(page.locator('select[name="type"]')).toBeVisible();
    await expect(page.locator('input[name="maxActivations"]')).toBeVisible();
  });

  test('should create a new license', async ({ page }) => {
    // Mock products API
    await page.route('**/api/products', async (route) => {
      await route.fulfill({
        json: [
          { id: 'product-1', name: 'Product 1' },
          { id: 'product-2', name: 'Product 2' },
        ],
      });
    });

    // Mock users API
    await page.route('**/api/users', async (route) => {
      await route.fulfill({
        json: [
          { id: 'user-1', email: 'user1@example.com', username: 'user1' },
          { id: 'user-2', email: 'user2@example.com', username: 'user2' },
        ],
      });
    });

    // Mock license creation
    await page.route('**/api/licenses', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          json: {
            id: 'new-license',
            key: 'ZZZZ-ZZZZ-ZZZZ-3333',
            type: 'PREMIUM',
            status: 'ACTIVE',
            userId: 'user-1',
            productId: 'product-1',
            maxActivations: 5,
            currentActivations: 0,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
          },
        });
      }
    });

    await page.click('text=Create License');

    // Fill form
    await page.selectOption('select[name="type"]', 'PREMIUM');
    await page.selectOption('select[name="productId"]', 'product-1');
    await page.selectOption('select[name="userId"]', 'user-1');
    await page.fill('input[name="maxActivations"]', '5');
    await page.fill('input[name="expiresInDays"]', '365');

    // Submit
    await page.click('button:has-text("Create")');

    // Verify success
    await expect(page.locator('text=License created successfully')).toBeVisible();
  });

  test('should revoke a license', async ({ page }) => {
    // Mock license details
    await page.route('**/api/licenses/license-1', async (route) => {
      await route.fulfill({
        json: {
          id: 'license-1',
          key: 'XXXX-XXXX-XXXX-1111',
          type: 'STANDARD',
          status: 'ACTIVE',
          product: { name: 'Product 1' },
          user: { email: 'user@example.com' },
          currentActivations: 1,
          maxActivations: 3,
        },
      });
    });

    // Mock revoke API
    await page.route('**/api/licenses/license-1/revoke', async (route) => {
      await route.fulfill({
        json: {
          id: 'license-1',
          status: 'REVOKED',
        },
      });
    });

    await page.goto('/dashboard/licenses/license-1');
    await page.click('button:has-text("Revoke License")');

    // Confirm in dialog
    await page.click('button:has-text("Confirm Revoke")');

    // Verify success
    await expect(page.locator('text=License revoked successfully')).toBeVisible();
  });
});