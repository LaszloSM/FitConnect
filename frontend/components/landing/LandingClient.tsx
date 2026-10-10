import Image from "next/image";
import Link from "next/link";
import { BrandMark } from "@/components/common/BrandMark";
import { BrandLockup } from "@/components/common/BrandLockup";
import { ArrowRightIcon as ArrowRight, CheckIcon as Check, CloudSlashIcon as CloudOff, DatabaseIcon as Database, FingerprintIcon as Fingerprint, IdentificationCardIcon as IdCard, KeyIcon as KeyRound, LockIcon as Lock, QrCodeIcon as QrCode, ScanSmileyIcon as Face, ScrollIcon as ScrollText } from "@phosphor-icons/react/ssr";
import { PhoneShowcase } from "./PhoneShowcase";
import { ProductTour } from "./ProductTour";
import { Reveal } from "./Reveal";

/*
 * Landing en Tiza claro. Muestra el producto real: cada imagen es una captura
 * del panel funcionando con el gimnasio demo (public/landing). Nada de cifras
 * inventadas ni logos de clientes que no existen.
 */

function Screenshot({ src, alt, path }: { src: string; alt: string; path: string }) {
  return (
    <figure className="overflow-hidden rounded-[var(--radius-xl)] bg-panel shadow-[var(--shadow-lg)] ring-1 ring-line/60">
      <div className="flex h-9 items-center gap-2 border-b border-line px-4" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-[var(--border-base)]" />
        <span className="size-2.5 rounded-full bg-[var(--border-base)]" />
        <span className="size-2.5 rounded-full bg-[var(--border-base)]" />
      </div>
      <Image src={src} alt={alt} width={1440} height={900} className="block h-auto w-full" sizes="(min-width: 1024px) 1100px, 100vw" />
    </figure>
  );
}

