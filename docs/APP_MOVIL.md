# App móvil de LSMFit

Para socios de un gimnasio con LSMFit y para personas que entrenan solas.
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
| Comidas del día con metas, macros y micronutrientes, también sin señal | ✓ | ✓ |
| Planes de comidas y de entreno (automático gratis o con IA por créditos) | ✓ | ✓ |
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

- **Metas del día** (pestaña Comer): gasto en reposo con Mifflin-St Jeor × nivel de actividad.
  La persona elige el ritmo en Mis medidas: para bajar grasa suave (−10 %), moderado (−20 %) o
  fuerte (−25 %); para ganar músculo limpio (+5 %) o estándar (+10 %). La app muestra cuánto
  peso cambia por semana (7.700 kcal por kg) y avisa si pasa del 1 % del peso. Nunca baja del
  gasto en reposo ni del piso por sexo (1200 / 1500 kcal). Proteína en g/kg según el objetivo
  (ISSN, Morton 2018, sobre el peso de IMC 25 si hay obesidad), grasa mínima 25 % y 0,6 g/kg,
  carbohidratos el resto, fibra 14 g por 1.000 kcal, agua ~35 ml/kg. Micronutrientes con
  referencia por sexo y edad (IOM/OMS): mínimos (calcio, hierro, potasio, vitaminas) y límites
  (sodio, azúcares, grasa saturada). Solo mayores de 18 y con autorización de datos de salud.
  Código: `backend/app/services/nutrition.py`.
- **Alimentos** (828, `backend/app/data/foods_reference.json`, se regenera con
  `backend/scripts/build_foods.py`):
  - 712 de la **Tabla de Composición de Alimentos Colombianos (ICBF, 2015)**, extraídos del PDF
    oficial; solo se aceptan filas cuyas calorías cuadran con sus macros (Atwater).
  - 103 de **USDA FoodData Central** (dominio público) para lo que la TCAC no trae.
  - 43 platos colombianos calculados por receta (ajiaco, bandeja paisa, calentado…), marcados
    «estimado por receta».
  - Once nutrientes además de los macros. Un dato que la fuente no trae se muestra «sin dato»,
    nunca cero.
  - Búsqueda sin tildes, por sinónimos (guineo/banano, ahuyama/zapallo) y con lo que la persona
    más come primero; categorías, recientes y favoritos.
  - Código de barras con Open Food Facts (el producto se guarda la primera vez).
  - Alimentos propios con la etiqueta por porción o por 100 g (la app convierte) y aviso si las
    calorías no cuadran con los macros. «Mi comida»: varios alimentos guardados como uno.
- **Registro**: por comida del día, también sin señal (se sube después sin duplicar). Se
  cambia la cantidad o se borra desde la misma lista, se repite lo del día anterior, y la vista
  de la semana compara cada día con la meta.

## Planes (comidas y entreno)

La persona responde unas preguntas (comidas al día y restricciones, o días, tiempo, lugar,
experiencia y objetivo) y elige cómo se arma el plan. No hay chat: el resultado es un plan que
la app dibuja con sus propias pantallas.

- **Automático (gratis, al instante)**: reglas con base en evidencia (`auto_plans.py`). Para
  comidas, las reglas eligen alimentos comunes en Colombia y `portion_fit.py` ajusta los gramos
  por mínimos cuadrados con límites para cumplir a la vez calorías, proteína, grasa y
  carbohidratos, con porciones razonables (máximo 3 huevos, 60 g de queso, 40 g de frutos
  secos). Si con las restricciones no se llega a la proteína, la nota del plan lo dice.
- **Con IA (1 crédito)**: Gemini (`plan_generator.py`) en modo estructurado. Recibe un perfil
  **anónimo** (edad en rango, sexo, peso y talla redondeados a 5, objetivo y metas, nunca
  nombre, correo ni gimnasio) y responde solo JSON con un esquema cuyo alimento es una lista
  cerrada de la base. El servidor recalcula todas las cifras desde la base, ajusta los gramos
  con el mismo `portion_fit` y valida el plan. Si falla dos veces, entrega el automático y
  devuelve el crédito.
- **Fila y cuota**: contador en Redis por minuto y por día (`GEMINI_RPM`, `GEMINI_RPD`). Si
  está lleno, el pedido espera en la tabla `plan_jobs` y la app muestra la posición. Un worker
  la procesa cada 20 s con advisory lock; a los 30 min de espera sale el automático.
- **Créditos**: libro que solo agrega filas (`credit_entries`): 3 de bienvenida y 2 gratis
  cada lunes (`PLAN_WELCOME_CREDITS`, `PLAN_FREE_WEEKLY`). El tipo `ad`/`purchase` queda listo
  para anuncios o compras, sin construir todavía.
