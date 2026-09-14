import { test, expect } from "@playwright/test";

import { cuentaDePrueba, entrar } from "./helpers";

/**
 * Recorrido visual: entra con la cuenta de pruebas y guarda una captura de cada
 * pantalla del staff en escritorio, oscuro y móvil. No compara píxeles; comprueba
 * que ninguna pantalla muestre un error genérico y deja las imágenes para revisar
 * el diseño con datos reales.
 */
const PANTALLAS = [
  ["hoy", "/dashboard"],
  ["mostrador", "/checkins"],
  ["socios", "/members"],
  ["caja", "/payments"],
  ["clases", "/classes"],
  ["informe", "/reports"],
  ["ajustes", "/settings"],
] as const;

test.describe.configure({ mode: "serial" });

test("recorrido visual de las pantallas del staff", async ({ page, request }) => {
  test.setTimeout(240_000);
  const email = await cuentaDePrueba(request);
  await entrar(page, email);

  for (const tema of ["claro", "oscuro"] as const) {
    await page.evaluate((t) => localStorage.setItem("theme", t === "oscuro" ? "dark" : "light"), tema);
    for (const [nombre, ruta] of PANTALLAS) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(ruta);
      await page.waitForLoadState("load");
      await page.waitForFunction(() => !document.querySelector("[aria-busy=true]"), null, { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await expect(page.getByText("Error cargando", { exact: false })).toHaveCount(0);
      await page.screenshot({ path: `test-results/recorrido/${tema}-${nombre}.png`, fullPage: true });
    }
  }

  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [nombre, ruta] of PANTALLAS.slice(0, 4)) {
    await page.goto(ruta);
    await page.waitForLoadState("load");
    await page.waitForFunction(() => !document.querySelector("[aria-busy=true]"), null, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${ruta} desborda en móvil`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/recorrido/movil-${nombre}.png`, fullPage: true });
  }
});
