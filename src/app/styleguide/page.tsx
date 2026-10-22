import type { Metadata } from "next";
import { Button } from "@/ui/button";
import { Checkbox, Field, Input, Select } from "@/ui/field";
import { CategoryTag, Card, EmptyState, Notice, PageHeader, Rule, Stat, Tag } from "@/ui/primitives";
import { ProgressRing } from "@/ui/progress-ring";
import { Monogram } from "@/ui/monogram";
import { ThemeToggle } from "@/ui/theme";

export const metadata: Metadata = { title: "Style guide", robots: { index: false } };

const swatches = [
  ["Ink", "bg-ink", "#0B0B0C"],
  ["Paper", "bg-paper", "#F7F5F0"],
  ["Graphite", "bg-graphite", "#2A2A2D"],
  ["Safety amber", "bg-amber", "#E8A33D"],
  ["Electric teal", "bg-teal", "#2FD3B5"],
] as const;

export default function StyleGuidePage() {
  return (
    <main id="main" className="mx-auto max-w-5xl space-y-16 px-4 py-12 sm:px-6">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
      <PageHeader
        eyebrow="Design system"
        title="YARI Academy style guide"
        description="Tokens and core components."
      />

      <section className="space-y-6">
        <h2 className="font-display text-h2">Colour</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {swatches.map(([name, cls, hex]) => (
            <div key={name}>
              <div className={`${cls} border-line h-20 border`} />
              <p className="mt-2 text-sm font-medium">{name}</p>
              <p className="text-muted font-mono text-xs">{hex}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-h2">Type</h2>
        <p className="font-display text-display">Gloock display</p>
        <p className="font-display text-h1">Heading one</p>
        <p className="font-display text-h2">Heading two</p>
        <p className="max-w-prose text-lg">
          Bricolage Grotesque carries body copy and interface text: clear on a phone in bright sunlight on
          site.
        </p>
        <p className="font-mono text-sm">Martian Mono · YG-7K3M-Q9TP · 86% · 2026-10-22</p>
        <p className="eyebrow">Eyebrow label</p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-h2">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <div data-category="health-safety">
            <Button variant="accent">H&amp;S accent</Button>
          </div>
          <div data-category="ai-digital">
            <Button variant="accent">AI accent</Button>
          </div>
        </div>
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div className="space-y-5">
          <h2 className="font-display text-h2">Forms</h2>
          <Field label="Email" name="sg-email" hint="We never share it.">
            {(p) => <Input {...p} type="email" placeholder="name@company.co.za" />}
          </Field>
          <Field label="Site" name="sg-site" error="Choose a site.">
            {(p) => (
              <Select {...p} defaultValue="">
                <option value="">Choose…</option>
                <option>Johannesburg</option>
              </Select>
            )}
          </Field>
          <Checkbox name="sg-check" label="I agree to the privacy notice." />
        </div>
        <div className="space-y-5">
          <h2 className="font-display text-h2">Feedback</h2>
          <Notice title="Heads up">Neutral notice.</Notice>
          <Notice tone="success">Saved.</Notice>
          <Notice tone="danger">Something went wrong.</Notice>
          <div className="flex flex-wrap gap-2">
            <Tag>Draft</Tag>
            <Tag tone="success">Completed</Tag>
            <Tag tone="danger">Overdue</Tag>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="font-display text-h2">Categories &amp; progress</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["HEALTH_SAFETY", "AI_DIGITAL"] as const).map((c) => (
            <Card
              key={c}
              data-category={c === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
              className="flex items-center gap-5 p-5 transition-transform duration-200 hover:-translate-y-0.5"
            >
              <ProgressRing value={c === "HEALTH_SAFETY" ? 64 : 30} label="Course progress" />
              <div>
                <CategoryTag category={c} />
                <p className="font-display text-h3 mt-2">
                  {c === "HEALTH_SAFETY"
                    ? "SHE Representative Practical Training"
                    : "AI Tools for the Workplace"}
                </p>
              </div>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="Learners" value="128" />
          <Stat label="Completion" value="86%" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-h2">Brand mark</h2>
        <div className="flex items-center gap-8">
          <Monogram className="h-24 w-auto" />
          <div className="bg-ink text-paper p-6">
            <Monogram className="h-16 w-auto" />
          </div>
        </div>
        <Rule />
        <EmptyState title="Empty state">Explains what will appear here and how to get started.</EmptyState>
      </section>
    </main>
  );
}
