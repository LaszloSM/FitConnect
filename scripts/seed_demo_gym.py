#!/usr/bin/env python3
"""Crea un gym con datos realistas para QA manual y capturas.

    python scripts/seed_demo_gym.py [--api http://localhost:8000]

Imprime el email y la contraseña al final. Idempotente en el sentido de que
cada corrida crea un gym nuevo con sufijo aleatorio, así que nunca choca.
"""
import argparse
import json
import random
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date, timedelta

PASSWORD = "DemoGym123!"
NOMBRES = ["Ana", "Carlos", "Lucía", "Andrés", "Valentina", "Julián", "Camila", "Mateo", "Daniela", "Sebastián",
           "Paula", "Felipe", "Mariana", "Santiago", "Isabella", "Nicolás", "Sofía", "Tomás"]
APELLIDOS = ["Ramírez", "Gómez", "Torres", "Rojas", "Castro", "Mendoza", "Vargas", "Pineda", "Salazar", "Correa"]


class Api:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.token = None

    def __call__(self, method, path, body=None, expect=(200, 201)):
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(f"{self.base}/api/v1{path}", data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            payload = e.read().decode(errors="ignore")
            if e.code not in expect:
                print(f"  ! {method} {path} -> {e.code} {payload[:180]}")
            return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8000")
    a = ap.parse_args()
    api = Api(a.api)
    suffix = uuid.uuid4().hex[:6]
    email = f"demo-{suffix}@fitconnect.co"

    print("Creando gym...")
    api("POST", "/auth/register", {
        "email": email, "password": PASSWORD, "full_name": "Laszlo Demo",
        "gym_name": f"Gym Demo {suffix.upper()}", "city": "Bogotá",
    }, expect=(201,))
    login = api("POST", "/auth/login", {"email": email, "password": PASSWORD})
    if not login:
        sys.exit("No se pudo entrar; ¿está arriba el backend?")
    api.token = login["access_token"]

    # Turnos de caja desactivados: el objetivo es tener datos, no simular caja
    api("PATCH", "/settings/operations", {"cash_shifts_enabled": False})

    print("Planes...")
    planes = []
    for nombre, precio, dias in [("Mensual", 90000, 30), ("Trimestral", 240000, 90), ("Anual", 800000, 365)]:
        p = api("POST", "/member-plans/", {"name": nombre, "price": precio, "duration_days": dias})
        if p:
            planes.append(p)

    print("Socios...")
    miembros = []
    for i in range(24):
        nombre = f"{random.choice(NOMBRES)} {random.choice(APELLIDOS)}"
        plan = random.choice(planes) if planes else None
        cuerpo = {
            "full_name": nombre,
            "email": f"socio{i}-{suffix}@demo.co",
            "id_type": "CC", "id_number": str(1000000000 + random.randint(0, 899999999)),
            "phone": f"30{random.randint(10000000, 99999999)}",
            "birth_date": f"199{random.randint(0,9)}-0{random.randint(1,9)}-1{random.randint(0,9)}",
            "address": "Calle 1 # 2-33", "city": "Bogotá",
            "emergency_contact_name": "Contacto", "emergency_contact_phone": "3009998877",
            "parq_answers": {f"q{n}": False for n in range(1, 8)},
            "parq_completed_at": date.today().isoformat(),
            "consent_data": True,
        }
        if plan:
            cuerpo["plan_id"] = plan["id"]
        m = api("POST", "/members", cuerpo, expect=(201,))
        if m:
            miembros.append(m)
    print(f"  {len(miembros)} socios")

    print("Check-ins...")
    for m in miembros[:16]:
        api("POST", "/checkins", {"member_id": m["id"]}, expect=(200, 201, 400, 409))

    print("Productos e inventario...")
    cat = api("POST", "/products/categories", {"name": f"Bebidas {suffix}"}, expect=(201, 409))
    productos = []
    for nombre, precio, costo in [("Agua 600ml", 3000, 1500), ("Proteína vaso", 12000, 7000), ("Barra energética", 6000, 3200)]:
        p = api("POST", "/products", {
            "name": nombre, "price": precio, "cost_price": costo, "stock": 40,
            "sku": f"{nombre[:3].upper()}-{suffix}",
            **({"category_id": cat["id"]} if cat and cat.get("id") else {}),
        }, expect=(201,))
        if p:
            productos.append(p)

    print("Tipos de pase y ventas...")
    tipo = api("POST", "/day-passes/types", {"name": "Pase del día", "price": 15000}, expect=(201,))
    tipo_ent = api("POST", "/day-passes/types", {"name": "Pase con entrenador", "price": 30000, "includes_trainer": True}, expect=(201,))
    for i in range(6):
        t = random.choice([x for x in (tipo, tipo_ent) if x])
        api("POST", "/day-passes/sell", {
            "id_number": str(1200000000 + random.randint(0, 89999999)),
            "full_name": f"{random.choice(NOMBRES)} Visitante",
            "pass_type_id": t["id"], "method": random.choice(["cash", "transfer"]),
        }, expect=(201,))

    print("Ventas de productos...")
    for _ in range(8):
        if not productos:
            break
        p = random.choice(productos)
        api("POST", "/payments", {
            "amount": p["price"], "method": random.choice(["cash", "card", "transfer"]),
            "concept": f"Venta {p['name']}", "kind": "product",
            "items": [{"product_id": p["id"], "quantity": 1}],
        }, expect=(201,))

    print("Rutina de ejemplo...")
    ejercicios = api("GET", "/exercises?q=press&limit=3") or []
    if len(ejercicios) >= 2:
        r = api("POST", "/routines", {
            "name": "Full body 3 días", "goal": "hipertrofia", "level": "beginner",
            "is_public_on_screen": True, "is_active": True,
            "days": [{
                "title": "Día 1 · Empuje", "notes": None,
                "exercises": [{"exercise_id": e["id"], "sets": 4, "reps": "8-10", "rest_seconds": 90, "notes": None}
                              for e in ejercicios[:2]],
            }],
        }, expect=(201,))
        if r and miembros:
            api("POST", f"/members/{miembros[0]['id']}/routines", {"routine_id": r["id"]}, expect=(201,))

    print("Dispositivos...")
    api("POST", "/kiosk/devices", {"name": "Tablet entrada", "kind": "kiosk"}, expect=(201,))
    api("POST", "/kiosk/devices", {"name": "TV salón", "kind": "screen"}, expect=(201,))

    print(f"\nListo.\n  email:    {email}\n  password: {PASSWORD}\n  app:      http://localhost:3000/login")


if __name__ == "__main__":
    main()
