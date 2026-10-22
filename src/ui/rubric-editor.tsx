"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { saveRubricAction } from "@/server/actions/assessment";
import { Button } from "@/ui/button";
import { Input, Textarea } from "@/ui/field";
import { Notice } from "@/ui/primitives";

interface Level {
  key: string;
  label: string;
  points: number;
  description: string;
}
interface Criterion {
  key: string;
  title: string;
  description: string;
  levels: Level[];
}

const k = () => Math.random().toString(36).slice(2, 10);
const defaultLevels = (): Level[] => [
  { key: k(), label: "Not yet", points: 0, description: "" },
  { key: k(), label: "Developing", points: 5, description: "" },
  { key: k(), label: "Competent", points: 10, description: "" },
];

/** Criteria as rows, performance levels as columns (stacked on phones). */
export function RubricEditor({
  courseId,
  rubricId,
  initial,
  locked,
}: {
  courseId: string;
  rubricId: string | null;
  initial?: {
    title: string;
    criteria: {
      title: string;
      description: string;
      levels: { label: string; points: number; description: string }[];
    }[];
  };
  locked?: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [criteria, setCriteria] = useState<Criterion[]>(
    initial?.criteria.map((c) => ({ ...c, key: k(), levels: c.levels.map((l) => ({ ...l, key: k() })) })) ?? [
      { key: k(), title: "", description: "", levels: defaultLevels() },
    ],
  );
  const [message, setMessage] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const total = criteria.reduce((s, c) => s + Math.max(0, ...c.levels.map((l) => l.points || 0)), 0);

  const update = (key: string, patch: Partial<Criterion>) =>
    setCriteria(criteria.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const updateLevel = (ck: string, lk: string, patch: Partial<Level>) =>
    setCriteria(
      criteria.map((c) =>
        c.key === ck ? { ...c, levels: c.levels.map((l) => (l.key === lk ? { ...l, ...patch } : l)) } : c,
      ),
    );

  function save() {
    start(async () => {
      const res = await saveRubricAction(courseId, rubricId, {
        title,
        criteria: criteria.map((c) => ({
          title: c.title,
          description: c.description,
          levels: c.levels.map(({ label, points, description }) => ({ label, points, description })),
        })),
      });
      if (res.error) setMessage({ tone: "danger", text: res.error });
      else {
        setMessage({ tone: "success", text: res.message ?? "Saved." });
        if (!rubricId && res.id) router.replace(`/teach/courses/${courseId}/rubrics/${res.id}`);
        else router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {locked && (
        <Notice title="In use">
          Work has been marked with this rubric, so it can&apos;t change. Duplicate it to make a new version.
        </Notice>
      )}
      <fieldset disabled={locked} className="space-y-6">
        <div>
          <label htmlFor="rubric-title" className="text-sm font-medium">
            Rubric title
          </label>
          <Input
            id="rubric-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="mt-1.5"
          />
        </div>
        <ol className="space-y-4">
          {criteria.map((c, ci) => (
            <li key={c.key} className="border-line bg-surface border p-4">
              <div className="flex items-start gap-2">
                <span className="text-muted mt-3 font-mono text-sm">{ci + 1}</span>
                <div className="flex-1 space-y-2">
                  <Input
                    aria-label={`Criterion ${ci + 1}`}
                    placeholder="Criterion, e.g. Hazards identified"
                    value={c.title}
                    onChange={(e) => update(c.key, { title: e.target.value })}
                  />
                  <Textarea
                    aria-label={`Criterion ${ci + 1} description`}
                    placeholder="What you're looking for (optional)"
                    value={c.description}
                    onChange={(e) => update(c.key, { description: e.target.value })}
                    className="min-h-14 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCriteria(criteria.filter((x) => x.key !== c.key))}
                  disabled={criteria.length <= 1}
                  aria-label={`Remove criterion ${ci + 1}`}
                  className="hover:bg-sunk inline-grid size-11 place-items-center rounded-sm disabled:opacity-30"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {c.levels.map((l, li) => (
                  <div key={l.key} className="border-line space-y-2 border p-3">
                    <div className="flex gap-2">
                      <Input
                        aria-label={`Criterion ${ci + 1} level ${li + 1} name`}
                        value={l.label}
                        onChange={(e) => updateLevel(c.key, l.key, { label: e.target.value })}
                      />
                      <Input
                        aria-label={`Criterion ${ci + 1} level ${li + 1} points`}
                        type="number"
                        min={0}
                        max={100}
                        value={l.points}
                        onChange={(e) => updateLevel(c.key, l.key, { points: Number(e.target.value) })}
                        className="w-20 font-mono"
                      />
                    </div>
                    <Textarea
                      aria-label={`Criterion ${ci + 1} level ${li + 1} description`}
                      placeholder="Description (optional)"
                      value={l.description}
                      onChange={(e) => updateLevel(c.key, l.key, { description: e.target.value })}
                      className="min-h-14 text-sm"
                    />
                    {c.levels.length > 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => update(c.key, { levels: c.levels.filter((x) => x.key !== l.key) })}
                      >
                        Remove level
                      </Button>
                    )}
                  </div>
                ))}
                {c.levels.length < 6 && (
                  <button
                    type="button"
                    onClick={() =>
                      update(c.key, {
                        levels: [...c.levels, { key: k(), label: "", points: 0, description: "" }],
                      })
                    }
                    className="border-line-strong text-muted hover:bg-sunk flex min-h-24 items-center justify-center gap-2 border border-dashed text-sm"
                  >
                    <Plus className="size-4" aria-hidden /> Level
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-4">
          {criteria.length < 20 && (
            <Button
              variant="secondary"
              onClick={() =>
                setCriteria([...criteria, { key: k(), title: "", description: "", levels: defaultLevels() }])
              }
            >
              <Plus className="size-4" aria-hidden /> Add criterion
            </Button>
          )}
          <p className="font-mono text-sm">
            Total <span className="text-lg">{total}</span> points
          </p>
        </div>
      </fieldset>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {!locked && (
        <Button size="lg" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save rubric"}
        </Button>
      )}
    </div>
  );
}
