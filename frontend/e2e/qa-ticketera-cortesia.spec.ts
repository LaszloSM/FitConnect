import { test, expect } from "@playwright/test";
import { entrar, tokenDePrueba } from "./helpers";

const OUT = process.env.QA_OUT || "test-results";
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

test("ticketera en planes y cortesía en la ficha del socio", async ({ page, request }) => {
  const h = { Authorization: `Bearer ${await tokenDePrueba(request)}` };

  const plan = await request.post(`${API}/api/v1/member-plans/`, {
    headers: h,
    data: { name: `Ticketera 10 ${Date.now() % 10000}`, price: 60000, duration_days: 60, entries_total: 10 },
  });
  expect(plan.ok()).toBeTruthy();
  const planId = (await plan.json()).id;
  const doc = String(1000000000 + Math.floor(Math.random() * 899999999));
  const socio = await request.post(`${API}/api/v1/members`, {
    headers: h,
    data: {
      full_name: "Laura Ticketera", email: `laura-${doc}@test.co`, id_type: "CC", id_number: doc,
      phone: "3001112233", birth_date: "1995-05-10", address: "Calle 1 # 2-33", city: "Bogotá",
      emergency_contact_name: "Contacto", emergency_contact_phone: "3009998877",
      parq_answers: { q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false },
      plan_id: planId, consent_data: true,
    },
  });
  expect(socio.ok(), await socio.text()).toBeTruthy();
  const memberId = (await socio.json()).id;

  await entrar(page);
  await page.goto("/plans");
  await expect(page.getByText(/Ticketera · 10 entradas/).first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/planes-ticketera.png` });

  await page.goto(`/members/${memberId}`);
  await page.getByRole("tab", { name: "Membresías" }).click();
  await expect(page.getByText(/10 de 10 entradas disponibles|de 10 entradas disponibles/)).toBeVisible();
  await page.getByRole("button", { name: "Dar cortesía" }).click();
  await page.getByLabel("Motivo").fill("Semana de prueba");
  await page.screenshot({ path: `${OUT}/cortesia-dialogo.png` });
  await page.getByRole("button", { name: /Dar 7 días/ }).click();
  await expect(page.getByText("· cortesía").first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${OUT}/ficha-membresias.png`, fullPage: true });
});
