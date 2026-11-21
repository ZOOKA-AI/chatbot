import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const mediaPermissions = {
  key: "Permissions-Policy",
  value: "camera=(), microphone=(self), display-capture=(self), geolocation=()",
};
const chatMediaPermissions = {
  ...mediaPermissions,
  value: "camera=(self), microphone=(self), display-capture=(self), geolocation=()",
};

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The browser runtime loads a Chromium driver at request time through a computed import, which
  // the bundler cannot trace. Keeping it external makes the package part of the deployed function;
  // without this the import resolves to nothing inside the lambda.
  serverExternalPackages: ["playwright-core"],
  // Standalone output is what the self-hosted web image runs (see deploy/docker). It is
  // opt-in so the hosted build is byte-for-byte what it was before this package existed:
  // Vercel never sets this variable.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Clickjacking protection: only this site may frame its own pages.
          // A full script/style CSP is deliberately not enforced here (GA,
          // Stripe and Vercel Analytics need an audited allowlist first).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          mediaPermissions,
        ],
      },
      // Next.js uses the last matching header value. Only chat pages with
      // the live console may ask for the user's camera; /embed stays denied.
      { source: "/", headers: [chatMediaPermissions] },
      { source: "/chat/:id", headers: [chatMediaPermissions] },
    ];
  },
  async redirects() {
    return [
      { source: "/privacy-policy", destination: "/privacy", permanent: true },
      { source: "/terms-of-use", destination: "/terms", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        hostname: "avatar.vercel.sh",
      },
      {
        protocol: "https",
        //https://nextjs.org/docs/messages/next-image-unconfigured-host
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default withBotId(nextConfig);
