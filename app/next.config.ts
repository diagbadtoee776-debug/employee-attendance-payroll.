import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keeps the "Cache Components" feature the template enabled
  cacheComponents: true,

  // Tells Turbopack this folder (app) is the project root,
  // which removes the "set turbopack.root" warning
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;