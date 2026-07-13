"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { DUR, springSoft } from "@/lib/motion";

const emptySubscribe = () => () => {};

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();

  // Client-only: the portal needs `document`. useSyncExternalStore gives a
  // hydration-safe client flag without setState-in-effect.
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!isClient) return null;

  // Portal to <body> so the fixed backdrop escapes any ancestor stacking or
  // transform context (the page-transition wrapper) and truly covers the page.

  // Keyed siblings (not a Fragment): AnimatePresence can only track exit
  // animations on its direct keyed children, so wrapping them in <> would make
  // the drawer vanish instantly on close instead of sliding out.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-50 bg-[rgba(10,14,11,0.42)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR.fast }}
          onClick={onClose}
        />
      )}
      {open && (
        <motion.div
          key="panel"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85dvh] max-w-[480px] overflow-y-auto rounded-t-[26px] bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-2.5"
          initial={reduce ? false : { y: "100%" }}
          animate={{ y: 0 }}
          exit={reduce ? { opacity: 0 } : { y: "100%" }}
          transition={reduce ? { duration: DUR.fast } : { ...springSoft, restDelta: 0.5 }}
        >
          <div aria-hidden className="mx-auto mb-3 mt-1 h-1 w-9 rounded-full bg-line" />
          {title && (
            <h2 className="mb-3 text-[19px] font-extrabold tracking-[-0.01em] text-ink">{title}</h2>
          )}
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
