"""Application configuration using pydantic-settings."""
from typing import List
from pydantic_settings import BaseSettings
from pydantic import field_validator
import json


class Settings(BaseSettings):
    # App
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://fraud_admin:fraud_secret@localhost:5432/fraud_detection"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Kafka
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    KAFKA_TOPIC_RAW_TRANSACTIONS: str = "raw-transactions"
    KAFKA_TOPIC_ENRICHED_TRANSACTIONS: str = "enriched-transactions"
    KAFKA_TOPIC_DECISION_EVENTS: str = "decision-events"
    KAFKA_TOPIC_OUTCOMES: str = "transaction-outcomes"

    # Neo4j
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "fraud_neo4j_secret"

    # External APIs
    MAXMIND_LICENSE_KEY: str = ""
    IPQUALITYSCORE_API_KEY: str = ""
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""
    JUMIO_API_TOKEN: str = ""
    JUMIO_API_SECRET: str = ""
    COMPLY_ADVANTAGE_API_KEY: str = ""

    # ML Thresholds
    MODEL_PATH: str = "/ml/models"
    MLFLOW_TRACKING_URI: str = "http://localhost:5001"
    RISK_SCORE_APPROVE_THRESHOLD: float = 0.30
    RISK_SCORE_STEPUP_THRESHOLD: float = 0.50
    RISK_SCORE_FLAG_THRESHOLD: float = 0.70
    RISK_SCORE_BLOCK_THRESHOLD: float = 0.85

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
