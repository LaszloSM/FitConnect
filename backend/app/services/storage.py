"""Almacenamiento de objetos S3-compatible (MinIO en local, AWS S3 en prod).

El mismo código sirve para ambos: si `s3_endpoint_url` está vacío, boto3 habla
con AWS S3 real; si apunta a MinIO, habla con MinIO. Solo cambian env vars."""
import asyncio
import json
import logging

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None


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


def _ensure_bucket_sync() -> None:
    s3 = _s3()
    bucket = settings.s3_bucket
    try:
        s3.head_bucket(Bucket=bucket)
    except ClientError:
        s3.create_bucket(Bucket=bucket)
        # Lectura pública de objetos: las fotos se muestran en el admin y el kiosko.
        policy = {
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"AWS": ["*"]},
                "Action": ["s3:GetObject"],
                "Resource": [f"arn:aws:s3:::{bucket}/*"],
            }],
        }
        try:
            s3.put_bucket_policy(Bucket=bucket, Policy=json.dumps(policy))
        except ClientError as e:
            logger.warning("No se pudo aplicar bucket policy pública: %s", e)


def _public_url(key: str) -> str:
    base = settings.s3_public_url or settings.s3_endpoint_url
    if base:
        return f"{base.rstrip('/')}/{settings.s3_bucket}/{key}"
    return f"https://{settings.s3_bucket}.s3.{settings.s3_region}.amazonaws.com/{key}"


def _upload_sync(data: bytes, key: str, content_type: str) -> str:
    _ensure_bucket_sync()
    _s3().put_object(
        Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type,
    )
    return _public_url(key)


async def upload_image(data: bytes, key: str, content_type: str) -> str:
    """Sube bytes de imagen y devuelve su URL pública. boto3 es sync → a thread."""
    return await asyncio.to_thread(_upload_sync, data, key, content_type)
