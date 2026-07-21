import { UNICODE_FRACTION_CHARS } from "@/lib/measurements";

/**
 * Reduce slash-separated measurement annotations in an ingredient line to the
 * selected system. Recipe authors often pre-write both — "200g / 7 oz",
 * "1 cup / 150g / 5oz" — so switching to Metric should SHOW only the metric
 * amount, not every unit. Selection, not conversion: the author already did the
 * maths. Non-measurement text (names, notes, "or …" alternatives) is untouched;
 * a group with no member in the target system is left whole (never lose data).
 */

const METRIC_UNITS = String.raw`kilograms?|grams?|milligrams?|millilit(?:re|er)s?|lit(?:re|er)s?|kg|mg|ml|g|l`;
const US_UNITS = String.raw`fl\.?\s*oz|fluid\s+ounces?|ounces?|pounds?|oz|lbs?|cups?|tablespoons?|tbsps?|teaspoons?|tsps?|pints?|quarts?|gallons?`;
const UNIT = `${METRIC_UNITS}|${US_UNITS}`;
// Derived from METRIC_UNITS — one source of truth for the metric vocabulary.
const METRIC_UNIT_MATCH = new RegExp(`^(?:${METRIC_UNITS})$`);
// An amount: a whole number with a unicode fraction ("1½"), a mixed/decimal/typed
// fraction ("1 1/2", "1.5", "1/2"), or a bare unicode fraction ("½"). The
// unicode-mixed form is FIRST so "1½" is taken whole, never split into "1" + "½".
const AMOUNT = String.raw`(?:\d+\s*[${UNICODE_FRACTION_CHARS}]|\d+(?:\s+\d+\/\d+|\.\d+|\/\d+)?|[${UNICODE_FRACTION_CHARS}])`;
// A measurement: an amount, an OPTIONAL range ("200–250 g", "7–9 oz"), then a
// unit with an optional trailing period on an abbreviation ("1 tbsp.").
const MEAS = String.raw`${AMOUNT}(?:\s*[–—-]\s*${AMOUNT})?\s*(?:${UNIT})\b\.?`;
// A group: two or more measurements joined by "/".
const GROUP = new RegExp(`${MEAS}(?:\\s*\\/\\s*${MEAS})+`, "gi");
const MEAS_GLOBAL = new RegExp(MEAS, "gi");
const UNIT_IN_MEMBER = new RegExp(`(${UNIT})\\b`, "i");

type ReduceSystem = "metric" | "us";

function memberSystem(member: string): ReduceSystem {
  const m = member.match(UNIT_IN_MEMBER);
  const unit = m ? m[1].toLowerCase().replace(/\s+/g, "") : "";
  return METRIC_UNIT_MATCH.test(unit) ? "metric" : "us";
}

export function reduceMeasurementGroups(text: string, system: ReduceSystem): string {
  return text.replace(GROUP, (group) => {
    // Extract members by matching whole measurements — NOT by splitting on "/",
    // which would also cut a typed fraction ("1/2 cup" → "1" + "2 cup").
    const members = group.match(MEAS_GLOBAL) ?? [];
    const pick = members.find((m) => memberSystem(m) === system);
    return pick ?? group;
  });
}
