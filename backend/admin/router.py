import asyncio
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.requests import Request

from core.auth import create_token, hash_password, require_superadmin, verify_password
from core.db import get_db
from core.utils import (
    get_platform_setting,
    get_scraper_settings,
    save_platform_setting,
    serialize_user,
)
from models import ACM, Company, User
from schemas import ACMSummary, AdminUserCreate, CompanyCreate, CompanyRead, CompanyUpdate, UserRead, UserUpdate

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    new_password: str


class GlobalIntegrationSettings(BaseModel):
    scraper_service_url: Optional[str] = None
    scraper_service_token: Optional[str] = None
    scraper_service_url_backup: Optional[str] = None
    scraper_service_token_backup: Optional[str] = None


class CalendarSyncSettings(BaseModel):
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    microsoft_client_id: Optional[str] = None
    microsoft_client_secret: Optional[str] = None
    ical_base_url: Optional[str] = None


def _requires_approval_check(acm: ACM) -> bool:
    return bool(acm.owner and acm.owner.needs_approval)


@router.post("/api/admin/login")
def admin_login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    if not user.is_superadmin:
        raise HTTPException(403, "Acceso restringido a superadmin")
    return {
        "access_token": create_token(user.username),
        "token_type": "bearer",
        "username": user.username,
        "is_superadmin": True,
    }


