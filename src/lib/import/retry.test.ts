import { describe, expect, it } from "vitest";
import { classifyProviderError, retrievalFailureRetryable, backoffMs, MAX_TRANSIENT_RETRIES } from "./retry";

describe("classifyProviderError — §20 retry rules", () => {
  it("retries transient provider failures", () => {
    expect(classifyProviderError("timeout")).toBe("retry");
    expect(classifyProviderError("connection_failed")).toBe("retry");
    expect(classifyProviderError("rate_limited")).toBe("retry");
    expect(classifyProviderError("provider_error")).toBe("retry");
  });

  it("never auto-retries content failures", () => {
    expect(classifyProviderError("invalid_credentials")).toBe("no_retry");
    expect(classifyProviderError("safety_block")).toBe("no_retry");
    expect(classifyProviderError("unsupported")).toBe("no_retry");
  });

  it("grants schema-invalid output exactly one correction", () => {
    expect(classifyProviderError("schema_invalid")).toBe("correct_once");
  });

  it("caps transient retries at two", () => {
    expect(MAX_TRANSIENT_RETRIES).toBe(2);
  });
});

describe("retrievalFailureRetryable", () => {
  it("retries timeouts and generic retrieval failures", () => {
    expect(retrievalFailureRetryable("source_timeout")).toBe(true);
    expect(retrievalFailureRetryable("source_retrieval_failed")).toBe(true);
  });

  it("never retries content failures: login wall, private, deleted, not-a-recipe", () => {
    expect(retrievalFailureRetryable("login_wall_detected")).toBe(false);
    expect(retrievalFailureRetryable("private_content")).toBe(false);
    expect(retrievalFailureRetryable("deleted_content")).toBe(false);
    expect(retrievalFailureRetryable("not_a_recipe")).toBe(false);
    expect(retrievalFailureRetryable("insufficient_content")).toBe(false);
    expect(retrievalFailureRetryable("source_too_large")).toBe(false);
  });
});

describe("backoffMs — exponential with jitter", () => {
  it("grows exponentially and stays within the jittered band", () => {
    const noJitter = () => 0;
    const fullJitter = () => 1;
    expect(backoffMs(1, noJitter)).toBeLessThan(backoffMs(2, noJitter));
    // Jitter widens the delay, never shrinks it below the base.
    expect(backoffMs(1, fullJitter)).toBeGreaterThan(backoffMs(1, noJitter));
  });
});
