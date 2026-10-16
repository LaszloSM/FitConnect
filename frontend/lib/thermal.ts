/**
 * Impresión en tirilla térmica (58 u 80 mm). Las térmicas imprimen solo negro:
 * nada de grises ni colores, que salen punteados o no salen. La ventana trae
 * una barra (que no se imprime) para cambiar el ancho del papel; la elección
 * queda guardada en este navegador.
 */

export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const PAPER_KEY = "lsmfit_paper_mm";

const CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font: 12px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-variant-numeric: tabular-nums; }
  .paper { width: 72mm; margin: 0 auto; padding: 2mm 0 4mm; }
  .p58 .paper { width: 48mm; font-size: 10.5px; }
  .center { text-align: center; }
  .logo { display: block; max-width: 34mm; max-height: 16mm; margin: 0 auto 2mm; filter: grayscale(1) contrast(1.4); }
  .gym { font-size: 1.3em; font-weight: 800; text-transform: uppercase; letter-spacing: .02em; line-height: 1.15; }
  .fiscal { font-size: .88em; }
  .cut { border: 0; border-top: 1px dashed #000; margin: 2.5mm 0; }
  .eyebrow { font-size: .85em; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
  .num { font-size: 1.6em; font-weight: 800; letter-spacing: .01em; margin: .5mm 0; }
  .row { display: flex; justify-content: space-between; gap: 3mm; padding: .4mm 0; }
  .row > span:first-child { flex: 0 0 auto; }
  .row > span:last-child { text-align: right; overflow-wrap: anywhere; }
  .k { font-weight: 700; }
  .item { padding: .6mm 0; }
  .item .desc { font-weight: 600; overflow-wrap: anywhere; }
  .item .row { padding: 0; }
  .total { border-top: 2px solid #000; border-bottom: 2px solid #000; margin-top: 1.5mm; padding: 1.5mm 0; font-size: 1.5em; font-weight: 800; }
  .words { font-size: .88em; font-style: italic; margin-top: 1mm; }
  .stamp { border: 2px solid #000; text-align: center; font-weight: 800; letter-spacing: .15em; padding: 1mm; margin: 2mm 0; }
  .thanks { font-weight: 700; margin-top: 1mm; }
  .small { font-size: .82em; }
  .bar { position: sticky; top: 0; display: flex; gap: 6px; justify-content: center; align-items: center; padding: 8px; background: #f4f4f5; border-bottom: 1px solid #ddd; font: 13px system-ui, sans-serif; }
  .bar button { font: inherit; padding: 6px 12px; border-radius: 8px; border: 1px solid #ccc; background: #fff; cursor: pointer; min-height: 36px; }
  .bar button[aria-pressed="true"] { background: #111; color: #fff; border-color: #111; }
  @media print { .bar { display: none; } }
`;

/** Abre la ventana de impresión con el contenido dado y lanza la impresión al cargar. */
export function openThermal(title: string, bodyHtml: string): boolean {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>${CSS}</style><style id="page">@page { size: 80mm auto; margin: 3mm 4mm; }</style></head>
    <body>
      <div class="bar" role="toolbar" aria-label="Opciones de impresión">
        Papel:
        <button type="button" data-mm="80">80 mm</button>
        <button type="button" data-mm="58">58 mm</button>
        <button type="button" id="print">Imprimir</button>
      </div>
      <div class="paper">${bodyHtml}</div>
      <script>
        (function () {
          var KEY = ${JSON.stringify(PAPER_KEY)};
          function set(mm) {
            document.documentElement.className = mm === "58" ? "p58" : "";
            document.getElementById("page").textContent = "@page { size: " + mm + "mm auto; margin: 3mm " + (mm === "58" ? 2 : 4) + "mm; }";
            document.querySelectorAll("[data-mm]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-mm") === mm)); });
            try { localStorage.setItem(KEY, mm); } catch (e) {}
          }
          var saved = "80";
          try { saved = localStorage.getItem(KEY) || "80"; } catch (e) {}
          set(saved);
          document.querySelectorAll("[data-mm]").forEach(function (b) { b.addEventListener("click", function () { set(b.getAttribute("data-mm")); }); });
          document.getElementById("print").addEventListener("click", function () { window.print(); });
          window.addEventListener("load", function () { window.print(); });
        })();
      </script>
    </body></html>`;
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

export const thermalRow = (a: string, b: string, cls = "") =>
  `<div class="row ${cls}"><span>${a}</span><span>${b}</span></div>`;
