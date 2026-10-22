"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/server/guards";
import { clientIp } from "@/server/audit";
import { friendly } from "@/server/actions/errors";
import { reissueCertificate, revokeCertificate } from "@/server/certificates/service";
import { setCourseAccreditation } from "@/server/certificates/course-accreditation";
import { deleteEnquiry, EnquiryRejected, setEnquiryStatus, submitEnquiry } from "@/server/public/enquiries";
import { updateSettings } from "@/server/settings";
import { formValues, type FormState } from "@/lib/form-state";

function fieldErrors(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

async function admin() {
  const { user } = await requireRole("SUPER_ADMIN");
  return { id: user.id, roles: user.roles };
}

// ---------------------------------------------------------------------------
// Public enquiry form (no sign-in)
// ---------------------------------------------------------------------------

export async function submitEnquiryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  // Honeypot: people never see this field, so anything in it came from a bot. Look successful.
  if (String(formData.get("website") ?? "")) return { ok: true };
  try {
    await submitEnquiry({ ...values, consent: formData.get("consent") === "on" }, await clientIp());
  } catch (err) {
    if (err instanceof z.ZodError)
      return { error: "Please check the highlighted fields.", fieldErrors: fieldErrors(err), values };
    if (err instanceof EnquiryRejected) return { error: err.message, values };
    throw err;
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export async function revokeCertificateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await revokeCertificate(
      await admin(),
      String(formData.get("code")),
      String(formData.get("reason") ?? ""),
    );
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath("/admin/certificates");
  return { ok: true, message: "Revoked. The code no longer verifies." };
}

export async function reissueCertificateAction(formData: FormData): Promise<void> {
  const cert = await reissueCertificate(await admin(), String(formData.get("code")));
  redirect(`/admin/certificates?q=${cert.code}`);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function updateSiteSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    await updateSettings(await admin(), "site", values);
  } catch (err) {
    if (err instanceof z.ZodError)
      return { error: "Please check the highlighted fields.", fieldErrors: fieldErrors(err), values };
    throw err;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function updateAccreditationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const enabled = formData.get("enabled") === "on";
  if (enabled && formData.get("confirm") !== "on") {
    return { error: "Confirm that YARI GROUP holds this accreditation before switching it on.", values };
  }
  try {
    await updateSettings(await admin(), "accreditation", {
      enabled,
      body: values.body ?? "",
      providerNumber: values.providerNumber ?? "",
    });
  } catch (err) {
    if (err instanceof z.ZodError)
      return { error: "Please check the highlighted fields.", fieldErrors: fieldErrors(err), values };
    throw err;
  }
  revalidatePath("/admin/settings");
  return {
    ok: true,
    message: enabled
      ? "Accreditation is on. New certificates for courses with unit standards will show it."
      : "Saved. Certificates stay unaccredited.",
  };
}

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------

export async function setEnquiryStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const status = z.enum(["NEW", "CONTACTED", "CLOSED"]).parse(formData.get("status"));
  await setEnquiryStatus(await admin(), id, status);
  revalidatePath(`/admin/enquiries/${id}`);
  revalidatePath("/admin/enquiries");
}

export async function deleteEnquiryAction(formData: FormData): Promise<void> {
  await deleteEnquiry(await admin(), String(formData.get("id")));
  redirect("/admin/enquiries");
}

export async function setCourseAccreditationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  const values = formValues(formData);
  try {
    await setCourseAccreditation(await admin(), courseId, {
      unitStandards: values.unitStandards ?? "",
      nqfLevel: values.nqfLevel ?? "",
      credits: values.credits ?? "",
    });
  } catch (err) {
    return { error: friendly(err), values };
  }
  revalidatePath(`/teach/courses/${courseId}/settings`);
  return { ok: true, message: "Saved. New certificates for this course will show these details." };
}
