# 🛡️ Fraud Detection Platform

Real-time fraud detection using ML, graph analysis, and behavioral biometrics. Processes transactions with sub-200ms risk scoring.

## Architecture

- **Frontend**: Next.js 14 (App Router) — Analyst Dashboard, Alert Manager, Graph Visualizer
- **Backend**: Python 3.11 + FastAPI (async) — Transaction, Risk, KYC, Graph, Fingerprint services  
- **Streaming**: Apache Kafka + Flink-style enrichment — velocity features, session windows
- **ML**: Random Forest + XGBoost/LightGBM ensemble with SHAP explainability
- **Graph**: Neo4j 5 — fraud ring & sybil attack detection
- **Infrastructure**: PostgreSQL 16, Redis 7, Docker

## Quick Start

### Prerequisites
- Docker Desktop (Windows) with WSL2
- Node.js 20+
- Python 3.11+

### 1. Clone and configure
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 2. Start infrastructure
```bash
docker-compose up -d zookeeper kafka postgres redis neo4j
```

### 3. Run backend
```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### 4. Train initial models
```bash
cd ml
python -m pipeline.train --data-path data/sample_transactions.csv
```

### 5. Run frontend
```bash
cd frontend
npm install
npm run dev
```

### 6. Full stack via Docker
```bash
docker-compose up --build
```

## Services

| Service | URL |
|---|---|
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Frontend Dashboard | http://localhost:3000 |
| Kafka UI | http://localhost:8080 |
| Neo4j Browser | http://localhost:7474 |

## API Example

```bash
# Submit a transaction for fraud scoring
curl -X POST http://localhost:8000/v1/transactions/evaluate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "transaction_id": "txn_abc123",
    "user_id": "user_456",
    "amount": 1500.00,
    "currency": "USD",
    "merchant_id": "merchant_789",
    "merchant_category": "electronics",
    "device_fingerprint": "fp_hash_xyz",
    "ip_address": "203.0.113.45",
    "lat": 40.7128,
    "lon": -74.0060
  }'
```

## Project Structure

```
.
├── backend/           # FastAPI services
│   ├── app/
│   │   ├── services/  # transaction, risk, graph, kyc, fingerprint
│   │   ├── models/    # SQLAlchemy + Pydantic
│   │   ├── api/       # Route handlers
│   │   └── core/      # Config, security, kafka, redis
│   └── db/            # Migrations (Alembic) + init.sql
├── frontend/          # Next.js 14 dashboard
│   └── src/app/       # App Router pages & components
├── ml/                # ML pipeline
│   ├── pipeline/      # train, evaluate, predict
│   ├── features/      # Feature engineering
│   └── models/        # Saved model artifacts
└── streaming/         # Kafka topic config & Flink jobs
```
