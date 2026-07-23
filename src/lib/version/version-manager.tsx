"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APP_VERSION, VERSION_HEADER, clearUpdateSeen, guardedReload, hasRealVersion, isDeployError, markUpdateSeen, updateSeen } from "./version";

/**
 * Detects a new deployment off traffic the app already makes and reloads onto it at a
 * safe seam — seamlessly, never mid-action. Mount once, near the root.
 *
 * Cost: zero extra network. It reads the live version from the `x-app-version` header
 * the middleware already stamps on every response; there is no polling and no version
 * endpoint. Detection therefore happens exactly when it matters — the moment the stale
 * client next talks to the server — which is also the moment the mismatch would bite.
 */
export function VersionManager() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  // The path we were on when the update was first noticed — a change from it is the
  // user navigating, our preferred seam to reload on. Captured in an effect (never
  // mutated during render).
  const noticedOnPath = useRef<string | null>(null);
  useEffect(() => {
    if (pending && noticedOnPath.current === null) noticedOnPath.current = pathname;
  }, [pending, pathname]);

  // 1) Learn the live version by sniffing the header off fetches the app already makes
  //    (RSC navigations, Server Actions, data loads). Reading a header never touches
  //    the body, so the wrapper is transparent.
  useEffect(() => {
    if (!hasRealVersion) return;
    const original = window.fetch;
    window.fetch = async (...args: Parameters<typeof window.fetch>) => {
      const response = await original(...args);
      try {
        const live = response.headers.get(VERSION_HEADER);
        if (live && live !== APP_VERSION) {
          markUpdateSeen();
          setPending(true);
        } else if (live === APP_VERSION) {
          // Back in sync — the reload has landed on the new build. Clear the mark so it
          // doesn't outlive the mismatch and misclassify later unrelated errors.
          clearUpdateSeen();
        }
      } catch {
        // cross-origin / opaque response — no readable header, ignore.
      }
      return response;
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  // 2) Backstop: if an error slips through before we could reload, recover with one
  //    guarded reload instead of a dead-end. Fires on a recognised deploy-skew error OR
  //    once we've already sniffed a newer version — the latter catches Server-Action
  //    mismatches whose message we don't have to recognise.
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isDeployError(e.error ?? e.message) || updateSeen()) guardedReload();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isDeployError(e.reason) || updateSeen()) guardedReload();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // 3a) Reload on the next navigation — a flash the user already expects, so it reads
  //     as a normal page load onto the new build.
  useEffect(() => {
    if (pending && noticedOnPath.current !== null && pathname !== noticedOnPath.current) {
      guardedReload();
    }
  }, [pathname, pending]);

  // 3b) Reload on refocus (the reopen-the-PWA moment) when idle — never while the user
  //     is typing.
  useEffect(() => {
    if (!pending) return;
    const onShow = () => {
      if (document.visibilityState === "visible" && !isEditing()) guardedReload();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", onShow);
    };
  }, [pending]);

  // 4) Fallback only: if the user lingers on one screen with no seam, offer a manual
  //    refresh after a grace period — subtle, dismissible.
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setShowBanner(true), 15_000);
    return () => window.clearTimeout(t);
  }, [pending]);

  if (!showBanner) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[80px] z-[60] mx-auto flex w-fit max-w-[92%] items-center gap-3 rounded-full border border-line bg-surface px-4 py-2.5 text-[13px] shadow-[var(--shadow)]"
    >
      <span className="text-ink-2">A new version is ready.</span>
      <button type="button" onClick={() => guardedReload()} className="font-semibold text-basil">
        Refresh
      </button>
      <button type="button" onClick={() => setShowBanner(false)} aria-label="Dismiss" className="text-ink-3">
        Later
      </button>
    </div>
  );
}

function isEditing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}
