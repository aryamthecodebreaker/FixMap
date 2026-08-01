import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep monorepo discovery inside FixMap even when a developer has an unrelated
  // package-lock.json in a parent directory (for example after a mistyped `cd`).
  turbopack: {
    root: fileURLToPath(new URL("../..", import.meta.url))
  }
};

export default nextConfig;
