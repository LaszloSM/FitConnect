import { test, type Page } from "@playwright/test";

import { entrar } from "./helpers";

/**
 * Regenera las capturas del producto que usa la landing (`public/landing`).
 * Solo corre a pedido y con un gimnasio con historia:
 *   python scripts/seed_demo_gym.py --gym "Fuerza Norte" --owner "Laura Méndez" --city Riohacha
 *   python backend/scripts/seed_ml_history.py --slug <slug>   (y entrenar modelos)
 *   CAPTURAR_LANDING=demo-xxxx@demo.example.com npx playwright test capturas-landing
 *   cd public/landing && for f in *.png; do ffmpeg -i "$f" -c:v libwebp -quality 88 "${f%.png}.webp"; done && rm *.png
 * Cada captura es una pantalla distinta: la landing no repite ninguna.
 */
const DEMO_PASSWORD = "DemoGym123!";

const ESCRITORIO = [
  ["panel", "/dashboard"],
  ["mostrador", "/checkins"],
  ["cobro", "/payments"],
  ["caja", "/payments/cash"],
  ["clases", "/classes/agenda"],
  ["asistencia", "/reports?tab=asistencia"],
  ["inteligencia", "/reports?tab=inteligencia"],
  ["socios", "/members"],
  ["maquinas", "/machines"],
  ["ingresos", "/reports?tab=ingresos"],
] as const;

async function lista(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForFunction(() => !document.querySelector("[aria-busy=true]"), null, { timeout: 30_000 }).catch(() => {});
  // Sin el indicador de desarrollo de Next ni avisos flotantes encima.
  await page.addStyleTag({ content: "nextjs-portal,[data-sonner-toaster]{display:none!important}" });
  await page.waitForTimeout(1500);
}

test.skip(!process.env.CAPTURAR_LANDING, "solo a pedido");

test("capturas de la landing", async ({ page }) => {
  test.setTimeout(240_000);
  await entrar(page, process.env.CAPTURAR_LANDING!, DEMO_PASSWORD);
  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.setViewportSize({ width: 1440, height: 900 });
  // La sugerencia de activar los dos pasos se pospone (30 días) para que no tape el panel.
  await page.goto("/dashboard");
  await lista(page);
  await page.getByRole("button", { name: "Ahora no" }).click().catch(() => {});

  // Socios reales del demo: uno para el cobro y otro con historia para la ficha.
  const { accessToken } = await page.evaluate(() => fetch("/api/auth/session").then((r) => r.json()));
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const buscar = async (offset: number) => {
    const r = await page.request.get(`${api}/api/v1/members?limit=50&offset=${offset}&member_type=member&q=ejemplo.co`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const items = (await r.json()) as { id: string; status?: string }[];
    return items.find((m) => m.status === "active") ?? items[0];
  };
  // Los más recientes los creó seed_demo_gym (con plan): sirven para cobrar.
  // Más atrás están los de seed_ml_history, con meses de pagos y visitas para la ficha.
  const socio = await buscar(0);
  const conHistoria = await buscar(40);

  for (const [nombre, ruta] of ESCRITORIO) {
    await page.goto(nombre === "cobro" ? `${ruta}?member=${socio.id}` : ruta);
    await lista(page);
    if (nombre === "clases") {
      // La semana que viene completa: la actual ya va por la mitad.
      await page.getByRole("button", { name: "Semana siguiente" }).click({ timeout: 5000 }).catch(() => {});
      await lista(page);
    }
    if (nombre === "socios") {
      await page.getByLabel("Filtrar por tipo de persona").selectOption("member").catch(() => {});
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: `public/landing/${nombre}.png` });
  }

  await page.goto(`/members/${conHistoria.id}`);
  await lista(page);
  await page.screenshot({ path: "public/landing/ficha.png" });

  // El mismo panel en el celular del dueño.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await lista(page);
  await page.screenshot({ path: "public/landing/panel-movil.png" });
});
