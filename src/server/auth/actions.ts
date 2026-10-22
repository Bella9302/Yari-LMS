"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { audit, clientIp } from "@/server/audit";
import { emailIndex, hashIp } from "@/server/crypto/blind-index";
import { burnPasswordCheck, hashPassword, passwordProblems, verifyPassword } from "@/server/crypto/password";
import {
  clearSessionCookie,
  createSession,
  getCurrentSession,
  invalidateSession,
  invalidateUserSessions,
  markSessionTwoFactorVerified,
  setSessionCookie,
} from "@/server/auth/session";
import {
  consumeRateLimit,
  LOGIN_LIMITS,
  loginThrottled,
  recentHits,
  recordHit,
} from "@/server/auth/rate-limit";
import {
  completeTotpEnrolment,
  disableTotp,
  regenerateRecoveryCodes,
  redeemRecoveryCode,
  verifyTotpForUser,
} from "@/server/auth/totp";
import { authStage, requiresTwoFactor } from "@/server/rbac";
import { requireUser } from "@/server/guards";
import {
  consumeToken,
  DuplicateIdNumberError,
  encryptProfile,
  getOwnIdentity,
  issueToken,
  peekToken,
} from "@/server/pii/users";
import { sendEmail } from "@/server/email/send";
import { passwordResetEmail } from "@/server/email/templates";
import { formValues, safeNextPath, type FormState } from "@/lib/form-state";
import { isValidPassportNumber, isValidSaId } from "@/lib/identity-documents";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/policies";

const MINUTE = 60 * 1000;

async function startSession(userId: string, twoFactorVerified: boolean) {
  const ua = (await headers()).get("user-agent");
  const { token, expiresAt } = await createSession(userId, {
    twoFactorVerified,
    ipHash: hashIp(await clientIp()),
    userAgent: ua,
  });
  await setSessionCookie(token, expiresAt);
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(256),
  next: z.string().optional(),
});

const GENERIC_LOGIN_ERROR = "That email and password don't match an account.";

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: GENERIC_LOGIN_ERROR, values };
  const { email, password, next } = parsed.data;

  const ip = (await clientIp()) ?? "unknown";
  // Generous per network: a whole site's learners often sign in from one Wi-Fi address on a
  // training day. Guessing one account's password is stopped by the per-account lockout.
  if (!(await consumeRateLimit(`login-ip:${ip}`, 100, 15 * MINUTE))) {
    return { error: "Too many sign-in attempts from this network. Please wait 15 minutes.", values };
  }

  const emailKey = emailIndex(email);
  const pairKey = `login-fail:${emailKey}:${ip}`;
  const emailFailKey = `login-fail:${emailKey}`;
  const [perConnection, perEmail] = await Promise.all([
    recentHits(pairKey, LOGIN_LIMITS.perConnection.windowMs),
    recentHits(emailFailKey, LOGIN_LIMITS.perEmail.windowMs),
  ]);
  if (loginThrottled({ perConnection, perEmail })) {
    await burnPasswordCheck(password);
    return {
      error: "Too many failed attempts for this email. Wait 15 minutes, or reset your password.",
      values,
    };
  }
  const failed = async (userId: string | null) => {
    await Promise.all([recordHit(pairKey), recordHit(emailFailKey)]);
    if (userId) await db.user.update({ where: { id: userId }, data: { failedLogins: { increment: 1 } } });
    await audit({ actorId: null, action: "auth.login_failed", entityType: "User", entityId: userId });
    return { error: GENERIC_LOGIN_ERROR, values };
  };

  const user = await db.user.findUnique({
    where: { emailIdx: emailKey },
    select: { id: true, passwordHash: true, status: true, totpEnabledAt: true },
  });

  if (!user || !user.passwordHash || user.status !== "ACTIVE") {
    await burnPasswordCheck(password);
    return failed(user?.id ?? null);
  }
  if (!(await verifyPassword(user.passwordHash, password))) return failed(user.id);

  await db.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await startSession(user.id, false);
  await audit({ actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id });

  const session = await getCurrentSessionAfterLogin(user.id, user.totpEnabledAt != null);
  if (session === "needs-2fa")
    redirect(`/login/2fa${next ? `?next=${encodeURIComponent(safeNextPath(next))}` : ""}`);
  if (session === "needs-2fa-setup") redirect("/setup-2fa");
  redirect(safeNextPath(next));
}

