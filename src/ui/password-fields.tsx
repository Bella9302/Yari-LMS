import { Field, Input } from "@/ui/field";

/** New password + confirmation, with the policy shown up front. */
export function NewPasswordFields({ errors }: { errors?: Record<string, string> }) {
  return (
    <>
      <Field
        label="New password"
        name="password"
        hint="At least 12 characters. A short sentence is easy to remember and hard to guess."
        error={errors?.password}
      >
        {(p) => <Input {...p} type="password" autoComplete="new-password" minLength={12} required />}
      </Field>
      <Field label="Confirm new password" name="confirmPassword" error={errors?.confirmPassword}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" required />}
      </Field>
    </>
  );
}
