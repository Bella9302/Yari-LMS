"use server";

import { notify } from "@/server/engagement/notifications";

import { db } from "@/server/db";

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
    } else if (result.kind === "pending-acceptance") {
      const org = await db.organization.findUniqueOrThrow({
        where: { id: parsed.data.organizationId! },
        select: { name: true },
      });
      await notify([result.userId], {
        type: "COMPANY_INVITE",
        title: `${org.name} would like to add you to its team`,
        href: "/account",
      });
      const url = result.token ? `${env().APP_URL}/invite/${result.token}` : `${env().APP_URL}/account`;
      await sendEmail({
        to: parsed.data.email,
        subject: `${org.name} would like to add you on YARI Academy`,
        text: `${org.name} would like to add you to its team on YARI Academy, so it can enrol you on training and see your progress on courses it arranges.\n\nNothing is shared until you accept. Sign in to accept or decline: ${url}`,
        html: `<p>${escapeHtml(org.name)} would like to add you to its team on YARI Academy, so it can enrol you on training and see your progress on courses it arranges.</p><p>Nothing is shared until you accept. <a href="${url}">Sign in to accept or decline</a>.</p>`,
      });
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
  revalidatePath("/org", "layout");
  // Same message whether or not the person already had an account (no account enumeration).
  return { ok: true, message: `Invitation sent to ${parsed.data.email}.` };
}
