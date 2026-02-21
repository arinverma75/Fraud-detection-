"""
ML Training Pipeline — Fraud Detection Platform
Trains Random Forest + XGBoost/LightGBM ensemble with SMOTE class balancing.
Run: python -m pipeline.train --data-path data/sample_transactions.csv
"""
import argparse
import os
import warnings
import numpy as np
import pandas as pd
import joblib
import logging
from datetime import datetime

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    classification_report, average_precision_score,
    roc_auc_score, precision_recall_curve, f1_score
)
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier
from imblearn.over_sampling import SMOTE
from imblearn.under_sampling import RandomUnderSampler
from imblearn.pipeline import Pipeline as ImbPipeline

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

FEATURE_COLUMNS = [
    "txn_count_1m", "txn_count_1h", "txn_count_24h",
    "amount_sum_1h", "amount_sum_24h", "amount_to_avg_ratio",
    "new_merchant_flag", "new_device_flag", "geo_delta_km",
    "impossible_travel", "is_vpn", "is_tor", "ip_fraud_score",
    "shared_device_risk", "community_fraud_rate", "ring_centrality",
    "kyc_tier", "account_age_days",
]
TARGET_COLUMN = "is_fraud"


def load_data(data_path: str) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load and time-split the dataset. Prevents temporal data leakage."""
    log.info(f"Loading data from {data_path}")
    df = pd.read_csv(data_path, parse_dates=["created_at"])
    df = df.dropna(subset=FEATURE_COLUMNS + [TARGET_COLUMN])

    df = df.sort_values("created_at")
    n = len(df)
    train = df.iloc[:int(n * 0.70)]
    val   = df.iloc[int(n * 0.70):int(n * 0.85)]
    test  = df.iloc[int(n * 0.85):]

    log.info(f"Split: train={len(train)}, val={len(val)}, test={len(test)}")
    log.info(f"Fraud rate — train: {train[TARGET_COLUMN].mean():.3%}, test: {test[TARGET_COLUMN].mean():.3%}")
    return train, val, test


def build_resampled_data(X_train: np.ndarray, y_train: np.ndarray) -> tuple:
    """Apply SMOTE + undersampling to address class imbalance."""
    log.info("Applying SMOTE + RandomUnderSampler...")
    fraud_rate = y_train.mean()
    log.info(f"Original fraud rate: {fraud_rate:.3%}")

    pipeline = ImbPipeline([
        ("smote", SMOTE(sampling_strategy=0.10, k_neighbors=5, random_state=42)),
        ("rus",   RandomUnderSampler(sampling_strategy=0.50, random_state=42)),
    ])
    X_res, y_res = pipeline.fit_resample(X_train, y_train)
    log.info(f"After resampling: {len(X_res)} samples, fraud rate: {y_res.mean():.3%}")
    return X_res, y_res


def train_random_forest(X_train: np.ndarray, y_train: np.ndarray) -> RandomForestClassifier:
    log.info("Training Random Forest...")
    rf = RandomForestClassifier(
        n_estimators=500,
        max_depth=14,
        min_samples_leaf=5,
        max_features="sqrt",
        class_weight={0: 1, 1: 10},
        n_jobs=-1,
        random_state=42,
    )
    rf.fit(X_train, y_train)
    log.info("Random Forest training complete")
    return rf


def train_xgboost(X_train: np.ndarray, y_train: np.ndarray) -> XGBClassifier:
    log.info("Training XGBoost...")
    xgb = XGBClassifier(
        n_estimators=1000,
        max_depth=7,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=int((y_train == 0).sum() / (y_train == 1).sum()),
        eval_metric="aucpr",
        early_stopping_rounds=50,
        n_jobs=-1,
        random_state=42,
        tree_method="hist",
    )
    xgb.fit(X_train, y_train, verbose=False)
    log.info("XGBoost training complete")
    return xgb


def ensemble_predict_proba(rf, xgb, X: np.ndarray) -> np.ndarray:
    """Weighted ensemble: RF 40%, XGB 60%."""
    rf_proba  = rf.predict_proba(X)[:, 1]
    xgb_proba = xgb.predict_proba(X)[:, 1]
    return 0.4 * rf_proba + 0.6 * xgb_proba


def evaluate(model_name: str, y_true: np.ndarray, y_proba: np.ndarray):
    """Print evaluation metrics focused on imbalanced classification."""
    auprc = average_precision_score(y_true, y_proba)
    auroc = roc_auc_score(y_true, y_proba)

    # Find threshold at 99% recall
    precisions, recalls, thresholds = precision_recall_curve(y_true, y_proba)
    idx_99 = np.argmin(np.abs(recalls - 0.99))
    threshold_99 = thresholds[min(idx_99, len(thresholds) - 1)]
    y_pred = (y_proba >= threshold_99).astype(int)
    fpr = 1 - (y_true[y_pred == 0] == 0).mean() if (y_pred == 0).any() else 0

    log.info(f"\n{'='*50}")
    log.info(f"Model: {model_name}")
    log.info(f"  AUPRC (primary): {auprc:.4f}")
    log.info(f"  AUROC:           {auroc:.4f}")
    log.info(f"  Threshold @99% recall: {threshold_99:.3f}")
    log.info(f"  FPR @99% recall: {fpr:.4f}")
    log.info(f"\n{classification_report(y_true, y_pred, target_names=['Legit', 'Fraud'])}")
    return auprc


def save_models(rf, xgb, model_path: str):
    os.makedirs(model_path, exist_ok=True)
    joblib.dump(rf,  os.path.join(model_path, "random_forest.joblib"))
    joblib.dump(xgb, os.path.join(model_path, "xgboost_model.joblib"))
    log.info(f"Models saved to {model_path}")


def main():
    parser = argparse.ArgumentParser(description="Train fraud detection ML models")
    parser.add_argument("--data-path", required=True, help="Path to CSV training data")
    parser.add_argument("--model-path", default="models", help="Output directory for saved models")
    parser.add_argument("--skip-smote", action="store_true", help="Skip SMOTE resampling")
    args = parser.parse_args()

    train_df, val_df, test_df = load_data(args.data_path)

    X_train = train_df[FEATURE_COLUMNS].values
    y_train = train_df[TARGET_COLUMN].values
    X_val   = val_df[FEATURE_COLUMNS].values
    y_val   = val_df[TARGET_COLUMN].values
    X_test  = test_df[FEATURE_COLUMNS].values
    y_test  = test_df[TARGET_COLUMN].values

    # Resample
    if not args.skip_smote:
        X_train, y_train = build_resampled_data(X_train, y_train)

    # Train
    rf  = train_random_forest(X_train, y_train)
    xgb = train_xgboost(X_train, y_train)

    # Evaluate on test set
    rf_proba  = rf.predict_proba(X_test)[:, 1]
    xgb_proba = xgb.predict_proba(X_test)[:, 1]
    ens_proba = ensemble_predict_proba(rf, xgb, X_test)

    evaluate("Random Forest", y_test, rf_proba)
    evaluate("XGBoost", y_test, xgb_proba)
    evaluate("Ensemble (RF 40% + XGB 60%)", y_test, ens_proba)

    # SHAP feature importance
    try:
        import shap
        explainer = shap.TreeExplainer(xgb)
        shap_values = explainer.shap_values(X_test[:500])
        mean_shap = np.abs(shap_values).mean(axis=0)
        feature_importance = sorted(
            zip(FEATURE_COLUMNS, mean_shap), key=lambda x: x[1], reverse=True
        )
        log.info("\nTop 10 SHAP Feature Importances (XGBoost):")
        for feat, val in feature_importance[:10]:
            log.info(f"  {feat:<30} {val:.4f}")
    except ImportError:
        log.warning("SHAP not installed — skipping feature importance")

    save_models(rf, xgb, args.model_path)
    log.info("Training pipeline complete!")


if __name__ == "__main__":
    main()
