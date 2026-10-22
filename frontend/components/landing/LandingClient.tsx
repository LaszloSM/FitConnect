import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon as ArrowRight,
  CheckIcon as Check,
  CloudSlashIcon as CloudOff,
  FingerprintIcon as Fingerprint,
  IdentificationCardIcon as IdCard,
  LightningSlashIcon as PowerOff,
  ProhibitIcon as Blocked,
  ScanSmileyIcon as Face,
} from "@phosphor-icons/react/ssr";
import { BrandMark } from "@/components/common/BrandMark";
import { LEGAL } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";
import { DayStory, type Moment } from "./DayStory";
import { HeroShowcase } from "./HeroShowcase";
import { LandingHeader } from "./LandingHeader";
import { PhoneShowcase } from "./PhoneShowcase";
import { ProductTour } from "./ProductTour";
import { Reveal } from "./Reveal";

/*
 * Landing de LSMFit. Cada imagen es una captura del panel funcionando con un
 * gimnasio de demostración (public/landing, regeneradas con
 * e2e/capturas-landing.spec.ts) y ninguna se repite entre secciones. Nada de
 * cifras inventadas ni logos de clientes que no existen.
 */

const MOMENTOS: Moment[] = [
  {
    hora: "5:58",
    titulo: "La puerta abre sola para quien está al día",
    texto: "El socio digita su cédula en una tablet, pone la huella o mira la cámara del torniquete. Si debe, no pasa, y su ficha salta en el Mostrador con lo que debe.",
    detalle: ["Cédula, huella, rostro o torniquete", "Las entradas aparecen en vivo en recepción"],
    img: "/landing/mostrador.webp",
    alt: "El Mostrador de LSMFit con las entradas del día en vivo",
  },
  {
    hora: "7:10",
    titulo: "Cobrar toma un clic",
    texto: "Renovación, pase del día o una botella de agua, en efectivo, transferencia o tarjeta. Sale el recibo con número consecutivo, la membresía se renueva y el inventario se descuenta solo.",
    detalle: ["La renovación sugerida ya trae el plan y el valor", "Links de pago en línea con Wompi"],
    img: "/landing/cobro.webp",
    alt: "Pantalla de cobro con la renovación sugerida de un socio y la venta de productos",
  },
  {
    hora: "12:30",
    titulo: "Las clases se llenan sin cuaderno",
    texto: "Armas el horario de la semana con entrenador y cupo. Los socios reservan desde la app y, si alguien cancela, el siguiente en la lista de espera sube solo.",
    detalle: ["Cupos, lista de espera y asistencia", "Cada entrenador ve sus clases y sus socios"],
    img: "/landing/clases.webp",
    alt: "Agenda semanal de clases con entrenador y cupos",
  },
  {
    hora: "18:00",
    titulo: "Sabes a qué hora se llena",
    texto: "Entradas por día y un mapa de calor por hora con las visitas reales. Mueves clases, turnos y personal con datos, no a ojo.",
    detalle: ["Horas pico y días flojos", "Reportes en PDF y Excel con tu logo"],
    img: "/landing/asistencia.webp",
    alt: "Reporte de asistencia con entradas por día y mapa de calor por día y hora",
  },
  {
    hora: "21:30",
    titulo: "La caja cuadra antes de irte",
    texto: "Quien cierra cuenta los billetes sin ver cuánto debería haber. LSMFit compara con lo cobrado y deja la diferencia anotada con su nombre.",
    detalle: ["Gastos y retiros a la bóveda, cada uno anotado", "Corte parcial sin cerrar el turno"],
    img: "/landing/caja.webp",
    alt: "Cierre del turno de caja con el conteo de billetes por denominación",
  },
];

const ROLES = [
  ["Dueño", "Todo: plata, reportes, inteligencia, auditoría y el equipo."],
  ["Administración", "Opera el negocio sin ver secretos, nómina ni la auditoría."],
  ["Recepción", "Entradas, cobros y caja. Sin ingresos del mes ni reportes."],
  ["Entrenador", "Sus clases, sus socios y sus rutinas. Nada más."],
];

