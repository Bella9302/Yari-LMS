"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { requireUser } from "@/server/guards";
import { respondToCompanyInvitation, updateProfile } from "@/server/pii/users";
import { formValues, type FormState } from "@/lib/form-state";
import { PRIVACY_VERSION } from "@/lib/policies";

const profileSchema = z.object({
  preferredName: z.string().trim().max(60).optional(),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^$|^\+?[0-9 ()-]{9,20}$/, "Enter a valid phone number.")
    .optional(),
});

/** Learners can update contact details; legal name and ID changes go through an administrator. */
export async function updateOwnProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: { [String(parsed.error.issues[0]!.path[0])]: parsed.error.issues[0]!.message },
      values: formValues(formData),
    };
  }
  await updateProfile({ id: user.id, roles: user.roles }, user.id, {
    preferredName: parsed.data.preferredName || null,
    phone: parsed.data.phone || null,
  });
  revalidatePath("/account");
  return { ok: true, message: "Saved." };
}

export async function setMarketingConsentAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const enabled = formData.get("enabled") === "true";
  const current = await db.consent.findFirst({
    where: { userId: user.id, purpose: "MARKETING", withdrawnAt: null },
  });
  if (enabled && !current) {
    await db.consent.create({
      data: { userId: user.id, purpose: "MARKETING", policyVersion: PRIVACY_VERSION },
    });
    await audit({
      actorId: user.id,
      action: "consent.granted",
      entityType: "User",
      entityId: user.id,
      meta: { purpose: "MARKETING" },
    });
  } else if (!enabled && current) {
    await db.consent.update({ where: { id: current.id }, data: { withdrawnAt: new Date() } });
    await audit({
      actorId: user.id,
      action: "consent.withdrawn",
      entityType: "User",
      entityId: user.id,
      meta: { purpose: "MARKETING" },
    });
  }
  revalidatePath("/account/privacy");
}

export async function createDataRequestAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const type = z.enum(["EXPORT", "DELETE"]).parse(formData.get("type"));
  const open = await db.dataRequest.findFirst({
    where: { userId: user.id, type, status: { in: ["PENDING", "IN_PROGRESS"] } },
  });
  if (!open) {
    const note =
      String(formData.get("note") ?? "")
        .trim()
        .slice(0, 500) || null;
    const req = await db.dataRequest.create({ data: { userId: user.id, type, note } });
    await audit({
      actorId: user.id,
      action: "data_request.created",
      entityType: "DataRequest",
      entityId: req.id,
      meta: { type },
    });
  }
  revalidatePath("/account/privacy");
}

export async function respondCompanyInvitationAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  await respondToCompanyInvitation(
    { id: user.id, roles: user.roles },
    String(formData.get("id")),
    formData.get("accept") === "true",
  );
  revalidatePath("/", "layout");
}
