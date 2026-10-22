import { expect, test } from "@playwright/test";

/** La landing en el celular: sin scroll horizontal, menú que abre y cierra, botones cómodos. */
for (const width of [360, 390, 430]) {
  test(`landing a ${width} px no se desborda y el menú funciona`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(desborde).toBeLessThanOrEqual(0);

    const cta = page.getByRole("main").getByRole("link", { name: /Prueba 30 días gratis/ }).first();
    const caja = await cta.boundingBox();
    expect(caja?.height).toBeGreaterThanOrEqual(44);
    expect(caja?.width).toBeGreaterThan(width - 60);

    await page.getByRole("button", { name: "Abrir menú" }).click();
    const menu = page.locator("#menu-movil");
    await expect(menu.getByRole("link", { name: "Precios" })).toBeVisible();
    await menu.getByRole("link", { name: "Precios" }).click();
    await expect(menu).toBeHidden();
    await expect(page.getByRole("heading", { name: "Precios por sede, en pesos" })).toBeInViewport();
  });
}

test("con movimiento reducido no queda nada invisible", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const invisibles = await page.evaluate(() => [...document.querySelectorAll("[data-reveal]")].filter((el) => getComputedStyle(el).opacity === "0").length);
  expect(invisibles).toBe(0);
  await ctx.close();
});
