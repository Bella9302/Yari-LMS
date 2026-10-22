import { CalendarClock, CheckCircle2, Gauge, X } from "lucide-react";
import type { ReleaseRuleType } from "@/generated/prisma/enums";
import { deleteRuleAction } from "@/server/actions/courses";
import { formatDateTime } from "@/lib/format";
import { RuleForm } from "@/ui/rule-form";

export interface RuleRow {
  id: string;
  type: ReleaseRuleType;
  afterDate: Date | null;
  minScorePct: number | null;
  dependsOnItem: { title: string } | null;
}

const ICON = { AFTER_DATE: CalendarClock, ITEM_COMPLETED: CheckCircle2, MIN_SCORE: Gauge };

function describe(rule: RuleRow) {
  if (rule.type === "AFTER_DATE") return `Opens ${formatDateTime(rule.afterDate)}`;
  if (rule.type === "ITEM_COMPLETED") return `After “${rule.dependsOnItem?.title}” is completed`;
  return `After scoring ${rule.minScorePct}% in “${rule.dependsOnItem?.title}”`;
}

/** Lists a target's release conditions and lets staff add or remove them. */
export function ReleaseRules({
  courseId,
  target,
  rules,
  itemOptions,
}: {
  courseId: string;
  target: { moduleId: string } | { itemId: string };
  rules: RuleRow[];
  itemOptions: { module: string; items: { id: string; title: string; type?: string }[] }[];
}) {
  const selfId = "itemId" in target ? target.itemId : null;
  return (
    <div className="space-y-4">
      {rules.length === 0 ? (
        <p className="text-muted text-sm">Always available once the course is open.</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => {
            const Icon = ICON[rule.type];
            return (
              <li key={rule.id} className="border-line flex items-center gap-3 border px-3 py-1.5 text-sm">
                <Icon className="text-muted size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                <span className="flex-1">{describe(rule)}</span>
                <form action={deleteRuleAction}>
                  <input type="hidden" name="courseId" value={courseId} />
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <button
                    type="submit"
                    className="hover:bg-sunk inline-grid size-10 place-items-center rounded-sm"
                    aria-label={`Remove rule: ${describe(rule)}`}
                  >
                    <X className="size-4" />
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
      {rules.length > 1 && <p className="text-muted text-xs">All conditions must be met.</p>}
      <RuleForm
        courseId={courseId}
        target={target}
        itemOptions={itemOptions.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== selfId) }))}
      />
    </div>
  );
}
