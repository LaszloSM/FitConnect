#!/usr/bin/env node
/**
 * Contraste de los tokens de color, en claro y en oscuro.
 *
 * El contraste se degradaba de forma distinta en cada pantalla porque nadie lo
 * medía: el volt como TEXTO daba 1.8:1 sobre una tarjeta blanca y nadie se
 * enteraba. Esto lee los tokens de `app/globals.css`, calcula el ratio WCAG de
 * cada par que el producto usa de verdad y falla si alguno baja del mínimo.
 *
 *   node scripts/check-contrast.mjs          # tabla + salida 1 si algo falla
 *   node scripts/check-contrast.mjs --all    # incluye los pares que sí pasan
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS = readFileSync(join(ROOT, "app", "globals.css"), "utf8");

// ── oklch → sRGB ────────────────────────────────────────────────────────────
function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const toSrgb = (c) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.abs(c) ** (1 / 2.4) - 0.055;

  return [toSrgb(lr), toSrgb(lg), toSrgb(lb)].map((c) => Math.min(1, Math.max(0, c)));
}

function relativeLuminance([r, g, b]) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg, bg) {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// ── Tokens declarados en globals.css ────────────────────────────────────────
function parseBlock(selector) {
  // Anclado a inicio de línea: `indexOf` picaba en cualquier mención dentro de
  // un comentario.
  const marker = `\n${selector}`;
  const at = CSS.indexOf(marker);
  if (at === -1) throw new Error(`No encontré el bloque ${selector} en globals.css`);
  const open = CSS.indexOf("{", at);
  const close = CSS.indexOf("\n}", open);
  const body = CSS.slice(open, close);

  const raw = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    raw[m[1]] = m[2].trim();
  }
  return raw;
}

/** Resuelve alias `var(--x)` y convierte oklch() a sRGB. */
function toRgb(name, raw, seen = new Set()) {
  const value = raw[name];
  if (value === undefined) return null;
  if (seen.has(name)) throw new Error(`Ciclo de variables en ${name}`);
  seen.add(name);

  const alias = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (alias) return toRgb(alias[1], raw, seen);

  const ok = value.match(/^oklch\(([^)]+)\)$/);
  if (!ok) return null;
  // `oklch(78% 0.19 128 / 0.5)`: el alfa no participa del ratio.
  const parts = ok[1].split("/")[0].trim().split(/\s+/);
  const [L, C, H] = parts.map((v) => (v.endsWith("%") ? Number(v.slice(0, -1)) / 100 : Number(v)));
  if (![L, C].every(Number.isFinite)) {
    throw new Error(`No pude leer ${name}: ${value}`);
  }
  return oklchToRgb(L, C, Number.isFinite(H) ? H : 0);
}

function resolveAll(raw) {
  const out = {};
  for (const name of Object.keys(raw)) {
    const rgb = toRgb(name, raw);
    if (rgb) out[name] = rgb;
  }
  return out;
}

const lightRaw = parseBlock(":root {");
const darkRaw = { ...lightRaw, ...parseBlock(".dark {") };
const light = resolveAll(lightRaw);
const dark = resolveAll(darkRaw);

