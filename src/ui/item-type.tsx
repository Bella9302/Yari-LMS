import {
  AlignLeft,
  Download,
  FileText,
  Link2,
  PlayCircle,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import type { ItemType } from "@/generated/prisma/enums";

export const ITEM_TYPE_META: Record<ItemType, { label: string; icon: LucideIcon; hint: string }> = {
  RICH_TEXT: { label: "Text", icon: AlignLeft, hint: "Written content with headings, lists and links" },
  VIDEO: {
    label: "Video",
    icon: PlayCircle,
    hint: "YouTube, Vimeo or Bunny Stream link, or an uploaded file",
  },
  PDF: { label: "PDF", icon: FileText, hint: "A document learners read in the browser" },
  SLIDES: { label: "Slides", icon: Presentation, hint: "A slide deck exported as PDF" },
  LINK: { label: "Link", icon: Link2, hint: "A page on another website" },
  DOWNLOAD: { label: "Download", icon: Download, hint: "A template or form learners save" },
};

export function ItemTypeIcon({ type, className }: { type: ItemType; className?: string }) {
  const Icon = ITEM_TYPE_META[type].icon;
  return <Icon className={className ?? "size-4"} strokeWidth={1.5} aria-hidden />;
}
