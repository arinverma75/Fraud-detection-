"""Transaction evaluation API routes."""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.neo4j_client import get_neo4j_session
from app.models.schemas import TransactionRequest, TransactionDecisionResponse
from app.services import transaction_service

router = APIRouter()


@router.post(
    "/evaluate",
    response_model=TransactionDecisionResponse,
    status_code=status.HTTP_200_OK,
    summary="Evaluate a transaction for fraud risk",
)
async def evaluate_transaction(
    request: TransactionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Submit a transaction for real-time fraud risk evaluation.

    Returns a decision (approved / stepup_auth / flagged / hard_blocked)
    with a risk score and top contributing risk factors.
    """
    result = await transaction_service.process_transaction(
        request=request,
        db=db,
        neo4j_session=None,  # Pass actual session in production via Depends
        kyc_tier=1,
        account_age_days=30,
    )
    return result


@router.get(
    "/{transaction_id}",
    summary="Get transaction details",
)
async def get_transaction(
    transaction_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from sqlalchemy import select
    from app.models.db_models import Transaction
    result = await db.execute(
        select(Transaction).where(Transaction.transaction_id == transaction_id)
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return txn


@router.get(
    "/",
    summary="List recent transactions with optional filters",
)
async def list_transactions(
    limit: int = 50,
    decision: str | None = None,
    min_risk: float = 0.0,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from sqlalchemy import select, desc
    from app.models.db_models import Transaction
    query = select(Transaction).order_by(desc(Transaction.created_at)).limit(limit)
    if decision:
        query = query.where(Transaction.decision == decision)
    if min_risk > 0:
        query = query.where(Transaction.risk_score >= min_risk)
    result = await db.execute(query)
    return result.scalars().all()


@router.patch(
    "/{transaction_id}/label",
    summary="Analyst: label a transaction as true_fraud or false_positive",
)
async def label_transaction(
    transaction_id: str,
    label: str,
    note: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Used for analyst feedback → feeds ML retraining loop."""
    from sqlalchemy import select, update
    from app.models.db_models import Transaction
    from datetime import datetime, timezone
    if label not in ("true_fraud", "false_positive", "legitimate"):
        raise HTTPException(status_code=400, detail="Invalid label")
    await db.execute(
        update(Transaction)
        .where(Transaction.transaction_id == transaction_id)
        .values(
            analyst_label=label,
            reviewed_by=current_user["user_id"],
            reviewed_at=datetime.now(timezone.utc),
        )
    )
    return {"status": "labeled", "transaction_id": transaction_id, "label": label}
