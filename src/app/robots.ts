import type { MetadataRoute } from "next";
import { env } from "@/server/env";

export default function robots(): MetadataRoute.Robots {
  return {
    // Signed-in areas and individual certificate checks (which show names) stay out of search engines.
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/teach",
        "/learn",
        "/org",
        "/account",
        "/api",
        "/verify/",
        "/certificates",
        "/check-in",
      ],
    },
    sitemap: `${env().APP_URL}/sitemap.xml`,
  };
}
