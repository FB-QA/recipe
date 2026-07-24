import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BackButton } from "./back-button";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function setHistoryLength(n: number) {
  Object.defineProperty(window.history, "length", { configurable: true, value: n });
}

describe("BackButton", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => setHistoryLength(1));

  it("goes truly back when there is in-app history to return to", () => {
    setHistoryLength(3);
    render(
      <BackButton>
        <span>chevron</span>
      </BackButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(router.back).toHaveBeenCalledOnce();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("falls back to the shelf when there is no history (deep link / fresh tab)", () => {
    setHistoryLength(1);
    render(
      <BackButton>
        <span>chevron</span>
      </BackButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(router.push).toHaveBeenCalledWith("/");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("honours a custom fallback href and aria-label", () => {
    setHistoryLength(1);
    render(
      <BackButton fallbackHref="/list" aria-label="Back to list">
        <span>chevron</span>
      </BackButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    expect(router.push).toHaveBeenCalledWith("/list");
  });
});
