import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import { badgesFor } from "@/server/engagement/badges";
import { BADGE_DISCLAIMER, BADGES, type BadgeCode } from "@/lib/badges";
import { formatDate } from "@/lib/format";
import { BadgeMark } from "@/ui/badge-mark";

export const metadata: Metadata = { title: "Badges" };

export default async function BadgesPage() {
  const { user } = await requireUser();
  const earned = await badgesFor(user.id);
  const codes = new Set(earned.map((b) => b.badge));
  const locked = Object.values(BADGES).filter((b) => !codes.has(b.code));

  return (
    <div className="space-y-10">
      <section aria-labelledby="earned-heading" className="space-y-4">
        <h2 id="earned-heading" className="font-display text-h2">
          Earned
        </h2>
        {earned.length === 0 ? (
          <p className="text-muted">Complete your first item to earn your first badge.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {earned.map((b) => {
              const def = BADGES[b.badge as BadgeCode];
              if (!def) return null;
              return (
                <li key={b.id} className="border-line bg-surface flex items-start gap-4 border p-4">
                  <BadgeMark code={def.code} />
                  <div className="min-w-0">
                    <p className="font-medium">{def.name}</p>
                    <p className="text-muted text-sm">{b.course ? b.course.title : def.description}</p>
                    <p className="text-muted mt-1 font-mono text-xs">{formatDate(b.awardedAt)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {locked.length > 0 && (
        <section aria-labelledby="locked-heading" className="space-y-4">
          <h2 id="locked-heading" className="font-display text-h3">
            Still to earn
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {locked.map((def) => (
              <li
                key={def.code}
                className="border-line-strong flex items-start gap-4 border border-dashed p-4"
              >
                <BadgeMark code={def.code} locked />
                <div className="min-w-0">
                  <p className="font-medium">{def.name}</p>
                  <p className="text-muted text-sm">{def.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-muted border-line border-t pt-4 text-sm">{BADGE_DISCLAIMER}</p>
    </div>
  );
}
