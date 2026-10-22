import { test, expect } from "@playwright/test";

import { cuentaDePrueba, entrar } from "./helpers";

test("entrar lleva al dashboard", async ({ page, request }) => {
  const email = await cuentaDePrueba(request);
  await entrar(page, email);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("sin sesión, el dashboard manda al login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("cerrar sesión vuelve al login", async ({ page, request }) => {
  const email = await cuentaDePrueba(request);
  await entrar(page, email);

  // El riel arranca colapsado: cerrar sesión está en el menú de la cuenta.
  await page.getByRole("button", { name: "Cuenta" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).first().click();
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
});