const CONFIANZA = [
  ["Una base de datos por gimnasio", "Tus datos no comparten tabla con los de otro gimnasio."],
  ["Verificación en dos pasos", "Con app autenticadora, código al correo o llave de acceso del celular."],
  ["Fotos y comprobantes privados", "Se abren con enlaces que vencen en minutos."],
  ["Auditoría", "Cada acción sensible del equipo queda registrada con su nombre."],
];

const ACCESO = [
  { icon: IdCard, t: "Cédula", d: "En una tablet o celular en la entrada. Sirve para todos, sin comprar nada." },
  { icon: Fingerprint, t: "Huella", d: "Se registra desde la ficha del socio; el lector muestra el avance." },
  { icon: Face, t: "Rostro", d: "Con la foto de la ficha o capturándolo en el propio equipo." },
  { icon: Blocked, t: "Al día, o no pasa", d: "Vence la membresía y la puerta lo sabe sin que nadie haga nada." },
  { icon: CloudOff, t: "Sin internet", d: "El torniquete sigue decidiendo y recepción sigue registrando. Todo sube al volver la red." },
  { icon: PowerOff, t: "Sin luz", d: "Ningún equipo funciona sin energía: con una UPS pequeña, la puerta y recepción siguen." },
];

interface PlanFeature {
  text: string;
  soon?: boolean;
}

const PRICING: { name: string; price: string; tagline: string; highlight: boolean; features: PlanFeature[] }[] = [
  {
    name: "Básico",
    price: "$160.000",
    tagline: "Todo para operar el gimnasio",
    highlight: false,
    features: [
      { text: "Socios ilimitados, cobros, caja e inventario" },
      { text: "Control de entrada con cédula, huella o rostro" },
      { text: "Clases, reservas, rutinas y máquinas" },
      { text: "Reportes en PDF y Excel con tu marca" },
      { text: "Recepción que sigue funcionando sin internet" },
      { text: "Soporte por correo" },
    ],
  },
  {
    name: "Avanzado",
    price: "$300.000",
    tagline: "Lo del Básico más la app para tus socios",
    highlight: true,
    features: [
      { text: "Todo lo del plan Básico" },
      { text: "App para tus socios: membresía, clases, pagos y entrenos", soon: true },
      { text: "Invitación automática por correo con su código de acceso", soon: true },
    ],
  },
  {
    name: "Premium IA",
    price: "$480.000",
    tagline: "Avanzado con inteligencia para decidir",
    highlight: false,
    features: [
      { text: "Todo lo del plan Avanzado" },
      { text: "Quién probablemente no renueva, cierre del mes y aforo de la semana" },
      { text: "Planes de entreno y comidas con IA en la app", soon: true },
      { text: "Soporte prioritario" },
    ],
  },
];

