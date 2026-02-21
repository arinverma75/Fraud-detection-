"use client";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar
} from "recharts";
import { useState, useEffect } from "react";
import { Activity, XCircle, Shield, Cpu, ChevronRight } from "lucide-react";
import { genTxns } from "../mockdata";
import { Transaction } from "../types";

function genTimeSeries() {
    return Array.from({ length: 24 }, (_, i) => ({
        time: `${String(i).padStart(2, "0")}:00`,
        approved: Math.floor(Math.random() * 800 + 200),
        flagged: Math.floor(Math.random() * 80 + 10),
        blocked: Math.floor(Math.random() * 30 + 5),
    }));
}
const PIE = [
    { name: "Approved", value: 78.4, color: "#10b981" },
    { name: "Monitored", value: 12.1, color: "#6366f1" },
    { name: "Step-Up", value: 5.8, color: "#06b6d4" },
    { name: "Flagged", value: 2.9, color: "#f59e0b" },
    { name: "Blocked", value: 0.8, color: "#ef4444" },
];
const RISK_DIST = [
    { range: "0–0.1", count: 1240 }, { range: "0.1–0.2", count: 890 },
    { range: "0.2–0.3", count: 340 }, { range: "0.3–0.5", count: 180 },
    { range: "0.5–0.7", count: 92 }, { range: "0.7–1.0", count: 45 },
];
const MOCK_ALERTS = [
    { id: 1, sev: "critical", title: "Fraud Ring Detected", desc: "14 accounts linked via shared device fp_abc123", time: "2m" },
    { id: 2, sev: "high", title: "Impossible Travel", desc: "USR-ABC123: NY → Paris in 90 min", time: "8m" },
    { id: 3, sev: "high", title: "Velocity Spike", desc: "USR-DEF456 hit 34 txns in 1 hour", time: "15m" },
    { id: 4, sev: "medium", title: "TOR Exit Detected", desc: "5 blocked txns from 185.220.x.x", time: "23m" },
];
const SEV_DOT: Record<string, string> = {
    critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#10b981",
};

function RiskBar({ score }: { score: number }) {
    const c = score < .3 ? "#10b981" : score < .6 ? "#f59e0b" : score < .85 ? "#f97316" : "#ef4444";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div className="risk-bar-track"><div className="risk-bar-fill" style={{ width: `${score * 100}%`, background: c }} /></div>
            <span style={{ fontSize: 11, color: c, fontWeight: 700, minWidth: 32 }}>{(score * 100).toFixed(0)}%</span>
        </div>
    );
}

