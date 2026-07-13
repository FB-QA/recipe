import { isSafeImportUrl } from "@/lib/import/url-guard";

const MAX_REDIRECTS = 4;
export const MAX_FETCH_BYTES = 8 * 1024 * 1024; // 8 MB

type SafeFetchOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
};

/**
 * Fetch a user-supplied URL defensively:
 *  - SSRF-guards EVERY hop, so a public URL can't 302 to an internal host
 *    (redirects are followed manually and re-validated);
 *  - rejects an oversized advertised Content-Length before reading.
 * Returns null on any unsafe/failed/oversized outcome.
 */
export async function safeFetch(url: string, opts: SafeFetchOptions = {}): Promise<Response | null> {
  const maxBytes = opts.maxBytes ?? MAX_FETCH_BYTES;
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isSafeImportUrl(current))) return null;

    let res: Response;
    try {
      res = await fetch(current, {
        headers: opts.headers,
        redirect: "manual",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
    } catch {
      return null;
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      try {
        current = new URL(location, current).toString();
      } catch {
        return null;
      }
      continue;
    }

    const advertised = Number(res.headers.get("content-length") ?? "0");
    if (advertised && advertised > maxBytes) return null;
    return res;
  }
  return null; // too many redirects
}

/** Read a response body with a hard byte cap (guards a missing/lying Content-Length). */
export async function readCapped(res: Response, maxBytes: number = MAX_FETCH_BYTES): Promise<Buffer | null> {
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > maxBytes ? null : buf;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