// The cookie set during this request isn't visible to getCurrentSession() yet, so work the stage out directly.
async function getCurrentSessionAfterLogin(userId: string, totpEnabled: boolean) {
  if (totpEnabled) return "needs-2fa" as const;
  const roles = await db.roleAssignment.findMany({
    where: { userId },
    select: { role: true, organizationId: true },
  });
  return requiresTwoFactor(roles) ? ("needs-2fa-setup" as const) : ("ok" as const);
}

export async function logoutAction(): Promise<void> {
  const session = await getCurrentSession();
  if (session) {
    await invalidateSession(session.sessionId);
    await audit({
      actorId: session.user.id,
      action: "auth.logout",
      entityType: "User",
      entityId: session.user.id,
    });
  }
  await clearSessionCookie();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Two-factor authentication
// ---------------------------------------------------------------------------

export async function verifyTwoFactorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getCurrentSession();
  if (authStage(session) !== "needs-2fa") redirect("/login");
  const userId = session!.user.id;

  if (!(await consumeRateLimit(`2fa:${userId}`, 10, 15 * MINUTE))) {
    return { error: "Too many attempts. Please wait 15 minutes and try again." };
  }

  const code = String(formData.get("code") ?? "").trim();
  const isRecovery = /[a-z]/i.test(code);
  const ok = isRecovery ? await redeemRecoveryCode(userId, code) : await verifyTotpForUser(userId, code);
  if (!ok) {
    await audit({ actorId: userId, action: "auth.2fa_failed", entityType: "User", entityId: userId });
    return { error: "That code didn't work. Check your authenticator app and try again." };
  }
  if (isRecovery) {
    await audit({ actorId: userId, action: "auth.recovery_code_used", entityType: "User", entityId: userId });
  }

  // Rotate the session on privilege change.
  await invalidateSession(session!.sessionId);
  await startSession(userId, true);
  redirect(safeNextPath(formData.get("next")));
}

export interface EnrolState extends FormState {
  recoveryCodes?: string[];
}

export async function confirmTotpEnrolmentAction(_prev: EnrolState, formData: FormData): Promise<EnrolState> {
  const session = await getCurrentSession();
  const stage = authStage(session);
  if (stage === "anonymous" || stage === "needs-2fa") redirect("/login");
  const userId = session!.user.id;
  if (session!.user.totpEnabled) redirect("/account/security");

  if (!(await consumeRateLimit(`2fa-setup:${userId}`, 10, 15 * MINUTE))) {
    return { error: "Too many attempts. Please wait 15 minutes and try again." };
  }
  if (!(await verifyTotpForUser(userId, String(formData.get("code") ?? "")))) {
    return {
      error: "That code didn't match. Make sure your phone's clock is correct and try the newest code.",
    };
  }

  const recoveryCodes = await completeTotpEnrolment(userId);
  await audit({ actorId: userId, action: "auth.2fa_enabled", entityType: "User", entityId: userId });
  // Mark the existing session rather than rotating the cookie: setting a cookie here would
  // re-render the page and lose the one-time display of the recovery codes.
  await markSessionTwoFactorVerified(session!.sessionId);
  return { ok: true, recoveryCodes };
}

export async function disableTotpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, user } = await requireUser();
  if (requiresTwoFactor(user.roles)) {
    return { error: "Two-factor authentication is required for your role and can't be turned off." };
  }
  const password = String(formData.get("currentPassword") ?? "");
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row.passwordHash || !(await verifyPassword(row.passwordHash, password))) {
    return { error: "Your password is incorrect." };
  }
  await disableTotp(user.id);
  await invalidateUserSessions(user.id, session.sessionId);
  await audit({ actorId: user.id, action: "auth.2fa_disabled", entityType: "User", entityId: user.id });
  return { ok: true, message: "Two-factor authentication is off." };
}

