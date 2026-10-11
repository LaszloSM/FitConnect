import type { Metadata } from "next";
import { LegalDoc, LegalLink, Mail, type LegalSection } from "@/components/legal/LegalDoc";
import { legalHolder } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de privacidad · LSMFit",
  description: "Resumen claro de qué datos usa LSMFit, para qué y cuáles son tus derechos.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "resumen",
    title: "En pocas palabras",
    body: (
      <ul>
        <li>Usamos los datos para prestar el servicio, no para venderlos ni para publicidad de terceros.</li>
        <li>Los datos de los socios son del gimnasio: nosotros los tratamos por su cuenta y siguiendo sus instrucciones.</li>
        <li>Lo que registras para ti en la app (entrenos, medidas, comidas) no lo ve tu gimnasio.</li>
        <li>Puedes pedir en cualquier momento ver, corregir o borrar tus datos.</li>
      </ul>
    ),
  },
  {
    id: "quien",
    title: "Quién trata tus datos",
    body: (
      <p>
        {legalHolder()}, que opera LSMFit. El detalle de los papeles de responsable y encargado, los datos que tratamos y
        los plazos de respuesta está en la <LegalLink href="/tratamiento-datos">política de tratamiento de datos</LegalLink>,
        que es el documento completo. Esta página es su resumen.
      </p>
    ),
  },
  {
    id: "que",
    title: "Qué datos y para qué",
    body: (
      <ul>
        <li><strong>Cuenta del gimnasio y su equipo:</strong> para darles acceso, proteger la cuenta y facturar la suscripción.</li>
        <li><strong>Socios:</strong> para que el gimnasio controle la entrada, cobre, organice clases y se comunique con ellos.</li>
        <li><strong>App:</strong> para mostrarte tu membresía, tus clases y tu progreso, y guardar lo que registras.</li>
        <li><strong>Datos técnicos:</strong> para mantener el servicio seguro y resolver fallas.</li>
      </ul>
    ),
  },
  {
    id: "cookies",
    title: "Cookies y almacenamiento en el equipo",
    body: (
      <>
        <p>
          LSMFit usa solo lo necesario para funcionar: una cookie de sesión para saber que entraste y preferencias del
          equipo como el tema claro u oscuro. No usamos cookies de publicidad ni de seguimiento de terceros.
        </p>
        <p>
          El computador de recepción guarda una copia cifrada con lo mínimo para seguir trabajando si se cae el internet.
          Esa copia se actualiza sola y se borra al cerrar sesión.
        </p>
      </>
    ),
  },
  {
    id: "compartir",
    title: "Con quién compartimos datos",
    body: (
      <p>
        Solo con los proveedores que hacen posible el servicio (servidores y correo en Amazon Web Services, y, si el
        gimnasio los activa, Wompi para pagos y WhatsApp para mensajes) y, con autorización aparte, Google para los planes
        de la app, al que no se envía nombre, correo ni documento. Algunos de estos servidores están en Estados Unidos.
      </p>
    ),
  },
  {
    id: "seguridad",
    title: "Seguridad",
    body: (
      <p>
        Cada gimnasio tiene su propia base de datos, los archivos privados se sirven con enlaces que vencen, los permisos
        dependen del rol y las acciones sensibles quedan registradas. Ninguna medida es infalible; si ocurre un incidente
        que afecte tus datos, te avisaremos y lo informaremos a la autoridad como exige la ley.
      </p>
    ),
  },
  {
    id: "derechos",
    title: "Tus derechos",
    body: (
      <p>
        Puedes conocer, actualizar, corregir y pedir que se borren tus datos, y revocar las autorizaciones que diste. Si
        eres socio de un gimnasio, pídeselo primero a tu gimnasio; para lo demás escríbenos a <Mail />. Respondemos las
        consultas en máximo 10 días hábiles y los reclamos en máximo 15. También puedes acudir a la Superintendencia de
        Industria y Comercio.
      </p>
    ),
  },
];

export default function PrivacidadPage() {
  return (
    <LegalDoc
      title="Política de privacidad"
      intro={<p>Cómo usamos los datos personales en LSMFit, dicho en corto. Para el detalle completo, la política de tratamiento de datos manda.</p>}
      sections={SECTIONS}
    />
  );
}
