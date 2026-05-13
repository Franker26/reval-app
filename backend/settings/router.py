from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.requests import Request

from core.auth import current_user, require_admin, decode_token, hash_password
from core.db import get_db
from core.utils import (
    get_branding_settings_data,
    get_company_setting,
    get_scraper_settings,
    save_branding_settings_data,
    serialize_user,
)
from models import CompanySetting, User
from schemas import BrandingSettings, UserCreate, UserRead, UserUpdate

router = APIRouter()

_SENSITIVE_SETTING_KEYS = {"scraper_service_token"}


class ChangePasswordRequest(BaseModel):
    new_password: str


# ── Auth endpoints ─────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/api/auth/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    from core.auth import verify_password, create_token
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    if user.is_superadmin:
        raise HTTPException(403, "Acceso de superadmin no permitido desde esta pantalla. Usá /admin.")
    return {
        "access_token": create_token(user.username),
        "token_type": "bearer",
        "username": user.username,
        "is_admin": user.is_admin,
        "is_approver": user.is_approver,
        "needs_approval": user.needs_approval,
        "company_id": user.company_id,
        "company_name": user.company.name if user.company else None,
    }


@router.get("/api/auth/me")
def me(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    return {
        "id": user.id,
        "username": user.username,
        "is_admin": user.is_admin,
        "is_approver": user.is_approver,
        "needs_approval": user.needs_approval,
        "company_id": user.company_id,
        "company_name": user.company.name if user.company else None,
    }


# ── User management ────────────────────────────────────────────────────────────

@router.get("/api/users", response_model=list[UserRead])
def list_users(request: Request, db: Session = Depends(get_db)):
    current = require_admin(request, db)
    users = (
        db.query(User)
        .filter(User.company_id == current.company_id, User.is_superadmin.is_(False))
        .order_by(User.id)
        .all()
    )
    return [serialize_user(u) for u in users]


@router.post("/api/users", response_model=UserRead, status_code=201)
def create_user(body: UserCreate, request: Request, db: Session = Depends(get_db)):
    current = require_admin(request, db)
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(409, f"El usuario '{body.username}' ya existe")
    user = User(
        username=body.username,
        hashed_password=hash_password(body.password),
        is_admin=body.is_admin,
        is_approver=body.is_approver,
        needs_approval=body.needs_approval,
        company_id=current.company_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return serialize_user(user)


@router.patch("/api/users/{user_id}", response_model=UserRead)
def update_user(user_id: int, body: UserUpdate, request: Request, db: Session = Depends(get_db)):
    from modules.acm_core.router import _mark_acm_pending_if_required
    current = require_admin(request, db)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")

    data = body.model_dump(exclude_none=True)
    next_is_admin = data.get("is_admin", user.is_admin)
    next_is_approver = data.get("is_approver", user.is_approver)
    if next_is_approver and not next_is_admin:
        raise HTTPException(400, "Un approver también debe ser admin")
    if current.id == user_id and "is_admin" in data and not next_is_admin:
        raise HTTPException(400, "No podés quitarte el rol de admin")
    if current.id == user_id and "is_approver" in data and not next_is_approver:
        raise HTTPException(400, "No podés quitarte el rol de approver")

    for field, value in data.items():
        setattr(user, field, value)
    if "needs_approval" in data:
        for acm in user.acms:
            _mark_acm_pending_if_required(acm)
    db.commit()
    db.refresh(user)
    return serialize_user(user)


@router.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, request: Request, db: Session = Depends(get_db)):
    current = require_admin(request, db)
    if current.id == user_id:
        raise HTTPException(400, "No podés eliminar tu propio usuario")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    db.delete(user)
    db.commit()


@router.put("/api/users/{user_id}/password", status_code=204)
def change_user_password(user_id: int, body: ChangePasswordRequest, request: Request, db: Session = Depends(get_db)):
    current = current_user(request, db)
    if not current.is_admin and current.id != user_id:
        raise HTTPException(403, "Sin permisos")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    user.hashed_password = hash_password(body.new_password)
    db.commit()


# ── Branding & Settings ────────────────────────────────────────────────────────

@router.get("/api/settings/branding", response_model=BrandingSettings)
def get_branding_settings(request: Request, db: Session = Depends(get_db)):
    company_id: Optional[int] = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            username = decode_token(auth.split(" ", 1)[1])
            user = db.query(User).filter(User.username == username).first()
            if user:
                company_id = user.company_id
        except Exception:
            pass
    return get_branding_settings_data(db, company_id)


@router.put("/api/settings/branding", response_model=BrandingSettings)
def update_branding_settings(body: BrandingSettings, request: Request, db: Session = Depends(get_db)):
    current = require_admin(request, db)
    save_branding_settings_data(body, db, current.company_id)
    return get_branding_settings_data(db, current.company_id)


@router.get("/api/settings/integrations/status")
def get_integration_status(request: Request, db: Session = Depends(get_db)):
    current_user(request, db)
    scraper = get_scraper_settings(db)
    scraper_url = scraper.get("scraper_service_url", "").strip() if scraper.get("scraper_service_url") else ""
    return {
        "scraper_configured": bool(scraper_url),
        "sources": [
            {"name": "Zonaprop", "key": "zonaprop", "available": bool(scraper_url)},
            {"name": "Argenprop", "key": "argenprop", "available": bool(scraper_url)},
            {"name": "MercadoLibre", "key": "mercadolibre", "available": bool(scraper_url)},
        ],
    }


@router.get("/api/settings/params")
def get_system_params(request: Request, db: Session = Depends(get_db)):
    current = require_admin(request, db)
    settings = (
        db.query(CompanySetting)
        .filter(CompanySetting.company_id == current.company_id)
        .order_by(CompanySetting.key)
        .all()
    )
    return [
        {
            "key": s.key,
            "value": "***" if s.key in _SENSITIVE_SETTING_KEYS and s.value else (s.value or ""),
        }
        for s in settings
    ]
