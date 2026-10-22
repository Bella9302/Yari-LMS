"use client";

import { useActionState, useState } from "react";
import type { SessionMode } from "@/generated/prisma/enums";
import { createSessionAction, updateSessionAction } from "@/server/actions/tracking";
import { initialFormState } from "@/lib/form-state";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export interface SessionFormValues {
  id?: string;
  title: string;
  description: string;
  mode: SessionMode;
  date: string;
  start: string;
  end: string;
  location: string;
  meetingUrl: string;
}

export function SessionForm({ courseId, initial }: { courseId: string; initial?: SessionFormValues }) {
  const [state, action] = useActionState(
    initial?.id ? updateSessionAction : createSessionAction,
    initialFormState,
  );
  const [mode, setMode] = useState<SessionMode>(initial?.mode ?? "IN_PERSON");
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="courseId" value={courseId} />
      {initial?.id && <input type="hidden" name="sessionId" value={initial.id} />}
      <Field label="Title" name="title">
        {(p) => (
          <Input
            {...p}
            required
            maxLength={160}
            defaultValue={initial?.title}
            placeholder="e.g. Practical: harness inspection"
          />
        )}
      </Field>
      <Field label="Where" name="mode">
        {(p) => (
          <Select {...p} value={mode} onChange={(e) => setMode(e.target.value as SessionMode)}>
            <option value="IN_PERSON">In person (learners check in with a QR code)</option>
            <option value="ONLINE">Online (learners join from the app)</option>
            <option value="HYBRID">Both</option>
          </Select>
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Date" name="date">
          {(p) => <Input {...p} type="date" required defaultValue={initial?.date} />}
        </Field>
        <Field label="Starts (SA time)" name="start">
          {(p) => <Input {...p} type="time" required defaultValue={initial?.start ?? "08:00"} />}
        </Field>
        <Field label="Ends" name="end">
          {(p) => <Input {...p} type="time" required defaultValue={initial?.end ?? "12:00"} />}
        </Field>
      </div>
      {mode !== "ONLINE" && (
        <Field label="Venue or site" name="location">
          {(p) => (
            <Input
              {...p}
              maxLength={200}
              defaultValue={initial?.location}
              placeholder="e.g. Acme Mining, Gate 3 training room"
            />
          )}
        </Field>
      )}
      {mode !== "IN_PERSON" && (
        <Field label="Meeting link" name="meetingUrl" hint="Teams, Zoom or Google Meet link (https://…)">
          {(p) => <Input {...p} type="url" inputMode="url" defaultValue={initial?.meetingUrl} />}
        </Field>
      )}
      <Field label="Notes for learners" name="description" optional>
        {(p) => (
          <Textarea
            {...p}
            maxLength={2000}
            defaultValue={initial?.description}
            className="min-h-20"
            placeholder="What to bring, PPE required, parking…"
          />
        )}
      </Field>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      <SubmitButton pendingLabel="Saving…">{initial?.id ? "Save changes" : "Schedule session"}</SubmitButton>
    </form>
  );
}
