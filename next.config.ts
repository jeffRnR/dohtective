// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expose Thirdweb client ID to the browser bundle.
  // Only public/non-secret values should go here — this is baked into
  // the client-side JS. Secret keys stay server-side only.
  env: {
    THIRDWEB_CLIENT_ID: process.env.THIRDWEB_CLIENT_ID,
  },

  // ── Security headers ─────────────────────────────────────────────────
  // Applied to every response. CSP is intentionally permissive for now
  // to avoid breaking Thirdweb/Google/Zoho integrations — tighten
  // script-src and connect-src once you have a known list of origins.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            // HSTS — tells browsers to always use HTTPS for this domain.
            // max-age=63072000 = 2 years. Add includeSubDomains when ready.
            key: "Strict-Transport-Security",
            value: "max-age=63072000",
          },
          {
            // CSP — allows Thirdweb, Google OAuth, Zoho OAuth, Vercel analytics.
            // Tighten script-src to remove 'unsafe-inline' once you audit
            // inline scripts. frame-ancestors DENY prevents clickjacking.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.thirdweb.com https://vercel.live",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https: blob:",
              "connect-src 'self' https://accounts.zoho.com https://*.zoho.com https://accounts.google.com https://*.thirdweb.com wss://relay.walletconnect.com",
              "frame-src https://accounts.google.com https://accounts.zoho.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;