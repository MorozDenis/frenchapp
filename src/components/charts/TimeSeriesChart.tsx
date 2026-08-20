"use client";

import { useState } from "react";
import {
  ChartCard,
  Legend,
  PLOT,
  Tooltip,
  YAxis,
  innerHeight,
  innerWidth,
  linePath,
  niceMax,
  type Series,
} from "@/components/charts/primitives";

/**
 * Line chart over an ordered x domain, one or two series.
 *
 * Backs FR-8's chart 1 (median latency per session — the headline metric) and
 * chart 4 (text against voice). They are the same picture with a different
 * number of series, and giving them one implementation keeps the two latency
 * readings visually comparable, which is the entire point of chart 4.
 */

export interface TimeSeries extends Series {
  values: (number | null)[];
}

export interface ReferenceLine {
  value: number;
  label: string;
  /**
   * Which side of the line the label sits on. It names the zone it is in, so
   * "rapide" belongs under the 20s line and "lent" above the 45s line.
   */
  place: "above" | "below";
}

export function TimeSeriesChart({
  title,
  note,
  labels,
  series,
  format,
  axisFormat,
  references = [],
}: {
  title: string;
  note?: string;
  labels: string[];
  series: TimeSeries[];
  format: (value: number) => string;
  axisFormat: (value: number) => string;
  references?: ReferenceLine[];
}) {
  const [hover, setHover] = useState<number | null>(null);

  const observed = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const empty = observed.length === 0;

  const max = niceMax(Math.max(...(observed.length ? observed : [1]), ...references.map((r) => r.value)));
  const step = labels.length > 1 ? innerWidth / (labels.length - 1) : 0;
  const xAt = (index: number) => PLOT.left + (labels.length > 1 ? index * step : innerWidth / 2);
  const yAt = (value: number) => PLOT.top + innerHeight - (value / max) * innerHeight;

  // Enough points and the markers turn into a bead curtain; past that the line
  // itself carries the shape and only the endpoint stays marked.
  const showAllMarkers = labels.length <= 20;

  const table = (
    <table className="viz-table">
      <thead>
        <tr>
          <th>Point</th>
          {series.map((s) => (
            <th key={s.key}>{s.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((label, index) => (
          <tr key={`${label}-${index}`}>
            <td>{label}</td>
            {series.map((s) => (
              <td key={s.key}>{s.values[index] === null ? "—" : format(s.values[index] as number)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard title={title} note={note} series={series} table={table} empty={empty}>
      <svg
        className="chart"
        viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
        role="img"
        aria-label={title}
        style={{ minWidth: 420 }}
      >
        <YAxis max={max} format={axisFormat} />

        {references.map((reference) =>
          reference.value <= max ? (
            <g key={reference.label}>
              <line
                className="chart__grid"
                x1={PLOT.left}
                x2={PLOT.left + innerWidth}
                y1={yAt(reference.value)}
                y2={yAt(reference.value)}
              />
              {/* Left-anchored: the right edge belongs to the series' end
                  label, and the two collided there. */}
              <text
                x={PLOT.left + 6}
                y={yAt(reference.value) + (reference.place === "above" ? -5 : 12)}
                textAnchor="start"
              >
                {reference.label}
              </text>
            </g>
          ) : null,
        )}

        <line
          className="chart__axis"
          x1={PLOT.left}
          x2={PLOT.left + innerWidth}
          y1={PLOT.top + innerHeight}
          y2={PLOT.top + innerHeight}
        />

        {series.map((s) => {
          const points = s.values
            .map((value, index) => (value === null ? null : { x: xAt(index), y: yAt(value) }))
            .filter((p): p is { x: number; y: number } => p !== null);
          if (points.length === 0) return null;

          return (
            <g key={s.key}>
              {points.length > 1 && (
                <path
                  d={linePath(points)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {points.map((point, index) =>
                showAllMarkers || index === points.length - 1 ? (
                  <circle
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r={4}
                    fill={s.color}
                    /* Surface ring, so a marker stays legible where the two
                       series cross. */
                    stroke="var(--surface-1)"
                    strokeWidth={2}
                  />
                ) : null,
              )}
            </g>
          );
        })}

        {/* Selective direct labels: the last observed value of each series. */}
        {series.map((s) => {
          const lastIndex = s.values.reduce<number>(
            (found, value, index) => (value !== null ? index : found),
            -1,
          );
          if (lastIndex < 0) return null;
          const value = s.values[lastIndex] as number;
          return (
            <text
              key={`label-${s.key}`}
              x={Math.min(xAt(lastIndex), PLOT.left + innerWidth - 2)}
              y={yAt(value) - 11}
              textAnchor="end"
              style={{ fill: "var(--text-2)", fontWeight: 600 }}
            >
              {format(value)}
            </text>
          );
        })}

        {labels.length > 0 && (
          <>
            <text x={PLOT.left} y={PLOT.height - 8}>
              {labels[0]}
            </text>
            {labels.length > 1 && (
              <text x={PLOT.left + innerWidth} y={PLOT.height - 8} textAnchor="end">
                {labels[labels.length - 1]}
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
              Math.max(0, Math.min(labels.length - 1, Math.round(ratio * (labels.length - 1)))),
            );
          }}
        />
      </svg>

      {hover !== null && (
        <Tooltip leftPercent={(xAt(hover) / PLOT.width) * 100}>
          <strong>{labels[hover]}</strong>
          {series.map((s) => (
            <div key={s.key} className="viz-tooltip__row">
              <span className="legend__swatch" style={{ background: s.color, margin: 0 }} />
              <span className="muted">{s.label}</span>
              <span>{s.values[hover] === null ? "—" : format(s.values[hover] as number)}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </ChartCard>
  );
}

export { Legend };
