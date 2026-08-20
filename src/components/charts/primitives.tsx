"use client";

import { useState, type ReactNode } from "react";

/**
 * Shared chart furniture.
 *
 * Every chart on the progress page is inline SVG on a linear scale — no chart
 * library. The four charts of FR-8 are fixed and few, and a dependency would
 * cost more in bundle and version churn than it saves in code.
 */

export const PLOT = {
  width: 720,
  height: 240,
  left: 46,
  right: 18,
  top: 14,
  bottom: 28,
};

export const innerWidth = PLOT.width - PLOT.left - PLOT.right;
export const innerHeight = PLOT.height - PLOT.top - PLOT.bottom;

/**
 * Rounds an axis maximum up to a clean number so ticks read 0 / 15 / 30 / 45.
 *
 * The step list is deliberately fine-grained. A coarse one (1, 2, 5, 10) sends
 * a 52-second maximum to a 100-second axis and squashes the data into the
 * bottom half of the plot, which is exactly how a real improvement gets made to
 * look like no improvement.
 */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

/**
 * A bar with its data end rounded and its baseline end square, per the mark
 * spec. Rounding both ends detaches the bar from its baseline and makes short
 * bars read as pills rather than as small values.
 */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 4,
): string {
  const r = Math.max(0, Math.min(radius, width, height / 2));
  if (r === 0) return `M${x} ${y} H${x + width} V${y + height} H${x} Z`;
  return [
    `M${x} ${y}`,
    `H${x + width - r}`,
    `A${r} ${r} 0 0 1 ${x + width} ${y + r}`,
    `V${y + height - r}`,
    `A${r} ${r} 0 0 1 ${x + width - r} ${y + height}`,
    `H${x}`,
    "Z",
  ].join(" ");
}

export function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max / count) * i);
}

export const linePath = (points: { x: number; y: number }[]): string =>
  points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

export const formatDay = (iso: string): string =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

export const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

// ---------------------------------------------------------------------------

export interface Series {
  key: string;
  label: string;
  color: string;
}

export function Legend({ series }: { series: Series[] }) {
  // A legend is the dependable identity channel; a single-series chart gets
  // none, because its title already names what is plotted.
  if (series.length < 2) return null;
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.key}>
          <span className="legend__swatch" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Crosshair tooltip. Positioned as a percentage of the frame because the SVG
 * scales to its container, and clamped so it never hangs off either edge on a
 * phone.
 */
export function Tooltip({
  leftPercent,
  topPercent,
  children,
}: {
  leftPercent: number;
  /** Omit to pin the tooltip to the top of the frame (crosshair charts). */
  topPercent?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="viz-tooltip"
      style={{
        left: `clamp(70px, ${leftPercent.toFixed(2)}%, calc(100% - 70px))`,
        top: topPercent === undefined ? 4 : `${topPercent.toFixed(2)}%`,
        transform:
          topPercent === undefined ? "translateX(-50%)" : "translate(-50%, -110%)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Chart shell: title, the plot, a legend, and a table view.
 *
 * The table is not a nicety — it is how the numbers stay reachable when colour
 * fails (print, forced colours, full-severity CVD) and how a value that could
 * not be direct-labelled stays available.
 */
export function ChartCard({
  title,
  note,
  series,
  table,
  children,
  empty,
}: {
  title: string;
  note?: string;
  series?: Series[];
  table: ReactNode;
  children: ReactNode;
  empty?: boolean;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className="card viz-root">
      <div className="row" style={{ alignItems: "baseline", marginBottom: 2 }}>
        <h2 style={{ fontSize: 15 }}>{title}</h2>
        <span className="topbar__spacer" />
        {!empty && (
          <button
            type="button"
            className="btn btn--ghost btn--sm no-print"
            onClick={() => setShowTable((v) => !v)}
            aria-expanded={showTable}
          >
            {showTable ? "Chart" : "Table"}
          </button>
        )}
      </div>
      {note && (
        <p className="tiny muted" style={{ margin: "0 0 12px" }}>
          {note}
        </p>
      )}

      {empty ? (
        <p className="empty">Not enough data yet.</p>
      ) : showTable ? (
        table
      ) : (
        <>
          <div className="chart__frame" style={{ position: "relative" }}>
            {children}
          </div>
          {series && <Legend series={series} />}
        </>
      )}
    </section>
  );
}

/** Y-axis ticks plus their hairline gridlines. */
export function YAxis({
  max,
  format,
  count = 4,
}: {
  max: number;
  format: (value: number) => string;
  count?: number;
}) {
  return (
    <g>
      {ticks(max, count).map((value) => {
        const y = PLOT.top + innerHeight - (value / max) * innerHeight;
        return (
          <g key={value}>
            <line
              className="chart__grid"
              x1={PLOT.left}
              x2={PLOT.left + innerWidth}
              y1={y}
              y2={y}
            />
            <text x={PLOT.left - 8} y={y + 4} textAnchor="end">
              {format(value)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
