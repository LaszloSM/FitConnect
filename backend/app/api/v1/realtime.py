import asyncio
import json

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from jose import JWTError

from app.core.security import decode_token
from app.services import realtime

router = APIRouter(prefix="/realtime", tags=["realtime"])

_HEARTBEAT_SECONDS = 25


@router.get("/reception")
async def reception_stream(request: Request, token: str = Query(...)):
    """SSE de eventos de check-in para la pantalla de recepción.
    EventSource no permite headers → el JWT del staff viaja como query param."""
    try:
        payload = decode_token(token)
    except (JWTError, HTTPException):
        raise HTTPException(status_code=401, detail="Token inválido")
    db_name = payload.get("db_name")
    if not db_name or payload.get("scope") == "kiosk":
        raise HTTPException(status_code=401, detail="Token sin contexto de staff")

    queue = realtime.subscribe(db_name)

    async def stream():
        try:
            yield "event: connected\ndata: {}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=_HEARTBEAT_SECONDS)
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            realtime.unsubscribe(db_name, queue)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
