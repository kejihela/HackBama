import type { CycleLeg } from "@/lib/matching";
import { avatarColor, initials } from "@/lib/format";

/** Draws the loop as a ring: each member is a node, each arrow is an item changing hands. */
export function LoopDiagram({ legs, meId }: { legs: CycleLeg[]; meId: number }) {
  const size = 260;
  const c = size / 2;
  const r = 88;
  const n = legs.length;
  const pts = legs.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  });
  const nodeR = 24;
  const arc = (i: number) => {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    // Curve outward a little so 2-way swaps don't overlap.
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = mx - c;
    const dy = my - c;
    const len = Math.hypot(dx, dy) || 1;
    const bend = n === 2 ? 46 : 22;
    const cx = mx + (dx / len) * bend + (n === 2 ? (i === 0 ? 1 : -1) * bend : 0);
    const cy = my + (dy / len) * bend;
    // Trim the ends so arrows stop at the node edge.
    const trim = (p: { x: number; y: number }, toward: { x: number; y: number }) => {
      const vx = toward.x - p.x;
      const vy = toward.y - p.y;
      const l = Math.hypot(vx, vy) || 1;
      return { x: p.x + (vx / l) * (nodeR + 4), y: p.y + (vy / l) * (nodeR + 4) };
    };
    const s = trim(a, { x: cx, y: cy });
    const e = trim(b, { x: cx, y: cy });
    return `M${s.x.toFixed(1)},${s.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${e.x.toFixed(1)},${e.y.toFixed(1)}`;
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="loop-svg" role="img" aria-label={`${n}-way trade loop`}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--ok)" />
        </marker>
      </defs>
      <circle className="ring" cx={c} cy={c} r={r} />
      {legs.map((l, i) => (
        <path key={i} className="arc" d={arc(i)} markerEnd="url(#arrow)" />
      ))}
      {legs.map((l, i) => (
        <g key={l.giver_id}>
          <circle
            cx={pts[i].x}
            cy={pts[i].y}
            r={nodeR}
            fill={avatarColor(l.giver_id)}
            stroke={l.giver_id === meId ? "var(--ink)" : "var(--surface)"}
            strokeWidth={l.giver_id === meId ? 3 : 2}
          />
          <text x={pts[i].x} y={pts[i].y + 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff">
            {initials(l.giver_name)}
          </text>
          <text x={pts[i].x} y={pts[i].y + nodeR + 15} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink-2)">
            {l.giver_id === meId ? "You" : l.giver_name.split(" ")[0]} · {l.giver_tenant_name}
          </text>
        </g>
      ))}
      <text x={c} y={c - 2} textAnchor="middle" fontSize="26" fontWeight="900" fill="var(--ink)" style={{ fontFamily: "var(--font-display)" }}>
        {n}-way
      </text>
      <text x={c} y={c + 16} textAnchor="middle" fontSize="10" fill="var(--ink-3)" letterSpacing="1.5">
        $0 CHANGES HANDS
      </text>
    </svg>
  );
}
