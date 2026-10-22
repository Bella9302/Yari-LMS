"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";

export interface TrendPoint {
  month: string; // YYYY-MM
  overall: number | null;
  count: number;
}

const W = 640;
const H = 220;
const PAD = { top: 16, right: 44, bottom: 28, left: 28 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

const monthLabel = (m: string, long = false) =>
  new Intl.DateTimeFormat("en-ZA", {
    month: long ? "long" : "short",
    year: long ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(`${m}-01T00:00:00Z`));

/**
 * Overall rating per month (1–5). Months with too few ratings are left as gaps rather than
 * joined across, so a quiet month is never read as a dip.
 */
export function RatingTrend({ points, min }: { points: TrendPoint[]; min: number }) {
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + ((5 - v) / 4) * plotH;

  // Split the line wherever a month is empty.
  const segments: { i: number; v: number }[][] = [];
  let run: { i: number; v: number }[] = [];
  points.forEach((p, i) => {
    if (p.overall === null) {
      if (run.length) segments.push(run);
      run = [];
    } else run.push({ i, v: p.overall });
  });
  if (run.length) segments.push(run);

  const lastIdx = points.findLastIndex((p) => p.overall !== null);

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.left) / plotW) * (points.length - 1));
    setActive(Math.max(0, Math.min(points.length - 1, i)));
  }
  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setActive((a) =>
      Math.max(0, Math.min(points.length - 1, (a ?? lastIdx) + (e.key === "ArrowRight" ? 1 : -1))),
    );
  }

  const a = active !== null ? points[active] : null;
  return (
    <figure className="space-y-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-pan-y outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
          role="img"
          aria-label="Overall rating by month, last 12 months. Use left and right arrow keys to read each month."
          aria-describedby={tableId}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 10}
                y={y(v)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted font-mono text-[11px]"
              >
                {v}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            (points.length - 1 - i) % 2 === 0 ? (
              <text
                key={p.month}
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                className="fill-muted font-mono text-[11px]"
              >
                {monthLabel(p.month)}
              </text>
            ) : null,
          )}
          {a && (
            <line
              x1={x(active!)}
              x2={x(active!)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              className="stroke-muted"
              strokeWidth={1}
            />
          )}
          {segments.map((s) =>
            s.length > 1 ? (
              <polyline
                key={s[0]!.i}
                points={s.map((d) => `${x(d.i)},${y(d.v)}`).join(" ")}
                fill="none"
                className="stroke-accent-text"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}
          {points.map((p, i) =>
            p.overall === null ? null : (
              <circle
                key={p.month}
                cx={x(i)}
                cy={y(p.overall)}
                r={active === i ? 6 : 4}
                className="fill-accent-text stroke-surface"
                strokeWidth={2}
              />
            ),
          )}
          {lastIdx >= 0 && (
            <text
              x={x(lastIdx) + 10}
              y={y(points[lastIdx]!.overall!)}
              dy="0.32em"
              className="fill-fg font-mono text-[12px] font-medium"
            >
              {points[lastIdx]!.overall!.toFixed(1)}
            </text>
          )}
        </svg>
        {a && (
          <div
            className="border-line-strong bg-surface pointer-events-none absolute top-0 z-10 -translate-x-1/2 border px-3 py-2 text-sm shadow-sm"
            style={{ left: `${Math.min(85, Math.max(15, (x(active!) / W) * 100))}%` }}
            aria-live="polite"
          >
            <p className="font-mono text-base font-medium">
              {a.overall === null ? "—" : a.overall.toFixed(1)}
            </p>
            <p className="text-muted whitespace-nowrap">
              {monthLabel(a.month, true)} ·{" "}
              {a.overall === null
                ? a.count
                  ? `fewer than ${min} ratings`
                  : "no ratings"
                : `${a.count} ratings`}
            </p>
          </div>
        )}
      </div>
      <figcaption className="text-muted text-sm">
        Gaps are months with fewer than {min} ratings, which are hidden to keep raters anonymous.
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer underline underline-offset-4">Show as table</summary>
        <table id={tableId} className="mt-3 w-full max-w-sm">
          <thead>
            <tr className="border-line border-b text-left">
              <th className="eyebrow py-1.5 font-normal">Month</th>
              <th className="eyebrow py-1.5 text-right font-normal">Overall</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.month} className="border-line border-b">
                <td className="py-1.5">{monthLabel(p.month, true)}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">
                  {p.overall === null ? "—" : p.overall.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
