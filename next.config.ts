import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Every page here is private, per-user data, so we render on each request
  // instead of using Cache Components.
  poweredByHeader: false,
  // PDFs are uploaded through a Server Action; the default limit is 1 MB. PDFs may be up to 10 MB.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  serverExternalPackages: ["@node-rs/argon2"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Nothing may be framed, except that our own pages show the PDF in a same-site frame.
  async headers() {
    return [
      { source: "/((?!api/documents/[^/]+/file).*)", headers: [...securityHeaders, { key: "X-Frame-Options", value: "DENY" }] },
      { source: "/api/documents/:id/file", headers: [...securityHeaders, { key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};

export default nextConfig;
