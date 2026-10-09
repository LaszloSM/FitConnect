"""Equipos ZKTeco SIN ADMS, por el protocolo TCP/UDP 4370 de la red local (pyzk).

Bloquear sin perder la biometría: este protocolo no tiene "deshabilitar", así
que al vencer se guardan las huellas del usuario EN EL PC DEL GIMNASIO (nunca
en la nube), se borra del equipo y, al renovar, se restauran tal cual.
El rostro de estos equipos no se puede respaldar por este protocolo: quien
tenga solo rostro deberá registrarlo de nuevo en el equipo tras renovar.
"""
from __future__ import annotations

import asyncio
import base64
from datetime import datetime

from fitconnect_agent.config import DeviceConfig


class ZkTcpError(Exception):
    pass


class ZkTcpDriver:
    def __init__(self, cfg: DeviceConfig, store=None, zk_factory=None):
        self.cfg = cfg
        self.store = store
        self._factory = zk_factory

    def _connect(self):
        if self._factory is not None:
            return self._factory()
        try:
            from zk import ZK  # pyzk
        except ImportError as exc:  # pragma: no cover
            raise ZkTcpError("Falta pyzk: instala el agente con la opción [zk]") from exc
        return ZK(self.cfg.host, port=self.cfg.port or 4370, timeout=10, password=self.cfg.comm_key).connect()

    async def _run(self, fn):
        def work():
            conn = self._connect()
            try:
                return fn(conn)
            finally:
                try:
                    conn.disconnect()
                except Exception:
                    pass
        return await asyncio.to_thread(work)

    async def close(self) -> None:
        return None

    async def execute(self, kind: str, payload: dict, config: dict) -> dict:
        handler = getattr(self, f"_cmd_{kind}", None)
        if handler is None:
            raise ZkTcpError(f"Este equipo no soporta «{kind}» por red local")
        return await handler(payload) or {}

    @staticmethod
    def _find(conn, pin: str):
        for u in conn.get_users():
            if str(u.user_id) == pin:
                return u
        return None

    async def _cmd_user_sync(self, p: dict) -> dict:
        pin, name, enabled = str(p["pin"]), (p.get("name") or "")[:24], bool(p.get("enabled"))

        def work(conn):
            user = self._find(conn, pin)
            if not enabled:
                if user is None:
                    return {"absent": True}
                fingers = [t for t in conn.get_templates() if t.uid == user.uid]
                if self.store is not None and fingers:
                    self.store.save_templates(pin, {
                        "name": user.name,
                        "fingers": [{"fid": t.fid, "valid": t.valid, "template": base64.b64encode(t.template).decode()}
                                    for t in fingers],
                    })
                conn.delete_user(uid=user.uid)
                return {"removed": True, "kept_fingers": len(fingers)}
            if user is None:
                uid = max((u.uid for u in conn.get_users()), default=0) + 1
                conn.set_user(uid=uid, name=name, privilege=0, user_id=pin)
                saved = self.store.pop_templates(pin) if self.store is not None else None
                if saved:
                    from zk.finger import Finger
                    from zk.user import User
                    u = User(uid, name, 0, "", "", pin, 0)
                    fingers = [Finger(uid, f["fid"], f["valid"], base64.b64decode(f["template"])) for f in saved["fingers"]]
                    conn.save_user_template(u, fingers)
                return {"created": True, "restored_fingers": len(saved["fingers"]) if saved else 0}
            if user.name != name:
                conn.set_user(uid=user.uid, name=name, privilege=user.privilege, user_id=pin)
            return {}
        return await self._run(work)

    async def _cmd_user_remove(self, p: dict) -> dict:
        pin = str(p["pin"])

        def work(conn):
            user = self._find(conn, pin)
            if user:
                conn.delete_user(uid=user.uid)
            if self.store is not None:
                self.store.pop_templates(pin)
            return {}
        return await self._run(work)

    async def _cmd_biometric_delete(self, p: dict) -> dict:
        if p.get("biometric") == "face":
            raise ZkTcpError("Borra el rostro desde el menú del equipo (este protocolo no lo permite)")
        pin = str(p["pin"])

        def work(conn):
            user = self._find(conn, pin)
            if user:
                for t in conn.get_templates():
                    if t.uid == user.uid:
                        conn.delete_user_template(uid=user.uid, temp_id=t.fid)
            if self.store is not None:
                self.store.pop_templates(pin)
            return {}
        return await self._run(work)

    async def _cmd_enroll_fingerprint(self, p: dict) -> dict:
        pin, finger = str(p["pin"]), int(p.get("finger", 0))

        def work(conn):
            user = self._find(conn, pin)
            if user is None:
                raise ZkTcpError("El usuario aún no está en el equipo")
            if not conn.enroll_user(uid=user.uid, temp_id=finger, user_id=pin):
                raise ZkTcpError("No se leyó la huella: repite poniendo el dedo tres veces")
            return {"fingerprint": True}
        return await self._run(work)

    async def _cmd_open_door(self, p: dict) -> dict:
        def work(conn):
            if not conn.unlock(time=3):
                raise ZkTcpError("El equipo no aceptó la orden de abrir")
            return {}
        return await self._run(work)

    async def _cmd_query_users(self, p: dict) -> dict:
        return {"users": await self.list_users()}

    async def list_users(self) -> list[dict]:
        def work(conn):
            fingers: dict[int, int] = {}
            for t in conn.get_templates():
                fingers[t.uid] = fingers.get(t.uid, 0) + 1
            return [{"pin": str(u.user_id), "name": u.name, "fingerprints": fingers.get(u.uid, 0),
                     "card": str(u.card or "") if getattr(u, "card", 0) else ""} for u in conn.get_users()]
        return await self._run(work)

    async def events_since(self, since: datetime) -> tuple[list[dict], datetime]:
        def work(conn):
            return conn.get_attendance()
        records = await self._run(work)
        tz = datetime.now().astimezone().tzinfo
        out, cursor = [], since
        for a in records:
            if a.timestamp <= since:
                continue
            cursor = max(cursor, a.timestamp)
            out.append({
                "client_event_id": f"zkt:{a.user_id}:{a.timestamp:%Y%m%d%H%M%S}",
                "device_user_id": str(a.user_id), "occurred_at": a.timestamp.replace(tzinfo=tz).isoformat(),
                "credential_kind": {1: "fingerprint", 15: "face", 4: "card", 0: "pin"}.get(getattr(a, "status", -1), "device"),
                "allowed": True,
            })
        return out, cursor


