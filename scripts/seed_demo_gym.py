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
    ap.add_argument("--gym", default=None, help="Nombre del gimnasio (por defecto «Gym Demo XXXX»)")
    ap.add_argument("--owner", default="Laszlo Demo", help="Nombre del dueño")
    ap.add_argument("--city", default="Bogotá")
    a = ap.parse_args()
    api = Api(a.api)
    suffix = uuid.uuid4().hex[:6]
    email = f"demo-{suffix}@demo.example.com"

    print("Creando gym...")
    api("POST", "/auth/register", {
        "email": email, "password": PASSWORD, "full_name": a.owner,
        "gym_name": a.gym or f"Gym Demo {suffix.upper()}", "city": a.city,
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
    usados = set()
    for i in range(24):
        nombre = f"{random.choice(NOMBRES)} {random.choice(APELLIDOS)}"
        while nombre in usados:
            nombre = f"{random.choice(NOMBRES)} {random.choice(APELLIDOS)}"
        usados.add(nombre)
        plan = random.choice(planes) if planes else None
        usuario = nombre.lower().translate(str.maketrans("áéíóú ", "aeiou."))
        cuerpo = {
            "full_name": nombre,
            "email": f"{usuario}{i}@ejemplo.co",
            "id_type": "CC", "id_number": str(1000000000 + random.randint(0, 899999999)),
            "phone": f"30{random.randint(10000000, 99999999)}",
            "birth_date": f"199{random.randint(0,9)}-0{random.randint(1,9)}-1{random.randint(0,9)}",
            "address": f"Calle {random.randint(10, 90)} # {random.randint(2, 60)}-{random.randint(10, 99)}", "city": a.city,
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
    catalogo = {
        "Bebidas": [("Agua 600 ml", 3000, 1400, 48, "BEB"), ("Bebida hidratante", 5500, 3100, 30, "BEB"), ("Café americano", 4000, 1200, 22, "BEB")],
        "Suplementos": [("Proteína en vaso", 12000, 6800, 18, "SUP"), ("Barra de proteína", 7000, 3900, 4, "SUP"), ("Creatina 300 g", 89000, 61000, 6, "SUP")],
        "Accesorios": [("Toalla LSMFit", 25000, 12000, 14, "ACC"), ("Guantes de entrenamiento", 38000, 21000, 2, "ACC"), ("Candado para locker", 18000, 9000, 9, "ACC")],
    }
    productos = []
    for categoria, items in catalogo.items():
        cat = api("POST", "/products/categories", {"name": categoria}, expect=(201, 409))
        for n, (nombre, precio, costo, stock, prefijo) in enumerate(items, start=1):
            p = api("POST", "/products", {
                "name": nombre, "price": precio, "cost_price": costo, "stock": stock, "low_stock_threshold": 5,
                "sku": f"{prefijo}-{n:03d}",
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

    print("Clases...")
    for nombre, profe, cat, dias, hora, cupo, color in [
        ("Spinning amanecer", "Diana Ruiz", "spinning", [0, 2, 4], "06:00", 18, "#F97316"),
        ("Funcional", "Jorge Pardo", "funcional", [0, 1, 2, 3, 4], "07:00", 20, "#3B82F6"),
        ("Yoga suave", "Marcela Ortiz", "yoga", [1, 3], "18:30", 15, "#22C55E"),
        ("Boxeo", "Jorge Pardo", "boxeo", [1, 3, 5], "19:00", 14, "#EF4444"),
        ("Zumba", "Diana Ruiz", "zumba", [5], "09:00", 25, "#A855F7"),
    ]:
        c = api("POST", "/classes", {
            "name": nombre, "instructor": profe, "category": cat, "weekdays": dias, "start_time": hora,
            "color": color, "max_capacity": cupo, "duration_minutes": 60, "difficulty": "intermediate",
        }, expect=(201,))
        if c:
            for m in random.sample(miembros, min(len(miembros), random.randint(4, 10))):
                api("POST", f"/classes/{c['id']}/enroll", {"member_id": m["id"]}, expect=(201, 400, 409, 422))

    print("Máquinas...")
    hoy = date.today()
    for nombre, area, marca, ultimo, cada in [
        ("Caminadora 1", "cardio", "Life Fitness", 20, 30), ("Caminadora 2", "cardio", "Life Fitness", 45, 30),
        ("Bicicleta de spinning", "cardio", "Schwinn", 10, 60), ("Prensa de pierna", "fuerza", "Hammer Strength", 70, 90),
        ("Polea alta", "fuerza", "Matrix", 25, 60), ("Rack de sentadilla", "peso_libre", "Rogue", 100, 180),
    ]:
        api("POST", "/machines", {
            "name": nombre, "area": area, "brand": marca,
            "last_maintenance_date": (hoy - timedelta(days=ultimo)).isoformat(), "maintenance_interval_days": cada,
        }, expect=(201,))

    print("Gastos de caja...")
    for categoria, concepto, valor in [("servicios", "Recibo de energía", 380000), ("insumos", "Productos de aseo", 65000)]:
        api("POST", "/cash/expenses", {"amount": valor, "category": categoria, "concept": concepto}, expect=(201, 400, 409))

    print("Dispositivos...")
    api("POST", "/kiosk/devices", {"name": "Tablet entrada", "kind": "kiosk"}, expect=(201,))
    api("POST", "/kiosk/devices", {"name": "TV salón", "kind": "screen"}, expect=(201,))

    print(f"\nListo.\n  email:    {email}\n  password: {PASSWORD}\n  app:      http://localhost:3000/login")


if __name__ == "__main__":
    main()
