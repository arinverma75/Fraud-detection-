// Shared type definitions for all views

export interface Transaction {
    id: string;
    user_id: string;
    amount: number;
    currency: string;
    merchant: string;
    decision: string;
    risk: number;
    country: string;
    is_vpn: boolean;
    latency_ms: number;
    created_at: string;
    label: "fraud" | "legitimate" | null;
}

export interface Alert {
    id: string;
    type: "fraud_ring" | "impossible_travel" | "velocity" | "tor_exit" | "kyc_breach" | "card_testing" | "synthetic_id" | "account_takeover";
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    desc: string;
    user_id: string;
    txn_id: string;
    created_at: string;
    resolved: boolean;
}

export interface KYCRecord {
    id: string;
    user_id: string;
    name: string;
    doc_type: "passport" | "driving_license";
    submitted_at: string;
    status: "pending" | "in_review" | "approved" | "rejected";
    risk_flags: string[];
    kyc_score: number;
}

export interface GraphNode {
    id: string;
    type: "account" | "device" | "ip" | "merchant";
    risk: number;
    label: string;
    x: number;
    y: number;
    vx?: number;
    vy?: number;
}

export interface GraphEdge {
    source: string;
    target: string;
    weight: number;
    type: "shared_device" | "shared_ip" | "transaction" | "shared_merchant";
}
