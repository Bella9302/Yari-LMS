"use client";

import { useActionState } from "react";
import type { ShowAnswers } from "@/generated/prisma/enums";
import {
  addQuizSectionAction,
  removeQuizSectionAction,
  updateAssignmentSettingsAction,
  updateQuizSettingsAction,
} from "@/server/actions/assessment";
import { initialFormState } from "@/lib/form-state";
import { Checkbox, Field, Input, Select, Textarea } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export interface QuizSettingsData {
  instructions: string;
  passPct: number;
  timeLimitMin: number | null;
  maxAttempts: number | null;
  shuffle: boolean;
  showAnswers: ShowAnswers;
}

export function QuizSettingsForm({
  courseId,
  itemId,
  quiz,
}: {
  courseId: string;
  itemId: string;
  quiz: QuizSettingsData;
}) {
  const [state, action] = useActionState(updateQuizSettingsAction, initialFormState);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="itemId" value={itemId} />
      <Field label="Instructions" name="instructions" optional>
        {(p) => <Textarea {...p} maxLength={2000} defaultValue={quiz.instructions} className="min-h-20" />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Pass mark (%)" name="passPct">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              max={100}
              defaultValue={quiz.passPct}
              required
              className="font-mono"
            />
          )}
        </Field>
        <Field label="Attempts allowed" name="maxAttempts" hint="Empty = unlimited">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              max={50}
              defaultValue={quiz.maxAttempts ?? ""}
              className="font-mono"
            />
          )}
        </Field>
        <Field label="Time limit (min)" name="timeLimitMin" hint="Empty = no limit">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              max={600}
              defaultValue={quiz.timeLimitMin ?? ""}
              className="font-mono"
            />
          )}
        </Field>
      </div>
      <Field label="Show correct answers" name="showAnswers">
        {(p) => (
          <Select {...p} defaultValue={quiz.showAnswers}>
            <option value="AFTER_SUBMIT">After each attempt</option>
            <option value="AFTER_PASS">Only once the learner has passed</option>
            <option value="NEVER">Never</option>
          </Select>
        )}
      </Field>
      <Checkbox
        name="shuffle"
        defaultChecked={quiz.shuffle}
        label="Shuffle questions and answer options for each attempt"
      />
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Save quiz settings
      </SubmitButton>
    </form>
  );
}

export function QuizSections({
  courseId,
  itemId,
  sections,
  banks,
  total,
}: {
  courseId: string;
  itemId: string;
  sections: { id: string; bankTitle: string; drawCount: number | null; available: number }[];
  banks: { id: string; title: string; count: number }[];
  total: number;
}) {
  const [state, action] = useActionState(addQuizSectionAction, initialFormState);
  return (
    <div className="space-y-4">
      {sections.length > 0 ? (
        <ul className="divide-line border-line divide-y border-y">
          {sections.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="flex-1">
                {s.drawCount ? `${s.drawCount} random` : `All ${s.available}`} from{" "}
                <strong className="font-medium">{s.bankTitle}</strong>
              </span>
              <form action={removeQuizSectionAction}>
                <input type="hidden" name="courseId" value={courseId} />
                <input type="hidden" name="sectionId" value={s.id} />
                <SubmitButton variant="ghost" size="sm" aria-label={`Remove ${s.bankTitle}`}>
                  Remove
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted text-sm">No questions yet. Add a question bank below.</p>
      )}
      <p className="font-mono text-sm">
        Each attempt: <strong>{total}</strong> question{total === 1 ? "" : "s"}
      </p>
      {banks.length === 0 ? (
        <Notice>
          Create a question bank first (the{" "}
          <a href={`/teach/courses/${courseId}/questions`} className="underline">
            Questions
          </a>{" "}
          tab).
        </Notice>
      ) : (
        <form action={action} className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="itemId" value={itemId} />
          <Field label="Question bank" name="bankId">
            {(p) => (
              <Select {...p} required defaultValue="">
                <option value="" disabled>
                  Choose a bank
                </option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} ({b.count})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Draw" name="drawCount" hint="Empty = all">
            {(p) => <Input {...p} type="number" min={1} className="font-mono" />}
          </Field>
          <SubmitButton variant="secondary" pendingLabel="Adding…">
            Add
          </SubmitButton>
          {state.error && (
            <Notice tone="danger" className="sm:col-span-3">
              {state.error}
            </Notice>
          )}
        </form>
      )}
    </div>
  );
}

export interface AssignmentSettingsData {
  dueAt: string;
  allowText: boolean;
  allowFiles: boolean;
  maxFiles: number;
  maxPoints: number;
  passPct: number;
  rubricId: string | null;
  allowLate: boolean;
}

export function AssignmentSettingsForm({
  courseId,
  itemId,
  data,
  rubrics,
}: {
  courseId: string;
  itemId: string;
  data: AssignmentSettingsData;
  rubrics: { id: string; title: string; total: number }[];
}) {
  const [state, action] = useActionState(updateAssignmentSettingsAction, initialFormState);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="itemId" value={itemId} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Due (SA time)" name="dueAt" optional>
          {(p) => <Input {...p} type="datetime-local" defaultValue={data.dueAt} />}
        </Field>
        <Field label="Pass mark (%)" name="passPct">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              max={100}
              defaultValue={data.passPct}
              required
              className="font-mono"
            />
          )}
        </Field>
      </div>
      <Field label="Mark with" name="rubricId" hint="A rubric sets the total marks automatically.">
        {(p) => (
          <Select {...p} defaultValue={data.rubricId ?? ""}>
            <option value="">A simple mark out of a total</option>
            {rubrics.map((r) => (
              <option key={r.id} value={r.id}>
                Rubric: {r.title} ({r.total} pts)
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Total marks (without a rubric)" name="maxPoints">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              max={1000}
              defaultValue={data.maxPoints}
              className="font-mono"
            />
          )}
        </Field>
        <Field label="Files per submission" name="maxFiles">
          {(p) => (
            <Input {...p} type="number" min={1} max={10} defaultValue={data.maxFiles} className="font-mono" />
          )}
        </Field>
      </div>
      <div className="space-y-1">
        <Checkbox name="allowText" defaultChecked={data.allowText} label="Learners can type an answer" />
        <Checkbox
          name="allowFiles"
          defaultChecked={data.allowFiles}
          label="Learners can upload files (documents or photos)"
        />
        <Checkbox
          name="allowLate"
          defaultChecked={data.allowLate}
          label="Accept late work (it's flagged as late)"
        />
      </div>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Save assignment settings
      </SubmitButton>
    </form>
  );
}