- **Guardas**: antes de armar el plan se pregunta por trastornos de la conducta alimentaria y
  por embarazo, lactancia, enfermedad crónica o lesión. Una respuesta afirmativa no genera el
  plan y orienta a un profesional (Línea 192 opción 4, 123). PAR-Q con alertas da cargas
  suaves. Solo mayores de 18. Usar la IA pide una autorización aparte (`ai_plans`).
- Los planes se ven como agenda, se pueden pausar, borrar o editar (se revalidan), los de
  comidas se registran con un toque («Lo comí») y programan recordatorios, y los de entreno se
  registran serie a serie.

### Gemini: llave, cuota y costo

1. Crea la llave gratis en https://aistudio.google.com/apikey y ponla en el `.env` del
   servidor como `GEMINI_API_KEY`. Modelo por defecto `gemini-2.5-flash-lite` (`GEMINI_MODEL`).
2. La cuota gratis real se ve en AI Studio (pestaña de uso). Google la ha recortado varias
   veces: hoy va de decenas a pocos cientos de pedidos al día y unos 10 por minuto. Ajusta
   `GEMINI_RPD` y `GEMINI_RPM` un poco por debajo de lo que muestre.
3. **Privacidad:** en el plan gratis Google puede usar lo que se le envía para mejorar sus
   productos y puede haber revisión humana. Por eso solo viaja el perfil anónimo. Apenas haya
   usuarios reales, activa la facturación del proyecto: con facturación los datos dejan de
   usarse para entrenar.
4. Costo pagando: un plan son unos 3.000 tokens de entrada y 3.000 de salida. Con flash-lite
   (USD 0,10 / 0,40 por millón) son unos USD 1,5 por cada 1.000 planes; con 2.5 Flash, unos
   USD 8.
5. Sin llave todo funciona con el plan automático; la opción con IA aparece como no disponible.

## Instalar la app sin Play Store

El workflow `.github/workflows/android-apk.yml` compila el APK en GitHub Actions (gratis, sin
EAS) y lo publica como Release del repo.

1. En el repo: Settings › Secrets and variables › Actions › Variables, crea `APP_API_URL`
   (por ejemplo `https://api.tu-dominio.com`, tiene que ser https) y `APP_WEB_URL`.
2. Crea la llave de firma una sola vez y guárdala en un lugar seguro (si se pierde, los
   usuarios tendrán que desinstalar para actualizar):
   ```bash
   keytool -genkeypair -v -keystore lsmfit.keystore -alias lsmfit \
     -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 lsmfit.keystore   # copia la salida
   ```
   Secrets: `ANDROID_KEYSTORE_BASE64` (la salida), `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS` (`lsmfit`) y `ANDROID_KEY_PASSWORD`. Sin ellos el APK sale firmado
   con la llave de depuración y el Release queda marcado «prueba». La firma la aplica
   `mobile/plugins/withReleaseSigning.js`.
3. Actions › App Android (APK) › Run workflow, o sube un tag `app-v0.1.0`. Tarda unos 20 min.
4. En el celular: abre el Release, descarga el APK y acepta instalar desde esa fuente. Play
   Protect puede avisar que la app es desconocida: «Más detalles › Instalar de todas formas».
5. **Verificación de desarrolladores de Google** (revisado en octubre de 2026): desde el
   30 de septiembre de 2026 rige solo en Brasil, Indonesia, Singapur y Tailandia; Google planea
   extenderla al resto del mundo en 2027. En Colombia hoy el APK se instala sin registro. Antes
   de 2027 hay que registrarse en la Android Developer Console y asociar el paquete
   `co.lsmfit.app` con la llave de firma: la cuenta de distribución completa cuesta USD 25
   una sola vez (como empresa pide un número D-U-N-S, que es gratis); la de distribución
   limitada es gratis pero solo sirve para 20 dispositivos. Fuente:
   https://developer.android.com/developer-verification

Otras opciones:

- `mobile/eas.json` trae un perfil `preview` (APK) para cuando haya cuenta gratis de Expo
  (`npx eas build -p android --profile preview`).
- iPhone no instala APK: mientras no haya cuenta de Apple, se puede servir la versión web
  (`npx expo export --platform web`) desde el mismo Caddy.
- Notificaciones push en el APK: necesitan un proyecto gratis de Firebase (`google-services.json`
  en `mobile/` y `android.googleServicesFile` en `app.json`). Sin él, la app funciona igual y
  los recordatorios de comidas son locales.

## Pendiente

- Llenar razón social, NIT y correo de privacidad en `frontend/app/(legal)/app/page.tsx` y
  revisarlo con un abogado.
- Probar los planes con IA con la llave real (hoy probados con Gemini simulado) y revisar
  planes de ejemplo con un nutricionista.
- QR de la app en el agente local del torniquete sin internet: hoy el torniquete lo valida en
  línea; sin red, el socio entra con cara, huella o documento.
- Recarga de créditos por anuncio (AdMob) o compra, y la suscripción freemium.
- Publicar en las tiendas (cuenta de Google Play y Apple Developer).
