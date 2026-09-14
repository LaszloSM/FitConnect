import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad: FitConnect",
  description: "Cómo FitConnect recolecta, usa y protege los datos personales.",
};

export default function PrivacidadPage() {
  return (
    <article className="space-y-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:font-display [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:text-[var(--text-muted)] [&_p]:leading-relaxed [&_li]:text-[var(--text-muted)] [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold font-display">Política de Privacidad</h1>
        <p className="text-sm">Última actualización: 21 de junio de 2026</p>
      </header>

      <p>
        Esta Política describe cómo <strong>[RAZÓN SOCIAL]</strong> (NIT <strong>[NIT]</strong>),
        responsable de la plataforma FitConnect, trata los datos personales de los gimnasios
        clientes y de las personas cuyos datos estos registran en el sistema. Cumplimos la Ley
        1581 de 2012, el Decreto 1377 de 2013 y demás normas colombianas de protección de datos.
      </p>

      <h2>1. Qué datos recolectamos</h2>
      <ul>
        <li>Datos de la cuenta del gimnasio: nombre del negocio, NIT, ciudad, datos de contacto del personal.</li>
        <li>Datos de miembros que el gimnasio registra: nombre, documento de identidad, teléfono, correo, fecha de nacimiento, contacto de emergencia y respuestas del cuestionario PAR-Q (datos de salud).</li>
        <li>Datos operativos: asistencia (check-ins), membresías, pagos y recibos.</li>
        <li>Datos técnicos: registros de acceso, dirección IP y eventos de auditoría.</li>
      </ul>

      <h2>2. Para qué los usamos</h2>
      <ul>
        <li>Prestar el servicio de gestión del gimnasio (acceso, cobros, clases, reportes).</li>
        <li>Procesar pagos a través de pasarelas autorizadas (p. ej. Wompi).</li>
        <li>Enviar notificaciones operativas y recordatorios por los canales que el gimnasio configure (p. ej. WhatsApp).</li>
        <li>Garantizar la seguridad, prevenir el fraude y cumplir obligaciones legales.</li>
      </ul>

      <h2>3. Roles: responsable y encargado</h2>
      <p>
        Respecto de los datos de sus miembros, el <strong>gimnasio cliente es el Responsable</strong>
        del tratamiento y FitConnect actúa como <strong>Encargado</strong>, tratando los datos
        únicamente según las instrucciones del gimnasio y esta Política.
      </p>

      <h2>4. Datos sensibles (salud)</h2>
      <p>
        El cuestionario PAR-Q contiene datos sensibles de salud. Su registro es opcional y requiere
        autorización previa, expresa e informada del titular. El gimnasio es responsable de obtener
        dicha autorización antes de ingresarlos.
      </p>

      <h2>5. Seguridad</h2>
      <p>
        Aislamos los datos de cada gimnasio en su propia base de datos, ciframos los secretos de
        integraciones, controlamos el acceso por roles y mantenemos auditoría de las acciones
        sensibles. Ninguna medida es infalible, pero aplicamos estándares razonables de la industria.
      </p>

      <h2>6. Conservación</h2>
      <p>
        Conservamos los datos mientras la cuenta esté activa y por el tiempo que exijan las
        obligaciones legales y contables. Al terminar la relación, los datos se eliminan o anonimizan
        salvo obligación legal de conservarlos.
      </p>

      <h2>7. Derechos del titular</h2>
      <p>
        Todo titular puede conocer, actualizar, rectificar y suprimir sus datos, así como revocar la
        autorización, conforme a la Ley 1581 de 2012. Las solicitudes sobre datos de miembros se
        dirigen al gimnasio responsable; las relativas a la plataforma, a{" "}
        <strong>[correo de contacto]</strong>.
      </p>

      <h2>8. Contacto</h2>
      <p>
        <strong>[RAZÓN SOCIAL]</strong>: <strong>[correo de contacto]</strong>: <strong>[ciudad]</strong>, Colombia.
      </p>
    </article>
  );
}
