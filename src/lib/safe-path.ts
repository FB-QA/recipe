/**
 * Returns `value` only if it's a same-origin relative path (starts with a single
 * "/", not "//" or "/\"). Otherwise falls back to "/". Prevents open redirects
 * when bouncing users after auth.
 */
export function safeRelativePath(value: unknown): string {
  const v = typeof value === "string" ? value : "";
  return /^\/(?![/\\])/.test(v) ? v : "/";
}
