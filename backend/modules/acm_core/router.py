import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette.requests import Request

import calculator as calc
from core.auth import current_user, require_admin
from core.db import get_db
from core.utils import get_branding_settings_data, save_branding_settings_data, get_company_setting, get_scraper_settings, serialize_user, save_company_setting
from models import ACM, ApprovalStatus, Comparable, ModifierOption, User
from schemas import (
    ACMCreate,
    ACMRead,
    ACMSummary,
    ACMUpdate,
    BrandingSettings,
    ComparableCreate,
    ComparableRead,
    ComparableResultado,
    ComparableUpdate,
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

logger = logging.getLogger("acm")

router = APIRouter()

STEP_ORDER = ["sujeto", "comparables", "ponderadores", "resultados", "exportar"]
STAGE_ORDER = ["nuevo", "en_progreso", "finalizado", "cancelado"]

_COMPUTED_FIELDS = {"superficie_homogeneizada"}


def _parse_steps(raw: Optional[str]) -> list:
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


def _mark_acm_pending_if_required(acm: ACM):
    if _requires_approval(acm):
        if acm.approval_status == ApprovalStatus.no_requerida:
            acm.approval_status = ApprovalStatus.pendiente
    else:
        acm.approval_status = ApprovalStatus.no_requerida
        acm.approved_by_id = None
        acm.approved_at = None


def _check_acm_access(acm: ACM, user: User):
    if acm.company_id != user.company_id:
        raise HTTPException(403, "Sin acceso a este ACM")
    if not user.is_admin and acm.owner_id != user.id:
        raise HTTPException(403, "Sin acceso a este ACM")


def _get_acm_checked(acm_id: int, request: Request, db: Session) -> ACM:
    user = current_user(request, db)
    acm = _get_acm_or_404(acm_id, db)
    _check_acm_access(acm, user)
    return acm


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


def _build_acm_read(acm: ACM) -> ACMRead:
    from schemas import ApprovalCommentRead
    def _serialize_comment(comment):
        data = ApprovalCommentRead.model_validate(comment)
        data.author_username = comment.author.username if comment.author else None
        return data

    enriched = [_enrich_comparable(acm, c) for c in acm.comparables]
    data = ACMRead.model_validate(acm)
    data.owner_username = acm.owner.username if acm.owner else None
    data.requires_approval = _requires_approval(acm)
    data.comparables = enriched
    data.approval_comments = [_serialize_comment(c) for c in acm.approval_comments]
    return data


# --- ACM endpoints ---

@router.post("/api/acm", response_model=ACMRead, status_code=201)
def create_acm(body: ACMCreate, request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    acm = ACM(**body.model_dump(exclude=_COMPUTED_FIELDS), owner_id=user.id, company_id=user.company_id)
    _mark_acm_pending_if_required(acm)
    db.add(acm)
    db.commit()
    db.refresh(acm)
    return _build_acm_read(acm)


@router.get("/api/acm/stages")
def get_stages():
    return {"stages": STAGE_ORDER}


@router.get("/api/acm", response_model=list[ACMSummary])
def list_acms(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    query = (
        db.query(ACM)
        .filter(ACM.deleted_at.is_(None), ACM.company_id == user.company_id)
        .order_by(ACM.fecha_creacion.desc())
    )
    if not user.is_admin:
        query = query.filter(ACM.owner_id == user.id)
    result = []
    for acm in query.all():
        s = ACMSummary.model_validate(acm)
        s.cantidad_comparables = len(acm.comparables)
        s.owner_username = acm.owner.username if acm.owner else None
        s.requires_approval = _requires_approval(acm)
        result.append(s)
    return result


@router.get("/api/acm/{acm_id}", response_model=ACMRead)
def get_acm(acm_id: int, request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    acm = _get_acm_or_404(acm_id, db)
    _check_acm_access(acm, user)
    return _build_acm_read(acm)


@router.patch("/api/acm/{acm_id}", response_model=ACMRead)
def update_acm(acm_id: int, body: ACMUpdate, request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    acm = _get_acm_or_404(acm_id, db)
    _check_acm_access(acm, user)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(acm, field, value)
    if body.model_dump(exclude_none=True):
        _mark_acm_pending_if_required(acm)
    db.commit()
    db.refresh(acm)
    return _build_acm_read(acm)


@router.delete("/api/acm/{acm_id}", status_code=204)
def delete_acm(acm_id: int, request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    acm = _get_acm_or_404(acm_id, db)
    _check_acm_access(acm, user)
    acm.deleted_at = datetime.utcnow()
    db.commit()
    logger.info("soft_delete acm=%d by=%s", acm_id, user.username)


@router.patch("/api/acm/{acm_id}/stage", response_model=ACMRead)
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


@router.patch("/api/acm/{acm_id}/step", response_model=ACMRead)
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


# --- Comparable endpoints ---

@router.post("/api/acm/{acm_id}/comparable", response_model=ComparableRead, status_code=201)
def add_comparable(acm_id: int, body: ComparableCreate, request: Request, db: Session = Depends(get_db)):
    acm = _get_acm_checked(acm_id, request, db)
    comp = Comparable(acm_id=acm_id, **body.model_dump(exclude=_COMPUTED_FIELDS))
    db.add(comp)
    _mark_acm_pending_if_required(acm)
    db.commit()
    db.refresh(comp)
    return _enrich_comparable(acm, comp)


@router.put("/api/acm/{acm_id}/comparable/{cid}", response_model=ComparableRead)
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


@router.delete("/api/acm/{acm_id}/comparable/{cid}", status_code=204)
def delete_comparable(acm_id: int, cid: int, request: Request, db: Session = Depends(get_db)):
    acm = _get_acm_checked(acm_id, request, db)
    comp = _get_comparable_or_404(acm_id, cid, db)
    db.delete(comp)
    _mark_acm_pending_if_required(acm)
    db.commit()


# --- Resultado ---

@router.get("/api/acm/{acm_id}/resultado", response_model=ResultadoResponse)
def get_resultado(acm_id: int, request: Request, db: Session = Depends(get_db)):
    acm = _get_acm_checked(acm_id, request, db)
    if not acm.comparables:
        raise HTTPException(status_code=422, detail="El ACM no tiene comparables")

    subject = _make_snapshot(acm)
    user = current_user(request, db)
    company_modifiers = (
        db.query(ModifierOption)
        .filter(ModifierOption.company_id == user.company_id)
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


# --- Ponderadores defaults ---

@router.get("/api/ponderadores/defaults", response_model=PonderadoresDefaults)
def get_defaults():
    return PonderadoresDefaults(**calc.DEFAULTS)


# --- Modifier options ---

@router.get("/api/modifiers", response_model=list[ModifierOptionRead])
def list_modifiers(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    return (
        db.query(ModifierOption)
        .filter(ModifierOption.company_id == user.company_id)
        .order_by(ModifierOption.factor_key, ModifierOption.option_label)
        .all()
    )


@router.post("/api/modifiers", response_model=ModifierOptionRead, status_code=201)
def create_modifier(body: ModifierOptionCreate, request: Request, db: Session = Depends(get_db)):
    user = require_admin(request, db)
    obj = ModifierOption(**body.model_dump(), company_id=user.company_id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/api/modifiers/{mid}", response_model=ModifierOptionRead)
def update_modifier(mid: int, body: ModifierOptionUpdate, request: Request, db: Session = Depends(get_db)):
    user = require_admin(request, db)
    obj = db.query(ModifierOption).filter(
        ModifierOption.id == mid, ModifierOption.company_id == user.company_id
    ).first()
    if not obj:
        raise HTTPException(404, "Modificador no encontrado")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    obj.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/api/modifiers/{mid}", status_code=204)
def delete_modifier(mid: int, request: Request, db: Session = Depends(get_db)):
    user = require_admin(request, db)
    obj = db.query(ModifierOption).filter(
        ModifierOption.id == mid, ModifierOption.company_id == user.company_id
    ).first()
    if not obj:
        raise HTTPException(404, "Modificador no encontrado")
    db.delete(obj)
    db.commit()
