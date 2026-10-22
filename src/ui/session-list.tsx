import { CheckCircle2, MapPin, Video } from "lucide-react";
import type { upcomingSessionsFor } from "@/server/tracking/sessions";
import { joinSessionAction } from "@/server/actions/tracking";
import { formatDay, formatTime } from "@/lib/format";
import { Button } from "@/ui/button";

type Session = Awaited<ReturnType<typeof upcomingSessionsFor>>[number];

/** Upcoming live sessions for a learner, with how to attend each one. */
export function SessionList({ sessions, showCourse }: { sessions: Session[]; showCourse?: boolean }) {
  return (
    <ul className="divide-line border-line divide-y border-y">
      {sessions.map((s) => (
        <li
          key={s.id}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
          data-category={s.course.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
        >
          <div className="w-24 shrink-0">
            <p className="font-mono text-sm">{formatDay(s.startsAt)}</p>
            <p className="text-muted font-mono text-xs">
              {formatTime(s.startsAt)}–{formatTime(s.endsAt)}
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{s.title}</p>
            <p className="text-muted flex items-center gap-1.5 text-sm">
              {s.mode === "ONLINE" ? (
                <Video className="size-3.5" aria-hidden />
              ) : (
                <MapPin className="size-3.5" aria-hidden />
              )}
              {s.mode === "ONLINE" ? "Online" : s.location}
              {showCourse && ` · ${s.course.title}`}
            </p>
          </div>
          {s.present ? (
            <span className="text-success flex items-center gap-1.5 text-sm">
              <CheckCircle2 className="size-4" aria-hidden /> Attended
            </span>
          ) : s.hasMeeting && s.open ? (
            <form action={joinSessionAction}>
              <input type="hidden" name="sessionId" value={s.id} />
              <Button type="submit" size="sm">
                Join now
              </Button>
            </form>
          ) : s.mode !== "ONLINE" && s.open ? (
            <span className="text-accent-text text-sm">Scan the trainer&apos;s code to check in</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
