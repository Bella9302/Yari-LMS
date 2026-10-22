import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/server/guards";
import {
  ENQUIRY_STATUS_TONE as STATUS_TONE,
  INTEREST_LABELS,
  listEnquiries,
} from "@/server/public/enquiries";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/ui/cn";
import { EmptyState, PageHeader, Tag } from "@/ui/primitives";

export const metadata: Metadata = { title: "Enquiries" };

const FILTERS = [
  { value: "", label: "All" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "CLOSED", label: "Closed" },
] as const;

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { user } = await requireRole("SUPER_ADMIN");
  const sp = (await searchParams).status;
  const status = sp === "NEW" || sp === "CONTACTED" || sp === "CLOSED" ? sp : undefined;
  const rows = await listEnquiries({ id: user.id, roles: user.roles }, status);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Enquiries"
        description="From the enquiry form on the public site. They are deleted automatically 12 months after they were last updated."
      />
      <nav aria-label="Filter enquiries" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/admin/enquiries?status=${f.value}` : "/admin/enquiries"}
            aria-current={(status ?? "") === f.value ? "page" : undefined}
            className={cn(
              "border-line-strong min-h-9 rounded-sm border px-3 py-1.5 text-sm",
              (status ?? "") === f.value && "bg-inverse text-on-inverse border-fg",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="No enquiries" />
      ) : (
        <ul className="border-line divide-line divide-y border-y">
          {rows.map((e) => (
            <li key={e.id}>
              <Link
                href={`/admin/enquiries/${e.id}`}
                className="hover:bg-sunk flex flex-col gap-1 px-1 py-4 sm:flex-row sm:items-baseline sm:gap-4"
              >
                <span className="text-muted w-40 shrink-0 font-mono text-xs">
                  {formatDateTime(e.createdAt)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium break-words">{e.name}</span>
                  {e.company && <span className="text-muted"> · {e.company}</span>}
                  <span className="text-muted block text-sm">
                    {INTEREST_LABELS[e.interest]}
                    {e.course && ` · ${e.course}`}
                  </span>
                </span>
                <Tag tone={STATUS_TONE[e.status]} className="self-start">
                  {e.status.toLowerCase()}
                </Tag>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
