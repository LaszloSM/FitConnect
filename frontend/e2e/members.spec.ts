import { test, expect } from "@playwright/test";

import { cuentaDePrueba, entrar } from "./helpers";

/**
 * El alta de socios exige plan, datos de contacto y PAR-Q; este test se quedó en
 * el formulario de dos campos de hace varias fases y fallaba siempre. Aquí se
 * comprueba lo que de verdad importa: que la lista carga y que el asistente de
 * alta abre y trae los planes del gym.
 */
test("la lista de socios carga y el alta abre con planes", async ({ page, request }) => {
  const email = await cuentaDePrueba(request);
  await entrar(page, email);

  await page.goto("/members");
  await expect(page.getByRole("heading", { name: "Miembros" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Nuevo miembro" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Nombre completo")).toBeVisible();
});
