"""Configuración del agente: un JSON en el PC de recepción.

Las credenciales del equipo (usuario y contraseña de Hikvision, clave de
comunicación de ZKTeco) viven SOLO aquí, nunca en la nube.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class DeviceConfig:
    driver: str  # hikvision | zk_tcp
    host: str
    port: int = 80
    username: str = "admin"
    password: str = ""
    door: int = 1
    https: bool = False
    comm_key: int = 0


@dataclass
class AgentConfig:
    cloud_url: str
    device_token: str
    device: DeviceConfig
    poll_seconds: float = 3.0
    events_seconds: float = 5.0
    data_dir: str = "fitconnect-agent-data"
    extra: dict = field(default_factory=dict)

    @classmethod
    def load(cls, path: str | Path) -> "AgentConfig":
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        device = DeviceConfig(**raw.pop("device"))
        known = {k: raw.pop(k) for k in list(raw) if k in cls.__dataclass_fields__}
        return cls(device=device, extra=raw, **known)
