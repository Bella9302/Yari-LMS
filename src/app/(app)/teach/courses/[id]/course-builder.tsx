"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, Plus } from "lucide-react";
import type { ItemType } from "@/generated/prisma/enums";
import { addItemAction, saveLayoutAction } from "@/server/actions/courses";
import { initialFormState } from "@/lib/form-state";
import { ITEM_TYPE_META, ItemTypeIcon } from "@/ui/item-type";
import { Field, Input, Select } from "@/ui/field";
import { Notice, Tag } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";
import { cn } from "@/ui/cn";

export interface BuilderItem {
  id: string;
  title: string;
  type: ItemType;
  published: boolean;
  required: boolean;
  hasRules: boolean;
}

export interface BuilderModule {
  id: string;
  title: string;
  description: string;
  hasRules: boolean;
  items: BuilderItem[];
}

const M = (id: string) => `m:${id}`;
const I = (id: string) => `i:${id}`;
const raw = (id: string | number) => String(id).slice(2);

export function CourseBuilder({
  courseId,
  initialModules,
  moduleSettings,
}: {
  courseId: string;
  initialModules: BuilderModule[];
  /** Server-rendered module settings panels, keyed by module id. */
  moduleSettings: Record<string, React.ReactNode>;
}) {
  const [modules, setModules] = useState(initialModules);
  const [synced, setSynced] = useState(initialModules);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, startSaving] = useTransition();

  // The server is the source of truth: adopt its order whenever it changes (e.g. after adding an item).
  if (initialModules !== synced) {
    setSynced(initialModules);
    setModules(initialModules);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // On phones a short press starts a drag, so normal scrolling still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findModuleOfItem = (itemId: string, list = modules) =>
    list.find((m) => m.items.some((i) => i.id === itemId));

  function persist(next: BuilderModule[]) {
    startSaving(async () => {
      const res = await saveLayoutAction(
        courseId,
        next.map((m) => ({ moduleId: m.id, itemIds: m.items.map((i) => i.id) })),
      );
      if (res.error) {
        setError(res.error);
        setModules(synced);
      } else {
        setError(null);
        setSavedAt(Date.now());
      }
    });
  }

  function onDragStart(e: DragStartEvent) {
    setActive(String(e.active.id));
  }

  // Moving an item into another module happens while dragging, so the drop target opens up.
  function onDragOver(e: DragOverEvent) {
    const a = String(e.active.id);
    const o = e.over ? String(e.over.id) : null;
    if (!a.startsWith("i:") || !o) return;
    const from = findModuleOfItem(raw(a));
    const to = o.startsWith("i:") ? findModuleOfItem(raw(o)) : modules.find((m) => m.id === raw(o));
    if (!from || !to || from.id === to.id) return;
    setModules((prev) => {
      const item = from.items.find((i) => i.id === raw(a))!;
      const overIndex = o.startsWith("i:") ? to.items.findIndex((i) => i.id === raw(o)) : to.items.length;
      return prev.map((m) => {
        if (m.id === from.id) return { ...m, items: m.items.filter((i) => i.id !== item.id) };
        if (m.id === to.id) {
          const items = [...m.items];
          items.splice(overIndex < 0 ? items.length : overIndex, 0, item);
          return { ...m, items };
        }
        return m;
      });
    });
  }

  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    const a = String(e.active.id);
    const o = e.over ? String(e.over.id) : null;
    if (!o) return setModules(synced);
    let next = modules;
    if (a.startsWith("m:") && o.startsWith("m:")) {
      const oldIndex = modules.findIndex((m) => m.id === raw(a));
      const newIndex = modules.findIndex((m) => m.id === raw(o));
      next = arrayMove(modules, oldIndex, newIndex);
    } else if (a.startsWith("i:") && o.startsWith("i:")) {
      const mod = findModuleOfItem(raw(a));
      if (mod && mod.items.some((i) => i.id === raw(o))) {
        const oldIndex = mod.items.findIndex((i) => i.id === raw(a));
        const newIndex = mod.items.findIndex((i) => i.id === raw(o));
        next = modules.map((m) =>
          m.id === mod.id ? { ...m, items: arrayMove(m.items, oldIndex, newIndex) } : m,
        );
      }
    }
    setModules(next);
    const changed =
      JSON.stringify(next.map((m) => [m.id, m.items.map((i) => i.id)])) !==
      JSON.stringify(synced.map((m) => [m.id, m.items.map((i) => i.id)]));
    if (changed) persist(next);
  }

  const activeKind = active ? (active.startsWith("m:") ? "module" : "item") : null;
  const nameOf = (id: string | number | undefined) => {
    const key = String(id ?? "");
    if (key.startsWith("i:"))
      return modules.flatMap((m) => m.items).find((i) => i.id === raw(key))?.title ?? "item";
    return `module ${modules.find((m) => m.id === raw(key))?.title ?? ""}`.trim();
  };
  const positionOf = (id: string | number) => {
    const key = String(id);
    if (key.startsWith("m:"))
      return `position ${modules.findIndex((m) => m.id === raw(key)) + 1} of ${modules.length}`;
    const mod = findModuleOfItem(raw(key));
    return mod
      ? `position ${mod.items.findIndex((i) => i.id === raw(key)) + 1} of ${mod.items.length} in ${mod.title}`
      : "";
  };
  // While dragging, describe the target the item would take the place of.
  const overText = (overId: string | number) =>
    String(overId).startsWith("d:") ? `the empty module ${nameOf(`m:${raw(overId)}`)}` : nameOf(overId);

  const activeItem = active?.startsWith("i:")
    ? modules.flatMap((m) => m.items).find((i) => i.id === raw(active))
    : null;
  const activeModule = active?.startsWith("m:") ? modules.find((m) => m.id === raw(active)) : null;

  return (
    <div className="space-y-4">
      <div className="text-muted flex min-h-6 items-center justify-between text-sm" aria-live="polite">
        <span>Drag the handles to reorder. On a phone, press and hold the handle first.</span>
        {saving ? (
          <span className="font-mono text-xs">Saving…</span>
        ) : (
          savedAt && <span className="text-success font-mono text-xs">Order saved</span>
        )}
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActive(null);
          setModules(synced);
        }}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Press space or enter to pick up. Use the arrow keys to move, space or enter to drop, escape to cancel.",
          },
          announcements: {
            onDragStart: ({ active: a }) => `Picked up ${nameOf(a.id)}, ${positionOf(a.id)}.`,
            onDragOver: ({ active: a, over }) =>
              over
                ? `${nameOf(a.id)} is over ${overText(over.id)}.`
                : `${nameOf(a.id)} is not over a drop area.`,
            onDragEnd: ({ active: a, over }) =>
              over
                ? `Dropped ${nameOf(a.id)} in place of ${overText(over.id)}.`
                : `${nameOf(a.id)} was dropped back.`,
            onDragCancel: ({ active: a }) => `Moving cancelled. ${nameOf(a.id)} returned to where it was.`,
          },
        }}
      >
        <SortableContext items={modules.map((m) => M(m.id))} strategy={verticalListSortingStrategy}>
          <ol className="space-y-5">
            {modules.map((m, index) => (
              <SortableModule
                key={m.id}
                module={m}
                index={index}
                courseId={courseId}
                settings={moduleSettings[m.id]}
                activeKind={activeKind}
              />
            ))}
          </ol>
        </SortableContext>
        <DragOverlay>
          {activeItem && <ItemRow item={activeItem} courseId={courseId} overlay />}
          {activeModule && (
            <div className="border-fg bg-surface font-display text-h3 border px-4 py-3 shadow-lg">
              {activeModule.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

type ActiveKind = "item" | "module" | null;

function SortableModule({
  module: m,
  index,
  courseId,
  settings,
  activeKind,
}: {
  module: BuilderModule;
  index: number;
  courseId: string;
  settings: React.ReactNode;
  activeKind: ActiveKind;
}) {
  // Items only ever land on items (or an empty module's drop area); modules only on modules.
  // Without this, keyboard moves on narrow screens can snap an item onto its own module.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: M(m.id),
      disabled: { draggable: false, droppable: activeKind === "item" },
    });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `d:${m.id}`,
    disabled: activeKind === "module" || m.items.length > 0,
  });
  // Empty modules accept items via the droppable; the "d:" id resolves to the module in onDragOver.
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("border-line bg-surface border", isDragging && "opacity-40")}
    >
      <div className="border-line flex items-start gap-2 border-b px-2 py-3 sm:px-3">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          aria-label={`Move module ${m.title}`}
          className="text-muted hover:bg-sunk inline-grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-sm active:cursor-grabbing"
        >
          <GripVertical className="size-5" strokeWidth={1.5} />
        </button>
        <div className="min-w-0 flex-1 py-1.5">
          <p className="eyebrow">Module {index + 1}</p>
          <h3 className="font-display text-h3 mt-1 break-words">
            {m.title}
            {m.hasRules && (
              <Lock className="text-muted ml-2 inline size-4" aria-label="Has release conditions" />
            )}
          </h3>
          {m.description && <p className="text-muted mt-1 text-sm">{m.description}</p>}
        </div>
      </div>
      <SortableContext items={m.items.map((i) => I(i.id))} strategy={verticalListSortingStrategy}>
        <ul ref={setDropRef} className={cn("divide-line min-h-14 divide-y", isOver && "bg-sunk")}>
          {m.items.map((item) => (
            <SortableItem key={item.id} item={item} courseId={courseId} activeKind={activeKind} />
          ))}
          {m.items.length === 0 && (
            <li className="text-muted px-4 py-4 text-sm">No items yet — add one, or drag one here.</li>
          )}
        </ul>
      </SortableContext>
      <div className="border-line border-t">
        <AddItem courseId={courseId} moduleId={m.id} />
        {settings}
      </div>
    </li>
  );
}

