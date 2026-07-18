import type { ImportFailureReason, ProviderErrorCode } from "./schema";

/**
 * §20 retry rules. Transient failures retry (initial + max 2, exponential
 * backoff with jitter); content failures never auto-retry; schema-invalid
 * structured output gets exactly one targeted correction, then stop.
 */

export const MAX_TRANSIENT_RETRIES = 2;

export type RetryClass = "retry" | "no_retry" | "correct_once";

export function classifyProviderError(code: ProviderErrorCode): RetryClass {
  switch (code) {
    case "timeout":
    case "connection_failed":
    case "rate_limited":
    case "provider_error":
      return "retry";
    case "schema_invalid":
      return "correct_once";
    case "invalid_credentials":
    case "safety_block":
    case "unsupported":
      return "no_retry";
  }
}

/** Which retrieval failures are worth retrying on the same rung. */
export function retrievalFailureRetryable(reason: ImportFailureReason): boolean {
  return reason === "source_timeout" || reason === "source_retrieval_failed";
}

/**
 * Exponential backoff with jitter, kept small — the whole pipeline runs
 * inside one serverless invocation (ADR-10).
 */
export function backoffMs(attempt: number, rand: () => number = Math.random): number {
  const base = 400 * 2 ** (attempt - 1);
  return Math.round(base + rand() * base);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
