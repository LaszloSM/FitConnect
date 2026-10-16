/**
 * Centro de ayuda de LSMFit. Escrito para quien atiende la recepción o maneja
 * el gimnasio: nombres de pantallas y botones tal cual aparecen, sin palabras
 * técnicas. Si cambia un botón o un flujo, se cambia aquí también.
 */

export type HelpCategoryKey =
  | "inicio"
  | "socios"
  | "cobros"
  | "entradas"
  | "clases"
  | "informes"
  | "app"
  | "sin-internet"
  | "equipo"
  | "seguridad"
  | "mensajes";

export interface HelpCategory {
  key: HelpCategoryKey;
  title: string;
  description: string;
}

export interface HelpArticle {
  slug: string;
  category: HelpCategoryKey;
  title: string;
  summary: string;
  /** Pasos numerados, en el orden en que se hacen. */
  steps?: string[];
  /** Secciones de explicación cuando no es un paso a paso. */
  sections?: { title: string; body: string[] }[];
  tips?: string[];
  related?: string[];
}

export interface HelpFaq {
  q: string;
  a: string;
  category: HelpCategoryKey;
}

export const SUPPORT_EMAIL = "lsmfit.business@gmail.com";

export const CATEGORIES: HelpCategory[] = [
  { key: "inicio", title: "Primeros pasos", description: "Deja el gimnasio listo el primer día." },
  { key: "socios", title: "Socios", description: "Altas, importación, fichas y membresías." },
  { key: "cobros", title: "Cobros y caja", description: "Cobrar, transferencias, turnos y cierres." },
  { key: "entradas", title: "Entradas y torniquete", description: "Mostrador, kiosko y control de acceso." },
  { key: "clases", title: "Clases y rutinas", description: "Horarios, cupos y entrenamientos." },
  { key: "informes", title: "Informes", description: "Ingresos, asistencia y lo que viene." },
  { key: "app", title: "App de socios", description: "Cómo la usan tus socios en el celular." },
  { key: "sin-internet", title: "Sin internet y cortes de luz", description: "Seguir atendiendo cuando algo falla." },
  { key: "equipo", title: "Equipo y permisos", description: "Quién ve y hace qué." },
  { key: "seguridad", title: "Seguridad de tu cuenta", description: "Contraseña y verificación en dos pasos." },
  { key: "mensajes", title: "Mensajes y avisos", description: "Recordatorios y anuncios a socios." },
];

