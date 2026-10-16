import { expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Los e2e usaban una cuenta fija (`owner@test.com`) que no existe en ninguna base:
 * fallaban siempre y nadie los miraba.
 *
 * Ahora la cuenta se crea sola la primera vez y se reutiliza. Es una cuenta fija a
 * propósito: `/auth/register` tiene rate limit (5/min) y Playwright corre cada
 * archivo en su propio worker, así que registrar por test tumba la suite.
 */
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const EMAIL = "e2e-playwright@test.co";
export const PASSWORD = "TestQA123!";

// `/auth/login` admite 10 intentos por minuto y los archivos corren en paralelo: un
// login crudo puede recibir 429 y la prueba sigue con «Bearer undefined». El token
// se guarda por proceso y un 429 se espera en vez de leerse como falla.
let cachedToken: string | null = null;

async function loginConEspera(request: APIRequestContext) {
  for (let intento = 0; intento < 8; intento++) {
    const res = await request.post(`${API}/api/v1/auth/login`, { data: { email: EMAIL, password: PASSWORD } });
    if (res.status() !== 429) return res;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  return request.post(`${API}/api/v1/auth/login`, { data: { email: EMAIL, password: PASSWORD } });
}

export async function cuentaDePrueba(request: APIRequestContext) {
  if (cachedToken) return EMAIL;
  // Se intenta entrar primero: si la cuenta ya existe no se toca `/auth/register`,
  // que además de rate limit crearía un gym nuevo en cada corrida.
  const login = await loginConEspera(request);
  if (login.ok()) {
    cachedToken = (await login.json()).access_token as string;
    return EMAIL;
  }

  const res = await request.post(`${API}/api/v1/auth/register`, {
    data: {
      email: EMAIL,
      password: PASSWORD,
      full_name: "QA Playwright",
      gym_name: "Gym QA Playwright",
      city: "Bogota",
      country: "CO",
    },
  });
  expect(
    [201, 400],
    `no se pudo preparar la cuenta de pruebas: ${res.status()} ${await res.text()}`,
  ).toContain(res.status());
  return EMAIL;
}

/** Token del dueño de la cuenta de pruebas, para preparar datos por API. */
export async function tokenDePrueba(request: APIRequestContext): Promise<string> {
  await cuentaDePrueba(request);
  if (cachedToken) return cachedToken;
  const res = await loginConEspera(request);
  expect(res.ok(), `no se pudo entrar con la cuenta de pruebas: ${res.status()} ${await res.text()}`).toBeTruthy();
  cachedToken = (await res.json()).access_token as string;
  return cachedToken;
}

export async function entrar(page: Page, email: string = EMAIL, password: string = PASSWORD) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|entrenador)/, { timeout: 30_000 });
}
