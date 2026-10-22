// Rich text is stored as Tiptap (ProseMirror) JSON. This whitelist is applied on save so
// only known nodes, marks and safe link targets ever reach storage or the renderer.
import StarterKit from "@tiptap/starter-kit";

export const richTextExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    codeBlock: false,
    code: false,
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      protocols: ["https", "http", "mailto"],
    },
  }),
];

export interface RichNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

const NODES = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "hardBreak",
  "horizontalRule",
]);
const MARKS = new Set(["bold", "italic", "underline", "strike", "link"]);

export function isSafeHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  try {
    return ["https:", "http:", "mailto:"].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

/** Real documents nest a few levels (list > item > paragraph > text); this is generous. */
const MAX_DEPTH = 24;
const MAX_NODES = 20_000;

/**
 * Returns a cleaned copy, dropping anything not on the whitelist. Depth and size are capped so a
 * hand-crafted document can't overflow the stack here or on every later render.
 */
export function sanitizeRichText(input: unknown): RichNode {
  let budget = MAX_NODES;
  const clean = (node: unknown, depth = 0): RichNode | null => {
    if (!node || typeof node !== "object" || depth > MAX_DEPTH || --budget < 0) return null;
    const n = node as RichNode;
    if (!NODES.has(n.type)) return null;
    const out: RichNode = { type: n.type };
    if (n.type === "text") {
      if (typeof n.text !== "string" || !n.text) return null;
      out.text = n.text;
      const marks = (n.marks ?? []).flatMap((m) => {
        if (!MARKS.has(m?.type)) return [];
        if (m.type === "link")
          return isSafeHref(m.attrs?.href) ? [{ type: "link", attrs: { href: m.attrs!.href } }] : [];
        return [{ type: m.type }];
      });
      if (marks.length) out.marks = marks;
      return out;
    }
    if (n.type === "heading") out.attrs = { level: n.attrs?.level === 3 ? 3 : 2 };
    if (n.type === "orderedList" && typeof n.attrs?.start === "number") out.attrs = { start: n.attrs.start };
    if (Array.isArray(n.content))
      out.content = n.content.map((c) => clean(c, depth + 1)).filter((c): c is RichNode => c !== null);
    return out;
  };
  const doc = clean(input);
  return doc?.type === "doc" ? doc : { type: "doc", content: [{ type: "paragraph" }] };
}

export function emptyDoc(): RichNode {
  return { type: "doc", content: [{ type: "paragraph" }] };
}
