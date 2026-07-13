"use client";

import { useOptimistic, useState, useTransition, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { springPop } from "@/lib/motion";
import { clsx } from "@/lib/clsx";
import { CartIcon, CheckIcon, CloseIcon, PlusIcon, ListIcon } from "@/components/icons";
import { CATEGORY_ORDER, type Category } from "@/lib/grocery/categorize";
import { CategoryIcon, FoodImage } from "@/components/food-icons";
import { gradientFor } from "@/components/recipes/cover-image";
import { addItem, toggleItem, deleteItem, clearCompleted, createList, deleteList } from "@/lib/grocery/actions";
import { ALL_LISTS } from "@/lib/grocery/constants";
import type { GroceryBoardData, GroceryItem, GroceryList } from "@/lib/grocery/queries";

function groupByCategory(items: GroceryItem[]) {
  const groups = new Map<Category, GroceryItem[]>();
  for (const item of items) {
    const cat: Category = CATEGORY_ORDER.includes(item.category as Category)
      ? (item.category as Category)
      : "Other";
    (groups.get(cat) ?? groups.set(cat, []).get(cat)!).push(item);
  }
  return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({ category: c, items: groups.get(c)! }));
}

export function GroceryBoard({ lists, activeId, items }: GroceryBoardData) {
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>(activeId ?? ALL_LISTS);
  const [optimisticItems, applyOptimistic] = useOptimistic(
    items,
    (state, patch: { id: string; is_completed: boolean }) =>
      state.map((i) => (i.id === patch.id ? { ...i, is_completed: patch.is_completed } : i)),
  );

  const toggle = (id: string, is_completed: boolean) =>
    startTransition(async () => {
      applyOptimistic({ id, is_completed });
      await toggleItem(id, is_completed);
    });

  // A deleted (or otherwise missing) active list falls back to the combined view.
  const activeSel =
    selected !== ALL_LISTS && !lists.some((l) => l.id === selected) ? ALL_LISTS : selected;

  const shown =
    activeSel === ALL_LISTS ? optimisticItems : optimisticItems.filter((i) => i.list_id === activeSel);

  const active = shown.filter((i) => !i.is_completed);
  const done = shown.filter((i) => i.is_completed);
  const grouped = groupByCategory(active);

  return (
    <div>
      <FilterBar
        lists={lists}
        selected={activeSel}
        onSelect={setSelected}
        onDelete={(id) => startTransition(() => deleteList(id))}
        items={optimisticItems}
      />

      {/* Manual add only within a specific list — "All" is a combined view. */}
      {activeSel !== ALL_LISTS && <AddItemRow listId={activeSel} />}

      {active.length === 0 && done.length === 0 ? (
        <p className="mt-3 rounded-card border border-dashed border-line-2 bg-surface px-5 py-9 text-center text-sm text-ink-2">
          Nothing here yet. Tap “Add to grocery list” on any recipe, or start a list of your own.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {grouped.map((group) => (
            <section key={group.category}>
              <h3 className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[12px] font-bold uppercase tracking-[0.05em] text-ink-3">
                <CategoryIcon category={group.category} size={15} /> {group.category}
              </h3>
              <ul className="overflow-hidden rounded-card border border-line bg-surface">
                {group.items.map((item) => (
                  <Item key={item.id} item={item} onToggle={toggle} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <>
          <div className="mb-2 mt-6 flex items-center justify-between px-0.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">
              Completed · {done.length}
            </span>
            <button
              onClick={() => startTransition(() => clearCompleted(done.map((i) => i.id)))}
              className="text-[12px] font-semibold text-basil"
            >
              Clear completed
            </button>
          </div>
          <ul className="overflow-hidden rounded-card border border-line bg-surface">
            {done.map((item) => (
              <Item key={item.id} item={item} onToggle={toggle} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

type ChipProps = {
  label: string;
  selected: boolean;
  count: number;
  editing?: boolean;
  index?: number;
  onClick: () => void;
  onEnterEdit?: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
};

function Chip({
  label,
  selected,
  count,
  editing = false,
  index = 0,
  onClick,
  onEnterEdit,
  onDelete,
  children,
}: ChipProps) {
  const reduce = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPress = () => {
    if (!onEnterEdit) return;
    timer.current = setTimeout(onEnterEdit, 450);
  };
  const endPress = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  const wiggling = editing && !!onDelete && !reduce;
  const dir = index % 2 === 0 ? 1 : -1;

  return (
    <motion.div
      className="relative flex w-[60px] flex-none flex-col items-center gap-1"
      animate={wiggling ? { rotate: [-2.4 * dir, 2.4 * dir, -2.4 * dir] } : { rotate: 0 }}
      transition={wiggling ? { duration: 0.28, repeat: Infinity, ease: "easeInOut" } : { duration: 0.15 }}
    >
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onEnterEdit ? (e) => { e.preventDefault(); onEnterEdit(); } : undefined}
        onTouchStart={onEnterEdit ? startPress : undefined}
        onTouchEnd={endPress}
        onTouchMove={endPress}
        aria-pressed={selected}
        className="flex w-full min-w-0 flex-col items-center gap-1 select-none [-webkit-touch-callout:none]"
      >
        <span className="relative">
          <span
            className={clsx(
              "grid h-[52px] w-[52px] place-items-center overflow-hidden rounded-full border-2",
              selected ? "border-basil" : "border-transparent",
            )}
          >
            {children}
          </span>
          {!editing && count > 0 && (
            <span className="absolute -right-1 -top-1 z-10 grid h-[20px] min-w-[20px] place-items-center rounded-full border-2 border-paper bg-basil px-1 text-[10px] font-bold leading-none text-white">
              {count}
            </span>
          )}
        </span>
        <span
          className={clsx(
            "w-full truncate text-center text-[10px]",
            selected ? "font-semibold text-ink" : "text-ink-3",
          )}
        >
          {label}
        </span>
      </button>

      {editing && onDelete && (
        <button
          type="button"
          aria-label={`Delete ${label}`}
          onClick={onDelete}
          className="absolute left-[2px] top-0 z-20 grid h-[20px] w-[20px] place-items-center rounded-full border-2 border-paper bg-ink text-white shadow-[var(--shadow)]"
        >
          <CloseIcon size={11} />
        </button>
      )}
    </motion.div>
  );
}

function FilterBar({
  lists,
  selected,
  onSelect,
  onDelete,
  items,
}: {
  lists: GroceryList[];
  selected: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  items: GroceryItem[];
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const itemCount = (listId: string | null) =>
    items.filter((i) => listId === null || i.list_id === listId).length;

  // While editing, tapping a chip body exits edit mode rather than selecting.
  const bodyClick = (id: string) => () => (editing ? setEditing(false) : onSelect(id));

  return (
    <div className="mb-3.5 flex items-end gap-3 overflow-x-auto px-1 pb-1 pt-2 [scrollbar-width:none]">
      <Chip
        label="All"
        selected={selected === ALL_LISTS}
        count={itemCount(null)}
        onClick={bodyClick(ALL_LISTS)}
      >
        <span
          className={clsx(
            "grid h-full w-full place-items-center",
            selected === ALL_LISTS ? "bg-basil text-white" : "bg-basil-tint text-basil",
          )}
        >
          <ListIcon size={20} />
        </span>
      </Chip>

      {lists.map((list, i) => (
        <Chip
          key={list.id}
          label={list.name}
          selected={selected === list.id}
          count={itemCount(list.id)}
          editing={editing}
          index={i}
          onClick={bodyClick(list.id)}
          onEnterEdit={() => setEditing(true)}
          onDelete={() => onDelete(list.id)}
        >
          {list.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={list.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : list.isRecipe ? (
            <span className="h-full w-full" style={{ backgroundImage: gradientFor(list.name) }} />
          ) : (
            <span className="grid h-full w-full place-items-center bg-basil-tint text-basil">
              <CartIcon size={20} />
            </span>
          )}
        </Chip>
      ))}

      {editing ? (
        <button
          onClick={() => setEditing(false)}
          className="flex w-[60px] flex-none flex-col items-center gap-1"
        >
          <span className="grid h-[52px] w-[52px] place-items-center rounded-full border-2 border-basil bg-basil text-white">
            <CheckIcon size={20} />
          </span>
          <span className="text-[10px] font-semibold text-ink">Done</span>
        </button>
      ) : adding ? (
        <form action={createList.bind(null, undefined)} className="flex-none self-center">
          <input
            ref={inputRef}
            name="name"
            autoFocus
            aria-label="New list name"
            placeholder="List name"
            className="w-[130px] rounded-full border border-basil bg-surface px-3.5 py-2 text-[13px] text-ink outline-none"
          />
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          aria-label="New list"
          className="flex w-[60px] flex-none flex-col items-center gap-1"
        >
          <span className="grid h-[52px] w-[52px] place-items-center rounded-full border-2 border-dashed border-line text-ink-2">
            <PlusIcon size={18} />
          </span>
          <span className="text-[10px] text-ink-3">New</span>
        </button>
      )}
    </div>
  );
}

function Item({ item, onToggle }: { item: GroceryItem; onToggle: (id: string, c: boolean) => void }) {
  const [, startTransition] = useTransition();
  return (
    <li className="reveal-item flex items-center gap-3 border-b border-line-2 px-4 py-3 last:border-b-0">
      <button
        aria-label={item.is_completed ? "Mark as not bought" : "Mark as bought"}
        aria-pressed={item.is_completed}
        onClick={() => onToggle(item.id, !item.is_completed)}
        className={clsx(
          "grid h-[23px] w-[23px] flex-none place-items-center rounded-[7px] border-2 text-white transition-colors",
          item.is_completed ? "border-basil bg-basil" : "border-line",
        )}
      >
        {item.is_completed && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={springPop}
            className="grid place-items-center"
          >
            <CheckIcon size={13} />
          </motion.span>
        )}
      </button>

      <FoodImage
        text={item.display_text}
        size={22}
        className={clsx("flex-none", item.is_completed && "opacity-50")}
      />

      <div className="min-w-0 flex-1">
        <span
          className={clsx(
            "block text-[14.5px] transition-colors",
            item.is_completed ? "text-ink-3 line-through" : "text-ink",
          )}
        >
          {item.quantity && <span className="font-semibold">{item.quantity} </span>}
          {item.display_text}
        </span>
      </div>

      <button
        aria-label={`Remove ${item.display_text}`}
        onClick={() => startTransition(() => deleteItem(item.id))}
        className="grid h-7 w-7 flex-none place-items-center rounded-full text-ink-3 hover:text-danger"
      >
        <CloseIcon size={15} />
      </button>
    </li>
  );
}

function AddItemRow({ listId }: { listId: string }) {
  const [value, setValue] = useState("");
  const [, startTransition] = useTransition();

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    setValue("");
    startTransition(() => addItem(listId, text));
  };

  return (
    <div className="flex items-center gap-2 rounded-[12px] border border-line bg-surface px-3.5 py-2.5">
      <input
        value={value}
        aria-label="Add an item"
        placeholder="Add an item"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
      />
      <button
        aria-label="Add item"
        onClick={submit}
        className="grid h-8 w-8 flex-none place-items-center rounded-full bg-basil text-white"
      >
        <PlusIcon size={18} />
      </button>
    </div>
  );
}
