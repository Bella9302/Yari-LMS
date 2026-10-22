"use client";

import { useActionState } from "react";
import type { ItemType } from "@/generated/prisma/enums";
import { deleteItemAction, updateItemAction } from "@/server/actions/courses";
import { initialFormState } from "@/lib/form-state";
import type { RichNode } from "@/lib/rich-text";
import { Checkbox, Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { RichTextEditor } from "@/ui/rich-text-editor";
import { SubmitButton } from "@/ui/submit-button";

export interface EditableItem {
  id: string;
  type: ItemType;
  title: string;
  required: boolean;
  published: boolean;
  estMinutes: number | null;
  externalUrl: string | null;
  body: RichNode | null;
}

export function ItemForm({ courseId, item }: { courseId: string; item: EditableItem }) {
  const [state, action] = useActionState(updateItemAction, initialFormState);
  const v = state.values;
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="itemId" value={item.id} />
      <Field label="Title" name="title">
        {(p) => (
          <Input
            {...p}
            required
            maxLength={160}
            defaultValue={v?.title ?? item.title}
            className="font-display text-xl"
          />
        )}
      </Field>

      {item.body && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium" id="body-label">
            {item.type === "ASSIGNMENT" ? "Instructions" : "Content"}
          </p>
          <RichTextEditor
            name="body"
            initial={item.body}
            label={item.type === "ASSIGNMENT" ? "Assignment instructions" : "Item content"}
          />
        </div>
      )}

      {(item.type === "LINK" || item.type === "VIDEO") && (
        <Field
          label={item.type === "LINK" ? "Web address" : "Video link"}
          name="externalUrl"
          optional={item.type === "VIDEO"}
          hint={
            item.type === "VIDEO"
              ? "Paste a YouTube, Vimeo or Bunny Stream link."
              : "Must start with https://"
          }
        >
          {(p) => (
            <Input
              {...p}
              type="url"
              inputMode="url"
              placeholder="https://"
              defaultValue={v?.externalUrl ?? item.externalUrl ?? ""}
            />
          )}
        </Field>
      )}

      <div className="border-line grid gap-4 border-t pt-6 sm:grid-cols-2">
        <div className="space-y-1">
          <Checkbox
            name="published"
            defaultChecked={v ? v.published === "on" : item.published}
            label={
              <>
                <strong className="font-medium">Visible to learners</strong>
                <span className="text-muted block text-sm">Hidden items are only seen by trainers.</span>
              </>
            }
          />
          <Checkbox
            name="required"
            defaultChecked={v ? v.required === "on" : item.required}
            label={
              <>
                <strong className="font-medium">Required for completion</strong>
                <span className="text-muted block text-sm">
                  Optional items don&apos;t count towards progress.
                </span>
              </>
            }
          />
        </div>
        <Field label="Estimated time (minutes)" name="estMinutes" optional>
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              defaultValue={v?.estMinutes ?? item.estMinutes ?? ""}
              className="max-w-32 font-mono"
            />
          )}
        </Field>
      </div>

      {state.error && <Notice tone="danger">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      <SubmitButton size="lg" pendingLabel="Saving…">
        Save item
      </SubmitButton>
    </form>
  );
}

export function DeleteItemForm({ courseId, itemId }: { courseId: string; itemId: string }) {
  const [state, action] = useActionState(deleteItemAction, initialFormState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this item? Learners' progress on it will be lost.")) e.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="itemId" value={itemId} />
      <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
        Delete item
      </SubmitButton>
      {state.error && <p className="text-danger text-sm">{state.error}</p>}
    </form>
  );
}
