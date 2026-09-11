"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/common/PageHeader";
import { GlassCard } from "@/components/common/GlassCard";
import {
  ChevronDown,
  DoorOpen,
  Wallet,
  Users,
  CalendarDays,
  MessageCircle,
  CreditCard,
  LifeBuoy,
} from "lucide-react";

interface Guide {
  icon: React.ElementType;
  title: string;
  steps: string[];
}

const GUIDES: Guide[] = [
  {
    icon: DoorOpen,
    title: "Control de entrada (kiosko)",
    steps: [
      "En Configuración › Kiosko, crea un dispositivo y abre su enlace en la tablet de la entrada.",
      "El miembro digita su cédula; si está al día, pasa solo.",
      "Los accesos denegados saltan en vivo en la pantalla de Check-ins, donde puedes autorizar manualmente.",
    ],
  },
  {
    icon: Wallet,
    title: "Caja y cobros",
    steps: [
      "Abre tu turno de caja antes de recibir efectivo (Pagos › Caja).",
      "Registra cobros de membresía o ventas de productos; el efectivo exige turno abierto.",
      "Las transferencias quedan pendientes hasta que las confirmes. Al cerrar el turno, cuadra y exporta el reporte.",
    ],
  },
  {
    icon: Users,
    title: "Miembros y membresías",
    steps: [
      "Crea miembros uno a uno o impórtalos en masa con la plantilla de Excel (botón Importar).",
      "Asigna un plan para generar la membresía; las renovaciones se encadenan desde el fin de la vigente.",
      "Congelar una membresía corre su fecha de fin automáticamente.",
    ],
  },
  {
    icon: CalendarDays,
    title: "Clases",
    steps: [
      "Define tus clases y horarios en la agenda semanal.",
      "Controla cupos y ocupación; inscribe o da de baja socios desde la clase.",
      "Las reservas devuelven el crédito al cancelar.",
    ],
  },
  {
    icon: MessageCircle,
    title: "Mensajes de WhatsApp",
    steps: [
      "En Configuración › Mensajes redactas tus propios textos por ocasión (vencimiento, pago, cumpleaños).",
      "Las automatizaciones usan tu mensaje tal cual.",
      "El envío real requiere conectar el WhatsApp Business de tu gimnasio.",
    ],
  },
  {
    icon: CreditCard,
    title: "Pagos en línea (Wompi)",
    steps: [
      "Carga tus llaves de Wompi en Configuración › Integraciones (se guardan cifradas).",
      "Genera un link de pago desde el POS o desde Cuentas por Cobrar.",
      "El pago se confirma solo por webhook y concilia la membresía.",
    ],
  },
];

const FAQS = [
  {
    q: "¿Qué pasa si se cae el internet?",
    a: "El kiosko y los cobros requieren conexión. Si se cae, registra los pagos en efectivo y captúralos cuando vuelva la conexión; la caja seguirá cuadrando por turno.",
  },
  {
    q: "¿Cómo agrego a mi personal?",
    a: "En Configuración › Equipo (solo el dueño) invitas por correo; se genera un enlace de un solo uso que la persona abre para fijar su contraseña. Puedes cambiar su rol o quitarle el acceso cuando quieras.",
  },
  {
    q: "¿Puedo migrar mis miembros desde Excel?",
    a: "Sí. En Miembros usa Importar: descarga la plantilla, llénala y súbela. Cada fila se valida y te mostramos cuáles se crearon y cuáles tuvieron errores.",
  },
  {
    q: "¿Quién puede ver los reportes y la caja?",
    a: "Los reportes financieros y la caja están limitados a dueño y administrador. El recepcionista opera check-in y cobros del día.",
  },
  {
    q: "¿Mis datos están seguros?",
    a: "Cada gimnasio vive en su propia base de datos aislada, los secretos de integraciones se guardan cifrados y registramos auditoría de las acciones sensibles.",
  },
];

function Accordion({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[var(--border-base)] last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 py-4 text-left"
      >
        <span className="text-sm font-medium text-[var(--text-base)]">{q}</span>
        <ChevronDown
          className={`h-4 w-4 text-[var(--text-muted)] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="pb-4 text-sm text-[var(--text-muted)] leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AyudaPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <PageHeader
        title="Centro de ayuda"
        subtitle="Guías rápidas y respuestas para operar tu gimnasio"
        icon={<LifeBuoy className="h-5 w-5" />}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {GUIDES.map((g) => {
          const Icon = g.icon;
          return (
            <GlassCard key={g.title} className="p-5 space-y-3">
              <h3 className="text-base font-semibold text-[var(--text-base)] flex items-center gap-2">
                <Icon className="h-4 w-4 text-[var(--color-primary-ink)]" />
                {g.title}
              </h3>
              <ol className="space-y-2">
                {g.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-[var(--text-muted)]">
                    <span className="shrink-0 h-5 w-5 rounded-full bg-[var(--color-primary-muted)] text-[var(--color-primary-ink)] text-xs font-semibold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
            </GlassCard>
          );
        })}
      </div>

      <GlassCard className="p-5">
        <h3 className="text-base font-semibold text-[var(--text-base)] mb-1">Preguntas frecuentes</h3>
        <div>
          {FAQS.map((f) => (
            <Accordion key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-base)]">¿Necesitas más ayuda?</h3>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Escríbenos y te respondemos lo antes posible.
          </p>
        </div>
        <a
          href="mailto:soporte@fitconnect.co"
          className="rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-contrast)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          soporte@fitconnect.co
        </a>
      </GlassCard>
    </motion.div>
  );
}
