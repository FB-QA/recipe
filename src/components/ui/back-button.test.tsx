import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BackButton } from "./back-button";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const nav = vi.hoisted(() => ({ hasInAppHistory: vi.fn() }));
vi.mock("@/lib/nav/history-baseline", () => nav);

describe("BackButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("goes truly back when there is in-app history to return to", () => {
    nav.hasInAppHistory.mockReturnValue(true);
    render(
      <BackButton>
        <span>chevron</span>
      </BackButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(router.back).toHaveBeenCalledOnce();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("falls back to the shelf when there is no in-app history (deep link / busy tab)", () => {
    nav.hasInAppHistory.mockReturnValue(false);
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
    nav.hasInAppHistory.mockReturnValue(false);
    render(
      <BackButton fallbackHref="/list" aria-label="Back to list">
        <span>chevron</span>
      </BackButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    expect(router.push).toHaveBeenCalledWith("/list");
  });
});
