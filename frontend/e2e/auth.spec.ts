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

  // El botón vive en el pie del menú lateral (expandido) o como icono (colapsado).
  await page.getByRole("button", { name: "Cerrar sesión" }).first().click();
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
});
