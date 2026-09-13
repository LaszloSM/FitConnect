#!/usr/bin/env node
/**
 * Colores escritos a mano en componentes.
 *
 * El rediseño Tiza tiene UN acento y todo lo demás sale de tokens. La deuda
 * vieja (hex, `bg-[#…]`, paletas de Tailwind como `text-violet-600`) se congela
 * en `scripts/hardcoded-colors-baseline.json`: un archivo puede bajar su cuenta,
 * nunca subirla, y un archivo nuevo empieza en cero. Así la deuda solo se paga.
 *
 *   node scripts/check-hardcoded-colors.mjs            # falla si algo creció
 *   node scripts/check-hardcoded-colors.mjs --update   # re-congela tras pagar deuda
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "hardcoded-colors-baseline.json");
const DIRS = ["app", "components", "lib", "hooks"];

const PALETTE =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const PATTERNS = [
  /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/g,
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow)-\[(?:#|rgb|hsl|oklch)/g,
  new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration)-(?:${PALETTE})-\\d{2,3}\\b`, "g"),
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}

function count(file) {
  const src = readFileSync(file, "utf8");
  return PATTERNS.reduce((n, re) => n + (src.match(re)?.length ?? 0), 0);
}

const current = {};
for (const d of DIRS) {
  for (const file of walk(join(ROOT, d))) {
    const n = count(file);
    if (n > 0) current[relative(ROOT, file).split(sep).join("/")] = n;
  }
}

if (process.argv.includes("--update")) {
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n");
  const total = Object.values(current).reduce((a, b) => a + b, 0);
  console.log(`Línea base actualizada: ${total} colores en ${Object.keys(current).length} archivos.`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const grew = Object.entries(current).filter(([f, n]) => n > (baseline[f] ?? 0));
const paid = Object.entries(baseline).filter(([f, n]) => (current[f] ?? 0) < n);

if (grew.length) {
  console.error("Colores escritos a mano que no estaban en la línea base:\n");
  for (const [f, n] of grew) console.error(`  ${f}: ${baseline[f] ?? 0} → ${n}`);
  console.error("\nUsa los tokens de app/globals.css (bg-panel, text-ink-muted, var(--signal-*)…).");
  process.exit(1);
}

const total = Object.values(current).reduce((a, b) => a + b, 0);
console.log(`Colores a mano: ${total} (ninguno nuevo).`);
if (paid.length) {
  console.log(`${paid.length} archivo(s) pagaron deuda: corre con --update para bajar la línea base.`);
}
