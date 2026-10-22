// Role metadata shared by server and client code.
import type { Role } from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  TRAINER: "Trainer",
  LEARNER: "Learner",
  CLIENT_MANAGER: "Client Manager",
};

/** Roles that must use two-factor authentication before doing anything else. */
export const ROLES_REQUIRING_2FA: readonly Role[] = ["SUPER_ADMIN", "TRAINER"];

export type Workspace = "learn" | "teach" | "org" | "admin";

export const WORKSPACE_FOR_ROLE: Record<Role, Workspace> = {
  LEARNER: "learn",
  TRAINER: "teach",
  CLIENT_MANAGER: "org",
  SUPER_ADMIN: "admin",
};

export const WORKSPACE_LABELS: Record<Workspace, string> = {
  learn: "Learning",
  teach: "Teaching",
  org: "My company",
  admin: "Administration",
};
