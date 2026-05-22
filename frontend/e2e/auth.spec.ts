import { test, expect } from "@playwright/test";

test("login redirects to dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.fill('[type="email"]', "owner@test.com");
  await page.fill('[type="password"]', "testpass123");
  await page.click('[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
});

test("unauthenticated redirect to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("logout redirects to login", async ({ page }) => {
  // Login first
  await page.goto("/login");
  await page.fill('[type="email"]', "owner@test.com");
  await page.fill('[type="password"]', "testpass123");
  await page.click('[type="submit"]');
  await page.waitForURL(/\/dashboard/);
  // Logout
  await page.click('[aria-label="Cerrar sesión"]');
  await expect(page).toHaveURL(/\/login/);
});
