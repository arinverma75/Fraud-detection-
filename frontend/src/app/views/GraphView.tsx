"use client";
import { useEffect, useRef, useState } from "react";
import { GraphNode, GraphEdge } from "../types";
import { Search } from "lucide-react";

// ── Mock fraud graph generator ────────────────────────────────────────────────
function buildGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const W = 700, H = 440;

    // 3 fraud clusters + some isolated nodes
    const clusters = [
        { cx: 180, cy: 160, color: 0.85, count: 5 },
        { cx: 500, cy: 280, color: 0.72, count: 4 },
        { cx: 340, cy: 380, color: 0.2, count: 3 },
    ];

    let nid = 0;
    clusters.forEach((cl, ci) => {
        const hub: GraphNode = {
            id: `D${nid}`, type: "device", risk: cl.color,
            label: `fp_${Math.random().toString(36).substr(2, 6)}`,
            x: cl.cx, y: cl.cy,
        };
        nodes.push(hub); nid++;

        for (let i = 0; i < cl.count; i++) {
            const angle = (2 * Math.PI * i) / cl.count;
            const r = 80 + Math.random() * 30;
            const acc: GraphNode = {
                id: `A${nid}`, type: "account", risk: cl.color * (0.7 + Math.random() * 0.3),
                label: `USR-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
                x: cl.cx + Math.cos(angle) * r, y: cl.cy + Math.sin(angle) * r,
            };
            nodes.push(acc); nid++;
            edges.push({ source: hub.id, target: acc.id, weight: 2, type: "shared_device" });

            // merchant node
            if (i === 0) {
                const merch: GraphNode = {
                    id: `M${nid}`, type: "merchant", risk: 0.1 + Math.random() * 0.2,
                    label: `MCH-${Math.floor(Math.random() * 9000 + 1000)}`,
                    x: cl.cx + Math.cos(angle + 0.6) * (r + 60),
                    y: cl.cy + Math.sin(angle + 0.6) * (r + 60),
                };
                nodes.push(merch); nid++;
                edges.push({ source: acc.id, target: merch.id, weight: 1, type: "transaction" });
            }
        }
        // cross-cluster IP link
        if (ci < clusters.length - 1) {
            const ip: GraphNode = {
                id: `IP${nid}`, type: "ip", risk: 0.6 + Math.random() * 0.3,
                label: `104.${Math.floor(Math.random() * 254)}.${Math.floor(Math.random() * 254)}.${Math.floor(Math.random() * 254)}`,
                x: (cl.cx + clusters[ci + 1].cx) / 2 + (Math.random() - 0.5) * 40,
                y: (cl.cy + clusters[ci + 1].cy) / 2 + (Math.random() - 0.5) * 40,
            };
            nodes.push(ip); nid++;
            edges.push({ source: hub.id, target: ip.id, weight: 1.5, type: "shared_ip" });
            edges.push({ source: `D${nid - 1 - cl.count * 2}`, target: ip.id, weight: 1.5, type: "shared_ip" });
        }
    });

    return { nodes, edges };
}

const NODE_COLOR: Record<string, string> = {
    account: "#6366f1",
    device: "#ef4444",
    ip: "#f59e0b",
    merchant: "#10b981",
};
const EDGE_COLOR: Record<string, string> = {
    shared_device: "rgba(239,68,68,0.5)",
    shared_ip: "rgba(245,158,11,0.4)",
    transaction: "rgba(99,102,241,0.3)",
    shared_merchant: "rgba(16,185,129,0.3)",
};

export default function GraphView() {
    const { nodes: initNodes, edges } = buildGraph();
    const [nodes, setNodes] = useState<GraphNode[]>(initNodes);
    const [hovered, setHovered] = useState<GraphNode | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [selected, setSelected] = useState<GraphNode | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const dragRef = useRef<{ id: string | null }>({ id: null });
    const animRef = useRef<number>(0);

    // Simple force simulation
    useEffect(() => {
        let localNodes = initNodes.map(n => ({ ...n, vx: 0, vy: 0 }));
        const edgeMap = edges;
        const W = 700, H = 440;

        const tick = () => {
            // Repulsion
            for (let i = 0; i < localNodes.length; i++) {
                for (let j = i + 1; j < localNodes.length; j++) {
                    const dx = localNodes[i].x - localNodes[j].x;
                    const dy = localNodes[i].y - localNodes[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const force = 1200 / (dist * dist);
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    localNodes[i].vx! += fx; localNodes[i].vy! += fy;
                    localNodes[j].vx! -= fx; localNodes[j].vy! -= fy;
                }
            }
            // Attraction along edges
            for (const e of edgeMap) {
                const s = localNodes.find(n => n.id === e.source);
                const t = localNodes.find(n => n.id === e.target);
                if (!s || !t) continue;
                const dx = t.x - s.x, dy = t.y - s.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const ideal = 120;
                const force = (dist - ideal) * 0.04;
                const fx = (dx / dist) * force, fy = (dy / dist) * force;
                s.vx! += fx; s.vy! += fy;
                t.vx! -= fx; t.vy! -= fy;
            }
            // Center gravity
            for (const n of localNodes) {
                n.vx! += (W / 2 - n.x) * 0.005;
                n.vy! += (H / 2 - n.y) * 0.005;
            }
            // Dampen + clamp
            for (const n of localNodes) {
                n.vx! *= 0.85; n.vy! *= 0.85;
                n.x = Math.max(20, Math.min(W - 20, n.x + (n.vx ?? 0)));
                n.y = Math.max(20, Math.min(H - 20, n.y + (n.vy ?? 0)));
            }
            setNodes([...localNodes]);
            animRef.current = requestAnimationFrame(tick);
        };
        animRef.current = requestAnimationFrame(tick);
        // Stop simulation after 3s
        const stop = setTimeout(() => cancelAnimationFrame(animRef.current), 3000);
        return () => { cancelAnimationFrame(animRef.current); clearTimeout(stop); };
    }, []);

    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
    const selNeighbors = selected ? new Set(edges.filter(e => e.source === selected.id || e.target === selected.id).flatMap(e => [e.source, e.target])) : new Set<string>();

    return (
        <div className="content">
            {/* Legend */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                {Object.entries(NODE_COLOR).map(([type, color]) => (
                    <div key={type} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                    </div>
                ))}
                <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
                    {Object.entries(EDGE_COLOR).map(([type, color]) => (
                        <div key={type} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-muted)" }}>
                            <div style={{ width: 16, height: 2, background: color.replace("0.", "1."), borderRadius: 1 }} />
                            {type.replace(/_/g, " ")}
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ display: "flex", gap: 16 }}>
                {/* SVG Canvas */}
                <div className="card" style={{ flex: 1, padding: 0, overflow: "hidden" }}>
                    <svg
                        ref={svgRef} width="100%" viewBox="0 0 700 440" style={{ display: "block", cursor: "grab" }}
                        onMouseMove={e => {
                            const rect = svgRef.current!.getBoundingClientRect();
                            setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                        }}
                    >
                        <defs>
                            <radialGradient id="node-glow">
                                <stop offset="0%" stopColor="white" stopOpacity="0.15" />
                                <stop offset="100%" stopColor="white" stopOpacity="0" />
                            </radialGradient>
                        </defs>
                        {/* Edges */}
                        {edges.map((e, i) => {
                            const s = nodeMap[e.source], t = nodeMap[e.target];
                            if (!s || !t) return null;
                            const dim = selected && !selNeighbors.has(e.source) && !selNeighbors.has(e.target);
                            return (
                                <line key={i}
                                    x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                                    stroke={EDGE_COLOR[e.type]}
                                    strokeWidth={e.weight} strokeDasharray={e.type === "transaction" ? "4 3" : undefined}
                                    opacity={dim ? 0.1 : 0.9}
                                />
                            );
                        })}
                        {/* Nodes */}
                        {nodes.map(n => {
                            const isSelected = selected?.id === n.id;
                            const dimmed = selected && !selNeighbors.has(n.id) && selected.id !== n.id;
                            const r = n.type === "device" ? 12 : n.type === "merchant" ? 9 : 10;
                            const color = NODE_COLOR[n.type];
                            return (
                                <g key={n.id} style={{ cursor: "pointer" }} opacity={dimmed ? 0.15 : 1}
                                    onClick={() => setSelected(isSelected ? null : n)}
                                    onMouseEnter={() => setHovered(n)}
                                    onMouseLeave={() => setHovered(null)}>
                                    {isSelected && <circle cx={n.x} cy={n.y} r={r + 8} fill={color} opacity={0.15} />}
                                    <circle cx={n.x} cy={n.y} r={r} fill={color} stroke={isSelected ? "white" : "rgba(255,255,255,0.15)"} strokeWidth={isSelected ? 2 : 1} />
                                    {n.risk > 0.6 && <circle cx={n.x} cy={n.y} r={r + 3} fill="none" stroke={color} strokeWidth={1} opacity={0.4} className="pulse" />}
                                    <text x={n.x} y={n.y + r + 12} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={8} fontFamily="monospace">{n.label}</text>
                                </g>
                            );
                        })}
                    </svg>
                    {/* Tooltip */}
                    {hovered && (
                        <div className="graph-tooltip" style={{ top: mousePos.y + 12, left: mousePos.x + 12 }}>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>{hovered.label}</div>
                            <div style={{ color: "var(--text-muted)", fontSize: 11 }}>Type: <span style={{ color: "var(--text-primary)", textTransform: "capitalize" }}>{hovered.type}</span></div>
                            <div style={{ color: "var(--text-muted)", fontSize: 11 }}>Risk: <span style={{ color: hovered.risk > 0.6 ? "#ef4444" : hovered.risk > 0.3 ? "#f59e0b" : "#10b981", fontWeight: 700 }}>{(hovered.risk * 100).toFixed(0)}%</span></div>
                        </div>
                    )}
                </div>

                {/* Side panel */}
                <div style={{ width: 220, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div className="card">
                        <div className="card-title">Graph Stats</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                            {[["Nodes", nodes.length], ["Edges", edges.length], ["High-Risk", nodes.filter(n => n.risk > 0.6).length], ["Clusters", 3]].map(([k, v]) => (
                                <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                                    <span style={{ color: "var(--text-secondary)" }}>{k}</span>
                                    <span style={{ fontWeight: 700 }}>{v}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    {selected && (
                        <div className="card" style={{ borderColor: "var(--border-glow)" }}>
                            <div className="card-title">Selected Node</div>
                            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                                <div style={{ fontFamily: "monospace", color: "var(--accent-light)", fontWeight: 700 }}>{selected.label}</div>
                                <div style={{ color: "var(--text-muted)" }}>Type: <span style={{ color: "var(--text-primary)", textTransform: "capitalize" }}>{selected.type}</span></div>
                                <div style={{ color: "var(--text-muted)" }}>Risk:</div>
                                <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 6, height: 6, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${selected.risk * 100}%`, background: selected.risk > 0.6 ? "#ef4444" : selected.risk > 0.3 ? "#f59e0b" : "#10b981" }} />
                                </div>
                                <div style={{ fontWeight: 700, color: selected.risk > 0.6 ? "#ef4444" : selected.risk > 0.3 ? "#f59e0b" : "#10b981" }}>{(selected.risk * 100).toFixed(1)}%</div>
                                <hr className="divider" />
                                <div style={{ color: "var(--text-muted)" }}>Connections: <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{edges.filter(e => e.source === selected.id || e.target === selected.id).length}</span></div>
                            </div>
                            <button className="btn btn-danger btn-sm" style={{ marginTop: 12, width: "100%" }}>🚫 Flag Account</button>
                        </div>
                    )}
                    <div className="card">
                        <div className="card-title">Edge Types</div>
                        {Object.entries(EDGE_COLOR).map(([type, color]) => (
                            <div key={type} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 7, fontSize: 12 }}>
                                <div style={{ width: 18, height: 2, background: color.replace(/[\d.]+\)$/, "1)"), borderRadius: 1 }} />
                                <span style={{ color: "var(--text-secondary)", textTransform: "capitalize" }}>{type.replace(/_/g, " ")}</span>
                                <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: 11 }}>{edges.filter(e => e.type === type).length}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
