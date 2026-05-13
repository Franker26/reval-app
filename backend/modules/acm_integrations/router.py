from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.requests import Request

from core.auth import current_user
from core.db import get_db
from core.utils import get_scraper_settings

router = APIRouter()


class ExtractRequest(BaseModel):
    url: str


@router.post("/api/extract")
async def extract_property(body: ExtractRequest, request: Request, db: Session = Depends(get_db)):
    from integrations import extract as integration_extract
    current_user(request, db)
    settings = get_scraper_settings(db)

    primary_err: Exception | None = None
    try:
        return await integration_extract(body.url.strip(), settings)
    except Exception as exc:
        primary_err = exc

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
