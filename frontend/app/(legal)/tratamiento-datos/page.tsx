import type { Metadata } from "next";
import { LegalDoc, LegalLink, Mail, type LegalSection } from "@/components/legal/LegalDoc";
import { LEGAL, LEGAL_PLACE, legalHolder } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de tratamiento de datos personales · LSMFit",
  description: "Cómo trata LSMFit los datos personales de gimnasios, su personal, sus socios y quienes usan la app.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "responsable",
    title: "Quién es el responsable",
    body: (
      <>
        <p>
          {legalHolder()}, con domicilio en {LEGAL_PLACE} y correo <Mail />, es quien opera la plataforma LSMFit
          (en adelante, «LSMFit»).
        </p>
        <p>En LSMFit conviven datos de personas distintas, y el papel de LSMFit cambia según de quién sean:</p>
        <ul>
          <li>
            <strong>Datos de los gimnasios clientes y de su personal</strong> (dueños, administradores, recepción,
            entrenadores): LSMFit es el <strong>responsable</strong> del tratamiento.
          </li>
          <li>
            <strong>Datos de los socios que cada gimnasio registra</strong>: el gimnasio es el{" "}
            <strong>responsable</strong> y LSMFit es su <strong>encargado</strong>. LSMFit trata esos datos solo para
            prestarle el servicio al gimnasio y siguiendo sus instrucciones; no los usa para fines propios ni los
            vende.
          </li>
          <li>
            <strong>Datos que una persona registra para sí misma en la app</strong> (medidas, entrenos, comidas): LSMFit
            es el <strong>responsable</strong>. El gimnasio no tiene acceso a ellos.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "datos",
    title: "Qué datos tratamos",
    body: (
      <>
        <ul>
          <li>
            <strong>Del gimnasio y su personal:</strong> nombre del negocio, NIT, ciudad, datos de contacto, nombre y
            correo de cada persona del equipo, su rol, su contraseña (guardada de forma irreversible) y los métodos de
            verificación en dos pasos que active.
          </li>
          <li>
            <strong>De los socios:</strong> nombre, tipo y número de documento, fecha de nacimiento, teléfono, correo,
            dirección, contacto de emergencia, foto, membresías, pagos, recibos, asistencia, clases y rutinas
            asignadas.
          </li>
          <li>
            <strong>Datos sensibles de los socios:</strong> las respuestas del cuestionario de salud antes de entrenar
            (PAR-Q) y, si el gimnasio usa un lector biométrico, la referencia a su huella o rostro (ver{" "}
            <a href="#sensibles" className="font-medium text-primary-ink underline underline-offset-2">
              datos sensibles
            </a>
            ).
          </li>
          <li>
            <strong>De quien usa la app:</strong> correo, nombre, y lo que decida registrar: peso, talla, medidas,
            entrenos, comidas y preferencias.
          </li>
          <li>
            <strong>Técnicos:</strong> dirección IP, tipo de navegador o dispositivo, fecha y hora de acceso, y el
            registro de auditoría de las acciones sensibles del personal.
          </li>
        </ul>
        <p>No recolectamos números de tarjeta: los pagos con tarjeta los procesa directamente la pasarela de pagos.</p>
      </>
    ),
  },
  {
    id: "finalidades",
    title: "Para qué los usamos",
    body: (
      <ul>
        <li>Prestar el servicio: control de entrada, membresías, cobros, caja, clases, reportes y la app de socios.</li>
        <li>Crear y proteger las cuentas: inicio de sesión, verificación en dos pasos, recuperación de contraseña y avisos de seguridad.</li>
        <li>Enviar los correos que el servicio necesita: invitaciones al equipo, enlaces para completar la ficha, códigos de acceso y avisos de la cuenta.</li>
        <li>Enviar a los socios los mensajes que su gimnasio configure (por ejemplo, recordatorios de vencimiento).</li>
        <li>Calcular, con los datos de cada gimnasio y solo para ese gimnasio, indicadores como la asistencia esperada o el riesgo de que un socio no renueve.</li>
        <li>Facturar la suscripción del gimnasio, cumplir obligaciones legales y contables, y atender requerimientos de autoridades.</li>
        <li>Prevenir fraudes y accesos indebidos, y dar soporte cuando el gimnasio lo pida.</li>
      </ul>
    ),
  },
  {
    id: "sensibles",
    title: "Datos sensibles: salud y biometría",
    body: (
      <>
        <p>
          La ley considera sensibles los datos de salud y los biométricos. Nadie está obligado a entregarlos ni a
          autorizar su tratamiento, y negarse no impide ser socio del gimnasio.
        </p>
        <p>
          <strong>Cuestionario de salud (PAR-Q).</strong> Sirve para que el gimnasio sepa si una persona debe consultar a
          un médico antes de entrenar. Solo se registra con autorización previa, expresa e informada del socio.
        </p>
        <p id="biometricos">
          <strong>Huella y rostro.</strong> Su uso es opcional: el socio siempre puede entrar con su número de
          documento. Solo se registra una huella o un rostro con autorización expresa del socio, que el gimnasio deja
          anotada con fecha, versión del texto aceptado y la persona del equipo que la tomó.
        </p>
        <ul>
          <li>La plantilla biométrica se guarda solo en el equipo lector del gimnasio. LSMFit guarda únicamente el número interno que ese equipo le asigna al socio y el registro de la autorización.</li>
          <li>La única finalidad es verificar la identidad del socio para controlar su ingreso.</li>
          <li>El socio puede retirar la autorización en recepción en cualquier momento. Al hacerlo se borra el vínculo en LSMFit y el gimnasio debe borrarlo del equipo.</li>
          <li>Estos datos no se comparten con terceros ni se usan para perfilar a nadie.</li>
        </ul>
      </>
    ),
  },
  {
    id: "menores",
    title: "Niños, niñas y adolescentes",
    body: (
      <p>
        Los datos de menores de 18 años solo se tratan respetando su interés superior y sus derechos fundamentales. El
        gimnasio debe contar con la autorización de su representante legal antes de registrarlos, y el menor debe ser
        escuchado según su madurez. La app es para personas de 14 años en adelante; los menores de edad la usan con
        autorización de su representante.
      </p>
    ),
  },
  {
    id: "autorizacion",
    title: "Autorización",
    body: (
      <>
        <p>
          Pedimos la autorización a más tardar en el momento de recolectar los datos, y la guardamos para poder
          demostrarla. Puede darse por escrito, en un formulario digital (por ejemplo, la casilla al registrarse en la
          app o al completar la ficha) o mediante conductas que permitan concluir razonablemente que se otorgó.
        </p>
        <p>
          Para los datos de sus socios, el gimnasio es quien obtiene la autorización. LSMFit le da las herramientas para
          pedirla y dejarla registrada, pero no registra autorizaciones que nadie haya dado: por ejemplo, los socios
          importados desde otro sistema quedan sin autorización hasta que la den en LSMFit.
        </p>
      </>
    ),
  },
  {
    id: "terceros",
    title: "Con quién compartimos datos",
    body: (
      <>
        <p>Usamos proveedores que tratan datos por cuenta nuestra, solo para lo que se indica:</p>
        <ul>
          <li><strong>Amazon Web Services</strong>: servidores, almacenamiento de archivos y envío de correos.</li>
          <li><strong>Wompi (Bancolombia)</strong>: cobros en línea, solo si el gimnasio los activa.</li>
          <li><strong>Meta (WhatsApp)</strong>: mensajes a los socios, solo si el gimnasio conecta su cuenta.</li>
          <li>
            <strong>Google (Gemini)</strong>: generar planes de entreno y de comidas en la app, solo si la persona lo
            autoriza aparte. Se envían datos sin nombre, correo, documento ni gimnasio: rango de edad, sexo, objetivo,
            peso y talla aproximados.
          </li>
        </ul>
        <p>
          No vendemos ni alquilamos datos personales. Solo los entregamos a una autoridad cuando una norma o una orden
          judicial lo exige.
        </p>
      </>
    ),
  },
  {
    id: "transferencia",
    title: "Datos fuera de Colombia",
    body: (
      <p>
        Los servidores de Amazon Web Services y de Google están en Estados Unidos, país que la Superintendencia de
        Industria y Comercio reconoce con un nivel adecuado de protección de datos. La transmisión de datos a estos
        proveedores se hace bajo sus condiciones contractuales de protección de datos y solo para las finalidades de esta
        política.
      </p>
    ),
  },
  {
    id: "seguridad",
    title: "Cómo los protegemos",
    body: (
      <ul>
        <li>Cada gimnasio tiene su propia base de datos: sus datos no comparten tabla con los de otro.</li>
        <li>Las fotos, comprobantes y documentos se sirven con enlaces que vencen en minutos.</li>
        <li>Las llaves de pagos y de WhatsApp se guardan cifradas.</li>
        <li>Cada persona del equipo ve solo lo que su rol permite, y las acciones sensibles quedan en la auditoría con su nombre.</li>
        <li>Verificación en dos pasos disponible para todas las cuentas del personal.</li>
        <li>
          La copia que el computador de recepción guarda para trabajar sin internet se guarda cifrada en ese equipo y
          contiene solo lo necesario para registrar entradas y cobros.
        </li>
        <li>Copias de seguridad periódicas.</li>
      </ul>
    ),
  },
  {
    id: "conservacion",
    title: "Cuánto tiempo los guardamos",
    body: (
      <>
        <p>
          Mientras el gimnasio tenga su cuenta activa y mientras sigan siendo necesarios para la finalidad con la que se
          recolectaron. Los soportes contables, como recibos y pagos, se conservan por el tiempo que exige la ley.
        </p>
        <p>
          Cuando un gimnasio termina el servicio puede exportar sus datos. Después se eliminan o se anonimizan, salvo lo
          que la ley obligue a conservar. Quien borra su cuenta de la app desde Perfil elimina en ese momento su cuenta,
          sus entrenos, sus medidas y sus autorizaciones.
        </p>
      </>
    ),
  },
  {
    id: "derechos",
    title: "Tus derechos",
    body: (
      <>
        <p>Como titular de tus datos puedes:</p>
        <ol>
          <li>Conocer, actualizar y rectificar tus datos.</li>
          <li>Pedir prueba de la autorización que diste.</li>
          <li>Saber para qué se han usado tus datos.</li>
          <li>Revocar la autorización o pedir que se borren tus datos, cuando no exista un deber legal o contractual de conservarlos.</li>
          <li>Acceder gratis a tus datos.</li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio, después de haber agotado el trámite ante nosotros o ante tu gimnasio.</li>
        </ol>
      </>
    ),
  },
  {
    id: "procedimiento",
    title: "Cómo ejercerlos",
    body: (
      <>
        <p>
          <strong>Si eres socio de un gimnasio</strong>, tu solicitud sobre tu ficha va primero a tu gimnasio, que es el
          responsable. Si nos escribes a nosotros, se la hacemos llegar y te avisamos.
        </p>
        <p>
          <strong>Para todo lo demás</strong>, escríbenos a <Mail /> indicando tu nombre, tu documento, lo que pides y un
          medio para responderte. Si actúas en nombre de otra persona, adjunta el documento que lo acredite.
        </p>
        <ul>
          <li>
            <strong>Consultas</strong> (conocer qué datos tenemos): respondemos en máximo 10 días hábiles. Si no alcanza
            el tiempo, te avisamos y respondemos en los 5 días hábiles siguientes.
          </li>
          <li>
            <strong>Reclamos</strong> (corregir, actualizar, borrar o revocar): respondemos en máximo 15 días hábiles. Si
            no alcanza el tiempo, te avisamos y respondemos en los 8 días hábiles siguientes. Si el reclamo está
            incompleto te pedimos lo que falta dentro de los 5 días hábiles siguientes a recibirlo.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "vigencia",
    title: "Vigencia y cambios",
    body: (
      <p>
        Esta política rige desde el {LEGAL.updatedAt}. Si la cambiamos de forma que afecte el uso de tus datos, lo
        avisaremos antes en la plataforma o por correo. Se expide en cumplimiento de la Ley 1581 de 2012 y del Decreto
        1377 de 2013 (compilado en el Decreto 1074 de 2015). Ver también la <LegalLink href="/privacidad">política de
        privacidad</LegalLink> y los <LegalLink href="/terminos">términos del servicio</LegalLink>.
      </p>
    ),
  },
];

export default function TratamientoDatosPage() {
  return (
    <LegalDoc
      title="Política de tratamiento de datos personales"
      intro={
        <p>
          Esta política explica qué datos personales trata LSMFit, para qué, con quién los comparte y cómo puedes
          conocerlos, corregirlos o pedir que se borren. Está escrita para que la entienda cualquier persona: si algo no
          queda claro, escríbenos a <Mail />.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
