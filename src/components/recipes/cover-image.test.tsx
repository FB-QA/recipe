import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoverImage } from "./cover-image";

const imgOf = (ui: React.ReactElement) =>
  render(ui).container.querySelector("img") as HTMLImageElement | null;

describe("CoverImage loading", () => {
  it("lazy-loads by default, for the mostly-off-screen shelf grid", () => {
    expect(imgOf(<CoverImage url="https://s/thumb.webp" title="X" />)?.getAttribute("loading")).toBe("lazy");
  });

  it("loads eagerly when asked, so the always-in-viewport detail hero (LCP) isn't deprioritised", () => {
    expect(
      imgOf(<CoverImage url="https://s/cover.webp" title="X" loading="eager" />)?.getAttribute("loading"),
    ).toBe("eager");
  });
});
