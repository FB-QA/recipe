"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/icons";
import type { FallbackKind } from "@/lib/import/schema";

/**
 * The failure surface (api.md). Renders the mapped user message and the
 * recovery routes the engine offered — retrieval failures are never presented
 * as AI errors (AC4), because the message already came from the failure-reason
 * mapping, not from any provider text. `upload_screenshots` is shown as a
 * described option only until the capture flow ships (import-capture-review-v2);
 * paste-caption and add-manually are actionable now.
 */

const ORDER: FallbackKind[] = ["add_manually", "paste_caption", "upload_screenshots"];

function LabelFor(kind: FallbackKind): { label: string; hint?: string } {
  switch (kind) {
    case "add_manually":
      return { label: "Add it manually" };
    case "paste_caption":
      return { label: "Paste the recipe text", hint: "Copy the caption or recipe and paste it in." };
    case "upload_screenshots":
      return { label: "Upload screenshots", hint: "Coming soon — snap the ingredients & method." };
  }
}

export function ImportFailure({
  message,
  fallback,
  onNavigate,
}: {
  message: string;
  fallback: FallbackKind[];
  onNavigate?: (href: string) => void;
}) {
  const options = ORDER.filter((k) => fallback.includes(k));

  return (
    <div className="mt-2 rounded-card border border-line bg-surface p-6 text-center">
      <div aria-hidden className="mx-auto mb-4 grid h-[64px] w-[64px] place-items-center rounded-[20px] bg-basil-tint text-basil">
        <AlertIcon size={28} />
      </div>
      <p role="alert" className="mx-auto max-w-[36ch] text-[14.5px] font-medium leading-relaxed text-ink-2">
        {message}
      </p>

      {options.length > 0 && (
        <div className="mt-5 flex flex-col gap-2.5">
          {options.map((kind) => {
            const { label, hint } = LabelFor(kind);
            if (kind === "add_manually") {
              return onNavigate ? (
                <Button key={kind} fullWidth onClick={() => onNavigate("/recipes/new")}>
                  {label}
                </Button>
              ) : (
                <Link key={kind} href="/recipes/new">
                  <Button fullWidth>{label}</Button>
                </Link>
              );
            }
            if (kind === "paste_caption") {
              return onNavigate ? (
                <Button key={kind} variant="ghost" fullWidth onClick={() => onNavigate("/paste")}>
                  {label}
                </Button>
              ) : (
                <Link key={kind} href="/paste">
                  <Button variant="ghost" fullWidth>
                    {label}
                  </Button>
                </Link>
              );
            }
            // upload_screenshots — described only this story.
            return (
              <p key={kind} className="text-[12.5px] leading-relaxed text-ink-3">
                {label}: {hint}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