const MOMENTOS = [
  {
    hora: "5:58",
    titulo: "La puerta decide sola",
    texto: "El socio digita su cédula en una tablet vieja y entra si está al día. Si debe, el kiosko lo manda a recepción y su ficha salta en el mostrador con lo que debe.",
    detalle: ["Cédula, QR de la app, cara, huella o torniquete", "Personal del gimnasio entra con su propia ficha"],
    img: "/landing/socios.png",
    path: "/members",
    alt: "Lista de socios con estado de membresía, vencimiento y saldo",
  },
  {
    hora: "7:10",
    titulo: "Cobrar toma un clic",
    texto: "Renovación, pase del día o una proteína, en efectivo, transferencia o tarjeta. Sale el recibo consecutivo, la membresía se renueva y el inventario se descuenta.",
    detalle: ["Links de pago por WhatsApp", "Devoluciones con rastro, nunca pagos borrados"],
    img: "/landing/cobro.png",
    path: "/payments",
    alt: "Pantalla de cobro con búsqueda de socio y venta de productos con stock",
  },
  {
    hora: "18:00",
    titulo: "Sabes cuándo se llena",
    texto: "Entradas por día y un mapa de calor por hora, calculados con las entradas reales. Mueves clases, turnos y personal con datos, no con intuición.",
    detalle: ["Horas pico y días flojos", "Reportes PDF y Excel con tu logo"],
    img: "/landing/asistencia.png",
    path: "/reports?tab=asistencia",
    alt: "Reporte de asistencia con entradas por día y mapa de calor por día y hora",
  },
  {
    hora: "21:30",
    titulo: "Te avisa antes de que se vayan",
    texto: "Modelos entrenados cada noche con el historial de tu gimnasio marcan quién probablemente no renueva y cómo va a cerrar el mes. Cada número dice con qué se calculó.",
    detalle: ["Si el modelo no supera a la regla simple, se usa la regla y lo dice", "Sin enviar datos de tus socios a terceros"],
    img: "/landing/inteligencia.png",
    path: "/reports?tab=inteligencia",
    alt: "Modelos del gimnasio con su estado de entrenamiento y la proyección de ingresos del mes",
  },
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

const PRICING: { name: string; price: string; tagline: string; highlight: boolean; features: PlanFeature[] }[] = [
  {
    name: "Básico", price: "$160.000", tagline: "Todo el panel para operar tu gym", highlight: false,
    features: [
      { text: "Socios ilimitados, caja, POS e inventario" },
      { text: "Kiosko de entrada y control de acceso" },
      { text: "Clases, reservas y entrenadores" },
      { text: "Inteligencia entrenada con tus datos" },
      { text: "Reportes PDF y Excel con tu marca" },
      { text: "Soporte por WhatsApp" },
    ],
  },
  {
    name: "Avanzado", price: "$300.000", tagline: "El panel más la app para tus socios", highlight: true,
    features: [
      { text: "Todo lo del plan Básico" },
      { text: "App para tus socios: QR de entrada, clases, pagos y rutinas", soon: true },
      { text: "Entrenos y comidas en la app, también sin señal", soon: true },
    ],
  },
  {
    name: "Premium", price: "$480.000", tagline: "Avanzado con acompañamiento en la app", highlight: false,
    features: [
      { text: "Todo lo del plan Avanzado" },
      { text: "Asistente de entrenamiento y alimentación en la app", soon: true },
      { text: "Soporte prioritario" },
    ],
  },
];

const FAQS = [
  { q: "¿Necesito comprar hardware para la entrada?", a: "No. El kiosko es una página web: cualquier tablet o celular viejo en la entrada funciona. Si ya tienes torniquete con cara o huella (ZKTeco o Hikvision), LSMFit lo controla y registras a los socios desde su ficha." },
  { q: "¿Qué pasa si se va el internet?", a: "El torniquete sigue decidiendo con la lista que ya tiene y guarda las marcaciones. La recepción sigue funcionando en el navegador: entradas, altas y cobros en efectivo se guardan en el equipo y suben solos cuando vuelve la red, sin duplicados." },
  { q: "¿Qué pasa si un socio vencido intenta entrar?", a: "El kiosko lo manda a recepción y en el mostrador salta su ficha con cuánto debe y un botón para autorizarlo si decides dejarlo pasar. Esa autorización queda en la auditoría." },
  { q: "¿La inteligencia funciona si mi gimnasio es nuevo?", a: "Los modelos se entrenan con tu propio historial. Mientras no haya suficiente, la pantalla usa reglas simples y te dice cuántos datos faltan. A medida que el gimnasio opera, se entrenan solos cada noche." },
  { q: "¿Mis recepcionistas van a ver cuánto gana el gimnasio?", a: "No. Cada rol ve solo lo suyo: recepción opera la entrada, el cobro y la caja, sin ingresos del mes, reportes ni auditoría. Lo que no le corresponde ni siquiera aparece en su menú." },
  { q: "Hoy llevo todo en Excel o en un cuaderno, ¿cómo migro?", a: "Descargas la plantilla, pegas tus socios y los importas en un clic. Quedan listos para entrar por el kiosko y para asignarles membresía." },
  { q: "¿Cómo manejan los datos personales de mis socios?", a: "Cumplimos la Ley 1581 de 2012: tú eres el responsable del tratamiento y LSMFit el encargado. Los datos de salud se tratan como sensibles." },
  { q: "¿Qué incluye la prueba de 30 días?", a: "Todo el plan que elijas, sin tarjeta. Si no te convence, exportas tus datos y no se te cobra nada." },
  { q: "¿Puedo cancelar cuando quiera?", a: "Sí. No hay permanencia: cancelas desde la configuración y te llevas tus datos." },
];

const CTA_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-primary px-5 py-3 text-sm font-medium text-primary-contrast transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97]";
const CTA_SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-line bg-panel px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-muted";

