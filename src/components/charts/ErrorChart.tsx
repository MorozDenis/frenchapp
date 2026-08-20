"use client";

import { useState } from "react";
import { ChartCard, Tooltip, barPath } from "@/components/charts/primitives";
import { ERROR_CATEGORY_LABEL, type ErrorCategory } from "@/lib/taxonomy";

/**
 * FR-8 chart 3 — error categories, this month against last.
 *
 * Horizontal bars, because the category names are long French grammar terms
 * and rotating them under a column chart would make the axis the hardest part
 * of the picture to read. Values sit at the bar tips, which is what earns the
 * chart the right to drop its value axis entirely.
 *
 * §9 treats a *change* in the top category as the success signal, so the rows
 * are ordered by this month's count and the comparison bar sits directly under
 * each one.
 */

export interface ErrorRow {
  category: ErrorCategory;
  current: number;
  previous: number;
}

const BAR = 11;
const GAP = 2;
const ROW = 40;
const LABEL_WIDTH = 168;
const VALUE_WIDTH = 34;
const WIDTH = 720;

const SERIES = [
  { key: "current", label: "This month", color: "var(--series-1)" },
  { key: "previous", label: "Last month", color: "var(--series-2)" },
];

export function ErrorChart({ rows }: { rows: ErrorRow[] }) {
  const [hover, setHover] = useState<{ row: number; series: 0 | 1 } | null>(null);

  const sorted = [...rows].sort(
    (a, b) => b.current - a.current || b.previous - a.previous,
  );
  const empty = sorted.length === 0;
  const max = Math.max(1, ...sorted.flatMap((r) => [r.current, r.previous]));

  const plotWidth = WIDTH - LABEL_WIDTH - VALUE_WIDTH;
  const height = Math.max(1, sorted.length) * ROW + 8;
  const barWidth = (value: number) => (value / max) * plotWidth;

  const table = (
    <table className="viz-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>This month</th>
          <th>Last month</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.category}>
            <td>{ERROR_CATEGORY_LABEL[row.category]}</td>
            <td>{row.current}</td>
            <td>{row.previous}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title="Errors by category"
      note="Flagged transcripts are excluded — those tags may be Whisper's mistakes, not yours."
      series={SERIES}
      table={table}
      empty={empty}
    >
      <svg
        className="chart"
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label="Error categories this month compared with last month"
        style={{ minWidth: 460 }}
      >
        {sorted.map((row, index) => {
          const top = index * ROW + 8;
          return (
            <g key={row.category}>
              <text x={LABEL_WIDTH - 12} y={top + BAR + GAP / 2 + 4} textAnchor="end">
                {ERROR_CATEGORY_LABEL[row.category]}
              </text>

              {([
                { value: row.current, color: "var(--series-1)", y: top, which: 0 as const },
                {
                  value: row.previous,
                  color: "var(--series-2)",
                  y: top + BAR + GAP,
                  which: 1 as const,
                },
              ]).map((bar) => (
                <g
                  key={bar.which}
                  onMouseEnter={() => setHover({ row: index, series: bar.which })}
                  onMouseLeave={() => setHover(null)}
                >
                  {/* Full-height hit area: an 11px bar is a poor mouse target. */}
                  <rect
                    x={LABEL_WIDTH}
                    y={bar.y - GAP / 2}
                    width={plotWidth + VALUE_WIDTH}
                    height={BAR + GAP}
                    fill="transparent"
                  />
                  {bar.value > 0 && (
                    <path
                      d={barPath(
                        LABEL_WIDTH,
                        bar.y,
                        Math.max(3, barWidth(bar.value)),
                        BAR,
                      )}
                      fill={bar.color}
                    />
                  )}
                  <text
                    x={LABEL_WIDTH + barWidth(bar.value) + 7}
                    y={bar.y + BAR - 1}
                    style={{ fill: "var(--text-2)" }}
                  >
                    {bar.value}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>

      {hover && sorted[hover.row] && (
        <Tooltip
          leftPercent={
            ((LABEL_WIDTH +
              barWidth(
                hover.series === 0 ? sorted[hover.row].current : sorted[hover.row].previous,
              )) /
              WIDTH) *
            100
          }
          topPercent={((hover.row * ROW + 8) / height) * 100}
        >
          <strong>{ERROR_CATEGORY_LABEL[sorted[hover.row].category]}</strong>
          {SERIES.map((s, i) => (
            <div key={s.key} className="viz-tooltip__row">
              <span className="legend__swatch" style={{ background: s.color, margin: 0 }} />
              <span className="muted">{s.label}</span>
              <span>{i === 0 ? sorted[hover.row].current : sorted[hover.row].previous}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </ChartCard>
  );
}
