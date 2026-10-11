/**
 * Datos del responsable de LSMFit que usan los textos legales. Si algo cambia
 * (se constituye la empresa, cambia el correo), se cambia aquí y nada más.
 */
export const LEGAL = {
  /** Nombre completo del titular. Mientras sea null, los textos lo identifican por NIT. */
  holderName: null as string | null,
  holderKind: "persona natural",
  nit: "1006638898-9",
  city: "Riohacha",
  department: "La Guajira",
  email: "lsmfit.business@gmail.com",
  updatedAt: "10 de octubre de 2026",
  /** Debe coincidir con `app_terms_version` del backend. */
  appTermsVersion: "2026-10",
} as const;

/**
 * "Juan Pérez, persona natural identificada con NIT …" o, sin nombre, "la persona
 * natural titular de LSMFit…". `start` pone la mayúscula cuando abre la frase.
 */
export function legalHolder(start = true): string {
  if (LEGAL.holderName) return `${LEGAL.holderName}, ${LEGAL.holderKind} identificada con NIT ${LEGAL.nit}`;
  return `${start ? "La" : "la"} ${LEGAL.holderKind} titular de LSMFit, identificada con NIT ${LEGAL.nit}`;
}

export const LEGAL_PLACE = `${LEGAL.city}, ${LEGAL.department}, Colombia`;
