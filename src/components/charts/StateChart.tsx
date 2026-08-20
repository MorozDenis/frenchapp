"use client";

import { useState } from "react";
import {
  ChartCard,
  PLOT,
  Tooltip,
  YAxis,
  formatDay,
  innerHeight,
  innerWidth,
  niceMax,
} from "@/components/charts/primitives";
import type { ReviewStateName } from "@/lib/taxonomy";

/**
 * FR-8 chart 2 — expressions by state, stacked, over time.
 *
 * new → learning → active is an ordered progression rather than three
 * unrelated categories, so it takes a single-hue ordinal ramp instead of
 * categorical hues: the reader sees the bank darkening as it matures.
 */

export interface StateSnapshot {
  day: string;
  new: number;
  learning: number;
  active: number;
}

const BANDS: { key: ReviewStateName; label: string; color: string }[] = [
  { key: "new", label: "New", color: "var(--ordinal-1)" },
  { key: "learning", label: "Learning", color: "var(--ordinal-2)" },
  { key: "active", label: "Active", color: "var(--ordinal-3)" },
];

export function StateChart({ snapshots }: { snapshots: StateSnapshot[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const empty = snapshots.length === 0;

  const totals = snapshots.map((s) => s.new + s.learning + s.active);
  const max = niceMax(Math.max(...(totals.length ? totals : [1])));
  const step = snapshots.length > 1 ? innerWidth / (snapshots.length - 1) : 0;
  const xAt = (i: number) =>
    PLOT.left + (snapshots.length > 1 ? i * step : innerWidth / 2);
  const yAt = (v: number) => PLOT.top + innerHeight - (v / max) * innerHeight;

  // Cumulative tops for each band, so the areas stack.
  const tops = snapshots.map((snapshot) => {
    let running = 0;
    return BANDS.map((band) => {
      running += snapshot[band.key];
      return running;
    });
  });

  const table = (
    <table className="viz-table">
      <thead>
        <tr>
          <th>Day</th>
          {BANDS.map((b) => (
            <th key={b.key}>{b.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {snapshots.map((snapshot) => (
          <tr key={snapshot.day}>
            <td>{formatDay(snapshot.day)}</td>
            {BANDS.map((b) => (
              <td key={b.key}>{snapshot[b.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title="Bank by state"
      note="A snapshot is taken when a session starts, so the line only moves on days you drilled."
      series={BANDS}
      table={table}
      empty={empty}
    >
      <svg
        className="chart"
        viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
        role="img"
        aria-label="Expressions by review state over time"
        style={{ minWidth: 420 }}
      >
        <YAxis max={max} format={(v) => String(Math.round(v))} />

        {BANDS.map((band, bandIndex) => {
          const upper = snapshots.map((_, i) => ({ x: xAt(i), y: yAt(tops[i][bandIndex]) }));
          const lower = snapshots.map((_, i) => ({
            x: xAt(i),
            y: yAt(bandIndex === 0 ? 0 : tops[i][bandIndex - 1]),
          }));
          if (upper.length === 0) return null;

          const area = [
            ...upper.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`),
            ...[...lower].reverse().map((p) => `L${p.x} ${p.y}`),
            "Z",
          ].join(" ");

          return (
            <g key={band.key}>
              <path d={area} fill={band.color} />
              {/* The 2px surface gap between touching marks — drawn as a
                  stroke in the surface colour along each band's top edge. */}
              <path
                d={upper.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")}
                fill="none"
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            </g>
          );
        })}

        <line
          className="chart__axis"
          x1={PLOT.left}
          x2={PLOT.left + innerWidth}
          y1={PLOT.top + innerHeight}
          y2={PLOT.top + innerHeight}
        />

        {snapshots.length > 0 && (
          <>
            <text x={PLOT.left} y={PLOT.height - 8}>
              {formatDay(snapshots[0].day)}
            </text>
            {snapshots.length > 1 && (
              <text x={PLOT.left + innerWidth} y={PLOT.height - 8} textAnchor="end">
                {formatDay(snapshots[snapshots.length - 1].day)}
              </text>
            )}
          </>
        )}

        {hover !== null && (
          <line
            className="chart__axis"
            x1={xAt(hover)}
            x2={xAt(hover)}
            y1={PLOT.top}
            y2={PLOT.top + innerHeight}
          />
        )}

        <rect
          x={PLOT.left}
          y={PLOT.top}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - box.left) / box.width;
            setHover(
              Math.max(0, Math.min(snapshots.length - 1, Math.round(ratio * (snapshots.length - 1)))),
            );
          }}
        />
      </svg>

      {hover !== null && snapshots[hover] && (
        <Tooltip leftPercent={(xAt(hover) / PLOT.width) * 100}>
          <strong>{formatDay(snapshots[hover].day)}</strong>
          {BANDS.map((band) => (
            <div key={band.key} className="viz-tooltip__row">
              <span className="legend__swatch" style={{ background: band.color, margin: 0 }} />
              <span className="muted">{band.label}</span>
              <span>{snapshots[hover][band.key]}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </ChartCard>
  );
}
