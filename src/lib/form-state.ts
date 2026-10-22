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

/**
 * Allows only same-site relative paths, to prevent open redirects after login. Browsers strip
 * tabs and newlines from URLs and treat "\\" like "/", so "/\t/evil.example" or "/\\evil" would
 * otherwise become "//evil.example". Anything with control characters or backslashes is refused,
 * and the result must resolve to this site.
 */
export function safeNextPath(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string" || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next))
    return fallback;
  const base = "https://same-site.invalid";
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  return url.pathname + url.search + url.hash;
}
