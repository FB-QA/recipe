import { type NextRequest, NextResponse } from "next/server";
import { isSafeImportUrl } from "@/lib/import/url-guard";
import { BROWSER_USER_AGENT } from "@/lib/http";
import { safeFetch, readCapped } from "@/lib/safe-fetch";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Proxies a remote image for the import review preview. Instagram's CDN blocks
 * hotlinking from the browser, so we fetch it server-side (with a browser UA)
 * and stream it back. Auth-gated by the proxy middleware; SSRF-guarded so it
 * can't be turned into an internal-network probe.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url || !(await isSafeImportUrl(url))) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const res = await safeFetch(url, {
    headers: { "user-agent": BROWSER_USER_AGENT },
    maxBytes: MAX_IMAGE_BYTES,
  });
  if (!res || !res.ok) return new NextResponse("Upstream error", { status: 502 });

  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) return new NextResponse("Not an image", { status: 415 });

  const buf = await readCapped(res, MAX_IMAGE_BYTES);
  if (!buf) return new NextResponse("Image too large", { status: 413 });

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: { "content-type": contentType, "cache-control": "private, max-age=3600" },
  });
}
