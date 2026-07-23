import type { NextConfig } from "next";
import { ROUTER_CACHE_SECONDS } from "./src/lib/config/cache";

// The build's version, stamped once at build time. On Vercel VERCEL_GIT_COMMIT_SHA is
// set for every deploy; locally it is absent, so it falls back to "dev" and the whole
// version lifecycle stays inert. Baked into the client bundle (so a client knows the
// build it loaded) and read by the server at runtime (so it can advertise the live
// deploy). See src/lib/version.
const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "dev";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: APP_VERSION },
  experimental: {
    // Cover photos are sent through a Server Action to be optimised by sharp
    // before storage; phone photos can be several MB before compression.
    serverActions: { bodySizeLimit: "12mb" },

    // Client router cache. The default for a dynamic route is 0 — so every
    // navigation, including flicking straight back to the page you left a second
    // ago, was a fresh server render. Every page here is dynamic (they read auth
    // cookies), so that default made all navigation pay full price. The durations
    // and the reasoning live in the config module.
    staleTimes: {
      dynamic: ROUTER_CACHE_SECONDS.dynamic,
      static: ROUTER_CACHE_SECONDS.static,
    },
  },
  // sharp is a native module — keep it external to the server bundle.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
