# Agente local de LSMFit

Programa pequeño que corre en el PC de recepción (o un mini-PC) y conecta con
LSMFit los torniquetes que **solo se alcanzan en la red del gimnasio**:

| Equipo | Cómo se conecta |
|---|---|
| ZKTeco con ADMS / "Cloud Server" (SpeedFace, ProFace, MB…) | **No necesita agente**: el equipo llama solo a la nube. Ver `docs/ACCESO_TORNIQUETE.md`. |
| Hikvision MinMoe (DS-K1T…) | Este agente, driver `hikvision` (ISAPI). |
| ZKTeco antiguo sin ADMS (puerto 4370) | Este agente, driver `zk_tcp`. |

Qué hace, en un ciclo de pocos segundos:

1. Pide a la nube los comandos del equipo (habilitar/bloquear socios con su
   vigencia, registrar rostro o huella, abrir) y los ejecuta en el equipo.
2. Lee las marcaciones del equipo y las sube como asistencia.
3. Si se cae internet, el equipo sigue decidiendo solo y las marcaciones
   se guardan en disco; se suben cuando vuelve la conexión, sin duplicados.

Solo hace **conexiones salientes**: no hay que abrir puertos en el router.
Las credenciales del equipo (usuario/clave de Hikvision) viven solo en el
archivo de configuración de este PC. Rostros y huellas nunca se envían a la nube.

## Instalar (Windows)

1. En LSMFit: **Ajustes › Dispositivos › Conectar torniquete**, elige la
   marca y copia el **token del dispositivo** (se muestra una sola vez).
2. Copia `lsmfit-agent.exe` a `C:\LSMFit\` y crea
   `C:\LSMFit\lsmfit-agent.json` a partir de `lsmfit-agent.example.json`:
   URL de LSMFit, token, IP del equipo, usuario y clave.
3. Prueba: `lsmfit-agent.exe --config C:\LSMFit\lsmfit-agent.json --check`
   Debe decir `Equipo OK: N usuarios` y `Nube OK: <nombre del dispositivo>`.
4. Déjalo como servicio para que arranque solo (con [NSSM](https://nssm.cc)):

   ```bat
   nssm install LSMFitAgente C:\LSMFit\lsmfit-agent.exe --config C:\LSMFit\lsmfit-agent.json
   nssm set LSMFitAgente AppDirectory C:\LSMFit
   nssm start LSMFitAgente
   ```

5. Pon el PC en una UPS y configura que encienda solo al volver la luz (BIOS).

## Construir el ejecutable

```bash
pip install -e ".[zk]" pyinstaller
pyinstaller --onefile --name lsmfit-agent lsmfit_agent/main.py
```

## Pruebas

```bash
pip install -e ".[zk,test]"
pytest -q
```

Las pruebas usan un Hikvision simulado, un ZKTeco simulado y una nube que se cae y vuelve.
