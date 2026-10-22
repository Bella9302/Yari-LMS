import "server-only";
import type { ItemType } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { assertCanEditCourse } from "@/server/courses/access";
import { dec } from "@/server/pii/fields";
import type { Actor } from "@/server/pii/users";
import { computeGrade, type Grade } from "@/server/assessment/grades";

export interface GradebookColumn {
  itemId: string;
  title: string;
  type: ItemType;
  moduleTitle: string;
  passPct: number;
  required: boolean;
}

export interface GradebookRow {
  enrolmentId: string;
  userId: string;
  name: string;
  email: string;
  organization: string | null;
  progressPct: number;
  status: string;
  dueAt: Date | null;
  grades: Record<string, Grade>;
}

export type GradebookFilter = "all" | "needs-marking" | "failing" | "completed" | "not-started";

export interface Gradebook {
  columns: GradebookColumn[];
  rows: GradebookRow[];
  organizations: { id: string; name: string }[];
}

/** All grades for a course in one pass. Personal data view: audit-logged. */
export async function getGradebook(
  actor: Actor,
  courseId: string,
  opts: { q?: string; organizationId?: string; filter?: GradebookFilter } = {},
): Promise<Gradebook> {
  await assertCanEditCourse(actor, courseId);
  const [items, enrolments] = await Promise.all([
    db.item.findMany({
      where: { module: { courseId }, type: { in: ["QUIZ", "ASSIGNMENT"] } },
      orderBy: [{ module: { position: "asc" } }, { position: "asc" }],
      include: {
        module: { select: { title: true } },
        quiz: { include: { attempts: { select: { enrolmentId: true, status: true, scorePct: true } } } },
        assignment: {
          include: {
            submissions: {
              orderBy: { attemptNo: "desc" },
              select: {
                enrolmentId: true,
                status: true,
                isLate: true,
                mark: { select: { status: true, score: true } },
              },
            },
          },
        },
        overrides: { select: { enrolmentId: true, scorePct: true } },
      },
    }),
    db.enrolment.findMany({
      where: {
        courseId,
        status: { not: "WITHDRAWN" },
        ...(opts.organizationId ? { organizationId: opts.organizationId } : {}),
      },
      include: {
        organization: { select: { id: true, name: true } },
        user: { select: { id: true, emailEnc: true, profile: { select: { fullNameEnc: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const columns: GradebookColumn[] = items.map((i) => ({
    itemId: i.id,
    title: i.title,
    type: i.type,
    moduleTitle: i.module.title,
    passPct: i.quiz?.passPct ?? i.assignment?.passPct ?? 0,
    required: i.required,
  }));

  let rows: GradebookRow[] = enrolments.map((e) => {
    const grades: Record<string, Grade> = {};
    for (const i of items) {
      const override = i.overrides.find((o) => o.enrolmentId === e.id) ?? null;
      grades[i.id] = i.quiz
        ? computeGrade(
            {
              kind: "quiz",
              passPct: i.quiz.passPct,
              attempts: i.quiz.attempts.filter((a) => a.enrolmentId === e.id),
            },
            override,
          )
        : computeGrade(
            {
              kind: "assignment",
              passPct: i.assignment!.passPct,
              maxPoints: i.assignment!.maxPoints,
              submissions: i.assignment!.submissions.filter((s) => s.enrolmentId === e.id),
            },
            override,
          );
    }
    return {
      enrolmentId: e.id,
      userId: e.user.id,
      name: e.user.profile ? dec.fullName(e.user.id, e.user.profile.fullNameEnc) : "",
      email: dec.email(e.user.id, e.user.emailEnc),
      organization: e.organization?.name ?? null,
      progressPct: e.progressPct,
      status: e.status,
      dueAt: e.dueAt,
      grades,
    };
  });

  const organizations = [
    ...new Map(
      enrolments.flatMap((e) => (e.organization ? [[e.organization.id, e.organization]] : [])),
    ).values(),
  ];

  const q = opts.q?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => `${r.name} ${r.email} ${r.organization ?? ""}`.toLowerCase().includes(q));
  const grades = (r: GradebookRow) => Object.values(r.grades);
  switch (opts.filter) {
    case "needs-marking":
      rows = rows.filter((r) => grades(r).some((g) => g.state === "pending"));
      break;
    case "failing":
      rows = rows.filter((r) => grades(r).some((g) => g.state === "graded" && g.passed === false));
      break;
    case "completed":
      rows = rows.filter((r) => r.status === "COMPLETED");
      break;
    case "not-started":
      rows = rows.filter((r) => r.progressPct === 0 && grades(r).every((g) => g.state === "none"));
      break;
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));

  await audit({
    actorId: actor.id,
    action: "pii.viewed",
    entityType: "Gradebook",
    entityId: courseId,
    fields: ["fullName", "email"],
    meta: { count: rows.length },
  });
  return { columns, rows, organizations };
}

export function gradeLabel(g: Grade): string {
  if (g.state === "pending") return "To mark";
  if (g.state === "in_progress") return "In progress";
  if (g.scorePct === null) return "—";
  return `${Math.round(g.scorePct)}%`;
}

/** Escapes a CSV cell, and neutralises spreadsheet formulas (CSV injection). */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function gradebookCsv(gb: Gradebook): string {
  const header = [
    "Learner",
    "Email",
    "Company",
    "Progress %",
    "Status",
    ...gb.columns.flatMap((c) => [`${c.title} (%)`, `${c.title} result`]),
  ];
  const lines = gb.rows.map((r) => [
    r.name,
    r.email,
    r.organization ?? "",
    r.progressPct,
    r.status.toLowerCase(),
    ...gb.columns.flatMap((c) => {
      const g = r.grades[c.itemId]!;
      const result = g.state === "pending" ? "to mark" : g.passed === null ? "" : g.passed ? "pass" : "fail";
      return [
        g.scorePct === null ? "" : Math.round(g.scorePct * 100) / 100,
        `${result}${g.late ? " (late)" : ""}${g.overridden ? " (override)" : ""}`,
      ];
    }),
  ]);
  // BOM so Excel opens UTF-8 names correctly.
  return "﻿" + [header, ...lines].map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
