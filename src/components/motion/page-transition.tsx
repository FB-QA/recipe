"use client";

import { MotionConfig, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { tween } from "@/lib/motion";

/**
 * A quiet fade-and-lift on every route change. `MotionConfig reducedMotion="user"`
 * makes ALL Framer motion in the app respect the OS reduced-motion setting.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={tween}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
