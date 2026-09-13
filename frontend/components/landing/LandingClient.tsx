"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { BrandMark } from "@/components/common/BrandMark";
import { cn } from "@/lib/utils";
import {
  ArrowRight, Check, ChevronDown, CircleAlert, CircleCheck, Database, EyeOff, KeyRound, Lock, MessageCircle,
  ScrollText, Users,
} from "lucide-react";

/*
 * Superficie oscura FIJA (no sigue el tema): aquí va el relleno de marca, nunca
 * el ink. Los paneles del producto se pintan en claro, como se ve la app en el
 * mostrador, para que la página muestre el software y no una ilustración de él.
 */
const PAGE_BG = "#0f0d0b";
const PANEL = "bg-[#fbf8f5] text-[#1c1917]";
const OK = "#15803d";
const BAD = "#b91c1c";
const WARN = "#b45309";

const fadeUp: Variants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

// ─── Paneles del producto ───

const LLEGADAS = [
  { name: "Laura Pineda", plan: "Mensual · vence en 12 días", ok: true },
  { name: "Andrés Torres", plan: "Debe $95.000 · a recepción", ok: false },
  { name: "Camila Rojas", plan: "Trimestral · al día", ok: true },
  { name: "Mateo Salazar", plan: "Pase del día · pagado", ok: true },
  { name: "Sofía Gómez", plan: "Anual · al día", ok: true },
  { name: "Julián Vargas", plan: "Vencida hace 3 días · a recepción", ok: false },
  { name: "Daniela Castro", plan: "Mensual · vence mañana", ok: true },
];

