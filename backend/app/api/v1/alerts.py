"""Alerts API routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, update

from app.core.database import get_db
from app.core.security import require_role
from app.models.db_models import Alert
from app.models.schemas import AlertResponse, AlertResolveRequest

router = APIRouter()


@router.get("/", response_model=list[AlertResponse], summary="List unresolved alerts")
async def list_alerts(
    limit: int = 50,
    severity: str | None = None,
    resolved: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("analyst", "manager", "admin")),
):
    query = (
        select(Alert)
        .where(Alert.is_resolved == resolved)
        .order_by(desc(Alert.created_at))
        .limit(limit)
    )
    if severity:
        query = query.where(Alert.severity == severity)
    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/{alert_id}/resolve", response_model=AlertResponse)
async def resolve_alert(
    alert_id: str,
    body: AlertResolveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("analyst", "manager", "admin")),
):
    from datetime import datetime, timezone
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    await db.execute(
        update(Alert)
        .where(Alert.id == alert_id)
        .values(
            is_resolved=True,
            resolved_by=current_user["user_id"],
            resolved_at=datetime.now(timezone.utc),
        )
    )
    alert.is_resolved = True
    return alert
