import enum
import os
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, String, create_engine
)
from sqlalchemy.orm import DeclarativeBase, relationship, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/acm.db")

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class TipoPropiedad(str, enum.Enum):
    departamento = "Departamento"
    casa = "Casa"
    ph = "PH"
    local = "Local"


class Orientacion(str, enum.Enum):
    norte = "Norte"
    sur = "Sur"
    este = "Este"
    oeste = "Oeste"
    interno = "Interno"


class EstadoPropiedad(str, enum.Enum):
    refaccionado = "Refaccionado"
    standard = "Standard"
    a_refaccionar = "A refaccionar"


class CalidadPropiedad(str, enum.Enum):
    superior = "Superior"
    standard = "Standard"
    inferior = "Inferior"


class Distribucion(str, enum.Enum):
    buena = "Buena"
    regular = "Regular"


class StageACM(str, enum.Enum):
    nuevo       = "nuevo"
    en_progreso = "en_progreso"
    finalizado  = "finalizado"
    cancelado   = "cancelado"


class ApprovalStatus(str, enum.Enum):
    no_requerida = "No requerida"
    pendiente = "Pendiente"
    aprobado = "Aprobado"
    cambios_solicitados = "Cambios solicitados"


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="company", foreign_keys="User.company_id")
    settings = relationship("CompanySetting", back_populates="company", cascade="all, delete-orphan")
    acms = relationship("ACM", back_populates="company", foreign_keys="ACM.company_id")


class CompanySetting(Base):
    """Per-company key-value store. Replaces the global AppSetting for all tenant data."""
    __tablename__ = "company_settings"

    company_id = Column(Integer, ForeignKey("companies.id"), primary_key=True)
    key = Column(String, primary_key=True)
    value = Column(String, nullable=True)

    company = relationship("Company", back_populates="settings")


class ACM(Base):
    __tablename__ = "acm"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notas = Column(String, nullable=True)

    direccion = Column(String, nullable=False)
    tipo = Column(Enum(TipoPropiedad), nullable=False)
    superficie_cubierta = Column(Float, nullable=False)
    superficie_semicubierta = Column(Float, nullable=True)
    superficie_descubierta = Column(Float, nullable=True)
    piso = Column(Integer, nullable=True)
    antiguedad = Column(Integer, nullable=True)
    orientacion = Column(Enum(Orientacion), nullable=True)
    estado = Column(Enum(EstadoPropiedad), nullable=True)
    calidad = Column(Enum(CalidadPropiedad), nullable=True)
    cochera = Column(Boolean, default=False)
    pileta = Column(Boolean, default=False)
    distribucion = Column(Enum(Distribucion), nullable=True)

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    stage = Column(String, nullable=True, default="nuevo")
    current_step = Column(String, nullable=True, default="sujeto")
    steps_completed = Column(String, nullable=True, default="[]")
    deleted_at = Column(DateTime, nullable=True)
    approval_status = Column(
        Enum(ApprovalStatus), nullable=False, default=ApprovalStatus.no_requerida
    )
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)

    comparables = relationship("Comparable", back_populates="acm", cascade="all, delete-orphan")
    owner = relationship("User", back_populates="acms", foreign_keys=[owner_id])
    approver = relationship("User", foreign_keys=[approved_by_id])
    company = relationship("Company", back_populates="acms", foreign_keys=[company_id])
    approval_comments = relationship(
        "ApprovalComment",
        back_populates="acm",
        cascade="all, delete-orphan",
    )


class Comparable(Base):
    __tablename__ = "comparable"

    id = Column(Integer, primary_key=True, index=True)
    acm_id = Column(Integer, ForeignKey("acm.id"), nullable=False)

    url = Column(String, nullable=True)
    precio = Column(Float, nullable=False)
    dias_mercado = Column(Integer, nullable=True)
    oportunidad_mercado = Column(Boolean, default=False)

    direccion = Column(String, nullable=True)
    tipo = Column(Enum(TipoPropiedad), nullable=True)
    superficie_cubierta = Column(Float, nullable=False)
    superficie_semicubierta = Column(Float, nullable=True)
    superficie_descubierta = Column(Float, nullable=True)
    piso = Column(Integer, nullable=True)
    antiguedad = Column(Integer, nullable=True)
    orientacion = Column(Enum(Orientacion), nullable=True)
    estado = Column(Enum(EstadoPropiedad), nullable=True)
    calidad = Column(Enum(CalidadPropiedad), nullable=True)
    cochera = Column(Boolean, default=False)
    pileta = Column(Boolean, default=False)
    distribucion = Column(Enum(Distribucion), nullable=True)

    # Factores base (auto-calculados, override manual)
    factor_antiguedad = Column(Float, nullable=True)
    factor_estado = Column(Float, nullable=True)
    factor_calidad = Column(Float, nullable=True)
    factor_superficie = Column(Float, nullable=True)
    factor_piso = Column(Float, nullable=True)
    factor_orientacion = Column(Float, nullable=True)
    factor_distribucion = Column(Float, nullable=True)
    factor_oferta = Column(Float, nullable=True)
    factor_oportunidad = Column(Float, nullable=True)

    # Factores avanzados
    factor_cochera = Column(Float, nullable=True)
    factor_pileta = Column(Float, nullable=True)
    factor_luminosidad = Column(Float, nullable=True)
    factor_vistas = Column(Float, nullable=True)
    factor_amenities = Column(Float, nullable=True)

    acm = relationship("ACM", back_populates="comparables")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    is_approver = Column(Boolean, default=False)
    needs_approval = Column(Boolean, default=False)
    is_superadmin = Column(Boolean, default=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)

    company = relationship("Company", back_populates="users", foreign_keys=[company_id])
    acms = relationship("ACM", back_populates="owner", foreign_keys="ACM.owner_id")


class ApprovalComment(Base):
    __tablename__ = "approval_comments"

    id = Column(Integer, primary_key=True, index=True)
    acm_id = Column(Integer, ForeignKey("acm.id"), nullable=False, index=True)
    section = Column(String, nullable=False)
    message = Column(String, nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    acm = relationship("ACM", back_populates="approval_comments")
    author = relationship("User")


class AppSetting(Base):
    """Legacy global key-value store. Kept for backward compatibility during migration."""
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=True)


class PlatformSetting(Base):
    """Global platform-level key-value store, managed by superadmin."""
    __tablename__ = "platform_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=True)


class ModifierOption(Base):
    """Per-company configuration of qualifier options and their adjustment factors."""
    __tablename__ = "modifier_options"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    factor_key = Column(String, nullable=False)
    option_label = Column(String, nullable=False)
    factor_value = Column(Float, nullable=False, default=1.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company")


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    location = Column(String, nullable=True)
    start_datetime = Column(DateTime, nullable=False)
    end_datetime = Column(DateTime, nullable=False)
    all_day = Column(Boolean, default=False)
    color = Column(String, nullable=True)
    recurrence_rule = Column(String, nullable=True)  # RFC 5545 RRULE string

    google_event_id = Column(String, nullable=True, index=True)
    microsoft_event_id = Column(String, nullable=True, index=True)

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)

    owner = relationship("User")
    company = relationship("Company")


class UserCalendarIntegration(Base):
    __tablename__ = "user_calendar_integrations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    provider = Column(String, nullable=False)  # "google" | "microsoft"
    access_token = Column(String, nullable=True)
    refresh_token = Column(String, nullable=True)
    token_expiry = Column(DateTime, nullable=True)
    calendar_id = Column(String, nullable=True)
    ical_token = Column(String, nullable=True, unique=True, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
