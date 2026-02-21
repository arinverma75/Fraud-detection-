"use client";
import { useState, useEffect } from "react";
import {
    Shield, BarChart2, CreditCard, Bell, Network,
    Users, Settings,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Transaction } from "./types";

// Dynamically import all views with SSR disabled — prevents hydration crashes
// from recharts / requestAnimationFrame / Date usage in views
const DashboardView = dynamic(() => import("./views/DashboardView"), { ssr: false });
const TransactionsView = dynamic(() => import("./views/TransactionsView"), { ssr: false });
const AlertsView = dynamic(() => import("./views/AlertsView"), { ssr: false });
const GraphView = dynamic(() => import("./views/GraphView"), { ssr: false });
const KYCView = dynamic(() => import("./views/KYCView"), { ssr: false });
const SettingsView = dynamic(() => import("./views/SettingsView"), { ssr: false });

// ── Nav config ──────────────────────────────────────────────────────────────
type View = "dashboard" | "transactions" | "alerts" | "graph" | "kyc" | "settings";

const NAV: { id: View; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "dashboard", label: "Dashboard", icon: <BarChart2 size={15} /> },
    { id: "transactions", label: "Transactions", icon: <CreditCard size={15} /> },
    { id: "alerts", label: "Alerts", icon: <Bell size={15} />, badge: 5 },
    { id: "graph", label: "Graph Explorer", icon: <Network size={15} /> },
    { id: "kyc", label: "KYC Console", icon: <Users size={15} /> },
    { id: "settings", label: "Settings", icon: <Settings size={15} /> },
];

const VIEW_TITLES: Record<View, { title: string; sub: string }> = {
    dashboard: { title: "Analyst Dashboard", sub: "Real-time fraud monitoring" },
    transactions: { title: "Transaction Monitor", sub: "Filterable transaction feed with risk scoring" },
    alerts: { title: "Alert Manager", sub: "Fraud alerts · resolve and triage" },
    graph: { title: "Graph Explorer", sub: "Fraud ring & network analysis" },
    kyc: { title: "KYC Console", sub: "Identity verification queue" },
    settings: { title: "Settings", sub: "Risk thresholds & pipeline configuration" },
};

// ── Transaction detail modal ─────────────────────────────────────────────────
function TxnModal({ txn, onClose }: { txn: Transaction; onClose: () => void }) {
    const riskColor = txn.risk < 0.3 ? "#10b981"
        : txn.risk < 0.6 ? "#f59e0b"
            : txn.risk < 0.85 ? "#f97316"
                : "#ef4444";
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-title">Transaction Detail</div>
                <div style={{ fontFamily: "monospace", color: "var(--accent-light)", fontSize: 12, marginBottom: 18 }}>
                    {txn.id}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
                    {[
                        ["User", txn.user_id],
                        ["Amount", `$${txn.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${txn.currency}`],
                        ["Merchant", txn.merchant],
                        ["Country", `${txn.is_vpn ? "🔒 VPN · " : ""}${txn.country}`],
                        ["Latency", `${txn.latency_ms}ms`],
                        ["Time", new Date(txn.created_at).toLocaleString()],
                    ].map(([k, v]) => (
                        <div key={k} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "var(--r-sm)", padding: "10px 12px" }}>
                            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{k}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: k === "User" ? "monospace" : undefined }}>{v}</div>
                        </div>
                    ))}
                </div>

                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Risk Score</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${txn.risk * 100}%`, background: riskColor, borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 16, fontWeight: 800, color: riskColor }}>{(txn.risk * 100).toFixed(1)}%</span>
                    </div>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost" onClick={onClose}>Close</button>
                    <button className="btn btn-danger">🚫 Manual Block</button>
                    <button className="btn btn-success">✓ Clear as Safe</button>
                </div>
            </div>
        </div>
    );
}

// ── System status row ────────────────────────────────────────────────────────
function StatusRow({ label, ok }: { label: string; ok: boolean }) {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
            <span className={`chip ${ok ? "chip-online" : "chip-error"}`} style={{ padding: "1px 6px", fontSize: 10 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: ok ? "#10b981" : "#ef4444", display: "inline-block" }} />
                {ok ? "OK" : "ERR"}
            </span>
        </div>
    );
}

// ── Main app ─────────────────────────────────────────────────────────────────
export default function App() {
    const [view, setView] = useState<View>("dashboard");
    const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
    // Use state + effect for current date to avoid SSR hydration mismatch
    const [dateStr, setDateStr] = useState("");

    useEffect(() => {
        setDateStr(new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }));
    }, []);

    const { title, sub } = VIEW_TITLES[view];

    return (
        <div className="layout">
            {/* ── Sidebar ── */}
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <div className="logo-icon"><Shield size={18} color="white" /></div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>FraudShield</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Detection Platform</div>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <div className="nav-section">Main</div>
                    {NAV.slice(0, 3).map(n => (
                        <div key={n.id} className={`nav-item${view === n.id ? " active" : ""}`} onClick={() => setView(n.id)}>
                            {n.icon}
                            <span>{n.label}</span>
                            {n.badge && <span className="nav-badge">{n.badge}</span>}
                        </div>
                    ))}

                    <div className="nav-section">Analysis</div>
                    {NAV.slice(3, 5).map(n => (
                        <div key={n.id} className={`nav-item${view === n.id ? " active" : ""}`} onClick={() => setView(n.id)}>
                            {n.icon}
                            <span>{n.label}</span>
                        </div>
                    ))}

                    <div className="nav-section">System</div>
                    {NAV.slice(5).map(n => (
                        <div key={n.id} className={`nav-item${view === n.id ? " active" : ""}`} onClick={() => setView(n.id)}>
                            {n.icon}
                            <span>{n.label}</span>
                        </div>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <StatusRow label="API" ok={true} />
                    <StatusRow label="Redis" ok={false} />
                    <StatusRow label="Kafka" ok={false} />
                    <StatusRow label="Neo4j" ok={false} />
                </div>
            </aside>

            {/* ── Main content ── */}
            <main className="main">
                {/* Topbar */}
                <div className="topbar">
                    <div>
                        <div className="topbar-title">{title}</div>
                        <div className="topbar-sub">{sub}</div>
                    </div>
                    <div className="topbar-right">
                        {/* suppressHydrationWarning prevents mismatch warnings on date */}
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }} suppressHydrationWarning>
                            {dateStr}
                        </div>
                        <div style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "5px 10px",
                            background: "var(--bg-card)", borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
                        }}>
                            <div style={{
                                width: 26, height: 26, borderRadius: "50%",
                                background: "linear-gradient(135deg,#6366f1,#a855f7)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 11, fontWeight: 800,
                            }}>A</div>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>Analyst</span>
                        </div>
                    </div>
                </div>

                {/* View router */}
                {view === "dashboard" && <DashboardView onNav={v => setView(v as View)} />}
                {view === "transactions" && <TransactionsView onSelect={setSelectedTxn} />}
                {view === "alerts" && <AlertsView />}
                {view === "graph" && <GraphView />}
                {view === "kyc" && <KYCView />}
                {view === "settings" && <SettingsView />}
            </main>

            {/* Transaction detail modal */}
            {selectedTxn && <TxnModal txn={selectedTxn} onClose={() => setSelectedTxn(null)} />}
        </div>
    );
}
