// Which files may be uploaded where. Shared by the browser (to filter the picker) and the server (to enforce).
import type { ItemType } from "@/generated/prisma/enums";

export type UploadPurpose = "item" | "cover";

export interface FileRule {
  mimes: string[];
  /** Shown in the file picker's accept attribute. */
  accept: string;
  maxBytes: number;
  label: string;
}

const MB = 1024 * 1024;

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const IMAGES = ["image/png", "image/jpeg", "image/webp"];

export const ITEM_FILE_RULES: Partial<Record<ItemType, FileRule>> = {
  PDF: { mimes: [PDF], accept: ".pdf", maxBytes: 50 * MB, label: "PDF, up to 50 MB" },
  SLIDES: { mimes: [PDF], accept: ".pdf", maxBytes: 50 * MB, label: "Slides exported as PDF, up to 50 MB" },
  DOWNLOAD: {
    mimes: [PDF, DOCX, XLSX, PPTX, "text/csv", "text/plain", ...IMAGES],
    accept: ".pdf,.docx,.xlsx,.pptx,.csv,.txt,.png,.jpg,.jpeg,.webp",
    maxBytes: 50 * MB,
    label: "PDF, Word, Excel, PowerPoint, CSV, text or image, up to 50 MB",
  },
  VIDEO: {
    mimes: ["video/mp4", "video/webm"],
    accept: ".mp4,.webm",
    maxBytes: 500 * MB,
    label: "MP4 or WebM, up to 500 MB",
  },
};

export const COVER_RULE: FileRule = {
  mimes: IMAGES,
  accept: ".png,.jpg,.jpeg,.webp",
  maxBytes: 5 * MB,
  label: "PNG, JPEG or WebP, up to 5 MB",
};

/** Types a browser can display inline; everything else is served as a download. */
export const INLINE_MIMES = new Set([PDF, "video/mp4", "video/webm", ...IMAGES]);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
}
