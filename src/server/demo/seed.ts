import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { emailIndex } from "@/server/crypto/blind-index";
import { hashPassword } from "@/server/crypto/password";
import { newId } from "@/server/crypto/tokens";
import { encryptProfile, type Actor } from "@/server/pii/users";
import { enc } from "@/server/pii/fields";
import { pendingTotpEnrolment } from "@/server/auth/totp";
import { ensureTemplates } from "@/server/courses/templates";
import {
  addCourseStaff,
  addItem,
  addModule,
  cloneCourse,
  enrolLearners,
  setCourseStatus,
  updateCourseSettings,
  updateItem,
} from "@/server/courses/builder";
import { completeItem } from "@/server/courses/learner";
import {
  addQuestion,
  addQuizSection,
  createBank,
  saveRubric,
  updateAssignmentSettings,
  updateQuizSettings,
} from "@/server/assessment/authoring";
import { startAttempt, submitAttempt } from "@/server/assessment/quiz";
import { saveMark, submitAssignment } from "@/server/assessment/assignments";
import { createSession, setAttendance } from "@/server/tracking/sessions";
import { evaluateAllCourses, saveRule } from "@/server/tracking/at-risk";
import { postAnnouncement } from "@/server/engagement/announcements";
import { createThread, reply } from "@/server/engagement/discussions";
import { pendingRatings, submitRating } from "@/server/engagement/ratings";
import { submitEnquiry } from "@/server/public/enquiries";
import type { SnapshotQuestion } from "@/lib/questions";

// Demo data for showing YARI Academy to clients (brief section 9). Everyone and everything here
// is fictional. Email addresses use the reserved .invalid domain so nothing is ever delivered.

export const DEMO_MARKER = "demo";
const DOMAIN = "demo.yarigroup.invalid";
const DAY = 86_400_000;

type Person = Actor & { email: string; fullName: string };

const rich = (...paras: string[]) =>
  ({
    type: "doc",
    content: paras.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })),
  }) as unknown as Prisma.InputJsonValue;

