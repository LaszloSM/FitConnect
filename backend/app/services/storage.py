"""Almacenamiento de objetos S3-compatible (MinIO en local, AWS S3 en prod).

El mismo código sirve para ambos: si `s3_endpoint_url` está vacío, boto3 habla
con AWS S3 real; si apunta a MinIO, habla con MinIO. Solo cambian env vars.

Privacidad: el bucket es privado. Solo el prefijo `gyms/` (logos, marca) es
público. Fotos de socios, comprobantes y QR de cuentas se guardan por su `key`
y se sirven con URLs firmadas de corta duración (`resolve_media_url`)."""
import asyncio
import json
import logging
from urllib.parse import urlparse

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None
_public_client = None
_policy_applied = False
PUBLIC_PREFIXES = ("gyms/", "exercises/")
SIGNED_URL_TTL = 15 * 60


def _s3():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            aws_access_key_id=settings.s3_access_key or None,
            aws_secret_access_key=settings.s3_secret_key or None,
            region_name=settings.s3_region,
            config=BotoConfig(signature_version="s3v4"),
        )
    return _client


def _public_policy(bucket: str) -> str:
    return json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"AWS": ["*"]},
            "Action": ["s3:GetObject"],
            "Resource": [f"arn:aws:s3:::{bucket}/{p}*" for p in PUBLIC_PREFIXES],
        }],
    })


def _s3_public():
    """Cliente que firma contra la URL pública: la firma SigV4 incluye el host,
    así que no se puede firmar contra minio:9000 y reescribir a localhost."""
    global _public_client
    if _public_client is None:
        endpoint = settings.s3_public_url or settings.s3_endpoint_url or None
        if not endpoint or endpoint == settings.s3_endpoint_url:
            return _s3()
        _public_client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=settings.s3_access_key or None,
            aws_secret_access_key=settings.s3_secret_key or None,
            region_name=settings.s3_region,
            config=BotoConfig(signature_version="s3v4"),
        )
    return _public_client


def _ensure_bucket_sync() -> None:
    global _policy_applied
    s3 = _s3()
    bucket = settings.s3_bucket
    try:
        s3.head_bucket(Bucket=bucket)
    except ClientError:
        s3.create_bucket(Bucket=bucket)
    if not _policy_applied:
        # Idempotente y en cada arranque: los buckets ya creados con la política
        # pública vieja pasan a ser privados salvo la marca del gym.
        try:
            s3.put_bucket_policy(Bucket=bucket, Policy=_public_policy(bucket))
            _policy_applied = True
        except ClientError as e:
            logger.warning("No se pudo aplicar bucket policy: %s", e)


def is_public_key(key: str) -> bool:
    return any(key.startswith(p) for p in PUBLIC_PREFIXES)


def public_url(key: str) -> str:
    base = settings.s3_public_url or settings.s3_endpoint_url
    if base:
        return f"{base.rstrip('/')}/{settings.s3_bucket}/{key}"
    return f"https://{settings.s3_bucket}.s3.{settings.s3_region}.amazonaws.com/{key}"


def key_from_url(value: str) -> str | None:
    """Extrae la key de una URL de nuestro propio bucket (legado: se guardaban
    URLs públicas completas). Devuelve None si no es del bucket."""
    try:
        path = urlparse(value).path
    except ValueError:
        return None
    marker = f"/{settings.s3_bucket}/"
    if marker in path:
        return path.split(marker, 1)[1]
    host = urlparse(value).netloc
    if host.startswith(f"{settings.s3_bucket}.s3"):
        return path.lstrip("/")
    return None


def _presign_sync(key: str, ttl: int) -> str:
    return _s3_public().generate_presigned_url(
        "get_object", Params={"Bucket": settings.s3_bucket, "Key": key}, ExpiresIn=ttl,
    )


def _delete_sync(key: str) -> None:
    _s3().delete_object(Bucket=settings.s3_bucket, Key=key)


