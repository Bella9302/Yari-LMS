import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import { getUserDetail, pendingCompanyInvitations } from "@/server/pii/users";
import { respondCompanyInvitationAction } from "@/server/actions/account";
import { Button } from "@/ui/button";
import { ROLE_LABELS } from "@/lib/roles";
import { DetailItem } from "@/ui/primitives";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function AccountPage() {
  const { user } = await requireUser();
  const me = (await getUserDetail({ id: user.id, roles: user.roles }, user.id))!;
  const roleNames = [...new Set(me.roles.map((r) => ROLE_LABELS[r.role]))].join(", ");
  const invitations = await pendingCompanyInvitations(user.id);

  return (
    <div className="space-y-10">
      {invitations.map((inv) => (
        <section
          key={inv.id}
          aria-label={`Invitation from ${inv.organization.name}`}
          className="border-fg space-y-3 border-l-2 py-1 pl-5"
        >
          <h2 className="font-display text-h3">{inv.organization.name} would like to add you</h2>
          <p className="text-muted">
            If you accept, {inv.organization.name} can enrol you on training and see your name, email and
            progress on the courses it arranges for you. Nothing is shared unless you accept.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { accept: true, label: "Accept" },
              { accept: false, label: "Decline" },
            ].map((b) => (
              <form key={b.label} action={respondCompanyInvitationAction}>
                <input type="hidden" name="id" value={inv.id} />
                <input type="hidden" name="accept" value={String(b.accept)} />
                <Button type="submit" variant={b.accept ? "primary" : "secondary"}>
                  {b.label}
                </Button>
              </form>
            ))}
          </div>
        </section>
      ))}
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
