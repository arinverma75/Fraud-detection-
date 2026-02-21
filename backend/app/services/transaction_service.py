"""
Transaction Service — main orchestration layer.
Coordinates fingerprinting, feature extraction, graph lookup, and risk scoring.
"""
import time
import structlog
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis_client import redis_client
from app.core.kafka_client import kafka_producer
from app.core.config import settings
from app.models.schemas import TransactionRequest, TransactionDecisionResponse, FeatureVector
from app.models.db_models import Transaction, DecisionStatus
from app.services import fingerprint_service, risk_engine, graph_service

log = structlog.get_logger()


async def get_user_avg_amount(user_id: str) -> float:
    """Retrieve cached 90-day average transaction amount."""
    key = f"avg_amount:{user_id}"
    val = await redis_client.get(key)
    return float(val) if val else 500.0  # default $500 if no history


async def build_feature_vector(
    request: TransactionRequest,
    ip_data: dict,
    graph_data: dict,
    kyc_tier: int,
    account_age_days: float,
    neo4j_session,
) -> FeatureVector:
    """Aggregate all features into the ML feature vector."""
    user_id = request.user_id
    now_ts = time.time()

    # Velocity features
    txn_count_1m  = await redis_client.get_velocity(user_id, 60)
    txn_count_1h  = await redis_client.get_velocity(user_id, 3600)
    txn_count_24h = await redis_client.get_velocity(user_id, 86400)
    amount_sum_1h  = await redis_client.get_amount_sum(user_id, 3600)
    amount_sum_24h = await redis_client.get_amount_sum(user_id, 86400)

    # Amount ratio vs 90-day average
    avg_amount = await get_user_avg_amount(user_id)
    amount_ratio = request.amount / avg_amount if avg_amount > 0 else 1.0

    # Device novelty
    new_device = 1
    if request.device_fingerprint:
        known = await fingerprint_service.is_known_device(user_id, request.device_fingerprint)
        new_device = 0 if known else 1

    # Merchant novelty
    merchant_key = f"merchants:{user_id}"
    known_merchants = await redis_client.get(merchant_key) or []
    new_merchant = 0 if request.merchant_id in known_merchants else 1

    # Geo delta
    geo_delta_km = 0.0
    impossible_travel = False
    last_txn_time_key = f"last_txn_time:{user_id}"
    last_txn_time = await redis_client.get(last_txn_time_key)
    time_delta = (now_ts - float(last_txn_time)) if last_txn_time else 999999

    if request.lat and request.lon:
        geo_delta_km, impossible_travel = await fingerprint_service.compute_geo_delta(
            user_id, request.lat, request.lon, time_delta
        )

    # Graph-derived features
    shared_device_risk = 0.0
    if request.device_fingerprint and neo4j_session:
        shared_device_risk = await graph_service.get_shared_device_risk(
            neo4j_session, request.device_fingerprint
        )

    return FeatureVector(
        txn_count_1m=txn_count_1m,
        txn_count_1h=txn_count_1h,
        txn_count_24h=txn_count_24h,
        amount_sum_1h=amount_sum_1h,
        amount_sum_24h=amount_sum_24h,
        amount_to_avg_ratio=amount_ratio,
        new_merchant_flag=new_merchant,
        new_device_flag=new_device,
        geo_delta_km=geo_delta_km,
        impossible_travel=int(impossible_travel),
        is_vpn=int(ip_data.get("is_vpn", False)),
        is_tor=int(ip_data.get("is_tor", False)),
        ip_fraud_score=ip_data.get("fraud_score", 0),
        shared_device_risk=shared_device_risk,
        community_fraud_rate=graph_data.get("community_fraud_rate", 0.0),
        ring_centrality=graph_data.get("ring_centrality", 0.0),
        kyc_tier=kyc_tier,
        account_age_days=account_age_days,
    )


