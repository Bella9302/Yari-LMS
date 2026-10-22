import type { ReactNode } from "react";
import { cn } from "@/ui/cn";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide on phones (the row's primary column still shows). */
  hideOnMobile?: boolean;
}

/**
 * Table on wide screens; on phones each row becomes a stacked card with
 * inline labels so nothing needs horizontal scrolling at 360px.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  caption: string;
}) {
  return (
    <table className="w-full border-collapse text-left text-[0.95rem]">
      <caption className="sr-only">{caption}</caption>
      <thead className="hidden md:table-header-group">
        <tr className="border-fg border-b">
          {columns.map((c) => (
            <th key={c.key} scope="col" className={cn("eyebrow py-3 pr-4 font-normal", c.className)}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} className="border-line block border-b py-3 md:table-row md:py-0">
            {columns.map((c, i) => (
              <td
                key={c.key}
                className={cn(
                  "flex gap-3 py-1 md:table-cell md:py-3 md:pr-4 md:align-middle",
                  i > 0 && "text-sm md:text-[0.95rem]",
                  c.hideOnMobile && "hidden md:table-cell",
                  c.className,
                )}
              >
                {i > 0 && <span className="text-muted w-28 shrink-0 md:hidden">{c.header}</span>}
                <span className="min-w-0">{c.cell(row)}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
