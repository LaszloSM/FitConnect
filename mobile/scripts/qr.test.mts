/**
 * El QR del celular tiene que dar el mismo código que el servidor.
 * Vector compartido con backend/tests/test_app_mobile.py (QR_VECTOR).
 *   node --experimental-strip-types --test scripts/qr.test.mts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { bogotaDay, dayKey, totp } from "../src/lib/qr.ts";

const VECTOR: [number, string][] = [
  [1791435599, "525483"], // 23:59:59 del 7 de octubre en Bogotá
  [1791435600, "473293"], // 00:00:00 del 8: cambia la llave del día
  [1791478799, "604036"],
];

test("el código coincide con el del servidor", () => {
  for (const [at, code] of VECTOR) {
    const key = dayKey("JBSWY3DPEHPK3PXP", bogotaDay(at * 1000));
    assert.equal(totp(key, Math.floor(at / 30)), code);
  }
});

test("la fecha es la de Bogotá, no la del celular", () => {
  assert.equal(bogotaDay(1791435599 * 1000), "2026-10-07");
  assert.equal(bogotaDay(1791435600 * 1000), "2026-10-08");
});
