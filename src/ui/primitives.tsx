import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/ui/cn";

export function Rule({ className, strong }: { className?: string; strong?: boolean }) {
  return <hr className={cn("border-0 border-t", strong ? "border-fg" : "border-line", className)} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("border-line bg-surface rounded-sm border", className)} {...props} />;
}

export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("eyebrow", className)} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="animate-rise border-line border-b pb-6 sm:pb-8">
      {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-h1">{title}</h1>
          {description && <p className="text-muted mt-3 text-lg">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
      </div>
    </header>
  );
}

type Tone = "neutral" | "danger" | "success" | "accent";

const tagTones: Record<Tone, string> = {
  neutral: "border-line-strong text-muted",
  danger: "border-danger text-danger",
  success: "border-success text-success",
  accent: "border-accent-text text-accent-text",
};

export function Tag({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[0.7rem] tracking-wider uppercase",
        tagTones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function CategoryTag({ category }: { category: "HEALTH_SAFETY" | "AI_DIGITAL" }) {
  const hs = category === "HEALTH_SAFETY";
  return (
    <span
      data-category={hs ? "health-safety" : "ai-digital"}
      className="text-accent-text inline-flex items-center gap-2 font-mono text-[0.7rem] tracking-wider uppercase"
    >
      <span aria-hidden className="bg-accent size-2 rounded-full" />
      {hs ? "Health & Safety" : "AI & Digital"}
    </span>
  );
}

const noticeTones: Record<Exclude<Tone, "accent">, string> = {
  neutral: "border-line-strong bg-sunk",
  danger: "border-danger bg-danger-bg text-danger",
  success: "border-success bg-success-bg text-success",
};

export function Notice({
  tone = "neutral",
  title,
  children,
  className,
}: {
  tone?: Exclude<Tone, "accent">;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("border-l-2 px-4 py-3 text-[0.95rem]", noticeTones[tone], className)}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title && "mt-1", "text-fg/90 dark:text-fg/85")}>{children}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border-line-strong border border-dashed px-6 py-12 text-center">
      <p className="font-display text-h3">{title}</p>
      {children && <p className="text-muted mx-auto mt-2 max-w-md">{children}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

/** Large mono numeral used for stats ("42", "86%"). */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="border-fg border-t pt-3">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-mono text-4xl tracking-tight tabular-nums">{value}</p>
      {hint && <p className="text-muted mt-1 text-sm">{hint}</p>}
    </div>
  );
}

/** One label/value pair inside a <dl>. */
export function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-line border-t pt-3">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1.5 break-words">{value}</dd>
    </div>
  );
}
