"""Emulador de un terminal ZKTeco que habla ADMS/PUSH ("iclock") con LSMFit.

Hace lo mismo que el equipo real: handshake, sube marcaciones (ATTLOG), sube
usuarios y plantillas (OPERLOG), pide comandos (getrequest) y responde
(devicecmd). Tiene su propia memoria de usuarios y decide solo si deja pasar,
igual que el torniquete.

Uso contra un servidor:

    python scripts/zk_adms_emulator.py --api https://app.midominio.co --sn ABC123 \
        --users 1018456789,1020304050 --punch 1018456789 --poll

Las pruebas automáticas usan la clase ``ZkEmulator`` con el cliente ASGI.
"""
from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo
from datetime import datetime
from typing import Optional

import httpx

TZ_BLOCKED = "0001000000000000"


@dataclass
class EmuUser:
    pin: str
    name: str = ""
    tz: str = "0000000000000000"
    fingerprints: int = 0
    face: bool = False

    @property
    def can_enter(self) -> bool:
        return self.tz != TZ_BLOCKED


@dataclass
class ZkEmulator:
    client: httpx.AsyncClient
    serial: str
    users: dict[str, EmuUser] = field(default_factory=dict)
    door_opens: int = 0
    executed: list[str] = field(default_factory=list)
    #: Simula el dedo/rostro de la persona frente al equipo al enrolar
    auto_enroll: bool = True

    def _q(self, **extra) -> dict:
        return {"SN": self.serial, **extra}

    async def handshake(self) -> httpx.Response:
        return await self.client.get("/iclock/cdata", params=self._q(options="all", pushver="2.4.1"))

    async def punch(self, pin: str, when: Optional[datetime] = None, verify: int = 15) -> tuple[bool, httpx.Response | None]:
        """La persona se para frente al equipo. Si el equipo la deja pasar, sube la marcación."""
        user = self.users.get(pin)
        if user is None or not user.can_enter:
            return False, None
        # El equipo marca en su hora local (la que le dio el servidor en el handshake).
        when = when or datetime.now(ZoneInfo("America/Bogota")).replace(tzinfo=None)
        line = f"{pin}\t{when:%Y-%m-%d %H:%M:%S}\t0\t{verify}\t0\t0\t0"
        r = await self.client.post("/iclock/cdata", params=self._q(table="ATTLOG", Stamp="9999"), content=line)
        return True, r

    async def upload_users(self) -> httpx.Response:
        lines = []
        for u in self.users.values():
            lines.append(f"USER PIN={u.pin}\tName={u.name}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ={u.tz}")
            for fid in range(u.fingerprints):
                lines.append(f"FP PIN={u.pin}\tFID={fid}\tSize=4\tValid=1\tTMP=AAAA")
            if u.face:
                lines.append(f"BIODATA Pin={u.pin}\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tMajorVer=5\tTmp=AAAA")
        return await self.client.post("/iclock/cdata", params=self._q(table="OPERLOG", Stamp="1"), content="\n".join(lines))

    async def poll(self) -> list[str]:
        """Pide comandos, los ejecuta y responde. Devuelve los comandos recibidos."""
        r = await self.client.get("/iclock/getrequest", params=self._q())
        text = r.text.strip()
        if not text or text == "OK":
            return []
        replies, received, uploads = [], [], []
        for line in text.splitlines():
            if not line.startswith("C:"):
                continue
            _, wid, body = line.split(":", 2)
            received.append(body)
            ret = self._execute(body, uploads)
            verb = body.split(" ", 1)[0]
            replies.append(f"ID={wid}&Return={ret}&CMD={verb}")
        for table, content in uploads:
            await self.client.post("/iclock/cdata", params=self._q(table=table, Stamp="2"), content=content)
        await self.client.post("/iclock/devicecmd", params=self._q(), content="\n".join(replies))
        self.executed.extend(received)
        return received

    def _execute(self, body: str, uploads: list) -> int:
        verb, _, rest = body.partition(" ")
        fields = dict(p.split("=", 1) for p in rest.split("\t") if "=" in p)
        if body.startswith("DATA UPDATE USERINFO"):
            fields = dict(p.split("=", 1) for p in body[len("DATA UPDATE USERINFO "):].split("\t") if "=" in p)
            u = self.users.setdefault(fields["PIN"], EmuUser(pin=fields["PIN"]))
            u.name, u.tz = fields.get("Name", u.name), fields.get("TZ", u.tz)
            return 0
        if body.startswith("DATA DELETE USERINFO"):
            self.users.pop(body.split("PIN=", 1)[1].strip(), None)
            return 0
        if body.startswith("DATA DELETE FACE") or body.startswith("DATA DELETE FINGERTMP"):
            u = self.users.get(body.split("PIN=", 1)[1].strip())
            if u and "FACE" in body:
                u.face = False
            elif u:
                u.fingerprints = 0
            return 0
        if body.startswith("DATA QUERY USERINFO"):
            lines = [f"USER PIN={u.pin}\tName={u.name}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ={u.tz}" for u in self.users.values()]
            uploads.append(("OPERLOG", "\n".join(lines)))
            return 0
        if verb in ("ENROLL_FP", "ENROLL_BIO"):
            pin = fields.get("PIN")
            if pin not in self.users:
                return -1
            if not self.auto_enroll:
                return -2
            if verb == "ENROLL_FP" or fields.get("TYPE") == "1":
                self.users[pin].fingerprints += 1
                uploads.append(("OPERLOG", f"FP PIN={pin}\tFID={fields.get('FID', 0)}\tSize=4\tValid=1\tTMP=AAAA"))
            else:
                self.users[pin].face = True
                uploads.append(("OPERLOG", f"BIODATA Pin={pin}\tNo=0\tType=9\tValid=1\tTmp=AAAA"))
            return 0
        if body.startswith("DATA UPDATE BIOPHOTO"):
            pin = fields.get("PIN") or body.split("PIN=", 1)[1].split("\t", 1)[0]
            if pin in self.users:
                self.users[pin].face = True
                uploads.append(("OPERLOG", f"BIODATA Pin={pin}\tNo=0\tType=9\tValid=1\tTmp=AAAA"))
                return 0
            return -1
        if verb == "CONTROL":
            self.door_opens += 1
            return 0
        return 0


