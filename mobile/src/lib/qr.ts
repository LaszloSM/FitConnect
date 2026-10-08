/**
 * QR de entrada que cambia cada 30 segundos y se genera sin internet.
 * Mismo algoritmo que backend/app/services/app_accounts.py:
 *   llave del día = HMAC-SHA1(llave del vínculo, "AAAA-MM-DD" de Bogotá)
 *   código       = TOTP (RFC 6238) de 6 dígitos con esa llave
 *   contenido    = "FC2.<vínculo>.<código>"
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha1 } from "@noble/hashes/legacy.js";

import type { QrInfo } from "./types";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Uint8Array {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of input.toUpperCase().replace(/=+$/, "")) {
    const idx = ALPHABET.indexOf(ch);
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

/** Fecha de Bogotá (UTC-5, Colombia no cambia de hora). */
export function bogotaDay(ms: number): string {
  return new Date(ms - 5 * 3600_000).toISOString().slice(0, 10);
}

export function dayKey(secret: string, day: string): Uint8Array {
  return hmac(sha1, base32Decode(secret), new TextEncoder().encode(day));
}

export function totp(key: Uint8Array, counter: number, digits = 6): string {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const mac = hmac(sha1, key, msg);
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export function qrPayload(info: QrInfo, now = Date.now()): { value: string; secondsLeft: number } {
  const counter = Math.floor(now / 1000 / info.period);
  const code = totp(dayKey(info.secret, bogotaDay(now)), counter, info.digits);
  const secondsLeft = info.period - Math.floor((now / 1000) % info.period);
  return { value: `${info.prefix}${info.ref}.${code}`, secondsLeft };
}