export const ARTICLES: HelpArticle[] = [
  // ─── Primeros pasos ───
  {
    slug: "primer-dia",
    category: "inicio",
    title: "Tu primer día con LSMFit",
    summary: "Lo mínimo para empezar a atender: datos del gimnasio, planes, socios y caja.",
    steps: [
      "Entra a Ajustes › Gimnasio y revisa el nombre, la ciudad, el teléfono y el horario. El nombre es el que ven tus socios en los recibos y correos.",
      "Ve a Planes y crea los que vendes (mensual, trimestral, por número de entradas…). Cada plan tiene precio y duración.",
      "En Socios, agrega a tus socios uno por uno con «Nuevo socio» o tráelos todos desde Excel con «Importar».",
      "Si recibes efectivo, abre la caja del día en Caja › «Abrir turno».",
      "Invita a tu equipo en Ajustes › Equipo. A cada persona le llega un correo para crear su contraseña.",
      "Revisa la lista «Pon tu gimnasio en marcha» en la pantalla Hoy: se va marcando sola a medida que completas cada cosa.",
    ],
    tips: ["No tienes que hacer todo el primer día: con planes y socios ya puedes registrar entradas y cobrar."],
    related: ["importar-socios", "crear-planes", "invitar-equipo"],
  },
  {
    slug: "crear-planes",
    category: "inicio",
    title: "Crear y cambiar planes",
    summary: "Mensualidades, tiqueteras por número de entradas y planes especiales.",
    steps: [
      "Abre Planes y toca «Nuevo plan».",
      "Escribe el nombre que verá el socio, el precio y cuántos días dura.",
      "Si es por número de entradas (tiquetera), indica cuántas entradas trae. Cada entrada descuenta una.",
      "Guarda. El plan aparece al crear socios y al cobrar renovaciones.",
    ],
    sections: [
      {
        title: "¿Y si cambio el precio?",
        body: [
          "El precio nuevo aplica a las ventas desde ese momento. Las membresías ya vendidas conservan el precio con el que se vendieron.",
          "Si borras un plan que ya tiene socios, no se pierde nada: queda archivado y deja de ofrecerse.",
        ],
      },
    ],
  },

  // ─── Socios ───
  {
    slug: "nuevo-socio",
    category: "socios",
    title: "Registrar un socio nuevo",
    summary: "El alta en recepción, con su plan y su primer pago.",
    steps: [
      "En Socios toca «Nuevo socio».",
      "Escribe nombre, cédula, celular y correo. La cédula no se puede repetir: si ya existe, LSMFit te dice a nombre de quién está.",
      "Completa el cuestionario de salud (PAR-Q) y el contacto de emergencia.",
      "Elige el plan y cómo paga. Si paga en efectivo, necesitas la caja abierta.",
      "Pídele que acepte el tratamiento de sus datos. Sin esa autorización no se puede guardar la ficha.",
      "Guarda. La membresía empieza hoy.",
    ],
    tips: [
      "Si tu plan incluye la app de socios y el socio tiene correo, le llega automáticamente una invitación con su código para entrar a la app.",
    ],
    related: ["completar-ficha", "invitar-app"],
  },
  {
    slug: "importar-socios",
    category: "socios",
    title: "Traer tus socios desde Excel o tu programa anterior",
    summary: "Sube el archivo tal como sale de tu programa anterior y revisa antes de guardar.",
    steps: [
      "En Socios toca «Importar».",
      "Sube el archivo de Excel o CSV de tu programa anterior, o descarga la plantilla de LSMFit y llénala.",
      "Revisa la vista previa: verás quién es nuevo, a quién se le completan datos y qué filas tienen errores.",
      "Si un plan o un entrenador del archivo no existe, elige con cuál de LSMFit se relaciona.",
      "Toca «Importar». Al terminar puedes enviar a todos por correo el enlace para que completen su ficha y, si tienes la app, la invitación a la app.",
    ],
    sections: [
      {
        title: "¿Me equivoqué de archivo?",
        body: ["Puedes deshacer la importación completa con «Deshacer». Se borran los socios que creó y se restauran los datos que completó, siempre que no tengan pagos registrados."],
      },
    ],
    related: ["completar-ficha"],
  },
  {
    slug: "completar-ficha",
    category: "socios",
    title: "Que el socio complete su ficha desde el celular",
    summary: "Un enlace por correo para que el socio llene lo que falta: salud, emergencia y autorización.",
    steps: [
      "En la ficha del socio, si está incompleta, verás qué le falta.",
      "Toca «Enviar por correo». Le llega un correo con un botón para completar sus datos (toma unos 2 minutos).",
      "Para enviarlo a muchos a la vez, en la lista de Socios usa el aviso «fichas incompletas» › «Enviar enlace por correo».",
      "Si el socio no tiene correo, usa «Copiar enlace» y entrégaselo por el medio que prefieras.",
    ],
    tips: [
      "El enlace es personal, sirve una sola vez y vence en 7 días.",
      "Solo llena lo que está vacío: nadie puede cambiar con ese enlace lo que el gimnasio ya tiene.",
      "Para no llenar el correo de nadie, a quien ya se le envió en los últimos 3 días no se le reenvía en los envíos masivos.",
    ],
  },
  {
    slug: "congelar-renovar",
    category: "socios",
    title: "Renovar, congelar y cancelar membresías",
    summary: "Lo que pasa con las fechas en cada caso.",
    sections: [
      {
        title: "Renovar",
        body: [
          "Desde Caja › Cobrar, o desde la ficha del socio, eliges el plan y cobras. Si el socio todavía tiene días, la renovación empieza cuando termina la actual: no pierde días.",
        ],
      },
      {
        title: "Congelar",
        body: [
          "En la ficha del socio, «Congelar membresía» pausa los días (por viaje, incapacidad…). Al descongelar, la fecha de fin se corre los días que estuvo congelada.",
        ],
      },
      {
        title: "Cancelar",
        body: ["La membresía cancelada deja de dar acceso. El historial y los pagos se conservan."],
      },
    ],
  },

  // ─── Cobros y caja ───
  {
    slug: "cobrar",
    category: "cobros",
    title: "Cobrar una renovación o un producto",
    summary: "Efectivo, transferencia, tarjeta o enlace de pago en línea.",
    steps: [
      "Ve a Caja › Cobrar.",
      "Busca al socio por nombre o cédula y elige el plan, o agrega productos.",
      "Elige cómo paga: efectivo, transferencia, tarjeta o enlace de pago en línea.",
      "Confirma. Se genera el recibo, que puedes descargar o enviar.",
    ],
    tips: ["El efectivo necesita la caja abierta: así cada peso queda en el turno de quien lo recibió."],
    related: ["transferencias", "turnos-de-caja"],
  },
  {
    slug: "transferencias",
    category: "cobros",
    title: "Transferencias y Nequi",
    summary: "Mostrar el QR de tu cuenta y confirmar cuando llegue la plata.",
    steps: [
      "Registra tus cuentas de recaudo (banco, Nequi, llave) en Ajustes › Recaudo, con el QR de cada una.",
      "Al cobrar por transferencia, LSMFit muestra el QR, la cuenta y una referencia para el socio.",
      "El pago queda «Pendiente» hasta que compruebes que llegó. Confírmalo en Caja › Historial › Pendientes.",
      "Si la plata nunca llegó, usa «Anular». La membresía no se activa con un pago anulado.",
    ],
  },
  {
    slug: "turnos-de-caja",
    category: "cobros",
    title: "Abrir y cerrar la caja (turnos)",
    summary: "Cuadrar el efectivo de cada turno sin sorpresas.",
    steps: [
      "Al empezar, Caja › «Abrir turno» con el efectivo que hay en el cajón.",
      "Durante el turno, cada cobro en efectivo y cada gasto queda registrado en ese turno.",
      "Al terminar, «Cerrar turno»: cuenta el efectivo y escríbelo.",
      "LSMFit te muestra la diferencia entre lo que contaste y lo que debía haber. El dueño ve el detalle de cada cierre.",
    ],
    tips: ["Quien cierra la caja no ve el valor esperado antes de contar: así el cierre es un control real."],
  },
  {
    slug: "pagos-en-linea",
    category: "cobros",
    title: "Pagos en línea con Wompi",
    summary: "Envía un enlace de pago y la membresía se activa sola cuando el socio paga.",
    steps: [
      "Conecta tu cuenta de Wompi en Ajustes › Integraciones (las llaves se guardan cifradas).",
      "En Caja › Cobrar elige «Cobrar con link Wompi», o desde Por cobrar.",
      "Envía el enlace al socio. Cuando paga, el pago se confirma solo y la membresía se activa.",
    ],
  },
  {
    slug: "pase-del-dia",
    category: "cobros",
    title: "Pase del día para visitantes",
    summary: "Para quien entrena una sola vez sin hacerse socio.",
    steps: [
      "Configura el precio en Ajustes › Pases.",
      "En Caja › Pase del día, escribe el nombre y la cédula del visitante y cobra.",
      "El visitante puede entrar ese día con su cédula.",
    ],
  },

  // ─── Entradas ───
  {
    slug: "mostrador",
    category: "entradas",
    title: "Registrar entradas en el Mostrador",
    summary: "La pantalla de recepción: quién está entrando y si está al día.",
    steps: [
      "Abre Mostrador. Arriba ves las entradas de hoy y quién no pudo entrar.",
      "Para registrar una entrada a mano, busca al socio y confirma.",
      "Si el socio está vencido, LSMFit lo dice. Puedes cobrarle la renovación ahí mismo o, si tienes permiso, dejarlo entrar escribiendo el motivo.",
      "«Modo TV» muestra las entradas en vivo en una pantalla grande.",
    ],
  },
  {
    slug: "kiosko",
    category: "entradas",
    title: "Kiosko de autoservicio en la entrada",
    summary: "Una tablet donde el socio digita su cédula y entra solo.",
    steps: [
      "En Ajustes › Dispositivos crea un dispositivo tipo kiosko.",
      "Abre el enlace que te da LSMFit en la tablet de la entrada (una sola vez; después queda guardado).",
      "El socio digita su cédula y toca «Entrar». Si está al día, entra; si no, el kiosko le dice que pase por recepción.",
    ],
    tips: ["Sin internet, el kiosko muestra «Sin conexión, acércate a recepción»: en recepción se sigue trabajando con la copia local."],
  },
  {
    slug: "torniquete",
    category: "entradas",
    title: "Conectar el torniquete o el lector",
    summary: "Rostro, huella o tarjeta: el equipo decide solo con la información de LSMFit.",
    steps: [
      "En Ajustes › Dispositivos agrega el torniquete y sigue los pasos que aparecen en pantalla.",
      "Registra la huella, el rostro o la tarjeta de cada socio desde su ficha, en la pestaña Acceso. Pide su autorización: son datos sensibles.",
      "El equipo deja pasar a quien está al día y bloquea a quien está vencido. Cada entrada aparece en el Mostrador.",
    ],
    sections: [
      {
        title: "¿Qué pasa si se cae el internet?",
        body: ["El torniquete sigue decidiendo con lo que ya sabe y guarda las marcaciones. Cuando vuelve la red, las sube solas."],
      },
    ],
  },

  // ─── Clases ───
  {
    slug: "clases",
    category: "clases",
    title: "Crear clases y controlar cupos",
    summary: "Horario semanal, instructor y cupo de cada clase.",
    steps: [
      "En Clases toca «Nueva clase».",
      "Elige el tipo, el instructor, los días y la hora, y el cupo máximo.",
      "Los socios se inscriben desde recepción o desde la app. Ves la ocupación de cada sesión.",
      "Si cancelan a tiempo, recuperan su cupo.",
    ],
  },
  {
    slug: "rutinas",
    category: "clases",
    title: "Rutinas de entrenamiento",
    summary: "Arma rutinas con el catálogo de ejercicios y asígnalas a tus socios.",
    steps: [
      "En Rutinas crea una rutina y agrega ejercicios del catálogo (con fotos o videos).",
      "Asígnala a un socio con «Asignar rutina». Si tiene la app, la ve en su celular.",
      "Puedes mostrar la rutina del día en la pantalla del salón.",
    ],
  },

  // ─── Informes ───
  {
    slug: "informes",
    category: "informes",
    title: "Entender el Informe",
    summary: "Ingresos, ventas, socios, asistencia, retención e inteligencia.",
    sections: [
      { title: "Ingresos y Ventas", body: ["Lo cobrado de verdad en el período: solo pagos confirmados. Lo pendiente aparece aparte."] },
      { title: "Socios, Asistencia y Retención", body: ["Altas, bajas, quién viene y quién dejó de venir. La retención te dice cuántos renuevan."] },
      { title: "Inteligencia", body: ["Avisos de quién podría no renovar y cuánto se espera vender. Solo se muestra cuando de verdad acierta mejor que una regla simple con los datos de tu gimnasio."] },
      { title: "Exportar", body: ["Cada pestaña se descarga en PDF o Excel con el nombre de tu gimnasio."] },
    ],
  },

  // ─── App de socios ───
  {
    slug: "invitar-app",
    category: "app",
    title: "Invitar a tus socios a la app",
    summary: "Disponible en los planes que incluyen la app de socios.",
    steps: [
      "Cuando creas un socio con correo, le llega solo un correo de bienvenida con su código para vincularse.",
      "Para un socio que ya existía, en su ficha toca «Invitar por correo» (o «Ver código» para dárselo en persona).",
      "El socio descarga la app LSMFit, entra con su correo (le llega un código, no usa contraseña) y toca «Vincular mi gimnasio» con el código y su cédula.",
    ],
    tips: ["El código vence en 48 horas. Si vence, genera otro desde su ficha."],
  },
  {
    slug: "que-ve-el-socio",
    category: "app",
    title: "Qué ve el socio en la app",
    summary: "Su plan, clases, rutinas, pagos y su progreso.",
    sections: [
      {
        title: "En la app el socio puede",
        body: [
          "Ver su plan, cuántos días le quedan y renovar.",
          "Reservar y cancelar clases.",
          "Seguir su rutina y registrar sus entrenamientos y su progreso.",
          "Recibir los anuncios del gimnasio, si los acepta.",
        ],
      },
      {
        title: "Lo que el gimnasio no ve",
        body: ["Lo que el socio anota para sí mismo (peso, comidas, entrenos personales) es suyo. El gimnasio no tiene acceso."],
      },
    ],
  },

  // ─── Sin internet ───
  {
    slug: "sin-internet",
    category: "sin-internet",
    title: "Qué hacer si se cae el internet",
    summary: "La recepción sigue funcionando con una copia guardada en el computador.",
    steps: [
      "Arriba aparece «Sin conexión». No cierres la sesión ni el navegador.",
      "En Mostrador busca al socio por nombre o cédula: verás si está al día según la última copia.",
      "Registra la entrada, o cobra la renovación en efectivo. Todo queda guardado en el computador.",
      "Cuando vuelve el internet, LSMFit sube todo solo, sin duplicar nada. Si algo no se pudo subir, aparece en «Hecho sin conexión» con el motivo.",
    ],
    sections: [
      {
        title: "Lo que no funciona sin internet",
        body: ["Pagos en línea, transferencias, mensajes, informes y el kiosko. Todo eso necesita conexión."],
      },
    ],
    related: ["preparar-equipo", "cortes-de-luz"],
  },
  {
    slug: "preparar-equipo",
    category: "sin-internet",
    title: "Dejar listo el computador de recepción",
    summary: "Instala LSMFit como aplicación y revisa que tenga la copia de socios.",
    steps: [
      "Usa Google Chrome, Microsoft Edge o Brave.",
      "Ve a Ajustes › Dispositivos › «Este computador sin internet». Ahí ves qué le falta a este equipo.",
      "Toca «Instalar LSMFit en este computador». Queda un ícono en el escritorio que abre el Mostrador, con o sin internet.",
      "Deja la sesión de recepción abierta durante la jornada: sin internet no se puede iniciar sesión.",
    ],
    tips: [
      "El computador debe haber abierto LSMFit con internet al menos una vez para tener la copia de socios.",
      "En Brave: toca el león de la barra de direcciones y deja los escudos en «Estándar» para LSMFit. Si bloquea todas las cookies o borra los datos al cerrar, el equipo pierde la copia y no podrá trabajar sin internet.",
    ],
  },
  {
    slug: "cortes-de-luz",
    category: "sin-internet",
    title: "Cortes de luz",
    summary: "Qué comprar para no dejar a nadie afuera.",
    sections: [
      {
        title: "Lo honesto",
        body: [
          "Sin luz, el computador y el internet se apagan, y ningún programa puede evitarlo. Lo que sí puedes hacer es que la entrada siga funcionando.",
        ],
      },
      {
        title: "Recomendado",
        body: [
          "Una UPS (batería de respaldo) para el router, el torniquete y el computador de recepción: da entre 1 y 2 horas.",
          "Un router con datos móviles (4G) de respaldo, que se active solo si se cae el internet principal.",
          "Un torniquete que quede libre para salir si se va la luz, por seguridad.",
        ],
      },
    ],
  },

  // ─── Equipo ───
  {
    slug: "invitar-equipo",
    category: "equipo",
    title: "Invitar a tu equipo",
    summary: "Administradores, recepción y entrenadores, cada uno con su propio acceso.",
    steps: [
      "En Ajustes › Equipo toca «Invitar».",
      "Escribe el nombre, el correo y el rol.",
      "A la persona le llega un correo para crear su contraseña. La invitación dura 48 horas.",
      "Si no le llega, revisa el spam o copia el enlace que aparece en pantalla y envíaselo.",
    ],
    related: ["roles"],
  },
  {
    slug: "roles",
    category: "equipo",
    title: "Qué puede hacer cada rol",
    summary: "Cada persona ve solo lo que necesita para su trabajo.",
    sections: [
      { title: "Dueño", body: ["Todo: plata, informes, ajustes, equipo y la suscripción a LSMFit."] },
      { title: "Administrador", body: ["La operación completa del gimnasio, sin cambiar la suscripción."] },
      { title: "Recepción", body: ["Entradas, socios y cobros del día. No ve informes de plata ni la caja de otros turnos."] },
      { title: "Entrenador", body: ["Su día, sus socios, sus clases y las rutinas. No ve datos de pagos."] },
      { title: "Auditoría", body: ["Cada acción importante queda registrada con quién la hizo y cuándo, en Auditoría (solo el dueño)."] },
    ],
  },

  // ─── Seguridad ───
  {
    slug: "dos-pasos",
    category: "seguridad",
    title: "Verificación en dos pasos",
    summary: "Además de la contraseña, una prueba de que eres tú. Recomendada, no obligatoria.",
    steps: [
      "Ve a Ajustes › Seguridad.",
      "Elige un método: app autenticadora (la más segura), llave de acceso (huella o rostro del equipo) o código por correo.",
      "Sigue los pasos en pantalla. Al activar el primero recibes códigos de respaldo: guárdalos fuera del computador.",
      "Desde ese momento, al entrar te pedimos el método que elegiste. Puedes tener varios y escoger cuál usar.",
    ],
    tips: [
      "¿Perdiste el celular? Entra con uno de tus códigos de respaldo.",
      "Puedes desactivar un método cuando quieras con tu contraseña y un código.",
    ],
  },
  {
    slug: "contrasena",
    category: "seguridad",
    title: "Cambiar o recuperar tu contraseña",
    summary: "Con tu contraseña actual y un código, o con un enlace a tu correo si la olvidaste.",
    steps: [
      "Para cambiarla: Ajustes › Seguridad › «Cambiar contraseña». Escribe la actual y la nueva, y confirma con el código que te llega al correo.",
      "Al cambiarla, se cierra tu sesión en los demás equipos.",
      "Si la olvidaste: en la pantalla de ingreso toca «¿La olvidaste?». Te llega un enlace que dura una hora.",
    ],
    tips: ["Cada cambio de seguridad te llega como aviso al correo. Si no fuiste tú, restablece tu contraseña de inmediato."],
  },

  // ─── Mensajes ───
  {
    slug: "mensajes",
    category: "mensajes",
    title: "Mensajes automáticos y anuncios",
    summary: "Recordatorios de vencimiento, bienvenida, cumpleaños y anuncios.",
    steps: [
      "En Mensajes › Automáticos activa los avisos que quieras y escribe tu propio texto para cada ocasión.",
      "En Anuncios escribe un mensaje para todos los socios o para un grupo (por ejemplo, «el festivo no abrimos»).",
      "En Envíos ves qué salió y qué falló.",
    ],
    tips: [
      "Los socios con la app reciben los anuncios en su celular si lo autorizan.",
      "Para enviar por WhatsApp hay que conectar el WhatsApp Business del gimnasio en Ajustes › Integraciones; Meta cobra por cada mensaje.",
    ],
  },
];

