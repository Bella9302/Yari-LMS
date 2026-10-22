"use client";

import { useActionState, useState } from "react";
import { createThreadAction, editPostAction, replyAction } from "@/server/actions/engagement";
import { initialFormState } from "@/lib/form-state";
import { Button } from "@/ui/button";
import { Field, Input, Textarea } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function NewThreadForm({ courseId, slug }: { courseId: string; slug: string }) {
  const [state, action] = useActionState(createThreadAction, initialFormState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="slug" value={slug} />
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Topic" name="title">
        {(p) => <Input {...p} required minLength={3} maxLength={160} defaultValue={state.values?.title} />}
      </Field>
      <Field label="Your question or comment" name="body">
        {(p) => <Textarea {...p} required maxLength={10000} rows={5} defaultValue={state.values?.body} />}
      </Field>
      <SubmitButton pendingLabel="Posting…">Start discussion</SubmitButton>
    </form>
  );
}

export function ReplyForm({ threadId, slug }: { threadId: string; slug: string }) {
  const [state, action] = useActionState(replyAction, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="slug" value={slug} />
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Reply" name="body">
        {(p) => <Textarea {...p} required maxLength={10000} rows={4} defaultValue={state.values?.body} />}
      </Field>
      <SubmitButton pendingLabel="Posting…">Post reply</SubmitButton>
    </form>
  );
}

export function EditPost({ postId, body, back }: { postId: string; body: string; back: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(async (prev: typeof initialFormState, fd: FormData) => {
    const next = await editPostAction(prev, fd);
    if (next.ok) setOpen(false);
    return next;
  }, initialFormState);
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
    );
  }
  return (
    <form action={action} className="mt-3 w-full space-y-3">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="back" value={back} />
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Edit your post" name="body" id={`edit-${postId}`}>
        {(p) => <Textarea {...p} required maxLength={10000} rows={4} defaultValue={body} />}
      </Field>
      <div className="flex gap-3">
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save
        </SubmitButton>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
