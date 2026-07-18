import { isSafeImportUrl } from "@/lib/import/url-guard";

const MAX_REDIRECTS = 4;
export const MAX_FETCH_BYTES = 8 * 1024 * 1024; // 8 MB

type SafeFetchOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  /**
   * Optional per-hop host policy on TOP of the SSRF guard — e.g. the
   * Instagram resolver rejects any redirect leaving instagram.com. Applied
   * to the initial URL and re-applied to every redirect destination.
   */
  hostAllowed?: (url: URL) => boolean;
  /** Injected fetch seam for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

export type SafeFetchResult =
  | { kind: "ok"; response: Response }
  | { kind: "unsafe" }
  | { kind: "timeout" }
  | { kind: "too_large" }
  | { kind: "network" };

/**
 * Fetch a user-supplied URL defensively, reporting WHY it failed:
 *  - SSRF-guards EVERY hop, so a public URL can't 302 to an internal host
 *    (redirects are followed manually and re-validated);
 *  - re-checks the caller's host policy on every redirect destination;
 *  - rejects an oversized advertised Content-Length before reading.
 */
export async function safeFetchDetailed(url: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? MAX_FETCH_BYTES;
  const doFetch = opts.fetchImpl ?? fetch;
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return { kind: "unsafe" };
    }
    if (opts.hostAllowed && !opts.hostAllowed(parsed)) return { kind: "unsafe" };
    if (!(await isSafeImportUrl(current))) return { kind: "unsafe" };

    let res: Response;
    try {
      res = await doFetch(current, {
        headers: opts.headers,
        redirect: "manual",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
    } catch (err) {
      const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
      return { kind: timedOut ? "timeout" : "network" };
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { kind: "network" };
      try {
        current = new URL(location, current).toString();
      } catch {
        return { kind: "network" };
      }
      continue;
    }

    const advertised = Number(res.headers.get("content-length") ?? "0");
    if (advertised && advertised > maxBytes) return { kind: "too_large" };
    return { kind: "ok", response: res };
  }
  return { kind: "network" }; // too many redirects
}

/**
 * Back-compatible boolean form: null on any unsafe/failed/oversized outcome.
 */
export async function safeFetch(url: string, opts: SafeFetchOptions = {}): Promise<Response | null> {
  const result = await safeFetchDetailed(url, opts);
  return result.kind === "ok" ? result.response : null;
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
