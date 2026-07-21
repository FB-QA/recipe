import { UNICODE_FRACTION_CHARS } from "@/lib/measurements";

/**
 * Reduce slash-separated measurement annotations in an ingredient line to the
 * selected system. Recipe authors often pre-write both — "200g / 7 oz",
 * "1 cup / 150g / 5oz" — so switching to Metric should SHOW only the metric
 * amount, not every unit. Selection, not conversion: the author already did the
 * maths. Non-measurement text (names, notes, "or …" alternatives) is untouched;
 * a group with no member in the target system is left whole (never lose data).
 */

const METRIC_UNITS = String.raw`kg|g|mg|ml|l`;
const US_UNITS = String.raw`oz|lbs?|cups?|tbsps?|tablespoons?|tsps?|teaspoons?|fl\.?\s*oz|pints?|quarts?|gallons?`;
const UNIT = `${METRIC_UNITS}|${US_UNITS}`;
// An amount: whole/decimal/mixed/typed-fraction, or a unicode fraction.
const AMOUNT = String.raw`(?:\d+(?:\s+\d+\/\d+|\.\d+|\/\d+)?|[${UNICODE_FRACTION_CHARS}])`;
const MEAS = String.raw`${AMOUNT}\s*(?:${UNIT})\b`;
// A group: two or more measurements joined by "/".
const GROUP = new RegExp(`${MEAS}(?:\\s*\\/\\s*${MEAS})+`, "gi");
const UNIT_IN_MEMBER = new RegExp(`(${UNIT})\\b`, "i");

type ReduceSystem = "metric" | "us";

function memberSystem(member: string): ReduceSystem {
  const m = member.match(UNIT_IN_MEMBER);
  const unit = m ? m[1].toLowerCase().replace(/\s+/g, "") : "";
  return /^(kg|g|mg|ml|l)$/.test(unit) ? "metric" : "us";
}

export function reduceMeasurementGroups(text: string, system: ReduceSystem): string {
  return text.replace(GROUP, (group) => {
    const members = group.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
    const pick = members.find((m) => memberSystem(m) === system);
    return pick ?? group;
  });
}
