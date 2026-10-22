import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/** Lets learners add YARI Academy to their phone's home screen (installable web app). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.academyName,
    short_name: BRAND.academyName,
    description: `Health & Safety and AI & Digital training from ${BRAND.companyName}.`,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#F7F5F0",
    theme_color: "#0B0B0C",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
