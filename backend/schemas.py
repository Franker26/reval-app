import json
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, computed_field, field_validator, model_validator

from models import (
    ApprovalStatus,
    CalidadPropiedad,
    Distribucion,
    EstadoPropiedad,
    Orientacion,
    StageACM,
    TipoPropiedad,
)


# Normalize old Title-Case stage values that may still be in the DB
_STAGE_LEGACY = {
    "Borrador": "nuevo",
    "En progreso": "en_progreso",
    "Finalizado": "finalizado",
    "Cancelado": "cancelado",
}

def _coerce_stage(v) -> str:
    if v is None:
        return "nuevo"
    s = str(v)
    return _STAGE_LEGACY.get(s, s)

def _coerce_steps(v) -> list[str]:
    if isinstance(v, list):
        return v
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            pass
    return []


class PropertyBase(BaseModel):
    tipo: TipoPropiedad
    superficie_cubierta: float
    superficie_semicubierta: Optional[float] = None
    superficie_descubierta: Optional[float] = None
    piso: Optional[int] = None
    antiguedad: Optional[int] = None
    orientacion: Optional[Orientacion] = None
    estado: Optional[EstadoPropiedad] = None
    calidad: Optional[CalidadPropiedad] = None
    cochera: bool = False
    pileta: bool = False
    distribucion: Optional[Distribucion] = None

    @field_validator("superficie_cubierta")
    @classmethod
    def superficie_positiva(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("superficie_cubierta debe ser mayor a 0")
        return v

    @computed_field
    @property
    def superficie_homogeneizada(self) -> float:
        return (
            self.superficie_cubierta
            + 0.5 * (self.superficie_semicubierta or 0)
            + 0.3 * (self.superficie_descubierta or 0)
        )


class ACMCreate(PropertyBase):
    nombre: str
    notas: Optional[str] = None
    direccion: str
    stage: str = "nuevo"


class ACMUpdate(BaseModel):
    nombre: Optional[str] = None
    notas: Optional[str] = None
    direccion: Optional[str] = None
    tipo: Optional[TipoPropiedad] = None
    superficie_cubierta: Optional[float] = None
    superficie_semicubierta: Optional[float] = None
    superficie_descubierta: Optional[float] = None
    piso: Optional[int] = None
    antiguedad: Optional[int] = None
    orientacion: Optional[Orientacion] = None
    estado: Optional[EstadoPropiedad] = None
    calidad: Optional[CalidadPropiedad] = None
    cochera: Optional[bool] = None
    pileta: Optional[bool] = None
    distribucion: Optional[Distribucion] = None
    stage: Optional[str] = None

    @field_validator("stage", mode="before")
    @classmethod
    def normalize_stage(cls, v):
        return _coerce_stage(v) if v is not None else None


class ComparableCreate(PropertyBase):
    direccion: Optional[str] = None
    url: Optional[str] = None
    precio: float
    dias_mercado: Optional[int] = None
    oportunidad_mercado: bool = False


class ComparableUpdate(BaseModel):
    direccion: Optional[str] = None
    url: Optional[str] = None
    precio: Optional[float] = None
    dias_mercado: Optional[int] = None
    oportunidad_mercado: Optional[bool] = None
    tipo: Optional[TipoPropiedad] = None
    superficie_cubierta: Optional[float] = None
    superficie_semicubierta: Optional[float] = None
    superficie_descubierta: Optional[float] = None
    piso: Optional[int] = None
    antiguedad: Optional[int] = None
    orientacion: Optional[Orientacion] = None
    estado: Optional[EstadoPropiedad] = None
    calidad: Optional[CalidadPropiedad] = None
    cochera: Optional[bool] = None
    pileta: Optional[bool] = None
    distribucion: Optional[Distribucion] = None
    # Factores base
    factor_antiguedad: Optional[float] = None
    factor_estado: Optional[float] = None
    factor_calidad: Optional[float] = None
    factor_superficie: Optional[float] = None
    factor_piso: Optional[float] = None
    factor_orientacion: Optional[float] = None
    factor_distribucion: Optional[float] = None
    factor_oferta: Optional[float] = None
    factor_oportunidad: Optional[float] = None
    # Factores avanzados
    factor_cochera: Optional[float] = None
    factor_pileta: Optional[float] = None
    factor_luminosidad: Optional[float] = None
    factor_vistas: Optional[float] = None
    factor_amenities: Optional[float] = None


class ComparableRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    acm_id: int
    url: Optional[str]
    precio: float
    dias_mercado: Optional[int]
    oportunidad_mercado: bool
    direccion: Optional[str]
    tipo: Optional[TipoPropiedad]
    superficie_cubierta: float
    superficie_semicubierta: Optional[float]
    superficie_descubierta: Optional[float]
    piso: Optional[int]
    antiguedad: Optional[int]
    orientacion: Optional[Orientacion]
    estado: Optional[EstadoPropiedad]
    calidad: Optional[CalidadPropiedad]
    cochera: bool
    pileta: bool
    distribucion: Optional[Distribucion]
    # Factores base
    factor_antiguedad: Optional[float]
    factor_estado: Optional[float]
    factor_calidad: Optional[float]
    factor_superficie: Optional[float]
    factor_piso: Optional[float]
    factor_orientacion: Optional[float]
    factor_distribucion: Optional[float]
    factor_oferta: Optional[float]
    factor_oportunidad: Optional[float]
    # Factores avanzados
    factor_cochera: Optional[float]
    factor_pileta: Optional[float]
    factor_luminosidad: Optional[float]
    factor_vistas: Optional[float]
    factor_amenities: Optional[float]
    # Calculados
    precio_m2_publicado: Optional[float] = None
    precio_ajustado_m2: Optional[float] = None

    @computed_field
    @property
    def superficie_homogeneizada(self) -> float:
        return (
            self.superficie_cubierta
            + 0.5 * (self.superficie_semicubierta or 0)
            + 0.3 * (self.superficie_descubierta or 0)
        )


class ACMRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    fecha_creacion: datetime
    updated_at: Optional[datetime] = None
    notas: Optional[str]
    direccion: str
    tipo: TipoPropiedad
    superficie_cubierta: float
    superficie_semicubierta: Optional[float]
    superficie_descubierta: Optional[float]
    piso: Optional[int]
    antiguedad: Optional[int]
    orientacion: Optional[Orientacion]
    estado: Optional[EstadoPropiedad]
    calidad: Optional[CalidadPropiedad]
    cochera: bool
    pileta: bool
    distribucion: Optional[Distribucion]
    stage: str = "nuevo"
    current_step: str = "sujeto"
    steps_completed: list[str] = []
    approval_status: ApprovalStatus = ApprovalStatus.no_requerida
    approved_at: Optional[datetime] = None
    owner_id: Optional[int] = None
    owner_username: Optional[str] = None
    requires_approval: bool = False
    comparables: list[ComparableRead] = []
    approval_comments: list["ApprovalCommentRead"] = []

    @field_validator("stage", mode="before")
    @classmethod
    def normalize_stage(cls, v):
        return _coerce_stage(v)

    @field_validator("steps_completed", mode="before")
    @classmethod
    def parse_steps(cls, v):
        return _coerce_steps(v)

    @computed_field
    @property
    def superficie_homogeneizada(self) -> float:
        return (
            self.superficie_cubierta
            + 0.5 * (self.superficie_semicubierta or 0)
            + 0.3 * (self.superficie_descubierta or 0)
        )


class ACMSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    fecha_creacion: datetime
    updated_at: Optional[datetime] = None
    direccion: str
    stage: str = "nuevo"
    current_step: str = "sujeto"
    steps_completed: list[str] = []
    approval_status: ApprovalStatus = ApprovalStatus.no_requerida
    owner_id: Optional[int] = None
    owner_username: Optional[str] = None
    requires_approval: bool = False
    cantidad_comparables: int = 0

    @field_validator("stage", mode="before")
    @classmethod
    def normalize_stage(cls, v):
        return _coerce_stage(v)

    @field_validator("steps_completed", mode="before")
    @classmethod
    def parse_steps(cls, v):
        return _coerce_steps(v)


class ComparableResultado(BaseModel):
    id: int
    direccion: Optional[str]
    url: Optional[str]
    precio: float
    precio_m2_publicado: float
    factor_total: float
    precio_ajustado_m2: float
    detalle_factores: dict


class ResultadoResponse(BaseModel):
    acm_id: int
    mean_ajustado: float
    median_ajustado: float
    std_ajustado: float
    min_ajustado: float
    max_ajustado: float
    valor_estimado_sujeto: float
    comparables: list[ComparableResultado]


class PdfRequest(BaseModel):
    chart_image_b64: Optional[str] = None


class ApprovalCommentBase(BaseModel):
    section: str
    message: str


class ApprovalCommentRead(ApprovalCommentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_id: Optional[int] = None
    author_username: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class ApprovalReviewRequest(BaseModel):
    status: ApprovalStatus
    comments: list[ApprovalCommentBase] = []

    @model_validator(mode="after")
    def validate_status(self):
        if self.status == ApprovalStatus.no_requerida:
            raise ValueError("Estado de aprobación inválido para revisión")
        return self


class BrandingSettings(BaseModel):
    app_name: str = "ACM Real Estate"
    primary_color: str = "#1a3a5c"
    logo_data_url: Optional[str] = None


class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False
    is_approver: bool = False
    needs_approval: bool = False

    @model_validator(mode="after")
    def validate_approver_is_admin(self):
        if self.is_approver and not self.is_admin:
            raise ValueError("Un approver también debe ser admin")
        return self


class UserUpdate(BaseModel):
    is_admin: Optional[bool] = None
    is_approver: Optional[bool] = None
    needs_approval: Optional[bool] = None


class UserRead(BaseModel):
    id: int
    username: str
    is_admin: bool
    is_approver: bool = False
    needs_approval: bool = False
    company_id: Optional[int] = None


class CompanyCreate(BaseModel):
    name: str


class CompanyUpdate(BaseModel):
    name: str


class CompanyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: datetime
    user_count: int = 0
    acm_count: int = 0


class AdminUserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False
    is_approver: bool = False
    needs_approval: bool = False


class PonderadoresDefaults(BaseModel):
    antiguedad_por_decada: float
    estado_a_refaccionar: float
    calidad_superior: float
    calidad_inferior: float
    superficie_por_decima: float
    piso_por_nivel: float
    orientacion_sur_vs_norte: float
    orientacion_interno: float
    distribucion_mala: float
    oferta_mas_de_un_anio: float
    oferta_menos_de_un_anio: float
    oportunidad_mercado: float
    cochera: float
    pileta: float


ACMRead.model_rebuild()


# --- Agenda ---

class CalendarEventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    location: Optional[str] = None
    start_datetime: datetime
    end_datetime: datetime
    all_day: bool = False
    color: Optional[str] = None
    recurrence_rule: Optional[str] = None


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    start_datetime: Optional[datetime] = None
    end_datetime: Optional[datetime] = None
    all_day: Optional[bool] = None
    color: Optional[str] = None
    recurrence_rule: Optional[str] = None


class CalendarEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str]
    location: Optional[str]
    start_datetime: datetime
    end_datetime: datetime
    all_day: bool
    color: Optional[str]
    recurrence_rule: Optional[str]
    owner_id: int
    owner_username: Optional[str] = None
    company_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None


class CalendarIntegrationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    provider: str
    is_active: bool
    calendar_id: Optional[str]
    token_expiry: Optional[datetime]
    created_at: datetime


class StepUpdateRequest(BaseModel):
    step: str
    completed: bool = True


class StageUpdateRequest(BaseModel):
    stage: str

    @field_validator("stage", mode="before")
    @classmethod
    def normalize(cls, v):
        return _coerce_stage(v)


class ModifierOptionCreate(BaseModel):
    factor_key: str
    option_label: str
    factor_value: float = 1.0


class ModifierOptionUpdate(BaseModel):
    option_label: Optional[str] = None
    factor_value: Optional[float] = None


class ModifierOptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    factor_key: str
    option_label: str
    factor_value: float
    created_at: datetime
    updated_at: Optional[datetime] = None
