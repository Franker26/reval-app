import asyncio
import json
import logging
import os
import re
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger("acm")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

STEP_ORDER = ["sujeto", "comparables", "ponderadores", "resultados", "exportar"]
STAGE_ORDER = ["nuevo", "en_progreso", "finalizado", "cancelado"]

_STAGE_MIGRATION = {
    "Borrador": "nuevo",
    "En progreso": "en_progreso",
    "Finalizado": "finalizado",
    "Cancelado": "cancelado",
}

import httpx
from bs4 import BeautifulSoup
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
import bcrypt as _bcrypt_lib
from pydantic import BaseModel as PydanticBase
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

import calculator as calc
from models import (
    ACM,
    AppSetting,
    ApprovalComment,
    ApprovalStatus,
    Base,
    CalendarEvent,
    Comparable,
    Company,
    CompanySetting,
    ModifierOption,
    PlatformSetting,
    SessionLocal,
    StageACM,
    User,
    UserCalendarIntegration,
    engine,
)
# --- Auth config ---

_SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
_ALGORITHM = "HS256"
_TOKEN_EXPIRE_DAYS = 7

# Rutas que no requieren token
_PUBLIC_PATHS = {
    "/api/auth/login",
    "/api/admin/login",
    "/api/ponderadores/defaults",
    "/api/settings/branding",
}


def _hash_password(pw: str) -> str:
    return _bcrypt_lib.hashpw(pw.encode(), _bcrypt_lib.gensalt()).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt_lib.checkpw(plain.encode(), hashed.encode())