function LivePanel() {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setTick((x) => x + 1), 2400);
    return () => clearInterval(t);
  }, [reduce]);
  const visibles = Array.from({ length: 4 }, (_, i) => LLEGADAS[(tick + i) % LLEGADAS.length]);
  const dentro = 38 + (tick % 5);

  return (
    <div className={cn("rounded-2xl p-5 shadow-[0_40px_90px_-30px_rgb(0_0_0/0.8)] ring-1 ring-white/10", PANEL)} aria-label="Ejemplo del panel de recepción">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#78716c]">Hoy · Recepción</p>
        <span className="flex items-center gap-1.5 text-[11px] text-[#78716c]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: OK }} /> en vivo
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        {[
          { l: "Ingresos del día", v: "$1.284.000" },
          { l: "Dentro ahora", v: String(dentro) },
          { l: "Vencen esta semana", v: "17" },
        ].map((k) => (
          <div key={k.l} className="min-w-0">
            <p className="text-[10px] text-[#78716c] truncate">{k.l}</p>
            <p className="text-base sm:text-lg font-bold tabular-nums truncate">{k.v}</p>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-1.5 min-h-[184px]">
        <AnimatePresence initial={false}>
          {visibles.map((m) => (
            <motion.li
              key={`${m.name}-${tick}`}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-3 rounded-lg border border-[#e7e5e4] bg-white px-3 py-2"
            >
              {m.ok ? <CircleCheck className="h-4 w-4 shrink-0" style={{ color: OK }} /> : <CircleAlert className="h-4 w-4 shrink-0" style={{ color: BAD }} />}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{m.name}</p>
                <p className="text-xs truncate" style={{ color: m.ok ? "#78716c" : BAD }}>{m.plan}</p>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function KioskPanel() {
  return (
    <div className="mx-auto w-full max-w-sm rounded-[28px] bg-[#1c1917] p-3 ring-1 ring-white/10">
      <div className={cn("rounded-[20px] p-6 text-center", PANEL)}>
        <p className="text-[11px] uppercase tracking-[0.14em] text-[#78716c]">Digita tu cédula</p>
        <p className="mt-2 font-mono text-2xl tracking-[0.2em]">1 098 765 432</p>
        <div className="mt-5 rounded-xl py-5" style={{ background: "#dcfce7" }}>
          <CircleCheck className="h-10 w-10 mx-auto" style={{ color: OK }} />
          <p className="mt-2 text-lg font-bold" style={{ color: OK }}>Bienvenida, Laura</p>
          <p className="text-xs text-[#44403c]">Mensual · vence el 24 de septiembre</p>
        </div>
        <p className="mt-3 text-[11px] text-[#78716c]">También con QR, huella o torniquete</p>
      </div>
    </div>
  );
}

function PosPanel() {
  return (
    <div className={cn("rounded-2xl p-5 ring-1 ring-white/10", PANEL)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#78716c]">Cobro · Andrés Torres</p>
      <ul className="mt-3 space-y-2 text-sm">
        <li className="flex justify-between"><span>Renovación Mensual</span><span className="tabular-nums">$95.000</span></li>
        <li className="flex justify-between"><span>Agua 600 ml × 1</span><span className="tabular-nums">$3.000</span></li>
        <li className="flex justify-between border-t border-[#e7e5e4] pt-2 font-bold"><span>Total</span><span className="tabular-nums">$98.000</span></li>
      </ul>
      <div className="mt-4 flex gap-2">
        {["Efectivo", "Transferencia", "Tarjeta"].map((m, i) => (
          <span key={m} className={cn("rounded-md border px-2.5 py-1 text-xs", i === 1 ? "border-[#b4460a] text-[#b4460a] font-semibold" : "border-[#e7e5e4] text-[#57534e]")}>{m}</span>
        ))}
      </div>
      <p className="mt-4 text-xs text-[#57534e]">Recibo FC-000842 · la membresía queda renovada y el stock del agua baja solo.</p>
    </div>
  );
}

function RiskPanel() {
  const socios = [
    { n: "Paula Mendoza", r: "19 días sin venir · viene cada vez menos", p: "82%" },
    { n: "Nicolás Ramírez", r: "vence en 4 días · nunca ha renovado", p: "74%" },
    { n: "Isabella Correa", r: "bajó de 12 a 3 visitas al mes", p: "61%" },
  ];
  return (
    <div className={cn("rounded-2xl p-5 ring-1 ring-white/10", PANEL)}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#78716c]">Pueden irse este mes</p>
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#1d4ed8", background: "#dbeafe" }}>Modelo</span>
      </div>
      <ul className="mt-3 divide-y divide-[#e7e5e4]">
        {socios.map((s) => (
          <li key={s.n} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{s.n}</p>
              <p className="text-xs text-[#57534e]">{s.r}</p>
            </div>
            <span className="text-xs font-mono font-semibold" style={{ color: BAD }}>{s.p}</span>
            <span className="h-8 w-8 rounded-lg border border-[#e7e5e4] flex items-center justify-center text-[#57534e]" aria-hidden><MessageCircle className="h-4 w-4" /></span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-[#78716c]">Entrenado con 862 casos de este gimnasio · lo que más pesa: días sin venir</p>
    </div>
  );
}

function PeakPanel() {
  const horas = [
    { h: "5", v: 22 }, { h: "6", v: 64 }, { h: "7", v: 48 }, { h: "8", v: 20 }, { h: "12", v: 26 }, { h: "13", v: 18 },
    { h: "17", v: 44 }, { h: "18", v: 92 }, { h: "19", v: 78 }, { h: "20", v: 36 },
  ];
  return (
    <div className={cn("rounded-2xl p-5 ring-1 ring-white/10", PANEL)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#78716c]">Aforo esperado · jueves</p>
      <div className="mt-4 flex items-end gap-2 h-32" role="img" aria-label="Barras de aforo por hora con pico a las 18">
        {horas.map((x) => (
          <div key={x.h} className="flex-1 h-full flex flex-col items-center gap-1">
            {/* La altura en % necesita un padre con alto definido: sin este envoltorio la barra medía 0. */}
            <div className="w-full flex-1 flex items-end">
              <div className="w-full rounded-t" style={{ height: `${x.v}%`, background: x.v >= 75 ? "var(--color-primary)" : "#d6d3d1" }} />
            </div>
            <span className="text-[10px] text-[#78716c] tabular-nums">{x.h}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[#57534e]">A las 6 p. m. se esperan ~31 personas: abre la sala de funcional y pon la clase de spinning a las 5.</p>
    </div>
  );
}

function ClosePanel() {
  const billetes = [["$50.000", 6, "$300.000"], ["$20.000", 11, "$220.000"], ["$10.000", 8, "$80.000"], ["Monedas", "", "$12.500"]];
  return (
    <div className={cn("rounded-2xl p-5 ring-1 ring-white/10", PANEL)}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#78716c]">Cierre de caja · Recepción</p>
        <span className="flex items-center gap-1 text-[11px] text-[#78716c]"><EyeOff className="h-3.5 w-3.5" /> ciego</span>
      </div>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {billetes.map(([d, q, t]) => (
            <tr key={String(d)} className="border-b border-[#f0eeec]">
              <td className="py-1.5 text-[#57534e]">{d}</td>
              <td className="py-1.5 text-right tabular-nums text-[#57534e]">{q && `× ${q}`}</td>
              <td className="py-1.5 text-right tabular-nums">{t}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "#dcfce7" }}>
        <span className="text-sm font-semibold" style={{ color: OK }}>Cuadrado</span>
        <span className="text-sm tabular-nums font-bold" style={{ color: OK }}>$612.500</span>
      </div>
      <p className="mt-2 text-[11px] text-[#78716c]">El esperado se revela después de contar. La diferencia queda a nombre de quien cerró.</p>
    </div>
  );
}

const DIA = [
  {
    hora: "5:58",
    titulo: "La puerta decide sola",
    texto: "El socio digita su cédula en una tablet vieja y entra si está al día. Si debe, el kiosco lo manda a recepción y su tarjeta salta en la pantalla del mostrador con lo que debe.",
    detalle: ["Cédula, QR, huella o torniquete", "Personal del gimnasio entra con su propia ficha"],
    panel: <KioskPanel />,
  },
  {
    hora: "7:10",
    titulo: "Cobrar toma un clic",
    texto: "Renovación, pase del día o una proteína, en efectivo, transferencia o tarjeta. Sale el recibo consecutivo, la membresía se renueva y el inventario se descuenta.",
    detalle: ["Links de pago por WhatsApp", "Devoluciones con rastro, nunca pagos borrados"],
    panel: <PosPanel />,
  },
  {
    hora: "12:30",
    titulo: "Te avisa antes de que se vayan",
    texto: "Un modelo entrenado con el historial de tu gimnasio marca a quién estás por perder y por qué. Le escribes desde ahí mismo, mientras todavía hay cómo recuperarlo.",
    detalle: ["Razones concretas por socio", "Si tu gimnasio es nuevo, usa reglas y te lo dice"],
    panel: <RiskPanel />,
  },
  {
    hora: "18:00",
    titulo: "Sabes cuándo se llena",
    texto: "El aforo esperado por hora para toda la semana, calculado con las entradas reales. Mueves clases, turnos y personal con datos, no con intuición.",
    detalle: ["Horas pico y días flojos", "Días que se salen de lo normal, explicados"],
    panel: <PeakPanel />,
  },
  {
    hora: "21:30",
    titulo: "La caja cuadra, o sabes por qué no",
    texto: "El cajero cuenta billete por billete sin ver cuánto debería haber. Los retiros a bóveda y los egresos quedan registrados, y las diferencias se agrupan por persona.",
    detalle: ["Corte X a mitad de turno", "Reportes PDF y Excel con tu logo"],
    panel: <ClosePanel />,
  },
];

const MODELOS = [
  ["Riesgo de abandono", "Gradient boosting sobre visitas, vencimientos y pagos de tus socios"],
  ["Cierre del mes", "Holt-Winters con el patrón semanal de tus ingresos, comparado contra el ritmo simple"],
  ["Aforo de la semana", "Regresión día × hora sobre tus entradas de las últimas 8 semanas"],
  ["Segmentos", "K-means que separa fieles, recién llegados y los que se están alejando"],
  ["Reacción al precio", "Elasticidad de la renovación cuando un plan cambió de precio"],
  ["Días fuera de lo normal", "Isolation Forest sobre ingresos y asistencia de cada día"],
];

const ROLES = [
  ["Dueño", "Ve todo: dinero, reportes, inteligencia, auditoría y el equipo."],
  ["Administración", "Opera el negocio sin ver secretos, nómina ni la auditoría."],
  ["Recepción", "Entrada, cobro y caja. Nada de ingresos del mes ni reportes."],
  ["Entrenador", "Sus clases, sus socios y sus rutinas. Nada más."],
];

const TRUST = [
  { icon: Database, t: "Una base de datos por gimnasio", d: "Tus datos no comparten tabla con los de otro gym." },
  { icon: KeyRound, t: "Llaves cifradas", d: "Las credenciales de pagos y WhatsApp se guardan cifradas." },
  { icon: Lock, t: "Fotos y comprobantes privados", d: "Se sirven con enlaces que vencen en minutos." },
  { icon: ScrollText, t: "Auditoría", d: "Cada acción sensible del personal queda registrada con su nombre." },
];

interface PlanFeature { text: string; soon?: boolean }

const PRICING: { name: string; price: string; period: string; tagline: string; highlight: boolean; features: PlanFeature[] }[] = [
  {
    name: "Básico", price: "$160.000", period: "COP / mes por sede", tagline: "Todo el panel para operar tu gym", highlight: false,
    features: [
      { text: "Socios ilimitados, caja, POS e inventario" },
      { text: "Kiosco de entrada y control de acceso" },
      { text: "Clases, reservas y entrenadores" },
      { text: "Inteligencia entrenada con tus datos" },
      { text: "Reportes PDF y Excel con tu marca" },
      { text: "Soporte por WhatsApp" },
    ],
  },
  {
    name: "Avanzado", price: "$300.000", period: "COP / mes por sede", tagline: "El panel + la app para tus socios", highlight: true,
    features: [
      { text: "Todo lo del plan Básico" },
      { text: "App móvil para tus socios", soon: true },
      { text: "Reservas y pagos desde la app", soon: true },
    ],
  },
  {
    name: "Premium", price: "$480.000", period: "COP / mes por sede", tagline: "Avanzado + acompañamiento en la app", highlight: false,
    features: [
      { text: "Todo lo del plan Avanzado" },
      { text: "Rutinas y seguimiento personalizados en la app", soon: true },
      { text: "Soporte prioritario" },
    ],
  },
];

const FAQS = [
  { q: "¿Necesito comprar hardware para la entrada?", a: "No. El kiosco es una página web: cualquier tablet o celular viejo en la entrada funciona. Si más adelante quieres torniquete, huella o reconocimiento facial, el sistema ya los integra." },
  { q: "¿Qué pasa si un socio vencido intenta entrar?", a: "El kiosco lo manda a recepción y en el mostrador salta su tarjeta con cuánto debe y un botón para autorizarlo si decides dejarlo pasar. Esa autorización queda en la auditoría." },
  { q: "¿La inteligencia funciona si mi gimnasio es nuevo?", a: "Los modelos se entrenan con tu propio historial. Mientras no haya suficiente, la pantalla usa reglas simples y te dice cuántos datos faltan. A medida que el gimnasio opera, se entrenan solos cada noche." },
  { q: "¿Mis recepcionistas van a ver cuánto gana el gimnasio?", a: "No. Cada rol ve solo lo suyo: recepción opera la entrada, el cobro y la caja, sin ingresos del mes, reportes ni auditoría. Lo que no le corresponde ni siquiera aparece en su menú." },
  { q: "Hoy llevo todo en Excel o en un cuaderno, ¿cómo migro?", a: "Descargas la plantilla, pegas tus socios y los importas en un clic. Quedan listos para entrar por el kiosco y para asignarles membresía." },
  { q: "¿Cómo manejan los datos personales de mis socios?", a: "Cumplimos la Ley 1581 de 2012: tú eres el responsable del tratamiento y FitConnect el encargado. Los datos de salud se tratan como sensibles." },
  { q: "¿Qué incluye la prueba de 30 días?", a: "Todo el plan que elijas, sin tarjeta. Si no te convence, exportas tus datos y no se te cobra nada." },
  { q: "¿Puedo cancelar cuando quiera?", a: "Sí. No hay permanencia: cancelas desde la configuración y te llevas tus datos." },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/10">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-center justify-between gap-4 py-5 text-left">
        <span className="text-white font-medium">{q}</span>
        <ChevronDown className={cn("h-4 w-4 text-white/50 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      <motion.div initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
        <p className="pb-5 text-white/65 text-sm leading-relaxed">{a}</p>
      </motion.div>
    </div>
  );
}

export default function LandingClient() {
  return (
    <div className="min-h-screen text-white overflow-x-hidden" style={{ background: PAGE_BG }}>
      <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-md border-b border-white/5" style={{ background: `${PAGE_BG}cc` }}>
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark className="h-8 w-8" />
            <span className="font-bold text-lg">FitConnect</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-white/65">
            <a href="#dia" className="hover:text-white transition-colors">Un día</a>
            <a href="#inteligencia" className="hover:text-white transition-colors">Inteligencia</a>
            <a href="#precios" className="hover:text-white transition-colors">Precios</a>
            <a href="#preguntas" className="hover:text-white transition-colors">Preguntas</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden sm:inline text-sm text-white/75 hover:text-white transition-colors">Ingresar</Link>
            <Link href="/register" className="whitespace-nowrap rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-contrast)] px-4 py-2 text-sm font-bold hover:bg-[var(--color-primary-hover)] transition-colors">
              Prueba 30 días
            </Link>
          </div>
        </div>
      </header>

      {/* Hero: el producto funcionando, no una promesa */}
      <section className="relative pt-32 pb-20 px-5">
        <div className="pointer-events-none absolute -top-40 right-0 h-[30rem] w-[40rem] rounded-full opacity-[0.12] blur-3xl" style={{ background: "var(--color-primary)" }} aria-hidden />
        <div className="relative mx-auto max-w-6xl grid lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center">
          <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }} className="space-y-6">
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
              Software para gimnasios de Colombia
            </motion.p>
            <motion.h1 variants={fadeUp} transition={{ duration: 0.5 }} className="text-4xl sm:text-[3.4rem] font-extrabold leading-[1.04] tracking-tight">
              Tu gimnasio abre a las 5:30.
              <br />
              <span className="text-white/55">Todo lo demás ya está resuelto.</span>
            </motion.h1>
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-lg text-white/70 max-w-xl">
              Entrada por cédula, cobros con recibo, caja que se cuadra a ciegas y un modelo que te avisa qué socios estás por perder. Cada rol ve solo lo suyo.
            </motion.p>
            <motion.div variants={fadeUp} transition={{ duration: 0.5 }} className="flex items-center gap-3 flex-wrap">
              <Link href="/register" className="group inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-contrast)] px-6 py-3.5 text-base font-bold hover:bg-[var(--color-primary-hover)] transition-colors">
                Empieza gratis <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a href="#dia" className="rounded-xl border border-white/15 px-6 py-3.5 text-base font-semibold text-white/85 hover:bg-white/5 transition-colors">
                Ver un día completo
              </a>
            </motion.div>
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-xs text-white/50">
              Sin tarjeta de crédito · Importas tus socios desde Excel · Ley 1581 de datos personales
            </motion.p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}>
            <LivePanel />
          </motion.div>
        </div>
      </section>

      {/* Un día: la columna vertebral */}
      <section id="dia" className="py-20 px-5 border-t border-white/5">
        <div className="mx-auto max-w-6xl">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ duration: 0.5 }} className="max-w-2xl mb-14 space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Un día en tu gimnasio, de la primera entrada al cierre</h2>
            <p className="text-white/65">Así se ve FitConnect trabajando en los cinco momentos donde un gimnasio gana o pierde plata.</p>
          </motion.div>
          <ol className="space-y-20">
            {DIA.map((m, i) => (
              <motion.li
                key={m.hora}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5 }}
                className={cn("grid md:grid-cols-2 gap-10 items-center", i % 2 === 1 && "md:[&>*:first-child]:order-2")}
              >
                <div className="space-y-4">
                  <p className="font-mono text-sm text-[var(--color-primary)] tabular-nums">{m.hora}</p>
                  <h3 className="text-2xl sm:text-3xl font-bold tracking-tight">{m.titulo}</h3>
                  <p className="text-white/70 leading-relaxed">{m.texto}</p>
                  <ul className="space-y-1.5">
                    {m.detalle.map((d) => (
                      <li key={d} className="flex items-start gap-2 text-sm text-white/65">
                        <Check className="h-4 w-4 mt-0.5 shrink-0 text-[var(--color-primary)]" /> {d}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>{m.panel}</div>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Inteligencia: dicho con honestidad */}
      <section id="inteligencia" className="py-20 px-5 border-t border-white/5 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl grid lg:grid-cols-[0.9fr_1.1fr] gap-12">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ duration: 0.5 }} className="space-y-4">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Modelos que aprenden de tu gimnasio, no de uno promedio</h2>
            <p className="text-white/70 leading-relaxed">
              Cada noche se entrenan con los datos de tu propio gimnasio. Cada número dice con qué se calculó y, cuando el modelo todavía no supera a la regla simple, se usa la regla.
            </p>
            <p className="text-sm text-white/55">Sin enviar los datos de tus socios a ningún servicio de terceros.</p>
          </motion.div>
          <motion.dl variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ duration: 0.5 }} className="divide-y divide-white/10 border-y border-white/10">
            {MODELOS.map(([t, d]) => (
              <div key={t} className="grid sm:grid-cols-[12rem_1fr] gap-1 sm:gap-6 py-4">
                <dt className="font-semibold">{t}</dt>
                <dd className="text-sm text-white/65">{d}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
      </section>

      {/* Roles y confianza */}
      <section className="py-20 px-5 border-t border-white/5">
        <div className="mx-auto max-w-6xl grid lg:grid-cols-2 gap-14">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <div className="flex items-center gap-2 mb-5">
              <Users className="h-5 w-5 text-[var(--color-primary)]" />
              <h2 className="text-2xl font-bold">Cada quien ve lo suyo</h2>
            </div>
            <dl className="space-y-4">
              {ROLES.map(([r, d]) => (
                <div key={r} className="flex gap-4">
                  <dt className="w-32 shrink-0 font-semibold">{r}</dt>
                  <dd className="text-sm text-white/65">{d}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <div className="flex items-center gap-2 mb-5">
              <Lock className="h-5 w-5 text-[var(--color-primary)]" />
              <h2 className="text-2xl font-bold">Cédulas, salud y plata, en serio</h2>
            </div>
            <ul className="space-y-4">
              {TRUST.map(({ icon: Icon, t, d }) => (
                <li key={t} className="flex gap-3">
                  <Icon className="h-4 w-4 mt-1 shrink-0 text-white/50" />
                  <div>
                    <p className="font-semibold text-sm">{t}</p>
                    <p className="text-sm text-white/65">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Link href="/tratamiento-datos" className="inline-block mt-5 text-sm text-[var(--color-primary)] font-medium hover:underline">
              Política de tratamiento de datos →
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Precios */}
      <section id="precios" className="py-20 px-5 border-t border-white/5 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ duration: 0.5 }} className="max-w-2xl mb-12 space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Se paga con dos socios que no se fueron</h2>
            <p className="text-white/65">
              Todos los planes incluyen <span className="text-white font-semibold">30 días de prueba</span>, sin tarjeta.
            </p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
            {PRICING.map((plan) => (
              <motion.div
                key={plan.name}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className={cn(
                  "rounded-2xl border p-7 space-y-5",
                  plan.highlight ? "border-[var(--color-primary)] bg-[var(--color-primary)]/[0.06] relative" : "border-white/10 bg-white/[0.03]",
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-6 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-contrast)] px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                    Recomendado
                  </span>
                )}
                <div>
                  <h3 className="font-bold text-lg">{plan.name}</h3>
                  <p className="text-xs text-white/60 mt-0.5">{plan.tagline}</p>
                  <p className="text-4xl font-extrabold mt-3 tabular-nums">{plan.price}</p>
                  <p className="text-xs text-white/50 mt-1">{plan.period}</p>
                </div>
                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2.5 text-sm text-white/75">
                      <Check className="h-4 w-4 text-[var(--color-primary)] shrink-0 mt-0.5" />
                      <span>
                        {f.text}
                        {f.soon && <span className="ml-1.5 inline-block align-middle rounded-full border px-1.5 py-px text-[10px] font-semibold" style={{ borderColor: `${WARN}99`, color: "#fbbf24" }}>Próximamente</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={cn(
                    "block text-center rounded-xl px-5 py-3 text-sm font-bold transition-colors",
                    plan.highlight ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)]" : "border border-white/15 text-white/85 hover:bg-white/5",
                  )}
                >
                  Probar 30 días gratis
                </Link>
              </motion.div>
            ))}
          </div>
          <p className="text-xs text-white/45 mt-6 max-w-2xl">
            Lo marcado como &quot;Próximamente&quot; está en desarrollo: si contratas hoy aseguras el precio y lo recibes apenas salga, sin costo adicional.
          </p>
        </div>
      </section>

      <section id="preguntas" className="py-20 px-5 border-t border-white/5">
        <div className="mx-auto max-w-3xl">
          <motion.h2 variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-3xl font-extrabold mb-8">
            Preguntas frecuentes
          </motion.h2>
          <div>{FAQS.map((f) => <FaqItem key={f.q} {...f} />)}</div>
        </div>
      </section>

      <section className="relative py-24 px-5 overflow-hidden border-t border-white/5">
        <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 h-72 w-[50rem] rounded-full opacity-[0.16] blur-3xl" style={{ background: "var(--color-primary)" }} aria-hidden />
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ duration: 0.5 }} className="relative mx-auto max-w-3xl text-center space-y-6">
          <h2 className="text-3xl sm:text-5xl font-extrabold leading-tight tracking-tight">Mañana a las 5:30 puede estar funcionando.</h2>
          <p className="text-white/65">Registras el gimnasio, importas tus socios y pones una tablet en la puerta.</p>
          <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-contrast)] px-8 py-4 text-lg font-bold hover:bg-[var(--color-primary-hover)] transition-colors">
            Registra tu gimnasio <ArrowRight className="h-5 w-5" />
          </Link>
        </motion.div>
      </section>

      <footer className="border-t border-white/5 py-10 px-5">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/55">
          <div className="flex items-center gap-2">
            <BrandMark className="h-6 w-6" />
            <span>© {new Date().getFullYear()} FitConnect</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a href="#dia" className="hover:text-white/80 transition-colors">Un día</a>
            <a href="#precios" className="hover:text-white/80 transition-colors">Precios</a>
            <Link href="/privacidad" className="hover:text-white/80 transition-colors">Privacidad</Link>
            <Link href="/terminos" className="hover:text-white/80 transition-colors">Términos</Link>
            <Link href="/tratamiento-datos" className="hover:text-white/80 transition-colors">Tratamiento de datos</Link>
            <Link href="/login" className="hover:text-white/80 transition-colors">Ingresar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
