import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lighthouse "Trust and Safety": no framing (clickjacking) and an isolated
  // browsing context. No CSP on purpose: a full policy would have to allow
  // Supabase, R2 and the provider's images and can break Next.js itself.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
