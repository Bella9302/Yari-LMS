import { describe, expect, it } from "vitest";
import { generateHOTP } from "@oslojs/otp";
import { matchingStep } from "@/server/auth/totp";
import { lockoutUntil } from "@/server/auth/rate-limit";
import { authStage, canAccessOrg, orgScope } from "@/server/rbac";
import { assertCanInvite, PermissionError } from "@/server/pii/users";
import { safeNextPath } from "@/lib/form-state";
import { generateReadableCode } from "@/server/crypto/tokens";
import type { ValidSession } from "@/server/auth/session";

const admin = { id: "a", roles: [{ role: "SUPER_ADMIN" as const, organizationId: null }] };
const manager = { id: "m", roles: [{ role: "CLIENT_MANAGER" as const, organizationId: "org-a" }] };
const learner = { id: "l", roles: [{ role: "LEARNER" as const, organizationId: null }] };

function session(
  roles: ValidSession["user"]["roles"],
  totpEnabled: boolean,
  verified: boolean,
): ValidSession {
  return {
    sessionId: "s",
    twoFactorVerified: verified,
    expiresAt: new Date(),
    user: { id: "u", status: "ACTIVE", totpEnabled, roles },
  };
}

describe("auth stage", () => {
  it("requires 2FA setup for admins and trainers", () => {
    expect(authStage(session(admin.roles, false, false))).toBe("needs-2fa-setup");
    expect(authStage(session([{ role: "TRAINER", organizationId: null }], false, false))).toBe(
      "needs-2fa-setup",
    );
  });
  it("lets learners and client managers in without 2FA", () => {
    expect(authStage(session(learner.roles, false, false))).toBe("ok");
    expect(authStage(session(manager.roles, false, false))).toBe("ok");
  });
  it("asks for a code whenever 2FA is enabled but not yet verified", () => {
    expect(authStage(session(learner.roles, true, false))).toBe("needs-2fa");
    expect(authStage(session(admin.roles, true, true))).toBe("ok");
    expect(authStage(null)).toBe("anonymous");
  });
});

describe("tenant scoping", () => {
  it("limits client managers to their own companies", () => {
    expect(canAccessOrg(manager.roles, "org-a")).toBe(true);
    expect(canAccessOrg(manager.roles, "org-b")).toBe(false);
    expect(canAccessOrg(learner.roles, "org-a")).toBe(false);
    expect(canAccessOrg(admin.roles, "org-b")).toBe(true);
    expect(orgScope(manager.roles)).toEqual({ in: ["org-a"] });
    expect(orgScope(admin.roles)).toBeUndefined();
  });
});

describe("invite permissions", () => {
  it("lets admins invite anyone", () => {
    expect(() => assertCanInvite(admin, "SUPER_ADMIN", null)).not.toThrow();
    expect(() => assertCanInvite(admin, "CLIENT_MANAGER", "org-b")).not.toThrow();
  });
  it("requires a company for client managers", () => {
    expect(() => assertCanInvite(admin, "CLIENT_MANAGER", null)).toThrow(PermissionError);
  });
  it("lets client managers invite only learners into their own company", () => {
    expect(() => assertCanInvite(manager, "LEARNER", "org-a")).not.toThrow();
    expect(() => assertCanInvite(manager, "LEARNER", "org-b")).toThrow(PermissionError);
    expect(() => assertCanInvite(manager, "LEARNER", null)).toThrow(PermissionError);
    expect(() => assertCanInvite(manager, "TRAINER", "org-a")).toThrow(PermissionError);
    expect(() => assertCanInvite(manager, "CLIENT_MANAGER", "org-a")).toThrow(PermissionError);
  });
  it("doesn't let learners invite", () => {
    expect(() => assertCanInvite(learner, "LEARNER", "org-a")).toThrow(PermissionError);
  });
});

describe("TOTP", () => {
  const key = new Uint8Array(20).fill(7);
  it("accepts the current step and one either side", () => {
    for (const offset of [-1, 0, 1]) {
      expect(matchingStep(key, generateHOTP(key, BigInt(1000 + offset), 6), 1000)).toBe(1000 + offset);
    }
  });
  it("rejects codes two steps away", () => {
    expect(matchingStep(key, generateHOTP(key, 998n, 6), 1000)).toBeNull();
  });
});

describe("lockout", () => {
  it("starts after five failures and doubles, capped at a day", () => {
    const now = 0;
    expect(lockoutUntil(4, now)).toBeNull();
    expect(lockoutUntil(5, now)!.getTime()).toBe(15 * 60_000);
    expect(lockoutUntil(6, now)!.getTime()).toBe(30 * 60_000);
    expect(lockoutUntil(50, now)!.getTime()).toBe(24 * 60 * 60_000);
  });
});

describe("redirect safety", () => {
  it("only allows same-site paths", () => {
    expect(safeNextPath("/admin/users")).toBe("/admin/users");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
  });
});

describe("readable codes", () => {
  it("uses an unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++)
      expect(generateReadableCode(2, 5)).toMatch(/^[2-9A-HJKMNP-TV-Z]{5}-[2-9A-HJKMNP-TV-Z]{5}$/);
  });
});
