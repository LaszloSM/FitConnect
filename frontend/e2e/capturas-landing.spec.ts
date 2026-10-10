import { test } from "@playwright/test";

import { entrar } from "./helpers";

/**
 * Regenera las capturas del producto que usa la landing (`public/landing`).
 * Solo corre a pedido y con un gym con historia (`scripts/seed_demo_gym.py` +
 * `backend/scripts/seed_ml_history.py`):
 *   CAPTURAR_LANDING=demo-xxxx@demo.example.com npx playwright test capturas-landing
 * Los nombres del gym y del dueño demo se cambian en pantalla por unos creíbles;
 * todo lo demás es la interfaz real con esos datos.
 */
const DEMO_PASSWORD = "DemoGym123!";

const CAPTURAS = [
  ["panel", "/dashboard"],
  ["socios", "/members"],
  ["cobro", "/payments"],
  ["asistencia", "/reports?tab=asistencia"],
  ["inteligencia", "/reports?tab=inteligencia"],
] as const;

test.skip(!process.env.CAPTURAR_LANDING, "solo a pedido");

test("capturas de la landing", async ({ page }) => {
  test.setTimeout(180_000);
  await entrar(page, process.env.CAPTURAR_LANDING!, DEMO_PASSWORD);
  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const [nombre, ruta] of CAPTURAS) {
    await page.goto(ruta);
    await page.waitForLoadState("load");
    await page.waitForFunction(() => !document.querySelector("[aria-busy=true]"), null, { timeout: 30_000 }).catch(() => {});
    if (nombre === "socios") {
      await page.getByLabel("Filtrar por tipo de persona").selectOption("member");
    }
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const cambios: [RegExp, string][] = [
        [/Gym Demo \w+/gi, "Gimnasio Fuerza Norte"],
        [/Laszlo Demo/g, "Laura Méndez"],
        [/\bLD\b/g, "LM"],
      ];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        let t = n.nodeValue ?? "";
        for (const [re, v] of cambios) t = t.replace(re, v);
        n.nodeValue = t;
      }
    });
    await page.screenshot({ path: `public/landing/${nombre}.png` });
  }
});
