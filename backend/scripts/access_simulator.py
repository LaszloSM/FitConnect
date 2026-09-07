"""Simulador de torniquete/lector: hace lo mismo que hará el agente del
hardware, contra la API real.

    python scripts/access_simulator.py --token <token de dispositivo> --id 1098765432
    python scripts/access_simulator.py --token ... --device-user 1098765432 --direction exit
    python scripts/access_simulator.py --token ... --loop        # modo interactivo (una cédula por línea)
    python scripts/access_simulator.py --token ... --offline evt.json   # reporta un lote offline
    python scripts/access_simulator.py --token ... --allowlist

El token se genera en Ajustes › Dispositivos (o POST /api/v1/kiosk/devices).
"""
import argparse
import json
import sys
import urllib.request
import urllib.error


def call(api: str, token: str, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{api}/api/v1{path}", data=data, method=method,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def verify(api, token, *, id_number=None, device_user=None, qr=None, direction="entry") -> None:
    body = {"direction": direction}
    if id_number:
        body["id_number"] = id_number
    if device_user:
        body["device_user_id"] = device_user
    if qr:
        body["qr_code"] = qr
    status, res = call(api, token, "POST", "/access/verify", body)
    if status != 200:
        print(f"[{status}] {res.get('detail')}")
        return
    relay = "ABRIR" if res["allow"] else "BLOQUEAR"
    print(f"{relay:9} {res['decision']:10} {res.get('member_name') or '-':30} {res['message']}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--api", default="http://localhost:8000")
    p.add_argument("--token", required=True)
    p.add_argument("--id", help="cédula")
    p.add_argument("--device-user", help="ID del usuario dentro del lector")
    p.add_argument("--qr")
    p.add_argument("--direction", default="entry", choices=["entry", "exit"])
    p.add_argument("--loop", action="store_true")
    p.add_argument("--offline", help="archivo JSON con lista de eventos offline")
    p.add_argument("--allowlist", action="store_true")
    p.add_argument("--heartbeat", action="store_true")
    a = p.parse_args()

    if a.heartbeat:
        print(call(a.api, a.token, "POST", "/access/heartbeat"))
        return
    if a.allowlist:
        print(json.dumps(call(a.api, a.token, "GET", "/access/allowlist")[1], indent=2, ensure_ascii=False))
        return
    if a.offline:
        events = json.load(open(a.offline, encoding="utf-8"))
        print(call(a.api, a.token, "POST", "/access/events", {"events": events}))
        return
    if a.loop:
        print("Simulador listo. Escribe una cédula (o 'salir'):")
        for line in sys.stdin:
            v = line.strip()
            if not v or v == "salir":
                break
            verify(a.api, a.token, id_number=v, direction=a.direction)
        return
    if not (a.id or a.device_user or a.qr):
        p.error("indica --id, --device-user o --qr")
    verify(a.api, a.token, id_number=a.id, device_user=a.device_user, qr=a.qr, direction=a.direction)


if __name__ == "__main__":
    main()
