import type { Metadata } from "next";
import { LegalDoc, LegalLink, Mail, type LegalSection } from "@/components/legal/LegalDoc";
import { LEGAL, legalHolder } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Términos y privacidad de la app · LSMFit",
  description: "Condiciones de uso de la app LSMFit y cómo se tratan los datos de quien la usa.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "que-es",
    title: "Qué es la app",
    body: (
      <p>
        La app LSMFit es de {legalHolder(false)}. Sirve para llevar tus entrenos y tus comidas y, si tu gimnasio usa LSMFit y
        tiene la app incluida, para ver tu membresía, reservar clases y consultar tus pagos. Usarla es gratis para ti.
      </p>
    ),
  },
  {
    id: "responsables",
    title: "Dos tipos de datos, dos responsables",
    body: (
      <ul>
        <li>
          <strong>Lo que registras en la app para ti</strong> (medidas, entrenos, comidas, preferencias): el responsable es
          LSMFit. Se guarda aparte y ningún gimnasio lo consulta.
        </li>
        <li>
          <strong>Tu ficha en el gimnasio</strong> (documento, membresía, pagos, asistencia): el responsable es tu
          gimnasio. La app solo te la muestra y te deja completar lo que falta. Tu cuenta queda unida a tu ficha con el
          código que te da tu gimnasio.
        </li>
      </ul>
    ),
  },
  {
    id: "usos",
    title: "Para qué usamos tus datos",
    body: (
      <ul>
        <li>Darte acceso con un código que llega a tu correo, sin contraseñas.</li>
        <li>Mostrarte tu membresía, tus clases y tu progreso.</li>
        <li>Armar planes de entreno y de comidas si los pides.</li>
        <li>Enviarte avisos de tu gimnasio, solo si los autorizas.</li>
      </ul>
    ),
  },
  {
    id: "salud",
    title: "Datos de salud",
    body: (
      <>
        <p>
          Peso, talla y el cuestionario de salud son datos sensibles. Solo se guardan si lo autorizas por separado, y
          puedes retirar esa autorización cuando quieras: al retirarla se borran el peso y la talla. No estás obligado a
          entregarlos.
        </p>
        <p>
          La app no da diagnósticos ni reemplaza a un profesional de la salud. Si el cuestionario marca alguna respuesta
          de riesgo, consulta a un médico antes de entrenar.
        </p>
      </>
    ),
  },
  {
    id: "planes",
    title: "Planes con inteligencia artificial",
    body: (
      <p>
        Si pides un plan con inteligencia artificial y lo autorizas, enviamos a Google (Gemini) solo datos sin nombre,
        correo, documento ni gimnasio: rango de edad, sexo, objetivo, nivel de actividad, peso y talla aproximados. Google
        puede usar esa información para mejorar sus productos. Si no lo autorizas, la app arma el plan sin enviar nada
        fuera.
      </p>
    ),
  },
  {
    id: "edad",
    title: "Edad mínima",
    body: <p>La app es para personas de 14 años en adelante. Los menores de edad la usan con autorización de su representante legal.</p>,
  },
  {
    id: "derechos",
    title: "Tus derechos y cómo borrar tu cuenta",
    body: (
      <ul>
        <li>Conocer, actualizar y corregir tus datos.</li>
        <li>Retirar cualquier autorización desde Perfil.</li>
        <li>
          <strong>Borrar tu cuenta</strong> desde Perfil › Borrar mi cuenta. Se eliminan de inmediato tu cuenta, tus
          entrenos, tus medidas y tus autorizaciones. Tu ficha en el gimnasio no se borra con la cuenta: para eso
          escríbele a tu gimnasio, que es quien la administra.
        </li>
        <li>Presentar quejas ante la Superintendencia de Industria y Comercio.</li>
      </ul>
    ),
  },
  {
    id: "seguridad",
    title: "Seguridad",
    body: (
      <p>
        Tu sesión se guarda cifrada en el celular, cada dispositivo tiene su propia sesión y, si alguien copia tu sesión,
        la detectamos y las cerramos todas. Ninguna medida es infalible.
      </p>
    ),
  },
  {
    id: "contacto",
    title: "Contacto",
    body: (
      <p>
        Para ejercer tus derechos escríbenos a <Mail />. El detalle completo está en la{" "}
        <LegalLink href="/tratamiento-datos">política de tratamiento de datos</LegalLink>.
      </p>
    ),
  },
];

export default function AppLegalPage() {
  return (
    <LegalDoc
      title="Términos y privacidad de la app"
      version={LEGAL.appTermsVersion}
      intro={<p>Lo que necesitas saber antes de usar la app LSMFit: qué hace, quién ve tus datos y cómo controlarlos.</p>}
      sections={SECTIONS}
    />
  );
}
