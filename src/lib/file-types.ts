// Which files may be uploaded where. Shared by the browser (to filter the picker) and the server (to enforce).
import type { ItemType } from "@/generated/prisma/enums";

export type UploadPurpose = "item" | "cover" | "submission" | "feedback" | "audio";

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

/** What learners can hand in for an assignment. */
export const SUBMISSION_RULE: FileRule = {
  mimes: [PDF, DOCX, XLSX, PPTX, "text/plain", ...IMAGES],
  accept: ".pdf,.docx,.xlsx,.pptx,.txt,.png,.jpg,.jpeg,.webp",
  maxBytes: 25 * MB,
  label: "PDF, Word, Excel, PowerPoint, text or a photo, up to 25 MB",
};

/** A file a trainer attaches to their feedback. */
export const FEEDBACK_FILE_RULE: FileRule = {
  mimes: [PDF, DOCX, XLSX, ...IMAGES],
  accept: ".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp",
  maxBytes: 25 * MB,
  label: "PDF, Word, Excel or an image, up to 25 MB",
};

/** Short recorded audio notes (MediaRecorder output differs by browser). */
export const AUDIO_RULE: FileRule = {
  mimes: ["audio/webm", "audio/mp4", "audio/ogg"],
  accept: "audio/*",
  maxBytes: 10 * MB,
  label: "An audio note up to 10 MB (about 5 minutes)",
};

/** Types a browser can display inline; everything else is served as a download. */
export const INLINE_MIMES = new Set([PDF, "video/mp4", "video/webm", ...IMAGES, ...AUDIO_RULE.mimes]);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
}
