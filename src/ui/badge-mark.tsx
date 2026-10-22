import { Award, CalendarCheck, Clock, Footprints, GraduationCap, Layers, Target } from "lucide-react";
import type { BadgeCode } from "@/lib/badges";
import { cn } from "@/ui/cn";

const ICONS: Record<BadgeCode, typeof Award> = {
  FIRST_STEP: Footprints,
  COURSE_COMPLETE: GraduationCap,
  FULL_MARKS: Target,
  ON_TIME: Clock,
  FULL_ATTENDANCE: CalendarCheck,
  THREE_COURSES: Award,
  ALL_ROUNDER: Layers,
};

/** A round seal: ink on paper when earned, a faint outline while still to earn. */
export function BadgeMark({
  code,
  locked,
  className,
}: {
  code: BadgeCode;
  locked?: boolean;
  className?: string;
}) {
  const Icon = ICONS[code];
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-full border",
        locked
          ? "border-line-strong text-muted"
          : "bg-inverse text-on-inverse border-fg ring-line ring-offset-surface ring-2 ring-offset-2",
        className,
      )}
    >
      <Icon className="size-5" strokeWidth={1.5} />
    </span>
  );
}
