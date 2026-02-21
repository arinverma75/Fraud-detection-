"""KYC submission and status routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.db_models import User, KYCStatus
from app.models.schemas import KYCSubmitRequest, KYCStatusResponse

router = APIRouter()


@router.post("/submit", response_model=KYCStatusResponse, summary="Submit KYC documents")
async def submit_kyc(
    request: KYCSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]
    # In production: send to Jumio/Onfido, get webhook callback
    # Here we set to IN_PROGRESS and return
    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(kyc_status=KYCStatus.IN_PROGRESS)
    )
    return KYCStatusResponse(
        user_id=user_id,
        kyc_status="in_progress",
        kyc_tier=0,
        message="KYC documents submitted. Verification usually takes 1-3 minutes.",
    )


@router.get("/status", response_model=KYCStatusResponse, summary="Get KYC verification status")
async def get_kyc_status(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    messages = {
        "pending":       "KYC not started. Please submit your documents.",
        "in_progress":   "Verification in progress.",
        "approved":      f"KYC approved. You are at Tier {user.kyc_tier}.",
        "manual_review": "Your documents are under manual review.",
        "blocked":       "KYC rejected. Please contact support.",
    }
    return KYCStatusResponse(
        user_id=user_id,
        kyc_status=user.kyc_status.value,
        kyc_tier=user.kyc_tier,
        message=messages.get(user.kyc_status.value, ""),
    )


@router.post("/approve/{user_id}", summary="Manually approve KYC (analyst)")
async def approve_kyc(
    user_id: str,
    tier: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] not in ("analyst", "manager", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(kyc_status=KYCStatus.APPROVED, kyc_tier=tier)
    )
    return {"status": "approved", "user_id": user_id, "tier": tier}
