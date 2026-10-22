import "server-only";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { isSuperAdmin } from "@/server/rbac";
import { dec, enc } from "@/server/pii/fields";
import { emailIndex } from "@/server/crypto/blind-index";
import { PermissionError, type Actor } from "@/server/pii/users";
import { AssessmentError } from "@/server/assessment/errors";
import { eraseCertificateHolder } from "@/server/certificates/service";
import { storage } from "@/server/storage";

// POPIA section 23 (access) and section 24 (correction/deletion).
//
// Access: a Super Admin confirms the request, then the person downloads their own copy while
// signed in, for EXPORT_DAYS. Nothing personal is ever emailed.
//
// Deletion: the account is anonymised rather than the row removed, so course statistics and
// company completion counts stay correct, but nothing left can identify the person.

export const EXPORT_DAYS = 7;
const DAY = 86_400_000;

/** Everything held about a person, decrypted, in plain JSON. */
export async function buildDataExport(userId: string) {
  const u = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      profile: true,
      roles: { include: { organization: { select: { name: true } } } },
      memberships: { include: { organization: { select: { name: true } } } },
      consents: { orderBy: { grantedAt: "asc" } },
      dataRequests: { orderBy: { createdAt: "asc" } },
      enrolments: {
        include: {
          course: { select: { title: true } },
          progress: { include: { item: { select: { title: true } } } },
          quizAttempts: { include: { quiz: { select: { item: { select: { title: true } } } } } },
          submissions: {
            include: {
              assignment: { select: { item: { select: { title: true } } } },
              files: { include: { asset: { select: { filename: true, bytes: true } } } },
              mark: { select: { score: true, feedbackText: true, status: true, releasedAt: true } },
            },
          },
        },
      },
      attendance: { include: { session: { select: { title: true, startsAt: true } } } },
      ratingsGiven: { include: { course: { select: { title: true } } } },
      posts: { include: { thread: { select: { title: true } } } },
      certificates: {
        select: { code: true, courseTitle: true, completedAt: true, issuedAt: true, revokedAt: true },
      },
      badges: { select: { badge: true, awardedAt: true, course: { select: { title: true } } } },
    },
  });
  const p = u.profile;
  // Who looked at or changed this person's details (POPIA: recipients of their information).
  const accessLog = await db.auditLog.findMany({
    where: {
      entityId: userId,
      action: { in: ["pii.viewed", "pii.updated", "user.updated", "user.roles_changed"] },
    },
    orderBy: { at: "asc" },
    select: { action: true, at: true, fields: true, actorId: true },
  });

  return {
    exportedAt: new Date().toISOString(),
    account: {
      email: dec.email(u.id, u.emailEnc),
      status: u.status,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      twoStepVerification: Boolean(u.totpEnabledAt),
      roles: u.roles.map((r) => ({ role: r.role, company: r.organization?.name ?? null })),
    },
    profile: p
      ? {
          fullName: dec.fullName(u.id, p.fullNameEnc),
          preferredName: dec.preferredName(u.id, p.preferredNameEnc),
          idType: p.idType,
          idNumber: dec.idNumber(u.id, p.idNumberEnc),
          passportCountry: p.passportCountry,
          phone: dec.phone(u.id, p.phoneEnc),
          address: dec.address(u.id, p.addressEnc),
          employer: dec.employer(u.id, p.employerEnc),
        }
      : null,
    companies: u.memberships.map((m) => ({
      company: m.organization.name,
      department: m.department,
      employeeRef: dec.employeeRef(m.id, m.employeeRefEnc),
    })),
    consents: u.consents.map((c) => ({
      purpose: c.purpose,
      version: c.policyVersion,
      grantedAt: c.grantedAt,
      withdrawnAt: c.withdrawnAt,
    })),
    dataRequests: u.dataRequests.map((r) => ({
      type: r.type,
      status: r.status,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    })),
    training: u.enrolments.map((e) => ({
      course: e.course.title,
      status: e.status,
      progressPct: e.progressPct,
      enrolledAt: e.createdAt,
      dueAt: e.dueAt,
      completedAt: e.completedAt,
      items: e.progress.map((ip) => ({
        item: ip.item.title,
        status: ip.status,
        timeSpentMinutes: Math.round(ip.timeSpentSec / 60),
        completedAt: ip.completedAt,
      })),
      quizzes: e.quizAttempts.map((a) => ({
        quiz: a.quiz.item.title,
        attempt: a.attemptNo,
        status: a.status,
        scorePct: a.scorePct,
        submittedAt: a.submittedAt,
        answers: a.answers,
      })),
      assignments: e.submissions.map((s) => ({
        assignment: s.assignment.item.title,
        attempt: s.attemptNo,
        submittedAt: s.submittedAt,
        late: s.isLate,
        text: s.text,
        files: s.files.map((f) => f.asset.filename),
        mark: s.mark?.status === "RELEASED" ? { score: s.mark.score, feedback: s.mark.feedbackText } : null,
      })),
    })),
    attendance: u.attendance.map((a) => ({
      session: a.session.title,
      startsAt: a.session.startsAt,
      status: a.status,
      method: a.method,
    })),
    ratingsGiven: u.ratingsGiven.map((r) => ({
      course: r.course.title,
      knowledge: r.knowledge,
      clarity: r.clarity,
      relevance: r.relevance,
      engagement: r.engagement,
      comment: r.comment,
      at: r.createdAt,
    })),
    discussionPosts: u.posts
      .filter((p) => !p.deletedAt)
      .map((p) => ({ topic: p.thread.title, body: p.body, at: p.createdAt })),
    certificates: u.certificates,
    badges: u.badges.map((b) => ({
      badge: b.badge,
      course: b.course?.title ?? null,
      awardedAt: b.awardedAt,
    })),
    accessLog: accessLog.map((a) => ({
      action: a.action,
      at: a.at,
      fields: a.fields,
      by: a.actorId === userId ? "you" : "YARI staff or your company's manager",
    })),
  };
}

