import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ErrorBoundary from "./error";

// Drive each recovery branch deterministically by controlling the version module.
const version = vi.hoisted(() => ({
  isDeployError: vi.fn(),
  updateSeen: vi.fn(),
  canRecoveryReload: vi.fn(),
  guardedReload: vi.fn(),
  forceReload: vi.fn(),
}));
vi.mock("@/lib/version/version", () => version);

describe("Error boundary recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    version.isDeployError.mockReturnValue(false);
    version.updateSeen.mockReturnValue(false);
    version.canRecoveryReload.mockReturnValue(true);
  });

  it("a genuine app error shows the message and 'Try again' re-renders via reset()", () => {
    const reset = vi.fn();
    render(<ErrorBoundary error={new Error("boom")} reset={reset} />);

    expect(screen.getByText(/didn.t go to plan/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledOnce();
    expect(version.forceReload).not.toHaveBeenCalled();
  });

  it("a deploy-skew error we could NOT auto-recover offers a hard reload, never reset()", () => {
    // Classified as skew, but a recovery reload already fired within the window, so
    // auto-recovery is off. reset() only re-renders the same stale tree — the ONLY fix
    // is a hard reload onto the live build.
    version.isDeployError.mockReturnValue(true);
    version.canRecoveryReload.mockReturnValue(false);
    const reset = vi.fn();

    render(<ErrorBoundary error={new Error("Loading chunk 4 failed")} reset={reset} />);
    fireEvent.click(screen.getByRole("button"));

    expect(version.forceReload).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });

  it("a poisoned-flag error (updateSeen) also routes to a hard reload, not reset()", () => {
    // Even when the message is a plain app error, a still-set updateSeen mark classifies
    // it as skew. The recovery must be a hard reload, not an infinite reset() loop.
    version.updateSeen.mockReturnValue(true);
    version.canRecoveryReload.mockReturnValue(false);
    const reset = vi.fn();

    render(<ErrorBoundary error={new Error("Cannot read properties of undefined")} reset={reset} />);
    fireEvent.click(screen.getByRole("button"));

    expect(version.forceReload).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });

  it("a deploy-skew error that CAN auto-recover reloads immediately without a button press", () => {
    version.isDeployError.mockReturnValue(true);
    version.canRecoveryReload.mockReturnValue(true);

    render(<ErrorBoundary error={new Error("Loading chunk 4 failed")} reset={vi.fn()} />);
    expect(version.guardedReload).toHaveBeenCalled();
  });
});
