import type { NextConfig } from "next";

// The browser talks to /backend/... on this Next.js app, and Next forwards it
// to the TrueVoice backend (/api/...). This avoids CORS errors.
const backend = process.env.TRUEVOICE_BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.9", "192.168.1.9:3000", "localhost", "localhost:3000"],

  // Turns Tailwind on. Do not remove this block.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/backend/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;