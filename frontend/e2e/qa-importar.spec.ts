import { test, expect } from "@playwright/test";
import { cuentaDePrueba, entrar } from "./helpers";

const OUT = process.env.QA_OUT || "test-results";

function csv(): Buffer {
  const vence = new Date(Date.now() + 20 * 86400000);
  const f = `${String(vence.getDate()).padStart(2, "0")}/${String(vence.getMonth() + 1).padStart(2, "0")}/${vence.getFullYear()}`;
  const n = () => String(1000000000 + Math.floor(Math.random() * 899999999));
  const rows = [
    "Cedula;Nombre;Sexo;Fecha Nac;Ciudad;Email;Telefono;Eps;Rh;Expectativa;Direccion;Ingreso por DNI;Entrenador;Plan;Fecha vencimiento",
    `${n()};MARÍA DE LOS ÁNGELES PÉREZ;Femenino;12/04/1995;MEDELLÍN;;300 123 4567;Sura;O POSITIVO;Bajar de peso;Cra 45 # 10-20;Si;Profe Inexistente;MENSUALIDAD VIP;${f}`,
    `${n()};Juan Restrepo;M;03/11/1988;Envigado;;3109876543;Nueva EPS;A-;Ganar masa;;No;;;`,
    `${n()};;F;;;;;;;;;;;;`,
  ];
  return Buffer.from(rows.join("\r\n"), "latin1");
}

test("importar socios desde el software anterior", async ({ page, request }) => {
  await cuentaDePrueba(request);
  await entrar(page);
  await page.goto("/members");
  await page.getByRole("button", { name: "Importar" }).click();
  await page.locator("#import-file").setInputFiles({ name: "clientes.csv", mimeType: "text/csv", buffer: csv() });
  await page.getByRole("button", { name: "Revisar archivo" }).click();
  await expect(page.getByText("2 nuevos")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/importar-vista-previa.png`, fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${OUT}/importar-vista-previa-movil.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: /Importar 2 personas/ }).click();
  await expect(page.getByText("2 completados").or(page.getByText("0 completados"))).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/importar-resultado.png` });
});
