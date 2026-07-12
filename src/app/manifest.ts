import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Romy's Kitchen",
    short_name: "Romy's Kitchen",
    description: "Every recipe you love, in one place you can cook from.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1f2ec",
    theme_color: "#f1f2ec",
    categories: ["food", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
