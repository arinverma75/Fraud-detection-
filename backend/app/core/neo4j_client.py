"""Neo4j async driver and session helper."""
from neo4j import AsyncGraphDatabase, AsyncDriver
import structlog

from app.core.config import settings

log = structlog.get_logger()

neo4j_driver: AsyncDriver = AsyncGraphDatabase.driver(
    settings.NEO4J_URI,
    auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
    max_connection_pool_size=50,
)


async def get_neo4j_session():
    async with neo4j_driver.session() as session:
        yield session


async def init_neo4j_schema():
    """Create indexes and constraints on startup."""
    constraints = [
        "CREATE CONSTRAINT account_id IF NOT EXISTS FOR (a:Account) REQUIRE a.id IS UNIQUE",
        "CREATE CONSTRAINT device_hash IF NOT EXISTS FOR (d:Device) REQUIRE d.fingerprint_hash IS UNIQUE",
        "CREATE CONSTRAINT email_address IF NOT EXISTS FOR (e:Email) REQUIRE e.address IS UNIQUE",
        "CREATE CONSTRAINT phone_number IF NOT EXISTS FOR (p:Phone) REQUIRE p.number IS UNIQUE",
        "CREATE INDEX account_risk IF NOT EXISTS FOR (a:Account) ON (a.risk_score)",
    ]
    async with neo4j_driver.session() as session:
        for cypher in constraints:
            await session.run(cypher)
    log.info("Neo4j schema initialized")
