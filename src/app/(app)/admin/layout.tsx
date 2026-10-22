import { requireRole } from "@/server/guards";
import { SubNav } from "@/ui/sub-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("SUPER_ADMIN");
  return (
    <div className="space-y-8">
      <SubNav
        label="Administration"
        items={[
          { href: "/admin/users", label: "People" },
          { href: "/admin/organizations", label: "Companies" },
          { href: "/admin/announcements", label: "Announcements" },
          { href: "/admin/ratings", label: "Ratings" },
          { href: "/admin/data-requests", label: "Data requests" },
          { href: "/admin/audit", label: "Audit log" },
        ]}
      />
      {children}
    </div>
  );
}
