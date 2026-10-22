"use client";

import { useActionState, useState } from "react";
import { addRuleAction } from "@/server/actions/courses";
import { initialFormState } from "@/lib/form-state";
import { Field, Input, Select } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function RuleForm({
  courseId,
  target,
  itemOptions,
}: {
  courseId: string;
  target: { moduleId: string } | { itemId: string };
  itemOptions: { module: string; items: { id: string; title: string }[] }[];
}) {
  const [state, action] = useActionState(addRuleAction, initialFormState);
  const [type, setType] = useState<"AFTER_DATE" | "ITEM_COMPLETED">("ITEM_COMPLETED");
  const key = "moduleId" in target ? target.moduleId : target.itemId;
  return (
    <form
      action={action}
      className="border-line grid gap-3 border-t border-dashed pt-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end"
    >
      <input type="hidden" name="courseId" value={courseId} />
      {"moduleId" in target ? (
        <input type="hidden" name="moduleId" value={target.moduleId} />
      ) : (
        <input type="hidden" name="itemId" value={target.itemId} />
      )}
      <Field label="Add a condition" name="type" id={`rule-type-${key}`}>
        {(p) => (
          <Select {...p} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="ITEM_COMPLETED">After an item is completed</option>
            <option value="AFTER_DATE">From a date</option>
          </Select>
        )}
      </Field>
      {type === "AFTER_DATE" ? (
        <Field label="Opens at (SA time)" name="afterDate" id={`rule-date-${key}`}>
          {(p) => <Input {...p} type="datetime-local" required />}
        </Field>
      ) : (
        <Field label="Item" name="dependsOnItemId" id={`rule-dep-${key}`}>
          {(p) => (
            <Select {...p} required defaultValue="">
              <option value="" disabled>
                Choose an item
              </option>
              {itemOptions.map((g) => (
                <optgroup key={g.module} label={g.module}>
                  {g.items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          )}
        </Field>
      )}
      <SubmitButton variant="secondary" pendingLabel="Adding…">
        Add
      </SubmitButton>
      {state.error && (
        <Notice tone="danger" className="sm:col-span-3">
          {state.error}
        </Notice>
      )}
    </form>
  );
}
