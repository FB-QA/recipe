/** First name for greetings; falls back to a neutral possessive-friendly word. */
export function firstName(displayName?: string | null): string {
  const trimmed = displayName?.trim();
  if (!trimmed) return "My";
  return trimmed.split(/\s+/)[0];
}