@router.get("/api/admin/companies")
def admin_list_companies(request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    companies = db.query(Company).order_by(Company.id).all()
    result = []
    for co in companies:
        user_count = db.query(User).filter(User.company_id == co.id, User.is_superadmin.is_(False)).count()
        acm_count = db.query(ACM).filter(ACM.company_id == co.id, ACM.deleted_at.is_(None)).count()
        result.append({
            "id": co.id, "name": co.name, "created_at": co.created_at,
            "user_count": user_count, "acm_count": acm_count,
        })
    return result


@router.post("/api/admin/companies", status_code=201)
def admin_create_company(body: CompanyCreate, request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    if db.query(Company).filter(Company.name == body.name).first():
        raise HTTPException(409, f"La empresa '{body.name}' ya existe")
    co = Company(name=body.name)
    db.add(co)
    db.commit()
    db.refresh(co)
    return {"id": co.id, "name": co.name, "created_at": co.created_at, "user_count": 0, "acm_count": 0}


@router.get("/api/admin/companies/{company_id}")
def admin_get_company(company_id: int, request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(404, "Empresa no encontrada")
    user_count = db.query(User).filter(User.company_id == co.id, User.is_superadmin.is_(False)).count()
    acm_count = db.query(ACM).filter(ACM.company_id == co.id, ACM.deleted_at.is_(None)).count()
    return {"id": co.id, "name": co.name, "created_at": co.created_at, "user_count": user_count, "acm_count": acm_count}


@router.patch("/api/admin/companies/{company_id}")
def admin_update_company(company_id: int, body: CompanyUpdate, request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(404, "Empresa no encontrada")
    co.name = body.name
    db.commit()
    db.refresh(co)
    return {"id": co.id, "name": co.name, "created_at": co.created_at}


@router.delete("/api/admin/companies/{company_id}", status_code=204)
def admin_delete_company(company_id: int, request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(404, "Empresa no encontrada")
    has_users = db.query(User).filter(User.company_id == company_id, User.is_superadmin.is_(False)).count() > 0
    if has_users:
        raise HTTPException(400, "No se puede eliminar una empresa con usuarios activos")
    db.delete(co)
    db.commit()


@router.get("/api/admin/companies/{company_id}/users")
def admin_list_company_users(company_id: int, request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    users = (
        db.query(User)
        .filter(User.company_id == company_id, User.is_superadmin.is_(False))
        .order_by(User.id)
        .all()
    )
    return [serialize_user(u) for u in users]


@router.post("/api/admin/companies/{company_id}/users", status_code=201)
def admin_create_company_user(company_id: int, body: AdminUserCreate, request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    if not db.query(Company).filter(Company.id == company_id).first():
        raise HTTPException(404, "Empresa no encontrada")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(409, f"El usuario '{body.username}' ya existe")
    user = User(
        username=body.username,
        hashed_password=hash_password(body.password),
        is_admin=body.is_admin,
        is_approver=body.is_approver,
        needs_approval=body.needs_approval,
        company_id=company_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return serialize_user(user)


@router.patch("/api/admin/companies/{company_id}/users/{user_id}")
def admin_update_company_user(company_id: int, user_id: int, body: UserUpdate, request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    user = db.query(User).filter(User.id == user_id, User.company_id == company_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return serialize_user(user)


@router.put("/api/admin/companies/{company_id}/users/{user_id}/password", status_code=204)
def admin_change_company_user_password(
    company_id: int, user_id: int, body: ChangePasswordRequest, request: Request, db: Session = Depends(get_db)
):
    require_superadmin(request, db)
    user = db.query(User).filter(User.id == user_id, User.company_id == company_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    user.hashed_password = hash_password(body.new_password)
    db.commit()


@router.delete("/api/admin/companies/{company_id}/users/{user_id}", status_code=204)
def admin_delete_company_user(company_id: int, user_id: int, request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    user = db.query(User).filter(User.id == user_id, User.company_id == company_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    db.delete(user)
    db.commit()


@router.get("/api/admin/companies/{company_id}/acms")
def admin_list_company_acms(company_id: int, request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    acms = (
        db.query(ACM)
        .filter(ACM.company_id == company_id, ACM.deleted_at.is_(None))
        .order_by(ACM.fecha_creacion.desc())
        .all()
    )
    result = []
    for acm in acms:
        s = ACMSummary.model_validate(acm)
        s.cantidad_comparables = len(acm.comparables)
        s.owner_username = acm.owner.username if acm.owner else None
        s.requires_approval = _requires_approval_check(acm)
        result.append(s)
    return result


# ── Integration settings ──────────────────────────────────────────────────────

async def _check_scraper_health(url: str, token: str) -> bool:
    if not url:
        return False
    try:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{url.rstrip('/')}/health", headers=headers)
        return r.status_code == 200
    except Exception:
        return False


@router.get("/api/admin/settings/integrations")
def admin_get_integration_settings(request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    raw = get_scraper_settings(db)
    return GlobalIntegrationSettings(
        scraper_service_url=raw.get("scraper_service_url"),
        scraper_service_token="***" if raw.get("scraper_service_token") else None,
        scraper_service_url_backup=raw.get("scraper_service_url_backup"),
        scraper_service_token_backup="***" if raw.get("scraper_service_token_backup") else None,
    )


@router.put("/api/admin/settings/integrations")
def admin_update_integration_settings(body: GlobalIntegrationSettings, request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    if body.scraper_service_url is not None:
        save_platform_setting(db, "scraper_service_url", body.scraper_service_url.strip())
    if body.scraper_service_token is not None and body.scraper_service_token != "***":
        save_platform_setting(db, "scraper_service_token", body.scraper_service_token.strip())
    if body.scraper_service_url_backup is not None:
        save_platform_setting(db, "scraper_service_url_backup", body.scraper_service_url_backup.strip())
    if body.scraper_service_token_backup is not None and body.scraper_service_token_backup != "***":
        save_platform_setting(db, "scraper_service_token_backup", body.scraper_service_token_backup.strip())
    return admin_get_integration_settings(request, db)


@router.get("/api/admin/settings/integrations/status")
async def admin_integration_status(request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    raw = get_scraper_settings(db)
    primary_url = (raw.get("scraper_service_url") or "").strip()
    backup_url = (raw.get("scraper_service_url_backup") or "").strip()

    primary_ok, backup_ok = await asyncio.gather(
        _check_scraper_health(primary_url, raw.get("scraper_service_token", "") or ""),
        _check_scraper_health(backup_url, raw.get("scraper_service_token_backup", "") or ""),
    )

    return {
        "connected": primary_ok or backup_ok,
        "primary": {"url": primary_url or None, "connected": primary_ok},
        "backup": {"url": backup_url or None, "connected": backup_ok},
        "sources": ["zonaprop", "argenprop", "mercadolibre"],
    }


# ── Calendar sync settings ────────────────────────────────────────────────────

_CAL_KEYS = ["google_client_id", "google_client_secret", "microsoft_client_id", "microsoft_client_secret", "ical_base_url"]


@router.get("/api/admin/settings/calendar")
def admin_get_calendar_settings(request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    def _masked(key: str) -> Optional[str]:
        val = get_platform_setting(db, f"cal_{key}")
        if val is None:
            return None
        if key.endswith("_secret"):
            return "***"
        return val
    return {k: _masked(k) for k in _CAL_KEYS}


@router.put("/api/admin/settings/calendar")
def admin_update_calendar_settings(body: CalendarSyncSettings, request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    data = body.model_dump()
    for key, value in data.items():
        if value is None:
            continue
        if value == "***":
            continue
        save_platform_setting(db, f"cal_{key}", value.strip())
    return admin_get_calendar_settings(request, db)