// ── Pares que el producto usa de verdad ─────────────────────────────────────
// `min` sigue WCAG AA: 4.5 para texto normal, 3.0 para texto grande (>=18px)
// y para bordes/iconos que solo tienen que distinguirse.
const PAIRS = [
  ["--text-base", "--bg-base", 4.5, "texto principal sobre el fondo"],
  ["--text-base", "--bg-card", 4.5, "texto principal sobre tarjeta"],
  ["--text-base", "--bg-sidebar", 4.5, "texto del menú"],
  ["--text-muted", "--bg-card", 4.5, "texto secundario sobre tarjeta"],
  ["--text-muted", "--bg-base", 4.5, "texto secundario sobre el fondo"],
  ["--text-muted", "--bg-muted", 4.5, "texto secundario sobre superficie apagada"],
  ["--text-subtle", "--bg-card", 4.5, "etiquetas pequeñas del menú"],
  // El placeholder es una pista, no contenido: el significado lo lleva la
  // etiqueta del campo. A 4.5:1 se lee como un valor ya escrito.
  ["--text-placeholder", "--bg-input", 3.0, "placeholder de los campos"],
  ["--color-primary-ink", "--bg-card", 4.5, "enlaces y acciones en texto"],
  ["--color-primary-ink", "--bg-base", 4.5, "enlaces sobre el fondo"],
  // Chips y badges de marca: relleno apagado con el ink encima.
  ["--color-primary-ink", "--color-primary-muted", 4.5, "texto sobre chip de marca"],
  ["--color-primary-contrast", "--color-primary", 4.5, "texto sobre relleno volt"],
  ["--color-primary-contrast", "--color-primary-hover", 4.5, "texto sobre volt en hover"],
  ["--border-base", "--bg-card", 1.3, "borde de tarjeta (solo debe verse)"],
  ["--color-primary", "--bg-card", 1.3, "relleno volt sobre tarjeta"],
  // Formularios
  ["--text-base", "--bg-input", 4.5, "valor escrito en un campo"],
  // Hover de botones fantasma sobre superficie apagada
  ["--color-primary-ink", "--bg-muted", 4.5, "acción en texto sobre superficie apagada"],
  ["--text-muted", "--bg-sidebar", 4.5, "texto secundario del menú"],
  // El menú también tiene su propia superficie apagada al pasar el cursor.
  ["--color-primary-ink", "--bg-sidebar", 4.5, "acción en texto dentro del menú"],
  ["--text-subtle", "--bg-base", 4.5, "etiqueta pequeña sobre el fondo"],
  ["--text-subtle", "--bg-muted", 4.5, "etiqueta pequeña sobre superficie apagada"],
  // El campo deshabilitado usa la superficie apagada de fondo.
  ["--text-muted", "--bg-input", 4.5, "texto de un campo deshabilitado"],
  ["--border-base", "--bg-base", 1.3, "borde sobre el fondo"],
  ["--border-base", "--bg-input", 1.3, "borde de un campo"],
  ["--border-base", "--bg-muted", 1.3, "borde sobre superficie apagada"],
  ["--action-ink", "--action", 4.5, "texto del botón principal"],
  ["--action-ink", "--action-hover", 4.5, "texto del botón principal en hover"],
  ["--action", "--bg-card", 3.0, "botón principal sobre tarjeta"],
  ["--text-muted", "--bg-raised", 4.5, "texto secundario sobre superficie elevada"],
];

// El kiosko y la pantalla del gym son superficies oscuras FIJAS: no siguen el
// tema, así que ahí va `--brand-on-dark` y NO el relleno ni el ink del tema.
// #1a1b19: el grafito de Tiza para esas superficies.
const FIXED_DARK = [26 / 255, 27 / 255, 25 / 255];

// Señales semánticas: cada una sobre su propio banner y sobre las superficies
// del producto. Un aviso que no se lee no avisa de nada.
const SIGNALS = ["ok", "warn", "danger", "info"];

const ACCENTS = [
  "--accent-dashboard", "--accent-members", "--accent-checkins", "--accent-classes",
  "--accent-machines", "--accent-payments", "--accent-plans", "--accent-reports",
  "--accent-settings",
];

const showAll = process.argv.includes("--all");
let failures = 0;
const rows = [];

// Pares de las superficies oscuras fijas. Se comprueban aparte porque no
// siguen el tema: sus colores son los mismos en claro y en oscuro.
for (const [token, min, label] of [
  ["--brand-on-dark", 4.5, "marca sobre el fondo oscuro fijo"],
]) {
  const ratio = contrast(light[token], FIXED_DARK);
  const ok = ratio >= min;
  if (!ok) failures += 1;
  if (!ok || showAll) rows.push({ theme: "fija", label, ratio, min, ok });
}

