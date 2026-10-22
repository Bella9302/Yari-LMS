"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/guards";
import { attachAssetToItem, setCourseCover } from "@/server/courses/builder";
import { finishUpload, startUpload } from "@/server/storage/assets";
import type { UploadTarget } from "@/server/storage/driver";
import { friendly } from "@/server/actions/errors";

const PURPOSE = z.enum(["item", "cover", "submission", "feedback", "audio"]);

export type StartUploadResult =
  { ok: true; assetId: string; target: UploadTarget } | { ok: false; error: string };

export async function startUploadAction(input: {
  purpose: string;
  courseId: string;
  itemId?: string;
  filename: string;
  mime: string;
  bytes: number;
}): Promise<StartUploadResult> {
  const { user } = await requireUser();
  try {
    const { assetId, target } = await startUpload(
      { id: user.id, roles: user.roles },
      {
        purpose: PURPOSE.parse(input.purpose),
        courseId: String(input.courseId),
        itemId: input.itemId ? String(input.itemId) : undefined,
        filename: String(input.filename),
        mime: String(input.mime),
        bytes: Number(input.bytes),
      },
    );
    return { ok: true, assetId, target };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export type FinishUploadResult =
  | { ok: true; asset: { id: string; filename: string; bytes: number; mime: string } }
  | { ok: false; error: string };

/**
 * Verifies and scans the upload. Item files and cover images are attached here; submission and
 * feedback files are returned to the form, which attaches them when it's submitted.
 */
export async function finishUploadAction(input: {
  purpose: string;
  courseId: string;
  assetId: string;
  itemId?: string;
}): Promise<FinishUploadResult> {
  const { user } = await requireUser();
  const actor = { id: user.id, roles: user.roles };
  const purpose = PURPOSE.parse(input.purpose);
  try {
    const asset = await finishUpload(actor, String(input.assetId));
    if (asset.scanStatus === "INFECTED")
      return { ok: false, error: "This file contains a virus and was deleted." };
    if (asset.scanStatus === "FAILED") {
      return {
        ok: false,
        error: "This file couldn't be checked and was deleted. Make sure it's the right type.",
      };
    }
    if (purpose === "item") await attachAssetToItem(actor, String(input.itemId), asset.id);
    if (purpose === "cover") await setCourseCover(actor, String(input.courseId), asset.id);
    if (purpose === "item" || purpose === "cover")
      revalidatePath(`/teach/courses/${input.courseId}`, "layout");
    return {
      ok: true,
      asset: { id: asset.id, filename: asset.filename, bytes: asset.bytes, mime: asset.mime },
    };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}
