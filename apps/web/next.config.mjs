import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel's adapter packages its own runtime; standalone is for self-hosting.
  ...(process.env.VERCEL === "1" ? {} : { output: "standalone" }),
  // Starting a dev server must not create or modify repository agent instructions.
  agentRules: false,
  // Keep monorepo discovery inside FixMap even when a developer has an unrelated
  // package-lock.json in a parent directory (for example after a mistyped `cd`).
  outputFileTracingRoot: workspaceRoot,
  // The site was simplified to Home, Docs, Evidence and Changelog; old pages keep working.
  async redirects() {
    return [
      { source: "/product", destination: "/", permanent: true },
      { source: "/features", destination: "/docs#commands", permanent: true },
      { source: "/use-cases", destination: "/", permanent: true },
      { source: "/demo", destination: "/#conversation", permanent: true },
      { source: "/get-started", destination: "/docs", permanent: true }
    ];
  },
  turbopack: {
    root: workspaceRoot
  }
};

export default nextConfig;
