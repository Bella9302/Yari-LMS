export interface FormState {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Echo of submitted values so fields keep their content after a failed submit. */
  values?: Record<string, string>;
}

export const initialFormState: FormState = {};

export function formValues(
  formData: FormData,
  omit: string[] = ["password", "confirmPassword", "currentPassword", "code"],
) {
  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !k.startsWith("$") && !omit.includes(k)) values[k] = v;
  }
  return values;
}

/** Allows only same-site relative paths, to prevent open redirects after login. */
export function safeNextPath(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
