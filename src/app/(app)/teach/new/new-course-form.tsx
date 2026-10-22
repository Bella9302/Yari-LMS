"use client";

import { useActionState, useState } from "react";
import type { CourseCategory } from "@/generated/prisma/enums";
import { createCourseAction } from "@/server/actions/courses";
import { initialFormState } from "@/lib/form-state";
import { Checkbox, Field, Input } from "@/ui/field";
import { CategoryTag, Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";
import { cn } from "@/ui/cn";

interface TemplateOption {
  id: string;
  title: string;
  summary: string;
  category: CourseCategory;
  modules: number;
}

export function NewCourseForm({
  templates,
  canMakeTemplate,
}: {
  templates: TemplateOption[];
  canMakeTemplate: boolean;
}) {
  const [state, action] = useActionState(createCourseAction, initialFormState);
  const v = state.values ?? {};
  const [templateId, setTemplateId] = useState(v.templateId ?? "");
  const [category, setCategory] = useState<CourseCategory>((v.category as CourseCategory) ?? "HEALTH_SAFETY");

  const choose = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) setCategory(t.category);
  };

  const option =
    "flex cursor-pointer gap-3 border border-line p-4 has-[:checked]:border-fg has-[:checked]:bg-surface has-[:focus-visible]:outline-2";

  return (
    <form action={action} className="space-y-8">
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <fieldset className="space-y-3">
        <legend className="eyebrow mb-3">Start from</legend>
        <label className={option}>
          <input
            type="radio"
            name="templateId"
            value=""
            checked={templateId === ""}
            onChange={() => choose("")}
            className="mt-1 size-4 accent-current"
          />
          <span>
            <span className="font-medium">A blank course</span>
            <span className="text-muted block text-sm">One empty module to build on.</span>
          </span>
        </label>
        {templates.map((t) => (
          <label
            key={t.id}
            className={option}
            data-category={t.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
          >
            <input
              type="radio"
              name="templateId"
              value={t.id}
              checked={templateId === t.id}
              onChange={() => choose(t.id)}
              className="mt-1 size-4 accent-current"
            />
            <span>
              <CategoryTag category={t.category} />
              <span className="mt-1 block font-medium">{t.title}</span>
              <span className="text-muted block text-sm">
                {t.summary} {t.modules} modules.
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <Field label="Course title" name="title" error={state.fieldErrors?.title}>
        {(p) => (
          <Input
            {...p}
            required
            maxLength={120}
            defaultValue={v.title}
            placeholder="e.g. SHE Rep Training — Acme Mining"
          />
        )}
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Category</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["HEALTH_SAFETY", "Health & Safety"],
              ["AI_DIGITAL", "AI & Digital"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              data-category={value === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
              className={cn(
                "border-line-strong flex min-h-11 cursor-pointer items-center justify-center gap-2 border px-3 text-sm",
                "has-[:checked]:border-fg has-[:checked]:bg-accent has-[:checked]:text-ink has-[:focus-visible]:outline-2",
              )}
            >
              <input
                type="radio"
                name="category"
                value={value}
                checked={category === value}
                onChange={() => setCategory(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {canMakeTemplate && templateId === "" && (
        <Checkbox
          name="isTemplate"
          defaultChecked={v.isTemplate === "on"}
          label="Make this a template for other trainers"
        />
      )}

      <SubmitButton size="lg" pendingLabel="Creating…">
        Create course
      </SubmitButton>
    </form>
  );
}
