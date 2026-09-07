# Control de acceso: torniquete, huella y protección de datos biométricos

## Qué hay hoy (bloque 6)

FitConnect ya tiene el "cerebro" de acceso listo para conectar hardware. Funciona igual
para el kiosko, la recepción y un torniquete: la decisión de dejar pasar sale siempre de
`app/services/access.py::verify_access`, que usa las mismas reglas del check-in (membresía
vigente, gracia, congelado, pase del día).

| Pieza | Dónde | Qué hace |
|---|---|---|
| Dispositivos | Ajustes › Dispositivos (`kiosk_devices`) | Cada equipo (tablet kiosko, torniquete, lector, pantalla) tiene su **token** propio, revocable. Tipo, marca, modelo, serial, ubicación y política offline. |
| `POST /api/v1/access/verify` | token de dispositivo | Recibe `id_number`, `qr_code` **o** `device_user_id` (el ID interno del lector) + `direction`. Responde `allow` (abrir/bloquear), motivo, nombre y foto (URL firmada 15 min). Registra el check-in y el evento. |
| `POST /api/v1/access/heartbeat` | token de dispositivo | "Estoy vivo": actualiza `last_seen_at`, devuelve config y renueva el token. |
| `GET /api/v1/access/allowlist` | token de dispositivo | Lista de socios al día que entraron en las últimas 24 h, para que el equipo pueda dejar pasar sin red (solo si la política del dispositivo es `allow_recent`). |
| `POST /api/v1/access/events` | token de dispositivo | Lote de eventos que el equipo autorizó/denegó sin red. Idempotente por `client_event_id`; las entradas permitidas quedan como asistencia. |
| Credenciales | Ficha del socio › Acceso (`member_credentials`) | Mapeo `tipo + ID en el lector → socio`. Tipos: huella, rostro, tarjeta, PIN. Por convención, si no hay mapeo, **el ID del lector es la cédula**. |
| Consentimiento biométrico | Ficha del socio › Acceso (`biometric_consents`) | Obligatorio antes de enrolar huella o rostro (Ley 1581 de 2012: los datos biométricos son **sensibles** y exigen autorización previa, expresa e informada). Revocarlo revoca las credenciales. |
| Bitácora | `access_events` | Cada intento: permitido, denegado, desconocido, duplicado, offline. Visible en Ajustes › Dispositivos y en la ficha del socio. |
| Simulador | `backend/scripts/access_simulator.py` | Hace exactamente lo que hará el agente del hardware. Sirve para demostrar y para probar sin equipo. |

### Dónde vive la huella

**Nunca en FitConnect.** La plantilla biométrica (el "dibujo" de la huella) se guarda dentro
del lector. FitConnect solo guarda que "el usuario 1234 del lector de la entrada es la
socia María" y su consentimiento firmado. Si el gym cambia de lector, se vuelve a enrolar;
si la socia revoca el consentimiento, se borra su mapeo y hay que borrarla también del
lector (el agente lo hará automáticamente cuando exista; hoy es manual en el equipo).

## Cómo funciona un torniquete (para quien nunca ha manejado uno)

Un torniquete es un mueble con un motor/relé que se **libera** cuando recibe una señal
eléctrica. Quién manda esa señal es la clave:

1. **Lector integrado** (huella, rostro, tarjeta, teclado): el torniquete trae su propio
   lector y su propia memoria de usuarios. Marca típica en Colombia: ZKTeco (modelos
   TS1000/TS2000 con lector FR1200 o panel inBio, o la serie ProFace/SpeedFace en la
   mismo mueble). Anviz, Hikvision y Suprema también.
2. **El lector decide solo** (modo "standalone"): solo sabe qué usuarios tiene cargados.
   No sabe si pagaron. Por eso hace falta integrarlo con FitConnect.
3. **Integración**: hay dos maneras, y las dos ya están contempladas por la API:

   - **Agente local (recomendado para empezar)**: un programa pequeño (Python) corre en
     un computador o mini-PC del gym en la misma red del lector. Cuando el lector
     reconoce una huella, el agente le pregunta a FitConnect (`/access/verify`) y, si la
     respuesta es `allow`, le ordena al torniquete abrir (por el SDK del fabricante o por
     un relé USB/red). Si se va el internet, usa la `allowlist` y luego reporta con
     `/access/events`. Para ZKTeco existe `pyzk` (protocolo UDP/TCP del equipo) y el SDK
     oficial (Windows). Este agente **no existe todavía**: se escribe cuando el gym tenga
     el equipo, porque cada modelo habla distinto.
   - **Push directo (ADMS / "cloud")**: lectores modernos (ZKTeco con ADMS, Hikvision
     ISAPI) pueden enviar cada marcación por HTTP a un servidor. Ahí FitConnect
     recibiría el evento y respondería abrir/cerrar. Requiere un endpoint por fabricante
     (formato propio). Se hace después del agente.

## Recomendación de compra para el primer gym

- Torniquete tipo **trípode** (más barato y robusto que las puertas de vidrio) con
  **panel de acceso** y lector de huella + tarjeta. Pide que el equipo tenga **puerto de
  red (TCP/IP)** y soporte **SDK o ADMS**; sin eso no se puede integrar.
- Un mini-PC o el mismo computador de recepción para correr el agente.
- **Plan B siempre**: el kiosko con cédula y la recepción siguen funcionando aunque el
  torniquete falle. El staff puede abrir manualmente.

## Checklist de puesta en marcha

1. Crear el dispositivo en Ajustes › Dispositivos (tipo Torniquete, política offline) y
   guardar el token en el agente.
2. Probar con el simulador desde la red del gym:
   `python scripts/access_simulator.py --api https://app... --token ... --id <cédula>`.
3. Firmar consentimiento biométrico de cada socio (ficha › Acceso) y enrolar la huella en
   el lector usando **la cédula como ID de usuario** (así no hay que mapear nada).
4. Cuando llegue el equipo: instalar el agente, apuntarlo a la API, validar los 8 casos del
   contrato (`tests/test_access.py`): activo, vencido, en gracia, visitante con pase de
   hoy, pase de ayer, credencial revocada, dispositivo inactivo, lote offline.

## Protección de datos (resumen legal operativo)

- Los datos biométricos son datos **sensibles** (Ley 1581/2012, art. 5-6): requieren
  autorización previa, expresa e informada, indicando que es opcional. FitConnect exige el
  consentimiento antes de enrolar y registra versión del texto, fecha y quién lo tomó.
- La política de tratamiento pública (`/tratamiento-datos`) incluye la sección de datos
  biométricos.
- FitConnect no almacena plantillas biométricas; el lector sí. El gym debe borrar al
  socio del lector cuando revoca (o cuando se retira), y esa obligación queda en la
  política y en la bitácora.
- Toda foto de socio se sirve con URL firmada de 15 minutos (bloque 4); el torniquete
  solo la ve al momento del acceso.
