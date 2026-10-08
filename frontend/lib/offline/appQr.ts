"use client";

import type { Snapshot } from "./store";

/**
 * QR de la app del socio sin conexión: `FC2.<vínculo>.<código de 6 dígitos>`.
 * El código es un TOTP de 30 s con la llave del día (la copia de recepción solo
 * trae las de hoy y mañana). Se acepta la ventana anterior y la siguiente.
 */

const PERIOD = 30;

function base32(input: string): Uint8Array<ArrayBuffer> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/=+$/, "");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function totp(secret: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", base32(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new ArrayBuffer(8);
  new DataView(msg).setUint32(4, counter);
  new DataView(msg).setUint32(0, Math.floor(counter / 2 ** 32));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

/** Fecha de Bogotá (UTC-5, sin horario de verano) de un instante. */
function bogotaDay(ms: number): string {
  return new Date(ms - 5 * 3600_000).toISOString().slice(0, 10);
}

export function isAppQr(raw: string): boolean {
  return /^FC2\.[0-9a-f]{32}\.\d{6}$/i.test(raw.trim());
}

/** → id del socio si el QR es válido ahora con la copia local; si no, null. */
export async function matchAppQr(raw: string, snapshot: Snapshot, now = Date.now()): Promise<string | null> {
  if (!isAppQr(raw)) return null;
  const [, ref, code] = raw.trim().split(".");
  const entry = snapshot.app_qr?.[ref.toLowerCase()];
  if (!entry) return null;
  const counter = Math.floor(now / 1000 / PERIOD);
  for (const delta of [-1, 0, 1]) {
    const at = (counter + delta) * PERIOD * 1000;
    const key = entry.keys[bogotaDay(at)];
    if (key && (await totp(key, counter + delta)) === code) return entry.member_id;
  }
  return null;
}
