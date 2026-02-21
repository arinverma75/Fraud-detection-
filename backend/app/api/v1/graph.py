"""Graph routes — fraud ring visualization."""
from fastapi import APIRouter, Depends
from app.core.security import require_role
from app.core.neo4j_client import neo4j_driver

router = APIRouter()


@router.get("/summary", summary="Get fraud graph edges for visualization")
async def graph_summary(
    limit: int = 100,
    current_user: dict = Depends(require_role("analyst", "manager", "admin")),
):
    async with neo4j_driver.session() as session:
        from app.services.graph_service import get_fraud_graph_summary
        edges = await get_fraud_graph_summary(session, limit=limit)
    return {"edges": edges, "count": len(edges)}


@router.get("/account/{user_id}", summary="Get fraud ring details for a specific account")
async def account_ring(
    user_id: str,
    current_user: dict = Depends(require_role("analyst", "manager", "admin")),
):
    async with neo4j_driver.session() as session:
        from app.services.graph_service import detect_fraud_ring
        data = await detect_fraud_ring(session, user_id)
    return {"user_id": user_id, **data}
