"use client";
import { useState, useEffect } from "react";
import { Alert } from "../types";
import { genAlerts } from "../mockdata";
import { Bell, CheckCircle, Filter, RefreshCw, AlertTriangle, Shield, Zap, Globe } from "lucide-react";

const SEV_COLOR: Record<string, string> = {
    critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#10b981",
};
const SEV_BG: Record<string, string> = {
    critical: "rgba(239,68,68,0.1)", high: "rgba(249,115,22,0.1)",
    medium: "rgba(245,158,11,0.08)", low: "rgba(16,185,129,0.08)",
};
const TYPE_ICON: Record<string, React.ReactNode> = {
    fraud_ring: <Shield size={15} />, impossible_travel: <Globe size={15} />,
    velocity: <Zap size={15} />, tor_exit: <Globe size={15} />,
    kyc_breach: <AlertTriangle size={15} />, card_testing: <Zap size={15} />,
    synthetic_id: <AlertTriangle size={15} />, account_takeover: <Shield size={15} />,
};

function timeAgo(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return `${Math.round(diff)}s ago`;
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    return `${Math.round(diff / 3600)}h ago`;
}

export default function AlertsView() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [sevFilter, setSevFilter] = useState<string>("all");
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [showResolved, setShowResolved] = useState(false);

    useEffect(() => { setAlerts(genAlerts(30)); }, []);

    // New alert every 10s
    useEffect(() => {
        const timer = setInterval(() => {
            setAlerts(prev => {
                const fresh = genAlerts(1)[0];
                fresh.resolved = false;
                return [fresh, ...prev].slice(0, 50);
            });
        }, 10000);
        return () => clearInterval(timer);
    }, []);

    const resolve = (id: string) =>
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));

    const filtered = alerts.filter(a => {
        if (!showResolved && a.resolved) return false;
        if (sevFilter !== "all" && a.severity !== sevFilter) return false;
        if (typeFilter !== "all" && a.type !== typeFilter) return false;
        return true;
    });

    const unresolved = alerts.filter(a => !a.resolved).length;
    const bySev = (s: string) => alerts.filter(a => a.severity === s && !a.resolved).length;

    return (
        <div className="content">
            {/* Summary chips */}
            <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
                {(["critical", "high", "medium", "low"] as const).map(s => (
                    <div key={s} className="card" style={{ padding: "12px 18px", flex: 1, minWidth: 120, borderColor: bySev(s) > 0 ? SEV_COLOR[s] + "40" : "var(--border)" }}>
                        <div style={{ fontSize: 11, color: SEV_COLOR[s], fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: SEV_COLOR[s] }}>{bySev(s)}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="card" style={{ marginBottom: 14, padding: "12px 16px" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <select className="select" style={{ width: 150 }} value={sevFilter} onChange={e => setSevFilter(e.target.value)}>
                        <option value="all">All Severities</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                    <select className="select" style={{ width: 190 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                        <option value="all">All Types</option>
                        <option value="fraud_ring">Fraud Ring</option>
                        <option value="impossible_travel">Impossible Travel</option>
                        <option value="velocity">Velocity Spike</option>
                        <option value="tor_exit">TOR Exit</option>
                        <option value="kyc_breach">KYC Breach</option>
                        <option value="card_testing">Card Testing</option>
                        <option value="account_takeover">Account Takeover</option>
                    </select>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", color: "var(--text-secondary)", fontSize: 13 }}>
                        <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                        Show Resolved
                    </label>
                    <button className="btn btn-ghost" onClick={() => setAlerts(genAlerts(30))} style={{ marginLeft: "auto" }}><RefreshCw size={13} /> Refresh</button>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{unresolved} unresolved</span>
                </div>
            </div>

            {/* Alert list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filtered.length === 0 && (
                    <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                        <CheckCircle size={32} style={{ margin: "0 auto 12px", color: "var(--risk-low)" }} />
                        No alerts match current filters
                    </div>
                )}
                {filtered.map(alert => (
                    <div key={alert.id} className={`alert-item ${alert.resolved ? "resolved" : ""}`}
                        style={{ borderLeftWidth: 3, borderLeftColor: SEV_COLOR[alert.severity] }}>
                        <div style={{ width: 32, height: 32, borderRadius: "var(--r-sm)", background: SEV_BG[alert.severity], display: "flex", alignItems: "center", justifyContent: "center", color: SEV_COLOR[alert.severity], flexShrink: 0 }}>
                            {TYPE_ICON[alert.type]}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                                <span style={{ fontWeight: 700, fontSize: 13 }}>{alert.title}</span>
                                <span className={`badge badge-${alert.severity}`}>{alert.severity}</span>
                                {alert.resolved && <span className="badge badge-low">Resolved</span>}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 3 }}>{alert.desc}</div>
                            <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-muted)" }}>
                                <span>User: <span style={{ color: "var(--accent-light)", fontFamily: "monospace" }}>{alert.user_id}</span></span>
                                <span>TXN: <span style={{ color: "var(--accent-light)", fontFamily: "monospace" }}>{alert.txn_id}</span></span>
                                <span>{timeAgo(alert.created_at)}</span>
                            </div>
                        </div>
                        {!alert.resolved && (
                            <button className="btn btn-success btn-sm" onClick={() => resolve(alert.id)}>
                                <CheckCircle size={12} /> Resolve
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
