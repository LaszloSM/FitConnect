import { test, expect } from "@playwright/test";

import { cuentaDePrueba, entrar } from "./helpers";

/**
 * Configuración se quedaba en negro: el menú lateral se veía, el área de
 * contenido no, y de forma intermitente.
 *
 * Era la única pantalla que cargaba sus 12 secciones con `next/dynamic` y sin
 * fallback: si un chunk no llegaba (típico tras un despliegue, cuando el
 * navegador conserva el HTML viejo y pide chunks que ya no existen), no se
 * renderizaba nada y no aparecía ningún error en pantalla.
 *
 * Este test falla si el contenido no se pinta, y vigila de paso los errores de
 * hidratación de React, que dejarían la pantalla en un estado parecido.
 */


test("la pantalla de Configuración pinta su contenido, no solo el menú", async ({
  page,
  request,
}) => {
  const errores: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errores.push(msg.text());
  });
  page.on("pageerror", (err) => errores.push(String(err)));

  const email = await cuentaDePrueba(request);
  await entrar(page, email);

  await page.goto("/settings");

  // El contenido de la sección, no solo la navegación lateral.
  await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();
  await expect(page.getByText("Cambiar contraseña")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("form input").first()).toBeVisible();

  // Cambiar de pestaña también debe pintar contenido.
  await page.getByRole("button", { name: "Gimnasio" }).click();
  await expect(page.locator("input").first()).toBeVisible({ timeout: 20_000 });

  const hidratacion = errores.filter(
    (e) => /minified react error #(418|423|425)/i.test(e) || /hydrat/i.test(e),
  );
  expect(hidratacion, `errores de hidratación:\n${hidratacion.join("\n")}`).toHaveLength(0);
});
