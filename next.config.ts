import type { NextConfig } from "next";

/**
 * Cache Components is intentionally OFF for V1: nearly every page reads the signed-in user's
 * data, so fully dynamic rendering is the simpler and safer model. See docs/product-decisions.md.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Embedded Postgres (WASM) and the Postgres driver must run from node_modules, not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  experimental: {
    serverActions: {
      // Photo uploads: up to 4 files × 5 MB, validated again on the server.
      bodySizeLimit: "22mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
