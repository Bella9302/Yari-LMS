import { requireRole } from "@/server/guards";

export default async function TeachLayout({ children }: { children: React.ReactNode }) {
  await requireRole("TRAINER", "SUPER_ADMIN");
  return children;
}
