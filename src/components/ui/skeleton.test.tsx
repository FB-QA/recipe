import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ShelfSkeleton } from "./skeleton";
import { CARD_TITLE_BOX } from "@/components/recipes/recipe-card";

describe("ShelfSkeleton", () => {
  it("reserves the same title box as the real card, so nothing reflows on load", () => {
    // The reserved two-line height is a single source (CARD_TITLE_BOX). If the card
    // changes it and the skeleton stops borrowing it, a one-line card grows when the
    // placeholder resolves — this asserts the two cannot drift apart.
    const { container } = render(<ShelfSkeleton count={1} />);
    // Assert on the rendered class string rather than a CSS selector: the reserve
    // token is `min-h-[2lh]`, whose brackets need escaping, and jsdom does not
    // reliably provide CSS.escape — so a `.querySelector` here is environment-fragile.
    const reservedClass = CARD_TITLE_BOX.split(" ")[0]; // the min-h reserve token
    expect(container.innerHTML).toContain(reservedClass);
  });
});
