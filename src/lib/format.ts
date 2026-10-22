const TZ = "Africa/Johannesburg";

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  }).format(d);
}

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(d);
}

/** Whole days left before `deadlineDays` after `from` (negative once overdue). */
export function daysRemaining(from: Date, deadlineDays: number, now = Date.now()): number {
  return deadlineDays - Math.floor((now - from.getTime()) / (24 * 60 * 60 * 1000));
}
