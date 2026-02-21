"""Pydantic schemas for request/response validation."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator
import re


# ─── Transaction Schemas ─────────────────────────────────────────────────────
class TransactionRequest(BaseModel):
    transaction_id: str = Field(..., description="Unique transaction identifier from payment processor")
    user_id: str
    amount: float = Field(..., gt=0, description="Transaction amount in base currency units")
    currency: str = Field(default="USD", max_length=3)
    merchant_id: str
    merchant_category: Optional[str] = None
    payment_method: Optional[str] = None
    device_fingerprint: Optional[str] = None
    ip_address: Optional[str] = None
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lon: Optional[float] = Field(None, ge=-180, le=180)


class TransactionDecisionResponse(BaseModel):
    transaction_id: str
    decision: str  # approved | approved_monitored | stepup_auth | flagged | hard_blocked
    risk_score: float
    risk_level: str  # low | medium | high | critical
    message: str
    requires_otp: bool
    processing_time_ms: float
    hard_rule_triggered: Optional[str] = None
    top_risk_factors: list[str] = []


# ─── User Schemas ────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    email: str
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str]
    role: str
    kyc_tier: int
    kyc_status: str
    is_active: bool
    risk_score: float
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Auth Schemas ────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str  # email
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ─── Alert Schemas ───────────────────────────────────────────────────────────
class AlertResponse(BaseModel):
    id: str
    transaction_id: Optional[str]
    user_id: Optional[str]
    alert_type: str
    severity: str
    title: str
    description: Optional[str]
    is_resolved: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AlertResolveRequest(BaseModel):
    resolution_note: Optional[str] = None


# ─── Graph Schemas ───────────────────────────────────────────────────────────
class FraudRingResponse(BaseModel):
    account_id: str
    shared_attributes: int
    community_fraud_rate: float
    risk_score: float
    connected_fraudsters: list[str]


# ─── KYC Schemas ─────────────────────────────────────────────────────────────
class KYCSubmitRequest(BaseModel):
    document_type: str  # passport | driving_license | national_id
    document_front_url: str
    document_back_url: Optional[str] = None
    selfie_url: str


class KYCStatusResponse(BaseModel):
    user_id: str
    kyc_status: str
    kyc_tier: int
    message: str


# ─── Feature Vector ──────────────────────────────────────────────────────────
class FeatureVector(BaseModel):
    """The enriched feature vector used for ML scoring."""
    # Velocity
    txn_count_1m: float = 0
    txn_count_1h: float = 0
    txn_count_24h: float = 0
    amount_sum_1h: float = 0
    amount_sum_24h: float = 0

    # Ratio features
    amount_to_avg_ratio: float = 1.0
    new_merchant_flag: int = 0
    new_device_flag: int = 0

    # Geo
    geo_delta_km: float = 0
    impossible_travel: int = 0
    is_vpn: int = 0
    is_tor: int = 0
    ip_fraud_score: float = 0

    # Graph
    shared_device_risk: float = 0
    community_fraud_rate: float = 0
    ring_centrality: float = 0

    # KYC
    kyc_tier: int = 0
    account_age_days: float = 0
