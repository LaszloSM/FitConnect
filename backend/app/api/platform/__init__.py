"""API del panel de plataforma (admin.<dominio>): quien administra LSMFit.

Separada de la API de los gimnasios: otro prefijo, otra llave de tokens, 2FA
obligatorio y lista de IPs. Nunca expone datos de socios: solo metadatos y
cifras agregadas de cada gimnasio.
"""
from fastapi import APIRouter

from app.api.platform import auth, tenants

router = APIRouter(prefix="/api/platform")
router.include_router(auth.router)
router.include_router(tenants.router)
