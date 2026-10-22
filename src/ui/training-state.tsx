import type { TrainingState } from "@/server/tracking/company";
import { STATE_LABELS } from "@/server/tracking/company";
import { Tag } from "@/ui/primitives";

const TONE: Record<TrainingState, "success" | "danger" | "accent" | "neutral"> = {
  completed: "success",
  overdue: "danger",
  inactive: "accent",
  in_progress: "neutral",
  not_started: "neutral",
};

export function TrainingStateTag({ state }: { state: TrainingState }) {
  return <Tag tone={TONE[state]}>{STATE_LABELS[state]}</Tag>;
}
