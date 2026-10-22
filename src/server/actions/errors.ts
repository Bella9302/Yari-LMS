import "server-only";
import { ValidationError } from "@/server/courses/builder";
import { NotFoundError } from "@/server/courses/access";
import { LockedError } from "@/server/courses/learner";
import { UploadError } from "@/server/storage/assets";
import { PermissionError } from "@/server/pii/users";
import { AssessmentError } from "@/server/assessment/errors";

/** Turns expected domain errors into a message for the form; anything else is a real bug and rethrows. */
export function friendly(err: unknown): string {
  if (
    err instanceof ValidationError ||
    err instanceof UploadError ||
    err instanceof LockedError ||
    err instanceof AssessmentError ||
    err instanceof PermissionError
  ) {
    return err.message;
  }
  if (err instanceof NotFoundError) return "That no longer exists. Reload the page.";
  throw err;
}
