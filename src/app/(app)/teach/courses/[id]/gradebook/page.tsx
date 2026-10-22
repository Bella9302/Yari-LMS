import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { requireUser } from "@/server/guards";
import { getEditableCourse } from "@/server/courses/queries";
import { getGradebook, gradeLabel, type GradebookFilter } from "@/server/assessment/gradebook";
import type { Grade } from "@/server/assessment/grades";
import { Button, buttonClasses } from "@/ui/button";
import { Input, Select } from "@/ui/field";
import { ItemTypeIcon } from "@/ui/item-type";
import { EmptyState, Tag } from "@/ui/primitives";
import { cn } from "@/ui/cn";

export const metadata: Metadata = { title: "Gradebook" };

const FILTERS: Record<GradebookFilter, string> = {
  all: "Everyone",
  "needs-marking": "Has work to mark",
  failing: "Below a pass mark",
  completed: "Completed the course",
  "not-started": "Not started",
};

export default async function GradebookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; org?: string; filter?: string }>;
}) {
  const { user } = await requireUser();
  const actor = { id: user.id, roles: user.roles };
  const { id } = await params;
  const sp = await searchParams;
  await getEditableCourse(actor, id);
  const filter = (Object.keys(FILTERS) as GradebookFilter[]).includes(sp.filter as GradebookFilter)
    ? (sp.filter as GradebookFilter)
    : "all";
  const gb = await getGradebook(actor, id, { q: sp.q, organizationId: sp.org || undefined, filter });
  const qs = new URLSearchParams(
    Object.entries({ q: sp.q ?? "", org: sp.org ?? "", filter }).filter(([, v]) => v),
  ).toString();

  return (
    <div className="space-y-6">
      <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]" role="search">
        <label htmlFor="gb-q" className="sr-only">
          Search learners
        </label>
        <Input id="gb-q" name="q" placeholder="Search name, email or company" defaultValue={sp.q} />
        <label htmlFor="gb-filter" className="sr-only">
          Show
        </label>
        <Select id="gb-filter" name="filter" defaultValue={filter}>
          {Object.entries(FILTERS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        {gb.organizations.length > 0 && (
          <>
            <label htmlFor="gb-org" className="sr-only">
              Company
            </label>
            <Select id="gb-org" name="org" defaultValue={sp.org ?? ""}>
              <option value="">All companies</option>
              {gb.organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </>
        )}
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted font-mono text-xs">
          {gb.rows.length} learner{gb.rows.length === 1 ? "" : "s"}
        </span>
        <span className="flex-1" />
        <a
          href={`/teach/courses/${id}/gradebook/export?format=csv&${qs}`}
          className={buttonClasses("secondary", "sm")}
        >
          <Download className="size-4" aria-hidden /> CSV
        </a>
        <a
          href={`/teach/courses/${id}/gradebook/export?format=pdf&${qs}`}
          className={buttonClasses("secondary", "sm")}
        >
          <Download className="size-4" aria-hidden /> PDF
        </a>
      </div>

      {gb.rows.length === 0 ? (
        <EmptyState title="No learners match" />
      ) : (
        <>
          {/* Wide screens: a true grid with the learner column pinned. */}
          <div className="border-line hidden overflow-x-auto border md:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Gradebook</caption>
              <thead>
                <tr className="border-fg bg-surface border-b">
                  <th
                    scope="col"
                    className="eyebrow bg-surface sticky left-0 px-3 py-3 text-left font-normal"
                  >
                    Learner
                  </th>
                  <th scope="col" className="eyebrow px-3 py-3 text-left font-normal">
                    Progress
                  </th>
                  {gb.columns.map((c) => (
                    <th
                      key={c.itemId}
                      scope="col"
                      className="min-w-28 px-3 py-3 text-left align-bottom font-normal"
                    >
                      <span className="text-muted flex items-center gap-1.5">
                        <ItemTypeIcon type={c.type} className="size-3.5" />{" "}
                        <span className="font-mono text-[0.65rem]">pass {c.passPct}%</span>
                      </span>
                      <span className="mt-1 block font-medium">{c.title}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gb.rows.map((r) => (
                  <tr key={r.enrolmentId} className="border-line border-b">
                    <th scope="row" className="bg-bg sticky left-0 px-3 py-2 text-left font-normal">
                      <Link
                        href={`/teach/courses/${id}/gradebook/${r.enrolmentId}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {r.name}
                      </Link>
                      <span className="text-muted block text-xs">{r.organization ?? "Individual"}</span>
                    </th>
                    <td className="px-3 py-2 font-mono">
                      {r.progressPct}%{r.status === "COMPLETED" && " ✓"}
                    </td>
                    {gb.columns.map((c) => (
                      <GradeCell key={c.itemId} grade={r.grades[c.itemId]!} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per learner. */}
          <ul className="space-y-3 md:hidden">
            {gb.rows.map((r) => (
              <li key={r.enrolmentId} className="border-line bg-surface border p-4">
                <Link
                  href={`/teach/courses/${id}/gradebook/${r.enrolmentId}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {r.name}
                </Link>
                <p className="text-muted text-xs">
                  {r.organization ?? "Individual"} · {r.progressPct}% done
                </p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  {gb.columns.map((c) => (
                    <div key={c.itemId} className="flex justify-between gap-3">
                      <dt className="text-muted truncate">{c.title}</dt>
                      <dd>
                        <GradeBadge grade={r.grades[c.itemId]!} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function GradeBadge({ grade }: { grade: Grade }) {
  return (
    <span
      className={cn(
        "font-mono",
        grade.state === "pending" && "text-accent-text",
        grade.passed === true && "text-success",
        grade.passed === false && grade.state === "graded" && "text-danger",
        grade.state === "none" && "text-muted",
      )}
    >
      {gradeLabel(grade)}
      {grade.overridden && <span title="Overridden by a trainer">*</span>}
      {grade.late && (
        <Tag tone="danger" className="ml-1.5">
          late
        </Tag>
      )}
    </span>
  );
}

function GradeCell({ grade }: { grade: Grade }) {
  return (
    <td className="px-3 py-2">
      <GradeBadge grade={grade} />
    </td>
  );
}
