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

## Pendiente

- Publicar en las tiendas (requiere cuenta de EAS, Apple Developer y Google Play).
- Llenar razón social, NIT y correo de privacidad en `frontend/app/(legal)/app/page.tsx` y
  revisarlo con un abogado.
- QR de la app en el agente local del torniquete sin internet: hoy el torniquete lo valida en
  línea; sin red, el socio entra con cara, huella o documento.
- Nutrición y asistente (fase 4).
