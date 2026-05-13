import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response as FastAPIResponse
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import RedirectResponse

from core.auth import current_user, decode_token
from core.db import get_db
from models import CalendarEvent, User, UserCalendarIntegration
from schemas import CalendarEventCreate, CalendarEventRead, CalendarEventUpdate

router = APIRouter()

_GOOGLE_SCOPES = "https://www.googleapis.com/auth/calendar"
_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
_DEFAULT_BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
_GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
_GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
_GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "") or f"{_DEFAULT_BACKEND_URL}/api/agenda/integrations/google/callback"


def _serialize_event(event: CalendarEvent) -> dict:
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description,
        "location": event.location,
        "start_datetime": event.start_datetime.isoformat() if event.start_datetime else None,
        "end_datetime": event.end_datetime.isoformat() if event.end_datetime else None,
        "all_day": event.all_day,
        "color": event.color,
        "recurrence_rule": event.recurrence_rule,
        "owner_id": event.owner_id,
        "owner_username": event.owner.username if event.owner else None,
        "company_id": event.company_id,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "updated_at": event.updated_at.isoformat() if event.updated_at else None,
    }


def _push_event_to_external(db: Session, user: User, event: CalendarEvent) -> None:
    """No-op stub: external push happens via explicit sync endpoint."""
    pass


# ── Events CRUD ───────────────────────────────────────────────────────────────

@router.get("/api/agenda/events")
def list_events(
    request: Request,
    db: Session = Depends(get_db),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
):
    user = current_user(request, db)
    q = db.query(CalendarEvent).filter(
        CalendarEvent.company_id == user.company_id,
        CalendarEvent.deleted_at.is_(None),
    )
    if from_date:
        try:
            q = q.filter(CalendarEvent.end_datetime >= datetime.fromisoformat(from_date))
        except ValueError:
            pass
    if to_date:
        try:
            q = q.filter(CalendarEvent.start_datetime <= datetime.fromisoformat(to_date))
        except ValueError:
            pass
    events = q.order_by(CalendarEvent.start_datetime).all()
    return [_serialize_event(e) for e in events]


