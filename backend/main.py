import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from models import (
    ACM,
    AppSetting,
    Base,
    Company,
    CompanyModule,
    CompanyModuleUnlock,
    CompanySetting,
    ModifierOption,
    SessionLocal,
    User,
    engine,
)
from core.auth import AuthMiddleware, hash_password
from core.db import get_db  # noqa: F401 — re-exported for any legacy direct imports

logger = logging.getLogger("acm")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

_STAGE_MIGRATION = {
    "Borrador": "nuevo",
    "En progreso": "en_progreso",
    "Finalizado": "finalizado",
    "Cancelado": "cancelado",
}

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    from modules.acm_core.router import _mark_acm_pending_if_required

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        # Column migrations — each statement is tried individually; errors are ignored (idempotent).
        for stmt in (
            "ALTER TABLE acm ALTER COLUMN stage TYPE VARCHAR USING stage::text",  # PG only
            "ALTER TABLE acm ADD COLUMN current_step VARCHAR DEFAULT 'sujeto'",
            "ALTER TABLE acm ADD COLUMN steps_completed VARCHAR DEFAULT '[]'",
            "ALTER TABLE acm ADD COLUMN deleted_at TIMESTAMP",
            "ALTER TABLE users ADD COLUMN is_superadmin BOOLEAN DEFAULT 0",
            "ALTER TABLE users ADD COLUMN company_id INTEGER",
            "ALTER TABLE acm ADD COLUMN company_id INTEGER",
            "ALTER TABLE acm ADD COLUMN approval_status VARCHAR DEFAULT 'No requerida'",
            "ALTER TABLE acm ADD COLUMN approved_by_id INTEGER",
            "ALTER TABLE acm ADD COLUMN approved_at TIMESTAMP",
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

        # Multi-tenant bootstrap
        if db.query(Company).count() == 0:
            default_co = Company(name="Default")
            db.add(default_co)
            db.commit()
            db.refresh(default_co)
        else:
            default_co = db.query(Company).order_by(Company.id).first()

        default_cid = default_co.id

        db.query(User).filter(User.company_id.is_(None)).update(
            {User.company_id: default_cid}, synchronize_session=False
        )
        db.commit()

        db.query(ACM).filter(ACM.company_id.is_(None)).update(
            {ACM.company_id: default_cid}, synchronize_session=False
        )
        db.commit()

        for setting in db.query(AppSetting).all():
            exists = db.query(CompanySetting).filter(
                CompanySetting.company_id == default_cid,
                CompanySetting.key == setting.key,
            ).first()
            if not exists:
                db.add(CompanySetting(company_id=default_cid, key=setting.key, value=setting.value))
        db.commit()

        for company in db.query(Company).all():
            has_modifiers = db.query(ModifierOption).filter(ModifierOption.company_id == company.id).first()
            if not has_modifiers:
                for factor_key, option_label, factor_value in _DEFAULT_MODIFIER_SEED:
                    db.add(ModifierOption(
                        company_id=company.id,
                        factor_key=factor_key,
                        option_label=option_label,
                        factor_value=factor_value,
                    ))
        db.commit()

        # Seed module unlocks + installs for existing companies so they start with all modules.
        # New companies added later must be seeded explicitly by the superadmin.
        from modules.module_registry.router import ALL_MODULE_IDS as _ALL_MODULE_IDS
        for company in db.query(Company).all():
            for mid in _ALL_MODULE_IDS:
                if not db.query(CompanyModuleUnlock).filter(
                    CompanyModuleUnlock.company_id == company.id,
                    CompanyModuleUnlock.module_id == mid,
                ).first():
                    db.add(CompanyModuleUnlock(company_id=company.id, module_id=mid))
                if not db.query(CompanyModule).filter(
                    CompanyModule.company_id == company.id,
                    CompanyModule.module_id == mid,
                ).first():
                    db.add(CompanyModule(company_id=company.id, module_id=mid))
        db.commit()

        sa_user = os.getenv("SUPERADMIN_USERNAME")
        sa_pass = os.getenv("SUPERADMIN_PASSWORD")
        if sa_user and sa_pass:
            existing = db.query(User).filter(User.username == sa_user).first()
            if existing:
                if not existing.is_superadmin:
                    existing.is_superadmin = True
                    existing.hashed_password = hash_password(sa_pass)
                    db.commit()
            else:
                db.add(User(
                    username=sa_user,
                    hashed_password=hash_password(sa_pass),
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

# ── Routers ───────────────────────────────────────────────────────────────────

from admin.router import router as admin_router
from settings.router import router as settings_router
from modules.acm_core.router import router as acm_router
from modules.acm_reviews.router import router as reviews_router
from modules.acm_integrations.router import router as extract_router
from modules.agenda.router import router as agenda_router
from modules.module_registry.router import router as modules_router

app.include_router(admin_router)
app.include_router(settings_router)
app.include_router(acm_router)
app.include_router(reviews_router)
app.include_router(extract_router)
app.include_router(agenda_router)
app.include_router(modules_router)
