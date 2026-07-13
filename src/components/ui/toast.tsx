"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { springSoft } from "@/lib/motion";
import { CheckIcon } from "@/components/icons";

type Toast = { id: number; message: string };

const ToastContext = createContext<(message: string) => void>(() => {});

/** Fire a transient confirmation toast (e.g. after a background create). */
export const useToast = () => useContext(ToastContext);

const emptySubscribe = () => () => {};
const TOAST_DURATION_MS = 2800;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const toast = useCallback((message: string) => {
    const id = (nextId.current += 1);
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_DURATION_MS);
  }, []);

  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {isClient &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-[92px] z-[60] mx-auto flex max-w-[var(--width-app)] flex-col items-center gap-2 px-4">
            <AnimatePresence>
              {toasts.map((t) => (
                <motion.div
                  key={t.id}
                  role="status"
                  initial={{ opacity: 0, y: 14, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={springSoft}
                  className="pointer-events-auto flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[var(--shadow)]"
                >
                  <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-basil text-white">
                    <CheckIcon size={12} />
                  </span>
                  {t.message}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
