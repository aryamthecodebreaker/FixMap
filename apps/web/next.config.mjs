import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep monorepo discovery inside FixMap even when a developer has an unrelated
  // package-lock.json in a parent directory (for example after a mistyped `cd`).
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot
  }
};

export default nextConfig;
