"""Terminales Hikvision (MinMoe DS-K1T...) por ISAPI en la red local.

- Usuario y vigencia: ``UserInfo/SetUp`` con ``Valid`` (el equipo niega solo
  cuando vence, aunque no haya internet). Bloquear = vigencia vencida: el
  rostro y la huella se conservan.
- Rostro: captura en el equipo (``CaptureFaceData``) o foto de la ficha, y
  alta en la biblioteca de rostros (``FDLib/FaceDataRecord``).
- Huella: captura en el lector del equipo (``CaptureFingerPrint``) y alta
  (``FingerPrintDownload``). La huella solo pasa por la memoria del agente.
- Marcaciones: búsqueda de ``AcsEvent`` desde el último cursor.
- Puerta: ``RemoteControl/door/{n}``.

Los cuerpos siguen la guía ISAPI de control de acceso; lo que cambia entre
firmwares (XML vs JSON) se intenta en ese orden.
"""
from __future__ import annotations

import base64
import json
import re
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Optional

import httpx

from fitconnect_agent.config import DeviceConfig

NS = 'version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"'
# Minor de eventos de acceso (major 5) que significan "dejó pasar".
PASS_MINORS = {1: "card", 38: "fingerprint", 75: "face", 104: "face", 105: "face"}
DENY_MINORS = {76: "face", 39: "fingerprint", 9: "card", 6: "card"}


class HikvisionError(Exception):
    pass


