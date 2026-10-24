import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
];

// Content-Security-Policy. Pages stay static-friendly, so scripts allow 'unsafe-inline' (the
// App Router's inline bootstrap and our theme script); everything else is locked to our own
// origin plus the video hosts and file storage we actually use. Files under /api/files get
// their own stricter sandbox policy from the route instead.
function contentSecurityPolicy() {
  const dev = process.env.NODE_ENV !== "production";
  const region = process.env.S3_REGION ?? "af-south-1";
  const storage = [
    `https://*.s3.${region}.amazonaws.com`,
    `https://s3.${region}.amazonaws.com`,
    ...(process.env.S3_ENDPOINT ? [new URL(process.env.S3_ENDPOINT).origin] : []),
  ].join(" ");
  const video = "https://www.youtube-nocookie.com https://player.vimeo.com https://iframe.mediadelivery.net";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${storage}`,
    "font-src 'self'",
    `media-src 'self' blob: ${storage}`,
    `connect-src 'self' ${storage}`,
    `frame-src 'self' ${video} ${storage}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...((process.env.APP_URL ?? "").startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "@react-pdf/renderer"],
  // Form submissions (server actions) must come from the same host. A demo run behind a tunnel
  // (laptop + Cloudflare) sees a different host, so that build lists the tunnel's domain here.
  // Empty for the normal server build.
  experimental: {
    serverActions: {
      allowedOrigins: (process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages can't be framed by anyone; uploaded PDFs can be framed by our own item viewer.
      {
        source: "/((?!api/files/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
        ],
      },
      { source: "/api/files/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};

export default nextConfig;