/** A valid-looking but fictional SA ID number (correct date and Luhn check digit). */
function fakeSaId(yymmdd: string, female: boolean) {
  const seq = String((female ? 0 : 5000) + randomInt(1000, 4999))
    .padStart(4, "0")
    .slice(0, 4);
  const body = `${yymmdd}${seq}08`;
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

async function person(
  fullName: string,
  roles: { role: "SUPER_ADMIN" | "TRAINER" | "LEARNER" | "CLIENT_MANAGER"; organizationId?: string }[],
  password: string,
  opts: { memberOf?: string; idNumber?: string; department?: string } = {},
): Promise<Person> {
  const id = newId();
  const email = `${fullName.toLowerCase().replace(/[^a-z]+/g, ".")}@${DOMAIN}`;
  await db.user.create({
    data: {
      id,
      emailEnc: enc.email(id, email),
      emailIdx: emailIndex(email),
      status: "ACTIVE",
      passwordHash: await hashPassword(password),
      profile: {
        create: encryptProfile(id, {
          fullName,
          ...(opts.idNumber ? { idType: "SA_ID" as const, idNumber: opts.idNumber } : {}),
        }) as { fullNameEnc: string },
      },
      roles: { create: roles.map((r) => ({ role: r.role, organizationId: r.organizationId ?? null })) },
      memberships: opts.memberOf
        ? { create: { id: newId(), organizationId: opts.memberOf, department: opts.department ?? null } }
        : undefined,
      consents: {
        create: [
          { purpose: "TERMS", policyVersion: "demo" },
          { purpose: "PRIVACY", policyVersion: "demo" },
        ],
      },
    },
  });
  const grants = await db.roleAssignment.findMany({
    where: { userId: id },
    select: { role: true, organizationId: true },
  });
  return { id, roles: grants, email, fullName };
}

async function enableTotp(p: Person) {
  const { manualKey, uri } = await pendingTotpEnrolment(p.id, p.email);
  await db.user.update({ where: { id: p.id }, data: { totpEnabledAt: new Date() } });
  return { manualKey, uri };
}

/** Answers an attempt from its own snapshot: right answers, or wrong ones for `wrong` questions. */
function answersFor(questions: SnapshotQuestion[], wrong: number) {
  const out: Record<string, unknown> = {};
  questions.forEach((q, i) => {
    const bad = i < wrong;
    const key = q.key as Record<string, unknown>;
    switch (q.type) {
      case "MCQ":
        out[q.id] = bad ? q.options.choices!.find((c) => c.id !== key.correct)!.id : key.correct;
        break;
      case "MULTI_SELECT":
        out[q.id] = bad ? [q.options.choices![0]!.id] : key.correct;
        break;
      case "TRUE_FALSE":
        out[q.id] = bad ? !key.correct : key.correct;
        break;
      case "SHORT_ANSWER":
        out[q.id] = bad ? "not sure" : (key.accepted as string[])[0];
        break;
      case "MATCHING":
        out[q.id] = bad ? {} : key.pairs;
        break;
    }
  });
  return out;
}

async function takeQuiz(learner: Person, quizItemId: string, wrong: number) {
  const attemptId = await startAttempt(learner, quizItemId);
  const attempt = await db.quizAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  await submitAttempt(
    learner,
    attemptId,
    answersFor(attempt.questions as unknown as SnapshotQuestion[], wrong),
  );
}

/** Completes every non-assessment item up to (not including) the first quiz or assignment. */
async function workThrough(learner: Person, courseId: string, opts: { upTo?: number } = {}) {
  const items = await db.item.findMany({
    where: { module: { courseId }, published: true, type: { notIn: ["QUIZ", "ASSIGNMENT"] } },
    orderBy: [{ module: { position: "asc" } }, { position: "asc" }],
    select: { id: true },
  });
  for (const item of items.slice(0, opts.upTo ?? items.length)) {
    await completeItem(learner.id, item.id).catch(() => {}); // a locked item just stops progress
  }
}

export interface DemoLogins {
  password: string;
  people: { role: string; name: string; email: string; totp?: { manualKey: string; uri: string } }[];
}

export async function seedDemo(opts: { password?: string } = {}): Promise<DemoLogins | null> {
  if (await db.platformSetting.findUnique({ where: { key: DEMO_MARKER } })) return null;
  const password = opts.password ?? `Demo-${randomBytes(6).toString("base64url")}-2026`;
  await ensureTemplates();
  const now = Date.now();

  // ---------------------------------------------------------------- people
  const org = await db.organization.create({
    data: { name: "Ubuntu Build & Civil (Demo)", slug: `ubuntu-build-civil-demo-${newId().slice(0, 4)}` },
  });
  const admin = await person("Ayanda Nkosi", [{ role: "SUPER_ADMIN" }], password);
  const nomsa = await person("Nomsa Dlamini", [{ role: "TRAINER" }], password);
  const sipho = await person("Sipho Ndlovu", [{ role: "TRAINER" }], password);
  const manager = await person(
    "Pieter van Wyk",
    [{ role: "CLIENT_MANAGER", organizationId: org.id }],
    password,
  );
  const learnerSpecs: [string, string, boolean, string][] = [
    ["Thandiwe Mokoena", "910412", true, "Site A · Midrand"],
    ["Lerato Molefe", "880723", true, "Site A · Midrand"],
    ["Johan Botha", "790105", false, "Site A · Midrand"],
    ["Kagiso Sithole", "950918", false, "Site B · Rustenburg"],
    ["Zanele Khumalo", "930302", true, "Site B · Rustenburg"],
    ["Rajesh Pillay", "850611", false, "Head office"],
    ["Nadia Adams", "970129", true, "Head office"],
    ["Bongani Zulu", "920817", false, "Site B · Rustenburg"],
    ["Ayesha Patel", "960504", true, "Head office"],
    ["Themba Mthembu", "870226", false, "Site A · Midrand"],
  ];
  const learners: Person[] = [];
  for (const [name, dob, female, dept] of learnerSpecs) {
    learners.push(
      await person(name, [{ role: "LEARNER" }], password, {
        memberOf: org.id,
        idNumber: fakeSaId(dob, female),
        department: dept,
      }),
    );
  }
  const totp = {
    admin: await enableTotp(admin),
    nomsa: await enableTotp(nomsa),
    sipho: await enableTotp(sipho),
  };

  // ------------------------------------------------- course 1: SHE representative training
  const sheTemplate = await db.course.findUniqueOrThrow({
    where: { slug: "template-she-rep-practical-training" },
  });
  const she = await cloneCourse(admin, sheTemplate.id, {
    title: "SHE Representative Practical Training",
    summary:
      "Two days of practical training for newly appointed SHE representatives: the law, inspections, incident reporting and working with your committee, finished with a site walk-through.",
  });
  await updateCourseSettings(admin, she.id, {
    title: "SHE Representative Practical Training",
    summary: (await db.course.findUniqueOrThrow({ where: { id: she.id } })).summary,
    category: "HEALTH_SAFETY",
    visibility: "PUBLIC",
    estMinutes: 960,
  });
  await addCourseStaff(admin, she.id, nomsa.id);
  await db.courseStaff.updateMany({ where: { courseId: she.id, userId: nomsa.id }, data: { role: "LEAD" } });

  const sheCheck = await addModule(admin, she.id, "Check your knowledge");
  const sheBank = await createBank(nomsa, she.id, "SHE rep basics");
  const choice = (id: string, text: string) => ({ id, text });
  const sheQuestions = [
    {
      prompt:
        "Under the OHS Act, who must appoint SHE representatives in a workplace with more than 20 employees?",
      data: {
        type: "MCQ",
        options: {
          choices: [
            choice("a", "The employer"),
            choice("b", "The Department of Employment and Labour"),
            choice("c", "The trade union"),
            choice("d", "The SHE committee"),
          ],
        },
        answerKey: { correct: "a" },
      },
    },
    {
      prompt:
        "A SHE representative can be held personally liable for an incident they reported in good faith.",
      data: { type: "TRUE_FALSE", answerKey: { correct: false } },
    },
    {
      prompt: "Which of these are functions of a SHE representative? Choose all that apply.",
      data: {
        type: "MULTI_SELECT",
        options: {
          choices: [
            choice("a", "Inspect the workplace regularly"),
            choice("b", "Investigate incidents"),
            choice("c", "Discipline employees who break rules"),
            choice("d", "Attend SHE committee meetings"),
          ],
        },
        answerKey: { correct: ["a", "b", "d"] },
      },
    },
    {
      prompt: "Match each document to what it records.",
      data: {
        type: "MATCHING",
        options: {
          left: [
            choice("l1", "Incident register"),
            choice("l2", "Risk assessment"),
            choice("l3", "Inspection checklist"),
          ],
          right: [
            choice("r1", "Every injury and near miss"),
            choice("r2", "Hazards and how they are controlled"),
            choice("r3", "What was checked on a walk-through"),
          ],
        },
        answerKey: { pairs: { l1: "r1", l2: "r2", l3: "r3" } },
      },
    },
    {
      prompt: "What does the abbreviation PPE stand for?",
      data: { type: "SHORT_ANSWER", answerKey: { accepted: ["personal protective equipment"] } },
    },
    {
      prompt: "How often should a SHE representative inspect their area, as a good-practice minimum?",
      data: {
        type: "MCQ",
        options: {
          choices: [
            choice("a", "Once a year"),
            choice("b", "Monthly, or as agreed with the employer"),
            choice("c", "Only after an incident"),
          ],
        },
        answerKey: { correct: "b" },
      },
    },
  ];
  for (const q of sheQuestions)
    await addQuestion(nomsa, sheBank.id, { prompt: q.prompt, points: 1, explanation: null, data: q.data });
  const sheQuiz = await addItem(nomsa, sheCheck.id, "QUIZ", "SHE rep knowledge check");
  await updateQuizSettings(nomsa, sheQuiz.id, {
    instructions: "Six questions on the SHE rep's role. You need 70% to pass and have three attempts.",
    passPct: 70,
    timeLimitMin: 20,
    maxAttempts: 3,
    shuffle: true,
    showAnswers: "AFTER_PASS",
  });
  await addQuizSection(nomsa, sheQuiz.id, sheBank.id, null);
  await updateItem(nomsa, sheQuiz.id, {
    title: "SHE rep knowledge check",
    required: true,
    published: true,
    estMinutes: 15,
  });

  const rubric = await saveRubric(nomsa, she.id, null, {
    title: "Workplace inspection report",
    criteria: [
      {
        title: "Hazards identified",
        levels: [
          { label: "Few or none", points: 0 },
          { label: "Main hazards", points: 5 },
          { label: "Thorough", points: 10 },
        ],
      },
      {
        title: "Risk rated correctly",
        levels: [
          { label: "Not rated", points: 0 },
          { label: "Partly", points: 5 },
          { label: "Consistently", points: 10 },
        ],
      },
      {
        title: "Practical controls proposed",
        levels: [
          { label: "None", points: 0 },
          { label: "Generic", points: 5 },
          { label: "Specific and realistic", points: 10 },
        ],
      },
      {
        title: "Clear and complete",
        levels: [
          { label: "Hard to follow", points: 0 },
          { label: "Mostly clear", points: 5 },
          { label: "Ready to table", points: 10 },
        ],
      },
    ],
  });
  const report = await addItem(nomsa, sheCheck.id, "ASSIGNMENT", "Workplace inspection report");
  await updateItem(nomsa, report.id, {
    title: "Workplace inspection report",
    required: true,
    published: true,
    estMinutes: 90,
    body: rich(
      "Inspect one area of your site using the checklist from module 3. List the hazards you found, rate each one, and propose a practical control.",
      "Hand in a short written report (or a photo of your completed checklist with notes).",
    ),
  });
  await updateAssignmentSettings(nomsa, report.id, {
    dueAt: new Date(now + 10 * DAY),
    allowText: true,
    allowFiles: true,
    maxFiles: 3,
    maxPoints: 40,
    passPct: 50,
    rubricId: rubric.id,
    allowLate: true,
  });
  await setCourseStatus(admin, she.id, "PUBLISHED");
  for (const [type, threshold] of [
    ["INACTIVE_DAYS", 10],
    ["MISSED_DEADLINE", 2],
    ["SCORE_BELOW", 50],
  ] as const) {
    await saveRule(nomsa, she.id, type, threshold, true);
  }

  // ------------------------------------------------------ course 2: AI tools for the workplace
  const aiTemplate = await db.course.findUniqueOrThrow({
    where: { slug: "template-intro-ai-tools-at-work" },
  });
  const ai = await cloneCourse(admin, aiTemplate.id, {
    title: "AI Tools for the Workplace",
    summary:
      "A practical introduction to AI assistants at work: what they're good at, writing good prompts, checking their answers, and keeping company and personal information safe.",
  });
  await updateCourseSettings(admin, ai.id, {
    title: "AI Tools for the Workplace",
    summary: (await db.course.findUniqueOrThrow({ where: { id: ai.id } })).summary,
    category: "AI_DIGITAL",
    visibility: "PUBLIC",
    estMinutes: 360,
  });
  await addCourseStaff(admin, ai.id, sipho.id);
  await db.courseStaff.updateMany({ where: { courseId: ai.id, userId: sipho.id }, data: { role: "LEAD" } });
  const aiCheck = await addModule(admin, ai.id, "Check your knowledge");
  const aiBank = await createBank(sipho, ai.id, "AI at work basics");
  const aiQuestions = [
    {
      prompt:
        "An AI assistant gives you a confident answer with a statistic. What should you do before using it in a report?",
      data: {
        type: "MCQ",
        options: {
          choices: [
            choice("a", "Use it: AI tools are always accurate"),
            choice("b", "Check it against a reliable source"),
            choice("c", "Ask the AI if it is sure"),
          ],
        },
        answerKey: { correct: "b" },
      },
    },
    {
      prompt:
        "It is fine to paste a client's ID number into a public AI chatbot if you delete the chat afterwards.",
      data: { type: "TRUE_FALSE", answerKey: { correct: false } },
    },
    {
      prompt: "Match each prompt habit to why it helps.",
      data: {
        type: "MATCHING",
        options: {
          left: [
            choice("l1", "Give context"),
            choice("l2", "Show an example"),
            choice("l3", "Ask it to list assumptions"),
          ],
          right: [
            choice("r1", "The answer fits your situation"),
            choice("r2", "The output follows your format"),
            choice("r3", "You can spot what to check"),
          ],
        },
        answerKey: { pairs: { l1: "r1", l2: "r2", l3: "r3" } },
      },
    },
    {
      prompt: "Which tasks are usually a good fit for an AI assistant? Choose all that apply.",
      data: {
        type: "MULTI_SELECT",
        options: {
          choices: [
            choice("a", "Drafting a first version of an email"),
            choice("b", "Summarising long meeting notes"),
            choice("c", "Signing off a safety inspection"),
            choice("d", "Suggesting headings for a document"),
          ],
        },
        answerKey: { correct: ["a", "b", "d"] },
      },
    },
  ];
  for (const q of aiQuestions)
    await addQuestion(sipho, aiBank.id, { prompt: q.prompt, points: 1, explanation: null, data: q.data });
  const aiQuiz = await addItem(sipho, aiCheck.id, "QUIZ", "AI at work check");
  await updateQuizSettings(sipho, aiQuiz.id, {
    instructions: "Four questions. You need 75% to pass.",
    passPct: 75,
    timeLimitMin: null,
    maxAttempts: null,
    shuffle: true,
    showAnswers: "AFTER_SUBMIT",
  });
  await addQuizSection(sipho, aiQuiz.id, aiBank.id, null);
  await updateItem(sipho, aiQuiz.id, {
    title: "AI at work check",
    required: true,
    published: true,
    estMinutes: 10,
  });
  await setCourseStatus(admin, ai.id, "PUBLISHED");

  // --------------------------------------------------------------------------- enrolments
  await enrolLearners(
    manager,
    she.id,
    learners.map((l) => l.id),
    { organizationId: org.id, dueAt: new Date(now + 21 * DAY) },
  );
  await enrolLearners(
    manager,
    ai.id,
    learners.slice(3, 9).map((l) => l.id),
    { organizationId: org.id, dueAt: new Date(now + 30 * DAY) },
  );

  // Sessions: a practical day last week (with a register) and a site walk-through next week.
  const practical = await createSession(nomsa, she.id, {
    title: "Practical day: inspections and incident reporting",
    description: "Bring your PPE. We walk the yard together and practise the inspection checklist.",
    mode: "IN_PERSON",
    startsAt: new Date(now - 6 * DAY),
    endsAt: new Date(now - 6 * DAY + 7 * 3600_000),
    location: "Ubuntu Build & Civil yard, Midrand",
    meetingUrl: null,
    trainerId: nomsa.id,
  });
  await createSession(nomsa, she.id, {
    title: "Site walk-through and sign-off",
    description: "Each SHE rep leads part of the walk-through.",
    mode: "IN_PERSON",
    startsAt: new Date(now + 5 * DAY),
    endsAt: new Date(now + 5 * DAY + 4 * 3600_000),
    location: "Site B, Rustenburg",
    meetingUrl: null,
    trainerId: nomsa.id,
  });
  await createSession(sipho, ai.id, {
    title: "Live Q&A: prompts that work",
    description: "Bring a real task from your week and we'll work on it together.",
    mode: "ONLINE",
    startsAt: new Date(now + 3 * DAY),
    endsAt: new Date(now + 3 * DAY + 3600_000),
    location: null,
    meetingUrl: "https://meet.google.com/demo-yari-qna",
    trainerId: sipho.id,
  });
  for (const l of learners.slice(0, 8)) {
    await setAttendance(nomsa, practical.id, l.id, l === learners[7] ? "ABSENT" : "PRESENT", null);
  }

  // ------------------------------------------------------------------------ progress
  const [thandiwe, lerato, johan, kagiso, zanele, rajesh, nadia, bongani, ayesha] = learners as [
    Person,
    Person,
    Person,
    Person,
    Person,
    Person,
    Person,
    Person,
    Person,
    Person,
  ];
  // Finished SHE (passed quiz, rubric-marked report): certificates are issued automatically.
  for (const [l, levels] of [
    [thandiwe, [2, 2, 2, 1]],
    [lerato, [2, 1, 2, 2]],
    [johan, [1, 1, 2, 1]],
  ] as const) {
    await workThrough(l, she.id);
    await takeQuiz(l, sheQuiz.id, l === johan ? 1 : 0);
    await submitAssignment(l, report.id, {
      text: "Inspected the cement store and scaffold at Site A. Hazards: blocked fire exit (high), missing toe boards on scaffold bay 3 (high), torn bags causing dust (medium). Controls: clear the exit and mark it, fit toe boards before use, re-stack bags and issue dust masks.",
      assetIds: [],
    });
    const sub = await db.submission.findFirstOrThrow({
      where: { assignmentId: report.id, enrolment: { userId: l.id } },
    });
    const full = await db.rubric.findUniqueOrThrow({
      where: { id: rubric.id },
      include: {
        criteria: { orderBy: { position: "asc" }, include: { levels: { orderBy: { points: "asc" } } } },
      },
    });
    await saveMark(nomsa, sub.id, {
      score: null,
      rubricSelections: Object.fromEntries(full.criteria.map((c, i) => [c.id, c.levels[levels[i]!]!.id])),
      feedbackText:
        "Good, practical report. Raise the blocked fire exit with the site manager today, not at the next committee meeting.",
      feedbackAssetId: null,
      audioAssetId: null,
      action: "release",
    });
  }
  // In progress: one waiting for marking, one who failed the quiz once, two part-way.
  await workThrough(kagiso, she.id);
  await takeQuiz(kagiso, sheQuiz.id, 0);
  await submitAssignment(kagiso, report.id, {
    text: "Inspected the workshop. Two extension leads were damaged; one grinder had no guard. Both tagged out.",
    assetIds: [],
  });
  await workThrough(zanele, she.id);
  await takeQuiz(zanele, sheQuiz.id, 3);
  await workThrough(rajesh, she.id, { upTo: 5 });
  await workThrough(nadia, she.id, { upTo: 2 });
  // Bongani started and then went quiet: the at-risk rule flags him.
  await workThrough(bongani, she.id, { upTo: 1 });
  await db.enrolment.updateMany({
    where: { userId: bongani.id, courseId: she.id },
    data: { lastActiveAt: new Date(now - 18 * DAY) },
  });

  // AI course: two finished, two part-way.
  for (const l of [kagiso, rajesh]) {
    await workThrough(l, ai.id);
    await takeQuiz(l, aiQuiz.id, 0);
  }
  await workThrough(zanele, ai.id, { upTo: 3 });
  await workThrough(ayesha, ai.id, { upTo: 1 });

  // Realistic time on task.
  const progress = await db.itemProgress.findMany({
    where: { enrolment: { user: { memberships: { some: { organizationId: org.id } } } } },
    select: { id: true },
  });
  for (const p of progress) {
    await db.itemProgress.update({ where: { id: p.id }, data: { timeSpentSec: randomInt(4, 28) * 60 } });
  }

  // ----------------------------------------------------------------------- engagement
  await postAnnouncement(nomsa, she.id, {
    title: "Practical day: what to bring",
    body: rich(
      "Please bring safety boots, a hard hat and your reflective vest. We start at 07:30 sharp at the yard gate.",
    ),
    pinned: true,
    email: false,
  });
  await postAnnouncement(admin, null, {
    title: "Welcome to YARI Academy",
    body: rich(
      "Your training, progress and certificates are all in one place. Questions? Use the discussions on each course.",
    ),
    pinned: false,
    email: false,
  });
  const thread = await createThread(
    lerato,
    she.id,
    "Who signs off the inspection checklist?",
    "On our site the foreman wants to sign it. Is that right, or should it be the SHE rep?",
  );
  await reply(
    nomsa,
    thread.id,
    "Good question. The SHE rep completes and signs the checklist; the supervisor signs that they've received it and records the action they'll take.",
  );
  await reply(johan, thread.id, "Same at Site A. We added a column for the supervisor's action and date.");

  // Ratings from the practical day, spread over the last months so the trend has shape.
  const raters = [thandiwe, lerato, johan, kagiso, zanele, rajesh, nadia];
  const scores = [
    [5, 5, 5, 4],
    [4, 5, 5, 5],
    [5, 4, 4, 4],
    [4, 4, 5, 4],
    [5, 5, 4, 5],
    [4, 4, 4, 3],
    [5, 5, 5, 5],
  ];
  const comments = [
    "The yard walk-through made it click.",
    "Very practical, thank you.",
    null,
    "More time on incident reports please.",
    null,
    "Clear and patient.",
    null,
  ];
  for (const [i, l] of raters.entries()) {
    const pending = (await pendingRatings(l.id)).find((p) => p.sessionId === practical.id);
    if (!pending) continue;
    const [knowledge, clarity, relevance, engagement] = scores[i]!;
    await submitRating(l, {
      trainerId: nomsa.id,
      courseId: she.id,
      sessionId: practical.id,
      scores: { knowledge: knowledge!, clarity: clarity!, relevance: relevance!, engagement: engagement! },
      comment: comments[i] ?? "",
    });
  }
  const ratings = await db.trainerRating.findMany({
    where: { trainerId: nomsa.id },
    orderBy: { createdAt: "asc" },
  });
  for (const [i, r] of ratings.entries()) {
    await db.trainerRating.update({
      where: { id: r.id },
      data: { createdAt: new Date(now - (i < 3 ? 40 : 4) * DAY - i * 3600_000) },
    });
  }

  await submitEnquiry(
    {
      name: "Lindiwe Khumalo",
      email: `lindiwe.khumalo@${DOMAIN}`,
      phone: "082 555 0101",
      company: "Mzansi Logistics (Demo)",
      interest: "SHE",
      courseId: she.id,
      message:
        "We need 12 SHE reps trained at our Germiston depot before our DEL inspection in March. Can you run it on site?",
      consent: true,
    },
    "demo-seed",
  );
  await submitEnquiry(
    {
      name: "Michael Naidoo",
      email: `michael.naidoo@${DOMAIN}`,
      phone: "",
      company: "Coastal Accounting (Demo)",
      interest: "TECH",
      courseId: ai.id,
      message:
        "Our 25 staff are starting to use AI tools without guidance. Could you run a half-day session in Durban?",
      consent: true,
    },
    "demo-seed",
  );

  await evaluateAllCourses(new Date());
  await db.platformSetting.create({
    data: { key: DEMO_MARKER, value: { seededAt: new Date().toISOString(), orgId: org.id } },
  });

  return {
    password,
    people: [
      { role: "Super Admin", name: admin.fullName, email: admin.email, totp: totp.admin },
      { role: "Trainer (SHE)", name: nomsa.fullName, email: nomsa.email, totp: totp.nomsa },
      { role: "Trainer (AI)", name: sipho.fullName, email: sipho.email, totp: totp.sipho },
      { role: "Client Manager", name: manager.fullName, email: manager.email },
      ...learners.map((l) => ({ role: "Learner", name: l.fullName, email: l.email })),
    ],
  };
}