export const FAQS: HelpFaq[] = [
  { category: "inicio", q: "¿Cuánto dura la prueba gratis?", a: "30 días con todo incluido y sin tarjeta. Si al final no te sirve, no pagas nada." },
  { category: "inicio", q: "¿Qué pasa cuando termina la prueba y no he pagado?", a: "Tienes 7 días más para ponerte al día. Después la cuenta queda en solo lectura: ves todo, pero no puedes registrar nada nuevo. Tus socios siguen pudiendo entrar." },
  { category: "inicio", q: "¿Puedo usar LSMFit desde el celular?", a: "Sí. La versión web funciona en el celular del dueño y de recepción, y tus socios tienen su propia app." },
  { category: "socios", q: "¿Puedo traer mis socios desde Excel o de otro programa?", a: "Sí. En Socios › Importar subes el archivo tal como sale de tu programa anterior. Antes de guardar ves qué va a pasar con cada persona, y puedes deshacer la importación completa." },
  { category: "socios", q: "¿Por qué no puedo crear un socio con una cédula?", a: "Porque ya existe un socio con esa cédula. LSMFit te dice a nombre de quién está para que no se dupliquen fichas." },
  { category: "socios", q: "¿Cómo hago para que el socio llene sus datos de salud?", a: "Desde su ficha, «Enviar por correo». Le llega un enlace personal para completar lo que falta desde el celular." },
  { category: "socios", q: "¿Puedo borrar un socio?", a: "Sí, si no tiene pagos registrados. Si ya pagó algo, no se borra para no perder el historial de la plata: puedes dejarlo inactivo." },
  { category: "cobros", q: "¿Por qué no puedo cobrar en efectivo?", a: "Porque no hay una caja abierta. Abre el turno en Caja › «Abrir turno» y vuelve a intentar." },
  { category: "cobros", q: "Una transferencia nunca llegó, ¿qué hago?", a: "Búscala en Caja › Historial › Pendientes y toca «Anular». La membresía no se activa con un pago anulado." },
  { category: "cobros", q: "¿Puedo devolver un pago?", a: "Sí, desde el detalle del pago con «Devolver este pago». La devolución se descuenta de la caja y queda en la auditoría." },
  { category: "cobros", q: "¿Los recibos llevan mi logo?", a: "Sí. Los recibos e informes salen con el nombre y el logo de tu gimnasio." },
  { category: "entradas", q: "¿Qué pasa si un socio vencido intenta entrar?", a: "El torniquete o el kiosko no lo dejan pasar y le dicen que pase por recepción. Ahí puedes cobrarle la renovación o, si tienes permiso, dejarlo entrar escribiendo el motivo." },
  { category: "entradas", q: "¿Necesito un torniquete para usar LSMFit?", a: "No. Puedes registrar las entradas en el Mostrador o con una tablet en la entrada (kiosko). El torniquete es opcional." },
  { category: "entradas", q: "¿Los socios entran con QR?", a: "No. Entran con su cédula, o con huella, rostro o tarjeta si tienes un torniquete conectado." },
  { category: "clases", q: "¿Los socios pueden reservar clases solos?", a: "Sí, desde la app de socios, si tu plan la incluye. También puedes inscribirlos desde recepción." },
  { category: "informes", q: "¿Por qué el ingreso del informe no coincide con lo que cobré?", a: "El informe solo cuenta pagos confirmados. Las transferencias pendientes aparecen aparte hasta que las confirmes." },
  { category: "informes", q: "¿Qué es la Inteligencia?", a: "Avisos de qué socios podrían no renovar y cuánto se espera vender. Aprende de los datos de tu gimnasio y solo se muestra cuando de verdad acierta." },
  { category: "app", q: "¿Mis socios pagan por la app?", a: "No. La app es gratis para tus socios. Está incluida en los planes de LSMFit que la traen." },
  { category: "app", q: "Un socio cambió de celular, ¿qué hago?", a: "Que vuelva a entrar con su correo. Si necesita vincular de nuevo su gimnasio, genérale un código nuevo desde su ficha." },
  { category: "sin-internet", q: "¿Qué pasa si se cae el internet?", a: "Recepción sigue funcionando con la copia guardada en el computador: buscas socios, registras entradas y cobras en efectivo. Al volver la red, todo sube solo y sin duplicados." },
  { category: "sin-internet", q: "¿Y si se va la luz?", a: "Sin luz no funciona el computador. Con una UPS (batería de respaldo) para el router, el torniquete y el computador sigues atendiendo entre 1 y 2 horas." },
  { category: "sin-internet", q: "¿Tengo que descargar algo para trabajar sin internet?", a: "No hace falta, pero te lo recomendamos: en Ajustes › Dispositivos toca «Instalar LSMFit en este computador» y queda un ícono en el escritorio." },
  { category: "sin-internet", q: "¿Funciona en Brave?", a: "Sí. Brave se puede instalar igual que Chrome (menú ☰ › Instalar LSMFit). Solo cuida que los escudos de Brave estén en «Estándar» para este sitio: si bloquean todas las cookies o borran los datos al cerrar, el equipo pierde la copia para trabajar sin internet. Revísalo en Ajustes › Dispositivos." },
  { category: "equipo", q: "¿Cómo agrego a mi personal?", a: "En Ajustes › Equipo los invitas por correo. Cada persona crea su propia contraseña. Puedes cambiar su rol o quitarle el acceso cuando quieras." },
  { category: "equipo", q: "¿La recepción puede ver cuánto vende el gimnasio?", a: "No. Recepción ve las entradas y los cobros del día. Los informes de plata y la caja completa son del dueño y el administrador." },
  { category: "seguridad", q: "¿Es obligatoria la verificación en dos pasos?", a: "No. Te la recomendamos porque protege tu cuenta si alguien consigue tu contraseña, pero tú decides si la activas y puedes quitarla cuando quieras." },
  { category: "seguridad", q: "Perdí el celular con la app autenticadora, ¿cómo entro?", a: "Con uno de tus códigos de respaldo. Si tampoco los tienes, escríbenos y verificamos tu identidad para ayudarte." },
  { category: "seguridad", q: "¿Mis datos y los de mis socios están seguros?", a: "Cada gimnasio tiene su propia base de datos separada, las fotos y documentos solo se ven con enlaces temporales y cada acción importante queda registrada. Cumplimos la Ley 1581 de protección de datos." },
  { category: "mensajes", q: "¿Por qué no salen mis mensajes de WhatsApp?", a: "Para enviar por WhatsApp hay que conectar el WhatsApp Business del gimnasio y tener las plantillas aprobadas por Meta. Los correos, en cambio, salen sin configurar nada." },
  { category: "inicio", q: "¿Cómo cancelo?", a: "Escríbenos cuando quieras. No hay permanencia ni multas, y antes de irte puedes exportar tus socios e informes a Excel." },
];

export function articleBySlug(slug: string): HelpArticle | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Búsqueda simple: todas las palabras deben aparecer en el título, el resumen o el contenido. */
export function searchHelp(query: string): { articles: HelpArticle[]; faqs: HelpFaq[] } {
  const words = strip(query).split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return { articles: [], faqs: [] };
  const hit = (text: string) => {
    const t = strip(text);
    return words.every((w) => t.includes(w));
  };
  const articleText = (a: HelpArticle) =>
    [a.title, a.summary, ...(a.steps ?? []), ...(a.tips ?? []), ...(a.sections ?? []).flatMap((s) => [s.title, ...s.body])].join(" ");
  return {
    articles: ARTICLES.filter((a) => hit(articleText(a))),
    faqs: FAQS.filter((f) => hit(`${f.q} ${f.a}`)),
  };
}
