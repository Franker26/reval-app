from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from starlette.requests import Request

from core.auth import current_user, require_admin, require_superadmin
from core.db import get_db
from models import Company, CompanyModule, CompanyModuleUnlock, ModuleUnlockRequest

router = APIRouter()

ALL_MODULE_IDS = [
    "acm-core",
    "agenda",
    "acm-reviews",
    "acm-integrations",
    "int-meli",
    "int-zonaprop",
    "int-argenprop",
    "int-osm",
]


def _get_installed_ids(db: Session, company_id: int) -> list[str]:
    rows = db.query(CompanyModule).filter(CompanyModule.company_id == company_id).all()
    return [r.module_id for r in rows]


def _get_unlocked_ids(db: Session, company_id: int) -> list[str]:
    rows = db.query(CompanyModuleUnlock).filter(CompanyModuleUnlock.company_id == company_id).all()
    return [r.module_id for r in rows]


@router.get("/api/modules")
def list_modules(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    installed = _get_installed_ids(db, user.company_id)
    unlocked = _get_unlocked_ids(db, user.company_id)
    return {
        "installed": installed,
        "unlocked": unlocked,
    }


@router.post("/api/modules/{module_id}/install", status_code=201)
def install_module(module_id: str, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    if module_id not in ALL_MODULE_IDS:
        raise HTTPException(404, f"Módulo '{module_id}' no existe")
    unlocked = _get_unlocked_ids(db, admin.company_id)
    if module_id not in unlocked:
        raise HTTPException(403, "El módulo no está desbloqueado para esta empresa")
    already = db.query(CompanyModule).filter(
        CompanyModule.company_id == admin.company_id,
        CompanyModule.module_id == module_id,
    ).first()
    if already:
        raise HTTPException(409, "El módulo ya está instalado")
    db.add(CompanyModule(company_id=admin.company_id, module_id=module_id))
    db.commit()
    return {"module_id": module_id, "installed": True}


@router.delete("/api/modules/{module_id}", status_code=204)
def uninstall_module(module_id: str, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    row = db.query(CompanyModule).filter(
        CompanyModule.company_id == admin.company_id,
        CompanyModule.module_id == module_id,
    ).first()
    if not row:
        raise HTTPException(404, "El módulo no está instalado")
    db.delete(row)
    db.commit()


@router.post("/api/modules/{module_id}/request-unlock", status_code=202)
def request_unlock(module_id: str, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    if module_id not in ALL_MODULE_IDS:
        raise HTTPException(404, f"Módulo '{module_id}' no existe")
    unlocked = _get_unlocked_ids(db, admin.company_id)
    if module_id in unlocked:
        raise HTTPException(409, "El módulo ya está desbloqueado")
    db.add(ModuleUnlockRequest(company_id=admin.company_id, module_id=module_id))
    db.commit()
    count = db.query(ModuleUnlockRequest).filter(
        ModuleUnlockRequest.company_id == admin.company_id,
        ModuleUnlockRequest.module_id == module_id,
    ).count()
    return {"module_id": module_id, "requested": True, "request_count": count}


# ── Superadmin endpoints ──────────────────────────────────────────────────────

@router.post("/api/admin/companies/{company_id}/modules/{module_id}/unlock", status_code=201)
def unlock_module(company_id: int, module_id: str, request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    if not db.query(Company).filter(Company.id == company_id).first():
        raise HTTPException(404, "Empresa no encontrada")
    if module_id not in ALL_MODULE_IDS:
        raise HTTPException(404, f"Módulo '{module_id}' no existe")
    already = db.query(CompanyModuleUnlock).filter(
        CompanyModuleUnlock.company_id == company_id,
        CompanyModuleUnlock.module_id == module_id,
    ).first()
    if already:
        raise HTTPException(409, "El módulo ya está desbloqueado para esta empresa")
    db.add(CompanyModuleUnlock(company_id=company_id, module_id=module_id))
    # Clear pending requests once superadmin grants access
    db.query(ModuleUnlockRequest).filter(
        ModuleUnlockRequest.company_id == company_id,
        ModuleUnlockRequest.module_id == module_id,
    ).delete()
    db.commit()
    return {"company_id": company_id, "module_id": module_id, "unlocked": True}


@router.delete("/api/admin/companies/{company_id}/modules/{module_id}/unlock", status_code=204)
def lock_module(company_id: int, module_id: str, request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    row = db.query(CompanyModuleUnlock).filter(
        CompanyModuleUnlock.company_id == company_id,
        CompanyModuleUnlock.module_id == module_id,
    ).first()
    if not row:
        raise HTTPException(404, "El módulo no está desbloqueado para esta empresa")
    db.delete(row)
    db.commit()
    # Also remove install record if present
    installed = db.query(CompanyModule).filter(
        CompanyModule.company_id == company_id,
        CompanyModule.module_id == module_id,
    ).first()
    if installed:
        db.delete(installed)
        db.commit()


@router.get("/api/admin/companies/{company_id}/modules")
def list_company_modules(company_id: int, request: Request, db: Session = Depends(get_db)):
    require_superadmin(request, db)
    if not db.query(Company).filter(Company.id == company_id).first():
        raise HTTPException(404, "Empresa no encontrada")
    unlocked = _get_unlocked_ids(db, company_id)
    installed = _get_installed_ids(db, company_id)
    # Count pending unlock requests per module
    pending: dict[str, int] = {}
    rows = (
        db.query(ModuleUnlockRequest.module_id, func.count(ModuleUnlockRequest.id))
        .filter(ModuleUnlockRequest.company_id == company_id)
        .group_by(ModuleUnlockRequest.module_id)
        .all()
    )
    for module_id, cnt in rows:
        pending[module_id] = cnt
    modules = []
    for mid in ALL_MODULE_IDS:
        modules.append({
            "id": mid,
            "unlocked": mid in unlocked,
            "installed": mid in installed,
            "pending_requests": pending.get(mid, 0),
        })
    return {"modules": modules}
