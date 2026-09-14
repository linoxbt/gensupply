"use client";

import { useMemo, useRef, useState } from "react";
import { celsius, clock } from "@/lib/format";
import type { Batch, Breach, Reading } from "@/lib/types";

/**
 * Cargo temperature over time. One series, so no legend - the card title
 * names it. The threshold is an annotated reference line, the verified breach
 * a 10% wash, and any batch that failed the local root check is hatched at 45°
 * and labelled, so failure never reads from colour alone. A crosshair snaps to
 * the nearest reading; the readings table below carries every value without hover.
 */
const W = 760;
const H = 260;
const PAD = { l: 44, r: 16, t: 16, b: 28 };

const TOKENS = {
  line: "#5cc8e4",
  hot: "#ff6a55",
  grid: "#1b3a4a",
  text: "#7a98a6",
  ink: "#e6f2f6",
  surface: "#08161f",
};

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = Math.max(1, max - min);
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v));
  return out;
}

export function TelemetryChart({
  readings,
  thresholdX10,
  breach,
  mismatched = [],
}: {
  readings: Reading[];
  thresholdX10: number;
  breach?: Breach;
  mismatched?: Batch[];
}) {
  const sorted = useMemo(() => [...readings].sort((a, b) => a.t - b.t), [readings]);
  const [hover, setHover] = useState<number>();
  const svgRef = useRef<SVGSVGElement>(null);

  const t0 = sorted[0].t;
  const t1 = Math.max(sorted.at(-1)!.t, t0 + 60);
  const temps = sorted.map((r) => r.c);
  const lo = Math.min(...temps, thresholdX10) - 10;
  const hi = Math.max(...temps, thresholdX10) + 10;
  const yTicks = niceTicks(lo, hi);
  const yMin = Math.min(lo, yTicks[0]);
  const yMax = Math.max(hi, yTicks.at(-1)!);

  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (c: number) => PAD.t + (1 - (c - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const path = sorted.map((r, i) => `${i ? "L" : "M"}${x(r.t).toFixed(1)} ${y(r.c).toFixed(1)}`).join(" ");
  const xTicks = niceTicks(0, (t1 - t0) / 60, 5).map((m) => t0 + m * 60).filter((t) => t <= t1);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = t0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < sorted.length; i++) if (Math.abs(sorted[i].t - t) < Math.abs(sorted[best].t - t)) best = i;
    setHover(best);
  }

  const h = hover !== undefined ? sorted[hover] : undefined;
  const hasBreach = breach && breach.seconds > 0;

  return (
    <div>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none select-none"
          role="img"
          aria-label={`Cargo temperature, ${sorted.length} readings, threshold ${celsius(thresholdX10)}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(undefined)}
        >
          <defs>
            <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke={TOKENS.hot} strokeOpacity="0.45" strokeWidth="1.5" />
            </pattern>
          </defs>

          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={TOKENS.grid} strokeWidth="1" />
              <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill={TOKENS.text} fontFamily="var(--font-mono)">
                {(v / 10).toFixed(0)}°
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize="11" fill={TOKENS.text} fontFamily="var(--font-mono)">
              {clock(t)}
            </text>
          ))}

          {mismatched.map((b) => (
            <g key={b.seq}>
              <rect x={x(Math.max(b.tFrom, t0))} y={PAD.t} width={Math.max(3, x(Math.min(b.tTo, t1)) - x(Math.max(b.tFrom, t0)))} height={H - PAD.t - PAD.b} fill="url(#hatch)" />
              <text x={x(Math.max(b.tFrom, t0)) + 4} y={PAD.t + 12} fontSize="11" fill={TOKENS.ink} fontFamily="var(--font-mono)">
                batch {b.seq} unverified
              </text>
            </g>
          ))}

          {hasBreach ? (
            <g>
              <rect x={x(breach.start_t)} y={PAD.t} width={Math.max(2, x(breach.end_t) - x(breach.start_t))} height={H - PAD.t - PAD.b} fill={TOKENS.hot} fillOpacity="0.1" />
              <text x={x(breach.start_t) + 6} y={H - PAD.b - 8} fontSize="11" fill={TOKENS.ink} fontFamily="var(--font-mono)">
                verified breach · {Math.floor(breach.seconds / 60)} min
              </text>
            </g>
          ) : null}

          <line x1={PAD.l} x2={W - PAD.r} y1={y(thresholdX10)} y2={y(thresholdX10)} stroke={TOKENS.hot} strokeWidth="1.5" />
          <text x={W - PAD.r} y={y(thresholdX10) - 6} textAnchor="end" fontSize="11" fill={TOKENS.ink} fontFamily="var(--font-mono)">
            threshold {celsius(thresholdX10)}
          </text>

          <path d={path} fill="none" stroke={TOKENS.line} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(sorted.at(-1)!.t)} cy={y(sorted.at(-1)!.c)} r="4" fill={TOKENS.line} stroke={TOKENS.surface} strokeWidth="2" />

          {h ? (
            <g pointerEvents="none">
              <line x1={x(h.t)} x2={x(h.t)} y1={PAD.t} y2={H - PAD.b} stroke={TOKENS.text} strokeWidth="1" />
              <circle cx={x(h.t)} cy={y(h.c)} r="5" fill={h.c > thresholdX10 ? TOKENS.hot : TOKENS.line} stroke={TOKENS.surface} strokeWidth="2" />
            </g>
          ) : null}
        </svg>

        {h ? (
          <div
            className="pointer-events-none absolute top-2 rounded-lg border border-frost-line bg-frost-950/95 px-3 py-2 text-xs shadow-lg"
            style={{ left: `${(x(h.t) / W) * 100}%`, transform: x(h.t) > W * 0.65 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
          >
            <p className="font-mono text-base font-semibold text-ice">{celsius(h.c)}</p>
            <p className="text-frost-mute">{new Date(h.t * 1000).toLocaleTimeString()}</p>
            <p className="font-mono text-frost-mute">
              {(h.lat / 1e5).toFixed(4)}, {(h.lon / 1e5).toFixed(4)}
            </p>
          </div>
        ) : null}
      </div>

      <details className="mt-3 text-xs text-frost-mute">
        <summary className="cursor-pointer hover:text-ice">Readings table ({sorted.length})</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-frost-line">
          <table className="w-full text-left font-mono tabular-nums">
            <thead className="sticky top-0 bg-frost-900">
              <tr>{["Time", "Temp", "Lat", "Lon"].map((c) => <th key={c} className="px-3 py-1.5 font-medium">{c}</th>)}</tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.t} className="border-t border-frost-line/50">
                  <td className="px-3 py-1">{new Date(r.t * 1000).toLocaleTimeString()}</td>
                  <td className={`px-3 py-1 ${r.c > thresholdX10 ? "text-ice" : ""}`}>
                    {celsius(r.c)}
                    {r.c > thresholdX10 ? " ▲" : ""}
                  </td>
                  <td className="px-3 py-1">{(r.lat / 1e5).toFixed(5)}</td>
                  <td className="px-3 py-1">{(r.lon / 1e5).toFixed(5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
