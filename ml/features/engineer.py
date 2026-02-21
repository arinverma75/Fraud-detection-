"""
Feature engineering script to generate ML training data.
Reads raw transactions from PostgreSQL and computes all ML features.
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import math

EARTH_RADIUS_KM = 6371.0


def haversine(lat1, lon1, lat2, lon2):
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(d_lambda/2)**2
    return EARTH_RADIUS_KM * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def compute_velocity_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute rolling velocity counts per user."""
    df = df.sort_values(["user_id", "created_at"])
    df["created_at"] = pd.to_datetime(df["created_at"])

    results = []
    for user_id, group in df.groupby("user_id"):
        group = group.sort_values("created_at").reset_index(drop=True)
        counts_1m, counts_1h, counts_24h = [], [], []
        sums_1h, sums_24h = [], []

        for i, row in group.iterrows():
            ts = row["created_at"]
            window_1m  = group[group["created_at"].between(ts - timedelta(minutes=1), ts)]
            window_1h  = group[group["created_at"].between(ts - timedelta(hours=1), ts)]
            window_24h = group[group["created_at"].between(ts - timedelta(hours=24), ts)]

            counts_1m.append(len(window_1m) - 1)
            counts_1h.append(len(window_1h) - 1)
            counts_24h.append(len(window_24h) - 1)
            sums_1h.append(window_1h["amount"].sum() - row["amount"])
            sums_24h.append(window_24h["amount"].sum() - row["amount"])

        group["txn_count_1m"]  = counts_1m
        group["txn_count_1h"]  = counts_1h
        group["txn_count_24h"] = counts_24h
        group["amount_sum_1h"] = sums_1h
        group["amount_sum_24h"] = sums_24h
        results.append(group)

    return pd.concat(results, ignore_index=True)


def compute_ratio_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute amount ratios and novelty flags."""
    df["user_avg_amount"] = df.groupby("user_id")["amount"].transform(
        lambda x: x.shift(1).rolling(90, min_periods=1).mean()
    )
    df["amount_to_avg_ratio"] = df["amount"] / df["user_avg_amount"].clip(lower=1.0)

    # New merchant flag (first time seen for user in last 30 days)
    df = df.sort_values(["user_id", "created_at"])
    df["merchant_seen_before"] = df.groupby(["user_id", "merchant_id"]).cumcount() > 0
    df["new_merchant_flag"] = (~df["merchant_seen_before"]).astype(int)

    # New device flag
    df["device_seen_before"] = df.groupby(["user_id", "device_fingerprint"]).cumcount() > 0
    df["new_device_flag"] = (~df["device_seen_before"]).astype(int)

    return df


def compute_geo_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute geo-delta and impossible travel flag."""
    df = df.sort_values(["user_id", "created_at"])
    df["prev_lat"] = df.groupby("user_id")["lat"].shift(1)
    df["prev_lon"] = df.groupby("user_id")["lon"].shift(1)
    df["prev_time"] = df.groupby("user_id")["created_at"].shift(1)

    def calc_delta(row):
        if pd.isna(row["prev_lat"]):
            return 0.0, 0
        dist = haversine(row["prev_lat"], row["prev_lon"], row["lat"], row["lon"])
        time_delta = max((row["created_at"] - row["prev_time"]).total_seconds(), 1)
        speed = (dist / time_delta) * 3600
        return dist, int(speed > 1000)

    deltas = df.apply(calc_delta, axis=1, result_type="expand")
    df["geo_delta_km"] = deltas[0]
    df["impossible_travel"] = deltas[1]
    return df


def build_feature_dataset(raw_csv_path: str, output_path: str):
    """Full feature engineering pipeline."""
    print(f"Reading {raw_csv_path}...")
    df = pd.read_csv(raw_csv_path)

    print("Computing velocity features...")
    df = compute_velocity_features(df)

    print("Computing ratio and novelty features...")
    df = compute_ratio_features(df)

    print("Computing geo features...")
    df = compute_geo_features(df)

    # Fill defaults for graph features (would come from Neo4j in production)
    for col in ["shared_device_risk", "community_fraud_rate", "ring_centrality"]:
        if col not in df.columns:
            df[col] = 0.0

    # Fill defaults for IP features
    for col in ["is_vpn", "is_tor", "ip_fraud_score"]:
        if col not in df.columns:
            df[col] = 0

    # Account age in days
    df["account_age_days"] = (
        pd.to_datetime(df["created_at"]) - pd.to_datetime(df["user_created_at"])
    ).dt.days.clip(lower=0)

    output_cols = [
        "txn_count_1m", "txn_count_1h", "txn_count_24h",
        "amount_sum_1h", "amount_sum_24h", "amount_to_avg_ratio",
        "new_merchant_flag", "new_device_flag", "geo_delta_km",
        "impossible_travel", "is_vpn", "is_tor", "ip_fraud_score",
        "shared_device_risk", "community_fraud_rate", "ring_centrality",
        "kyc_tier", "account_age_days", "is_fraud", "created_at",
    ]

    output = df[[c for c in output_cols if c in df.columns]]
    output.to_csv(output_path, index=False)
    print(f"Feature dataset saved: {output_path} ({len(output)} rows)")
    print(f"Fraud rate: {output['is_fraud'].mean():.3%}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="data/features.csv")
    args = parser.parse_args()
    build_feature_dataset(args.input, args.output)
