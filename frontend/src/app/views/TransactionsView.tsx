"use client";
import { useState, useEffect, useRef } from "react";
import { Transaction } from "../types";
import { genTxns } from "../mockdata";
import { Shield, Search, Filter, RefreshCw, CheckCircle, XCircle, Eye } from "lucide-react";

function RiskBar({ score }: { score: number }) {
    const color = score < 0.3 ? "#10b981" : score < 0.6 ? "#f59e0b" : score < 0.85 ? "#f97316" : "#ef4444";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div className="risk-bar-track">
                <div className="risk-bar-fill" style={{ width: `${score * 100}%`, background: color }} />
            </div>
            <span style={{ fontSize: 11, color, fontWeight: 700, minWidth: 34 }}>{(score * 100).toFixed(0)}%</span>
        </div>
    );
}

function DecisionBadge({ d }: { d: string }) {
    const m: Record<string, string> = {
        approved: "badge-approved", approved_monitored: "badge-monitored",
        stepup_auth: "badge-stepup", flagged: "badge-flagged", hard_blocked: "badge-blocked",
    };
    const labels: Record<string, string> = {
        approved: "✓ Approved", approved_monitored: "✓ Monitored",
        stepup_auth: "⚡ Step-Up", flagged: "⚠ Flagged", hard_blocked: "✕ Blocked",
    };
    return <span className={`badge ${m[d] ?? "badge-approved"}`}>{labels[d] ?? d}</span>;
}

interface Props { onSelect: (t: Transaction) => void; }

export default function TransactionsView({ onSelect }: Props) {
    const [txns, setTxns] = useState<Transaction[]>([]);
    const [search, setSearch] = useState("");
    const [decisionFilter, setDecisionFilter] = useState("all");
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 12;

    useEffect(() => { setTxns(genTxns(100)); }, []);

    const filtered = txns.filter(t => {
        const matchSearch = !search || t.id.toLowerCase().includes(search.toLowerCase()) || t.user_id.toLowerCase().includes(search.toLowerCase()) || t.merchant.toLowerCase().includes(search.toLowerCase());
        const matchDec = decisionFilter === "all" || t.decision === decisionFilter;
        return matchSearch && matchDec;
    });

    const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

    return (
        <div className="content">
            {/* Filters */}
            <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                        <input className="input" placeholder="Search by ID, user, merchant…" style={{ paddingLeft: 32 }} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
                    </div>
                    <select className="select" style={{ width: 160 }} value={decisionFilter} onChange={e => { setDecisionFilter(e.target.value); setPage(0); }}>
                        <option value="all">All Decisions</option>
                        <option value="approved">Approved</option>
                        <option value="flagged">Flagged</option>
                        <option value="hard_blocked">Hard Blocked</option>
                        <option value="stepup_auth">Step-Up Auth</option>
                    </select>
                    <button className="btn btn-ghost" onClick={() => setTxns(genTxns(100))}><RefreshCw size={13} /> Refresh</button>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>{filtered.length} transactions</span>
                </div>
            </div>

            {/* Table */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div className="table-wrap">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>TXN ID</th><th>User</th><th>Amount</th><th>Merchant</th>
                                <th>Country</th><th>Risk Score</th><th>Decision</th><th>Latency</th><th>Time</th><th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.map(t => (
                                <tr key={t.id}>
                                    <td><span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--accent-light)" }}>{t.id}</span></td>
                                    <td><span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)" }}>{t.user_id}</span></td>
                                    <td><strong>${t.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></td>
                                    <td style={{ color: "var(--text-secondary)" }}>{t.merchant}</td>
                                    <td>
                                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                            {t.is_vpn && <span style={{ fontSize: 10, color: "var(--risk-high)" }}>VPN</span>}
                                            <span>{t.country}</span>
                                        </div>
                                    </td>
                                    <td><RiskBar score={t.risk} /></td>
                                    <td><DecisionBadge d={t.decision} /></td>
                                    <td><span style={{ fontSize: 11, color: t.latency_ms > 150 ? "var(--risk-medium)" : "var(--text-muted)" }}>{t.latency_ms}ms</span></td>
                                    <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{new Date(t.created_at).toLocaleTimeString()}</td>
                                    <td>
                                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onSelect(t)}><Eye size={13} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Page {page + 1} of {totalPages || 1}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
                        <button className="btn btn-ghost btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
