// Release-condition (adaptive release) evaluation. Pure, so it is easy to test.
import type { ProgressStatus, ReleaseRuleType } from "@/generated/prisma/enums";

export interface RuleLike {
  type: ReleaseRuleType;
  afterDate: Date | null;
  dependsOnItemId: string | null;
  minScorePct: number | null;
}

export interface ProgressLike {
  status: ProgressStatus;
  scorePct: number | null;
}

export interface LockState {
  unlocked: boolean;
  /** Human-readable reasons, one per unmet rule. */
  reasons: string[];
  /** Earliest date at which date rules alone would pass (for "Opens on …"). */
  opensAt: Date | null;
}

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Johannesburg",
});

/** All rules must pass (AND). */
export function evaluateRules(
  rules: RuleLike[],
  progress: Map<string, ProgressLike>,
  titles: Map<string, string>,
  now: Date = new Date(),
): LockState {
  const reasons: string[] = [];
  let opensAt: Date | null = null;
  for (const rule of rules) {
    switch (rule.type) {
      case "AFTER_DATE":
        if (rule.afterDate && rule.afterDate > now) {
          reasons.push(`Opens ${dateFmt.format(rule.afterDate)}`);
          if (!opensAt || rule.afterDate > opensAt) opensAt = rule.afterDate;
        }
        break;
      case "ITEM_COMPLETED": {
        const p = rule.dependsOnItemId ? progress.get(rule.dependsOnItemId) : undefined;
        if (p?.status !== "COMPLETED")
          reasons.push(`Complete “${titleOf(titles, rule.dependsOnItemId)}” first`);
        break;
      }
      case "MIN_SCORE": {
        const p = rule.dependsOnItemId ? progress.get(rule.dependsOnItemId) : undefined;
        if (p?.scorePct == null || p.scorePct < (rule.minScorePct ?? 0)) {
          reasons.push(`Score at least ${rule.minScorePct}% in “${titleOf(titles, rule.dependsOnItemId)}”`);
        }
        break;
      }
    }
  }
  return { unlocked: reasons.length === 0, reasons, opensAt };
}

function titleOf(titles: Map<string, string>, id: string | null) {
  return (id && titles.get(id)) || "an earlier item";
}

/** Required, visible items completed as a whole percentage. */
export function progressPercent(requiredItemIds: string[], progress: Map<string, ProgressLike>): number {
  if (requiredItemIds.length === 0) return 0;
  const done = requiredItemIds.filter((id) => progress.get(id)?.status === "COMPLETED").length;
  return Math.floor((done / requiredItemIds.length) * 100);
}

/**
 * Detects whether adding a dependency would create a cycle (A waits on B waits on A),
 * which would lock both items forever. `edges` maps an item to the items it depends on.
 */
export function createsCycle(edges: Map<string, string[]>, from: string, to: string): boolean {
  const stack = [to];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === from) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(edges.get(id) ?? []));
  }
  return false;
}
