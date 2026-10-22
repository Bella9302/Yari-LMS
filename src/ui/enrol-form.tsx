"use client";

import { useActionState, useMemo, useState } from "react";
import { enrolAction } from "@/server/actions/courses";
import { initialFormState } from "@/lib/form-state";
import { Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

/** Pick people (with a quick filter) and enrol them, with an optional due date. */
export function EnrolForm({
  courseId,
  people,
  organizationId,
  disabledReason,
}: {
  courseId: string;
  people: { id: string; name: string; detail: string }[];
  organizationId?: string;
  disabledReason?: string;
}) {
  const [state, action] = useActionState(enrolAction, initialFormState);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // After a successful enrolment the server sends a new list without those people: drop stale picks.
  const [lastPeople, setLastPeople] = useState(people);
  if (people !== lastPeople) {
    setLastPeople(people);
    setSelected((prev) => new Set([...prev].filter((id) => people.some((p) => p.id === id))));
  }
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? people.filter((p) => `${p.name} ${p.detail}`.toLowerCase().includes(q)) : people;
  }, [filter, people]);

  if (people.length === 0)
    return <p className="text-muted text-sm">Everyone available is already enrolled.</p>;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="courseId" value={courseId} />
      {organizationId && <input type="hidden" name="organizationId" value={organizationId} />}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="userId" value={id} />
      ))}
      {disabledReason && <Notice>{disabledReason}</Notice>}
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <label className="sr-only" htmlFor={`enrol-filter-${courseId}`}>
        Filter people
      </label>
      <Input
        id={`enrol-filter-${courseId}`}
        placeholder="Filter by name or company"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <fieldset>
        <legend className="sr-only">People</legend>
        <ul className="divide-line border-line max-h-72 divide-y overflow-y-auto border">
          {shown.map((p) => (
            <li key={p.id}>
              <label className="hover:bg-sunk flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="size-5 accent-current"
                />
                <span className="min-w-0">
                  <span className="block">{p.name}</span>
                  <span className="text-muted block truncate text-sm">{p.detail}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <Field label="Due date" name="dueAt" optional id={`due-${courseId}`}>
        {(p) => <Input {...p} type="date" className="max-w-48" />}
      </Field>
      <SubmitButton disabled={selected.size === 0} pendingLabel="Enrolling…">
        Enrol {selected.size || ""} {selected.size === 1 ? "person" : "people"}
      </SubmitButton>
    </form>
  );
}
