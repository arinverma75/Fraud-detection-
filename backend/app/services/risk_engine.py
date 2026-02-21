"""
Risk Scoring Engine — Core of the fraud detection platform.
Orchestrates feature extraction, ML inference, hard rules, and decision logic.
"""
import time
import os
import joblib
import numpy as np
import structlog
from typing import Optional

from app.core.config import settings
from app.core.redis_client import redis_client
from app.models.schemas import TransactionRequest, FeatureVector, TransactionDecisionResponse

log = structlog.get_logger()

# ─── Model Registry ──────────────────────────────────────────────────────────
_rf_model = None
_xgb_model = None


def load_models():
    global _rf_model, _xgb_model
    rf_path = os.path.join(settings.MODEL_PATH, "random_forest.joblib")
    xgb_path = os.path.join(settings.MODEL_PATH, "xgboost_model.joblib")

    if os.path.exists(rf_path):
        _rf_model = joblib.load(rf_path)
        log.info("Random Forest model loaded")
    else:
        log.warning("RF model not found — using fallback heuristic scorer")

    if os.path.exists(xgb_path):
        _xgb_model = joblib.load(xgb_path)
        log.info("XGBoost model loaded")
    else:
        log.warning("XGBoost model not found — using fallback heuristic scorer")


def _heuristic_score(features: FeatureVector) -> float:
    """
    Fallback heuristic scorer when ML models are not available.
    Returns a risk score in [0, 1] based on simple weighted rules.
    """
    score = 0.0
    if features.impossible_travel:
        score += 0.5
    if features.is_tor:
        score += 0.3
    if features.is_vpn:
        score += 0.1
    if features.new_device_flag:
        score += 0.15
    if features.txn_count_1h > 10:
        score += 0.2
    if features.amount_to_avg_ratio > 5:
        score += 0.25
    if features.community_fraud_rate > 0.5:
        score += 0.4
    if features.ip_fraud_score > 75:
        score += 0.2
    return min(score, 1.0)


def _ml_score(features: FeatureVector) -> tuple[float, float]:
    """Run RF + XGBoost inference. Returns (rf_score, xgb_score)."""
    feature_array = np.array([[
        features.txn_count_1m,
        features.txn_count_1h,
        features.txn_count_24h,
        features.amount_sum_1h,
        features.amount_sum_24h,
        features.amount_to_avg_ratio,
        features.new_merchant_flag,
        features.new_device_flag,
        features.geo_delta_km,
        float(features.impossible_travel),
        float(features.is_vpn),
        float(features.is_tor),
        features.ip_fraud_score,
        features.shared_device_risk,
        features.community_fraud_rate,
        features.ring_centrality,
        features.kyc_tier,
        features.account_age_days,
    ]])

    rf_score = float(_rf_model.predict_proba(feature_array)[0][1]) if _rf_model else None
    xgb_score = float(_xgb_model.predict_proba(feature_array)[0][1]) if _xgb_model else None
    return rf_score, xgb_score


def ensemble_score(rf_score: Optional[float], xgb_score: Optional[float], features: FeatureVector) -> float:
    """Weighted ensemble: RF 40%, XGB 60%. Falls back to heuristic if models absent."""
    if rf_score is None and xgb_score is None:
        return _heuristic_score(features)
    if rf_score is None:
        return xgb_score
    if xgb_score is None:
        return rf_score
    return 0.4 * rf_score + 0.6 * xgb_score


# ─── Hard Rules ──────────────────────────────────────────────────────────────
def check_hard_rules(request: TransactionRequest, features: FeatureVector, is_sanctioned: bool = False) -> Optional[str]:
    """
    Returns the triggered hard rule name if any should force a HARD_BLOCK,
    None otherwise.
    """
    if is_sanctioned:
        return "SANCTIONS_HIT"
    if features.impossible_travel:
        return "IMPOSSIBLE_TRAVEL"
    if features.is_tor:
        return "TOR_EXIT_NODE"
    if features.ip_fraud_score >= 90:
        return "HIGH_RISK_IP"
    if features.community_fraud_rate >= 0.9:
        return "CONFIRMED_FRAUD_RING"
    # KYC tier limit
    kyc_limits = {0: 100, 1: 1000, 2: 10000, 3: float("inf")}
    daily_limit = kyc_limits.get(features.kyc_tier, 100)
    if features.amount_sum_24h + request.amount > daily_limit:
        return "KYC_LIMIT_EXCEEDED"
    return None


