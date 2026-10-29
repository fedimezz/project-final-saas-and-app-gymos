import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't advertise "X-Powered-By: Next.js" — no functional benefit, minor
  // recon information for an attacker.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      // Owner-uploaded photos (page content editor, gallery, avatars, etc.)
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Placeholder/stock photos used as defaults in the content schema
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // Baseline security headers. The app already sets its own auth cookie
  // flags (httpOnly/secure/sameSite) in lib/auth.ts — these cover the
  // browser-level protections that aren't per-route.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Clickjacking protection is provided by the nonce-based CSP in proxy.ts.
          // Stop browsers from MIME-sniffing responses away from their
          // declared Content-Type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't leak the full referrer URL to third-party origins.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Force HTTPS for a year once a browser has seen it once.
          // Harmless in local dev (only enforced by browsers over https).
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Disable powerful browser features this app doesn't use.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;