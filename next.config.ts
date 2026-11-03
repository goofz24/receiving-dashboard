import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg is a Node.js library; keep it out of the browser bundle.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
