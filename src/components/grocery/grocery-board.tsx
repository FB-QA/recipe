"use client";

import { useOptimistic, useState, useTransition, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { springPop } from "@/lib/motion";
import { clsx } from "@/lib/clsx";
import { CheckIcon, CloseIcon, PlusIcon } from "@/components/icons";
import { CATEGORY_ORDER, type Category } from "@/lib/grocery/categorize";
import { CategoryIcon, FoodImage } from "@/components/food-icons";
import { addItem, toggleItem, deleteItem, clearCompleted, createList } from "@/lib/grocery/actions";
import type { GroceryBoardData, GroceryItem } from "@/lib/grocery/queries";

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

  const active = optimisticItems.filter((i) => !i.is_completed);
  const done = optimisticItems.filter((i) => i.is_completed);
  const grouped = groupByCategory(active);

  return (
    <div>
      <ListTabs lists={lists} activeId={activeId} />

      {activeId && (
        <>
          <AddItemRow listId={activeId} />

          {active.length === 0 && done.length === 0 ? (
            <p className="mt-3 rounded-card border border-dashed border-line-2 bg-surface px-5 py-9 text-center text-sm text-ink-2">
              Nothing on this list yet. Add an item above, or tap “Add to grocery list” on any recipe.
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
        </>
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

function ListTabs({ lists, activeId }: { lists: GroceryBoardData["lists"]; activeId: string | null }) {
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mb-3.5 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {lists.map((list) => (
        <Link
          key={list.id}
          href={`/list?list=${list.id}`}
          aria-current={list.id === activeId ? "true" : undefined}
          className={clsx(
            "flex-none rounded-full border px-3.5 py-2 text-[13px] font-semibold",
            list.id === activeId ? "border-basil bg-basil text-white" : "border-line bg-surface text-ink-2",
          )}
        >
          {list.name}
        </Link>
      ))}

      {adding ? (
        <form action={createList.bind(null, undefined)} className="flex-none">
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
          className="flex flex-none items-center gap-1 rounded-full border border-dashed border-line px-3 py-2 text-[13px] font-semibold text-ink-2"
        >
          <PlusIcon size={15} /> New
        </button>
      )}
    </div>
  );
}
