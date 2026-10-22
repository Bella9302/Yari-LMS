import { AppShell, type NavKey } from "@/ui/app-shell";
import { hasRole } from "@/server/rbac";
import { requireUser } from "@/server/guards";
import { getOwnIdentity } from "@/server/pii/users";
import { logoutAction } from "@/server/auth/actions";
import { unreadCount } from "@/server/engagement/notifications";
import { ROLE_LABELS } from "@/lib/roles";
import type { Role } from "@/generated/prisma/enums";

const ROLE_PRIORITY: Role[] = ["SUPER_ADMIN", "TRAINER", "CLIENT_MANAGER", "LEARNER"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const [identity, unread] = await Promise.all([getOwnIdentity(user.id), unreadCount(user.id)]);

  const nav: NavKey[] = ["home"];
  if (hasRole(user.roles, "LEARNER")) nav.push("learn");
  if (hasRole(user.roles, "TRAINER") || hasRole(user.roles, "SUPER_ADMIN")) nav.push("teach");
  if (hasRole(user.roles, "CLIENT_MANAGER")) nav.push("org");
  if (hasRole(user.roles, "SUPER_ADMIN")) nav.push("admin");

  const primaryRole = ROLE_PRIORITY.find((r) => hasRole(user.roles, r));

  return (
    <AppShell
      nav={nav}
      displayName={identity.fullName}
      roleLabel={primaryRole ? ROLE_LABELS[primaryRole] : ""}
      logout={logoutAction}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
