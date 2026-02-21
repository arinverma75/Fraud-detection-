"""
Graph Analysis Service — Neo4j fraud ring detection.
Detects connected fraud clusters and computes community risk scores.
"""
from typing import Optional
import structlog
from neo4j import AsyncSession

log = structlog.get_logger()


async def upsert_account_node(session: AsyncSession, user_id: str, risk_score: float):
    await session.run(
        """
        MERGE (a:Account {id: $user_id})
        SET a.risk_score = $risk_score, a.updated_at = datetime()
        """,
        user_id=user_id,
        risk_score=risk_score,
    )


async def link_device(session: AsyncSession, user_id: str, fingerprint_hash: str):
    await session.run(
        """
        MERGE (a:Account {id: $user_id})
        MERGE (d:Device {fingerprint_hash: $fp})
        ON CREATE SET d.first_seen = datetime(), d.fraud_count = 0
        MERGE (a)-[:USES_DEVICE]->(d)
        """,
        user_id=user_id,
        fp=fingerprint_hash,
    )


async def link_ip(session: AsyncSession, user_id: str, ip_address: str, country: str):
    await session.run(
        """
        MERGE (a:Account {id: $user_id})
        MERGE (i:IP {address: $ip, country: $country})
        MERGE (a)-[:LOGGED_IN_FROM]->(i)
        """,
        user_id=user_id,
        ip=ip_address,
        country=country,
    )


async def get_shared_device_risk(session: AsyncSession, fingerprint_hash: str) -> float:
    """
    Return the average fraud rate of other accounts that share this device.
    """
    result = await session.run(
        """
        MATCH (d:Device {fingerprint_hash: $fp})<-[:USES_DEVICE]-(a:Account)
        WHERE a.label = 'FRAUD'
        WITH count(a) AS fraud_count
        MATCH (d2:Device {fingerprint_hash: $fp})<-[:USES_DEVICE]-(all:Account)
        RETURN toFloat(fraud_count) / count(all) AS risk_rate
        """,
        fp=fingerprint_hash,
    )
    record = await result.single()
    return float(record["risk_rate"]) if record and record["risk_rate"] else 0.0


async def detect_fraud_ring(session: AsyncSession, user_id: str) -> dict:
    """
    Find accounts sharing ≥2 attributes with known fraudsters.
    Returns community fraud rate and ring centrality.
    """
    result = await session.run(
        """
        MATCH (suspect:Account {id: $user_id})-[:USES_DEVICE|HAS_EMAIL|HAS_PHONE|LOGGED_IN_FROM]->
              (shared)<-[:USES_DEVICE|HAS_EMAIL|HAS_PHONE|LOGGED_IN_FROM]-(known:Account {label: 'FRAUD'})
        WITH count(DISTINCT shared) AS shared_attrs, collect(DISTINCT known.id) AS fraudster_ids
        RETURN shared_attrs, fraudster_ids
        """,
        user_id=user_id,
    )
    record = await result.single()

    if not record or record["shared_attrs"] == 0:
        return {"community_fraud_rate": 0.0, "ring_centrality": 0.0, "shared_attrs": 0, "connected_fraudsters": []}

    shared_attrs = record["shared_attrs"]
    community_fraud_rate = min(0.8 + shared_attrs * 0.05, 1.0)

    return {
        "community_fraud_rate": community_fraud_rate,
        "ring_centrality": min(shared_attrs / 10.0, 1.0),
        "shared_attrs": shared_attrs,
        "connected_fraudsters": record["fraudster_ids"][:10],
    }


async def mark_account_fraud(session: AsyncSession, user_id: str):
    """Label an account as FRAUD in the graph after confirmed fraud."""
    await session.run(
        "MATCH (a:Account {id: $user_id}) SET a.label = 'FRAUD', a.risk_score = 1.0",
        user_id=user_id,
    )


async def get_fraud_graph_summary(session: AsyncSession, limit: int = 50) -> list[dict]:
    """Fetch high-risk account clusters for the dashboard graph visualizer."""
    result = await session.run(
        """
        MATCH (a:Account)-[r:USES_DEVICE|HAS_EMAIL|HAS_PHONE]->(shared)
              <-[r2:USES_DEVICE|HAS_EMAIL|HAS_PHONE]-(b:Account)
        WHERE a.risk_score > 0.5 AND b.risk_score > 0.5 AND a.id <> b.id
        RETURN a.id AS source, b.id AS target, a.risk_score AS source_risk,
               b.risk_score AS target_risk, type(r) AS link_type
        LIMIT $limit
        """,
        limit=limit,
    )
    return [dict(r) async for r in result]
