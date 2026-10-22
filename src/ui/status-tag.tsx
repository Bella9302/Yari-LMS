import type { UserStatus } from "@/generated/prisma/enums";
import { Tag } from "@/ui/primitives";

export function UserStatusTag({ status }: { status: UserStatus }) {
  const tone = status === "ACTIVE" ? "success" : status === "SUSPENDED" ? "danger" : "neutral";
  return <Tag tone={tone}>{status.toLowerCase()}</Tag>;
}