export default function LandingClient() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-surface text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandLockup height={22} />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-ink-muted md:flex" aria-label="Secciones">
            <a href="#producto" className="hover:text-ink">Producto</a>
            <a href="#app" className="hover:text-ink">App</a>
            <a href="#acceso" className="hover:text-ink">Acceso</a>
            <a href="#inteligencia" className="hover:text-ink">Inteligencia</a>
            <a href="#precios" className="hover:text-ink">Precios</a>
            <a href="#preguntas" className="hover:text-ink">Preguntas</a>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hidden text-sm text-ink-muted hover:text-ink sm:inline">Ingresar</Link>
            <Link href="/register" className="whitespace-nowrap rounded-[var(--radius-md)] bg-primary px-3.5 py-2 text-sm font-medium text-primary-contrast hover:opacity-90">
              Prueba 30 días
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero: titular corto y el panel real, grande */}
        <section className="px-5 pb-16 pt-14 sm:pt-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl space-y-5">
              <p className="text-sm font-medium text-primary-ink">Software para gimnasios en Colombia</p>
              <h1 className="text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] [text-wrap:balance]">
                Controla quién entra, cobra con recibo y cuadra la caja cada noche.
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-ink-muted">
                Entrada por cédula, cobros en COP con Wompi y transferencias, caja a ciegas y modelos que te avisan qué socios estás por perder. Cada rol ve solo lo suyo.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link href="/register" className={CTA_PRIMARY}>
                  Empieza gratis <ArrowRight className="size-4" />
                </Link>
                <a href="#producto" className={CTA_SECONDARY}>Ver el producto</a>
              </div>
              <p className="text-sm text-ink-subtle">Sin tarjeta de crédito · Importas tus socios desde Excel · Ley 1581 de datos personales</p>
            </div>
            <div className="mt-12">
              <ProductTour />
            </div>
          </div>
        </section>

        {/* Hechos, no logos: lo que el producto resuelve de entrada */}
        <section aria-label="Hecho para Colombia" className="border-y border-line bg-panel px-5">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
            {[
              ["Cédula", "CC, CE, TI y pasaporte en la entrada"],
              ["COP", "Precios, recibos y reportes en pesos"],
              ["Wompi", "Links de pago y conciliación"],
              ["Ley 1581", "Autorización y datos sensibles"],
            ].map(([t, d]) => (
              <div key={t} className="px-4 py-6 first:pl-0 md:px-6">
                <dt className="num text-sm font-semibold">{t}</dt>
                <dd className="mt-1 text-sm text-ink-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Un día en el gimnasio, con capturas reales en zig-zag */}
        <section id="producto" className="scroll-mt-16 px-5 py-20">
          <div className="mx-auto max-w-6xl">
            <Reveal className="mb-14 max-w-2xl space-y-3">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl [text-wrap:balance]">Un día en tu gimnasio, de la primera entrada al cierre</h2>
              <p className="text-ink-muted">Así se ve LSMFit en los momentos donde un gimnasio gana o pierde plata. Son pantallas del producto, no ilustraciones.</p>
            </Reveal>
            <ol className="space-y-20">
              {MOMENTOS.map((m, i) => (
                <li key={m.hora} className={i % 2 === 1 ? "grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]" : "grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]"}>
                  <Reveal className={i % 2 === 1 ? "space-y-4 lg:order-2" : "space-y-4"}>
                    <p className="num text-sm text-primary-ink">{m.hora}</p>
                    <h3 className="text-2xl font-semibold tracking-[-0.02em]">{m.titulo}</h3>
                    <p className="leading-relaxed text-ink-muted">{m.texto}</p>
                    <ul className="space-y-2">
                      {m.detalle.map((d) => (
                        <li key={d} className="flex items-start gap-2 text-sm text-ink-muted">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary-ink" /> {d}
                        </li>
                      ))}
                    </ul>
                  </Reveal>
                  <Reveal delay={0.08}>
                    <Screenshot src={m.img} path={m.path} alt={m.alt} />
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* La app del socio, con pantallas reales */}
        <section id="app" className="scroll-mt-16 border-t border-line bg-panel px-5 py-20">
          <div className="mx-auto max-w-6xl">
            <Reveal className="mb-12 max-w-2xl space-y-3">
              <p className="text-sm font-medium text-primary-ink">App para tus socios · Android y iPhone</p>
              <h2 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl [text-wrap:balance]">Tu gimnasio en el bolsillo de cada socio</h2>
              <p className="text-ink-muted">
                Entran con su correo, recepción les da un código y la app queda unida a su ficha. Lo que registran para sí mismos (medidas, entrenos, comidas) vive aparte y el gimnasio no lo ve.
              </p>
              <p className="inline-block rounded-[var(--radius-sm)] border border-[var(--signal-warn-line)] bg-[var(--signal-warn-bg)] px-2 py-0.5 text-xs text-[var(--signal-warn)]">
                Próximamente en App Store y Google Play
              </p>
            </Reveal>
            <PhoneShowcase />
          </div>
        </section>

        {/* Torniquete y recepción sin internet */}
        <section id="acceso" className="scroll-mt-16 border-t border-line px-5 py-20">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal className="space-y-4">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl [text-wrap:balance]">El torniquete obedece a LSMFit, aunque se caiga el internet</h2>
              <p className="leading-relaxed text-ink-muted">
                Conectas tu terminal ZKTeco o Hikvision y LSMFit le dice quién está al día. La cara y la huella se registran desde la ficha del socio, como en el software de siempre, y el equipo decide solo si se va la red.
              </p>
              <p className="leading-relaxed text-ink-muted">
                Si el internet se cae en recepción, la página sigue abriendo: registras entradas, altas y cobros en efectivo, y todo sube solo y sin duplicados cuando vuelve.
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <ul className="grid gap-4 sm:grid-cols-2">
                {[
                  { icon: Face, t: "Cara", d: "Foto desde la ficha o captura en el propio equipo." },
                  { icon: Fingerprint, t: "Huella", d: "El equipo entra en modo registro desde la web y muestra el avance." },
                  { icon: QrCode, t: "QR de la app", d: "Cambia cada 30 segundos; el de una captura ya no sirve." },
                  { icon: IdCard, t: "Cédula", d: "Para quien no tiene celular a la mano." },
                  { icon: CloudOff, t: "Sin internet", d: "El torniquete guarda las marcaciones y las sube al volver." },
                  { icon: Lock, t: "Al día, o no pasa", d: "Vence la membresía y el equipo lo sabe sin que nadie haga nada." },
                ].map(({ icon: Icon, t, d }) => (
                  <li key={t} className="rounded-[var(--radius-lg)] bg-panel p-5 shadow-[var(--shadow-card)]">
                    <Icon className="size-5 text-primary-ink" aria-hidden="true" />
                    <p className="mt-3 font-medium">{t}</p>
                    <p className="mt-1 text-sm text-ink-muted">{d}</p>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* Inteligencia, dicha con honestidad */}
        <section id="inteligencia" className="scroll-mt-16 border-t border-line bg-panel px-5 py-20">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl [text-wrap:balance]">Modelos que aprenden de tu gimnasio, no de uno promedio</h2>
              <p className="leading-relaxed text-ink-muted">
                Cada noche se entrenan con los datos de tu propio gimnasio. Cada número dice con qué se calculó y, cuando el modelo todavía no supera a la regla simple, se usa la regla.
              </p>
            </div>
            <dl className="divide-y divide-line border-y border-line">
              {[
                ["¿Renovará?", "Probabilidad calibrada de que cada socio no renueve, vista tres semanas antes de vencer. Solo se usa si le gana a la regla simple"],
                ["Cierre del mes", "Holt-Winters con el patrón semanal, la quincena y los festivos de Colombia, probado en cuatro ventanas contra el ritmo simple"],
                ["Aforo de la semana", "Regresión día × hora sobre tus entradas de las últimas 8 semanas, sin contar festivos"],
                ["Segmentos", "K-means que separa fieles, recién llegados y los que se están alejando"],
                ["Reacción al precio", "Elasticidad de la renovación cuando un plan cambió de precio"],
                ["Días fuera de lo normal", "Isolation Forest sobre ingresos y asistencia de cada día"],
              ].map(([t, d]) => (
                <div key={t} className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
                  <dt className="font-medium">{t}</dt>
                  <dd className="text-sm text-ink-muted">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Roles y confianza */}
        <section className="border-t border-line px-5 py-20">
          <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-2">
            <div>
              <h2 className="mb-6 text-2xl font-semibold tracking-[-0.02em]">Cada quien ve lo suyo</h2>
              <dl className="divide-y divide-line border-y border-line">
                {ROLES.map(([r, d]) => (
                  <div key={r} className="flex gap-4 py-3.5">
                    <dt className="w-32 shrink-0 font-medium">{r}</dt>
                    <dd className="text-sm text-ink-muted">{d}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h2 className="mb-6 text-2xl font-semibold tracking-[-0.02em]">Cédulas, salud y plata, en serio</h2>
              <ul className="space-y-5">
                {TRUST.map(({ icon: Icon, t, d }) => (
                  <li key={t} className="flex gap-3">
                    <Icon className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium">{t}</p>
                      <p className="text-sm text-ink-muted">{d}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link href="/tratamiento-datos" className="mt-6 inline-block text-sm font-medium text-primary-ink hover:underline">
                Política de tratamiento de datos
              </Link>
            </div>
          </div>
        </section>

        {/* Precios en COP */}
        <section id="precios" className="scroll-mt-16 border-t border-line bg-panel px-5 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 max-w-2xl space-y-3">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">Precios por sede, en pesos</h2>
              <p className="text-ink-muted">Todos los planes incluyen 30 días de prueba, sin tarjeta. Sin permanencia.</p>
            </div>
            <div className="grid items-start gap-5 md:grid-cols-3">
              {PRICING.map((plan) => (
                <div
                  key={plan.name}
                  className={
                    plan.highlight
                      ? "space-y-6 rounded-[var(--radius-xl)] border-2 border-[var(--brand)] bg-surface p-6"
                      : "space-y-6 rounded-[var(--radius-xl)] border border-line bg-surface p-6"
                  }
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      {plan.highlight && <span className="rounded-[var(--radius-sm)] bg-primary px-2 py-0.5 text-xs font-medium text-primary-contrast">Recomendado</span>}
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">{plan.tagline}</p>
                    <p className="num mt-5 text-4xl font-semibold tracking-[-0.03em]">{plan.price}</p>
                    <p className="mt-1 text-sm text-ink-subtle">COP al mes por sede</p>
                  </div>
                  <ul className="space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f.text} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary-ink" />
                        <span className="text-ink-muted">
                          {f.text}
                          {f.soon && <span className="ml-1.5 inline-block rounded-[var(--radius-sm)] border border-[var(--signal-warn-line)] bg-[var(--signal-warn-bg)] px-1.5 align-middle text-xs text-[var(--signal-warn)]">Próximamente</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/register" className={plan.highlight ? `${CTA_PRIMARY} w-full` : `${CTA_SECONDARY} w-full`}>
                    Probar 30 días gratis
                  </Link>
                </div>
              ))}
            </div>
            <p className="mt-6 max-w-2xl text-sm text-ink-subtle">
              Lo marcado como &quot;Próximamente&quot; ya está construido y llega cuando la app esté publicada en las tiendas: si contratas hoy aseguras el precio y lo recibes sin costo adicional.
            </p>
          </div>
        </section>

        <section id="preguntas" className="scroll-mt-16 border-t border-line px-5 py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-8 text-3xl font-semibold tracking-[-0.02em]">Preguntas frecuentes</h2>
            <div className="border-t border-line">
              {FAQS.map((f) => (
                <details key={f.q} className="group border-b border-line">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span aria-hidden="true" className="text-ink-subtle transition-transform duration-200 group-open:rotate-45">+</span>
                  </summary>
                  <p className="pb-5 text-sm leading-relaxed text-ink-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line bg-panel px-5 py-20">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] [text-wrap:balance]">Mañana a las 5:30 puede estar funcionando.</h2>
              <p className="text-ink-muted">Registras el gimnasio, importas tus socios y pones una tablet en la puerta.</p>
            </div>
            <Link href="/register" className={CTA_PRIMARY}>
              Registra tu gimnasio <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-ink-muted sm:flex-row">
          <div className="flex items-center gap-2">
            <BrandMark className="h-6 w-6" />
            <span>© {new Date().getFullYear()} LSMFit</span>
          </div>
          <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link href="/privacidad" className="hover:text-ink">Privacidad</Link>
            <Link href="/terminos" className="hover:text-ink">Términos</Link>
            <Link href="/tratamiento-datos" className="hover:text-ink">Tratamiento de datos</Link>
            <Link href="/login" className="hover:text-ink">Ingresar</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