def _create_token(username: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": username, "exp": exp}, _SECRET_KEY, algorithm=_ALGORITHM)


def _decode_token(token: str) -> str:
    payload = jwt.decode(token, _SECRET_KEY, algorithms=[_ALGORITHM])
    username = payload.get("sub")
    if not username:
        raise JWTError("no sub")
    return username


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in _PUBLIC_PATHS or not request.url.path.startswith("/api/"):
            return await call_next(request)
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return JSONResponse({"detail": "No autenticado"}, status_code=401)
        try:
            _decode_token(auth.split(" ", 1)[1])
        except JWTError:
            return JSONResponse({"detail": "Token inválido o expirado"}, status_code=401)
        return await call_next(request)
from schemas import (
    ACMCreate,
    ACMRead,
    ACMSummary,
    ACMUpdate,
    AdminUserCreate,
    ApprovalCommentRead,
    ApprovalReviewRequest,
    BrandingSettings,
    CalendarEventCreate,
    CalendarEventRead,
    CalendarEventUpdate,
    CalendarIntegrationRead,
    ComparableCreate,
    ComparableRead,
    ComparableResultado,
    ComparableUpdate,
    CompanyCreate,
    CompanyRead,
    CompanyUpdate,
    ModifierOptionCreate,
    ModifierOptionRead,
    ModifierOptionUpdate,
    PonderadoresDefaults,
    ResultadoResponse,
    StageUpdateRequest,
    StepUpdateRequest,
    UserCreate,
    UserRead,
    UserUpdate,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        # Column migrations — each statement is tried individually.
        # "duplicate column" errors are caught and ignored (idempotent).
        # IF NOT EXISTS is omitted for SQLite compatibility.
        for stmt in (
            "ALTER TABLE acm ALTER COLUMN stage TYPE VARCHAR USING stage::text",  # PG only, ignored on SQLite
            "ALTER TABLE acm ADD COLUMN current_step VARCHAR DEFAULT 'sujeto'",
            "ALTER TABLE acm ADD COLUMN steps_completed VARCHAR DEFAULT '[]'",
            "ALTER TABLE acm ADD COLUMN deleted_at TIMESTAMP",
            "ALTER TABLE users ADD COLUMN is_superadmin BOOLEAN DEFAULT 0",
            "ALTER TABLE users ADD COLUMN company_id INTEGER",
            "ALTER TABLE acm ADD COLUMN company_id INTEGER",
            "ALTER TABLE acm ADD COLUMN approval_status VARCHAR DEFAULT 'No requerida'",
            "ALTER TABLE acm ADD COLUMN approved_by_id INTEGER",
            "ALTER TABLE acm ADD COLUMN approved_at TIMESTAMP",
            # Agenda tables (SQLAlchemy create_all handles new tables; ALTER only for existing ones)
        ):
            try:
                db.execute(text(stmt))
                db.commit()
            except Exception:
                db.rollback()

        for acm in db.query(ACM).all():
            if acm.updated_at is None:
                acm.updated_at = acm.fecha_creacion
            if acm.approval_status is None:
                _mark_acm_pending_if_required(acm)
            if acm.stage in _STAGE_MIGRATION:
                acm.stage = _STAGE_MIGRATION[acm.stage]
            if not acm.current_step:
                acm.current_step = "sujeto"
            if not acm.steps_completed:
                acm.steps_completed = "[]"
        db.commit()

        # --- Multi-tenant bootstrap ---
        # 1. Create default company if none exist
        if db.query(Company).count() == 0:
            default_co = Company(name="Default")
            db.add(default_co)
            db.commit()
            db.refresh(default_co)
        else:
            default_co = db.query(Company).order_by(Company.id).first()

        default_cid = default_co.id

        # 2. Assign users without company to default
        db.query(User).filter(User.company_id.is_(None)).update(
            {User.company_id: default_cid}, synchronize_session=False
        )
        db.commit()

        # 3. Assign ACMs without company to default
        db.query(ACM).filter(ACM.company_id.is_(None)).update(
            {ACM.company_id: default_cid}, synchronize_session=False
        )
        db.commit()

        # 4. Copy legacy AppSetting → CompanySetting for default company
        for setting in db.query(AppSetting).all():
            exists = db.query(CompanySetting).filter(
                CompanySetting.company_id == default_cid,
                CompanySetting.key == setting.key,
            ).first()
            if not exists:
                db.add(CompanySetting(
                    company_id=default_cid,
                    key=setting.key,
                    value=setting.value,
                ))
        db.commit()

        # 5. Seed default modifier options per company (if company has none yet)
        _DEFAULT_MODIFIER_SEED = [
            ("antiguedad_por_decada",    "Por década de diferencia",        0.05),
            ("estado_a_refaccionar",     "A refaccionar vs Standard",       0.10),
            ("calidad_superior",         "Superior (factor directo)",        0.90),
            ("calidad_inferior",         "Inferior (factor directo)",        1.10),
            ("superficie_por_decima",    "Por décima de ratio",              0.02),
            ("piso_por_nivel",           "Por nivel de diferencia",          0.015),
            ("orientacion_sur_vs_norte", "Sur vs Norte",                     0.05),
            ("orientacion_interno",      "Interno vs cualquier orientación", 0.10),
            ("distribucion_mala",        "Regular vs Buena",                 0.05),
            ("oferta_mas_de_un_anio",    "Oferta +12 meses en mercado",      0.88),
            ("oferta_menos_de_un_anio",  "Oferta -12 meses en mercado",      0.90),
            ("oportunidad_mercado",      "Precio de oportunidad",            0.95),
            ("cochera",                  "Diferencia de cochera",            0.05),
            ("pileta",                   "Diferencia de pileta",             0.08),
        ]
        for company in db.query(Company).all():
            has_modifiers = db.query(ModifierOption).filter(
                ModifierOption.company_id == company.id
            ).first()
            if not has_modifiers:
                for factor_key, option_label, factor_value in _DEFAULT_MODIFIER_SEED:
                    db.add(ModifierOption(
                        company_id=company.id,
                        factor_key=factor_key,
                        option_label=option_label,
                        factor_value=factor_value,
                    ))
        db.commit()

        # 6. Bootstrap superadmin from env vars (only if username doesn't exist yet)
        sa_user = os.getenv("SUPERADMIN_USERNAME")
        sa_pass = os.getenv("SUPERADMIN_PASSWORD")
        if sa_user and sa_pass:
            existing = db.query(User).filter(User.username == sa_user).first()
            if existing:
                if not existing.is_superadmin:
                    existing.is_superadmin = True
                    existing.hashed_password = _hash_password(sa_pass)
                    db.commit()
            else:
                db.add(User(
                    username=sa_user,
                    hashed_password=_hash_password(sa_pass),
                    is_superadmin=True,
                    is_admin=False,
                    company_id=None,
                ))
                db.commit()
    yield


app = FastAPI(title="ACM Real Estate API", lifespan=lifespan)

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- Auth endpoints ---

class LoginRequest(PydanticBase):
    username: str
    password: str


@app.post("/api/auth/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not _verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    if user.is_superadmin:
        raise HTTPException(403, "Acceso de superadmin no permitido desde esta pantalla. Usá /admin.")
    return {
        "access_token": _create_token(user.username),
        "token_type": "bearer",
        "username": user.username,
        "is_admin": user.is_admin,
        "is_approver": user.is_approver,
        "needs_approval": user.needs_approval,
        "company_id": user.company_id,
        "company_name": user.company.name if user.company else None,
    }


@app.get("/api/auth/me")
def me(request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    return {
        "id": user.id,
        "username": user.username,
        "is_admin": user.is_admin,
        "is_approver": user.is_approver,
        "needs_approval": user.needs_approval,
        "company_id": user.company_id,
        "company_name": user.company.name if user.company else None,
    }


# --- User management ---

def _current_user(request: Request, db: Session) -> User:
    token = request.headers.get("Authorization", "").split(" ", 1)[-1]
    try:
        username = _decode_token(token)
    except JWTError:
        raise HTTPException(401, "Token inválido")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(401, "Usuario no encontrado")
    return user


def _require_admin(request: Request, db: Session) -> User:
    user = _current_user(request, db)
    if not user.is_admin:
        raise HTTPException(403, "Se requieren permisos de administrador")
    return user


def _require_approver(request: Request, db: Session) -> User:
    user = _current_user(request, db)
    if not user.is_admin or not user.is_approver:
        raise HTTPException(403, "Se requieren permisos de approver")
    return user


def _require_superadmin(request: Request, db: Session) -> User:
    user = _current_user(request, db)
    if not user.is_superadmin:
        raise HTTPException(403, "Se requieren permisos de superadmin")
    return user


def _get_company_setting(db: Session, company_id: int, key: str) -> Optional[str]:
    s = db.query(CompanySetting).filter(
        CompanySetting.company_id == company_id,
        CompanySetting.key == key,
    ).first()
    return s.value if s else None


def _save_company_setting(db: Session, company_id: int, key: str, value: str) -> None:
    s = db.query(CompanySetting).filter(
        CompanySetting.company_id == company_id,
        CompanySetting.key == key,
    ).first()
    if not s:
        s = CompanySetting(company_id=company_id, key=key)
        db.add(s)
    s.value = value
    db.commit()


def _get_platform_setting(db: Session, key: str) -> Optional[str]:
    s = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    return s.value if s else None


def _save_platform_setting(db: Session, key: str, value: str) -> None:
    s = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if not s:
        s = PlatformSetting(key=key)
        db.add(s)
    s.value = value
    db.commit()


def _get_scraper_settings(db: Session) -> dict:
    """Read global scraper settings with env var fallback."""
    def _url(val):
        return (val or "").rstrip("/") or None

    return {
        "scraper_service_url": _url(_get_platform_setting(db, "scraper_service_url") or _SCRAPER_SERVICE_URL),
        "scraper_service_token": _get_platform_setting(db, "scraper_service_token") or _SCRAPER_SERVICE_TOKEN,
        "scraper_service_url_backup": _url(_get_platform_setting(db, "scraper_service_url_backup") or _SCRAPER_SERVICE_URL_BACKUP),
        "scraper_service_token_backup": _get_platform_setting(db, "scraper_service_token_backup") or _SCRAPER_SERVICE_TOKEN_BACKUP,
    }


def _serialize_user(user: User) -> UserRead:
    return UserRead(
        id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        is_approver=user.is_approver,
        needs_approval=user.needs_approval,
        company_id=user.company_id,
    )


class ChangePasswordRequest(PydanticBase):
    new_password: str


@app.get("/api/users", response_model=list[UserRead])
def list_users(request: Request, db: Session = Depends(get_db)):
    current = _require_admin(request, db)
    users = (
        db.query(User)
        .filter(User.company_id == current.company_id, User.is_superadmin.is_(False))
        .order_by(User.id)
        .all()
    )
    return [_serialize_user(u) for u in users]


@app.post("/api/users", response_model=UserRead, status_code=201)
def create_user(body: UserCreate, request: Request, db: Session = Depends(get_db)):
    current = _require_admin(request, db)
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(409, f"El usuario '{body.username}' ya existe")
    user = User(
        username=body.username,
        hashed_password=_hash_password(body.password),
        is_admin=body.is_admin,
        is_approver=body.is_approver,
        needs_approval=body.needs_approval,
        company_id=current.company_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@app.patch("/api/users/{user_id}", response_model=UserRead)
def update_user(user_id: int, body: UserUpdate, request: Request, db: Session = Depends(get_db)):
    current = _require_admin(request, db)
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
    return _serialize_user(user)


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, request: Request, db: Session = Depends(get_db)):
    current = _require_admin(request, db)
    if current.id == user_id:
        raise HTTPException(400, "No podés eliminar tu propio usuario")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    db.delete(user)
    db.commit()


@app.put("/api/users/{user_id}/password", status_code=204)
def change_user_password(user_id: int, body: ChangePasswordRequest, request: Request, db: Session = Depends(get_db)):
    current = _current_user(request, db)
    if not current.is_admin and current.id != user_id:
        raise HTTPException(403, "Sin permisos")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    user.hashed_password = _hash_password(body.new_password)
    db.commit()


@app.get("/api/settings/branding", response_model=BrandingSettings)
def get_branding_settings(request: Request, db: Session = Depends(get_db)):
    # Public endpoint: try to get company from auth token, fallback to first company
    company_id: Optional[int] = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            username = _decode_token(auth.split(" ", 1)[1])
            user = db.query(User).filter(User.username == username).first()
            if user:
                company_id = user.company_id
        except Exception:
            pass
    return _get_branding_settings(db, company_id)


@app.put("/api/settings/branding", response_model=BrandingSettings)
def update_branding_settings(body: BrandingSettings, request: Request, db: Session = Depends(get_db)):
    current = _require_admin(request, db)
    _save_branding_settings(body, db, current.company_id)
    return _get_branding_settings(db, current.company_id)


_SENSITIVE_SETTING_KEYS = {"scraper_service_token"}


@app.get("/api/settings/integrations/status")
def get_integration_status(request: Request, db: Session = Depends(get_db)):
    """Return connection status for each source (clients can see this, no credentials)."""
    _current_user(request, db)
    scraper = _get_scraper_settings(db)
    scraper_url = scraper.get("scraper_service_url", "").strip() if scraper.get("scraper_service_url") else ""
    return {
        "scraper_configured": bool(scraper_url),
        "sources": [
            {"name": "Zonaprop", "key": "zonaprop", "available": bool(scraper_url)},
            {"name": "Argenprop", "key": "argenprop", "available": bool(scraper_url)},
            {"name": "MercadoLibre", "key": "mercadolibre", "available": bool(scraper_url)},
        ],
    }


@app.get("/api/settings/params")
def get_system_params(request: Request, db: Session = Depends(get_db)):
    current = _require_admin(request, db)
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


def _parse_steps(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        return json.loads(raw)
    except Exception:
        return []


def _get_acm_or_404(acm_id: int, db: Session) -> ACM:
    acm = db.query(ACM).filter(ACM.id == acm_id, ACM.deleted_at.is_(None)).first()
    if not acm:
        raise HTTPException(status_code=404, detail=f"ACM {acm_id} no encontrado")
    return acm


def _get_comparable_or_404(acm_id: int, cid: int, db: Session) -> Comparable:
    comp = db.query(Comparable).filter(
        Comparable.id == cid, Comparable.acm_id == acm_id
    ).first()
    if not comp:
        raise HTTPException(status_code=404, detail=f"Comparable {cid} no encontrado")
    return comp


def _requires_approval(acm: ACM) -> bool:
    return bool(acm.owner and acm.owner.needs_approval)


def _serialize_approval_comment(comment: ApprovalComment) -> ApprovalCommentRead:
    data = ApprovalCommentRead.model_validate(comment)
    data.author_username = comment.author.username if comment.author else None
    return data


def _mark_acm_pending_if_required(acm: ACM):
    if _requires_approval(acm):
        # Only transition to pending if not already in an active approval state
        if acm.approval_status == ApprovalStatus.no_requerida:
            acm.approval_status = ApprovalStatus.pendiente
    else:
        acm.approval_status = ApprovalStatus.no_requerida
        acm.approved_by_id = None
        acm.approved_at = None


_BRANDING_DEFAULTS = {
    "app_name": "ACM Real Estate",
    "primary_color": "#1a3a5c",
    "logo_data_url": None,
}


def _get_first_company_id(db: Session) -> Optional[int]:
    co = db.query(Company).order_by(Company.id).first()
    return co.id if co else None


def _get_branding_settings(db: Session, company_id: Optional[int] = None) -> BrandingSettings:
    cid = company_id or _get_first_company_id(db)
    payload = {}
    for key, default in _BRANDING_DEFAULTS.items():
        val = _get_company_setting(db, cid, key) if cid else None
        payload[key] = val if val is not None else default
    return BrandingSettings(**payload)


def _save_branding_settings(body: BrandingSettings, db: Session, company_id: int) -> None:
    for key, value in body.model_dump().items():
        _save_company_setting(db, company_id, key, value if value is not None else "")


def _make_snapshot(obj) -> calc.PropertySnapshot:
    return calc.PropertySnapshot(
        superficie_cubierta=obj.superficie_cubierta,
        superficie_semicubierta=getattr(obj, "superficie_semicubierta", None),
        superficie_descubierta=getattr(obj, "superficie_descubierta", None),
        piso=obj.piso,
        antiguedad=obj.antiguedad,
        orientacion=obj.orientacion,
        estado=obj.estado,
        calidad=obj.calidad,
        distribucion=obj.distribucion,
        cochera=getattr(obj, "cochera", None),
        pileta=getattr(obj, "pileta", None),
    )


def _enrich_comparable(acm: ACM, comp: Comparable) -> ComparableRead:
    subject = _make_snapshot(acm)
    comp_snap = _make_snapshot(comp)
    overrides = {
        "factor_antiguedad": comp.factor_antiguedad,
        "factor_estado": comp.factor_estado,
        "factor_calidad": comp.factor_calidad,
        "factor_superficie": comp.factor_superficie,
        "factor_piso": comp.factor_piso,
        "factor_orientacion": comp.factor_orientacion,
        "factor_distribucion": comp.factor_distribucion,
        "factor_oferta": comp.factor_oferta,
        "factor_oportunidad": comp.factor_oportunidad,
        "factor_cochera": comp.factor_cochera,
        "factor_pileta": comp.factor_pileta,
        "factor_luminosidad": comp.factor_luminosidad,
        "factor_vistas": comp.factor_vistas,
        "factor_amenities": comp.factor_amenities,
    }
    result = calc.compute_adjusted_price(
        subject=subject,
        comp=comp_snap,
        precio=comp.precio,
        dias_mercado=comp.dias_mercado,
        oportunidad_mercado=comp.oportunidad_mercado or False,
        overrides=overrides,
    )
    data = ComparableRead.model_validate(comp)
    data.precio_m2_publicado = result["precio_m2_publicado"]
    data.precio_ajustado_m2 = result["precio_ajustado_m2"]
    return data


# --- ACM endpoints ---

_COMPUTED_FIELDS = {"superficie_homogeneizada"}


def _get_acm_checked(acm_id: int, request: Request, db: Session) -> ACM:
    current = _current_user(request, db)
    acm = _get_acm_or_404(acm_id, db)
    _check_acm_access(acm, current)
    return acm


def _check_acm_access(acm: ACM, current: User):
    if acm.company_id != current.company_id:
        raise HTTPException(403, "Sin acceso a este ACM")
    if not current.is_admin and acm.owner_id != current.id:
        raise HTTPException(403, "Sin acceso a este ACM")


@app.post("/api/acm", response_model=ACMRead, status_code=201)
def create_acm(body: ACMCreate, request: Request, db: Session = Depends(get_db)):
    current = _current_user(request, db)
    acm = ACM(**body.model_dump(exclude=_COMPUTED_FIELDS), owner_id=current.id, company_id=current.company_id)
    _mark_acm_pending_if_required(acm)
    db.add(acm)
    db.commit()
    db.refresh(acm)
    return _build_acm_read(acm)


@app.get("/api/acm/stages")
def get_stages():
    """Ordered stage list — single source of truth for frontend."""
    return {"stages": STAGE_ORDER}


@app.get("/api/acm", response_model=list[ACMSummary])
def list_acms(request: Request, db: Session = Depends(get_db)):
    current = _current_user(request, db)
    query = (
        db.query(ACM)
        .filter(ACM.deleted_at.is_(None), ACM.company_id == current.company_id)
        .order_by(ACM.fecha_creacion.desc())
    )
    if not current.is_admin:
        query = query.filter(ACM.owner_id == current.id)
    result = []
    for acm in query.all():
        s = ACMSummary.model_validate(acm)
        s.cantidad_comparables = len(acm.comparables)
        s.owner_username = acm.owner.username if acm.owner else None
        s.requires_approval = _requires_approval(acm)
        result.append(s)
    return result


@app.get("/api/acm/{acm_id}", response_model=ACMRead)
def get_acm(acm_id: int, request: Request, db: Session = Depends(get_db)):
    current = _current_user(request, db)
    acm = _get_acm_or_404(acm_id, db)
    _check_acm_access(acm, current)
    return _build_acm_read(acm)


@app.patch("/api/acm/{acm_id}", response_model=ACMRead)
def update_acm(acm_id: int, body: ACMUpdate, request: Request, db: Session = Depends(get_db)):
    current = _current_user(request, db)
    acm = _get_acm_or_404(acm_id, db)
    _check_acm_access(acm, current)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(acm, field, value)
    if body.model_dump(exclude_none=True):
        _mark_acm_pending_if_required(acm)
    db.commit()
    db.refresh(acm)
    return _build_acm_read(acm)


@app.delete("/api/acm/{acm_id}", status_code=204)
def delete_acm(acm_id: int, request: Request, db: Session = Depends(get_db)):
    current = _current_user(request, db)
    acm = _get_acm_or_404(acm_id, db)
    _check_acm_access(acm, current)
    acm.deleted_at = datetime.utcnow()
    db.commit()
    logger.info("soft_delete acm=%d by=%s", acm_id, current.username)


@app.patch("/api/acm/{acm_id}/stage", response_model=ACMRead)
def update_stage(acm_id: int, body: StageUpdateRequest, request: Request, db: Session = Depends(get_db)):
    if body.stage not in STAGE_ORDER:
        raise HTTPException(400, f"Etapa inválida: '{body.stage}'. Válidas: {STAGE_ORDER}")
    acm = _get_acm_checked(acm_id, request, db)
    old_stage = acm.stage
    acm.stage = body.stage
    _mark_acm_pending_if_required(acm)
    db.commit()
    db.refresh(acm)
    logger.info("stage_change acm=%d %s→%s", acm_id, old_stage, body.stage)
    return _build_acm_read(acm)


@app.patch("/api/acm/{acm_id}/step", response_model=ACMRead)
def update_step(acm_id: int, body: StepUpdateRequest, request: Request, db: Session = Depends(get_db)):
    if body.step not in STEP_ORDER:
        raise HTTPException(400, f"Step inválido: '{body.step}'. Válidos: {STEP_ORDER}")
    acm = _get_acm_checked(acm_id, request, db)
    steps = _parse_steps(acm.steps_completed)
    if body.completed:
        if body.step not in steps:
            steps.append(body.step)
    else:
        steps = [s for s in steps if s != body.step]
    acm.steps_completed = json.dumps(steps)
    acm.current_step = body.step
    db.commit()
    db.refresh(acm)
    logger.info("step_update acm=%d step=%s completed=%s", acm_id, body.step, body.completed)
    return _build_acm_read(acm)


def _build_acm_read(acm: ACM) -> ACMRead:
    enriched = [_enrich_comparable(acm, c) for c in acm.comparables]
    data = ACMRead.model_validate(acm)
    data.owner_username = acm.owner.username if acm.owner else None
    data.requires_approval = _requires_approval(acm)
    data.comparables = enriched
    data.approval_comments = [_serialize_approval_comment(c) for c in acm.approval_comments]
    return data


# --- Comparable endpoints ---

@app.post("/api/acm/{acm_id}/comparable", response_model=ComparableRead, status_code=201)
def add_comparable(acm_id: int, body: ComparableCreate, request: Request, db: Session = Depends(get_db)):
    acm = _get_acm_checked(acm_id, request, db)
    comp = Comparable(acm_id=acm_id, **body.model_dump(exclude=_COMPUTED_FIELDS))
    db.add(comp)
    _mark_acm_pending_if_required(acm)
    db.commit()
    db.refresh(comp)
    return _enrich_comparable(acm, comp)


@app.put("/api/acm/{acm_id}/comparable/{cid}", response_model=ComparableRead)
def update_comparable(acm_id: int, cid: int, body: ComparableUpdate, request: Request, db: Session = Depends(get_db)):
    acm = _get_acm_checked(acm_id, request, db)
    comp = _get_comparable_or_404(acm_id, cid, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(comp, field, value)
    if body.model_dump(exclude_none=True):
        _mark_acm_pending_if_required(acm)
    db.commit()
    db.refresh(comp)
    return _enrich_comparable(acm, comp)


@app.delete("/api/acm/{acm_id}/comparable/{cid}", status_code=204)
def delete_comparable(acm_id: int, cid: int, request: Request, db: Session = Depends(get_db)):
    acm = _get_acm_checked(acm_id, request, db)
    comp = _get_comparable_or_404(acm_id, cid, db)
    db.delete(comp)
    _mark_acm_pending_if_required(acm)
    db.commit()


# --- Approval workflow ---

@app.get("/api/approvals/pending", response_model=list[ACMSummary])
def list_pending_approvals(request: Request, db: Session = Depends(get_db)):
    current = _require_approver(request, db)
    query = (
        db.query(ACM)
        .filter(ACM.approval_status == ApprovalStatus.pendiente, ACM.company_id == current.company_id)
        .order_by(ACM.updated_at.desc(), ACM.fecha_creacion.desc())
    )
    result = []
    for acm in query.all():
        s = ACMSummary.model_validate(acm)
        s.cantidad_comparables = len(acm.comparables)
        s.owner_username = acm.owner.username if acm.owner else None
        s.requires_approval = _requires_approval(acm)
        result.append(s)
    return result


@app.put("/api/acm/{acm_id}/approval", response_model=ACMRead)
def review_acm(
    acm_id: int,
    body: ApprovalReviewRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    reviewer = _require_approver(request, db)
    acm = _get_acm_or_404(acm_id, db)
    if not _requires_approval(acm):
        raise HTTPException(400, "Esta tasación no requiere aprobación")

    acm.approval_status = body.status
    acm.approved_by_id = reviewer.id if body.status == ApprovalStatus.aprobado else None
    acm.approved_at = datetime.utcnow() if body.status == ApprovalStatus.aprobado else None

    db.query(ApprovalComment).filter(ApprovalComment.acm_id == acm_id).delete()
    for item in body.comments:
        db.add(ApprovalComment(
            acm_id=acm_id,
            section=item.section.strip(),
            message=item.message.strip(),
            author_id=reviewer.id,
        ))
    db.commit()
    db.refresh(acm)
    return _build_acm_read(acm)


# --- Resultado y PDF ---

@app.get("/api/acm/{acm_id}/resultado", response_model=ResultadoResponse)
def get_resultado(acm_id: int, request: Request, db: Session = Depends(get_db)):
    acm = _get_acm_checked(acm_id, request, db)
    if not acm.comparables:
        raise HTTPException(status_code=422, detail="El ACM no tiene comparables")

    subject = _make_snapshot(acm)

    # Build defaults dict from company's modifier options, falling back to calc.DEFAULTS
    current = _current_user(request, db)
    company_modifiers = (
        db.query(ModifierOption)
        .filter(ModifierOption.company_id == current.company_id)
        .all()
    )
    company_defaults = {**calc.DEFAULTS, **{m.factor_key: m.factor_value for m in company_modifiers}}

    comp_resultados = []
    adjusted_prices = []

    for comp in acm.comparables:
        comp_snap = _make_snapshot(comp)
        overrides = {
            "factor_antiguedad": comp.factor_antiguedad,
            "factor_estado": comp.factor_estado,
            "factor_calidad": comp.factor_calidad,
            "factor_superficie": comp.factor_superficie,
            "factor_piso": comp.factor_piso,
            "factor_orientacion": comp.factor_orientacion,
            "factor_distribucion": comp.factor_distribucion,
            "factor_oferta": comp.factor_oferta,
            "factor_oportunidad": comp.factor_oportunidad,
            "factor_cochera": comp.factor_cochera,
            "factor_pileta": comp.factor_pileta,
            "factor_luminosidad": comp.factor_luminosidad,
            "factor_vistas": comp.factor_vistas,
            "factor_amenities": comp.factor_amenities,
        }
        r = calc.compute_adjusted_price(
            subject=subject,
            comp=comp_snap,
            precio=comp.precio,
            dias_mercado=comp.dias_mercado,
            oportunidad_mercado=comp.oportunidad_mercado or False,
            overrides=overrides,
            defaults=company_defaults,
        )
        adjusted_prices.append(r["precio_ajustado_m2"])
        comp_resultados.append(ComparableResultado(
            id=comp.id,
            direccion=comp.direccion,
            url=comp.url,
            precio=comp.precio,
            precio_m2_publicado=r["precio_m2_publicado"],
            factor_total=r["factor_total"],
            precio_ajustado_m2=r["precio_ajustado_m2"],
            detalle_factores=r["detalle_factores"],
        ))

    kpis = calc.compute_kpis(adjusted_prices, subject.superficie_homogeneizada)
    return ResultadoResponse(acm_id=acm_id, comparables=comp_resultados, **kpis)


# --- Ponderadores defaults (también sirve como liveness probe) ---

@app.get("/api/ponderadores/defaults", response_model=PonderadoresDefaults)
def get_defaults():
    return PonderadoresDefaults(**calc.DEFAULTS)


# --- Modifier options ---

@app.get("/api/modifiers", response_model=list[ModifierOptionRead])
def list_modifiers(request: Request, db: Session = Depends(get_db)):
    current = _current_user(request, db)
    return (
        db.query(ModifierOption)
        .filter(ModifierOption.company_id == current.company_id)
        .order_by(ModifierOption.factor_key, ModifierOption.option_label)
        .all()
    )


@app.post("/api/modifiers", response_model=ModifierOptionRead, status_code=201)
def create_modifier(body: ModifierOptionCreate, request: Request, db: Session = Depends(get_db)):
    current = _require_admin(request, db)
    obj = ModifierOption(**body.model_dump(), company_id=current.company_id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@app.put("/api/modifiers/{mid}", response_model=ModifierOptionRead)
def update_modifier(mid: int, body: ModifierOptionUpdate, request: Request, db: Session = Depends(get_db)):
    current = _require_admin(request, db)
    obj = db.query(ModifierOption).filter(
        ModifierOption.id == mid, ModifierOption.company_id == current.company_id
    ).first()
    if not obj:
        raise HTTPException(404, "Modificador no encontrado")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    obj.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(obj)
    return obj


@app.delete("/api/modifiers/{mid}", status_code=204)
def delete_modifier(mid: int, request: Request, db: Session = Depends(get_db)):
    current = _require_admin(request, db)
    obj = db.query(ModifierOption).filter(
        ModifierOption.id == mid, ModifierOption.company_id == current.company_id
    ).first()
    if not obj:
        raise HTTPException(404, "Modificador no encontrado")
    db.delete(obj)
    db.commit()


# --- Integrations ---

_SCRAPER_SERVICE_URL = os.getenv("SCRAPER_SERVICE_URL")
_SCRAPER_SERVICE_TOKEN = os.getenv("SCRAPER_SERVICE_TOKEN", "")
_SCRAPER_SERVICE_URL_BACKUP = os.getenv("SCRAPER_SERVICE_URL_BACKUP")
_SCRAPER_SERVICE_TOKEN_BACKUP = os.getenv("SCRAPER_SERVICE_TOKEN_BACKUP", "")


class ExtractRequest(PydanticBase):
    url: str


@app.post("/api/extract")
async def extract_property(body: ExtractRequest, request: Request, db: Session = Depends(get_db)):
    from integrations import extract as integration_extract
    _current_user(request, db)
    settings = _get_scraper_settings(db)

    # Try primary scraper
    primary_err: Exception | None = None
    try:
        return await integration_extract(body.url.strip(), settings)
    except Exception as exc:
        primary_err = exc

    # Failover to backup scraper if configured
    backup_url = (settings.get("scraper_service_url_backup") or "").strip()
    if backup_url:
        backup_settings = {
            "scraper_service_url": backup_url,
            "scraper_service_token": settings.get("scraper_service_token_backup") or "",
        }
        try:
            return await integration_extract(body.url.strip(), backup_settings)
        except Exception:
            raise HTTPException(
                503,
                "El scraper no está disponible (primario y backup fallaron). "
                "Intentá de nuevo en unos minutos o completá los datos manualmente.",
            )

    raise primary_err


# ── Admin endpoints (/api/admin/*) ────────────────────────────────────────────

@app.post("/api/admin/login")
def admin_login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not _verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    if not user.is_superadmin:
        raise HTTPException(403, "Acceso restringido a superadmin")
    return {
        "access_token": _create_token(user.username),
        "token_type": "bearer",
        "username": user.username,
        "is_superadmin": True,
    }


@app.get("/api/admin/companies")
def admin_list_companies(request: Request, db: Session = Depends(get_db)):
    _require_superadmin(request, db)
    companies = db.query(Company).order_by(Company.id).all()
    result = []
    for co in companies:
        user_count = db.query(User).filter(User.company_id == co.id, User.is_superadmin.is_(False)).count()
        acm_count = db.query(ACM).filter(ACM.company_id == co.id, ACM.deleted_at.is_(None)).count()
        result.append({
            "id": co.id,
            "name": co.name,
            "created_at": co.created_at,
            "user_count": user_count,
            "acm_count": acm_count,
        })
    return result


@app.post("/api/admin/companies", status_code=201)
def admin_create_company(body: CompanyCreate, request: Request, db: Session = Depends(get_db)):
    _require_superadmin(request, db)
    if db.query(Company).filter(Company.name == body.name).first():
        raise HTTPException(409, f"La empresa '{body.name}' ya existe")
    co = Company(name=body.name)
    db.add(co)
    db.commit()
    db.refresh(co)
    return {"id": co.id, "name": co.name, "created_at": co.created_at, "user_count": 0, "acm_count": 0}


@app.get("/api/admin/companies/{company_id}")
def admin_get_company(company_id: int, request: Request, db: Session = Depends(get_db)):
    _require_superadmin(request, db)
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(404, "Empresa no encontrada")
    user_count = db.query(User).filter(User.company_id == co.id, User.is_superadmin.is_(False)).count()
    acm_count = db.query(ACM).filter(ACM.company_id == co.id, ACM.deleted_at.is_(None)).count()
    return {"id": co.id, "name": co.name, "created_at": co.created_at, "user_count": user_count, "acm_count": acm_count}


@app.patch("/api/admin/companies/{company_id}")
def admin_update_company(company_id: int, body: CompanyUpdate, request: Request, db: Session = Depends(get_db)):
    _require_superadmin(request, db)
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(404, "Empresa no encontrada")
    co.name = body.name
    db.commit()
    db.refresh(co)
    return {"id": co.id, "name": co.name, "created_at": co.created_at}


@app.delete("/api/admin/companies/{company_id}", status_code=204)
def admin_delete_company(company_id: int, request: Request, db: Session = Depends(get_db)):
    _require_superadmin(request, db)
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(404, "Empresa no encontrada")
    has_users = db.query(User).filter(User.company_id == company_id, User.is_superadmin.is_(False)).count() > 0
    if has_users:
        raise HTTPException(400, "No se puede eliminar una empresa con usuarios activos")
    db.delete(co)
    db.commit()


@app.get("/api/admin/companies/{company_id}/users")
def admin_list_company_users(company_id: int, request: Request, db: Session = Depends(get_db)):
    _require_superadmin(request, db)
    users = (
        db.query(User)
        .filter(User.company_id == company_id, User.is_superadmin.is_(False))
        .order_by(User.id)
        .all()
    )
    return [_serialize_user(u) for u in users]


@app.post("/api/admin/companies/{company_id}/users", status_code=201)
def admin_create_company_user(company_id: int, body: AdminUserCreate, request: Request, db: Session = Depends(get_db)):
    _require_superadmin(request, db)
    if not db.query(Company).filter(Company.id == company_id).first():
        raise HTTPException(404, "Empresa no encontrada")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(409, f"El usuario '{body.username}' ya existe")
    user = User(
        username=body.username,
        hashed_password=_hash_password(body.password),
        is_admin=body.is_admin,
        is_approver=body.is_approver,
        needs_approval=body.needs_approval,
        company_id=company_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@app.patch("/api/admin/companies/{company_id}/users/{user_id}")
def admin_update_company_user(company_id: int, user_id: int, body: UserUpdate, request: Request, db: Session = Depends(get_db)):
    _require_superadmin(request, db)
    user = db.query(User).filter(User.id == user_id, User.company_id == company_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@app.put("/api/admin/companies/{company_id}/users/{user_id}/password", status_code=204)
def admin_change_company_user_password(
    company_id: int, user_id: int, body: ChangePasswordRequest, request: Request, db: Session = Depends(get_db)
):
    _require_superadmin(request, db)
    user = db.query(User).filter(User.id == user_id, User.company_id == company_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    user.hashed_password = _hash_password(body.new_password)
    db.commit()


@app.delete("/api/admin/companies/{company_id}/users/{user_id}", status_code=204)
def admin_delete_company_user(company_id: int, user_id: int, request: Request, db: Session = Depends(get_db)):
    _require_superadmin(request, db)
    user = db.query(User).filter(User.id == user_id, User.company_id == company_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    db.delete(user)
    db.commit()


@app.get("/api/admin/companies/{company_id}/acms")
def admin_list_company_acms(company_id: int, request: Request, db: Session = Depends(get_db)):
    _require_superadmin(request, db)
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
        s.requires_approval = _requires_approval(acm)
        result.append(s)
    return result


# ── Admin integration settings ────────────────────────────────────────────────

class GlobalIntegrationSettings(PydanticBase):
    scraper_service_url: Optional[str] = None
    scraper_service_token: Optional[str] = None
    scraper_service_url_backup: Optional[str] = None
    scraper_service_token_backup: Optional[str] = None


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


@app.get("/api/admin/settings/integrations")
def admin_get_integration_settings(request: Request, db: Session = Depends(get_db)):
    _require_superadmin(request, db)
    raw = _get_scraper_settings(db)
    return GlobalIntegrationSettings(
        scraper_service_url=raw.get("scraper_service_url"),
        scraper_service_token="***" if raw.get("scraper_service_token") else None,
        scraper_service_url_backup=raw.get("scraper_service_url_backup"),
        scraper_service_token_backup="***" if raw.get("scraper_service_token_backup") else None,
    )


@app.put("/api/admin/settings/integrations")
def admin_update_integration_settings(body: GlobalIntegrationSettings, request: Request, db: Session = Depends(get_db)):
    _require_superadmin(request, db)
    if body.scraper_service_url is not None:
        _save_platform_setting(db, "scraper_service_url", body.scraper_service_url.strip())
    if body.scraper_service_token is not None and body.scraper_service_token != "***":
        _save_platform_setting(db, "scraper_service_token", body.scraper_service_token.strip())
    if body.scraper_service_url_backup is not None:
        _save_platform_setting(db, "scraper_service_url_backup", body.scraper_service_url_backup.strip())
    if body.scraper_service_token_backup is not None and body.scraper_service_token_backup != "***":
        _save_platform_setting(db, "scraper_service_token_backup", body.scraper_service_token_backup.strip())
    return admin_get_integration_settings(request, db)


@app.get("/api/admin/settings/integrations/status")
async def admin_integration_status(request: Request, db: Session = Depends(get_db)):
    _require_superadmin(request, db)
    raw = _get_scraper_settings(db)
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


# --- Legacy Zonaprop parser (kept for scraper microservice — not used by main app) ---

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9",
}


_TIPO_MAP = {
    "departamento": "Departamento",
    "casa": "Casa",
    "ph": "PH",
    "local": "Local",
    "local comercial": "Local",
}


def _parse_zonaprop_html(html: str) -> dict:
    """Parse Zonaprop SSR pages (no __NEXT_DATA__). Uses JSON-LD + inline dataLayerInfo."""
    soup = BeautifulSoup(html, "html.parser")
    result: dict = {}

    # --- 1. JSON-LD: address, surface, rooms, type, publication date ---
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            d = json.loads(script.string or "")
        except Exception:
            continue
        schema_type = d.get("@type", "")
        if schema_type not in ("Apartment", "House", "SingleFamilyResidence", "RealEstateListing"):
            continue

        # Address
        addr = d.get("address", {})
        street = addr.get("streetAddress", "").strip()
        region = addr.get("addressRegion", "").strip()
        if street:
            result["direccion"] = f"{street}, {region}".strip(", ") if region else street

        # Surface (floorSize = total covered)
        floor_size = d.get("floorSize", {})
        if isinstance(floor_size, dict) and floor_size.get("value"):
            result["superficie_cubierta"] = float(floor_size["value"])

        # Property type
        raw_type = schema_type.lower()
        if raw_type in ("house", "singlefamilyresidence"):
            result["tipo"] = "Casa"
        elif raw_type == "apartment":
            result["tipo"] = "Departamento"

        # Publication date → days on market
        for key in ("datePosted", "datePublished", "uploadDate"):
            pub_str = d.get(key)
            if isinstance(pub_str, str):
                try:
                    pub = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
                    result["dias_mercado"] = max(0, (datetime.now(timezone.utc) - pub).days)
                except Exception:
                    pass
                break

        break  # only use first matching schema

    # --- 2. dataLayerInfo inline JS: price, property type, city ---
    for script in soup.find_all("script"):
        src = script.string or ""
        if "dataLayerInfo" not in src:
            continue
        m = re.search(r"dataLayerInfo\s*=\s*\{([^}]+)\}", src, re.DOTALL)
        if not m:
            continue
        # Parse JS object (single-quoted keys/values) into dict
        pairs = re.findall(r"'([^']+)'\s*:\s*'([^']*)'", m.group(1))
        info = {k.strip(): v.strip() for k, v in pairs}

        # Price from sellPrice: "USD 148600"
        sell = info.get("sellPrice", "")
        if "USD" in sell.upper():
            nums = re.findall(r"\d+", sell.replace(".", "").replace(",", ""))
            for n in nums:
                v = int(n)
                if 1_000 < v < 100_000_000:
                    result["precio"] = v
                    break

        # Property type override (more reliable than JSON-LD @type)
        raw_tipo = info.get("propertyType", "").lower().strip()
        if raw_tipo in _TIPO_MAP:
            result["tipo"] = _TIPO_MAP[raw_tipo]

        # City as fallback address
        city = info.get("city", "").strip()
        if city and "direccion" not in result:
            result["direccion"] = city

        break

    # --- 3. Fallback price from visible span (e.g. "USD 148.600") ---
    if "precio" not in result:
        for span in soup.find_all("span"):
            t = span.get_text(" ", strip=True)
            if re.match(r"USD\s*[\d.,]+", t, re.I):
                nums = re.findall(r"\d+", t.replace(".", "").replace(",", ""))
                for n in nums:
                    v = int(n)
                    if 1_000 < v < 100_000_000:
                        result["precio"] = v
                        break
                if "precio" in result:
                    break

    # --- 4. Feature icons: surface if not in JSON-LD ---
    if "superficie_cubierta" not in result:
        features_section = soup.find(class_=re.compile(r"section-main-features|section-icon-features"))
        if features_section:
            text = features_section.get_text(" ", strip=True)
            m2_cub = re.search(r"(\d+(?:[.,]\d+)?)\s*m²?\s*cub", text, re.I)
            m2_tot = re.search(r"(\d+(?:[.,]\d+)?)\s*m²?\s*tot", text, re.I)
            if m2_cub:
                result["superficie_cubierta"] = float(m2_cub.group(1).replace(",", "."))
            elif m2_tot:
                result["superficie_cubierta"] = float(m2_tot.group(1).replace(",", "."))

    # --- 5. Days on market from "Publicado hace N días/meses" text ---
    if "dias_mercado" not in result:
        antiquity_el = soup.find(string=re.compile(r"Publicado hace", re.I))
        if antiquity_el:
            m = re.search(r"hace\s+(\d+)\s+(día|mes|año)", antiquity_el, re.I)
            if m:
                n, unit = int(m.group(1)), m.group(2).lower()
                if unit.startswith("día"):
                    result["dias_mercado"] = n
                elif unit.startswith("mes"):
                    result["dias_mercado"] = n * 30
                elif unit.startswith("año"):
                    result["dias_mercado"] = n * 365

    # --- 6. Orientation from icon-orientacion ---
    _ORI_MAP = {"n": "Norte", "s": "Sur", "e": "Este", "o": "Oeste", "i": "Interno",
                "norte": "Norte", "sur": "Sur", "este": "Este", "oeste": "Oeste", "interno": "Interno"}
    ori_icon = soup.find("i", class_="icon-orientacion")
    if ori_icon:
        li = ori_icon.find_parent("li")
        raw = li.get_text(strip=True).lower() if li else ""
        if raw in _ORI_MAP:
            result["orientacion"] = _ORI_MAP[raw]

    # --- 7. Antigüedad from icon-antiguedad ---
    ant_icon = soup.find("i", class_="icon-antiguedad")
    if ant_icon:
        li = ant_icon.find_parent("li")
        raw = li.get_text(strip=True) if li else ""
        m = re.search(r"(\d+)", raw)
        if m:
            result["antiguedad"] = int(m.group(1))

    return result


def _parse_next_data(html: str) -> dict:
    """Parse Zonaprop pages that use Next.js __NEXT_DATA__ (newer listing format)."""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.+?)</script>', html, re.DOTALL)
    if not m:
        return {}
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}

    page_props = data.get("props", {}).get("pageProps", {})

    listing = None
    for key in ("listing", "listingData", "posting", "propertyData"):
        c = page_props.get(key)
        if isinstance(c, dict) and c:
            listing = c
            break
    if listing is None:
        initial = page_props.get("initialData", {})
        for key in ("posting", "listing"):
            c = initial.get(key) if isinstance(initial, dict) else None
            if isinstance(c, dict) and c:
                listing = c
                break
    if not listing:
        return {}

    result = {}

    price_obj = listing.get("price") or {}
    if isinstance(price_obj, dict):
        amount = price_obj.get("amount") or price_obj.get("value")
        if amount and price_obj.get("currency", "USD") == "USD":
            result["precio"] = int(float(amount))
    if "precio" not in result:
        for p in (listing.get("priceOperationType") or {}).get("prices", []):
            if isinstance(p, dict) and p.get("currency") == "USD":
                result["precio"] = int(float(p.get("amount", 0)))
                break

    for getter in [
        lambda l: l.get("address"),
        lambda l: (l.get("location") or {}).get("address", {}).get("name"),
        lambda l: (l.get("location") or {}).get("fullLocation"),
        lambda l: l.get("title"),
    ]:
        try:
            v = getter(listing)
            if isinstance(v, str) and v.strip():
                result["direccion"] = v.strip()
                break
        except Exception:
            pass

    for key in ("createdOn", "publishDate", "publicationDate", "createdAt", "listingDate"):
        pub_str = listing.get(key)
        if isinstance(pub_str, str):
            try:
                pub = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
                result["dias_mercado"] = max(0, (datetime.now(timezone.utc) - pub).days)
                break
            except Exception:
                pass

    return result


async def _fetch_zonaprop(url: str) -> str:  # kept for scraper microservice compatibility
    last_exc: Exception | None = None
    for attempt in range(len(_ZONAPROP_RETRY_DELAYS) + 1):
        try:
            async with httpx.AsyncClient(
                headers=_BROWSER_HEADERS, follow_redirects=True, timeout=10
            ) as client:
                r = await client.get(url)
            if r.status_code in _ZONAPROP_RETRYABLE_STATUSES:
                raise httpx.HTTPStatusError(
                    f"status {r.status_code}", request=r.request, response=r
                )
            r.raise_for_status()
            return r.text
        except httpx.HTTPStatusError as e:
            last_exc = e
        except Exception as e:
            last_exc = e
        if attempt < len(_ZONAPROP_RETRY_DELAYS):
            await asyncio.sleep(_ZONAPROP_RETRY_DELAYS[attempt])
    raise HTTPException(
        422,
        "No pudimos acceder automáticamente a los datos en este momento. "
        "Esto puede deberse a restricciones temporales del sitios. "
        "Podés intentar nuevamente o completar los datos manualmente.",
    )


# ── Agenda ────────────────────────────────────────────────────────────────────

import secrets
import uuid
from fastapi import Query
from fastapi.responses import Response as FastAPIResponse

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


# ── Events CRUD ───────────────────────────────────────────────────────────────

@app.get("/api/agenda/events")
def list_events(
    request: Request,
    db: Session = Depends(get_db),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
):
    user = _current_user(request, db)
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


@app.post("/api/agenda/events", status_code=201)
def create_event(body: CalendarEventCreate, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
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


@app.put("/api/agenda/events/{event_id}")
def update_event(event_id: int, body: CalendarEventUpdate, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
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


@app.delete("/api/agenda/events/{event_id}", status_code=204)
def delete_event(event_id: int, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
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


@app.get("/api/agenda/ical/{token}", response_class=FastAPIResponse)
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
        f"X-WR-CALNAME:Reval Agenda",
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

@app.get("/api/agenda/integrations")
def list_integrations(request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
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


@app.post("/api/agenda/integrations/ical", status_code=201)
def create_ical_feed(request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
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


@app.delete("/api/agenda/integrations/ical", status_code=204)
def delete_ical_feed(request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    intg = db.query(UserCalendarIntegration).filter(
        UserCalendarIntegration.user_id == user.id,
        UserCalendarIntegration.provider == "ical",
    ).first()
    if intg:
        db.delete(intg)
        db.commit()


# ── Google OAuth ──────────────────────────────────────────────────────────��────

@app.get("/api/agenda/integrations/available")
def integrations_available(request: Request, db: Session = Depends(get_db)):
    _current_user(request, db)
    return {
        "google": bool(_GOOGLE_CLIENT_ID and _GOOGLE_CLIENT_SECRET),
    }


@app.get("/api/agenda/integrations/google/auth")
def google_auth_url(request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    if not _GOOGLE_CLIENT_ID or not _GOOGLE_CLIENT_SECRET:
        raise HTTPException(501, "Google Calendar no está configurado")
    state = _create_token(user.username)
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


@app.get("/api/agenda/integrations/google/callback")
async def google_callback(code: str, state: str, db: Session = Depends(get_db)):
    try:
        username = _decode_token(state)
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

    from starlette.responses import RedirectResponse
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


@app.post("/api/agenda/integrations/google/sync")
async def google_sync(request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
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

    # Push local events that don't have a google_event_id yet
    local_events = db.query(CalendarEvent).filter(
        CalendarEvent.company_id == user.company_id,
        CalendarEvent.owner_id == user.id,
        CalendarEvent.deleted_at.is_(None),
        CalendarEvent.google_event_id.is_(None),
    ).all()

    async with httpx.AsyncClient() as client:
        for evt in local_events:
            body = {
                "summary": evt.title,
                "description": evt.description or "",
                "location": evt.location or "",
                "start": {"dateTime": evt.start_datetime.isoformat() + "Z", "timeZone": "UTC"} if not evt.all_day else {"date": evt.start_datetime.strftime("%Y-%m-%d")},
                "end": {"dateTime": evt.end_datetime.isoformat() + "Z", "timeZone": "UTC"} if not evt.all_day else {"date": evt.end_datetime.strftime("%Y-%m-%d")},
            }
            r = await client.post(
                f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events",
                json=body,
                headers={"Authorization": f"Bearer {token}"},
            )
            if r.is_success:
                evt.google_event_id = r.json().get("id")
                pushed += 1

        # Pull events from Google not in local DB
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


@app.delete("/api/agenda/integrations/google", status_code=204)
def google_disconnect(request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    intg = db.query(UserCalendarIntegration).filter(
        UserCalendarIntegration.user_id == user.id,
        UserCalendarIntegration.provider == "google",
    ).first()
    if intg:
        intg.is_active = False
        intg.access_token = None
        intg.refresh_token = None
        db.commit()



