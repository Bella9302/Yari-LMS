"use client";

import { useActionState } from "react";
import { postAnnouncementAction } from "@/server/actions/engagement";
import { initialFormState } from "@/lib/form-state";
import { emptyDoc } from "@/lib/rich-text";
import { Checkbox, Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { RichTextEditor } from "@/ui/rich-text-editor";
import { SubmitButton } from "@/ui/submit-button";

export function AnnouncementForm({ courseId, audience }: { courseId: string | null; audience: string }) {
  const [state, action] = useActionState(postAnnouncementAction, initialFormState);
  return (
    <form action={action} className="space-y-5" key={state.ok ? state.message : "form"}>
      {courseId && <input type="hidden" name="courseId" value={courseId} />}
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Title" name="title">
        {(p) => <Input {...p} required maxLength={160} />}
      </Field>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Message</p>
        <RichTextEditor name="body" initial={emptyDoc()} label="Announcement message" />
      </div>
      <div className="space-y-1">
        <Checkbox name="email" defaultChecked label={`Also email ${audience}`} />
        <Checkbox name="pinned" label="Pin to the top" />
      </div>
      <SubmitButton pendingLabel="Posting…">Post announcement</SubmitButton>
    </form>
  );
}
