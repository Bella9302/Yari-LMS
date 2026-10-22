import "server-only";
import type { CourseCategory, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { RichNode } from "@/lib/rich-text";

// Starter course templates. Trainers create a course from one and fill in their own material.
// Text here is an outline for trainers to adapt, not final course content.

type Block = string | { h: string } | { ul: string[] };

function doc(...blocks: Block[]): Prisma.InputJsonValue {
  const content: RichNode[] = blocks.map((b) => {
    if (typeof b === "string") return { type: "paragraph", content: [{ type: "text", text: b }] };
    if ("h" in b) return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: b.h }] };
    return {
      type: "bulletList",
      content: b.ul.map((t) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
      })),
    };
  });
  return { type: "doc", content } as unknown as Prisma.InputJsonValue;
}

interface TemplateItem {
  title: string;
  type: "RICH_TEXT" | "DOWNLOAD" | "VIDEO";
  body?: Prisma.InputJsonValue;
  estMinutes?: number;
  /** Title of an earlier item that must be completed first. */
  after?: string;
}

interface Template {
  slug: string;
  title: string;
  summary: string;
  category: CourseCategory;
  estMinutes: number;
  modules: { title: string; description: string; items: TemplateItem[] }[];
}

export const TEMPLATES: Template[] = [
  {
    slug: "template-she-rep-practical-training",
    title: "SHE Rep Practical Training",
    summary: "Practical training for newly designated Safety, Health and Environment representatives.",
    category: "HEALTH_SAFETY",
    estMinutes: 480,
    modules: [
      {
        title: "The role of the SHE representative",
        description: "What the law expects of a SHE rep, and what it protects.",
        items: [
          {
            title: "What a SHE rep does",
            type: "RICH_TEXT",
            estMinutes: 15,
            body: doc(
              "Under the Occupational Health and Safety Act, 1993 (Act 85 of 1993), an employer with more than 20 employees at a workplace must designate health and safety representatives (section 17).",
              { h: "Functions (section 18)" },
              {
                ul: [
                  "Review how effective health and safety measures are.",
                  "Identify potential hazards and potential major incidents.",
                  "Examine the causes of incidents together with the employer.",
                  "Investigate employees' complaints about health and safety.",
                  "Make representations to the employer and inspectors.",
                  "Inspect the workplace, with notice to the employer.",
                  "Attend health and safety committee meetings.",
                ],
              },
              "Trainer: add your site-specific examples here.",
            ),
          },
          {
            title: "Your legal duties and protections",
            type: "RICH_TEXT",
            estMinutes: 15,
            body: doc(
              "A SHE rep acts in good faith and is not personally liable for the employer's failures because of their role.",
              "Trainer: explain how reps raise issues on your client's sites and who they escalate to.",
            ),
          },
        ],
      },
      {
        title: "Hazard identification and risk assessment",
        description: "Seeing hazards before they cause harm.",
        items: [
          {
            title: "Spotting hazards on site",
            type: "RICH_TEXT",
            estMinutes: 20,
            body: doc(
              { h: "Common hazard types" },
              { ul: ["Physical", "Chemical", "Biological", "Ergonomic", "Psychosocial"] },
              "Trainer: add photos or a short video from a real site walk-through.",
            ),
          },
          {
            title: "Risk assessment basics",
            type: "RICH_TEXT",
            estMinutes: 20,
            body: doc(
              "Identify the hazard, decide who might be harmed and how, evaluate the risk, record findings and controls, and review regularly.",
              { h: "Hierarchy of controls" },
              {
                ul: ["Elimination", "Substitution", "Engineering controls", "Administrative controls", "PPE"],
              },
            ),
          },
          { title: "Workplace inspection checklist", type: "DOWNLOAD" },
        ],
      },
      {
        title: "Inspections and reporting",
        description: "Running an inspection and reporting what you find.",
        items: [
          {
            title: "Conducting a workplace inspection",
            type: "RICH_TEXT",
            estMinutes: 30,
            body: doc(
              "Plan the route, use the checklist, talk to workers, record findings with photos, and agree actions and owners.",
            ),
          },
          {
            title: "Reporting incidents",
            type: "RICH_TEXT",
            estMinutes: 20,
            body: doc(
              "Trainer: cover the employer's internal reporting process and when an incident must be reported to the Department of Employment and Labour.",
            ),
          },
        ],
      },
      {
        title: "Practical assessment",
        description: "Apply it on a real site.",
        items: [
          {
            title: "Site walk-through",
            type: "RICH_TEXT",
            estMinutes: 120,
            after: "Conducting a workplace inspection",
            body: doc(
              "Complete a supervised inspection of your site using the checklist, then discuss your findings with your trainer.",
            ),
          },
        ],
      },
    ],
  },
  {
    slug: "template-intro-ai-tools-at-work",
    title: "Intro to AI Tools at Work",
    summary: "A practical, safe introduction to using generative AI tools in everyday work.",
    category: "AI_DIGITAL",
    estMinutes: 180,
    modules: [
      {
        title: "What AI tools can and can't do",
        description: "A plain-language grounding.",
        items: [
          {
            title: "How generative AI works, in plain language",
            type: "RICH_TEXT",
            estMinutes: 15,
            body: doc(
              "Generative AI tools predict likely text, images or code from patterns in the data they were trained on. They can be fluent and still be wrong.",
              "Trainer: add a short demo video.",
            ),
          },
          {
            title: "Good uses at work",
            type: "RICH_TEXT",
            estMinutes: 15,
            body: doc({
              ul: [
                "Drafting emails and reports",
                "Summarising long documents",
                "Brainstorming",
                "Explaining unfamiliar topics",
              ],
            }),
          },
        ],
      },
      {
        title: "Using AI safely",
        description: "Protecting information and checking output.",
        items: [
          {
            title: "Protecting company and personal information",
            type: "RICH_TEXT",
            estMinutes: 20,
            body: doc(
              "Don't paste personal information (names, ID numbers, contact details) or confidential company information into AI tools your organisation hasn't approved. POPIA still applies.",
            ),
          },
          {
            title: "Checking AI output",
            type: "RICH_TEXT",
            estMinutes: 15,
            body: doc(
              "Check facts, figures and references against reliable sources. You remain responsible for anything you send.",
            ),
          },
        ],
      },
      {
        title: "Hands-on practice",
        description: "Try it on your own work.",
        items: [
          {
            title: "Writing clear prompts",
            type: "RICH_TEXT",
            estMinutes: 20,
            body: doc({
              ul: [
                "Give context and a goal",
                "Say who the audience is",
                "Ask for a format",
                "Iterate: refine and ask follow-ups",
              ],
            }),
          },
          {
            title: "Practice exercise",
            type: "RICH_TEXT",
            estMinutes: 45,
            after: "Writing clear prompts",
            body: doc(
              "Use an approved AI tool to draft a real document from your work, then review and correct it.",
            ),
          },
        ],
      },
    ],
  },
];

