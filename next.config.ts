import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Cover photos are sent through a Server Action to be optimised by sharp
    // before storage; phone photos can be several MB before compression.
    serverActions: { bodySizeLimit: "12mb" },
  },
  // sharp is a native module — keep it external to the server bundle.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
