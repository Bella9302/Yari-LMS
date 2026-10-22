import { describe, expect, it } from "vitest";
import { createsCycle, evaluateRules, progressPercent, type ProgressLike } from "@/server/courses/release";
import { parseVideoEmbed } from "@/lib/video-embed";
import { sanitizeRichText } from "@/lib/rich-text";
import { contentMatchesType } from "@/server/storage/sniff";

const now = new Date("2026-11-01T10:00:00Z");
const titles = new Map([
  ["a", "Intro"],
  ["q", "Quiz 1"],
]);

describe("release rules", () => {
  it("locks until a date", () => {
    const rule = {
      type: "AFTER_DATE" as const,
      afterDate: new Date("2026-11-02T08:00:00Z"),
      dependsOnItemId: null,
      minScorePct: null,
    };
    const locked = evaluateRules([rule], new Map(), titles, now);
    expect(locked.unlocked).toBe(false);
    expect(locked.reasons[0]).toBe("Opens 02 Nov, 10:00");
    expect(evaluateRules([rule], new Map(), titles, new Date("2026-11-03")).unlocked).toBe(true);
  });

  it("locks until another item is completed", () => {
    const rule = {
      type: "ITEM_COMPLETED" as const,
      afterDate: null,
      dependsOnItemId: "a",
      minScorePct: null,
    };
    expect(evaluateRules([rule], new Map(), titles, now).reasons).toEqual(["Complete “Intro” first"]);
    const progress = new Map<string, ProgressLike>([["a", { status: "IN_PROGRESS", scorePct: null }]]);
    expect(evaluateRules([rule], progress, titles, now).unlocked).toBe(false);
    progress.set("a", { status: "COMPLETED", scorePct: null });
    expect(evaluateRules([rule], progress, titles, now).unlocked).toBe(true);
  });

  it("locks until a minimum score", () => {
    const rule = { type: "MIN_SCORE" as const, afterDate: null, dependsOnItemId: "q", minScorePct: 70 };
    const p = (scorePct: number | null) =>
      new Map<string, ProgressLike>([["q", { status: "COMPLETED", scorePct }]]);
    expect(evaluateRules([rule], p(null), titles, now).unlocked).toBe(false);
    expect(evaluateRules([rule], p(69.9), titles, now).reasons).toEqual(["Score at least 70% in “Quiz 1”"]);
    expect(evaluateRules([rule], p(70), titles, now).unlocked).toBe(true);
  });

  it("requires every rule (AND)", () => {
    const rules = [
      { type: "ITEM_COMPLETED" as const, afterDate: null, dependsOnItemId: "a", minScorePct: null },
      {
        type: "AFTER_DATE" as const,
        afterDate: new Date("2026-12-01"),
        dependsOnItemId: null,
        minScorePct: null,
      },
    ];
    const progress = new Map<string, ProgressLike>([["a", { status: "COMPLETED", scorePct: null }]]);
    expect(evaluateRules(rules, progress, titles, now).reasons).toHaveLength(1);
  });

  it("calculates progress from required items", () => {
    const progress = new Map<string, ProgressLike>([["a", { status: "COMPLETED", scorePct: null }]]);
    expect(progressPercent(["a", "b", "c"], progress)).toBe(33);
    expect(progressPercent([], progress)).toBe(0);
  });

  it("detects dependency cycles", () => {
    const edges = new Map([
      ["b", ["a"]],
      ["c", ["b"]],
    ]);
    expect(createsCycle(edges, "a", "c")).toBe(true); // a would wait on c, which waits on a
    expect(createsCycle(edges, "c", "a")).toBe(false);
  });
});

describe("video links", () => {
  it.each([
    [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
    ],
    ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"],
    ["https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789?dnt=1"],
    [
      "https://iframe.mediadelivery.net/play/12345/0c3a1d2e-1111-2222-3333-444455556666",
      "https://iframe.mediadelivery.net/embed/12345/0c3a1d2e-1111-2222-3333-444455556666?preload=false",
    ],
  ])("embeds %s", (input, embed) => {
    expect(parseVideoEmbed(input)?.embedUrl).toBe(embed);
  });

  it.each([
    "http://youtu.be/dQw4w9WgXcQ",
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "not a url",
  ])("rejects %s", (input) => expect(parseVideoEmbed(input)).toBeNull());
});

describe("rich text sanitiser", () => {
  it("drops unknown nodes, unsafe links and stray attributes", () => {
    const out = sanitizeRichText({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { onclick: "x" },
          content: [
            {
              type: "text",
              text: "safe",
              marks: [{ type: "link", attrs: { href: "https://yarigroup.co.za", target: "_top" } }],
            },
            {
              type: "text",
              text: "bad",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }, { type: "bold" }],
            },
          ],
        },
        { type: "iframe", attrs: { src: "https://evil.example" } },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "H" }] },
      ],
    });
    expect(out).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "safe",
              marks: [{ type: "link", attrs: { href: "https://yarigroup.co.za" } }],
            },
            { type: "text", text: "bad", marks: [{ type: "bold" }] },
          ],
        },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "H" }] },
      ],
    });
  });

  it("falls back to an empty document for junk", () => {
    expect(sanitizeRichText("<script>")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});

describe("file type sniffing", () => {
  it("accepts real signatures", () => {
    expect(contentMatchesType("application/pdf", Buffer.from("%PDF-1.7\n"))).toBe(true);
    expect(
      contentMatchesType("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])),
    ).toBe(true);
    expect(contentMatchesType("video/mp4", Buffer.from("\0\0\0\x18ftypmp42"))).toBe(true);
    expect(contentMatchesType("text/csv", Buffer.from("name,score\nThandi,82\n"))).toBe(true);
  });

  it("rejects mismatches", () => {
    expect(contentMatchesType("application/pdf", Buffer.from("MZ\x90\0"))).toBe(false); // Windows executable
    expect(contentMatchesType("text/plain", Buffer.from([0x4d, 0x5a, 0x00, 0x01]))).toBe(false);
    expect(contentMatchesType("application/x-msdownload", Buffer.from("MZ"))).toBe(false);
  });
});

describe("rich text limits", () => {
  it("drops absurdly deep nesting instead of overflowing the stack", () => {
    let node: Record<string, unknown> = { type: "text", text: "deep" };
    for (let i = 0; i < 50_000; i++) node = { type: i % 2 ? "blockquote" : "paragraph", content: [node] };
    const out = sanitizeRichText({ type: "doc", content: [node] });
    expect(out.type).toBe("doc");
    expect(JSON.stringify(out)).not.toContain("deep");
  });
});
