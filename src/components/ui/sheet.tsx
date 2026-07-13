"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { DUR, springSoft } from "@/lib/motion";
import { ChevronLeftIcon } from "@/components/icons";
import { clsx } from "@/lib/clsx";

const emptySubscribe = () => () => {};

export function Sheet({
  open,
  onClose,
  onBack,
  title,
  tall,
  onExitComplete,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  title?: string;
  /** Let the sheet grow to near-full height (for long flows like import review). */
  tall?: boolean;
  /** Fires once the close animation finishes — hosts navigate here so the
   * drawer fully slides shut before the route changes. */
  onExitComplete?: () => void;
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
    <AnimatePresence onExitComplete={onExitComplete}>
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
          className={clsx(
            "fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[480px] overflow-y-auto rounded-t-[26px] bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-2.5",
            tall ? "max-h-[94dvh]" : "max-h-[85dvh]",
          )}
          initial={reduce ? false : { y: "100%" }}
          animate={{ y: 0 }}
          // Open: soft spring settle. Close: a quick ease-in slide straight back
          // down, so it reads as the drawer travelling out, not fading away.
          exit={reduce ? { opacity: 0 } : { y: "100%", transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
          transition={reduce ? { duration: DUR.fast } : springSoft}
        >
          <div aria-hidden className="mx-auto mb-3 mt-1 h-1 w-9 rounded-full bg-line" />
          {(title || onBack) && (
            <div className="mb-3 flex items-center gap-1.5">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Back"
                  className="-ml-1.5 grid h-9 w-9 flex-none place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2"
                >
                  <ChevronLeftIcon size={20} />
                </button>
              )}
              {title && (
                <h2 className="text-[19px] font-extrabold tracking-[-0.01em] text-ink">{title}</h2>
              )}
            </div>
          )}
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
