import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { richTextExtensions, sanitizeRichText } from "@/lib/rich-text";
import { cn } from "@/ui/cn";

/** Renders stored rich text as React elements (no innerHTML), re-sanitised on the way out. */
export function RichTextView({ doc, className }: { doc: unknown; className?: string }) {
  return (
    <div className={cn("prose-yari", className)}>
      {renderToReactElement({ content: sanitizeRichText(doc), extensions: richTextExtensions })}
    </div>
  );
}
