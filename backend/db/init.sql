-- Fraud Detection Platform — PostgreSQL Schema
-- Run via Alembic or directly for development

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fast text search

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255),
    role            VARCHAR(20) NOT NULL DEFAULT 'customer',
    kyc_tier        INTEGER NOT NULL DEFAULT 0,
    kyc_status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_frozen       BOOLEAN NOT NULL DEFAULT FALSE,
    risk_score      FLOAT NOT NULL DEFAULT 0.0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_risk_score ON users(risk_score DESC);

-- ─── Transactions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id       VARCHAR(255) UNIQUE NOT NULL,
    user_id              UUID NOT NULL REFERENCES users(id),
    amount               FLOAT NOT NULL,
    currency             VARCHAR(3) NOT NULL DEFAULT 'USD',
    merchant_id          VARCHAR(255) NOT NULL,
    merchant_category    VARCHAR(100),
    payment_method       VARCHAR(50),
    decision             VARCHAR(30),
    risk_score           FLOAT,
    rf_score             FLOAT,
    xgb_score            FLOAT,
    decision_reason      TEXT,
    hard_rule_triggered  VARCHAR(100),
    device_fingerprint   VARCHAR(255),
    ip_address           VARCHAR(45),
    lat                  FLOAT,
    lon                  FLOAT,
    country              VARCHAR(2),
    city                 VARCHAR(100),
    is_vpn               BOOLEAN DEFAULT FALSE,
    is_tor               BOOLEAN DEFAULT FALSE,
    features             JSONB,
    analyst_label        VARCHAR(50),
    reviewed_by          VARCHAR(255),
    reviewed_at          TIMESTAMPTZ,
    processing_time_ms   FLOAT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Monthly partitions (add more as needed)
CREATE TABLE IF NOT EXISTS transactions_2026_01 PARTITION OF transactions
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE IF NOT EXISTS transactions_2026_02 PARTITION OF transactions
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS transactions_2026_03 PARTITION OF transactions
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS transactions_default PARTITION OF transactions DEFAULT;

CREATE INDEX IF NOT EXISTS idx_txn_user_id ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txn_risk_score ON transactions(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_txn_decision ON transactions(decision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txn_device ON transactions(device_fingerprint);

-- ─── Device Records ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_records (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES users(id),
    fingerprint_hash  VARCHAR(255) NOT NULL,
    user_agent        TEXT,
    os                VARCHAR(100),
    browser           VARCHAR(100),
    is_trusted        BOOLEAN DEFAULT FALSE,
    fraud_count       INTEGER DEFAULT 0,
    first_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_fp ON device_records(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_device_user ON device_records(user_id);

-- ─── Alerts ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id  UUID REFERENCES transactions(id),
    user_id         VARCHAR(255),
    alert_type      VARCHAR(100) NOT NULL,
    severity        VARCHAR(20) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    is_resolved     BOOLEAN DEFAULT FALSE,
    resolved_by     VARCHAR(255),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(is_resolved, created_at DESC);

-- ─── Seed analyst user ────────────────────────────────────────────────────────
-- Password: Analyst@123 (bcrypt hash)
INSERT INTO users (email, hashed_password, full_name, role, kyc_tier, kyc_status)
VALUES (
    'analyst@fraudplatform.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/aBcBdNzAGH3Km0kXa',
    'Platform Analyst',
    'analyst',
    3,
    'approved'
) ON CONFLICT (email) DO NOTHING;
