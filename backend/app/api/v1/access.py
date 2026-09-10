"""API de control de acceso.

- /access/*: la llama el dispositivo (torniquete, lector, agente local) con su
  token de dispositivo (mismo mecanismo que el kiosko).
- /members/{id}/credentials y /biometric-consents: el staff enrola/revoca.
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_kiosk_db, get_kiosk_payload, get_tenant_db_from_token, get_current_staff, require_perm
from app.core import permissions as perm
from app.core.rate_limit import limiter
from app.core.security import create_kiosk_token
from app.core.timeutil import utcnow_naive
from app.models.tenant.access import AccessEvent, BiometricConsent, MemberCredential, BIOMETRIC_KINDS
from app.models.tenant.kiosk_device import KioskDevice
from app.models.tenant.member import Member
from app.models.tenant.user_staff import UserStaff
from app.services.audit import audit
from app.services.access import verify_access, record_offline_events, allowlist

router = APIRouter(prefix="/access", tags=["access"])
member_router = APIRouter(tags=["access"])

CONSENT_TEXT_VERSION = "2026-09-v1"


async def _device(db: AsyncSession, token: dict) -> KioskDevice:
    device = (await db.execute(select(KioskDevice).where(KioskDevice.id == token["device_id"]))).scalar_one_or_none()
    if not device or not device.is_active:
        raise HTTPException(status_code=401, detail="Dispositivo desactivado")
    device.last_seen_at = utcnow_naive()
    return device


# ─── Dispositivo ───

class VerifyRequest(BaseModel):
    id_number: Optional[str] = Field(default=None, max_length=50)
    qr_code: Optional[str] = Field(default=None, max_length=64)
    device_user_id: Optional[str] = Field(default=None, max_length=64)
    direction: Literal["entry", "exit"] = "entry"

    @model_validator(mode="after")
    def one_credential(self):
        if not (self.id_number or self.qr_code or self.device_user_id):
            raise ValueError("Se requiere id_number, qr_code o device_user_id")
        return self


@router.post("/verify")
@limiter.limit("120/minute")
async def access_verify(
    request: Request,
    payload: VerifyRequest,
    db: AsyncSession = Depends(get_kiosk_db),
    token: dict = Depends(get_kiosk_payload),
):
    device = await _device(db, token)
    decision = await verify_access(
        db, device, id_number=payload.id_number, qr_code=payload.qr_code, device_user_id=payload.device_user_id,
        direction=payload.direction, db_name=token["db_name"],
    )
    await db.commit()
    return decision.as_dict()


@router.post("/heartbeat")
async def access_heartbeat(
    db: AsyncSession = Depends(get_kiosk_db),
    token: dict = Depends(get_kiosk_payload),
):
    device = await _device(db, token)
    await db.commit()
    resp = {"ok": True, "device_name": device.name, "kind": device.kind, "offline_policy": device.offline_policy,
            "config": device.config or {}}
    exp = token.get("exp")
    if exp and datetime.fromtimestamp(exp, tz=timezone.utc) - datetime.now(timezone.utc) < timedelta(days=7):
        resp["renewed_token"] = create_kiosk_token(token["device_id"], token["db_name"], token["jti"])
    return resp


class OfflineEvent(BaseModel):
    client_event_id: str = Field(min_length=1, max_length=64)
    occurred_at: datetime
    decision: Literal["allowed", "denied"]
    direction: Literal["entry", "exit"] = "entry"
    reason: Optional[str] = Field(default=None, max_length=40)
    id_number: Optional[str] = Field(default=None, max_length=50)
    qr_code: Optional[str] = Field(default=None, max_length=64)
    device_user_id: Optional[str] = Field(default=None, max_length=64)


class OfflineBatch(BaseModel):
    events: list[OfflineEvent] = Field(min_length=1, max_length=500)


@router.post("/events")
async def access_offline_events(
    payload: OfflineBatch,
    db: AsyncSession = Depends(get_kiosk_db),
    token: dict = Depends(get_kiosk_payload),
):
    device = await _device(db, token)
    events = []
    for e in payload.events:
        d = e.model_dump()
        occ = d["occurred_at"]
        d["occurred_at"] = occ.astimezone(timezone.utc).replace(tzinfo=None) if occ.tzinfo else occ
        events.append(d)
    result = await record_offline_events(db, device, events)
    await db.commit()
    return result


@router.get("/allowlist")
async def access_allowlist(
    hours: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_kiosk_db),
    token: dict = Depends(get_kiosk_payload),
):
    device = await _device(db, token)
    if device.offline_policy != "allow_recent":
        return {"policy": device.offline_policy, "members": []}
    members = await allowlist(db, hours)
    await db.commit()
    return {"policy": device.offline_policy, "hours": hours, "members": members}


# ─── Staff: bitácora ───

@router.get("/events/recent", dependencies=[Depends(require_perm(perm.ACCESS_VALIDATE))])
async def recent_access_events(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    device_id: Optional[uuid.UUID] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    stmt = (
        select(AccessEvent, Member.full_name, KioskDevice.name)
        .outerjoin(Member, Member.id == AccessEvent.member_id)
        .outerjoin(KioskDevice, KioskDevice.id == AccessEvent.device_id)
        .order_by(desc(AccessEvent.occurred_at)).limit(limit)
    )
    if device_id:
        stmt = stmt.where(AccessEvent.device_id == device_id)
    rows = (await db.execute(stmt)).all()
    return [
        {"id": str(ev.id), "device_id": str(ev.device_id) if ev.device_id else None, "device_name": dname,
         "member_id": str(ev.member_id) if ev.member_id else None, "member_name": mname,
         "credential_kind": ev.credential_kind, "credential_ref": ev.credential_ref, "direction": ev.direction,
         "decision": ev.decision, "reason": ev.reason, "offline": ev.offline, "occurred_at": ev.occurred_at}
        for ev, mname, dname in rows
    ]


# ─── Staff: consentimiento biométrico y credenciales por socio ───

async def _member_or_404(db: AsyncSession, member_id: uuid.UUID) -> Member:
    member = (await db.execute(select(Member).where(Member.id == member_id))).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    return member


def _consent_out(c: BiometricConsent) -> dict:
    return {"id": str(c.id), "kind": c.kind, "text_version": c.text_version, "signature_method": c.signature_method,
            "signed_at": c.signed_at, "revoked_at": c.revoked_at, "has_document": bool(c.document_key)}


def _credential_out(c: MemberCredential, device_name: str | None = None) -> dict:
    return {"id": str(c.id), "kind": c.kind, "device_user_id": c.device_user_id, "label": c.label,
            "device_id": str(c.device_id) if c.device_id else None, "device_name": device_name,
            "consent_id": str(c.consent_id) if c.consent_id else None, "enrolled_at": c.enrolled_at, "revoked_at": c.revoked_at}


class ConsentIn(BaseModel):
    kind: Literal["fingerprint", "face"]
    signature_method: Literal["checkbox", "photo_of_form"] = "checkbox"
    accepted: bool = True

    @model_validator(mode="after")
    def must_accept(self):
        if not self.accepted:
            raise ValueError("El consentimiento debe estar aceptado")
        return self


@member_router.get("/members/{member_id}/access", dependencies=[Depends(require_perm(perm.ACCESS_VALIDATE))])
async def member_access(member_id: uuid.UUID, db: AsyncSession = Depends(get_tenant_db_from_token)):
    await _member_or_404(db, member_id)
    consents = (await db.execute(
        select(BiometricConsent).where(BiometricConsent.member_id == member_id).order_by(desc(BiometricConsent.signed_at))
    )).scalars().all()
    creds = (await db.execute(
        select(MemberCredential, KioskDevice.name).outerjoin(KioskDevice, KioskDevice.id == MemberCredential.device_id)
        .where(MemberCredential.member_id == member_id).order_by(desc(MemberCredential.enrolled_at))
    )).all()
    events = (await db.execute(
        select(AccessEvent, KioskDevice.name).outerjoin(KioskDevice, KioskDevice.id == AccessEvent.device_id)
        .where(AccessEvent.member_id == member_id).order_by(desc(AccessEvent.occurred_at)).limit(20)
    )).all()
    return {
        "consents": [_consent_out(c) for c in consents],
        "credentials": [_credential_out(c, n) for c, n in creds],
        "events": [{"id": str(ev.id), "device_name": n, "credential_kind": ev.credential_kind, "direction": ev.direction,
                    "decision": ev.decision, "reason": ev.reason, "offline": ev.offline, "occurred_at": ev.occurred_at}
                   for ev, n in events],
        "consent_text_version": CONSENT_TEXT_VERSION,
    }


@member_router.post("/members/{member_id}/biometric-consents", status_code=201)
async def create_biometric_consent(
    member_id: uuid.UUID,
    payload: ConsentIn,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_perm(perm.CONSENT_WRITE)),
):
    await _member_or_404(db, member_id)
    active = (await db.execute(select(BiometricConsent).where(
        BiometricConsent.member_id == member_id, BiometricConsent.kind == payload.kind, BiometricConsent.revoked_at.is_(None)
    ))).scalar_one_or_none()
    if active:
        return _consent_out(active)
    consent = BiometricConsent(member_id=member_id, kind=payload.kind, text_version=CONSENT_TEXT_VERSION,
                               signature_method=payload.signature_method, signed_by_staff=current_user.id)
    db.add(consent)
    audit(db, current_user, "biometric_consent.sign", "member", member_id, {"kind": payload.kind, "version": CONSENT_TEXT_VERSION})
    await db.commit()
    await db.refresh(consent)
    return _consent_out(consent)


@member_router.delete("/members/{member_id}/biometric-consents/{consent_id}")
async def revoke_biometric_consent(
    member_id: uuid.UUID,
    consent_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_perm(perm.CONSENT_WRITE)),
):
    consent = (await db.execute(select(BiometricConsent).where(
        BiometricConsent.id == consent_id, BiometricConsent.member_id == member_id
    ))).scalar_one_or_none()
    if not consent:
        raise HTTPException(status_code=404, detail="Consentimiento no encontrado")
    now = utcnow_naive()
    if consent.revoked_at is None:
        consent.revoked_at, consent.revoked_by = now, current_user.id
    # Sin consentimiento no puede quedar ninguna credencial biométrica de ese tipo activa
    creds = (await db.execute(select(MemberCredential).where(
        MemberCredential.member_id == member_id, MemberCredential.kind == consent.kind, MemberCredential.revoked_at.is_(None)
    ))).scalars().all()
    for c in creds:
        c.revoked_at, c.revoked_by = now, current_user.id
    audit(db, current_user, "biometric_consent.revoke", "member", member_id, {"kind": consent.kind, "credentials_revoked": len(creds)})
    await db.commit()
    return {"revoked": True, "credentials_revoked": len(creds)}


class CredentialIn(BaseModel):
    kind: Literal["fingerprint", "face", "card", "pin"]
    device_user_id: str = Field(min_length=1, max_length=64)
    device_id: Optional[uuid.UUID] = None
    label: Optional[str] = Field(default=None, max_length=80)


@member_router.post("/members/{member_id}/credentials", status_code=201)
async def enroll_credential(
    member_id: uuid.UUID,
    payload: CredentialIn,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_perm(perm.CREDENTIALS_WRITE)),
):
    await _member_or_404(db, member_id)
    consent_id = None
    mine = (await db.execute(select(MemberCredential).where(
        MemberCredential.member_id == member_id, MemberCredential.kind == payload.kind,
        MemberCredential.device_user_id == payload.device_user_id.strip(), MemberCredential.revoked_at.is_(None),
    ))).scalars().first()
    if mine:
        return _credential_out(mine)
    if payload.kind in BIOMETRIC_KINDS:
        consent = (await db.execute(select(BiometricConsent).where(
            BiometricConsent.member_id == member_id, BiometricConsent.kind == payload.kind, BiometricConsent.revoked_at.is_(None)
        ))).scalar_one_or_none()
        if not consent:
            raise HTTPException(status_code=409, detail="El socio debe firmar el consentimiento biométrico antes de enrolar")
        consent_id = consent.id
    if payload.device_id:
        dev = (await db.execute(select(KioskDevice).where(KioskDevice.id == payload.device_id, KioskDevice.is_active.is_(True)))).scalar_one_or_none()
        if not dev:
            raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    ref = payload.device_user_id.strip()
    stmt = select(MemberCredential).where(
        MemberCredential.kind == payload.kind, MemberCredential.device_user_id == ref,
        MemberCredential.revoked_at.is_(None), MemberCredential.member_id != member_id,
    )
    if payload.device_id is not None:
        # Credencial de un equipo concreto: choca con la global y con la de ese mismo equipo
        stmt = stmt.where((MemberCredential.device_id.is_(None)) | (MemberCredential.device_id == payload.device_id))
    clash = (await db.execute(stmt)).scalars().first()
    if clash:
        raise HTTPException(status_code=409, detail="Ese ID de lector ya está asignado a otro socio")
    cred = MemberCredential(member_id=member_id, device_id=payload.device_id, kind=payload.kind, device_user_id=ref,
                            label=payload.label, consent_id=consent_id, enrolled_by=current_user.id)
    db.add(cred)
    audit(db, current_user, "credential.enroll", "member", member_id, {"kind": payload.kind, "device_user_id": ref})
    await db.commit()
    await db.refresh(cred)
    return _credential_out(cred)


@member_router.delete("/members/{member_id}/credentials/{credential_id}")
async def revoke_credential(
    member_id: uuid.UUID,
    credential_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_perm(perm.CREDENTIALS_WRITE)),
):
    cred = (await db.execute(select(MemberCredential).where(
        MemberCredential.id == credential_id, MemberCredential.member_id == member_id
    ))).scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credencial no encontrada")
    if cred.revoked_at is None:
        cred.revoked_at, cred.revoked_by = utcnow_naive(), current_user.id
        audit(db, current_user, "credential.revoke", "member", member_id, {"kind": cred.kind, "device_user_id": cred.device_user_id})
    await db.commit()
    return {"revoked": True}
