import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y privacidad de la app: FitConnect",
  description: "Condiciones de uso de la app FitConnect y cómo se tratan los datos de quien la usa.",
};

export default function AppLegalPage() {
  return (
    <article className="space-y-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:font-display [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:text-[var(--text-muted)] [&_p]:leading-relaxed [&_li]:text-[var(--text-muted)] [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold font-display">Términos y privacidad de la app</h1>
        <p className="text-sm">Versión 2026-10 · Última actualización: 8 de octubre de 2026</p>
      </header>

      <p>
        La app FitConnect es de <strong>[RAZÓN SOCIAL]</strong> (NIT <strong>[NIT]</strong>). Sirve para
        llevar tus entrenos y, si tu gimnasio usa FitConnect, para ver tu membresía, entrar con un QR,
        reservar clases y pagar. Cumplimos la Ley 1581 de 2012 y el Decreto 1377 de 2013.
      </p>

      <h2>1. Dos tipos de datos, dos responsables</h2>
      <ul>
        <li>
          <strong>Lo que registras en la app para ti</strong> (medidas, entrenos, preferencias): el
          responsable es FitConnect. Se guarda en una base propia que ningún gimnasio consulta.
        </li>
        <li>
          <strong>Tu ficha en el gimnasio</strong> (documento, membresía, pagos, asistencia): el
          responsable es tu gimnasio. La app solo te la muestra y te deja completar lo que falta.
        </li>
      </ul>

      <h2>2. Para qué usamos tus datos</h2>
      <ul>
        <li>Darte acceso a tu cuenta con un código enviado a tu correo.</li>
        <li>Mostrarte tu progreso y tus entrenos.</li>
        <li>Generar tu QR de entrada, que cambia cada 30 segundos y no sirve si lo reenvías.</li>
        <li>Enviarte avisos de tu gimnasio, solo si los autorizas.</li>
      </ul>

      <h2>3. Datos de salud</h2>
      <p>
        Peso, talla y el cuestionario de salud son datos sensibles. Solo se guardan si lo autorizas por
        separado, y puedes retirar esa autorización cuando quieras: al retirarla se borran el peso y la
        talla. No estás obligado a entregarlos.
      </p>
      <p>
        La app no da diagnósticos ni reemplaza a un profesional de la salud. Si el cuestionario de salud
        marca alguna respuesta de riesgo, consulta a un médico antes de entrenar.
      </p>

      <h2>4. Edad</h2>
      <p>La app es para personas de 14 años en adelante. Los menores de edad la usan con autorización de su representante legal.</p>

      <h2>5. Tus derechos</h2>
      <ul>
        <li>Conocer, actualizar y rectificar tus datos.</li>
        <li>Retirar cualquier autorización desde Perfil.</li>
        <li>
          <strong>Borrar tu cuenta</strong> desde Perfil › Borrar mi cuenta. Se eliminan de inmediato tu
          cuenta, tus entrenos, tus medidas y tus autorizaciones. Tu ficha en el gimnasio no se borra con
          la cuenta: para eso escríbele a tu gimnasio, que es quien la administra.
        </li>
        <li>Presentar quejas ante la Superintendencia de Industria y Comercio.</li>
      </ul>

      <h2>6. Seguridad</h2>
      <p>
        Tu sesión se guarda cifrada en el celular, cada dispositivo tiene su propia sesión y, si alguien
        copia tu sesión, la detectamos y las cerramos todas. Ninguna medida es infalible.
      </p>

      <h2>7. Contacto</h2>
      <p>Para ejercer tus derechos escribe a <strong>[CORREO DE PRIVACIDAD]</strong>.</p>
    </article>
  );
}
