import { PageHeader } from "@/ui/primitives";
import { SubNav } from "@/ui/sub-nav";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Account" title="Your account" />
      <SubNav
        label="Account sections"
        items={[
          { href: "/account", label: "Profile", exact: true },
          { href: "/account/security", label: "Security" },
          { href: "/account/badges", label: "Badges" },
          { href: "/account/privacy", label: "Privacy" },
        ]}
      />
      <div className="max-w-2xl">{children}</div>
    </div>
  );
}
