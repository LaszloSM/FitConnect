import { expect, type APIRequestContext } from "@playwright/test";

import { EMAIL, PASSWORD } from "./helpers";

/**
 * Datos para el recorrido visual. Un gym vacío solo muestra estados vacíos, así
 * que se siembra una vez con planes, socios, entradas y cobros por la API real.
 * Es idempotente: si el gym ya tiene socios no vuelve a crear nada.
 */
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const RECEPCION = "e2e-recepcion@test.co";
export const ENTRENADOR = "e2e-entrenador@test.co";

const SOCIOS = [
  "Valentina Ríos", "Andrés Felipe Gómez", "Camila Restrepo", "Juan David Martínez",
  "Laura Sofía Cárdenas", "Santiago Ospina", "Mariana Zapata", "Sebastián Herrera",
  "Daniela Muñoz", "Mateo Londoño", "Isabella Vargas", "Nicolás Salazar",
];

// `/auth/login` admite 10 intentos por minuto: sin caché, el recorrido se queda sin token a mitad de camino.
const tokens = new Map<string, string>();

async function token(request: APIRequestContext, email: string, staff = false) {
  const guardado = tokens.get(email);
  if (guardado) return guardado;
  const res = await request.post(`${API}/api/v1/auth/${staff ? "staff/" : ""}login`, {
    data: { email, password: PASSWORD },
  });
  if (!res.ok()) return null;
  const nuevo = (await res.json()).access_token as string;
  tokens.set(email, nuevo);
  return nuevo;
}

function socio(nombre: string, i: number, planId: string) {
  const doc = String(1_020_300_000 + i * 7919);
  return {
    full_name: nombre,
    email: `e2e.socio${i}@test.co`,
    id_type: "CC",
    id_number: doc,
    phone: `30012345${String(i).padStart(2, "0")}`,
    birth_date: `199${i % 10}-0${(i % 9) + 1}-1${i % 9}`,
    address: `Calle ${10 + i} # 4-2${i % 10}`,
    city: "Bogotá",
    emergency_contact_name: "Contacto QA",
    emergency_contact_phone: "3009876543",
    parq_answers: Object.fromEntries(Array.from({ length: 7 }, (_, k) => [`q${k + 1}`, false])),
    plan_id: planId,
    consent_data: true,
  };
}

export async function sembrarGym(request: APIRequestContext) {
  const owner = await token(request, EMAIL);
  expect(owner, "la cuenta de pruebas no pudo entrar").toBeTruthy();
  const headers = { Authorization: `Bearer ${owner}` };

  // El recorrido de bienvenida taparía todas las capturas.
  await request.post(`${API}/api/v1/onboarding/tour-complete`, { headers });

  const existentes = await request.get(`${API}/api/v1/members?limit=5`, { headers });
  if (existentes.ok() && (await existentes.json()).length >= 5) {
    await cobrarPendientes(request, headers);
    return;
  }

  const planes: string[] = [];
  for (const plan of [
    { name: "Mensual", price: 120000, duration_days: 30 },
    { name: "Trimestral", price: 320000, duration_days: 90 },
    { name: "Semestral", price: 590000, duration_days: 180 },
  ]) {
    const res = await request.post(`${API}/api/v1/member-plans/`, { headers, data: plan });
    expect(res.ok(), `plan ${plan.name}: ${res.status()} ${await res.text()}`).toBeTruthy();
    planes.push((await res.json()).id);
  }

  // Sin turno abierto la caja no acepta efectivo.
  await request.post(`${API}/api/v1/cash/shifts/open`, { headers, data: { opening_amount: 100000 } });

  const ids: string[] = [];
  for (const [i, nombre] of SOCIOS.entries()) {
    const base = socio(nombre, i, planes[i % planes.length]);
    const metodo = i % 4 === 3 ? "transfer" : i % 4 === 2 ? undefined : "cash";
    let res = await request.post(`${API}/api/v1/members`, { headers, data: { ...base, payment_method: metodo } });
    if (!res.ok()) res = await request.post(`${API}/api/v1/members`, { headers, data: base });
    expect(res.ok(), `socio ${nombre}: ${res.status()} ${await res.text()}`).toBeTruthy();
    ids.push((await res.json()).id);
  }

  for (const id of ids.slice(0, 8)) {
    await request.post(`${API}/api/v1/checkins`, { headers, data: { member_id: id } });
  }
  await cobrarPendientes(request, headers);
}

/** Confirma los cobros en efectivo del alta para que "Cobrado hoy" tenga datos; las transferencias quedan por confirmar. */
async function cobrarPendientes(request: APIRequestContext, headers: Record<string, string>) {
  await request.post(`${API}/api/v1/cash/shifts/open`, { headers, data: { opening_amount: 100000 } });
  const socios = await request.get(`${API}/api/v1/members?limit=50`, { headers });
  if (!socios.ok()) return;
  for (const m of (await socios.json()) as { id: string }[]) {
    const pagos = await request.get(`${API}/api/v1/members/${m.id}/payments`, { headers });
    if (!pagos.ok()) continue;
    for (const p of (await pagos.json()) as { id: string; status: string; method: string | null }[]) {
      if (p.status === "pending" && p.method === "cash") {
        await request.patch(`${API}/api/v1/payments/${p.id}/mark-paid`, { headers });
      }
    }
  }
}

/** Crea (o reutiliza) una cuenta de staff del gym de pruebas con el flujo real de invitación. */
export async function cuentaDeStaff(request: APIRequestContext, email: string, role: "receptionist" | "trainer") {
  if (await token(request, email, true)) return email;
  const owner = await token(request, EMAIL);
  const invite = await request.post(`${API}/api/v1/users/invite`, {
    headers: { Authorization: `Bearer ${owner}` },
    data: { email, full_name: role === "trainer" ? "Tatiana Entrenadora" : "Ricardo Recepción", role },
  });
  expect(invite.ok(), `invitación ${email}: ${invite.status()} ${await invite.text()}`).toBeTruthy();
  const tokenInvitacion = new URL((await invite.json()).invite_url).searchParams.get("token");
  const accept = await request.post(`${API}/api/v1/auth/staff/accept-invite`, {
    data: { token: tokenInvitacion, password: PASSWORD },
  });
  expect(accept.ok(), `aceptar ${email}: ${accept.status()} ${await accept.text()}`).toBeTruthy();
  return email;
}

export async function idDeUnSocio(request: APIRequestContext) {
  const owner = await token(request, EMAIL);
  const res = await request.get(`${API}/api/v1/members?limit=1&q=Valentina`, { headers: { Authorization: `Bearer ${owner}` } });
  expect(res.ok(), `no se pudo buscar un socio: ${res.status()}`).toBeTruthy();
  const [primero] = await res.json();
  return primero?.id as string | undefined;
}
