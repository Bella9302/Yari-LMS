"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { requireRole } from "@/server/guards";
import { invalidateUserSessions } from "@/server/auth/session";
import { formValues, type FormState } from "@/lib/form-state";

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

const orgSchema = z.object({
  name: z.string().trim().min(2, "Enter the company name.").max(120),
  regNumber: z.string().trim().max(40).optional(),
});

export async function createOrganizationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("SUPER_ADMIN");
  const parsed = orgSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { fieldErrors: { name: parsed.error.issues[0]!.message }, values: formValues(formData) };

  let slug = slugify(parsed.data.name) || "company";
  for (let n = 2; await db.organization.findUnique({ where: { slug } }); n++)
    slug = `${slugify(parsed.data.name)}-${n}`;

  const org = await db.organization.create({
    data: { name: parsed.data.name, slug, regNumber: parsed.data.regNumber || null },
  });
  await audit({
    actorId: user.id,
    action: "org.created",
    entityType: "Organization",
    entityId: org.id,
    orgId: org.id,
  });
  revalidatePath("/admin/organizations");
  return { ok: true, message: `${org.name} created.` };
}

export async function setUserStatusAction(formData: FormData): Promise<void> {
  const { user } = await requireRole("SUPER_ADMIN");
  const userId = String(formData.get("userId"));
  const status = z.enum(["ACTIVE", "SUSPENDED"]).parse(formData.get("status"));
  if (userId === user.id) throw new Error("You can't suspend your own account.");

  const target = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true } });
  if (target.status === "INVITED" || target.status === "DELETED")
    throw new Error("Only active accounts can change.");

  await db.user.update({ where: { id: userId }, data: { status } });
  if (status === "SUSPENDED") await invalidateUserSessions(userId);
  await audit({
    actorId: user.id,
    action: status === "SUSPENDED" ? "user.suspended" : "user.reactivated",
    entityType: "User",
    entityId: userId,
  });
  revalidatePath(`/admin/users/${userId}`);
}

export async function updateDataRequestAction(formData: FormData): Promise<void> {
  const { user } = await requireRole("SUPER_ADMIN");
  const id = String(formData.get("id"));
  const status = z.enum(["IN_PROGRESS", "COMPLETED", "REJECTED"]).parse(formData.get("status"));
  await db.dataRequest.update({
    where: { id },
    data: { status, handledById: user.id, completedAt: status === "IN_PROGRESS" ? null : new Date() },
  });
  await audit({
    actorId: user.id,
    action: "data_request.updated",
    entityType: "DataRequest",
    entityId: id,
    meta: { status },
  });
  revalidatePath("/admin/data-requests");
}
