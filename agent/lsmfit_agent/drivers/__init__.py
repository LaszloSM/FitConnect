"""Drivers por marca. Todos exponen: execute(kind, payload, config), list_users(),
events_since(since) y close()."""
from __future__ import annotations

from lsmfit_agent.config import DeviceConfig


def make_driver(cfg: DeviceConfig, store=None):
    if cfg.driver == "hikvision":
        from lsmfit_agent.drivers.hikvision import HikvisionDriver
        return HikvisionDriver(cfg)
    if cfg.driver == "zk_tcp":
        from lsmfit_agent.drivers.zk_tcp import ZkTcpDriver
        return ZkTcpDriver(cfg, store)
    raise ValueError(f"Driver desconocido: {cfg.driver} (usa hikvision o zk_tcp)")