async def _loop(api: str, serial: str, seconds: int) -> None:
    """Equipo conectado de forma continua. Mientras el serial no esté
    registrado el servidor lo rechaza y se reintenta: así puede arrancar antes
    de que alguien cree el dispositivo (las pruebas e2e de CI)."""
    async with httpx.AsyncClient(base_url=api, timeout=10) as client:
        emu = ZkEmulator(client=client, serial=serial)
        for _ in range(seconds):
            try:
                await emu.handshake()
                got = await emu.poll()
                if got:
                    print("comandos", got, flush=True)
            except httpx.HTTPError as e:
                print("sin conexión:", type(e).__name__, flush=True)
            await asyncio.sleep(1)


async def _main() -> None:
    ap = argparse.ArgumentParser(description="Emulador ZKTeco ADMS para LSMFit")
    ap.add_argument("--api", required=True, help="URL base, ej. https://app.midominio.co")
    ap.add_argument("--sn", required=True, help="Número de serie registrado en Ajustes › Dispositivos")
    ap.add_argument("--users", default="", help="PINs (cédulas) que el equipo ya tiene, separados por coma")
    ap.add_argument("--punch", default="", help="PIN que marca entrada")
    ap.add_argument("--poll", action="store_true", help="Pedir y ejecutar comandos")
    ap.add_argument("--loop", type=int, default=0,
                    help="Segundos que se queda conectado como un equipo real (handshake y comandos cada segundo)")
    args = ap.parse_args()
    if args.loop:
        await _loop(args.api, args.sn, args.loop)
        return
    async with httpx.AsyncClient(base_url=args.api, timeout=20) as client:
        emu = ZkEmulator(client=client, serial=args.sn)
        for pin in filter(None, args.users.split(",")):
            emu.users[pin] = EmuUser(pin=pin, face=True)
        r = await emu.handshake()
        print("handshake", r.status_code, r.text.splitlines()[0] if r.text else "")
        if emu.users:
            print("usuarios", (await emu.upload_users()).text)
        if args.punch:
            ok, resp = await emu.punch(args.punch)
            print("ABRIR" if ok else "BLOQUEAR", resp.text if resp else "")
        if args.poll:
            print("comandos", await emu.poll())


if __name__ == "__main__":
    asyncio.run(_main())
