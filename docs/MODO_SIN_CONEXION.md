# Modo sin conexión (internet o servidor caídos)

El gimnasio sigue operando en un corte y, al volver la red, todo cuadra sin duplicados.

## Qué sigue funcionando y quién lo hace

| Qué | Cómo |
|---|---|
| Entrar por el torniquete (rostro, huella, tarjeta) | El equipo decide solo con los usuarios y la vigencia que ya tiene. Guarda las marcaciones y las sube al volver (ADMS o el agente local). Ver `ACCESO_TORNIQUETE.md` |
| Recepción: buscar un socio y ver si está al día | Copia local cifrada en el navegador (socios, estado, plan, vencimiento, entradas de ticketera), refrescada cada 5 minutos mientras hay red |
| Registrar una entrada, o autorizarla con motivo | Queda en la cola del navegador con su propio identificador |
| Cobrar una renovación en efectivo | Queda en la cola con su clave de idempotencia; el efectivo se guarda en la caja como siempre |
| Dar de alta un socio (pago en efectivo) | Queda en la cola; sus entradas se enlazan al socio real cuando se crea |
| Wompi, transferencias, WhatsApp, reportes | No: necesitan internet. La pantalla lo dice |

## Al volver la red

1. El navegador lo detecta (cada 20 s y con el evento `online`).
2. Sube primero altas y cobros, en el orden en que se hicieron, cada uno con su
   `Idempotency-Key`: reenviarlo nunca duplica.
3. Después sube las entradas en un lote (`POST /api/v1/offline/checkins`),
   idempotente por `client_event_id`.
4. El servidor es la autoridad. Lo que rechaza queda en **Mostrador › Hecho sin
   conexión** con el motivo (por ejemplo: "Abre un turno de caja antes de cobrar
   en efectivo") y los botones Reintentar o Descartar. Si alguien entró sin estar
   al día según el servidor, la entrada queda registrada y aparece como aviso.
5. La barra superior muestra "Sin conexión · N por subir", "Sincronizando" o
   "N por revisar".

## ¿Y si no hay internet al abrir la página? (el "dinosaurio")

No sale el dinosaurio si ese computador ya abrió LSMFit con internet: el
service worker (`frontend/public/sw.js`) guarda el Mostrador y lo sirve sin red,
aunque se haya cerrado el navegador o apagado el PC. Probado: con la red cortada
se recarga la página y abre completa, con la sesión y la copia de socios.

Para que sea a prueba de errores, en el PC de recepción **instala LSMFit como
app** (Chrome o Edge › ícono "Instalar" en la barra de direcciones). Queda un
ícono en el escritorio que abre directo el Mostrador, con o sin internet.

Cuándo SÍ sale el dinosaurio, y qué hacer:
- Un equipo que nunca abrió LSMFit, o al que le borraron los datos del
  navegador: no hay nada guardado. Usar otro equipo de recepción o esperar la red.
- Sin sesión abierta: sin red no se puede iniciar sesión. Dejar la sesión de
  recepción abierta durante la jornada.

## Requisitos

- Haber abierto el Mostrador con internet al menos una vez en ese equipo.
- La sesión debe estar abierta.
- El service worker solo se registra en producción (`npm run build`).

## Seguridad de la copia

- Solo lo necesario para decidir una entrada: nombre, cédula, estado, plan,
  vencimiento y entradas. El QR del carné solo como huella (SHA-256): el código
  que abre la puerta no queda en el equipo. Nada de teléfonos, correos ni salud.
- Cifrada con AES-GCM con una llave no extraíble. Ojo: la llave vive en el mismo
  navegador, así que quien copie el perfil entero del navegador se la lleva. La
  protección real del PC de recepción es su usuario de Windows con contraseña y el
  disco cifrado (BitLocker).
- La sesión guardada para trabajar sin red no incluye el token de acceso.
- Al cerrar sesión (y al llegar a la pantalla de ingreso) la copia se borra; la
  cola pendiente se conserva porque es trabajo que aún no llegó al servidor.
- Autorizar una entrada sin conexión exige el mismo permiso que con conexión; si
  quien la anota no lo tiene, queda como entrada normal y va a revisión.

## Luz

UPS para router, torniquete y el PC de recepción (1 a 2 horas), router 4G de
respaldo con conmutación automática y torniquete que quede libre para salir sin
energía (evacuación). Detalle en `ACCESO_TORNIQUETE.md`.

## Por qué no hay un "servidor local" para recepción

La app se sirve por HTTPS, y un navegador no deja que una página HTTPS le hable a
un servidor de la red local por HTTP. Un nodo local exigiría su propio
certificado en cada gimnasio. La copia cifrada en el navegador cubre el mismo
caso sin instalar nada; el agente local sigue cubriendo los torniquetes.
