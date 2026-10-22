import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/guards";
import { removeItemFileAction } from "@/server/actions/courses";
import { courseItemOptions, getEditableCourse } from "@/server/courses/queries";
import { ITEM_FILE_RULES, formatBytes } from "@/lib/file-types";
import { emptyDoc, sanitizeRichText } from "@/lib/rich-text";
import { Button } from "@/ui/button";
import { FileUploader } from "@/ui/file-uploader";
import { ITEM_TYPE_META, ItemTypeIcon } from "@/ui/item-type";
import { Notice, Tag } from "@/ui/primitives";
import { ReleaseRules } from "@/ui/release-rules";
import { DeleteItemForm, ItemForm } from "./item-form";

export const metadata: Metadata = { title: "Edit item" };

export default async function ItemEditorPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { user } = await requireUser();
  const { id, itemId } = await params;
  await getEditableCourse({ id: user.id, roles: user.roles }, id);
  const item = await db.item.findFirst({
    where: { id: itemId, module: { courseId: id } },
    include: {
      module: { select: { title: true } },
      asset: true,
      releaseRules: {
        include: { dependsOnItem: { select: { title: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!item) notFound();
  const itemOptions = await courseItemOptions(id);
  const fileRule = ITEM_FILE_RULES[item.type];
  const meta = ITEM_TYPE_META[item.type];
  const assetReady = item.asset && ["CLEAN", "SKIPPED"].includes(item.asset.scanStatus);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-8">
        <div>
          <Link href={`/teach/courses/${id}`} className="eyebrow hover:text-fg">
            ← {item.module.title}
          </Link>
          <p className="text-muted mt-3 flex items-center gap-2 text-sm">
            <ItemTypeIcon type={item.type} /> {meta.label} · {meta.hint}
          </p>
        </div>

        {fileRule && (
          <section className="space-y-3" aria-labelledby="file-heading">
            <h2 id="file-heading" className="font-display text-h3">
              {item.type === "VIDEO" ? "Video file (optional if you use a link)" : "File"}
            </h2>
            {item.asset && (
              <div className="border-line flex flex-wrap items-center gap-3 border px-4 py-3">
                <span className="min-w-0 flex-1 break-all">
                  {assetReady ? (
                    <a
                      href={`/api/files/${item.asset.id}`}
                      target="_blank"
                      rel="noopener"
                      className="underline underline-offset-4"
                    >
                      {item.asset.filename}
                    </a>
                  ) : (
                    item.asset.filename
                  )}
                  <span className="text-muted ml-2 font-mono text-xs">{formatBytes(item.asset.bytes)}</span>
                </span>
                {item.asset.scanStatus === "CLEAN" && <Tag tone="success">Virus-checked</Tag>}
                {item.asset.scanStatus === "SKIPPED" && <Tag>Not scanned (dev)</Tag>}
                {item.asset.scanStatus === "PENDING" && <Tag>Checking…</Tag>}
                <form action={removeItemFileAction}>
                  <input type="hidden" name="courseId" value={id} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Remove
                  </Button>
                </form>
              </div>
            )}
            <FileUploader
              courseId={id}
              itemId={item.id}
              rule={fileRule}
              label={item.asset ? "Replace the file" : "Choose a file"}
            />
            {item.type === "VIDEO" && (
              <Notice>
                Learners on site often have limited data. A Bunny Stream, YouTube or Vimeo link adapts the
                quality to their connection; an uploaded file always plays at full size.
              </Notice>
            )}
          </section>
        )}

        <ItemForm
          courseId={id}
          item={{
            id: item.id,
            type: item.type,
            title: item.title,
            required: item.required,
            published: item.published,
            estMinutes: item.estMinutes,
            externalUrl: item.externalUrl,
            body: item.type === "RICH_TEXT" ? (item.body ? sanitizeRichText(item.body) : emptyDoc()) : null,
          }}
        />
      </div>

      <aside className="space-y-8">
        <section aria-labelledby="rules-heading" className="space-y-3">
          <h2 id="rules-heading" className="font-display text-h3">
            Release conditions
          </h2>
          <ReleaseRules
            courseId={id}
            target={{ itemId: item.id }}
            rules={item.releaseRules}
            itemOptions={itemOptions}
          />
        </section>
        <section className="border-line border-t pt-6">
          <DeleteItemForm courseId={id} itemId={item.id} />
        </section>
      </aside>
    </div>
  );
}
