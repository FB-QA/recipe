"use client";

import { useOptimistic, useState, useTransition, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { clsx } from "@/lib/clsx";
import { CheckIcon, CloseIcon, PlusIcon } from "@/components/icons";
import {
  addItem,
  toggleItem,
  deleteItem,
  clearCompleted,
  createList,
} from "@/lib/grocery/actions";
import type { GroceryBoardData } from "@/lib/grocery/queries";

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
            <ul className="mt-3 overflow-hidden rounded-card border border-line bg-surface">
              {active.map((item) => (
                <Item key={item.id} item={item} onToggle={toggle} />
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <>
              <div className="mb-2 mt-5 flex items-center justify-between px-0.5">
                <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                  Completed · {done.length}
                </span>
                <button
                  onClick={() => startTransition(() => clearCompleted(activeId))}
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

function Item({
  item,
  onToggle,
}: {
  item: GroceryBoardData["items"][number];
  onToggle: (id: string, completed: boolean) => void;
}) {
  const [, startTransition] = useTransition();
  return (
    <li className="flex items-center gap-3 border-b border-line-2 px-4 py-3.5 last:border-b-0">
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
            transition={{ type: "spring", stiffness: 520, damping: 24 }}
            className="grid place-items-center"
          >
            <CheckIcon size={13} />
          </motion.span>
        )}
      </button>
      <span
        className={clsx(
          "flex-1 text-[14.5px] transition-colors",
          item.is_completed ? "text-ink-3 line-through" : "text-ink",
        )}
      >
        {item.display_text}
        {item.quantity && <span className="ml-1.5 text-[12px] text-ink-3">· {item.quantity}</span>}
      </span>
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
