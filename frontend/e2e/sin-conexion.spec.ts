import { expect, test } from "@playwright/test";

import { EMAIL, PASSWORD, cuentaDePrueba, entrar } from "./helpers";

/**
 * Recepción sin internet: con la red cortada se recarga el Mostrador (no sale
 * el "dinosaurio"), se busca a un socio en la copia local, se registra su
 * entrada y, al volver la red, la entrada sube una sola vez.
 *
 * El service worker solo existe en la compilación de producción: esta prueba
 * corre contra `next build && next start` (así lo hace CI con docker compose).
 */
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

test("el Mostrador sigue funcionando sin internet y sube lo pendiente sin duplicar", async ({ page, context, request }) => {
  test.setTimeout(120_000);
  await cuentaDePrueba(request);
  const login = await request.post(`${API}/api/v1/auth/login`, { data: { email: EMAIL, password: PASSWORD } });
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` };

  const plan = await request.post(`${API}/api/v1/member-plans/`, {
    headers, data: { name: `Mensual sin red ${Date.now()}`, price: 90000, duration_days: 30 },
  });
  expect(plan.ok(), await plan.text()).toBeTruthy();
  const cedula = String(1_090_000_000 + Math.floor(Math.random() * 9_000_000));
  const socio = await request.post(`${API}/api/v1/members`, {
    headers,
    data: {
      full_name: "Socia Sin Red", email: `sinred.${cedula}@test.co`, id_type: "CC", id_number: cedula,
      phone: "3001112233", birth_date: "1994-03-12", address: "Calle 1 # 2-3", city: "Riohacha",
      emergency_contact_name: "Contacto", emergency_contact_phone: "3009998877",
      parq_answers: Object.fromEntries(Array.from({ length: 7 }, (_, k) => [`q${k + 1}`, false])),
      plan_id: (await plan.json()).id, consent_data: true,
    },
  });
  expect(socio.ok(), await socio.text()).toBeTruthy();
  const memberId = (await socio.json()).id as string;
  const entradas = async () => {
    const r = await request.get(`${API}/api/v1/members/${memberId}/checkins`, { headers });
    return ((await r.json()) as unknown[]).length;
  };
  const antes = await entradas();

  await entrar(page);
  await page.goto("/checkins");
  // El navegador queda listo: service worker activo y copia de socios guardada.
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 30_000 });
  // `waitForFunction` no espera promesas (una promesa siempre es "verdadera"):
  // la copia se consulta con `evaluate` dentro de un poll.
  const copiaGuardada = () =>
    page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const req = indexedDB.open("fitconnect-offline");
          req.onerror = () => resolve(false);
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("data")) return resolve(false);
            const get = db.transaction("data").objectStore("data").get("snapshot");
            get.onsuccess = () => resolve(Boolean(get.result));
            get.onerror = () => resolve(false);
          };
        }),
    );
  await expect.poll(copiaGuardada, { timeout: 30_000, intervals: [1_000] }).toBe(true);

  await context.setOffline(true);
  await page.reload();
  const buscar = page.getByPlaceholder("Cédula o nombre");
  await expect(buscar).toBeVisible({ timeout: 20_000 });
  await buscar.fill(cedula);
  await page.getByText("Socia Sin Red").first().click();
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await expect(page.getByText(/por subir/i).first()).toBeVisible({ timeout: 10_000 });
  expect(await entradas()).toBe(antes);

  await context.setOffline(false);
  await expect.poll(entradas, { timeout: 60_000, intervals: [2_000] }).toBe(antes + 1);
  // Unos segundos más: un reintento no debe crear otra entrada.
  await page.waitForTimeout(25_000);
  expect(await entradas()).toBe(antes + 1);
});
