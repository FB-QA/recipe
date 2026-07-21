import { describe, expect, it } from "vitest";
import { providerErrorToFailure } from "./engine";

describe("providerErrorToFailure", () => {
  it("maps a rejected request (400) to ai_output_invalid, not the transient 'busy' error", () => {
    // ai_provider_error surfaces "service is busy — try again shortly", which is a
    // lie for a permanent 400. ai_output_invalid tells the user we couldn't get a
    // usable draft and offers paste/manual — honest, and not an invitation to retry.
    expect(providerErrorToFailure("bad_request")).toBe("ai_output_invalid");
  });

  it("still maps transient provider faults to ai_provider_error", () => {
    expect(providerErrorToFailure("provider_error")).toBe("ai_provider_error");
    expect(providerErrorToFailure("timeout")).toBe("ai_provider_error");
    expect(providerErrorToFailure("rate_limited")).toBe("ai_rate_limited");
  });
});
