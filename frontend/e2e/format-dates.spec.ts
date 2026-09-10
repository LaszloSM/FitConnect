import { test, expect } from "@playwright/test";

import {
  formatDate,
  formatDateTime,
  parseDateOnly,
  todayISO,
  daysUntil,
  isExpired,
  GYM_TIMEZONE,
} from "../lib/format";

/**
 * El backend devuelve timestamps UTC sin zona y fechas puras "YYYY-MM-DD".
 * Interpretarlos con `new Date()` corría las horas 5h y los vencimientos un día:
 * un socio registrado el 9/9 a las 20:45 aparecía como "10 sep".
 *
 * Las horas de prueba son justo las que rompían: después de las 19:00 de Bogotá.
 */

test("un instante de las 20:45 de Bogotá se muestra el mismo día, no al siguiente", () => {
  // 2026-09-10T01:45Z == 2026-09-09 20:45 en Bogotá
  expect(formatDate("2026-09-10T01:45:51.448647", "yyyy-MM-dd")).toBe("2026-09-09");
  expect(formatDateTime("2026-09-10T01:45:51.448647", "yyyy-MM-dd HH:mm")).toBe(
    "2026-09-09 20:45",
  );
});

test("un timestamp que ya trae zona se respeta", () => {
  expect(formatDate("2026-09-10T01:45:00Z", "yyyy-MM-dd")).toBe("2026-09-09");
});

test("una fecha pura se muestra tal cual: nada de mostrar el día anterior", () => {
  // `new Date("2026-09-10")` es medianoche UTC = 19:00 del 09 en Bogotá.
  expect(formatDate("2026-09-10", "yyyy-MM-dd")).toBe("2026-09-10");
  expect(parseDateOnly("2026-09-10").getDate()).toBe(10);
});

test("el vencimiento de hoy no cuenta como vencido", () => {
  expect(isExpired(todayISO())).toBe(false);
  expect(daysUntil(todayISO())).toBe(0);
});

test("los días restantes son de calendario, no dependen del reloj del navegador", () => {
  expect(daysUntil("2026-09-12") - daysUntil("2026-09-10")).toBe(2);
  expect(isExpired("2000-01-01")).toBe(true);
  expect(isExpired("2099-01-01")).toBe(false);
});

test("todayISO da la fecha del gym, no la UTC", () => {
  const esperado = new Intl.DateTimeFormat("en-CA", { timeZone: GYM_TIMEZONE }).format(
    new Date(),
  );
  expect(todayISO()).toBe(esperado);
  expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("un valor inválido no rompe la pantalla", () => {
  expect(formatDate("no-es-fecha")).toBe("—");
});