# ─── Decision Logic ──────────────────────────────────────────────────────────
def make_decision(risk_score: float, features: FeatureVector, hard_rule: Optional[str]) -> tuple[str, str, bool]:
    """
    Returns (decision, message, requires_otp).
    Decision enum values match DecisionStatus ORM model.
    """
    if hard_rule:
        return "hard_blocked", "Transaction declined for security reasons.", False

    t = settings
    if risk_score < t.RISK_SCORE_APPROVE_THRESHOLD:
        return "approved", "Transaction approved.", False

    if risk_score < t.RISK_SCORE_STEPUP_THRESHOLD:
        if not features.new_device_flag and not features.new_merchant_flag:
            return "approved_monitored", "Transaction approved.", False
        return "stepup_auth", "Please verify your identity via OTP.", True

    if risk_score < t.RISK_SCORE_FLAG_THRESHOLD:
        return "stepup_auth", "Please verify your identity via OTP.", True

    if risk_score < t.RISK_SCORE_BLOCK_THRESHOLD:
        return "flagged", "Transaction is under review. This may take up to 10 minutes.", False

    return "hard_blocked", "Transaction declined. Please contact support.", False


def risk_level(score: float) -> str:
    if score < 0.30:
        return "low"
    if score < 0.60:
        return "medium"
    if score < 0.85:
        return "high"
    return "critical"


def top_risk_factors(features: FeatureVector, score: float) -> list[str]:
    factors = []
    if features.impossible_travel:
        factors.append("Impossible travel detected between transactions")
    if features.is_tor:
        factors.append("Transaction originated from Tor exit node")
    if features.is_vpn:
        factors.append("VPN or proxy detected")
    if features.new_device_flag:
        factors.append("Previously unseen device")
    if features.txn_count_1h > 10:
        factors.append(f"High velocity: {int(features.txn_count_1h)} transactions in 1 hour")
    if features.amount_to_avg_ratio > 3:
        factors.append(f"Amount {features.amount_to_avg_ratio:.1f}x above 90-day average")
    if features.community_fraud_rate > 0.5:
        factors.append(f"Associated with fraud ring ({features.community_fraud_rate:.0%} fraud rate)")
    if features.ip_fraud_score > 60:
        factors.append(f"IP risk score: {features.ip_fraud_score}/100")
    return factors[:5]


async def score_transaction(request: TransactionRequest, features: FeatureVector, is_sanctioned: bool = False) -> TransactionDecisionResponse:
    start = time.perf_counter()

    # Hard rules first (fastest path to block)
    hard_rule = check_hard_rules(request, features, is_sanctioned)

    if hard_rule:
        elapsed = (time.perf_counter() - start) * 1000
        return TransactionDecisionResponse(
            transaction_id=request.transaction_id,
            decision="hard_blocked",
            risk_score=1.0,
            risk_level="critical",
            message="Transaction declined for security reasons.",
            requires_otp=False,
            processing_time_ms=round(elapsed, 2),
            hard_rule_triggered=hard_rule,
            top_risk_factors=[f"Hard rule: {hard_rule}"],
        )

    # ML inference
    rf_score, xgb_score = _ml_score(features)
    final_score = ensemble_score(rf_score, xgb_score, features)

    decision, message, requires_otp = make_decision(final_score, features, hard_rule)

    elapsed = (time.perf_counter() - start) * 1000
    log.info(
        "Transaction scored",
        txn_id=request.transaction_id,
        score=f"{final_score:.3f}",
        decision=decision,
        latency_ms=f"{elapsed:.1f}",
    )

    return TransactionDecisionResponse(
        transaction_id=request.transaction_id,
        decision=decision,
        risk_score=round(final_score, 4),
        risk_level=risk_level(final_score),
        message=message,
        requires_otp=requires_otp,
        processing_time_ms=round(elapsed, 2),
        hard_rule_triggered=hard_rule,
        top_risk_factors=top_risk_factors(features, final_score),
    )


# Load models at module import (warm-up)
load_models()
