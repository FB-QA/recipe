import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { APP_VERSION, VERSION_HEADER } from "@/lib/version/version";

export default async function proxy(request: NextRequest) {
  // Advertise the live build's version on the response the middleware already returns —
  // the client reads it off traffic it already makes, so this costs no extra request.
  const response = await updateSession(request);
  response.headers.set(VERSION_HEADER, APP_VERSION);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon, and common static assets
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
