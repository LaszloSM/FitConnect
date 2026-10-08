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

## Requisitos

- Haber abierto el Mostrador con internet al menos una vez en ese equipo (para
  tener la copia y la página guardada). Se puede recargar la página sin red.
- La sesión debe estar abierta: sin red no se puede iniciar sesión.
- El service worker (`frontend/public/sw.js`) solo se registra en producción.

## Seguridad de la copia

- Solo lo necesario para decidir una entrada: nombre, cédula, QR, estado, plan,
  vencimiento y entradas. Nada de teléfonos, correos ni datos de salud.
- Cifrada con AES-GCM; la llave se crea en ese navegador como no extraíble.
- Al cerrar sesión (con red) la copia se borra; la cola pendiente se conserva
  porque es trabajo que aún no llegó al servidor.

## Luz

UPS para router, torniquete y el PC de recepción (1 a 2 horas), router 4G de
respaldo con conmutación automática y torniquete que quede libre para salir sin
energía (evacuación). Detalle en `ACCESO_TORNIQUETE.md`.

## Por qué no hay un "servidor local" para recepción

La app se sirve por HTTPS, y un navegador no deja que una página HTTPS le hable a
un servidor de la red local por HTTP. Un nodo local exigiría su propio
certificado en cada gimnasio. La copia cifrada en el navegador cubre el mismo
caso sin instalar nada; el agente local sigue cubriendo los torniquetes.
