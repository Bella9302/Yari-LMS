import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/ui/cn";

const control =
  "block w-full min-h-11 rounded-sm border border-line-strong bg-surface px-3 py-2 text-base text-fg " +
  "placeholder:text-muted/70 transition-colors focus:border-fg focus:outline-none focus-visible:outline-2 " +
  "focus-visible:outline-offset-1 aria-[invalid=true]:border-danger";

interface FieldProps {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: (props: {
    id: string;
    name: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => ReactNode;
  className?: string;
  /** Override when the same field name appears twice on one page. */
  id?: string;
}

/** Label + control + hint + error, wired up for screen readers. */
export function Field({ label, name, hint, error, optional, children, className, id: idProp }: FieldProps) {
  // Ids derive from the field name, so names must be unique within a page.
  const id = idProp ?? `field-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium">
        {label}
        {optional && <span className="text-muted text-xs font-normal">Optional</span>}
      </label>
      {children({ id, name, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && (
        <p id={hintId} className="text-muted text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-28", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        control,
        "appearance-none bg-[length:12px] bg-[right_0.9rem_center] bg-no-repeat pr-9",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%237f7b73' stroke-width='1.5'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    />
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label
      className={cn("flex cursor-pointer items-start gap-3 py-1 text-[0.95rem] leading-snug", className)}
    >
      <input
        type="checkbox"
        className="border-line-strong bg-surface checked:border-fg checked:bg-inverse checked:bg-[url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-7' fill='none' stroke='%23f7f5f0' stroke-width='2'/%3E%3C/svg%3E&quot;)] dark:checked:bg-[url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-7' fill='none' stroke='%230b0b0c' stroke-width='2'/%3E%3C/svg%3E&quot;)] mt-0.5 size-5 shrink-0 cursor-pointer appearance-none rounded-sm border bg-center bg-no-repeat"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
