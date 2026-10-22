import type { MetadataRoute } from "next";

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
    // Read directly: robots.txt is built ahead of time, before secrets exist.
    sitemap: `${process.env.APP_URL ?? "http://localhost:3000"}/sitemap.xml`,
  };
}
