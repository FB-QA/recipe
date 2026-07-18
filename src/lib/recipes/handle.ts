/**
 * Render a source attribution. A real Instagram handle (no spaces) gets an "@";
 * a display name (e.g. from a page that only exposed the creator's name, not
 * their username) is shown as-is. Prevents "@Emily English" — an @ on a name.
 */
export function looksLikeHandle(value: string): boolean {
  return /^[a-z0-9._]+$/i.test(value);
}

export function attributionLabel(value: string | null | undefined, { at = true } = {}): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (looksLikeHandle(trimmed)) return at ? `@${trimmed}` : trimmed;
  return trimmed;
}
