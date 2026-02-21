"use client";
import { useState } from "react";
import { Shield, Cpu, Bell, Database, Save, RotateCcw } from "lucide-react";

interface Threshold { label: string; key: string; value: number; min: number; max: number; step: number; desc: string; unit: string; }

const DEFAULTS: Record<string, number> = {
    approve: 0.30,
    stepup: 0.50,
    flag: 0.65,
    block: 0.80,
    vel_1h: 20,
    vel_24h: 80,
    amt_1h: 5000,
    geo_delta: 800,
    retrain_days: 7,
    shap_features: 10,
};

const SECTIONS: { title: string; icon: React.ReactNode; fields: Threshold[] }[] = [
    {
        title: "Risk Score Thresholds", icon: <Shield size={15} />,
        fields: [
            { label: "Approve Ceiling", key: "approve", value: 0.30, min: 0.05, max: 0.50, step: 0.01, desc: "Scores below this are auto-approved", unit: "" },
            { label: "Step-Up Auth", key: "stepup", value: 0.50, min: 0.30, max: 0.70, step: 0.01, desc: "Trigger 2FA challenge above this score", unit: "" },
            { label: "Flag for Review", key: "flag", value: 0.65, min: 0.50, max: 0.85, step: 0.01, desc: "Route to analyst queue above this score", unit: "" },
            { label: "Hard Block", key: "block", value: 0.80, min: 0.65, max: 0.99, step: 0.01, desc: "Immediate block above this score", unit: "" },
        ],
    },
    {
        title: "Velocity Limits", icon: <Cpu size={15} />,
        fields: [
            { label: "Max Txns / 1h", key: "vel_1h", value: 20, min: 5, max: 100, step: 1, desc: "Velocity spike threshold per user per hour", unit: " txns" },
            { label: "Max Txns / 24h", key: "vel_24h", value: 80, min: 20, max: 500, step: 5, desc: "Daily volume cap per user", unit: " txns" },
            { label: "Max Amount / 1h", key: "amt_1h", value: 5000, min: 500, max: 50000, step: 500, desc: "Maximum cumulative spend per hour", unit: " USD" },
            { label: "Geo Delta Limit", key: "geo_delta", value: 800, min: 100, max: 5000, step: 50, desc: "Max km/h travel speed before impossible travel flag", unit: " km/h" },
        ],
    },
    {
        title: "ML Pipeline", icon: <Database size={15} />,
        fields: [
            { label: "Retrain Interval", key: "retrain_days", value: 7, min: 1, max: 30, step: 1, desc: "Days between model retraining runs", unit: " days" },
            { label: "SHAP Features", key: "shap_features", value: 10, min: 5, max: 25, step: 1, desc: "Top SHAP features shown in explanations", unit: " features" },
        ],
    },
];

function ScoreGauge({ value }: { value: number }) {
    const color = value < 0.35 ? "#10b981" : value < 0.6 ? "#f59e0b" : "#ef4444";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${value * 100}%`, background: color, borderRadius: 3, transition: "width 0.2s" }} />
            </div>
            <span style={{ minWidth: 42, fontSize: 12, fontWeight: 700, color }}>{(value * 100).toFixed(0)}%</span>
        </div>
    );
}

export default function SettingsView() {
    const [values, setValues] = useState<Record<string, number>>({ ...DEFAULTS });
    const [saved, setSaved] = useState(false);

    const set = (key: string, val: number) => { setValues(v => ({ ...v, [key]: val })); setSaved(false); };
    const reset = () => { setValues({ ...DEFAULTS }); setSaved(false); };
    const save = () => { setSaved(true); setTimeout(() => setSaved(false), 3000); };

    return (
        <div className="content">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                {SECTIONS.map(sec => (
                    <div key={sec.title} className="card" style={{ gridColumn: sec.title === "ML Pipeline" ? "span 2" : "span 1" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                            <div style={{ padding: 6, background: "rgba(99,102,241,0.1)", borderRadius: "var(--r-sm)", color: "var(--accent-light)" }}>{sec.icon}</div>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>{sec.title}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                            {sec.fields.map(f => (
                                <div key={f.key}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                        <label className="label" style={{ margin: 0 }}>{f.label}</label>
                                        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-light)" }}>
                                            {f.unit.startsWith(" USD") ? `$${values[f.key].toLocaleString()}` : `${values[f.key]}${f.unit}`}
                                        </span>
                                    </div>
                                    {f.key.startsWith("approve") || f.key === "stepup" || f.key === "flag" || f.key === "block"
                                        ? <ScoreGauge value={values[f.key]} />
                                        : null}
                                    <input
                                        type="range" className="slider"
                                        min={f.min} max={f.max} step={f.step} value={values[f.key]}
                                        onChange={e => set(f.key, parseFloat(e.target.value))}
                                        style={{ marginTop: 6 }}
                                    />
                                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{f.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Decision flow preview */}
            <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, marginBottom: 14 }}>Decision Flow Preview</div>
                <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
                    {[
                        { label: "APPROVE", range: `0 – ${(values.approve * 100).toFixed(0)}%`, color: "#10b981", bg: "rgba(16,185,129,0.1)" },
                        { label: "MONITOR", range: `${(values.approve * 100).toFixed(0)} – ${(values.stepup * 100).toFixed(0)}%`, color: "#6366f1", bg: "rgba(99,102,241,0.1)" },
                        { label: "STEP-UP", range: `${(values.stepup * 100).toFixed(0)} – ${(values.flag * 100).toFixed(0)}%`, color: "#06b6d4", bg: "rgba(6,182,212,0.1)" },
                        { label: "FLAG", range: `${(values.flag * 100).toFixed(0)} – ${(values.block * 100).toFixed(0)}%`, color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
                        { label: "BLOCK", range: `${(values.block * 100).toFixed(0)} – 100%`, color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
                    ].map((d, i) => (
                        <div key={d.label} style={{ flex: 1, padding: "12px 10px", background: d.bg, borderRight: i < 4 ? "1px solid rgba(255,255,255,0.06)" : "none", minWidth: 80, textAlign: "center" }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: d.color, letterSpacing: "0.06em" }}>{d.label}</div>
                            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{d.range}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" onClick={reset}><RotateCcw size={13} /> Reset Defaults</button>
                <button className="btn btn-primary" onClick={save}>
                    {saved ? <><span>✓</span> Saved!</> : <><Save size={13} /> Save Configuration</>}
                </button>
            </div>
        </div>
    );
}
