"use client";

import { useActionState, useState } from "react";
import { inviteAction } from "@/server/actions/invite";
import { initialFormState } from "@/lib/form-state";
import { ROLE_LABELS } from "@/lib/roles";
import type { Role } from "@/generated/prisma/enums";
import { Field, Input, Select } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function InviteForm({
  roles,
  organizations,
  fixedOrganizationId,
}: {
  roles: Role[];
  organizations: { id: string; name: string }[];
  /** When set (Client Manager view), invitees join this company as learners. */
  fixedOrganizationId?: string;
}) {
  const [state, action] = useActionState(inviteAction, initialFormState);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  const [role, setRole] = useState<Role>((v.role as Role) ?? roles[0]!);
  const needsOrg = !fixedOrganizationId && (role === "CLIENT_MANAGER" || role === "LEARNER");

  return (
    <form action={action} className="space-y-5" key={state.ok ? state.message : "form"}>
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" name="fullName" error={e.fullName}>
          {(p) => <Input {...p} autoComplete="off" required defaultValue={v.fullName} />}
        </Field>
        <Field label="Email" name="email" error={e.email}>
          {(p) => (
            <Input {...p} type="email" autoComplete="off" inputMode="email" required defaultValue={v.email} />
          )}
        </Field>
      </div>
      {roles.length > 1 ? (
        <Field label="Role" name="role" error={e.role}>
          {(p) => (
            <Select {...p} value={role} onChange={(ev) => setRole(ev.target.value as Role)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <input type="hidden" name="role" value={roles[0]} />
      )}
      {fixedOrganizationId ? (
        <input type="hidden" name="organizationId" value={fixedOrganizationId} />
      ) : (
        needsOrg && (
          <Field
            label="Company"
            name="organizationId"
            optional={role === "LEARNER"}
            hint={role === "LEARNER" ? "Leave empty for an individual learner." : undefined}
            error={e.organizationId}
          >
            {(p) => (
              <Select {...p} defaultValue={v.organizationId ?? ""} required={role === "CLIENT_MANAGER"}>
                <option value="">
                  {role === "LEARNER" ? "Individual (no company)" : "Choose a company"}
                </option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )
      )}
      {(fixedOrganizationId || role === "LEARNER") && (
        <Field label="Department or site" name="department" optional error={e.department}>
          {(p) => <Input {...p} defaultValue={v.department} />}
        </Field>
      )}
      <SubmitButton pendingLabel="Sending…">Send invitation</SubmitButton>
    </form>
  );
}