async def delete_object(value: str | None) -> bool:
    """Borra el objeto (key o URL propia). Supresión real del dato, no solo del enlace."""
    if not value:
        return False
    key = value if not value.startswith("http") else key_from_url(value)
    if not key:
        return False
    try:
        await asyncio.to_thread(_delete_sync, key)
        return True
    except Exception as e:
        logger.warning("No se pudo borrar %s: %s", key, e)
        return False


def scoped_key(value: str | None, allowed_prefix: str) -> str | None:
    """Normaliza lo que llega del cliente para un campo de media: URL propia →
    key; solo se acepta una key dentro del prefijo del tenant. Cualquier otra
    cosa se descarta (nunca se firma un objeto de otro gym)."""
    if not value:
        return None
    key = value if not value.startswith("http") else key_from_url(value)
    if key is None:
        # URL externa (no de nuestro bucket): se conserva tal cual
        return value
    return key if key.startswith(allowed_prefix) else None


def resolve_media_url(value: str | None, ttl: int = SIGNED_URL_TTL) -> str | None:
    """Convierte lo guardado (key nueva o URL legada) en algo que el navegador
    pueda abrir: URL pública para prefijos públicos, firmada para el resto.
    URLs externas (no del bucket) pasan tal cual."""
    if not value:
        return value
    if value.startswith("http://") or value.startswith("https://"):
        key = key_from_url(value)
        if key is None:
            return value
    else:
        key = value
    if is_public_key(key):
        return public_url(key)
    try:
        return _presign_sync(key, ttl)
    except Exception:
        logger.warning("No se pudo firmar %s", key)
        return None


async def ensure_bucket() -> None:
    """Crea el bucket si falta y aplica la política pública restrictiva. Se
    llama al arrancar: un bucket creado por una versión anterior tenía
    `bucket/*` legible por cualquiera y debe cerrarse aunque nadie suba nada."""
    try:
        await asyncio.to_thread(_ensure_bucket_sync)
    except Exception as e:  # el arranque nunca depende del almacenamiento
        logger.warning("No se pudo preparar el bucket al arrancar: %s", e)


def _upload_sync(data: bytes, key: str, content_type: str) -> str:
    _ensure_bucket_sync()
    _s3().put_object(
        Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type,
    )
    return public_url(key) if is_public_key(key) else key


class StorageUnavailable(Exception):
    """El almacenamiento no respondió. Se traduce a un 503 con mensaje claro en vez
    de un 500 mudo: cuando MinIO estaba caído, el usuario veía un error genérico y
    el log no decía nada."""


async def upload_image(data: bytes, key: str, content_type: str) -> str:
    """Sube bytes y devuelve lo que se persiste: URL pública si el prefijo es
    público (marca), la key si es dato personal (se firma al leer)."""
    try:
        return await asyncio.to_thread(_upload_sync, data, key, content_type)
    except (BotoCoreError, ClientError) as e:
        logger.error("Fallo al subir %s al almacenamiento: %s", key, e)
        raise StorageUnavailable(
            "El almacenamiento de archivos no está disponible; intenta de nuevo en unos minutos"
        ) from e


def _download_sync(key: str, max_bytes: int) -> bytes:
    obj = _s3().get_object(Bucket=settings.s3_bucket, Key=key)
    body = obj["Body"].read(max_bytes + 1)
    if len(body) > max_bytes:
        raise ValueError("Archivo demasiado grande")
    return body


async def download_object(value: str | None, max_bytes: int = 2 * 1024 * 1024) -> bytes | None:
    """Bytes de un objeto propio (key o URL del bucket). None si no existe."""
    if not value:
        return None
    key = value if not value.startswith("http") else key_from_url(value)
    if not key:
        return None
    try:
        return await asyncio.to_thread(_download_sync, key, max_bytes)
    except Exception as e:
        logger.warning("No se pudo leer %s: %s", key, e)
        return None
