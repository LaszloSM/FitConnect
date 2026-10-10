# Control de acceso: torniquete, rostro, huella y protección de datos

## Cómo funciona (en una frase)

El torniquete reconoce el rostro o la huella **por sí mismo** y decide en el momento; LSMFit le
dice **quién está al día y hasta cuándo**, recibe cada entrada como asistencia y registra rostros y
huellas desde la ficha del socio. Por eso sigue funcionando aunque se vaya el internet.

```
 Socio ─► Torniquete (rostro/huella, decide solo) ─► marcación ─► LSMFit (check-in, alertas)
                 ▲                                                       │
                 └──── quién está habilitado y hasta cuándo ◄────────────┘
```

## Marcas y formas de conexión

| Equipo | Conexión | ¿PC en el gym? | Dónde está el código |
|---|---|---|---|
| ZKTeco con "Servidor en la nube" / ADMS (SpeedFace, ProFace, MB, iFace…) | El equipo llama solo a `https://<dominio>/iclock/*` | No | `backend/app/api/v1/iclock.py`, `services/access_drivers/zk_adms.py` |
| Hikvision MinMoe (DS-K1T…) | Agente local por ISAPI | Sí (recepción) | `agent/lsmfit_agent/drivers/hikvision.py` |
| ZKTeco antiguo sin ADMS (puerto 4370) | Agente local por TCP (pyzk) | Sí | `agent/lsmfit_agent/drivers/zk_tcp.py` |
| Otra marca | Agente o integrador que llama `POST /api/v1/access/verify` | Depende | `backend/app/api/v1/access.py` |

**¿Cuál es el equipo del gimnasio?** Etiqueta detrás de la pantalla o Menú › Sistema › Información.
Si el menú tiene "Comunicación › Servidor en la nube / ADMS / Cloud Server", es la primera fila.

## Puesta en marcha (gimnasio piloto)

1. **LSMFit**: Ajustes › Dispositivos › Torniquete. Marca y conexión; para ZKTeco ADMS el
   **número de serie** (Menú › Sistema › Información). Se muestran los pasos exactos.
2. **Equipo ZKTeco ADMS**: Menú › Comunicación › Servidor en la nube → dirección = dominio de
   LSMFit, puerto 443, HTTPS activado, proxy desactivado. En un minuto aparece «Conectado».
   Requiere **HTTPS con certificado válido** (algunos firmwares rechazan certificados propios).
3. **Equipo por agente**: instalar el agente en el PC de recepción (`agent/README.md`), pegar el
   token del dispositivo, IP, usuario y clave del equipo, `--check`, y dejarlo como servicio.
4. **Toma de control**: «Sincronizar ahora». LSMFit lee los usuarios que ya tiene el equipo
   (los que registró el programa anterior), los enlaza por cédula y les envía su estado. Quien
   está vencido queda bloqueado **sin borrarle el rostro ni la huella**. Los que no coinciden se
   ven en «Ver cuáles» y se enlazan desde la ficha › Acceso › Asignar un ID manualmente.
5. **Probar los casos** (checklist abajo) con socios reales.
6. Apagar el programa anterior: dos sistemas no pueden mandar al mismo equipo.

## Qué pasa en cada situación

| Situación | Qué hace LSMFit |
|---|---|
| Se vende, renueva, congela, reactiva o cancela una membresía, o se da una cortesía | Encola el nuevo estado del socio en cada equipo, en la misma transacción |
| Se vence a medianoche | El job `sync_access_devices` (cada 5 min) lo bloquea. En Hikvision la fecha de vigencia ya está en el equipo |
| Ticketera sin entradas | Se bloquea igual que un vencido |
| Marcación en el equipo | Check-in (dos marcaciones en 5 min cuentan una). Se descuenta la entrada de la ticketera |
| El equipo dejó pasar a alguien que no está al día (estado viejo) | Se registra la entrada, se avisa a recepción y se corrige el equipo de inmediato |
| Crear socio | Paso «Acceso» del asistente: consentimiento + registrar rostro (en el equipo o con la foto de la ficha) y huella, con el progreso en vivo |
| Se revoca el consentimiento biométrico | Se borra el rostro o la huella **del equipo** y la credencial |
| Recepción necesita abrir | Botón «Abrir torniquete» en el Mostrador (queda en auditoría) |
| Se va el internet | El equipo sigue decidiendo con lo que sabe; las marcaciones se guardan (en el equipo o en el agente) y se suben al volver, sin duplicados. Recepción sigue con la copia local del navegador (`MODO_SIN_CONEXION.md`) |
| Se va la luz | Hardware: UPS para torniquete, router y PC; ver abajo |

