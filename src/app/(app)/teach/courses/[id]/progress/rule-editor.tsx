"use client";

import { useActionState } from "react";
import type { AtRiskType } from "@/generated/prisma/enums";
import { saveRuleAction } from "@/server/actions/tracking";
import { initialFormState } from "@/lib/form-state";
import { Checkbox, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function RuleEditor({
  courseId,
  type,
  info,
  threshold,
  active,
}: {
  courseId: string;
  type: AtRiskType;
  info: { label: string; unit: string; help: string };
  threshold: number;
  active: boolean;
}) {
  const [state, action] = useActionState(saveRuleAction, initialFormState);
  return (
    <form action={action} className="border-line bg-surface flex flex-col gap-3 border p-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="type" value={type} />
      <Checkbox
        name="active"
        defaultChecked={active}
        label={<strong className="font-medium">{info.label}</strong>}
      />
      <p className="text-muted flex-1 text-sm">{info.help}</p>
      <label className="flex items-center gap-2 text-sm">
        <Input
          name="threshold"
          type="number"
          min={0}
          max={type === "SCORE_BELOW" ? 100 : 365}
          defaultValue={threshold}
          aria-label={`${info.label} threshold`}
          className="w-24 font-mono"
        />
        {info.unit}
      </label>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      {state.ok && <p className="text-success text-sm">{state.message}</p>}
      <SubmitButton variant="secondary" size="sm" className="self-start" pendingLabel="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
