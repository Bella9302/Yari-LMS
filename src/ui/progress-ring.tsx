import { cn } from "@/ui/cn";

/** Circular progress. Animates its fill on mount (disabled under prefers-reduced-motion via globals.css). */
export function ProgressRing({
  value,
  size = 72,
  stroke = 4,
  label,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent-fill)"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ ["--ring-c" as string]: c, animation: "ring-fill 0.9s var(--ease-out-quart) both" }}
        />
      </svg>
      <span className="absolute font-mono text-sm tabular-nums">{pct}%</span>
    </div>
  );
}
