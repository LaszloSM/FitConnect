# App móvil de FitConnect

Para socios de un gimnasio con FitConnect y para personas que entrenan solas.
El código está en `mobile/` (cómo correrla y publicarla: `mobile/README.md`).

## Qué puede hacer la persona

| | Socio de un gimnasio | Independiente |
|---|---|---|
| Entrar con un código por correo (sin contraseña) | ✓ | ✓ |
| Registrar entrenos (series, repeticiones, peso), también sin señal | ✓ | ✓ |
| Ver su progreso por ejercicio | ✓ | ✓ |
| Medidas y objetivo (peso y talla solo con autorización de salud) | ✓ | ✓ |
| Membresía, días que le quedan y entradas de su ticketera | ✓ | |
| QR de entrada que cambia cada 30 s y funciona sin internet | ✓ | |
| Reservar y cancelar clases, lista de espera | ✓ | |
| Rutina asignada por su entrenador, para registrarla serie a serie | ✓ | |
| Pagos y renovación en línea (Wompi del gimnasio) | ✓ | |
| Avisos del gimnasio (en la app y como notificación, si lo autoriza) | ✓ | |
| Ver lo que el gimnasio tiene registrado y completar lo que falta | ✓ | |
| Borrar su cuenta desde la app | ✓ | ✓ |

## Cómo se vincula un socio

1. El gimnasio tiene activo el módulo **App para socios** (plan Avanzado o Premium, o encendido
   desde el panel de plataforma).
2. En la ficha del socio, recepción toca **Código para la app**: un código de 8 caracteres que
   vence en 48 horas.
3. El socio entra a la app con su correo, toca **Vincular mi gimnasio** y escribe el código y su
   número de documento. Las dos cosas tienen que coincidir; 5 intentos fallidos inutilizan el código.
4. Si cambia de celular o de correo, recepción genera un código nuevo: al usarlo, la cuenta
   anterior pierde el acceso a esa ficha.

## QR de entrada

- El celular calcula el código sin internet: TOTP de 30 segundos con una llave por día derivada
  de la llave del vínculo (`HMAC-SHA1(llave, "AAAA-MM-DD" de Bogotá)`).
- Lo aceptan el mostrador (lector de QR), el kiosko y el torniquete (`/access/verify`).
- Recepción sin internet lo verifica con la copia local, que solo trae las llaves de hoy y
  mañana: un PC robado no sirve para fabricar QR la semana siguiente.
- Una captura de pantalla deja de servir en minuto y medio. Al desvincular la app, el QR muere.

## Dónde viven los datos

- **Base maestra**: la cuenta (correo, nombre), sus sesiones, vínculos con gimnasios,
  autorizaciones y tokens de avisos.
- **Base `fitconnect_app`**: medidas y entrenos. Ningún gimnasio la consulta. Se crea sola la
  primera vez (`app/db/app_db.py`); los respaldos con `pg_dumpall` ya la incluyen.
- **Base del gimnasio**: la ficha del socio. La app la muestra y solo puede llenar campos vacíos,
  con el mismo criterio que el enlace de completar ficha.

## Seguridad

- Token de acceso de 30 minutos con llave y audiencia propias (no sirve en el panel del gimnasio
  ni al revés). Token de renovación rotativo por dispositivo: si alguien reusa uno viejo, se
  cierran todas las sesiones de esa cuenta.
- Cerrar sesión o borrar la cuenta corta el acceso de inmediato (cada petición revisa la sesión).
- Códigos de entrada: 6 dígitos, 10 minutos, 5 intentos, máximo 5 por hora por correo.
- Todo lo de un gimnasio exige que el vínculo sea de quien pregunta: uno ajeno responde 404.

## Nutrición

- **Metas del día** (pestaña Comer): gasto en reposo con Mifflin-St Jeor × nivel de actividad;
  déficit del 20 % para bajar grasa, superávit del 10 % para ganar músculo. Proteína según la
  ISSN y Morton 2018 (sobre el peso de referencia de IMC 25 si hay obesidad), grasa 25 %,
  carbohidratos el resto, agua ~35 ml/kg. Nunca por debajo del gasto en reposo ni del piso
  por sexo (1200 / 1500 kcal). Solo mayores de 18 y con la autorización de datos de salud.
  Código: `backend/app/services/nutrition.py`, pruebas en `tests/test_nutrition.py`.
- **Alimentos**: 50 alimentos comunes en Colombia con valores aproximados de USDA FoodData
  Central (`backend/app/data/foods_reference.json`), código de barras con Open Food Facts
  (el producto se guarda la primera vez) y alimentos propios que solo ve quien los crea.
- **Registro**: por comida del día, también sin señal (se sube después sin duplicar).

## Asistente

- Usa la API de Claude (`ANTHROPIC_API_KEY`, modelo en `ASSISTANT_MODEL`, por defecto
  `claude-sonnet-5-5`). Sin llave, la app lo muestra como no disponible.
- Responde desde una base de conocimiento curada y citada (OMS, ACSM, ISSN, metaanálisis de
  Schoenfeld y Morton) en `backend/app/services/assistant.py`.
- Cuando la persona pide un plan, el modelo llama una herramienta y el servidor valida el plan
  antes de guardarlo: un plan de comidas por debajo del mínimo seguro vuelve al modelo para que
  lo corrija. Los planes se ven como agenda (comidas con hora y calorías, días de entreno con
  ejercicios), se pueden pausar, borrar o editar, los de comidas pueden programar
  recordatorios en el celular y los de entreno se registran serie a serie.
- Guardas: mensajes de crisis reciben una respuesta fija con el 123 y la Línea 192 opción 4
  sin llamar al modelo; señales de trastorno alimentario o de alarma médica apagan los planes
  y remiten a un profesional; PAR-Q con respuestas afirmativas pide planes conservadores;
  solo mayores de 18; 30 mensajes por día.
- **Probado con un modelo simulado** (`tests/test_app_assistant.py`). Antes de abrirlo al
  público hay que probarlo con la llave real y revisar las respuestas con un profesional de
  la salud y un abogado.

## Pendiente

- Publicar en las tiendas (requiere cuenta de EAS, Apple Developer y Google Play).
- Llenar razón social, NIT y correo de privacidad en `frontend/app/(legal)/app/page.tsx` y
  revisarlo con un abogado.
- QR de la app en el agente local del torniquete sin internet: hoy el torniquete lo valida en
  línea; sin red, el socio entra con cara, huella o documento.
- Tabla de composición del ICBF completa (hoy: 50 alimentos de referencia aproximados).
- Estimación de una comida por foto (requiere el modelo con visión y la llave real).
