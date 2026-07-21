/**
 * Measurement conversion — public API (Phase 1: the deterministic engine).
 *
 * Later phases layer on top: recipe toggle + portion scaling (Phase 2),
 * ingredient density profiles for volume↔weight (Phase 3), legacy row
 * convert-on-read (Phase 4), instruction spans (Phase 5), preferences and
 * overrides (Phase 6). Spec: docs/spec/measurement-conversion.md.
 */

// Public API — exactly what consumers outside this folder use. Engine internals
// (regional profiles, gas-mark table, friendly-unit primitives) stay module-
// private and are imported directly where needed.
export * from "./measurement-types";
export { UNIT_DEFINITIONS } from "./unit-definitions";
export { SYSTEM_REGION } from "./regional-profiles";
export { normalizeUnit } from "./unit-normalizer";
export { parseQuantity, UNICODE_FRACTION_CHARS } from "./quantity-parser";
export { convert } from "./measurement-converter";
export { selectSystemUnit } from "./target-units";
export { formatQuantityValue } from "./quantity-formatter";
