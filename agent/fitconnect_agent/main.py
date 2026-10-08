"""Ciclo del agente: comandos de la nube → equipo; marcaciones del equipo → nube.

Sin internet sigue leyendo el equipo y guarda las marcaciones en disco; las
sube cuando vuelve la conexión (la nube descarta duplicados por id de evento).
El equipo sigue decidiendo solo quién pasa, con la vigencia que tenía.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import httpx

from fitconnect_agent.cloud import Cloud
from fitconnect_agent.config import AgentConfig
from fitconnect_agent.drivers import make_driver
from fitconnect_agent.store import Store

log = logging.getLogger("fitconnect_agent")


class Agent:
    def __init__(self, cfg: AgentConfig, cloud: Cloud, driver, store: Store, config_path: Optional[Path] = None):
        self.cfg, self.cloud, self.driver, self.store = cfg, cloud, driver, store
        self.config_path = config_path
        self.online = True

    async def run_commands_once(self) -> int:
        try:
            commands = await self.cloud.commands()
        except httpx.HTTPError as exc:
            self._offline(exc)
            return 0
        self.online = True
        for cmd in commands:
            try:
                result = await self.driver.execute(cmd["kind"], cmd.get("payload") or {}, cmd.get("config") or {})
                await self.cloud.result(cmd["id"], True, result=result or None)
                if result.get("face"):
                    await self.cloud.template(str(cmd["payload"]["pin"]), "face")
                if result.get("fingerprint"):
                    await self.cloud.template(str(cmd["payload"]["pin"]), "fingerprint")
            except httpx.HTTPError as exc:
                self._offline(exc)
                return 0
            except Exception as exc:  # error del equipo: se reporta, no se reintenta en bucle
                log.warning("Comando %s falló: %s", cmd.get("kind"), exc)
                try:
                    await self.cloud.result(cmd["id"], False, error=str(exc))
                except httpx.HTTPError as http_exc:
                    self._offline(http_exc)
                    return 0
        return len(commands)

    async def read_events_once(self) -> int:
        since = datetime.fromisoformat(self.store.get("events_cursor") or (datetime.now() - timedelta(minutes=10)).isoformat())
        try:
            events, cursor = await self.driver.events_since(since)
        except Exception as exc:
            log.warning("No se pudo leer el equipo: %s", exc)
            return 0
        for ev in events:
            self.store.queue_punch(ev)
        self.store.set("events_cursor", cursor.isoformat())
        return await self.flush_punches()

    async def flush_punches(self) -> int:
        sent = 0
        while True:
            batch = self.store.pending_punches(500)
            if not batch:
                return sent
            try:
                await self.cloud.punches(batch)
            except httpx.HTTPError as exc:
                self._offline(exc)
                return sent
            self.store.drop_punches([b["client_event_id"] for b in batch])
            sent += len(batch)

    async def heartbeat(self) -> None:
        try:
            info = await self.cloud.heartbeat()
        except httpx.HTTPError as exc:
            self._offline(exc)
            return
        renewed = info.get("renewed_token")
        if renewed and self.config_path:
            raw = json.loads(self.config_path.read_text(encoding="utf-8"))
            raw["device_token"] = renewed
            self.config_path.write_text(json.dumps(raw, indent=2, ensure_ascii=False), encoding="utf-8")
            self.cloud.http.headers["Authorization"] = f"Bearer {renewed}"

    def _offline(self, exc: Exception) -> None:
        if self.online:
            log.warning("Sin conexión con FitConnect (%s): el equipo sigue funcionando y las marcaciones se guardan", exc)
        self.online = False

    async def run_forever(self) -> None:
        await self.heartbeat()
        last_events = last_beat = 0.0
        loop = asyncio.get_running_loop()
        while True:
            now = loop.time()
            await self.run_commands_once()
            if now - last_events >= self.cfg.events_seconds:
                await self.read_events_once()
                last_events = now
            if now - last_beat >= 300:
                await self.heartbeat()
                last_beat = now
            await asyncio.sleep(self.cfg.poll_seconds)


def cli() -> None:
    ap = argparse.ArgumentParser(description="Agente local de FitConnect para torniquetes")
    ap.add_argument("--config", default="fitconnect-agent.json")
    ap.add_argument("--check", action="store_true", help="Probar conexión con el equipo y la nube y salir")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    path = Path(args.config)
    cfg = AgentConfig.load(path)
    store = Store(cfg.data_dir)
    agent = Agent(cfg, Cloud(cfg.cloud_url, cfg.device_token), make_driver(cfg.device, store), store, path)

    async def check():
        users = await agent.driver.list_users()
        print(f"Equipo OK: {len(users)} usuarios")
        print("Nube OK:", (await agent.cloud.heartbeat()).get("device_name"))

    asyncio.run(check() if args.check else agent.run_forever())


if __name__ == "__main__":
    cli()