const FAQS = [
  {
    q: "¿Tengo que comprar equipos para controlar la entrada?",
    a: "No. La entrada por cédula funciona en cualquier tablet o celular que tengas, aunque sea viejo. Si ya tienes un torniquete o un lector de huella o rostro, escríbenos con la marca y el modelo y te decimos si se puede conectar.",
  },
  {
    q: "¿Qué pasa si se va el internet?",
    a: "La recepción sigue funcionando en el computador preparado para eso: buscas socios, registras entradas y cobras en efectivo. Cuando vuelve la red todo sube solo, sin duplicados. Si tienes torniquete, sigue dejando entrar a quien está al día.",
  },
  {
    q: "¿Y si se va la luz?",
    a: "Sin energía ningún computador ni torniquete funciona. Con una UPS pequeña (la batería que se conecta al enchufe) la puerta y recepción aguantan un corte normal.",
  },
  {
    q: "¿Qué pasa si un socio vencido intenta entrar?",
    a: "No pasa, y en el Mostrador salta su ficha con lo que debe. Si decides dejarlo entrar igual, esa autorización queda en la auditoría con el nombre de quien la dio.",
  },
  {
    q: "Hoy llevo todo en Excel o en un cuaderno. ¿Cómo paso mis socios?",
    a: "Descargas la plantilla, pegas tus socios y los subes. Si a alguno le faltan datos, LSMFit le envía un correo con un enlace para que complete su ficha desde el celular.",
  },
  {
    q: "¿Mis recepcionistas van a ver cuánto gana el gimnasio?",
    a: "No. Cada persona ve solo lo de su rol. Recepción maneja entradas, cobros y caja, pero no ve los ingresos del mes, los reportes ni la auditoría.",
  },
  {
    q: "¿Puedo revisar el gimnasio desde el celular?",
    a: "Sí. El panel funciona en el navegador del celular, así que puedes ver las entradas y lo cobrado desde la casa. En el computador de recepción puedes instalar LSMFit como una aplicación.",
  },
  {
    q: "¿Cómo les llega la app a mis socios?",
    a: "Con el plan Avanzado, cada socio con correo recibe una invitación con el enlace de descarga y su código para unirse a tu gimnasio. La app está terminada y llega a las tiendas pronto.",
  },
  {
    q: "¿Mis datos y los de mis socios están seguros?",
    a: "Cada gimnasio tiene su propia base de datos, las fotos y comprobantes son privados y puedes activar la verificación en dos pasos. Los datos de tus socios son tuyos: nosotros solo los guardamos para prestarte el servicio.",
  },
  {
    q: "¿Qué incluye la prueba de 30 días?",
    a: "Todo, sin tarjeta de crédito. Al terminar eliges un plan; si no te convence, no pagas nada y puedes llevarte tus datos.",
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí. No hay permanencia ni multas: nos escribes, y antes de irte descargas tus socios e informes en Excel.",
  },
];

const BTN =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] px-6 text-base font-semibold transition-[transform,background-color] duration-150 active:scale-[0.97] sm:w-auto";
const CTA_PRIMARY = `${BTN} bg-primary text-primary-contrast shadow-[var(--shadow-primary)] hover:bg-[var(--color-primary-hover)]`;
const CTA_SECONDARY = `${BTN} border border-line bg-panel text-ink hover:bg-muted`;