class HikvisionDriver:
    def __init__(self, cfg: DeviceConfig, transport: Optional[httpx.AsyncBaseTransport] = None):
        scheme = "https" if cfg.https else "http"
        self.cfg = cfg
        self.http = httpx.AsyncClient(
            base_url=f"{scheme}://{cfg.host}:{cfg.port}", timeout=30, verify=False,
            auth=httpx.DigestAuth(cfg.username, cfg.password), transport=transport,
        )

    async def close(self) -> None:
        await self.http.aclose()

    # ─── utilidades ───
    async def _json(self, method: str, path: str, body: Any = None, ok_sub: tuple = ()) -> dict:
        r = await self.http.request(method, path, json=body)
        data: dict = {}
        try:
            data = r.json()
        except ValueError:
            pass
        if r.status_code >= 400 or (data.get("statusCode") not in (None, 1)):
            sub = data.get("subStatusCode")
            if sub in ok_sub:
                return data
            raise HikvisionError(f"{path}: {r.status_code} {sub or data.get('statusString') or r.text[:200]}")
        return data

    async def device_info(self) -> str:
        r = await self.http.get("/ISAPI/System/deviceInfo")
        r.raise_for_status()
        return r.text

    # ─── comandos de FitConnect ───
    async def execute(self, kind: str, payload: dict, config: dict) -> dict:
        handler = getattr(self, f"_cmd_{kind}", None)
        if handler is None:
            raise HikvisionError(f"Comando no soportado: {kind}")
        return await handler(payload, config) or {}

    async def _cmd_user_sync(self, p: dict, config: dict) -> dict:
        today = date.today()
        begin = p.get("valid_from") or (today - timedelta(days=1)).isoformat()
        if p.get("enabled") and p.get("valid_until"):
            end = f"{p['valid_until']}T23:59:59"
        elif p.get("enabled"):
            end = "2037-12-31T23:59:59"
        else:
            # Bloqueado: vigencia vencida ayer. El rostro y la huella se quedan en el equipo.
            end = f"{(today - timedelta(days=1)).isoformat()}T23:59:59"
            begin = min(begin, (today - timedelta(days=2)).isoformat())
        body = {"UserInfo": {
            "employeeNo": str(p["pin"]), "name": (p.get("name") or "")[:32], "userType": "normal",
            "Valid": {"enable": True, "beginTime": f"{begin}T00:00:00", "endTime": end, "timeType": "local"},
            "doorRight": str(self.cfg.door), "RightPlan": [{"doorNo": self.cfg.door, "planTemplateNo": "1"}],
        }}
        await self._json("PUT", "/ISAPI/AccessControl/UserInfo/SetUp?format=json", body)
        return {}

    async def _cmd_user_remove(self, p: dict, config: dict) -> dict:
        await self._json("PUT", "/ISAPI/AccessControl/UserInfo/Delete?format=json",
                         {"UserInfoDelCond": {"EmployeeNoList": [{"employeeNo": str(p["pin"])}]}})
        return {}

    async def _upload_face(self, pin: str, jpeg: bytes) -> None:
        meta = json.dumps({"faceLibType": "blackFD", "FDID": "1", "FPID": pin})
        r = await self.http.post(
            "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
            files={"FaceDataRecord": (None, meta, "application/json"), "FaceImage": ("face.jpg", jpeg, "image/jpeg")},
        )
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if r.status_code >= 400 or data.get("statusCode") not in (None, 1):
            if data.get("subStatusCode") in ("deviceUserAlreadyExistFace", "faceDataExist"):
                # Ya tenía rostro: se reemplaza.
                await self._json("PUT", "/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json&FDID=1&faceLibType=blackFD",
                                 {"FPID": [{"value": pin}]})
                return await self._upload_face(pin, jpeg)
            raise HikvisionError(f"Rostro no aceptado: {data.get('subStatusCode') or r.text[:200]}")

    async def _cmd_face_photo(self, p: dict, config: dict) -> dict:
        await self._upload_face(str(p["pin"]), base64.b64decode(p["content_b64"]))
        return {"face": True}

    async def _cmd_enroll_face(self, p: dict, config: dict) -> dict:
        """El equipo toma la foto de quien está al frente y se guarda como su rostro."""
        xml = f'<CaptureFaceDataCond {NS}><captureInfrared>false</captureInfrared><dataType>binary</dataType></CaptureFaceDataCond>'
        r = await self.http.post("/ISAPI/AccessControl/CaptureFaceData", content=xml,
                                 headers={"Content-Type": "application/xml"}, timeout=60)
        if r.status_code >= 400:
            raise HikvisionError(f"El equipo no pudo capturar el rostro ({r.status_code})")
        jpeg = _extract_jpeg(r.content)
        if jpeg is None:
            url = re.search(rb"<faceDataUrl>(.*?)</faceDataUrl>", r.content)
            if url:
                img = await self.http.get(url.group(1).decode())
                jpeg = _extract_jpeg(img.content)
        if jpeg is None:
            raise HikvisionError("El equipo no devolvió una foto del rostro: pide a la persona acercarse y repite")
        await self._upload_face(str(p["pin"]), jpeg)
        return {"face": True}

    async def _cmd_enroll_fingerprint(self, p: dict, config: dict) -> dict:
        finger = int(p.get("finger", 0)) + 1
        xml = f"<CaptureFingerPrintCond {NS}><fingerNo>{finger}</fingerNo></CaptureFingerPrintCond>"
        r = await self.http.post("/ISAPI/AccessControl/CaptureFingerPrint", content=xml,
                                 headers={"Content-Type": "application/xml"}, timeout=60)
        m = re.search(rb"<fingerData>(.*?)</fingerData>", r.content, re.S)
        if r.status_code >= 400 or not m:
            raise HikvisionError("No se leyó la huella: pide poner el dedo de nuevo en el lector del equipo")
        body = {"FingerPrintCfg": {
            "employeeNo": str(p["pin"]), "enableCardReader": [1], "fingerPrintID": finger,
            "fingerType": "normalFP", "fingerData": m.group(1).decode().strip(),
        }}
        await self._json("POST", "/ISAPI/AccessControl/FingerPrintDownload?format=json", body)
        return {"fingerprint": True}

    async def _cmd_biometric_delete(self, p: dict, config: dict) -> dict:
        pin = str(p["pin"])
        if p.get("biometric") == "face":
            await self._json("PUT", "/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json&FDID=1&faceLibType=blackFD",
                             {"FPID": [{"value": pin}]})
        else:
            await self._json("PUT", "/ISAPI/AccessControl/FingerPrint/Delete?format=json",
                             {"FingerPrintDelete": {"mode": "byEmployeeNo", "EmployeeNoDetail": {"employeeNo": pin}}})
        return {}

    async def _cmd_open_door(self, p: dict, config: dict) -> dict:
        door = int(p.get("door") or self.cfg.door)
        xml = "<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>"
        r = await self.http.put(f"/ISAPI/AccessControl/RemoteControl/door/{door}", content=xml,
                                headers={"Content-Type": "application/xml"})
        if r.status_code >= 400:
            await self._json("PUT", f"/ISAPI/AccessControl/RemoteControl/door/{door}?format=json",
                             {"RemoteControlDoor": {"cmd": "open"}})
        return {}

    async def _cmd_query_users(self, p: dict, config: dict) -> dict:
        return {"users": await self.list_users()}

    async def list_users(self) -> list[dict]:
        users, pos, search_id = [], 0, uuid.uuid4().hex
        while True:
            data = await self._json("POST", "/ISAPI/AccessControl/UserInfo/Search?format=json", {
                "UserInfoSearchCond": {"searchID": search_id, "searchResultPosition": pos, "maxResults": 30},
            })
            res = data.get("UserInfoSearch", {})
            batch = res.get("UserInfo") or []
            for u in batch:
                users.append({
                    "pin": str(u.get("employeeNo")), "name": u.get("name"),
                    "has_face": bool(u.get("numOfFace")), "fingerprints": int(u.get("numOfFP") or 0),
                    "card": "1" if u.get("numOfCard") else "",
                })
            pos += len(batch)
            if not batch or res.get("responseStatusStrg") != "MORE" or len(users) >= 20000:
                return users

    # ─── marcaciones ───
    async def events_since(self, since: datetime) -> tuple[list[dict], datetime]:
        """Eventos de acceso desde ``since`` (hora local del equipo). Devuelve
        (marcaciones para la nube, nuevo cursor)."""
        out, pos, cursor = [], 0, since
        end = datetime.now() + timedelta(minutes=1)
        search_id = uuid.uuid4().hex
        while True:
            data = await self._json("POST", "/ISAPI/AccessControl/AcsEvent?format=json", {"AcsEventCond": {
                "searchID": search_id, "searchResultPosition": pos, "maxResults": 30, "major": 5, "minor": 0,
                "startTime": since.strftime("%Y-%m-%dT%H:%M:%S"), "endTime": end.strftime("%Y-%m-%dT%H:%M:%S"),
            }})
            res = data.get("AcsEvent", {})
            batch = res.get("InfoList") or []
            for ev in batch:
                minor = int(ev.get("minor") or 0)
                pin = str(ev.get("employeeNoString") or ev.get("employeeNo") or "").strip()
                if not pin or (minor not in PASS_MINORS and minor not in DENY_MINORS):
                    continue
                when = datetime.fromisoformat(ev["time"])
                if when.tzinfo is None:
                    # Sin zona: es la hora local del PC/equipo, no UTC.
                    when = when.replace(tzinfo=datetime.now().astimezone().tzinfo)
                cursor = max(cursor, when.replace(tzinfo=None))
                out.append({
                    "client_event_id": f"hik:{ev.get('serialNo') or ''}:{pin}:{ev['time']}"[:64],
                    "device_user_id": pin, "occurred_at": when.isoformat(),
                    "credential_kind": PASS_MINORS.get(minor) or DENY_MINORS.get(minor, "device"),
                    "allowed": minor in PASS_MINORS,
                })
            pos += len(batch)
            if not batch or res.get("responseStatusStrg") != "MORE":
                return out, cursor + timedelta(seconds=1)


def _extract_jpeg(blob: bytes) -> Optional[bytes]:
    start = blob.find(b"\xff\xd8")
    stop = blob.rfind(b"\xff\xd9")
    if start == -1 or stop == -1 or stop <= start:
        return None
    return blob[start:stop + 2]