/** Until when the person's approved copy can be downloaded, or null if none is available. */
export async function exportAvailableUntil(userId: string, now = new Date()): Promise<Date | null> {
  const ready = await db.dataRequest.findFirst({
    where: {
      userId,
      type: "EXPORT",
      status: "COMPLETED",
      completedAt: { gte: new Date(now.getTime() - EXPORT_DAYS * DAY) },
    },
    orderBy: { completedAt: "desc" },
  });
  return ready?.completedAt ? new Date(ready.completedAt.getTime() + EXPORT_DAYS * DAY) : null;
}

/** The person's own export, available for EXPORT_DAYS after an admin completes their request. */
export async function exportForSelf(userId: string, now = new Date()) {
  const ready = await db.dataRequest.findFirst({
    where: {
      userId,
      type: "EXPORT",
      status: "COMPLETED",
      completedAt: { gte: new Date(now.getTime() - EXPORT_DAYS * DAY) },
    },
    orderBy: { completedAt: "desc" },
  });
  if (!ready) return null;
  const data = await buildDataExport(userId);
  await audit({
    actorId: userId,
    action: "data_request.updated",
    entityType: "DataRequest",
    entityId: ready.id,
    meta: { downloaded: true },
  });
  return data;
}

/**
 * Anonymises an account. Kept (without identity): enrolment status and progress numbers, quiz
 * and assignment scores, attendance, ratings (already anonymous). Removed: profile, email,
 * credentials, written work and uploaded files, feedback, discussion text, certificates' name,
 * badges and notifications.
 */