async def process_transaction(
    request: TransactionRequest,
    db: AsyncSession,
    neo4j_session,
    kyc_tier: int = 1,
    account_age_days: float = 30.0,
) -> TransactionDecisionResponse:
    """Full transaction processing pipeline."""
    overall_start = time.perf_counter()

    # 1. Enrich IP
    ip_data = {}
    if request.ip_address:
        ip_data = await fingerprint_service.enrich_ip(request.ip_address)

    # 2. Graph analysis
    graph_data = {}
    if neo4j_session:
        try:
            graph_data = await graph_service.detect_fraud_ring(neo4j_session, request.user_id)
        except Exception as e:
            log.warning("Graph analysis failed", error=str(e))

    # 3. Build feature vector
    features = await build_feature_vector(
        request, ip_data, graph_data, kyc_tier, account_age_days, neo4j_session
    )

    # 4. Risk scoring + decision
    result = await risk_engine.score_transaction(request, features)

    # 5. Update Redis state
    await redis_client.record_transaction(request.user_id, request.transaction_id)
    await redis_client.set(f"last_txn_time:{request.user_id}", time.time(), ttl=86400)

    # Update known devices / merchants on approval
    if result.decision in ("approved", "approved_monitored"):
        if request.device_fingerprint:
            await fingerprint_service.register_device(request.user_id, request.device_fingerprint)
        merchants = await redis_client.get(f"merchants:{request.user_id}") or []
        if request.merchant_id not in merchants:
            merchants.append(request.merchant_id)
            await redis_client.set(f"merchants:{request.user_id}", merchants[-100:], ttl=86400 * 30)

    # 6. Update Neo4j graph
    if neo4j_session:
        try:
            await graph_service.upsert_account_node(neo4j_session, request.user_id, result.risk_score)
            if request.device_fingerprint:
                await graph_service.link_device(neo4j_session, request.user_id, request.device_fingerprint)
            if request.ip_address:
                await graph_service.link_ip(neo4j_session, request.user_id, request.ip_address, ip_data.get("country", ""))
        except Exception as e:
            log.warning("Neo4j update failed", error=str(e))

    # 7. Persist to PostgreSQL
    decision_map = {
        "approved": DecisionStatus.APPROVED,
        "approved_monitored": DecisionStatus.APPROVED_MONITORED,
        "stepup_auth": DecisionStatus.STEPUP_AUTH,
        "flagged": DecisionStatus.FLAGGED,
        "hard_blocked": DecisionStatus.HARD_BLOCKED,
    }
    txn_record = Transaction(
        transaction_id=request.transaction_id,
        user_id=request.user_id,
        amount=request.amount,
        currency=request.currency,
        merchant_id=request.merchant_id,
        merchant_category=request.merchant_category,
        payment_method=request.payment_method,
        decision=decision_map[result.decision],
        risk_score=result.risk_score,
        decision_reason=result.message,
        hard_rule_triggered=result.hard_rule_triggered,
        device_fingerprint=request.device_fingerprint,
        ip_address=request.ip_address,
        lat=request.lat,
        lon=request.lon,
        country=ip_data.get("country"),
        city=ip_data.get("city"),
        is_vpn=ip_data.get("is_vpn", False),
        is_tor=ip_data.get("is_tor", False),
        features=features.model_dump(),
        processing_time_ms=result.processing_time_ms,
    )
    db.add(txn_record)
    await db.flush()

    # 8. Publish to Kafka
    await kafka_producer.send(
        settings.KAFKA_TOPIC_DECISION_EVENTS,
        {
            "transaction_id": request.transaction_id,
            "user_id": request.user_id,
            "decision": result.decision,
            "risk_score": result.risk_score,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        key=request.user_id,
    )

    log.info(
        "Transaction processed",
        txn_id=request.transaction_id,
        decision=result.decision,
        total_ms=f"{(time.perf_counter() - overall_start) * 1000:.1f}",
    )
    return result
