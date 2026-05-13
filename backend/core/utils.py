import os
from typing import Optional

from sqlalchemy.orm import Session

from models import AppSetting, Company, CompanySetting, PlatformSetting, User
from schemas import UserRead

_SCRAPER_SERVICE_URL = os.getenv("SCRAPER_SERVICE_URL")
_SCRAPER_SERVICE_TOKEN = os.getenv("SCRAPER_SERVICE_TOKEN", "")
_SCRAPER_SERVICE_URL_BACKUP = os.getenv("SCRAPER_SERVICE_URL_BACKUP")
_SCRAPER_SERVICE_TOKEN_BACKUP = os.getenv("SCRAPER_SERVICE_TOKEN_BACKUP", "")

_SENSITIVE_SETTING_KEYS = {"scraper_service_token"}

_BRANDING_DEFAULTS = {
    "app_name": "ACM Real Estate",
    "primary_color": "#1a3a5c",
    "logo_data_url": None,
}


def get_company_setting(db: Session, company_id: int, key: str) -> Optional[str]:
    s = db.query(CompanySetting).filter(
        CompanySetting.company_id == company_id,
        CompanySetting.key == key,
    ).first()
    return s.value if s else None


def save_company_setting(db: Session, company_id: int, key: str, value: str) -> None:
    s = db.query(CompanySetting).filter(
        CompanySetting.company_id == company_id,
        CompanySetting.key == key,
    ).first()
    if not s:
        s = CompanySetting(company_id=company_id, key=key)
        db.add(s)
    s.value = value
    db.commit()


def get_platform_setting(db: Session, key: str) -> Optional[str]:
    s = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    return s.value if s else None


def save_platform_setting(db: Session, key: str, value: str) -> None:
    s = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if not s:
        s = PlatformSetting(key=key)
        db.add(s)
    s.value = value
    db.commit()


def get_scraper_settings(db: Session) -> dict:
    def _url(val):
        return (val or "").rstrip("/") or None

    return {
        "scraper_service_url": _url(get_platform_setting(db, "scraper_service_url") or _SCRAPER_SERVICE_URL),
        "scraper_service_token": get_platform_setting(db, "scraper_service_token") or _SCRAPER_SERVICE_TOKEN,
        "scraper_service_url_backup": _url(get_platform_setting(db, "scraper_service_url_backup") or _SCRAPER_SERVICE_URL_BACKUP),
        "scraper_service_token_backup": get_platform_setting(db, "scraper_service_token_backup") or _SCRAPER_SERVICE_TOKEN_BACKUP,
    }


def serialize_user(user: User) -> UserRead:
    return UserRead(
        id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        is_approver=user.is_approver,
        needs_approval=user.needs_approval,
        company_id=user.company_id,
    )


def get_first_company_id(db: Session) -> Optional[int]:
    co = db.query(Company).order_by(Company.id).first()
    return co.id if co else None


def get_branding_settings_data(db: Session, company_id: Optional[int] = None) -> dict:
    from schemas import BrandingSettings
    cid = company_id or get_first_company_id(db)
    payload = {}
    for key, default in _BRANDING_DEFAULTS.items():
        val = get_company_setting(db, cid, key) if cid else None
        payload[key] = val if val is not None else default
    return BrandingSettings(**payload)


def save_branding_settings_data(body, db: Session, company_id: int) -> None:
    for key, value in body.model_dump().items():
        save_company_setting(db, company_id, key, value if value is not None else "")


# Underscore-prefixed aliases for backwards compat during transition
_get_company_setting = get_company_setting
_save_company_setting = save_company_setting
_get_platform_setting = get_platform_setting
_save_platform_setting = save_platform_setting
_get_scraper_settings = get_scraper_settings
_serialize_user = serialize_user
_get_first_company_id = get_first_company_id
