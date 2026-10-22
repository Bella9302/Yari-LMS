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

/** "YYYY-MM-DD" and "HH:mm" in South African time, for date/time inputs. */
export function saDateInput(d: Date): string {
  return new Date(d.getTime() + 2 * 3600_000).toISOString().slice(0, 10);
}
export function saTimeInput(d: Date): string {
  return new Date(d.getTime() + 2 * 3600_000).toISOString().slice(11, 16);
}

export function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);
}

export function formatDay(d: Date): string {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: TZ,
  }).format(d);
}
