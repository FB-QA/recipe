/**
 * Measurement conversion — public API (Phase 1: the deterministic engine).
 *
 * Later phases layer on top: recipe toggle + portion scaling (Phase 2),
 * ingredient density profiles for volume↔weight (Phase 3), legacy row
 * convert-on-read (Phase 4), instruction spans (Phase 5), preferences and
 * overrides (Phase 6). Spec: docs/spec/measurement-conversion.md.
 */

export * from "./measurement-types";
export { UNIT_DEFINITIONS, GAS_MARK_TABLE, dimensionOf } from "./unit-definitions";
export { REGIONAL_VOLUME_ML, DEFAULT_UNIT_REGION, SYSTEM_REGION, regionalMl } from "./regional-profiles";
export { normalizeUnit } from "./unit-normalizer";
export { parseQuantity } from "./quantity-parser";
export { convert } from "./measurement-converter";
export {
  friendlyFraction,
  formatQuantityValue,
  selectFriendlyMass,
  selectFriendlyVolume,
  roundForDisplay,
  practicalTinInches,
} from "./quantity-formatter";
