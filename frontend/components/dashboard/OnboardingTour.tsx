"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { apiClient } from "@/lib/api";

export const TOUR_START_EVENT = "fitconnect:start-tour";

/** Tour de bienvenida con spotlight sobre el panel real. Se dispara solo la
 * primera vez (tour_completed en /onboarding/status) y se puede retomar desde
 * el checklist con el evento TOUR_START_EVENT. */
export function OnboardingTour() {
  const { data: session } = useSession();
  const driverRef = useRef<Driver | null>(null);

  useEffect(() => {
    if (!session?.accessToken) return;
    const token = session.accessToken as string;

    const markCompleted = () => {
      apiClient(token).post("/api/v1/onboarding/tour-complete").catch(() => {});
    };

    const buildDriver = () =>
      driver({
        showProgress: true,
        progressText: "{{current}} de {{total}}",
        nextBtnText: "Siguiente",
        prevBtnText: "Atrás",
        doneBtnText: "Empezar",
        overlayOpacity: 0.5,
        stagePadding: 6,
        onDestroyed: markCompleted,
        steps: [
          {
            popover: {
              title: "Tu gimnasio ya está en FitConnect",
              description:
                "En un minuto te mostramos dónde está cada cosa. Puedes salir del recorrido cuando quieras con Esc y retomarlo desde la lista de primeros pasos.",
            },
          },
          {
            element: '[data-tour="checklist"]',
            popover: {
              title: "Pon tu gym en marcha",
              description:
                "Tus dos primeros pasos viven aquí: crear tu primer plan de membresía y registrar tu primer socio. Cada paso te lleva a la pantalla correcta.",
              side: "bottom",
            },
          },
          {
            element: 'nav a[href="/plans"]',
            popover: {
              title: "1. Crea tus planes",
              description:
                "Define tus membresías: nombre, precio y duración (ej. Mensualidad $80.000 / 30 días). Sin un plan no puedes registrar socios.",
              side: "right",
            },
          },
          {
            element: 'nav a[href="/members"]',
            popover: {
              title: "2. Registra a tus socios",
              description:
                "Un asistente de 3 pasos te guía: datos personales, cuestionario de salud (PAR-Q) y membresía. La membresía inicia el día del registro.",
              side: "right",
            },
          },
          {
            element: '[data-tour="live-now"]',
            popover: {
              title: "Hoy en el gym — en vivo",
              description:
                "Cada entrada por el quiosco aparece aquí al instante, junto con los ingresos de hoy, vencimientos y cumpleaños. Las acciones rápidas están a un clic.",
              side: "bottom",
            },
          },
          {
            element: 'nav a[href="/checkins"]',
            popover: {
              title: "Check-ins en vivo",
              description:
                "El feed de asistencia del día. Si alguien llega con la membresía vencida, salta una alerta y puedes autorizar su entrada. Incluye Modo TV para un monitor en recepción.",
              side: "right",
            },
          },
          {
            element: 'nav a[href="/settings"]',
            popover: {
              title: "Tu quiosco de entrada",
              description:
                "En Configuración → Kiosko creas el enlace para la tablet de la entrada: el socio digita su cédula y pasa solo. Ahí también subes tu logo y ajustas la operación.",
              side: "right",
            },
          },
        ],
      });

    const start = () => {
      driverRef.current?.destroy();
      driverRef.current = buildDriver();
      driverRef.current.drive();
    };

    // Primera visita: arrancar solo cuando el dashboard ya pintó
    apiClient(token)
      .get("/api/v1/onboarding/status")
      .then((res) => {
        if (!res.data?.tour_completed) {
          setTimeout(start, 900);
        }
      })
      .catch(() => {});

    window.addEventListener(TOUR_START_EVENT, start);
    return () => {
      window.removeEventListener(TOUR_START_EVENT, start);
      driverRef.current?.destroy();
    };
  }, [session?.accessToken]);

  return null;
}
