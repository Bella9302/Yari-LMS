import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import { getUserDetail } from "@/server/pii/users";
import { ROLE_LABELS } from "@/lib/roles";
import { DetailItem } from "@/ui/primitives";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function AccountPage() {
  const { user } = await requireUser();
  const me = (await getUserDetail({ id: user.id, roles: user.roles }, user.id))!;
  const roleNames = [...new Set(me.roles.map((r) => ROLE_LABELS[r.role]))].join(", ");

  return (
    <div className="space-y-10">
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <DetailItem label="Full name" value={me.fullName} />
        <DetailItem label="Email" value={me.email} />
        <DetailItem
          label={me.idType === "PASSPORT" ? `Passport (${me.passportCountry ?? "—"})` : "SA ID number"}
          value={me.idNumber ? <span className="font-mono tracking-wider">{me.idNumber}</span> : "—"}
        />
        <DetailItem label="Role" value={roleNames} />
        {me.organizations.length > 0 && (
          <DetailItem label="Company" value={me.organizations.map((o) => o.name).join(", ")} />
        )}
      </dl>
      <p className="text-muted text-sm">
        To correct your name, email or ID details, contact YARI GROUP — we verify these changes because they
        appear on your certificates.
      </p>
      <section className="border-line border-t pt-8">
        <h2 className="font-display text-h3">Contact details</h2>
        <ProfileForm preferredName={me.preferredName ?? ""} phone={me.phone ?? ""} />
      </section>
    </div>
  );
}
