import { test, expect } from "@playwright/test";
import { cuentaDePrueba, entrar } from "./helpers";

const OUT = process.env.QA_OUT || "test-results";
const SERIAL = process.env.QA_SERIAL || "QA-EMU-0001";

test("conectar un torniquete y registrar la huella al crear el socio", async ({ page, request }) => {
  test.setTimeout(180_000);
  await cuentaDePrueba(request);
  await entrar(page);

  await page.goto("/settings?tab=kiosk");
  await page.getByRole("button", { name: /Torniquete/ }).first().click();
  await page.getByPlaceholder("Torniquete entrada principal").fill("Torniquete QA");
  await page.getByPlaceholder("Ej. CQZ7224560123").fill(SERIAL);
  await page.screenshot({ path: `${OUT}/torniquete-crear.png` });
  await page.getByRole("button", { name: "Crear" }).click();
  await expect(page.getByText("Ahora configura el equipo")).toBeVisible();
  await page.screenshot({ path: `${OUT}/torniquete-instrucciones.png`, fullPage: true });
  await expect(page.getByText("Conectado", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/torniquete-estado.png`, fullPage: true });

  // Socio nuevo: registrar su huella en el torniquete desde la ficha › Acceso
  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const login = await request.post(`${API}/api/v1/auth/login`, { data: { email: "e2e-playwright@test.co", password: "TestQA123!" } });
  const h = { Authorization: `Bearer ${(await login.json()).access_token}` };
  const plan = await request.post(`${API}/api/v1/member-plans/`, { headers: h, data: { name: `Mensual QA ${Date.now() % 10000}`, price: 80000, duration_days: 30 } });
  const doc = String(1000000000 + Math.floor(Math.random() * 899999999));
  const socio = await request.post(`${API}/api/v1/members`, {
    headers: h,
    data: {
      full_name: "Carlos Torniquete", email: `carlos-${doc}@test.co`, id_type: "CC", id_number: doc,
      phone: "3001112233", birth_date: "1990-05-10", address: "Calle 1 # 2-33", city: "Bogotá",
      emergency_contact_name: "Contacto", emergency_contact_phone: "3009998877",
      parq_answers: { q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false },
      plan_id: (await plan.json()).id, consent_data: true,
    },
  });
  expect(socio.ok(), await socio.text()).toBeTruthy();
  const memberId = (await socio.json()).id;

  await page.goto(`/members/${memberId}`);
  await page.getByRole("tab", { name: "Acceso" }).click();
  await expect(page.getByText("Registrar en el torniquete")).toBeVisible();
  await page.screenshot({ path: `${OUT}/ficha-acceso.png`, fullPage: true });
  await page.locator("label", { hasText: "uso de su huella" }).locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: "Registrar huella" }).click();
  await expect(page.getByText("Listo. Ya puede entrar.")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${OUT}/ficha-huella-lista.png`, fullPage: true });
});