export async function regenerateRecoveryCodesAction(
  _prev: EnrolState,
  formData: FormData,
): Promise<EnrolState> {
  const { user } = await requireUser();
  if (!user.totpEnabled) return { error: "Turn on two-factor authentication first." };
  const password = String(formData.get("currentPassword") ?? "");
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row.passwordHash || !(await verifyPassword(row.passwordHash, password))) {
    return { error: "Your password is incorrect." };
  }
  const recoveryCodes = await regenerateRecoveryCodes(user.id);
  await audit({
    actorId: user.id,
    action: "auth.recovery_codes_regenerated",
    entityType: "User",
    entityId: user.id,
  });
  return { ok: true, recoveryCodes };
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const done: FormState = {
    ok: true,
    message: "If an account exists for that email, we've sent a reset link. It's valid for one hour.",
  };
  if (!z.string().email().safeParse(email).success)
    return { error: "Enter a valid email address.", values: { email } };

  const ip = (await clientIp()) ?? "unknown";
  if (
    !(await consumeRateLimit(`reset-ip:${ip}`, 10, 60 * MINUTE)) ||
    !(await consumeRateLimit(`reset-email:${emailIndex(email)}`, 3, 60 * MINUTE))
  ) {
    return done; // Don't reveal rate limiting per account.
  }

  const user = await db.user.findUnique({
    where: { emailIdx: emailIndex(email) },
    select: { id: true, status: true },
  });
  if (user?.status === "ACTIVE") {
    const token = await db.$transaction((tx) => issueToken(tx, user.id, "PASSWORD_RESET", 60 * MINUTE));
    const identity = await getOwnIdentity(user.id);
    await sendEmail(
      passwordResetEmail({ to: identity.email, url: `${env().APP_URL}/reset-password/${token}` }),
    );
    await audit({
      actorId: null,
      action: "auth.password_reset_requested",
      entityType: "User",
      entityId: user.id,
    });
  }
  return done;
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirmPassword") ?? "")) {
    return { fieldErrors: { confirmPassword: "Passwords don't match." } };
  }
  const problems = passwordProblems(password);
  if (problems.length) return { fieldErrors: { password: problems.join(" ") } };

  // Check the link before the (deliberately expensive) password hash, so junk tokens cost nothing.
  const expired = { error: "This reset link has expired or was already used. Request a new one." };
  const ip = (await clientIp()) ?? "unknown";
  if (!(await consumeRateLimit(`reset-submit:${ip}`, 20, 15 * MINUTE))) {
    return { error: "Too many attempts from this network. Please wait 15 minutes." };
  }
  if (!(await peekToken(token, "PASSWORD_RESET"))) return expired;

  const passwordHash = await hashPassword(password);
  const userId = await db.$transaction(async (tx) => {
    const id = await consumeToken(tx, token, "PASSWORD_RESET");
    if (!id) return null;
    await tx.user.update({ where: { id }, data: { passwordHash, failedLogins: 0, lockedUntil: null } });
    return id;
  });
  if (!userId) return expired;

  await invalidateUserSessions(userId);
  await audit({
    actorId: userId,
    action: "auth.password_changed",
    entityType: "User",
    entityId: userId,
    meta: { via: "reset" },
  });
  redirect("/login?reset=1");
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, user } = await requireUser();
  const current = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirmPassword") ?? "")) {
    return { fieldErrors: { confirmPassword: "Passwords don't match." } };
  }
  const identity = await getOwnIdentity(user.id);
  const problems = passwordProblems(password, [
    identity.email.split("@")[0]!,
    ...identity.fullName.split(" "),
  ]);
  if (problems.length) return { fieldErrors: { password: problems.join(" ") } };

  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row.passwordHash || !(await verifyPassword(row.passwordHash, current))) {
    return { fieldErrors: { currentPassword: "Your current password is incorrect." } };
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  await invalidateUserSessions(user.id, session.sessionId);
  await audit({ actorId: user.id, action: "auth.password_changed", entityType: "User", entityId: user.id });
  return { ok: true, message: "Password changed. You've been signed out on your other devices." };
}

// ---------------------------------------------------------------------------
// Accepting an invitation
// ---------------------------------------------------------------------------