// El resultado del kiosko pinta texto blanco sobre un relleno de estado que
// se lee a distancia: con amber-500 daba menos de 2:1.
const WHITE = [1, 1, 1];
for (const [token, label] of [
  ["--kiosk-bg", "texto blanco sobre el fondo del kiosko"],
  ["--kiosk-ok", "texto blanco sobre el verde del kiosko"],
  ["--kiosk-warn", "texto blanco sobre el ámbar del kiosko"],
  ["--kiosk-danger", "texto blanco sobre el rojo del kiosko"],
]) {
  if (!light[token]) {
    rows.push({ theme: "fija", label, ratio: null, min: 4.5, ok: false, missing: token });
    failures += 1;
    continue;
  }
  const ratio = contrast(WHITE, light[token]);
  const ok = ratio >= 4.5;
  if (!ok) failures += 1;
  if (!ok || showAll) rows.push({ theme: "fija", label, ratio, min: 4.5, ok });
}

for (const [theme, tokens] of [["claro", light], ["oscuro", dark]]) {
  const checks = [
    ...PAIRS,
    // Los acentos se usan como eyebrow en texto pequeño sobre la tarjeta.
    ...ACCENTS.map((a) => [a, "--bg-card", 4.5, `acento ${a.replace("--accent-", "")} como texto`]),
    // Los badges de estado se pintan sobre la superficie apagada, no sobre la
    // tarjeta. Ojo: con croma alto este cálculo es OPTIMISTA — recorta por canal
    // mientras el navegador baja el croma, así que el color real sale más
    // oscuro. Por eso los acentos se mantienen dentro de la gama sRGB.
    ...ACCENTS.map((a) => [a, "--bg-muted", 4.5, `acento ${a.replace("--accent-", "")} sobre superficie apagada`]),
    // Cada señal sobre su banner, sobre la tarjeta y sobre el fondo.
    ...SIGNALS.flatMap((n) => [
      [`--signal-${n}`, `--signal-${n}-bg`, 4.5, `señal ${n} sobre su banner`],
      [`--signal-${n}`, "--bg-card", 4.5, `señal ${n} sobre tarjeta`],
      [`--signal-${n}`, "--bg-base", 4.5, `señal ${n} sobre el fondo`],
      [`--signal-${n}-line`, `--signal-${n}-bg`, 1.3, `borde del banner de ${n}`],
    ]),
  ];
  for (const [fg, bg, min, label] of checks) {
    if (!tokens[fg] || !tokens[bg]) {
      rows.push({ theme, label, ratio: null, min, ok: false, missing: `${fg} o ${bg}` });
      failures += 1;
      continue;
    }
    const ratio = contrast(tokens[fg], tokens[bg]);
    const ok = ratio >= min;
    if (!ok) failures += 1;
    if (!ok || showAll) rows.push({ theme, label, ratio, min, ok });
  }
}

const pad = (s, n) => String(s).padEnd(n);
if (rows.length === 0) {
  console.log("Contraste: todos los pares pasan.");
} else {
  console.log(`${pad("tema", 8)}${pad("par", 46)}${pad("ratio", 9)}mínimo`);
  console.log("-".repeat(72));
  for (const r of rows) {
    const ratio = r.ratio === null ? `falta ${r.missing}` : `${r.ratio.toFixed(2)}:1`;
    console.log(
      `${r.ok ? " " : "✗"} ${pad(r.theme, 6)}${pad(r.label, 46)}${pad(ratio, 9)}${r.min}:1`
    );
  }
}

if (failures) {
  console.error(`\n${failures} par(es) por debajo del mínimo. Ajusta los tokens en app/globals.css.`);
  process.exit(1);
}
console.log("\nContraste OK en claro y oscuro.");
