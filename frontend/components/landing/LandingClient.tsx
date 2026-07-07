"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { BrandMark } from "@/components/common/BrandMark";
import { ProductShot } from "@/components/landing/ProductShot";
import { cn } from "@/lib/utils";
import {
  Activity,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  CreditCard,
  Database,
  DoorOpen,
  KeyRound,
  MonitorSmartphone,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const FEATURES = [
  {
    icon: MonitorSmartphone,
    accent: "#38bdf8",
    title: "Kiosko de entrada",
    description:
      "Una tablet vieja en la puerta basta: el miembro digita su cédula o escanea su carnet. Verde si está al día, rojo si no — y la recepción lo ve saltar en vivo.",
  },
  {
    icon: CreditCard,
    accent: "#34d399",
    title: "Caja y POS real",
    description:
      "Cobra renovaciones en un clic, vende agua y proteína con stock, emite recibos consecutivos y cuadra el turno de caja sin Excel.",
  },
  {
    icon: Users,
    accent: "#2dd4bf",
    title: "Miembros como CRM",
    description:
      "Perfil con foto, cédula, timeline de actividad, congelamientos, descuentos y códigos promo. Sabes quién debe, cuánto y desde cuándo.",
  },
  {
    icon: Calendar,
    accent: "#a78bfa",
    title: "Clases con cupos reales",
    description:
      "Agenda semanal con ocupación, lista de espera automática y planes que definen el acceso: solo máquinas, ilimitadas o N clases al mes.",
  },
  {
    icon: Zap,
    accent: "#fbbf24",
    title: "Pagos por WhatsApp y Wompi",
    description:
      "Links de pago que se confirman solos por webhook y recordatorios de vencimiento listos para enviar por WhatsApp.",
  },
  {
    icon: BarChart3,
    accent: "#818cf8",
    title: "Reportes que accionan",
    description:
      "Ingresos vs. período anterior, morosos con monto exacto, asistencia y utilidad. Exporta a Excel o PDF cuando lo necesites.",
  },
];

interface PlanFeature {
  text: string;
  soon?: boolean;
}

const PRICING: {
  name: string;
  price: string;
  period: string;
  tagline: string;
  highlight: boolean;
  features: PlanFeature[];
  cta: string;
}[] = [
  {
    name: "Básico",
    price: "$160.000",
    period: "COP / mes por sede",
    tagline: "Todo el panel para operar tu gym",
    highlight: false,
    features: [
      { text: "Miembros ilimitados, caja, POS e inventario" },
      { text: "Kiosko de entrada con avisos en vivo" },
      { text: "Clases, reservas y lista de espera" },
      { text: "Pagos Wompi + recordatorios WhatsApp" },
      { text: "Reportes y exports con tu marca" },
      { text: "Soporte por WhatsApp" },
    ],
    cta: "Probar 30 días gratis",
  },
  {
    name: "Avanzado",
    price: "$300.000",
    period: "COP / mes por sede",
    tagline: "El panel + la app para tus socios",
    highlight: true,
    features: [
      { text: "Todo lo del plan Básico" },
      { text: "App móvil para tus socios", soon: true },
      { text: "Reservas y pagos desde la app", soon: true },
      { text: "Métricas y analítica con IA", soon: true },
    ],
    cta: "Probar 30 días gratis",
  },
  {
    name: "Premium",
    price: "$480.000",
    period: "COP / mes por sede",
    tagline: "Avanzado + entrenador IA para tus socios",
    highlight: false,
    features: [
      { text: "Todo lo del plan Avanzado" },
      { text: "Asistente de entrenamiento con IA en la app", soon: true },
      { text: "Rutinas y seguimiento personalizados", soon: true },
      { text: "Soporte prioritario" },
    ],
    cta: "Probar 30 días gratis",
  },
];

const PROBLEMS = [
  "Morosos que entran sin pagar porque nadie revisa la lista.",
  "Caja descuadrada al final del día y nadie sabe por qué.",
  "Fila en la entrada mientras buscas quién está al día.",
  "Clases sobrevendidas y recordatorios de pago que se te olvidan.",
];

const FLOW = [
  { icon: DoorOpen, title: "Entrada", description: "El miembro digita su cédula en el kiosko." },
  { icon: Activity, title: "Recepción", description: "Si debe, salta en vivo y decides si pasa." },
  { icon: Wallet, title: "Cobro", description: "Efectivo, transferencia o link de Wompi." },
  { icon: RefreshCw, title: "Renovación", description: "Recordatorio por WhatsApp con su link de pago." },
  { icon: BarChart3, title: "Reporte", description: "Caja cuadrada e ingresos del día, sin Excel." },
];

const TRUST = [
  { icon: Database, title: "Base de datos por gimnasio", description: "Tus datos viven aislados de los de cualquier otro gym." },
  { icon: KeyRound, title: "Secretos cifrados", description: "Las llaves de Wompi y WhatsApp se guardan cifradas." },
  { icon: Users, title: "Roles de staff", description: "Cada quién ve solo lo que su rol permite." },
  { icon: ScrollText, title: "Auditoría", description: "Cada acción sensible del personal queda registrada." },
];

const FAQS = [
  {
    q: "¿Necesito comprar hardware para el check-in?",
    a: "No. El kiosko es una página web: cualquier tablet o celular viejo montado en la entrada funciona. El miembro digita su cédula o escanea su carnet QR. Si más adelante quieres torniquete o lector biométrico, el sistema está diseñado para integrarlos.",
  },
  {
    q: "¿Qué pasa si un miembro vencido intenta entrar?",
    a: "El kiosko le muestra rojo y lo manda a recepción — y en la pantalla de recepción salta su tarjeta al instante con cuánto debe y un botón para autorizar la entrada si decides dejarlo pasar. Todo queda auditado.",
  },
  {
    q: "¿Sirve para un gimnasio pequeño de barrio?",
    a: "Para eso lo construimos. Membresías en efectivo con turno de caja, recordatorios por WhatsApp sin costo, kiosko con un celular viejo y recibos impresos en cualquier impresora térmica de 80mm.",
  },
  {
    q: "¿Cómo cobro las membresías online?",
    a: "Generas un link de pago Wompi desde el perfil del miembro y se lo envías por WhatsApp. Cuando paga, el sistema confirma el pago, renueva la membresía y emite el recibo — sin que toques nada.",
  },
  {
    q: "¿Mis datos están seguros?",
    a: "Cada gimnasio tiene su propia base de datos aislada. Las llaves de pago se guardan cifradas y cada acción sensible del staff queda en el registro de auditoría.",
  },
  {
    q: "¿Qué incluye la prueba de 30 días?",
    a: "Todo el plan que elijas, sin tarjeta de crédito. Registras tu gym, cargas tus socios y operas normal. Si al final no te convence, tus datos se pueden exportar y no se te cobra nada.",
  },
  {
    q: "Hoy llevo todo en Excel o en un cuaderno, ¿cómo migro?",
    a: "Descargas nuestra plantilla de Excel, pegas tus socios (nombre, cédula, teléfono) y los importas en un clic. Los socios importados quedan listos para usar el kiosko y asignarles su membresía.",
  },
  {
    q: "¿Cómo manejan los datos personales de mis socios?",
    a: "Cumplimos la Ley 1581 de 2012 (habeas data): tú eres el responsable del tratamiento y FitConnect el encargado. Los datos de salud (PAR-Q) son datos sensibles y se tratan como tales. Puedes leer la política completa en nuestra página de tratamiento de datos.",
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí. No hay contratos de permanencia: cancelas desde la configuración y te llevas tus datos exportados en Excel.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/10">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-white font-medium">{q}</span>
        <ChevronDown
          className={cn("h-4 w-4 text-white/50 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="overflow-hidden"
      >
        <p className="pb-5 text-white/60 text-sm leading-relaxed">{a}</p>
      </motion.div>
    </div>
  );
}

export default function LandingClient() {
  return (
    <div className="min-h-screen bg-[#0a0f0a] text-white overflow-x-hidden">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-md bg-[#0a0f0a]/70 border-b border-white/5">
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-8 w-8" />
            <span className="font-bold text-lg">FitConnect</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm text-white/60">
            <a href="#features" className="hover:text-white transition-colors">Funciones</a>
            <a href="#pricing" className="hover:text-white transition-colors">Precios</a>
            <a href="#faq" className="hover:text-white transition-colors">Preguntas</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-white/70 hover:text-white transition-colors">
              Ingresar
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-contrast)] px-4 py-2 text-sm font-bold hover:opacity-90 transition-opacity"
            >
              Registra tu gym
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-36 pb-24 px-5">
        <div
          className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-[28rem] w-[60rem] rounded-full opacity-[0.14] blur-3xl"
          style={{ background: "var(--color-primary)" }}
        />
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="relative mx-auto max-w-3xl text-center space-y-6"
        >
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/70"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-primary)]" />
            Hecho para gimnasios de Colombia
          </motion.p>
          <motion.h1
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="text-4xl sm:text-6xl font-extrabold leading-[1.05] tracking-tight"
          >
            Opera tu gimnasio
            <br />
            <span className="text-[var(--color-primary)]">con precisión de atleta.</span>
          </motion.h1>
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="text-lg text-white/60 max-w-xl mx-auto"
          >
            Control de entrada con cédula, caja que cuadra sola, clases con cupos reales y
            cobros por WhatsApp. Todo en una plataforma rápida y clara.
          </motion.p>
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-center gap-3 flex-wrap"
          >
            <Link
              href="/register"
              className="rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-contrast)] px-7 py-3.5 text-base font-bold hover:opacity-90 transition-opacity"
            >
              Empieza gratis 30 días
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-white/15 px-7 py-3.5 text-base font-semibold text-white/80 hover:bg-white/5 transition-colors"
            >
              Ya tengo cuenta
            </Link>
          </motion.div>
          <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-xs text-white/40">
            Sin tarjeta de crédito · Configurado en 10 minutos · Datos protegidos (Ley 1581)
          </motion.p>
        </motion.div>

        {/* Captura real del producto */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative mx-auto max-w-5xl mt-16"
        >
          <ProductShot
            name="dashboard"
            alt="Panel de FitConnect"
            caption="Panel de control — ingresos del día, caja, vencimientos y operación en una sola pantalla."
          />
        </motion.div>
      </section>

      {/* Problema real */}
      <section className="py-20 px-5 border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto max-w-5xl">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10 space-y-3"
          >
            <h2 className="text-3xl sm:text-4xl font-extrabold">
              Lo que hoy vive repartido entre Excel, WhatsApp, cuaderno y caja
            </h2>
            <p className="text-white/50 max-w-xl mx-auto">
              FitConnect junta todo eso en un solo lugar que sí cuadra.
            </p>
          </motion.div>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {PROBLEMS.map((p) => (
              <motion.div
                key={p}
                variants={fadeUp}
                transition={{ duration: 0.45 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/70 leading-relaxed"
              >
                {p}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Flujo operativo */}
      <section className="py-20 px-5">
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12 space-y-3"
          >
            <h2 className="text-3xl sm:text-4xl font-extrabold">De la entrada al reporte, sin fricción</h2>
            <p className="text-white/50 max-w-xl mx-auto">
              Un solo flujo conecta el acceso, el cobro y el cierre del día.
            </p>
          </motion.div>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
          >
            {FLOW.map(({ icon: Icon, title, description }, i) => (
              <motion.div
                key={title}
                variants={fadeUp}
                transition={{ duration: 0.45 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-bold text-white/40">{i + 1}</span>
                </div>
                <h3 className="font-bold text-sm mb-1">{title}</h3>
                <p className="text-xs text-white/55 leading-relaxed">{description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-5">
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12 space-y-3"
          >
            <h2 className="text-3xl sm:text-4xl font-extrabold">Todo lo que tu gym necesita</h2>
            <p className="text-white/50 max-w-xl mx-auto">
              Del gimnasio de barrio al de cadena: módulos que trabajan juntos, no pantallas sueltas.
            </p>
          </motion.div>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {FEATURES.map(({ icon: Icon, accent, title, description }) => (
              <motion.div
                key={title}
                variants={fadeUp}
                transition={{ duration: 0.45 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:bg-white/[0.06] transition-colors"
              >
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl mb-4"
                  style={{ background: `${accent}22`, color: accent }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="font-bold mb-1.5">{title}</h3>
                <p className="text-sm text-white/55 leading-relaxed">{description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Métricas */}
      <section className="py-14 px-5 border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto max-w-4xl grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { value: "10 min", label: "para arrancar" },
            { value: "1 clic", label: "para cobrar una renovación" },
            { value: "0 Excel", label: "para cuadrar la caja" },
            { value: "24/7", label: "kiosko de entrada" },
          ].map((m) => (
            <div key={m.label}>
              <p className="text-3xl font-extrabold text-[var(--color-primary)]">{m.value}</p>
              <p className="text-xs text-white/50 mt-1">{m.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Seguridad y confianza */}
      <section className="py-20 px-5 border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12 space-y-3"
          >
            <h2 className="text-3xl sm:text-4xl font-extrabold">Datos de tus miembros, en serio</h2>
            <p className="text-white/50 max-w-xl mx-auto">
              Manejas cédulas, salud y pagos. Lo tratamos con el cuidado que eso exige.
            </p>
          </motion.div>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {TRUST.map(({ icon: Icon, title, description }) => (
              <motion.div
                key={title}
                variants={fadeUp}
                transition={{ duration: 0.45 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl mb-4 bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="font-bold mb-1.5 text-sm">{title}</h3>
                <p className="text-sm text-white/55 leading-relaxed">{description}</p>
              </motion.div>
            ))}
          </motion.div>
          <motion.p
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center text-sm text-white/50 mt-8"
          >
            Cumplimos la Ley 1581 de 2012 de protección de datos personales (habeas data).{" "}
            <Link href="/tratamiento-datos" className="text-[var(--color-primary)] font-medium hover:underline">
              Lee nuestra política de tratamiento de datos →
            </Link>
          </motion.p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-5">
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12 space-y-3"
          >
            <h2 className="text-3xl sm:text-4xl font-extrabold">Un precio que se paga solo</h2>
            <p className="text-white/50">
              Recupera la mensualidad con dos morosos que vuelvan a pagar.
              Todos los planes incluyen <span className="text-white/80 font-semibold">30 días de prueba gratis</span>, sin tarjeta.
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
                  plan.highlight
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/[0.06] relative lg:scale-[1.03]"
                    : "border-white/10 bg-white/[0.03]"
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-contrast)] px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                    Recomendado
                  </span>
                )}
                <div>
                  <h3 className="font-bold text-lg">{plan.name}</h3>
                  <p className="text-xs text-white/50 mt-0.5">{plan.tagline}</p>
                  <p className="text-4xl font-extrabold mt-3">{plan.price}</p>
                  <p className="text-xs text-white/40 mt-1">{plan.period}</p>
                </div>
                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2.5 text-sm text-white/70">
                      <Check className="h-4 w-4 text-[var(--color-primary)] shrink-0 mt-0.5" />
                      <span>
                        {f.text}
                        {f.soon && (
                          <span className="ml-1.5 inline-block align-middle rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-px text-[10px] font-semibold text-amber-300">
                            Próximamente
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={cn(
                    "block text-center rounded-xl px-5 py-3 text-sm font-bold transition-opacity",
                    plan.highlight
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:opacity-90"
                      : "border border-white/15 text-white/80 hover:bg-white/5"
                  )}
                >
                  {plan.cta}
                </Link>
              </motion.div>
            ))}
          </div>
          <p className="text-center text-xs text-white/35 mt-6">
            Las funciones marcadas como &quot;Próximamente&quot; están en desarrollo: al contratarlas hoy
            aseguras el precio y las recibes apenas salgan, sin costo adicional.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-5">
        <div className="mx-auto max-w-2xl">
          <motion.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-extrabold text-center mb-10"
          >
            Preguntas frecuentes
          </motion.h2>
          <div>
            {FAQS.map((f) => (
              <FaqItem key={f.q} {...f} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="relative py-24 px-5 text-center overflow-hidden">
        <div
          className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 h-72 w-[50rem] rounded-full opacity-20 blur-3xl"
          style={{ background: "var(--color-primary)" }}
        />
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative space-y-6"
        >
          <Activity className="h-10 w-10 mx-auto text-[var(--color-primary)]" />
          <h2 className="text-3xl sm:text-5xl font-extrabold leading-tight">
            Tu gym, bajo control
            <br />
            desde hoy.
          </h2>
          <Link
            href="/register"
            className="inline-block rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-contrast)] px-8 py-4 text-lg font-bold hover:opacity-90 transition-opacity"
          >
            Registra tu gimnasio gratis
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10 px-5">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/40">
          <div className="flex items-center gap-2">
            <BrandMark className="h-6 w-6" />
            <span>© {new Date().getFullYear()} FitConnect</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a href="#features" className="hover:text-white/70 transition-colors">Funciones</a>
            <a href="#pricing" className="hover:text-white/70 transition-colors">Precios</a>
            <Link href="/privacidad" className="hover:text-white/70 transition-colors">Privacidad</Link>
            <Link href="/terminos" className="hover:text-white/70 transition-colors">Términos</Link>
            <Link href="/tratamiento-datos" className="hover:text-white/70 transition-colors">Tratamiento de datos</Link>
            <Link href="/login" className="hover:text-white/70 transition-colors">Ingresar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
