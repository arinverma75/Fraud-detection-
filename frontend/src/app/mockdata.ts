"use client";
// Shared mock data generators for all views
import { Transaction, Alert, KYCRecord } from "./types";

const DECISIONS = ["approved", "approved", "approved", "approved", "flagged", "hard_blocked", "stepup_auth"];
const COUNTRIES = ["US", "GB", "DE", "FR", "JP", "SG", "BR", "IN", "AU", "CA"];
const MERCHANTS = ["Amazon", "Stripe", "Shopify", "PayPal", "Coinbase", "Revolut", "Wise", "Binance", "Klarna", "Afterpay"];

export function genTxns(count = 30): Transaction[] {
    return Array.from({ length: count }, (_, i) => {
        const decision = DECISIONS[Math.floor(Math.random() * DECISIONS.length)];
        const risk = decision === "hard_blocked" ? Math.random() * 0.25 + 0.75
            : decision === "flagged" ? Math.random() * 0.3 + 0.4
                : Math.random() * 0.3;
        return {
            id: `TXN-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            user_id: `USR-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
            amount: parseFloat((Math.random() * 8000 + 5).toFixed(2)),
            currency: "USD",
            merchant: MERCHANTS[Math.floor(Math.random() * MERCHANTS.length)],
            decision,
            risk,
            country: COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)],
            is_vpn: Math.random() < 0.1,
            latency_ms: parseFloat((Math.random() * 100 + 40).toFixed(1)),
            created_at: new Date(Date.now() - Math.random() * 7200000).toISOString(),
            label: null,
        };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function genAlerts(count = 20): Alert[] {
    const types: Alert["type"][] = ["fraud_ring", "impossible_travel", "velocity", "tor_exit", "kyc_breach", "card_testing", "synthetic_id", "account_takeover"];
    const sevs: Alert["severity"][] = ["critical", "critical", "high", "high", "medium", "medium", "low"];
    return Array.from({ length: count }, (_, i) => {
        const type = types[Math.floor(Math.random() * types.length)];
        const sev = sevs[Math.floor(Math.random() * sevs.length)];
        return {
            id: `ALT-${i + 1000}`,
            type, severity: sev,
            title: typeLabel(type),
            desc: typeDesc(type),
            user_id: `USR-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
            txn_id: `TXN-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            created_at: new Date(Date.now() - Math.random() * 86400000).toISOString(),
            resolved: Math.random() < 0.25,
        };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function genKYCQueue(count = 12): KYCRecord[] {
    const statuses: KYCRecord["status"][] = ["pending", "in_review", "in_review", "approved", "rejected"];
    return Array.from({ length: count }, (_, i) => ({
        id: `KYC-${1000 + i}`,
        user_id: `USR-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        name: randomName(),
        doc_type: Math.random() < 0.6 ? "passport" : "driving_license",
        submitted_at: new Date(Date.now() - Math.random() * 172800000).toISOString(),
        status: statuses[Math.floor(Math.random() * statuses.length)],
        risk_flags: Math.random() < 0.3 ? ["face_mismatch"] : Math.random() < 0.2 ? ["expired_doc"] : [],
        kyc_score: parseFloat((Math.random() * 0.6 + 0.4).toFixed(2)),
    }));
}

const NAMES = ["Alice Chen", "Bob Martinez", "Carlos Silva", "Diana Patel", "Ethan Kim", "Fatima Ali", "Grace Wang", "Hugo Müller", "Ines Ferreira", "James O'Brien"];
function randomName() { return NAMES[Math.floor(Math.random() * NAMES.length)]; }

function typeLabel(t: string): string {
    const m: Record<string, string> = {
        fraud_ring: "Fraud Ring Detected", impossible_travel: "Impossible Travel",
        velocity: "Velocity Spike", tor_exit: "TOR Exit Node",
        kyc_breach: "KYC Limit Breach", card_testing: "Card Testing Pattern",
        synthetic_id: "Synthetic Identity", account_takeover: "Account Takeover",
    };
    return m[t] ?? t;
}
function typeDesc(t: string): string {
    const m: Record<string, string> = {
        fraud_ring: "Multiple accounts linked via shared device fingerprint",
        impossible_travel: "Transaction from two locations within impossible timeframe",
        velocity: "User exceeded 30 transactions per hour",
        tor_exit: "Transaction routed through TOR exit node",
        kyc_breach: "Unverified user exceeded transaction limit",
        card_testing: "Series of small probing transactions detected",
        synthetic_id: "Identity documents show signs of forgery",
        account_takeover: "Login from new device + password change + high-value txn",
    };
    return m[t] ?? t;
}
