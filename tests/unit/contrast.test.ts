import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Checks WCAG 2.1 AA contrast for the semantic token pairs in globals.css, in both themes.
const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

const root = block(":root");
const dark = { ...root, ...block('[data-theme="dark"]') };

function resolve(vars: Record<string, string>, name: string): string {
  let v = vars[name]!;
  while (v.startsWith("var(")) v = vars[v.slice(6, -1)]!;
  return v;
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

const textPairs: [string, string][] = [
  ["fg", "bg"],
  ["fg", "surface"],
  ["fg-muted", "bg"],
  ["fg-muted", "surface"],
  ["danger", "bg"],
  ["danger", "danger-bg"],
  ["success", "bg"],
  ["success", "success-bg"],
  ["hs-text", "bg"],
  ["ai-text", "bg"],
  ["inverse-fg", "inverse-bg"],
];

describe.each([
  ["light", root],
  ["dark", dark],
])("%s theme contrast", (_name, vars) => {
  it.each(textPairs)("%s on %s ≥ 4.5:1", (fg, bg) => {
    expect(contrast(resolve(vars, fg), resolve(vars, bg))).toBeGreaterThanOrEqual(4.5);
  });
  it("form control borders ≥ 3:1", () => {
    expect(contrast(resolve(vars, "line-strong"), resolve(vars, "bg"))).toBeGreaterThanOrEqual(3);
    expect(contrast(resolve(vars, "line-strong"), resolve(vars, "surface"))).toBeGreaterThanOrEqual(3);
  });
  it("ink text on category fills ≥ 4.5:1", () => {
    expect(contrast(resolve(vars, "ink"), resolve(vars, "hs-fill"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolve(vars, "ink"), resolve(vars, "ai-fill"))).toBeGreaterThanOrEqual(4.5);
  });
});