const acceptSchema = z
  .object({
    token: z.string().min(10),
    fullName: z.string().trim().min(2, "Enter your full name.").max(120),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(/^$|^\+?[0-9 ()-]{9,20}$/, "Enter a valid phone number.")
      .optional(),
    idType: z.enum(["SA_ID", "PASSPORT"]).optional(),
    idNumber: z.string().trim().max(32).optional(),
    passportCountry: z.string().trim().max(2).optional(),
    password: z.string(),
    confirmPassword: z.string(),
    acceptTerms: z.string().optional(),
    acceptPrivacy: z.string().optional(),
    marketing: z.literal("on").optional(),
  })
  // Checked in one refinement so every problem is reported at once (zod skips refinements
  // when the base shape fails).
  .superRefine((v, ctx) => {
    if (v.acceptTerms !== "on") {
      ctx.addIssue({
        code: "custom",
        path: ["acceptTerms"],
        message: "You need to accept the terms to continue.",
      });
    }
    if (v.acceptPrivacy !== "on") {
      ctx.addIssue({
        code: "custom",
        path: ["acceptPrivacy"],
        message: "You need to accept the privacy notice to continue.",
      });
    }
    if (v.password !== v.confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords don't match." });
    }
    if (v.idNumber) {
      if (v.idType === "SA_ID" && !isValidSaId(v.idNumber)) {
        ctx.addIssue({
          code: "custom",
          path: ["idNumber"],
          message: "That isn't a valid South African ID number.",
        });
      }
      if (v.idType === "PASSPORT") {
        if (!isValidPassportNumber(v.idNumber)) {
          ctx.addIssue({ code: "custom", path: ["idNumber"], message: "Enter a valid passport number." });
        }
        if (!/^[A-Z]{2}$/i.test(v.passportCountry ?? "")) {
          ctx.addIssue({
            code: "custom",
            path: ["passportCountry"],
            message: "Choose the country that issued it.",
          });
        }
      }
    }
  });

export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = acceptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values };
  }
  const input = parsed.data;

  const pending = await peekToken(input.token, "INVITE");
  if (!pending) return { error: "This invitation link is invalid or has expired." };

  const roles = await db.roleAssignment.findMany({
    where: { userId: pending.userId },
    select: { role: true },
  });
  const isLearner = roles.some((r) => r.role === "LEARNER");
  if (isLearner && !input.idNumber) {
    return { fieldErrors: { idNumber: "Learners need an ID or passport number for their records." }, values };
  }

  const identity = await getOwnIdentity(pending.userId);
  const problems = passwordProblems(input.password, [
    identity.email.split("@")[0]!,
    ...input.fullName.split(" "),
  ]);
  if (problems.length) return { fieldErrors: { password: problems.join(" ") }, values };
  const passwordHash = await hashPassword(input.password);

  try {
    const userId = await db.$transaction(async (tx) => {
      const id = await consumeToken(tx, input.token, "INVITE");
      if (!id) return null;
      const profile = encryptProfile(id, {
        fullName: input.fullName,
        phone: input.phone || null,
        ...(input.idNumber
          ? {
              idType: input.idType ?? "SA_ID",
              idNumber: input.idNumber,
              passportCountry: input.passportCountry?.toUpperCase(),
            }
          : {}),
      });
      if (profile.idNumberIdx) {
        const clash = await tx.userProfile.findUnique({ where: { idNumberIdx: profile.idNumberIdx } });
        if (clash && clash.userId !== id) throw new DuplicateIdNumberError();
      }
      await tx.userProfile.update({ where: { userId: id }, data: profile });
      await tx.user.update({
        where: { id },
        data: { passwordHash, status: "ACTIVE", lastLoginAt: new Date() },
      });
      await tx.consent.createMany({
        data: [
          { userId: id, purpose: "TERMS", policyVersion: TERMS_VERSION },
          { userId: id, purpose: "PRIVACY", policyVersion: PRIVACY_VERSION },
          ...(input.marketing
            ? [{ userId: id, purpose: "MARKETING" as const, policyVersion: PRIVACY_VERSION }]
            : []),
        ],
      });
      await audit(
        {
          actorId: id,
          action: "user.invite_accepted",
          entityType: "User",
          entityId: id,
          fields: Object.keys(profile).filter((k) => k.endsWith("Enc")),
          meta: { consents: input.marketing ? ["TERMS", "PRIVACY", "MARKETING"] : ["TERMS", "PRIVACY"] },
        },
        tx,
      );
      return id;
    });
    if (!userId) return { error: "This invitation link is invalid or has expired." };
    await startSession(userId, false);
  } catch (err) {
    if (err instanceof DuplicateIdNumberError) return { fieldErrors: { idNumber: err.message }, values };
    throw err;
  }

  redirect(roles.some((r) => r.role === "SUPER_ADMIN" || r.role === "TRAINER") ? "/setup-2fa" : "/dashboard");
}

export async function signOutOtherSessionsAction(): Promise<void> {
  const { session, user } = await requireUser();
  await invalidateUserSessions(user.id, session.sessionId);
  await audit({
    actorId: user.id,
    action: "auth.logout",
    entityType: "User",
    entityId: user.id,
    meta: { scope: "other-sessions" },
  });
  revalidatePath("/account/security");
}
