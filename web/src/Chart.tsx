import { useRef, useState } from "react";
import type { Result } from "../../sim/duel-sim.ts";
import { compact } from "./fmt";

export type Metric = "score" | "inflow" | "supply";
export const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: "score", label: "Score", unit: "NEAR-hours" },
  { key: "inflow", label: "Net inflow", unit: "NEAR since round start" },
  { key: "supply", label: "Supply", unit: "tokens" },
];

const W = 720;
const H = 300;
const M = { top: 16, right: 64, bottom: 30, left: 48 };

const signed = (v: number) => (v < 0 ? "-" : "") + compact(Math.abs(v));

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

/** Two series, one axis. Side A and side B keep their colors everywhere in the app. */
export default function Chart({ result, metric }: { result: Result; metric: Metric }) {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const pts = result.points;
  const hours = pts[pts.length - 1].t;
  const unit = METRICS.find((m) => m.key === metric)!.unit;
  const vals = pts.flatMap((p) => [p[metric][0], p[metric][1]]);
  const max = niceMax(Math.max(...vals));
  const min = Math.min(...vals) < 0 ? -niceMax(-Math.min(...vals)) : 0;
  const x = (t: number) => M.left + (t / hours) * (W - M.left - M.right);
  const y = (v: number) => H - M.bottom - ((v - min) / (max - min)) * (H - M.top - M.bottom);
  const path = (i: 0 | 1) => pts.map((p, k) => `${k ? "L" : "M"}${x(p.t).toFixed(1)},${y(p[metric][i]).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  // Keep the two end labels from sitting on top of each other.
  let ya = y(last[metric][0]);
  let yb = y(last[metric][1]);
  if (Math.abs(ya - yb) < 14) {
    const mid = (ya + yb) / 2;
    const up = ya <= yb;
    ya = mid + (up ? -7 : 7);
    yb = mid + (up ? 7 : -7);
  }
  const h = hover === null ? null : pts[hover];

  const move = (e: React.PointerEvent) => {
    const box = svg.current!.getBoundingClientRect();
    const t = (((e.clientX - box.left) / box.width) * W - M.left) / (W - M.left - M.right);
    setHover(Math.round(Math.min(1, Math.max(0, t)) * (pts.length - 1)));
  };

  return (
    <figure className="chart">
      <div className="legend">
        <span>
          <i className="a" /> Side A
        </span>
        <span>
          <i className="b" /> Side B
        </span>
        <span className="unit">{unit}</span>
      </div>
      <div className="plot">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} onPointerMove={move} onPointerLeave={() => setHover(null)} role="img" aria-label={`${unit} over the duel for both sides. See the table below for the outcome.`}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const v = min + (max - min) * f;
            return (
              <g key={f}>
                <line className="grid" x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} />
                <text className="tick" x={M.left - 8} y={y(v) + 4} textAnchor="end">
                  {signed(v)}
                </text>
              </g>
            );
          })}
          {min < 0 && <line className="zero" x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} />}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * hours * 10) / 10).map((t) => (
            <text key={t} className="tick" x={x(t)} y={H - 8} textAnchor="middle">
              {t}h
            </text>
          ))}
          <path className="line a" d={path(0)} />
          <path className="line b" d={path(1)} />
          <text className="endlabel" x={W - M.right + 8} y={ya + 4}>
            A
          </text>
          <text className="endlabel" x={W - M.right + 8} y={yb + 4}>
            B
          </text>
          <circle className="end a" cx={x(last.t)} cy={y(last[metric][0])} r="4" />
          <circle className="end b" cx={x(last.t)} cy={y(last[metric][1])} r="4" />
          {h && (
            <g>
              <line className="cross" x1={x(h.t)} x2={x(h.t)} y1={M.top} y2={H - M.bottom} />
              <circle className="end a" cx={x(h.t)} cy={y(h[metric][0])} r="4" />
              <circle className="end b" cx={x(h.t)} cy={y(h[metric][1])} r="4" />
            </g>
          )}
        </svg>
        {h && (
          <div className="tip" style={{ left: `${(x(h.t) / W) * 100}%` }} data-flip={x(h.t) > W * 0.6}>
            <strong>Hour {h.t.toFixed(1)}</strong>
            <span>
              <i className="a" /> A <b>{signed(h[metric][0])}</b>
            </span>
            <span>
              <i className="b" /> B <b>{signed(h[metric][1])}</b>
            </span>
          </div>
        )}
      </div>
    </figure>
  );
}
