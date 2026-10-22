"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "@/server/env";
import { requireUser } from "@/server/guards";
import { getOwnIdentity, inviteUser, INVITE_DAYS, PermissionError } from "@/server/pii/users";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import { sendEmail } from "@/server/email/send";
import { escapeHtml, inviteEmail } from "@/server/email/templates";
import { formValues, type FormState } from "@/lib/form-state";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  fullName: z.string().trim().min(2, "Enter their full name.").max(120),
  role: z.enum(["SUPER_ADMIN", "TRAINER", "LEARNER", "CLIENT_MANAGER"]),
  organizationId: z.string().optional(),
  department: z.string().trim().max(80).optional(),
});

/** Used by Super Admins (any role) and Client Managers (learners for their company). */
export async function inviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const values = formValues(formData);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors, values };
  }
  if (!(await consumeRateLimit(`invite:${user.id}`, 100, 60 * 60 * 1000))) {
    return { error: "You've sent a lot of invitations in the last hour. Please try again later.", values };
  }

  try {
    const result = await inviteUser({ id: user.id, roles: user.roles }, parsed.data);
    const inviter = await getOwnIdentity(user.id);
    if (result.kind === "invited") {
      await sendEmail(
        inviteEmail({
          to: parsed.data.email,
          name: parsed.data.fullName,
          url: `${env().APP_URL}/invite/${result.token}`,
          invitedBy: inviter.fullName,
          expiresDays: INVITE_DAYS,
        }),
      );
    } else {
      await sendEmail({
        to: parsed.data.email,
        subject: "You've been added on YARI Academy",
        text: `${inviter.fullName} has added you on YARI Academy. Sign in at ${env().APP_URL}/login to see what's new.`,
        html: `<p>${escapeHtml(inviter.fullName)} has added you on YARI Academy.</p><p><a href="${env().APP_URL}/login">Sign in</a> to see what's new.</p>`,
      });
    }
  } catch (err) {
    if (err instanceof PermissionError) return { error: err.message, values };
    throw err;
  }

  revalidatePath("/admin/users");
  revalidatePath("/org");
  // Same message whether or not the person already had an account (no account enumeration).
  return { ok: true, message: `Invitation sent to ${parsed.data.email}.` };
}
