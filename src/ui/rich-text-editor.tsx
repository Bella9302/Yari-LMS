"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { richTextExtensions, type RichNode } from "@/lib/rich-text";
import { cn } from "@/ui/cn";

/** Tiptap editor that keeps its JSON in a hidden form field named `name`. */
export function RichTextEditor({ name, initial, label }: { name: string; initial: RichNode; label: string }) {
  const [json, setJson] = useState(() => JSON.stringify(initial));
  const editor = useEditor({
    extensions: richTextExtensions,
    content: initial,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose-yari min-h-64 px-4 py-4 focus:outline-none",
        "aria-label": label,
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor }) => setJson(JSON.stringify(editor.getJSON())),
  });

  return (
    <div className="border-line-strong bg-surface focus-within:border-fg rounded-sm border">
      <input type="hidden" name={name} value={json} />
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      ul: e.isActive("bulletList"),
      ol: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();
  const buttons = [
    { label: "Bold", icon: Bold, active: s.bold, run: () => chain().toggleBold().run() },
    { label: "Italic", icon: Italic, active: s.italic, run: () => chain().toggleItalic().run() },
    { label: "Underline", icon: Underline, active: s.underline, run: () => chain().toggleUnderline().run() },
    { label: "Heading", icon: Heading2, active: s.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
    {
      label: "Subheading",
      icon: Heading3,
      active: s.h3,
      run: () => chain().toggleHeading({ level: 3 }).run(),
    },
    { label: "Bullet list", icon: List, active: s.ul, run: () => chain().toggleBulletList().run() },
    { label: "Numbered list", icon: ListOrdered, active: s.ol, run: () => chain().toggleOrderedList().run() },
    { label: "Quote", icon: Quote, active: s.quote, run: () => chain().toggleBlockquote().run() },
    {
      label: s.link ? "Remove link" : "Add link",
      icon: Link2,
      active: s.link,
      run: () => {
        if (s.link) return chain().unsetLink().run();
        const href = window.prompt("Link address (https://…)");
        if (href) chain().extendMarkRange("link").setLink({ href }).run();
      },
    },
  ];

  return (
    <div role="toolbar" aria-label="Formatting" className="border-line flex flex-wrap gap-0.5 border-b p-1">
      {buttons.map((b) => (
        <button
          key={b.label}
          type="button"
          onClick={b.run}
          aria-label={b.label}
          aria-pressed={b.active}
          className={cn(
            "hover:bg-sunk inline-grid size-10 place-items-center rounded-sm",
            b.active && "bg-inverse text-on-inverse hover:bg-inverse",
          )}
        >
          <b.icon className="size-4" strokeWidth={1.75} />
        </button>
      ))}
      <span className="bg-line mx-1 w-px self-stretch" aria-hidden />
      <button
        type="button"
        onClick={() => chain().undo().run()}
        disabled={!s.canUndo}
        aria-label="Undo"
        className="hover:bg-sunk inline-grid size-10 place-items-center rounded-sm disabled:opacity-40"
      >
        <Undo2 className="size-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={() => chain().redo().run()}
        disabled={!s.canRedo}
        aria-label="Redo"
        className="hover:bg-sunk inline-grid size-10 place-items-center rounded-sm disabled:opacity-40"
      >
        <Redo2 className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
