from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette.requests import Request

from core.auth import require_approver
from core.db import get_db
from models import ACM, ApprovalComment, ApprovalStatus
from modules.acm_core.router import _build_acm_read, _get_acm_or_404, _requires_approval
from schemas import ACMRead, ACMSummary, ApprovalCommentRead, ApprovalReviewRequest

router = APIRouter()


@router.get("/api/approvals/pending", response_model=list[ACMSummary])
def list_pending_approvals(request: Request, db: Session = Depends(get_db)):
    reviewer = require_approver(request, db)
    query = (
        db.query(ACM)
        .filter(ACM.approval_status == ApprovalStatus.pendiente, ACM.company_id == reviewer.company_id)
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


@router.put("/api/acm/{acm_id}/approval", response_model=ACMRead)
def review_acm(
    acm_id: int,
    body: ApprovalReviewRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    reviewer = require_approver(request, db)
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