/** Creates any missing templates (idempotent: existing templates are left alone so edits survive). */
export async function ensureTemplates(): Promise<string[]> {
  const created: string[] = [];
  for (const t of TEMPLATES) {
    if (await db.course.findUnique({ where: { slug: t.slug } })) continue;
    await db.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          slug: t.slug,
          title: t.title,
          summary: t.summary,
          category: t.category,
          estMinutes: t.estMinutes,
          isTemplate: true,
        },
      });
      const ids = new Map<string, string>();
      for (const [mi, m] of t.modules.entries()) {
        const mod = await tx.module.create({
          data: { courseId: course.id, position: mi, title: m.title, description: m.description },
        });
        for (const [ii, i] of m.items.entries()) {
          const item = await tx.item.create({
            data: {
              moduleId: mod.id,
              position: ii,
              type: i.type,
              title: i.title,
              body: i.body,
              estMinutes: i.estMinutes,
              // Items without content (file placeholders) stay hidden until a trainer adds the file.
              published: i.type === "RICH_TEXT",
            },
          });
          ids.set(i.title, item.id);
          if (i.after) {
            await tx.releaseRule.create({
              data: { itemId: item.id, type: "ITEM_COMPLETED", dependsOnItemId: ids.get(i.after)! },
            });
          }
        }
      }
    });
    created.push(t.title);
  }
  return created;
}
