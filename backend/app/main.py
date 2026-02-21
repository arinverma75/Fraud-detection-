"""
Fraud Detection Platform — FastAPI Application Entry Point
"""
from contextlib import asynccontextmanager
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.redis_client import redis_client
from app.core.kafka_client import kafka_producer
from app.api.v1 import transactions, auth, users, graph, kyc, alerts

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle — fails gracefully when infra is absent."""
    log.info("Starting Fraud Detection Platform", env=settings.ENVIRONMENT)

    # Redis — optional for local dev
    try:
        await redis_client.initialize()
        log.info("Redis connected")
    except Exception as e:
        log.warning("Redis unavailable — velocity features disabled", error=str(e))

    # Kafka — optional for local dev
    try:
        await kafka_producer.start()
        log.info("Kafka producer started")
    except Exception as e:
        log.warning("Kafka unavailable — event publishing disabled", error=str(e))

    # Neo4j — optional for local dev
    try:
        from app.core.neo4j_client import neo4j_driver
        async with neo4j_driver.session() as s:
            await s.run("RETURN 1")
        log.info("Neo4j connected")
    except Exception as e:
        log.warning("Neo4j unavailable — graph features disabled", error=str(e))

    log.info("API ready", docs="http://localhost:8000/docs")
    yield

    # Cleanup
    try:
        await kafka_producer.stop()
    except Exception:
        pass
    try:
        await redis_client.close()
    except Exception:
        pass
    log.info("Shutdown complete")


app = FastAPI(
    title="Fraud Detection Platform API",
    description="Real-time transaction fraud detection with ML and graph analytics",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── Middleware ──────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# ─── Routers ────────────────────────────────────────────────────────────────
app.include_router(auth.router,         prefix="/v1/auth",         tags=["Auth"])
app.include_router(users.router,        prefix="/v1/users",        tags=["Users"])
app.include_router(transactions.router, prefix="/v1/transactions", tags=["Transactions"])
app.include_router(graph.router,        prefix="/v1/graph",        tags=["Graph"])
app.include_router(kyc.router,          prefix="/v1/kyc",          tags=["KYC"])
app.include_router(alerts.router,       prefix="/v1/alerts",       tags=["Alerts"])


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
