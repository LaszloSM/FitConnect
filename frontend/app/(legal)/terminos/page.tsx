import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones — FitConnect",
  description: "Términos de uso del servicio FitConnect.",
};

export default function TerminosPage() {
  return (
    <article className="space-y-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:font-display [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:text-[var(--text-muted)] [&_p]:leading-relaxed [&_li]:text-[var(--text-muted)] [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold font-display">Términos y Condiciones</h1>
        <p className="text-sm">Última actualización: 21 de junio de 2026</p>
      </header>

      <p>
        Estos Términos rigen el uso de la plataforma FitConnect, operada por{" "}
        <strong>[RAZÓN SOCIAL]</strong> (NIT <strong>[NIT]</strong>). Al crear una cuenta o usar el
        servicio, el gimnasio cliente acepta estos Términos.
      </p>

      <h2>1. El servicio</h2>
      <p>
        FitConnect es un software de gestión para gimnasios: control de acceso, miembros y
        membresías, caja y pagos, clases, reportes e integraciones. El servicio se presta &ldquo;tal
        cual&rdquo; y puede evolucionar con nuevas funcionalidades.
      </p>

      <h2>2. Cuentas y acceso</h2>
      <ul>
        <li>El gimnasio es responsable de las credenciales de su personal y de los roles que asigna.</li>
        <li>El uso del kiosko y de los dispositivos vinculados es responsabilidad del gimnasio.</li>
        <li>Está prohibido usar el servicio para fines ilícitos o vulnerar su seguridad.</li>
      </ul>

      <h2>3. Datos del gimnasio y sus miembros</h2>
      <p>
        El gimnasio es responsable de la veracidad de los datos que registra y de contar con la
        autorización de tratamiento de sus miembros. El tratamiento de datos se rige por la{" "}
        <a href="/privacidad" className="text-[var(--color-primary-ink)] underline">Política de Privacidad</a> y la{" "}
        <a href="/tratamiento-datos" className="text-[var(--color-primary-ink)] underline">Política de Tratamiento de Datos</a>.
      </p>

      <h2>4. Pagos e integraciones</h2>
      <p>
        Los cobros a los miembros se procesan mediante pasarelas de terceros (p. ej. Wompi) sujetas a
        sus propios términos. FitConnect no almacena datos sensibles de tarjetas. Durante la etapa de
        prelanzamiento, el uso de la plataforma puede ofrecerse en período de prueba sin costo.
      </p>

      <h2>5. Disponibilidad</h2>
      <p>
        Procuramos alta disponibilidad, pero el servicio puede tener interrupciones por mantenimiento
        o causas fuera de nuestro control. Algunas funciones requieren conexión a internet.
      </p>

      <h2>6. Limitación de responsabilidad</h2>
      <p>
        En la máxima medida permitida por la ley, FitConnect no será responsable por daños indirectos
        o lucro cesante derivados del uso o imposibilidad de uso del servicio.
      </p>

      <h2>7. Terminación</h2>
      <p>
        Cualquiera de las partes puede terminar la relación. Al hacerlo, el gimnasio podrá solicitar
        la exportación de sus datos antes de su eliminación, conforme a la Política de Privacidad.
      </p>

      <h2>8. Ley aplicable</h2>
      <p>Estos Términos se rigen por las leyes de la República de Colombia.</p>

      <h2>9. Contacto</h2>
      <p>
        <strong>[RAZÓN SOCIAL]</strong> — <strong>[correo de contacto]</strong> — <strong>[ciudad]</strong>, Colombia.
      </p>
    </article>
  );
}