function SectionTitle({ title, text, className = "" }: { title: string; text?: string; className?: string }) {
  return (
    <Reveal className={`max-w-2xl space-y-4 ${className}`}>
      <h2 className="font-display text-[34px] font-bold leading-[1.08] tracking-[-0.025em] [text-wrap:balance] sm:text-[44px]">{title}</h2>
      {text && <p className="text-[17px] leading-relaxed text-ink-muted">{text}</p>}
    </Reveal>
  );
}
// Datos estructurados para buscadores: salen de los mismos precios y preguntas
// que se ven en la página, así nunca dicen algo distinto.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organizacion`,
      name: "LSMFit",
      url: SITE_URL,
      logo: `${SITE_URL}/app-icon-512.png`,
      email: LEGAL.email,
      address: { "@type": "PostalAddress", addressLocality: LEGAL.city, addressRegion: LEGAL.department, addressCountry: "CO" },
    },
    {
      "@type": "SoftwareApplication",
      name: "LSMFit",
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "es-CO",
      description: "Software para gimnasios en Colombia: control de entrada, cobros con recibo, caja, clases, inventario y reportes.",
      publisher: { "@id": `${SITE_URL}/#organizacion` },
      offers: PRICING.map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        price: plan.price.replace(/\D/g, ""),
        priceCurrency: "COP",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: plan.price.replace(/\D/g, ""),
          priceCurrency: "COP",
          unitCode: "MON",
        },
      })),
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function LandingClient() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-surface text-ink selection:bg-primary selection:text-primary-contrast">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />
      <LandingHeader />

      <main>
        {/* Hero */}
        <section className="px-5 pb-24 pt-12 sm:pt-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl space-y-6">
              <h1 className="font-display text-[clamp(2.4rem,6vw,4.25rem)] font-bold leading-[1.02] tracking-[-0.035em] [text-wrap:balance]">
                Controla quién entra, cobra con recibo y cuadra la caja cada noche.
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-ink-muted sm:text-xl">
                El software para gimnasios de Colombia: entrada con cédula o huella, cobros en pesos, clases, reportes y
                una app para tus socios. Cada persona de tu equipo ve solo lo suyo.
              </p>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
                <Link href="/register" className={CTA_PRIMARY}>
                  Prueba 30 días gratis <ArrowRight className="size-5" weight="bold" />
                </Link>
                <a href="#producto" className={CTA_SECONDARY}>
                  Ver cómo funciona
                </a>
              </div>
              <p className="text-sm text-ink-muted">Sin tarjeta de crédito · Importas tus socios desde Excel · Sin permanencia</p>
            </div>
            <div className="mt-14 sm:mt-16">
              <HeroShowcase />
            </div>
          </div>
        </section>

        {/* Hecho para Colombia */}
        <section aria-label="Hecho para gimnasios en Colombia" className="border-y border-line bg-panel px-5">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 md:grid-cols-4">
            {[
              ["Cédula", "CC, CE, TI y pasaporte, en la puerta y en cada recibo"],
              ["Pesos", "Precios, recibos y reportes en COP"],
              ["Wompi y transferencias", "Links de pago y transferencias por confirmar"],
              ["Sin internet", "La recepción sigue y todo sube al volver"],
            ].map(([t, d], i) => (
              <div key={t} className={`py-6 pr-4 md:px-6 md:first:pl-0 ${i > 0 ? "md:border-l md:border-line" : ""} ${i > 1 ? "border-t border-line md:border-t-0" : ""}`}>
                <dt className="font-display text-[17px] font-bold">{t}</dt>
                <dd className="mt-1 text-sm text-ink-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Un día en el gimnasio */}
        <section id="producto" className="scroll-mt-16 px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <SectionTitle
              className="mb-14 lg:mb-6"
              title="Un día en tu gimnasio, de la primera entrada al cierre"
              text="Así se ve LSMFit en los momentos en que un gimnasio gana o pierde plata. Son pantallas del producto, no ilustraciones."
            />
            <DayStory moments={MOMENTOS} />
          </div>
        </section>

        {/* Más pantallas */}
        <section className="border-t border-line bg-panel px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <SectionTitle className="mb-10" title="Todo el gimnasio en un solo lugar" text="Socios, fichas, máquinas y la plata del mes, sin saltar entre cuadernos, hojas de cálculo y chats." />
            <ProductTour />
          </div>
        </section>

        {/* Inteligencia */}
        <section id="inteligencia" className="scroll-mt-16 border-t border-line px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
              <SectionTitle
                title="Te avisa antes de que un socio se vaya"
                text="Cada noche LSMFit aprende de la historia de tu propio gimnasio. Te dice quién probablemente no renueva, cómo va a cerrar el mes y cuándo se va a llenar. Y si todavía no hay datos suficientes para confiar, lo dice."
              />
              <Reveal>
                <dl className="divide-y divide-line border-y border-line">
                  {[
                    ["¿Renovará?", "La probabilidad de que cada socio no renueve, tres semanas antes de que se le venza."],
                    ["Cierre del mes", "Cuánto vas a facturar si sigues al ritmo de hoy, contando quincenas y festivos."],
                    ["Aforo de la semana", "A qué horas se va a llenar, para mover clases y turnos a tiempo."],
                    ["Días raros", "Ingresos o entradas fuera de lo normal, para revisar qué pasó."],
                  ].map(([t, d]) => (
                    <div key={t} className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
                      <dt className="font-semibold">{t}</dt>
                      <dd className="text-[15px] text-ink-muted">{d}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            </div>
            <Reveal className="mt-14" delay={0.05}>
              <div className="overflow-hidden rounded-[var(--radius-xl)] bg-panel shadow-[var(--shadow-lg)] ring-1 ring-line/70">
                <Image
                  src="/landing/inteligencia.webp"
                  alt="Pantalla de Inteligencia: modelos del gimnasio, proyección del cierre del mes y socios en riesgo"
                  width={1440}
                  height={900}
                  sizes="(min-width: 1152px) 1100px, 100vw"
                  className="block h-auto w-full"
                />
              </div>
            </Reveal>
          </div>
        </section>

        {/* Acceso */}
        <section id="acceso" className="scroll-mt-16 border-t border-line bg-panel px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <SectionTitle
              className="mb-12"
              title="La puerta obedece a LSMFit, aunque se caiga el internet"
              text="Empiezas con una tablet en la entrada. Si ya tienes torniquete o lector, LSMFit le dice quién está al día y registras la huella o el rostro desde la ficha del socio."
            />
            <ul className="grid gap-x-12 sm:grid-cols-2 lg:grid-cols-3">
              {ACCESO.map(({ icon: Icon, t, d }) => (
                <li key={t} className="flex gap-4 border-t border-line py-6">
                  <Icon className="mt-0.5 size-6 shrink-0 text-primary-ink" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">{t}</p>
                    <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* App del socio */}
        <section id="app" className="scroll-mt-16 border-t border-line px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <SectionTitle
              className="mb-6"
              title="Tu gimnasio en el bolsillo de cada socio"
              text="Les llega una invitación al correo con su código, y en un minuto ven su membresía, reservan clases y llevan sus entrenos. Lo que registran para sí mismos es privado: el gimnasio no lo ve."
            />
            <p className="mb-12 inline-flex rounded-[var(--radius-sm)] bg-[var(--signal-warn-bg)] px-2.5 py-1 text-sm font-medium text-[var(--signal-warn)]">
              Próximamente en App Store y Google Play
            </p>
            <PhoneShowcase />
          </div>
        </section>

        {/* Roles y confianza */}
        <section className="border-t border-line bg-panel px-5 py-24 sm:py-28">
          <div className="mx-auto grid max-w-6xl gap-16 lg:grid-cols-2">
            <Reveal>
              <h2 className="mb-6 font-display text-[28px] font-bold tracking-[-0.02em]">Cada quien ve lo suyo</h2>
              <dl className="divide-y divide-line border-y border-line">
                {ROLES.map(([r, d]) => (
                  <div key={r} className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-4">
                    <dt className="font-semibold">{r}</dt>
                    <dd className="text-[15px] text-ink-muted">{d}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mb-6 font-display text-[28px] font-bold tracking-[-0.02em]">Cédulas, salud y plata, en serio</h2>
              <dl className="divide-y divide-line border-y border-line">
                {CONFIANZA.map(([t, d]) => (
                  <div key={t} className="py-4">
                    <dt className="font-semibold">{t}</dt>
                    <dd className="mt-1 text-[15px] text-ink-muted">{d}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/tratamiento-datos" className="mt-6 inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary-ink underline-offset-4 hover:underline">
                Cómo tratamos los datos <ArrowRight className="size-4" weight="bold" />
              </Link>
            </Reveal>
          </div>
        </section>

        {/* Precios */}
        <section id="precios" className="scroll-mt-16 border-t border-line px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <SectionTitle className="mb-12" title="Precios por sede, en pesos" text="Todos los planes empiezan con 30 días gratis, sin tarjeta. Sin permanencia." />
            <div className="grid items-start gap-5 md:grid-cols-3">
              {PRICING.map((plan) => (
                <div
                  key={plan.name}
                  className={`flex h-full flex-col rounded-[var(--radius-xl)] bg-panel p-6 sm:p-7 ${plan.highlight ? "shadow-[var(--shadow-lg)] ring-2 ring-[var(--brand)]" : "shadow-[var(--shadow-card)]"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-xl font-bold">{plan.name}</h3>
                    {plan.highlight && (
                      <span className="rounded-[var(--radius-sm)] bg-primary px-2 py-0.5 text-xs font-semibold text-primary-contrast">Recomendado</span>
                    )}
                  </div>
                  <p className="mt-1 text-[15px] text-ink-muted">{plan.tagline}</p>
                  <p className="num mt-6 font-display text-[44px] font-bold leading-none tracking-[-0.03em]">{plan.price}</p>
                  <p className="mt-2 text-sm text-ink-muted">COP al mes por sede</p>
                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f.text} className="flex items-start gap-2.5 text-[15px]">
                        <Check className="mt-1 size-4 shrink-0 text-primary-ink" weight="bold" aria-hidden />
                        <span className="text-ink-muted">
                          {f.text}
                          {f.soon && (
                            <span className="ml-1.5 inline-block rounded-[var(--radius-sm)] bg-[var(--signal-warn-bg)] px-1.5 align-middle text-xs font-medium text-[var(--signal-warn)]">
                              Próximamente
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/register" className={`mt-8 ${plan.highlight ? CTA_PRIMARY : CTA_SECONDARY} sm:w-full`}>
                    Prueba 30 días gratis
                  </Link>
                </div>
              ))}
            </div>
            <p className="mt-6 max-w-2xl text-sm text-ink-muted">
              Lo marcado como «Próximamente» ya está construido y llega cuando la app esté publicada en las tiendas. Si
              contratas hoy, lo recibes sin costo adicional.
            </p>
          </div>
        </section>

        {/* Preguntas */}
        <section id="preguntas" className="scroll-mt-16 border-t border-line bg-panel px-5 py-24 sm:py-28">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
            <div className="space-y-4">
              <h2 className="font-display text-[34px] font-bold leading-[1.08] tracking-[-0.025em] sm:text-[44px]">Preguntas frecuentes</h2>
              <p className="text-[17px] leading-relaxed text-ink-muted">
                ¿Te quedó una duda? Escríbenos a{" "}
                <a href={`mailto:${LEGAL.email}`} className="font-semibold text-primary-ink underline-offset-4 hover:underline">
                  {LEGAL.email}
                </a>
                .
              </p>
            </div>
            <div className="border-t border-line">
              {FAQS.map((f) => (
                <details key={f.q} className="group border-b border-line">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span
                      aria-hidden="true"
                      className="relative size-4 shrink-0 before:absolute before:left-0 before:top-1/2 before:h-0.5 before:w-4 before:-translate-y-1/2 before:rounded-full before:bg-ink-muted after:absolute after:left-1/2 after:top-0 after:h-4 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-ink-muted after:transition-transform after:duration-200 group-open:after:scale-y-0"
                    />
                  </summary>
                  <p className="max-w-[65ch] pb-5 text-[15px] leading-relaxed text-ink-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Cierre */}
        <section className="border-t border-line px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <Reveal className="rounded-[var(--radius-xl)] bg-[var(--kiosk-bg)] px-6 py-14 text-center sm:px-12 sm:py-20">
              <h2 className="mx-auto max-w-3xl font-display text-[34px] font-bold leading-[1.08] tracking-[-0.025em] text-white [text-wrap:balance] sm:text-[48px]">
                Mañana a las 5:30 puede estar funcionando.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-white/75">
                Registras el gimnasio, subes tus socios desde Excel y pones una tablet en la puerta.
              </p>
              <div className="mt-8 flex justify-center">
                <Link href="/register" className={CTA_PRIMARY}>
                  Prueba 30 días gratis <ArrowRight className="size-5" weight="bold" />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 text-sm text-ink-muted md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-6 w-6 text-logo" />
            <span>© {new Date().getFullYear()} LSMFit · Hecho en Colombia</span>
          </div>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-3">
            <Link href="/terminos" className="hover:text-ink">Términos</Link>
            <Link href="/privacidad" className="hover:text-ink">Privacidad</Link>
            <Link href="/tratamiento-datos" className="hover:text-ink">Tratamiento de datos</Link>
            <a href={`mailto:${LEGAL.email}`} className="hover:text-ink">{LEGAL.email}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
