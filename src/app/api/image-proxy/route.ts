import { type NextRequest, NextResponse } from "next/server";
import { isSafeImportUrl } from "@/lib/import/url-guard";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15";

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

  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return new NextResponse("Upstream error", { status: 502 });

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return new NextResponse("Not an image", { status: 415 });

    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: { "content-type": contentType, "cache-control": "private, max-age=3600" },
    });
  } catch {
    return new NextResponse("Fetch failed", { status: 502 });
  }
}
