import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const dockerfile = await readFile(resolve(root, "containers/self-hosted/Dockerfile"), "utf8");
const nextConfig = await readFile(resolve(root, "apps/web/next.config.mjs"), "utf8");

const checks = [
  [/^ARG NODE_IMAGE=node:24-bookworm-slim@sha256:[a-f0-9]{64}$/m, "base image is pinned by a full SHA-256 manifest digest"],
  [/(?:^|\n)FROM \$\{NODE_IMAGE\} AS build\n/, "build stage uses the pinned base"],
  [/(?:^|\n)FROM \$\{NODE_IMAGE\} AS mcp\n/, "MCP stage uses the pinned base"],
  [/(?:^|\n)FROM \$\{NODE_IMAGE\} AS web\n/, "web stage uses the pinned base"],
  [/FIXMAP_CACHE_DIR=\/var\/lib\/fixmap\/cache/, "MCP cache has an explicit persistent location"],
  [/VOLUME \["\/var\/lib\/fixmap\/cache", "\/workspace"\]/, "MCP declares cache and workspace mounts"],
  [/USER node\nVOLUME[\s\S]*?HEALTHCHECK[\s\S]*?ENTRYPOINT[\s\S]*?CMD \["mcp", "--repo", "\/workspace"\]/, "MCP runs non-root with a health check and real stdio command"],
  [/USER node\nEXPOSE 3000\nHEALTHCHECK[\s\S]*?CMD \["node", "apps\/web\/server\.js"\]/, "web runs non-root with a health check and standalone server"],
  [/output: "standalone"/, "Next.js emits a standalone runtime"],
  [/COPY --from=build --chown=node:node/g, "runtime artifacts are owned by the non-root user"]
];

for (const [pattern, description] of checks) {
  const matches = dockerfile.match(pattern) ?? nextConfig.match(pattern);
  if (!matches) throw new Error(`Self-hosted container policy failed: ${description}.`);
}
if (/^FROM\s+(?!\$\{NODE_IMAGE\})/m.test(dockerfile)) throw new Error("Self-hosted container policy failed: an unpinned base stage exists.");
if (/\b(?:ADD|curl|wget)\s+/i.test(dockerfile)) throw new Error("Self-hosted container policy failed: remote or opaque artifact acquisition exists.");

// Exercise the actual config in isolated processes, not just its source spelling.
const configUrl = pathToFileURL(resolve(root, "apps/web/next.config.mjs")).href;
for (const vercel of ["", "0", "1"]) {
  const config = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e",
    `import config from ${JSON.stringify(configUrl)}; console.log(JSON.stringify(config));`
  ], { encoding: "utf8", env: { ...process.env, VERCEL: vercel }, timeout: 10_000 }));
  const expected = vercel === "1" ? undefined : "standalone";
  if (config.output !== expected) throw new Error(`Incorrect Next.js output mode for VERCEL=${JSON.stringify(vercel)}.`);
  if (config.agentRules !== false) throw new Error("Next.js must not generate agent instructions.");
}

console.log("Self-hosted container policy is structurally valid; this does not replace an image build or runtime test.");