@router.post("/api/agenda/events", status_code=201)
def create_event(body: CalendarEventCreate, request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    event = CalendarEvent(
        title=body.title,
        description=body.description,
        location=body.location,
        start_datetime=body.start_datetime,
        end_datetime=body.end_datetime,
        all_day=body.all_day,
        color=body.color,
        recurrence_rule=body.recurrence_rule,
        owner_id=user.id,
        company_id=user.company_id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    _push_event_to_external(db, user, event)
    return _serialize_event(event)


@router.put("/api/agenda/events/{event_id}")
def update_event(event_id: int, body: CalendarEventUpdate, request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id,
        CalendarEvent.company_id == user.company_id,
        CalendarEvent.deleted_at.is_(None),
    ).first()
    if not event:
        raise HTTPException(404, "Evento no encontrado")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(event, field, value)
    event.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(event)
    return _serialize_event(event)


@router.delete("/api/agenda/events/{event_id}", status_code=204)
def delete_event(event_id: int, request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id,
        CalendarEvent.company_id == user.company_id,
        CalendarEvent.deleted_at.is_(None),
    ).first()
    if not event:
        raise HTTPException(404, "Evento no encontrado")
    event.deleted_at = datetime.utcnow()
    db.commit()


# ── iCal feed ─────────────────────────────────────────────────────────────────

def _format_ical_dt(dt: datetime, all_day: bool) -> str:
    if all_day:
        return f"VALUE=DATE:{dt.strftime('%Y%m%d')}"
    return dt.strftime("%Y%m%dT%H%M%SZ")


def _escape_ical(text: str) -> str:
    if not text:
        return ""
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


@router.get("/api/agenda/ical/{token}", response_class=FastAPIResponse)
def get_ical_feed(token: str, db: Session = Depends(get_db)):
    integration = db.query(UserCalendarIntegration).filter(
        UserCalendarIntegration.ical_token == token,
        UserCalendarIntegration.provider == "ical",
        UserCalendarIntegration.is_active.is_(True),
    ).first()
    if not integration:
        raise HTTPException(404, "Feed no encontrado")

    user = db.query(User).filter(User.id == integration.user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")

    events = db.query(CalendarEvent).filter(
        CalendarEvent.company_id == user.company_id,
        CalendarEvent.deleted_at.is_(None),
    ).order_by(CalendarEvent.start_datetime).all()

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Reval//Agenda//ES",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Reval Agenda",
        "X-WR-TIMEZONE:UTC",
    ]
    for e in events:
        uid = f"reval-{e.id}@reval.app"
        dtstart = _format_ical_dt(e.start_datetime, e.all_day)
        dtend = _format_ical_dt(e.end_datetime, e.all_day)
        dtstamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        lines += [
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{dtstamp}",
            f"DTSTART:{dtstart}",
            f"DTEND:{dtend}",
            f"SUMMARY:{_escape_ical(e.title)}",
        ]
        if e.description:
            lines.append(f"DESCRIPTION:{_escape_ical(e.description)}")
        if e.location:
            lines.append(f"LOCATION:{_escape_ical(e.location)}")
        if e.recurrence_rule:
            lines.append(f"RRULE:{e.recurrence_rule}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")

    content = "\r\n".join(lines) + "\r\n"
    return FastAPIResponse(content=content, media_type="text/calendar; charset=utf-8")


# ── Integrations ──────────────────────────────────────────────────────────────

@router.get("/api/agenda/integrations")
def list_integrations(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    integrations = db.query(UserCalendarIntegration).filter(
        UserCalendarIntegration.user_id == user.id,
        UserCalendarIntegration.is_active.is_(True),
    ).all()
    result = {}
    for intg in integrations:
        result[intg.provider] = {
            "connected": True,
            "provider": intg.provider,
            "calendar_id": intg.calendar_id,
            "token_expiry": intg.token_expiry.isoformat() if intg.token_expiry else None,
        }
    ical_intg = db.query(UserCalendarIntegration).filter(
        UserCalendarIntegration.user_id == user.id,
        UserCalendarIntegration.provider == "ical",
    ).first()
    if ical_intg:
        result["ical"] = {
            "connected": True,
            "provider": "ical",
            "token": ical_intg.ical_token,
            "feed_url": f"/api/agenda/ical/{ical_intg.ical_token}",
        }
    return result


@router.post("/api/agenda/integrations/ical", status_code=201)
def create_ical_feed(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    existing = db.query(UserCalendarIntegration).filter(
        UserCalendarIntegration.user_id == user.id,
        UserCalendarIntegration.provider == "ical",
    ).first()
    if existing:
        return {"token": existing.ical_token, "feed_url": f"/api/agenda/ical/{existing.ical_token}"}
    token = secrets.token_urlsafe(32)
    intg = UserCalendarIntegration(
        user_id=user.id,
        provider="ical",
        ical_token=token,
        is_active=True,
    )
    db.add(intg)
    db.commit()
    return {"token": token, "feed_url": f"/api/agenda/ical/{token}"}


@router.delete("/api/agenda/integrations/ical", status_code=204)
def delete_ical_feed(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    intg = db.query(UserCalendarIntegration).filter(
        UserCalendarIntegration.user_id == user.id,
        UserCalendarIntegration.provider == "ical",
    ).first()
    if intg:
        db.delete(intg)
        db.commit()


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.get("/api/agenda/integrations/available")
def integrations_available(request: Request, db: Session = Depends(get_db)):
    current_user(request, db)
    return {
        "google": bool(_GOOGLE_CLIENT_ID and _GOOGLE_CLIENT_SECRET),
    }


@router.get("/api/agenda/integrations/google/auth")
def google_auth_url(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    if not _GOOGLE_CLIENT_ID or not _GOOGLE_CLIENT_SECRET:
        raise HTTPException(501, "Google Calendar no está configurado")
    from core.auth import create_token
    state = create_token(user.username)
    from urllib.parse import urlencode
    params = {
        "client_id": _GOOGLE_CLIENT_ID,
        "redirect_uri": _GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": _GOOGLE_SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    return {"url": url}


@router.get("/api/agenda/integrations/google/callback")
async def google_callback(code: str, state: str, db: Session = Depends(get_db)):
    try:
        username = decode_token(state)
    except Exception:
        raise HTTPException(400, "Estado OAuth inválido")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(400, "Usuario no encontrado")

    async with httpx.AsyncClient() as client:
        resp = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": _GOOGLE_CLIENT_ID,
            "client_secret": _GOOGLE_CLIENT_SECRET,
            "redirect_uri": _GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        })
    if not resp.is_success:
        raise HTTPException(400, "No se pudo obtener el token de Google")
    token_data = resp.json()

    expiry = None
    if "expires_in" in token_data:
        expiry = datetime.utcnow() + timedelta(seconds=token_data["expires_in"])

    async with httpx.AsyncClient() as client:
        cal_resp = await client.get(
            "https://www.googleapis.com/calendar/v3/calendars/primary",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
    calendar_id = cal_resp.json().get("id") if cal_resp.is_success else None

    existing = db.query(UserCalendarIntegration).filter(
        UserCalendarIntegration.user_id == user.id,
        UserCalendarIntegration.provider == "google",
    ).first()
    if existing:
        existing.access_token = token_data.get("access_token")
        existing.refresh_token = token_data.get("refresh_token") or existing.refresh_token
        existing.token_expiry = expiry
        existing.calendar_id = calendar_id
        existing.is_active = True
        existing.updated_at = datetime.utcnow()
    else:
        db.add(UserCalendarIntegration(
            user_id=user.id,
            provider="google",
            access_token=token_data.get("access_token"),
            refresh_token=token_data.get("refresh_token"),
            token_expiry=expiry,
            calendar_id=calendar_id,
            is_active=True,
        ))
    db.commit()

    return RedirectResponse(f"{_FRONTEND_URL}/agenda?connected=google")


async def _refresh_google_token(intg: UserCalendarIntegration, db: Session) -> Optional[str]:
    if not intg.refresh_token:
        return None
    async with httpx.AsyncClient() as client:
        resp = await client.post("https://oauth2.googleapis.com/token", data={
            "client_id": _GOOGLE_CLIENT_ID,
            "client_secret": _GOOGLE_CLIENT_SECRET,
            "refresh_token": intg.refresh_token,
            "grant_type": "refresh_token",
        })
    if not resp.is_success:
        return None
    data = resp.json()
    intg.access_token = data["access_token"]
    intg.token_expiry = datetime.utcnow() + timedelta(seconds=data.get("expires_in", 3600))
    intg.updated_at = datetime.utcnow()
    db.commit()
    return intg.access_token


async def _google_access_token(intg: UserCalendarIntegration, db: Session) -> Optional[str]:
    if intg.token_expiry and intg.token_expiry <= datetime.utcnow() + timedelta(minutes=5):
        return await _refresh_google_token(intg, db)
    return intg.access_token


@router.post("/api/agenda/integrations/google/sync")
async def google_sync(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    intg = db.query(UserCalendarIntegration).filter(
        UserCalendarIntegration.user_id == user.id,
        UserCalendarIntegration.provider == "google",
        UserCalendarIntegration.is_active.is_(True),
    ).first()
    if not intg:
        raise HTTPException(400, "Google Calendar no está conectado")

    token = await _google_access_token(intg, db)
    if not token:
        raise HTTPException(400, "No se pudo renovar el token de Google. Reconectá la integración.")

    calendar_id = intg.calendar_id or "primary"
    now_str = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    pushed = 0
    pulled = 0

    local_events = db.query(CalendarEvent).filter(
        CalendarEvent.company_id == user.company_id,
        CalendarEvent.owner_id == user.id,
        CalendarEvent.deleted_at.is_(None),
        CalendarEvent.google_event_id.is_(None),
    ).all()

    async with httpx.AsyncClient() as client:
        for evt in local_events:
            body_data = {
                "summary": evt.title,
                "description": evt.description or "",
                "location": evt.location or "",
                "start": {"dateTime": evt.start_datetime.isoformat() + "Z", "timeZone": "UTC"} if not evt.all_day else {"date": evt.start_datetime.strftime("%Y-%m-%d")},
                "end": {"dateTime": evt.end_datetime.isoformat() + "Z", "timeZone": "UTC"} if not evt.all_day else {"date": evt.end_datetime.strftime("%Y-%m-%d")},
            }
            r = await client.post(
                f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events",
                json=body_data,
                headers={"Authorization": f"Bearer {token}"},
            )
            if r.is_success:
                evt.google_event_id = r.json().get("id")
                pushed += 1

        r = await client.get(
            f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events",
            params={"timeMin": now_str, "singleEvents": "true", "maxResults": 250},
            headers={"Authorization": f"Bearer {token}"},
        )
        if r.is_success:
            for g_evt in r.json().get("items", []):
                g_id = g_evt.get("id")
                if not g_id:
                    continue
                existing_local = db.query(CalendarEvent).filter(
                    CalendarEvent.google_event_id == g_id,
                ).first()
                if existing_local:
                    continue
                start_raw = g_evt.get("start", {})
                end_raw = g_evt.get("end", {})
                all_day = "date" in start_raw and "dateTime" not in start_raw
                try:
                    start_dt = datetime.fromisoformat(start_raw.get("dateTime") or start_raw.get("date"))
                    end_dt = datetime.fromisoformat(end_raw.get("dateTime") or end_raw.get("date"))
                except Exception:
                    continue
                new_evt = CalendarEvent(
                    title=g_evt.get("summary") or "(sin título)",
                    description=g_evt.get("description"),
                    location=g_evt.get("location"),
                    start_datetime=start_dt.replace(tzinfo=None),
                    end_datetime=end_dt.replace(tzinfo=None),
                    all_day=all_day,
                    google_event_id=g_id,
                    owner_id=user.id,
                    company_id=user.company_id,
                )
                db.add(new_evt)
                pulled += 1

    db.commit()
    return {"pushed": pushed, "pulled": pulled}


@router.delete("/api/agenda/integrations/google", status_code=204)
def google_disconnect(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    intg = db.query(UserCalendarIntegration).filter(
        UserCalendarIntegration.user_id == user.id,
        UserCalendarIntegration.provider == "google",
    ).first()
    if intg:
        intg.is_active = False
        intg.access_token = None
        intg.refresh_token = None
        db.commit()
