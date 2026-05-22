import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.fill('[type="email"]', "owner@test.com");
  await page.fill('[type="password"]', "testpass123");
  await page.click('[type="submit"]');
  await page.waitForURL(/\/dashboard/);
});

test("can create and view a member", async ({ page }) => {
  await page.goto("/members");
  await page.click("text=Nuevo miembro");
  // full_name input has no placeholder; select by label text
  await page.getByLabel("Nombre completo").fill("Test User Playwright");
  await page.getByLabel("Email").fill(`playwright-${Date.now()}@test.com`);
  await page.click("text=Crear miembro");
  await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
  await expect(page.locator(`text=Test User Playwright`)).toBeVisible();
});
