"use client";
import { useState, useEffect } from "react";
import { KYCRecord } from "../types";
import { genKYCQueue } from "../mockdata";
import { CheckCircle, XCircle, Clock, FileText, User, AlertTriangle, RefreshCw } from "lucide-react";

function timeAgo(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return `${Math.round(diff)}s ago`;
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    return `${Math.round(diff / 3600)}h ago`;
}

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
    pending: { cls: "badge-medium", label: "⏳ Pending" },
    in_review: { cls: "badge-blue", label: "🔍 In Review" },
    approved: { cls: "badge-approved", label: "✓ Approved" },
    rejected: { cls: "badge-blocked", label: "✕ Rejected" },
};

const KYC_STEPS = [
    "Document Submitted",
    "Identity Verification",
    "Liveness Check",
    "AML Screening",
    "Analyst Review",
    "Decision",
];

function KYCSteps({ status }: { status: KYCRecord["status"] }) {
    const progress = { pending: 1, in_review: 3, approved: 6, rejected: 4 }[status] ?? 1;
    return (
        <div style={{ width: "100%", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 0 }}>
                {KYC_STEPS.map((step, i) => {
                    const done = i < progress;
                    const active = i === progress - 1;
                    const failed = status === "rejected" && i === progress - 1;
                    return (
                        <div key={step} style={{ flex: 1, position: "relative" }}>
                            <div style={{ height: 3, background: done ? (failed ? "#ef4444" : "#10b981") : "rgba(255,255,255,0.06)", borderRadius: i === 0 ? "3px 0 0 3px" : i === KYC_STEPS.length - 1 ? "0 3px 3px 0" : 0 }} />
                            <div style={{ textAlign: "center", marginTop: 6, fontSize: 9, color: done ? (failed ? "#ef4444" : "#10b981") : "var(--text-muted)", fontWeight: done ? 700 : 400 }}>
                                {step}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function KYCView() {
    const [queue, setQueue] = useState<KYCRecord[]>([]);
    const [selected, setSelected] = useState<KYCRecord | null>(null);
    const [statusFilter, setStatusFilter] = useState("all");

    useEffect(() => { setQueue(genKYCQueue(16)); }, []);

    const filtered = queue.filter(r => statusFilter === "all" || r.status === statusFilter);

    const approve = (id: string) => {
        setQueue(prev => prev.map(r => r.id === id ? { ...r, status: "approved" as const } : r));
        if (selected?.id === id) setSelected(prev => prev ? { ...prev, status: "approved" } : prev);
    };
    const reject = (id: string) => {
        setQueue(prev => prev.map(r => r.id === id ? { ...r, status: "rejected" as const } : r));
        if (selected?.id === id) setSelected(prev => prev ? { ...prev, status: "rejected" } : prev);
    };

    const stats = {
        pending: queue.filter(r => r.status === "pending").length,
        in_review: queue.filter(r => r.status === "in_review").length,
        approved: queue.filter(r => r.status === "approved").length,
        rejected: queue.filter(r => r.status === "rejected").length,
    };

    return (
        <div className="content">
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
                {([["pending", "⏳", "#f59e0b"], ["in_review", "🔍", "#6366f1"], ["approved", "✓", "#10b981"], ["rejected", "✕", "#ef4444"]] as [string, string, string][]).map(([k, icon, color]) => (
                    <div className="card" key={k} style={{ borderColor: `${color}30` }}>
                        <div style={{ fontSize: 11, color, fontWeight: 700, textTransform: "capitalize", letterSpacing: "0.04em" }}>{icon} {k.replace("_", " ")}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color }}>{stats[k as keyof typeof stats]}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: "flex", gap: 16 }}>
                {/* Queue list */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                        <select className="select" style={{ width: 170 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                            <option value="all">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="in_review">In Review</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                        <button className="btn btn-ghost" onClick={() => setQueue(genKYCQueue(16))}><RefreshCw size={13} /></button>
                    </div>
                    {filtered.map(rec => (
                        <div key={rec.id} className={`alert-item`}
                            style={{ borderColor: selected?.id === rec.id ? "var(--accent)" : "var(--border)", cursor: "pointer" }}
                            onClick={() => setSelected(rec)}>
                            <div style={{ width: 36, height: 36, borderRadius: "var(--r-md)", background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <User size={16} color="var(--accent-light)" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                                    <span style={{ fontWeight: 700, fontSize: 13 }}>{rec.name}</span>
                                    <span className={`badge ${STATUS_BADGE[rec.status].cls}`}>{STATUS_BADGE[rec.status].label}</span>
                                    {rec.risk_flags.length > 0 && <span className="badge badge-high">⚠ {rec.risk_flags.length} flag{rec.risk_flags.length > 1 ? "s" : ""}</span>}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 12 }}>
                                    <span style={{ fontFamily: "monospace", color: "var(--accent-light)" }}>{rec.user_id}</span>
                                    <span>{rec.doc_type === "passport" ? "🛂 Passport" : "🪪 Driving Licence"}</span>
                                    <span>{timeAgo(rec.submitted_at)}</span>
                                </div>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: rec.kyc_score > 0.7 ? "#10b981" : "#f59e0b" }}>
                                {(rec.kyc_score * 100).toFixed(0)}%
                            </div>
                        </div>
                    ))}
                </div>

                {/* Detail panel */}
                <div style={{ width: 280, flexShrink: 0 }}>
                    {selected ? (
                        <div className="card" style={{ position: "sticky", top: 16, borderColor: "var(--border-glow)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontWeight: 700, fontSize: 14 }}>{selected.name}</span>
                                <span className={`badge ${STATUS_BADGE[selected.status].cls}`}>{STATUS_BADGE[selected.status].label}</span>
                            </div>
                            <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--accent-light)", marginBottom: 14 }}>{selected.user_id} · {selected.id}</div>

                            <KYCSteps status={selected.status} />

                            <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12, marginBottom: 14 }}>
                                {[["Document", selected.doc_type === "passport" ? "🛂 Passport" : "🪪 Driving Licence"], ["Submitted", timeAgo(selected.submitted_at)], ["KYC Score", `${(selected.kyc_score * 100).toFixed(0)}%`]].map(([k, v]) => (
                                    <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ color: "var(--text-muted)" }}>{k}</span>
                                        <span style={{ fontWeight: 600 }}>{v}</span>
                                    </div>
                                ))}
                            </div>

                            {selected.risk_flags.length > 0 && (
                                <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--r-md)", padding: "10px 12px", marginBottom: 14 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>⚠ Risk Flags</div>
                                    {selected.risk_flags.map(f => (
                                        <div key={f} style={{ fontSize: 12, color: "var(--text-secondary)" }}>• {f.replace(/_/g, " ")}</div>
                                    ))}
                                </div>
                            )}

                            {(selected.status === "pending" || selected.status === "in_review") && (
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button className="btn btn-success" style={{ flex: 1 }} onClick={() => approve(selected.id)}>
                                        <CheckCircle size={14} /> Approve
                                    </button>
                                    <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => reject(selected.id)}>
                                        <XCircle size={14} /> Reject
                                    </button>
                                </div>
                            )}
                            {selected.status === "approved" && <div style={{ textAlign: "center", color: "#10b981", fontWeight: 700, fontSize: 12 }}>✓ Identity Verified</div>}
                            {selected.status === "rejected" && <div style={{ textAlign: "center", color: "#ef4444", fontWeight: 700, fontSize: 12 }}>✕ Application Rejected</div>}
                        </div>
                    ) : (
                        <div className="card" style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", border: "1px dashed var(--border)" }}>
                            <FileText size={28} style={{ margin: "0 auto 10px" }} />
                            <div style={{ fontSize: 13 }}>Select a record to review</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
