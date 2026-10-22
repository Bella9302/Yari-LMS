import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/guards";
import { ENQUIRY_STATUS_TONE as STATUS_TONE, getEnquiry, INTEREST_LABELS } from "@/server/public/enquiries";
import { deleteEnquiryAction, setEnquiryStatusAction } from "@/server/actions/public";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/ui/button";
import { DetailItem, Tag } from "@/ui/primitives";

export const metadata: Metadata = { title: "Enquiry" };

const NEXT = [
  { status: "CONTACTED", label: "Mark as contacted" },
  { status: "CLOSED", label: "Close" },
  { status: "NEW", label: "Mark as new" },
] as const;

export default async function EnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireRole("SUPER_ADMIN");
  const e = await getEnquiry({ id: user.id, roles: user.roles }, (await params).id);
  if (!e) notFound();
  return (
    <div className="max-w-3xl space-y-8">
      <Link href="/admin/enquiries" className="eyebrow hover:text-fg">
        ← Enquiries
      </Link>
      <header className="space-y-2">
        <Tag tone={STATUS_TONE[e.status]}>{e.status.toLowerCase()}</Tag>
        <h1 className="font-display text-h1 break-words">{e.name}</h1>
        <p className="text-muted font-mono text-sm">{formatDateTime(e.createdAt)}</p>
      </header>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <DetailItem
          label="Email"
          value={
            <a className="underline underline-offset-4" href={`mailto:${e.email}`}>
              {e.email}
            </a>
          }
        />
        <DetailItem
          label="Phone"
          value={
            e.phone ? (
              <a className="underline underline-offset-4" href={`tel:${e.phone}`}>
                {e.phone}
              </a>
            ) : (
              "—"
            )
          }
        />
        <DetailItem label="Company" value={e.company ?? "—"} />
        <DetailItem
          label="Interested in"
          value={`${INTEREST_LABELS[e.interest]}${e.course ? ` · ${e.course}` : ""}`}
        />
      </dl>
      <section aria-labelledby="message-heading" className="space-y-2">
        <h2 id="message-heading" className="eyebrow">
          Message
        </h2>
        <p className="border-fg border-l-2 py-1 pl-4 break-words whitespace-pre-wrap">{e.message}</p>
      </section>
      <div className="border-line flex flex-wrap gap-2 border-t pt-6">
        {NEXT.filter((n) => n.status !== e.status).map((n) => (
          <form key={n.status} action={setEnquiryStatusAction}>
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="status" value={n.status} />
            <Button type="submit" variant={n.status === "CONTACTED" ? "primary" : "secondary"}>
              {n.label}
            </Button>
          </form>
        ))}
        <form action={deleteEnquiryAction} className="ml-auto">
          <input type="hidden" name="id" value={e.id} />
          <Button type="submit" variant="danger">
            Delete now
          </Button>
        </form>
      </div>
    </div>
  );
}
