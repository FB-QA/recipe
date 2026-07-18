import { describe, expect, it } from "vitest";
import { messageForFailure } from "./messages";
import { IMPORT_FAILURE_REASONS } from "./schema";
import { SIGNED_OUT_ERROR } from "@/lib/auth/session";

describe("messageForFailure — api.md mapping table", () => {
  it("covers every failure reason with copy and a fallback array", () => {
    for (const reason of IMPORT_FAILURE_REASONS) {
      const m = messageForFailure(reason);
      expect(m.message.length, reason).toBeGreaterThan(0);
      expect(Array.isArray(m.fallback), reason).toBe(true);
    }
  });

  it("presents retrieval failures as retrieval, never as AI errors (AC4)", () => {
    for (const reason of [
      "source_retrieval_failed",
      "source_incomplete",
      "login_wall_detected",
      "private_content",
      "insufficient_content",
    ] as const) {
      const m = messageForFailure(reason);
      expect(m.message.toLowerCase(), reason).not.toMatch(/\bai\b|extraction service/);
    }
  });

  it("offers paste caption / upload screenshots / add manually on a login wall (AC4)", () => {
    expect(messageForFailure("login_wall_detected").fallback).toEqual([
      "paste_caption",
      "upload_screenshots",
      "add_manually",
    ]);
  });

  it("offers the same manual routes for 'recipe in bio' (insufficient_content)", () => {
    expect(messageForFailure("insufficient_content").fallback).toEqual([
      "paste_caption",
      "upload_screenshots",
      "add_manually",
    ]);
  });

  it("keeps the existing signed-out and daily-limit copy", () => {
    expect(messageForFailure("unauthenticated")).toEqual({ message: SIGNED_OUT_ERROR, fallback: [] });
    expect(messageForFailure("plan_restricted").message).toMatch(/reached today's import limit/i);
    expect(messageForFailure("plan_restricted").fallback).toEqual(["add_manually"]);
  });

  it("gives AI failures their own wording", () => {
    expect(messageForFailure("ai_rate_limited").message).toMatch(/busy|shortly/i);
    expect(messageForFailure("not_a_recipe").fallback).toEqual(["add_manually"]);
  });
});
