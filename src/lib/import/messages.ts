import { SIGNED_OUT_ERROR } from "@/lib/auth/session";
import type { FallbackKind, ImportFailureReason } from "./schema";

/**
 * The complete failure-reason → user message + fallback mapping, verbatim
 * from docs/architecture/import-engine-v2/api.md. Retrieval failures are
 * never presented as AI errors (AC4); `message` is the only copy a user
 * ever sees — never provider text (§26).
 */

const LIMIT_COPY = "You've reached today's import limit. It resets in 24 hours — or add a recipe manually.";

const MAP: Record<ImportFailureReason, { message: string; fallback: FallbackKind[] }> = {
  unauthenticated: { message: SIGNED_OUT_ERROR, fallback: [] },
  plan_restricted: { message: LIMIT_COPY, fallback: ["add_manually"] },
  invalid_input: {
    message: "That doesn't look like a link or recipe text we can import.",
    fallback: ["add_manually"],
  },
  unsupported_source: {
    message: "We can't import that kind of link yet.",
    fallback: ["paste_caption", "add_manually"],
  },
  source_retrieval_failed: {
    message: "We couldn't read this page or post automatically.",
    fallback: ["paste_caption", "upload_screenshots", "add_manually"],
  },
  source_incomplete: {
    message: "We couldn't get the whole post — some slides or the caption are missing.",
    fallback: ["paste_caption", "upload_screenshots", "add_manually"],
  },
  source_too_large: {
    message: "That page is too large to import.",
    fallback: ["paste_caption", "add_manually"],
  },
  source_timeout: {
    message: "That site took too long to respond.",
    fallback: ["paste_caption", "add_manually"],
  },
  login_wall_detected: {
    message: "That post is behind a login.",
    fallback: ["paste_caption", "upload_screenshots", "add_manually"],
  },
  private_content: {
    message: "That post looks private.",
    fallback: ["paste_caption", "upload_screenshots", "add_manually"],
  },
  deleted_content: {
    message: "That post seems to have been removed.",
    fallback: ["add_manually"],
  },
  not_a_recipe: {
    message: "We read it, but couldn't find a recipe there.",
    fallback: ["add_manually"],
  },
  insufficient_content: {
    message: "The post doesn't contain the full recipe (e.g. “recipe in bio”).",
    fallback: ["paste_caption", "upload_screenshots", "add_manually"],
  },
  ai_rate_limited: {
    message: "Our extraction service is busy — try again shortly.",
    fallback: ["paste_caption", "add_manually"],
  },
  ai_provider_error: {
    message: "Our extraction service is busy — try again shortly.",
    fallback: ["paste_caption", "add_manually"],
  },
  ai_safety_block: {
    message: "We couldn't process this content.",
    fallback: ["add_manually"],
  },
  ai_output_invalid: {
    message: "We couldn't produce a reliable draft from this source.",
    fallback: ["paste_caption", "add_manually"],
  },
  validation_failed: {
    message: "We couldn't produce a reliable draft from this source.",
    fallback: ["paste_caption", "add_manually"],
  },
  // Success-with-warning path per api.md — never user-blocking; the entry
  // exists only so the mapping is total over the enum.
  temporary_media_cleanup_failed: {
    message: "Imported, but we couldn't tidy up a temporary file.",
    fallback: [],
  },
  unknown_error: {
    message: "Something went wrong on our side.",
    fallback: ["paste_caption", "add_manually"],
  },
};

export function messageForFailure(reason: ImportFailureReason): {
  message: string;
  fallback: FallbackKind[];
} {
  return MAP[reason];
}
