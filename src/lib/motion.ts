import type { Transition } from "framer-motion";

// One shared motion vocabulary for every Framer animation in the app, mirroring
// the CSS tokens in globals.css so JS- and CSS-driven motion feel identical.
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const DUR = { fast: 0.16, base: 0.28 } as const;

/** A plain fade/slide tween. */
export const tween: Transition = { duration: DUR.base, ease: EASE_OUT };

/** Soft spring — sheets, drawers, larger surfaces. */
export const springSoft: Transition = { type: "spring", stiffness: 320, damping: 32 };

/** Snappy pop — small state changes (check marks, favourites). */
export const springPop: Transition = { type: "spring", stiffness: 520, damping: 26 };
