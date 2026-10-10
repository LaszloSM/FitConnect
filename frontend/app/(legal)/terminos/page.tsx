import type { Metadata } from "next";
import { LegalDoc, LegalLink, Mail, type LegalSection } from "@/components/legal/LegalDoc";
import { LEGAL, LEGAL_PLACE, legalHolder } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Términos del servicio · LSMFit",
  description: "Condiciones para usar LSMFit, el software de gestión para gimnasios.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "partes",
    title: "Quiénes somos y a quién aplican",
    body: (
      <>
        <p>
          LSMFit es un servicio de {legalHolder(false)}, con domicilio en {LEGAL_PLACE} («LSMFit», «nosotros»).
        </p>
        <p>
          Estos términos aplican al gimnasio que crea una cuenta («el gimnasio», «tú») y a las personas de su equipo que
          usan la plataforma. Al registrarte o usar el servicio aceptas estos términos. Si los aceptas en nombre de una
          empresa, declaras que puedes obligarla. La app para socios tiene sus propias{" "}
          <LegalLink href="/app">condiciones</LegalLink>.
        </p>
      </>
    ),
  },
  {
    id: "servicio",
    title: "El servicio",
    body: (
      <>
        <p>
          LSMFit es un software en línea para administrar un gimnasio: socios y membresías, control de entrada, cobros,
          caja, inventario, clases, máquinas, reportes, mensajes y, según el plan, la app para socios. Lo prestamos como
          servicio: no se instala ni se vende una licencia permanente.
        </p>
        <p>
          El servicio mejora con el tiempo. Podemos agregar, cambiar o retirar funciones; si retiramos algo importante
          de tu plan te avisaremos con anticipación razonable. Las funciones marcadas como «Próximamente» no están
          incluidas hasta que se lancen.
        </p>
      </>
    ),
  },
  {
    id: "cuenta",
    title: "Tu cuenta y tu equipo",
    body: (
      <ul>
        <li>Los datos con los que registras el gimnasio deben ser reales y estar actualizados.</li>
        <li>Tú decides quién de tu equipo entra y con qué rol. Eres responsable de lo que hagan con sus cuentas.</li>
        <li>Cada persona debe tener su propio acceso; no compartas contraseñas. Te recomendamos activar la verificación en dos pasos.</li>
        <li>Si sospechas que alguien entró sin permiso, cambia la contraseña, cierra las sesiones abiertas desde Ajustes › Seguridad y escríbenos.</li>
      </ul>
    ),
  },
  {
    id: "planes",
    title: "Prueba, planes y pagos",
    body: (
      <>
        <ul>
          <li>Cada gimnasio nuevo tiene una prueba gratis de 30 días, sin tarjeta.</li>
          <li>Después, la suscripción se paga mes a mes por sede, según el plan elegido y los precios publicados en pesos colombianos.</li>
          <li>Si cambiamos los precios, te avisaremos al menos 30 días antes. El cambio aplica desde el siguiente periodo.</li>
          <li>Puedes pedirnos subir o bajar de plan cuando quieras; el cambio aplica desde el siguiente periodo.</li>
        </ul>
        <p>
          <strong>Si un pago no llega</strong>, tienes 7 días para ponerte al día con todo funcionando. Pasado ese
          plazo la cuenta queda en modo consulta: puedes ver y descargar tu información, pero no registrar cambios.{" "}
          <strong>Tus socios siempre pueden seguir entrando</strong> al gimnasio aunque la cuenta esté en ese modo.
        </p>
      </>
    ),
  },
  {
    id: "uso",
    title: "Uso permitido",
    body: (
      <>
        <p>No puedes usar LSMFit para:</p>
        <ul>
          <li>Actividades ilegales o para tratar datos de personas sin su autorización.</li>
          <li>Enviar mensajes masivos no solicitados.</li>
          <li>Intentar entrar a cuentas o datos de otros gimnasios, saltarte los permisos o afectar el funcionamiento del servicio.</li>
          <li>Copiar, revender o descompilar el software.</li>
        </ul>
        <p>Si detectamos un uso así podemos suspender la cuenta, avisándote y explicándote el motivo.</p>
      </>
    ),
  },
  {
    id: "datos",
    title: "Los datos de tu gimnasio",
    body: (
      <>
        <p>
          <strong>Los datos de tu gimnasio son tuyos.</strong> Sobre los datos de tus socios, tú eres el responsable del
          tratamiento y LSMFit es tu encargado: los tratamos solo para prestarte el servicio, como explica la{" "}
          <LegalLink href="/tratamiento-datos">política de tratamiento de datos</LegalLink>.
        </p>
        <p>Como responsable, te corresponde:</p>
        <ul>
          <li>Pedir a tus socios la autorización para tratar sus datos, en especial los de salud y biométricos.</li>
          <li>Atender las solicitudes de tus socios sobre sus datos (consultar, corregir, borrar).</li>
          <li>Registrar solo los datos que necesitas para operar.</li>
        </ul>
        <p>
          Puedes descargar tus reportes en Excel y PDF cuando quieras, y pedirnos una copia completa de tus datos, también
          cuando decidas irte.
        </p>
      </>
    ),
  },
  {
    id: "terceros",
    title: "Servicios de terceros",
    body: (
      <p>
        Algunas funciones dependen de servicios de terceros que activas tú: pagos en línea con Wompi, mensajes por WhatsApp
        y torniquetes o lectores de otras marcas. Esos servicios tienen sus propias condiciones y cobros. LSMFit no
        guarda datos de tarjetas y no responde por fallas de esos servicios, aunque te ayudaremos a resolverlas.
      </p>
    ),
  },
  {
    id: "disponibilidad",
    title: "Disponibilidad y soporte",
    body: (
      <>
        <p>
          Trabajamos para que LSMFit esté disponible siempre, pero puede haber interrupciones por mantenimiento,
          actualizaciones o causas ajenas a nosotros. Cuando podamos, avisaremos los mantenimientos con anticipación.
        </p>
        <p>
          Si se cae el internet del gimnasio, la recepción puede seguir registrando entradas y cobros en efectivo en el
          computador preparado para eso, y todo se sube al volver la conexión. Sin energía eléctrica ningún equipo
          funciona: para eso recomendamos una UPS.
        </p>
        <p>El soporte se presta por correo en <Mail />.</p>
      </>
    ),
  },
  {
    id: "propiedad",
    title: "Propiedad intelectual",
    body: (
      <p>
        El software, la marca LSMFit, el logo y los textos de la plataforma son de LSMFit. Te damos permiso para usarlos
        mientras tengas la suscripción, solo para administrar tu gimnasio. Tu logo, tus datos y tus contenidos siguen
        siendo tuyos.
      </p>
    ),
  },
  {
    id: "responsabilidad",
    title: "Responsabilidad",
    body: (
      <>
        <p>
          Respondemos por los daños que causemos por no cumplir estos términos. En lo que la ley permita, no respondemos
          por lucro cesante ni por daños indirectos, y nuestra responsabilidad total se limita a lo que hayas pagado por
          el servicio en los 12 meses anteriores al hecho.
        </p>
        <p>
          Los indicadores y proyecciones de la plataforma son estimaciones para ayudarte a decidir, no garantías. Las
          recomendaciones de entreno y alimentación de la app son orientación general y no reemplazan a un profesional de
          la salud.
        </p>
        <p>Nada de esto limita los derechos que te da el Estatuto del Consumidor cuando te sea aplicable.</p>
      </>
    ),
  },
  {
    id: "terminacion",
    title: "Cancelación y terminación",
    body: (
      <ul>
        <li>No hay permanencia: puedes cancelar cuando quieras escribiéndonos, y no se te cobra el periodo siguiente.</li>
        <li>Antes de cancelar puedes descargar tus reportes y pedirnos la copia de tus datos.</li>
        <li>Podemos terminar el servicio por incumplimiento grave de estos términos, avisándote por correo.</li>
        <li>Al terminar, tus datos se eliminan o se anonimizan, salvo lo que la ley obligue a conservar.</li>
      </ul>
    ),
  },
  {
    id: "cambios",
    title: "Cambios a estos términos",
    body: (
      <p>
        Si cambiamos estos términos de forma importante, te avisaremos por correo o en la plataforma al menos 15 días
        antes de que apliquen. Si no estás de acuerdo, puedes cancelar antes de esa fecha.
      </p>
    ),
  },
  {
    id: "ley",
    title: "Ley aplicable",
    body: (
      <p>
        Estos términos se rigen por las leyes de Colombia. Antes de acudir a un juez intentaremos resolver cualquier
        diferencia hablando directamente; escríbenos a <Mail />.
      </p>
    ),
  },
];

export default function TerminosPage() {
  return (
    <LegalDoc
      title="Términos del servicio"
      intro={
        <p>
          Estos son los términos para usar LSMFit. Los escribimos en lenguaje claro: qué incluye el servicio, qué te
          corresponde a ti, qué nos corresponde a nosotros y cómo terminar la relación si lo decides. Rigen desde el{" "}
          {LEGAL.updatedAt}.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