export default function DashboardView({ onNav }: { onNav: (v: string) => void }) {
    const [txns, setTxns] = useState<Transaction[]>([]);
    const [series] = useState(genTimeSeries());
    const [ts, setTs] = useState<Date | null>(null);

    useEffect(() => { setTxns(genTxns(15)); setTs(new Date()); }, []);
    useEffect(() => {
        const t = setInterval(() => { setTxns(genTxns(15)); setTs(new Date()); }, 8000);
        return () => clearInterval(t);
    }, []);

    const STATS = [
        { label: "Transactions Today", value: "128,492", delta: "+4.2% vs yesterday", color: "rgba(99,102,241,0.2)", icon: <Activity size={17} color="white" /> },
        { label: "Fraud Blocked", value: "1,847", delta: "+12.3% vs last week", color: "rgba(239,68,68,0.2)", icon: <XCircle size={17} color="white" /> },
        { label: "Avg Risk Score", value: "0.142", delta: "−0.008 from yesterday", color: "rgba(16,185,129,0.2)", icon: <Shield size={17} color="white" /> },
        { label: "Avg Latency", value: "87ms", delta: "P99: 198ms | SLA: 200ms", color: "rgba(6,182,212,0.2)", icon: <Cpu size={17} color="white" /> },
    ];

    return (
        <div className="content">
            <div className="stats-grid">
                {STATS.map(s => (
                    <div key={s.label} className="card">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                                <div className="card-title">{s.label}</div>
                                <div className="card-value">{s.value}</div>
                                <div className="card-delta">{s.delta}</div>
                            </div>
                            <div style={{ padding: 10, borderRadius: "var(--r-md)", background: s.color }}>{s.icon}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
                <div className="card">
                    <div className="card-title">Volume (24h)</div>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={series} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                            <defs>
                                <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                                <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 9 }} tickLine={false} axisLine={false} interval={3} />
                            <YAxis tick={{ fill: "#475569", fontSize: 9 }} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8 }} itemStyle={{ color: "var(--text-primary)" }} labelStyle={{ color: "var(--text-secondary)" }} />
                            <Area type="monotone" dataKey="approved" stroke="#10b981" strokeWidth={2} fill="url(#ga)" name="Approved" />
                            <Area type="monotone" dataKey="blocked" stroke="#ef4444" strokeWidth={2} fill="url(#gb)" name="Blocked" />
                            <Area type="monotone" dataKey="flagged" stroke="#f59e0b" strokeWidth={2} fill="none" name="Flagged" strokeDasharray="4 2" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <div className="card">
                    <div className="card-title">Decision Breakdown</div>
                    <ResponsiveContainer width="100%" height={130}>
                        <PieChart><Pie data={PIE} cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={3} dataKey="value">
                            {PIE.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie><Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8 }} /></PieChart>
                    </ResponsiveContainer>
                    {PIE.map(d => (
                        <div key={d.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <div style={{ width: 7, height: 7, borderRadius: 2, background: d.color }} />
                                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{d.name}</span>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{d.value}%</span>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div className="card">
                    <div className="card-title">Risk Distribution</div>
                    <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={RISK_DIST} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="range" tick={{ fill: "#475569", fontSize: 9 }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fill: "#475569", fontSize: 9 }} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                            <Bar dataKey="count" name="Transactions" radius={[3, 3, 0, 0]}>
                                {RISK_DIST.map((d, i) => <Cell key={i} fill={i < 2 ? "#10b981" : i < 4 ? "#f59e0b" : "#ef4444"} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                        <div className="card-title" style={{ margin: 0 }}>🔔 Live Alerts</div>
                        <button className="btn btn-ghost btn-sm" onClick={() => onNav("alerts")}>View all <ChevronRight size={12} /></button>
                    </div>
                    {MOCK_ALERTS.map(a => (
                        <div key={a.id} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: SEV_DOT[a.sev], flexShrink: 0, marginTop: 4, boxShadow: a.sev === "critical" ? `0 0 6px ${SEV_DOT[a.sev]}` : undefined }} className={a.sev === "critical" ? "pulse" : ""} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 12 }}>{a.title}</div>
                                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.desc}</div>
                            </div>
                            <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{a.time} ago</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Live txn feed */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 700 }}>Live Transaction Feed</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="status-dot" style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }} suppressHydrationWarning>Updated {ts ? ts.toLocaleTimeString() : "--:--:--"}</span>
                        <button className="btn btn-ghost btn-sm" onClick={() => onNav("transactions")}>All txns <ChevronRight size={12} /></button>
                    </div>
                </div>
                <div className="table-wrap">
                    <table className="data-table">
                        <thead><tr><th>TXN ID</th><th>User</th><th>Amount</th><th>Merchant</th><th>Risk</th><th>Decision</th><th>Latency</th><th>Time</th></tr></thead>
                        <tbody>
                            {txns.slice(0, 10).map(t => {
                                const decMap: Record<string, string> = { approved: "badge-approved", approved_monitored: "badge-monitored", stepup_auth: "badge-stepup", flagged: "badge-flagged", hard_blocked: "badge-blocked" };
                                const decLabel: Record<string, string> = { approved: "✓ Approved", approved_monitored: "✓ Mon.", stepup_auth: "⚡ Step-Up", flagged: "⚠ Flagged", hard_blocked: "✕ Blocked" };
                                return (
                                    <tr key={t.id}>
                                        <td><span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--accent-light)" }}>{t.id}</span></td>
                                        <td><span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)" }}>{t.user_id}</span></td>
                                        <td><strong>${t.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></td>
                                        <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{t.merchant}</td>
                                        <td>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <div className="risk-bar-track"><div className="risk-bar-fill" style={{ width: `${t.risk * 100}%`, background: t.risk < .3 ? "#10b981" : t.risk < .6 ? "#f59e0b" : "#ef4444" }} /></div>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: t.risk < .3 ? "#10b981" : t.risk < .6 ? "#f59e0b" : "#ef4444" }}>{(t.risk * 100).toFixed(0)}%</span>
                                            </div>
                                        </td>
                                        <td><span className={`badge ${decMap[t.decision] ?? "badge-approved"}`}>{decLabel[t.decision] ?? t.decision}</span></td>
                                        <td><span style={{ fontSize: 11, color: t.latency_ms > 150 ? "#f59e0b" : "#475569" }}>{t.latency_ms}ms</span></td>
                                        <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{new Date(t.created_at).toLocaleTimeString()}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
