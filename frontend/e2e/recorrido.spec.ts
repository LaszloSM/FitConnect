import { test, expect, type Page } from "@playwright/test";

import { cuentaDePrueba, entrar } from "./helpers";
import { cuentaDeStaff, ENTRENADOR, idDeUnSocio, RECEPCION, sembrarGym } from "./datos";

/**
 * Recorrido visual: siembra el gym de pruebas, entra con los tres roles y guarda
 * una captura de cada pantalla en claro, oscuro y móvil. No compara píxeles;
 * comprueba que ninguna pantalla muestre un error genérico ni desborde en móvil,
 * y deja las imágenes en `test-results/recorrido/` para revisar el diseño.
 */
const DUENO = [
  ["hoy", "/dashboard"],
  ["mostrador", "/checkins"],
  ["socios", "/members"],
  ["ficha", "FICHA"],
  ["caja", "/payments"],
  ["turno", "/payments/cash"],
  ["clases", "/classes"],
  ["agenda", "/classes/agenda"],
  ["informe", "/reports"],
  ["planes", "/plans"],
  ["maquinas", "/machines"],
  ["rutinas", "/routines"],
  ["mensajes", "/messages"],
  ["auditoria", "/audit"],
  ["ajustes", "/settings"],
] as const;

const RECEPCION_PANTALLAS = [
  ["hoy", "/dashboard"],
  ["mostrador", "/checkins"],
  ["socios", "/members"],
  ["caja", "/payments"],
] as const;

const ENTRENADOR_PANTALLAS = [
  ["mi-dia", "/entrenador"],
  ["socios", "/members"],
  ["rutinas", "/routines"],
  ["clases", "/classes"],
] as const;

test.describe.configure({ mode: "serial" });

async function capturar(page: Page, archivo: string, ruta: string, movil = false) {
  await page.goto(ruta);
  await page.waitForLoadState("load");
  await page.waitForFunction(() => !document.querySelector("[aria-busy=true]"), null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await expect(page.getByText("Error cargando", { exact: false })).toHaveCount(0);
  if (movil) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    // Si se desborda, nombrar a los culpables: sin esto el log de CI solo dice «8 px».
    const culpables = overflow > 1 ? await page.evaluate(() => {
      const w = window.innerWidth;
      return [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > w + 1)
        .filter((el) => !el.parentElement || el.parentElement.getBoundingClientRect().right <= w + 1)
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)} «${(el.textContent || "").trim().slice(0, 40)}» right=${Math.round(el.getBoundingClientRect().right)}`);
    }) : [];
    expect(overflow, `${ruta} desborda en móvil: ${culpables.join(" | ")}`).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: `test-results/recorrido/${archivo}.png`, fullPage: true });
}

async function tema(page: Page, oscuro: boolean) {
  await page.evaluate((d) => localStorage.setItem("theme", d ? "dark" : "light"), oscuro);
}

test("recorrido visual del dueño", async ({ page, request }) => {
  test.setTimeout(420_000);
  const email = await cuentaDePrueba(request);
  await sembrarGym(request);
  await entrar(page, email);

  const socio = await idDeUnSocio(request);
  const ruta = (r: string) => (r === "FICHA" ? (socio ? `/members/${socio}` : "/members") : r);

  for (const oscuro of [false, true]) {
    await tema(page, oscuro);
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [nombre, r] of DUENO) {
      await capturar(page, `${oscuro ? "oscuro" : "claro"}-${nombre}`, ruta(r));
    }
  }

  await tema(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [nombre, r] of DUENO.slice(0, 6)) {
    await capturar(page, `movil-${nombre}`, ruta(r), true);
  }
});

test("recorrido visual de recepción y entrenador", async ({ browser, request }) => {
  test.setTimeout(240_000);
  await cuentaDePrueba(request);
  for (const [email, rol, pantallas] of [
    [RECEPCION, "receptionist", RECEPCION_PANTALLAS],
    [ENTRENADOR, "trainer", ENTRENADOR_PANTALLAS],
  ] as const) {
    await cuentaDeStaff(request, email, rol);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await entrar(page, email);
    const prefijo = rol === "trainer" ? "entrenador" : "recepcion";
    for (const [nombre, r] of pantallas) {
      await capturar(page, `${prefijo}-${nombre}`, r);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await capturar(page, `${prefijo}-movil-${pantallas[0][0]}`, pantallas[0][1], true);
    await context.close();
  }
});

const PUBLICAS = [
  ["landing", "/"],
  ["login", "/login"],
  ["registro", "/register"],
  ["terminos", "/terminos"],
  ["kiosko", "/kiosk"],
  ["pantalla", "/screen"],
] as const;

test("recorrido visual de las superficies públicas", async ({ page }) => {
  test.setTimeout(120_000);
  for (const [nombre, r] of PUBLICAS) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await capturar(page, `publica-${nombre}`, r);
    await page.setViewportSize({ width: 390, height: 844 });
    await capturar(page, `publica-movil-${nombre}`, r, true);
  }
});