## Ajustes avanzados por equipo (instalador)

Lo que cambia entre firmwares queda configurable en Ajustes › Dispositivos › Estado y control:

- **Cómo bloquear**: `timezone` (ZKTeco: sin acceso por horario, conserva la biometría; por
  defecto), `validity` (Hikvision: fecha de vigencia), `delete` (borrar del equipo; último recurso).
  Tras elegir, probar con un socio vencido.
- **ID del socio en el equipo**: la cédula (por defecto) o números cortos para equipos que solo
  aceptan ID de pocos dígitos.
- **Orden para registrar huella** (ZKTeco ADMS): `ENROLL_FP` (la mayoría) o `ENROLL_BIO`.
- **Orden para abrir** (ZKTeco ADMS): por defecto `CONTROL DEVICE 01010105`; si el modelo usa
  otra, se cambia en `config.open_command`.
- **IPs permitidas** (`config.allowed_ips`): solo aceptar marcaciones desde la IP pública del gym.

Si el firmware no acepta registrar rostro o huella desde la nube, la ficha lo dice y muestra el ID
para registrarlo en el menú del equipo; LSMFit detecta solo cuando el equipo reporta la nueva
plantilla y crea la credencial.

## Checklist de instalación (30 minutos)

1. «Conectado» en Ajustes › Dispositivos.
2. Sincronizar: el número de usuarios del equipo coincide; los socios quedaron enlazados.
3. Socio activo con rostro → abre, aparece en el Mostrador.
4. Socio vencido → no abre.
5. Renovar a ese socio desde la caja → en menos de un minuto abre.
6. Socio nuevo: crear con el asistente, registrar rostro y huella → abre con ambos.
7. Ticketera: entra hasta agotar entradas, luego no.
8. Desconectar el internet del gym: el activo sigue entrando; al reconectar, las entradas aparecen.
9. «Abrir torniquete» desde el Mostrador.
10. Revocar el consentimiento de un socio de prueba → su huella ya no abre.

Sin hardware: `backend/scripts/zk_adms_emulator.py` habla ADMS igual que el equipo, y
`backend/tests/test_access_devices.py` recorre todo lo anterior.

## Luz e internet (hardware recomendado)

- **UPS** para torniquete, router y PC de recepción (1 a 2 horas).
- **Router 4G de respaldo** con conmutación automática.
- Confirmar con el instalador que el torniquete quede **libre para salir sin energía** (evacuación).
- PC del agente: encendido automático al volver la luz (BIOS) y agente como servicio.

## Seguridad del endpoint `/iclock`

El protocolo ADMS de ZKTeco identifica al equipo solo por su serial, que está impreso
en él: quien lo conozca puede intentar hacerse pasar por el torniquete. Defensas:

- **IPs permitidas** (Ajustes › Dispositivos › Ajustes avanzados): la IP pública del
  gimnasio. Es lo más importante; la pantalla lo recomienda mientras esté vacío.
- Sin IPs registradas, si el mismo serial llama desde otra IP mientras el equipo real
  está conectado, se rechaza y la pantalla del torniquete lo avisa en rojo.
- En producción la foto del rostro solo se envía por HTTPS o a un equipo con IP
  permitida.
- Seriales desconocidos y desactivados reciben la misma respuesta (no se puede
  averiguar cuáles existen); marcaciones con fecha imposible se ignoran; límite de
  peticiones. Los tokens de una tableta de kiosko no sirven en los endpoints del agente.

Lo que un impostor con el serial podría ver (si no hay IPs permitidas) son los
comandos pendientes: nombre y cédula de los socios que se están sincronizando.

## Protección de datos (Ley 1581 de 2012)

- Los datos biométricos son **sensibles**: autorización previa, expresa e informada, opcional. El
  panel de registro no avanza sin ella y guarda versión, fecha y quién la tomó.
- Las **plantillas no se guardan en LSMFit**: viven en el equipo. Lo único que viaja es la foto de
  la ficha cuando se usa como rostro (con autorización de imagen), y se borra de la cola apenas el
  equipo la recibe.
- ZKTeco por TCP: al bloquear, las huellas se guardan temporalmente en el PC del gimnasio (no en la
  nube) para restaurarlas al renovar.
- Revocar el consentimiento borra la biometría del equipo automáticamente.
- Fotos de socios: URL firmada de 15 minutos.