function SortableItem({
  item,
  courseId,
  activeKind,
}: {
  item: BuilderItem;
  courseId: string;
  activeKind: ActiveKind;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: I(item.id),
      disabled: { draggable: false, droppable: activeKind === "module" },
    });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
    >
      <ItemRow
        item={item}
        courseId={courseId}
        handle={
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            type="button"
            aria-label={`Move ${item.title}`}
            className="text-muted hover:bg-sunk inline-grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-sm active:cursor-grabbing"
          >
            <GripVertical className="size-4" strokeWidth={1.5} />
          </button>
        }
      />
    </li>
  );
}

function ItemRow({
  item,
  courseId,
  handle,
  overlay,
}: {
  item: BuilderItem;
  courseId: string;
  handle?: React.ReactNode;
  overlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 sm:px-3",
        overlay && "border-fg bg-surface border shadow-lg",
      )}
    >
      {handle ?? (
        <span className="text-muted inline-grid size-11 place-items-center">
          <GripVertical className="size-4" />
        </span>
      )}
      <ItemTypeIcon type={item.type} className="text-muted size-4 shrink-0" />
      <Link
        href={`/teach/courses/${courseId}/items/${item.id}`}
        className="min-w-0 flex-1 py-2.5 break-words underline-offset-4 hover:underline"
      >
        {item.title}
        <span className="sr-only"> ({ITEM_TYPE_META[item.type].label})</span>
      </Link>
      <span className="flex shrink-0 items-center gap-1.5">
        {item.hasRules && <Lock className="text-muted size-3.5" aria-label="Has release conditions" />}
        {!item.required && <Tag className="hidden sm:inline-flex">Optional</Tag>}
        {!item.published && <Tag tone="accent">Hidden</Tag>}
      </span>
    </div>
  );
}

function AddItem({ courseId, moduleId }: { courseId: string; moduleId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(addItemAction, initialFormState);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted hover:bg-sunk hover:text-fg flex min-h-12 w-full items-center gap-2 px-4 text-sm"
      >
        <Plus className="size-4" aria-hidden /> Add item
      </button>
    );
  }
  return (
    <form action={action} className="grid gap-3 p-4 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="moduleId" value={moduleId} />
      <Field label="Type" name="type" id={`type-${moduleId}`}>
        {(p) => (
          <Select {...p} defaultValue="RICH_TEXT">
            {Object.entries(ITEM_TYPE_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label="Title"
        name="title"
        id={`title-${moduleId}`}
        error={state.fieldErrors?.title ?? state.error}
      >
        {(p) => <Input {...p} autoFocus required maxLength={160} />}
      </Field>
      <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
    </form>
  );
}