export async function eraseAccount(actor: Actor, userId: string, requestId?: string) {
  if (!isSuperAdmin(actor.roles)) throw new PermissionError();
  if (userId === actor.id)
    throw new AssessmentError("You can't erase your own account. Ask another Super Admin.");
  const target = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: true } });
  if (target.status === "DELETED") throw new AssessmentError("This account has already been erased.");
  if (target.roles.some((r) => r.role === "SUPER_ADMIN")) {
    const others = await db.user.count({
      where: { id: { not: userId }, status: "ACTIVE", roles: { some: { role: "SUPER_ADMIN" } } },
    });
    if (others === 0) throw new AssessmentError("This is the last active Super Admin and can't be erased.");
  }

  // Files the person uploaded as coursework, and feedback files/audio about their work.
  const submissions = await db.submission.findMany({
    where: { enrolment: { userId } },
    select: {
      id: true,
      files: { select: { asset: { select: { id: true, storageKey: true } } } },
      mark: {
        select: {
          feedbackAsset: { select: { id: true, storageKey: true } },
          audioAsset: { select: { id: true, storageKey: true } },
        },
      },
    },
  });
  const assets = submissions.flatMap((s) => [
    ...s.files.map((f) => f.asset),
    ...(s.mark?.feedbackAsset ? [s.mark.feedbackAsset] : []),
    ...(s.mark?.audioAsset ? [s.mark.audioAsset] : []),
  ]);

  const tombstone = `erased+${userId}@invalid.yarigroup.co.za`;
  const now = new Date();
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        status: "DELETED",
        deletedAt: now,
        emailEnc: enc.email(userId, tombstone),
        emailIdx: emailIndex(tombstone),
        passwordHash: null,
        totpSecretEnc: null,
        totpEnabledAt: null,
        totpLastStep: null,
      },
    }),
    db.userProfile.updateMany({
      where: { userId },
      data: {
        fullNameEnc: enc.fullName(userId, "Erased account"),
        preferredNameEnc: null,
        idType: null,
        idNumberEnc: null,
        idNumberIdx: null,
        passportCountry: null,
        phoneEnc: null,
        addressEnc: null,
        employerEnc: null,
      },
    }),
    db.orgMembership.updateMany({ where: { userId }, data: { employeeRefEnc: null, department: null } }),
    db.authSession.deleteMany({ where: { userId } }),
    db.authToken.deleteMany({ where: { userId } }),
    db.recoveryCode.deleteMany({ where: { userId } }),
    db.consent.updateMany({ where: { userId, withdrawnAt: null }, data: { withdrawnAt: now } }),
    db.courseStaff.deleteMany({ where: { userId } }),
    db.submission.updateMany({ where: { enrolment: { userId } }, data: { text: null } }),
    db.submissionFile.deleteMany({ where: { submission: { enrolment: { userId } } } }),
    db.mark.updateMany({
      where: { submission: { enrolment: { userId } } },
      data: { feedbackText: null, feedbackAssetId: null, audioAssetId: null, rubricSelections: {} },
    }),
    db.quizAttempt.updateMany({ where: { enrolment: { userId } }, data: { answers: {} } }),
    db.discussionPost.updateMany({ where: { authorId: userId }, data: { body: "", deletedAt: now } }),
    db.trainerRating.updateMany({ where: { raterId: userId }, data: { raterId: null } }),
    db.notification.deleteMany({ where: { userId } }),
    db.userBadge.deleteMany({ where: { userId } }),
    db.asset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } }),
    ...(requestId
      ? [
          db.dataRequest.update({
            where: { id: requestId },
            data: { status: "COMPLETED", completedAt: now, handledById: actor.id },
          }),
        ]
      : []),
  ]);
  await eraseCertificateHolder(userId);
  // Storage objects go after the database commit; a leftover object without a row is unreachable.
  for (const a of assets) {
    try {
      await storage().delete(a.storageKey);
    } catch (err) {
      console.error("[erase] could not delete stored file", a.id, err);
    }
  }
  await audit({
    actorId: actor.id,
    action: "user.erased",
    entityType: "User",
    entityId: userId,
    meta: { files: assets.length, requestId: requestId ?? null },
  });
}
