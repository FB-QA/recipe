import type { NextConfig } from "next";
import { ROUTER_CACHE_SECONDS } from "./src/lib/config/cache";

const nextConfig: NextConfig = {
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
