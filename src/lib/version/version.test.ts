import { beforeEach, describe, expect, it } from "vitest";
import { isDeployError, markUpdateSeen, mayRecoveryReload, RELOAD_WINDOW_MS, updateSeen } from "./version";

describe("isDeployError", () => {
  it("matches the chunk/module errors a stale client throws after a deploy", () => {
    expect(isDeployError(new Error("Loading chunk 481 failed."))).toBe(true);
    expect(isDeployError(Object.assign(new Error("boom"), { name: "ChunkLoadError" }))).toBe(true);
    expect(isDeployError(new Error("Failed to fetch dynamically imported module: /_next/x.js"))).toBe(true);
    expect(isDeployError(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isDeployError("Loading CSS chunk 12 failed")).toBe(true);
  });

  it("matches the Server-Action mismatch a stale client hits after a deploy", () => {
    expect(isDeployError(new Error('Failed to find Server Action "abc123". This request might be from an older or newer deployment.'))).toBe(true);
    expect(isDeployError("This request might be from an older or newer deployment.")).toBe(true);
  });

  it("does not match a genuine application error", () => {
    expect(isDeployError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isDeployError(new TypeError("x is not a function"))).toBe(false);
    expect(isDeployError(null)).toBe(false);
    expect(isDeployError(undefined)).toBe(false);
  });
});

describe("updateSeen", () => {
  beforeEach(() => sessionStorage.clear());

  it("is false until a newer version has been observed, true after", () => {
    expect(updateSeen()).toBe(false);
    markUpdateSeen();
    expect(updateSeen()).toBe(true);
  });
});

describe("mayRecoveryReload", () => {
  beforeEach(() => sessionStorage.clear());

  it("allows the first reload and refuses a second within the window", () => {
    const t = 1_000_000;
    expect(mayRecoveryReload(t)).toBe(true);
    expect(mayRecoveryReload(t + 1)).toBe(false);
    expect(mayRecoveryReload(t + RELOAD_WINDOW_MS - 1)).toBe(false);
  });

  it("allows another reload once the window has passed", () => {
    const t = 2_000_000;
    expect(mayRecoveryReload(t)).toBe(true);
    expect(mayRecoveryReload(t + RELOAD_WINDOW_MS)).toBe(true);
  });
});
