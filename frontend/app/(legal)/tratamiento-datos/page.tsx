import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Tratamiento de Datos — FitConnect",
  description: "Política de tratamiento de datos personales conforme a la Ley 1581 de 2012.",
};

export default function TratamientoDatosPage() {
  return (
    <article className="space-y-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:font-display [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:text-[var(--text-muted)] [&_p]:leading-relaxed [&_li]:text-[var(--text-muted)] [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_ol_li]:text-[var(--text-muted)]">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold font-display">Política de Tratamiento de Datos Personales</h1>
        <p className="text-sm">Última actualización: 21 de junio de 2026</p>
      </header>

      <p>
        En cumplimiento de la Ley 1581 de 2012 y el Decreto 1377 de 2013, <strong>[RAZÓN SOCIAL]</strong>{" "}
        (NIT <strong>[NIT]</strong>), con domicilio en <strong>[ciudad]</strong>, Colombia, adopta la
        presente Política aplicable a los datos personales tratados a través de FitConnect.
      </p>

      <h2>1. Responsable y encargado</h2>
      <p>
        Respecto de los datos de los miembros, el gimnasio cliente es el <strong>Responsable</strong> y
        FitConnect actúa como <strong>Encargado</strong>. Respecto de los datos de la cuenta del
        gimnasio y su personal, FitConnect es el Responsable.
      </p>

      <h2>2. Finalidades del tratamiento</h2>
      <ul>
        <li>Operación del gimnasio: acceso, membresías, clases, caja y pagos.</li>
        <li>Comunicaciones operativas y recordatorios por los canales configurados.</li>
        <li>Generación de reportes, recibos y cumplimiento de obligaciones legales y contables.</li>
        <li>Seguridad de la información y prevención del fraude.</li>
      </ul>

      <h2>3. Datos sensibles</h2>
      <p>
        El cuestionario PAR-Q recolecta datos de salud, considerados sensibles. El titular no está
        obligado a autorizar su tratamiento. Cuando se registren, se requiere autorización previa,
        expresa e informada.
      </p>

      <h2 id="biometricos">3a. Datos biométricos (huella y rostro)</h2>
      <p>
        Cuando el gimnasio utiliza torniquetes o lectores biométricos, la huella dactilar o la imagen
        facial son datos <strong>sensibles</strong>. Su tratamiento es <strong>opcional</strong>: el titular
        siempre puede ingresar con su documento de identidad o su carné. Solo se enrola una credencial
        biométrica con autorización previa, expresa e informada del titular, registrada por el gimnasio con
        fecha, versión de este texto y persona que la tomó.
      </p>
      <ul>
        <li>La plantilla biométrica se almacena únicamente en el equipo lector del gimnasio; FitConnect guarda
          solo el identificador interno que ese equipo asigna al titular y el registro del consentimiento.</li>
        <li>Finalidad exclusiva: verificar la identidad del titular para controlar su ingreso a las instalaciones.</li>
        <li>El titular puede revocar la autorización en cualquier momento en recepción. La revocación elimina el
          vínculo en FitConnect y obliga al gimnasio a borrar al titular del equipo lector.</li>
        <li>No se comparten con terceros ni se usan para perfilamiento.</li>
      </ul>

      <h2>4. Derechos de los titulares</h2>
      <ol>
        <li>Conocer, actualizar y rectificar sus datos.</li>
        <li>Solicitar prueba de la autorización otorgada.</li>
        <li>Ser informado sobre el uso de sus datos.</li>
        <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).</li>
        <li>Revocar la autorización y/o solicitar la supresión cuando proceda.</li>
        <li>Acceder gratuitamente a sus datos personales.</li>
      </ol>

      <h2>5. Procedimiento para ejercer derechos</h2>
      <p>
        Las solicitudes relativas a datos de miembros se presentan ante el gimnasio responsable. Las
        relativas a la plataforma se dirigen a <strong>[correo de contacto]</strong>. Atenderemos las
        consultas en un máximo de diez (10) días hábiles y los reclamos en quince (15) días hábiles,
        prorrogables según la ley.
      </p>

      <h2>6. Autorización</h2>
      <p>
        La autorización del titular podrá constar por escrito, de forma verbal o mediante conductas
        inequívocas que permitan concluir razonablemente que la otorgó.
      </p>

      <h2>7. Vigencia</h2>
      <p>
        Esta Política rige desde su publicación. Los datos se conservarán mientras subsista la
        finalidad del tratamiento o lo exija la ley.
      </p>

      <h2>8. Contacto</h2>
      <p>
        <strong>[RAZÓN SOCIAL]</strong> — <strong>[correo de contacto]</strong> — <strong>[ciudad]</strong>, Colombia.
      </p>
    </article>
  );
}
