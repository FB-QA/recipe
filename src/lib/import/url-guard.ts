import { promises as dns } from "node:dns";
import net from "node:net";

// Loopback in dev/test only, so the local JSON-LD fixture server is reachable.
const ALLOW_LOOPBACK = process.env.NODE_ENV !== "production";

function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0) return true; // unspecified
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::") return true;
    if (l.startsWith("fe80")) return true; // link-local
    if (l.startsWith("fc") || l.startsWith("fd")) return true; // unique-local
    const mapped = l.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    return false;
  }
  return true; // unknown format → block
}

function loopback(ip: string) {
  return ip === "::1" || ip.startsWith("127.");
}

/**
 * Guards against SSRF: only http(s), and the URL's resolved address must not be
 * loopback/private/link-local/metadata. Resolves the hostname so a public name
 * pointing at an internal IP is caught too.
 */
export async function isSafeImportUrl(raw: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  let ip = host;
  if (!net.isIP(host)) {
    try {
      ip = (await dns.lookup(host)).address;
    } catch {
      return false;
    }
  }

  if (isBlockedIp(ip)) return ALLOW_LOOPBACK && loopback(ip);
  return true;
}
