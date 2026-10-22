import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // El panel ya pide sesión; esto evita que se rastreen pantallas de
      // dispositivos y enlaces personales (completar ficha, reportar daño).
      disallow: [
        "/api/",
        "/kiosk",
        "/screen",
        "/completar/",
        "/reportar/",
        "/aceptar-invitacion",
        "/recuperar",
        "/restablecer",
        "/seguridad",
        "/diseno",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
