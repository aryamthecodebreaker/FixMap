#!/usr/bin/env node
// Runtime proof for containers/self-hosted/Dockerfile. Needs Docker; CI runs it on Linux.
// Usage: node scripts/container-smoke.mjs [--skip-build] [--mcp-image <tag>] [--web-image <tag>]
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const mcpImage = option("--mcp-image", "fixmap-mcp:smoke");
const webImage = option("--web-image", "fixmap-web:smoke");
const unique = `${process.pid}-${Date.now()}`;
const cacheVolume = `fixmap-smoke-cache-${unique}`;
const otherVolume = `fixmap-smoke-other-${unique}`;
const results = [];

function docker(argv, options = {}) {
  // With inherited output (image builds) execFileSync returns null.
  const output = execFileSync("docker", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30 * 60_000, ...options });
  return (output ?? "").trim();
}

function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!condition) throw new Error(`Container smoke failed: ${name}${detail ? ` (${detail})` : ""}`);
}

function fixtureRepository() {
  const directory = mkdtempSync(join(tmpdir(), "fixmap-container-repo-"));
  mkdirSync(join(directory, "src", "auth"), { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "container-fixture", scripts: { test: "vitest run" } }));
  writeFileSync(join(directory, "src", "auth", "reset.ts"), "export function resetPassword(email: string) { return email.includes('@'); }\n");
  writeFileSync(join(directory, "src", "auth", "reset.test.ts"), "import { resetPassword } from './reset';\ntest('reset', () => resetPassword('a@b'));\n");
  writeFileSync(join(directory, "README.md"), "# Fixture\n");
  return directory;
}

/** Speaks newline-delimited JSON-RPC to the real stdio server inside a zero-network, read-only container. */
async function mcpSession(workspace) {
  const child = spawn("docker", [
    "run", "--rm", "-i",
    "--network", "none",
    "--read-only",
    "--tmpfs", "/tmp:rw,size=64m",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "-v", `${workspace}:/workspace:ro`,
    "-v", `${cacheVolume}:/var/lib/fixmap/cache`,
    mcpImage
  ], { stdio: ["pipe", "pipe", "pipe"] });
  let buffer = "";
  let stderr = "";
  const waiting = new Map();
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined && waiting.has(message.id)) {
        waiting.get(message.id)(message);
        waiting.delete(message.id);
      }
    }
  });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  let nextId = 1;
  const request = (method, params) => new Promise((resolveRequest, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => reject(new Error(`MCP ${method} timed out. stderr: ${stderr.slice(-2000)}`)), 120_000);
    waiting.set(id, (message) => { clearTimeout(timer); resolveRequest(message); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
  const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  const close = () => new Promise((done) => { child.on("close", done); child.stdin.end(); });
  return { request, notify, close, stderr: () => stderr };
}

async function waitForHealthy(container, seconds) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 2) {
    const status = docker(["inspect", "--format", "{{.State.Health.Status}}", container]);
    if (status === "healthy") return status;
    if (status === "unhealthy") return status;
    await new Promise((done) => setTimeout(done, 2_000));
  }
  return docker(["inspect", "--format", "{{.State.Health.Status}}", container]);
}

const workspace = fixtureRepository();
let webContainer;
try {
  if (!args.includes("--skip-build")) {
    for (const [target, tag] of [["mcp", mcpImage], ["web", webImage]]) {
      docker(["build", "-f", "containers/self-hosted/Dockerfile", "--target", target, "-t", tag, "."], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
    }
  }

  for (const image of [mcpImage, webImage]) {
    const user = docker(["image", "inspect", "--format", "{{.Config.User}}", image]);
    check(`${image} declares the non-root user`, user === "node", `Config.User=${user}`);
    const uid = docker(["run", "--rm", "--network", "none", "--entrypoint", "id", image, "-u"]);
    check(`${image} runs with a non-zero uid`, uid !== "0" && /^\d+$/.test(uid), `uid=${uid}`);
    const os = docker(["run", "--rm", "--network", "none", "--entrypoint", "cat", image, "/etc/os-release"]);
    check(`${image} is built on Debian bookworm`, /VERSION_CODENAME=bookworm/.test(os));
    const node = docker(["run", "--rm", "--network", "none", "--entrypoint", "node", image, "--version"]);
    check(`${image} ships Node 24`, /^v24\./.test(node), node);
  }

  docker(["volume", "create", cacheVolume]);
  docker(["volume", "create", otherVolume]);
  const session = await mcpSession(workspace);
  const init = await session.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "container-smoke", version: "1" } });
  check("MCP initializes with no network and a read-only root filesystem", init.result?.serverInfo?.name !== undefined, init.error?.message);
  session.notify("notifications/initialized", {});
  const tools = await session.request("tools/list", {});
  const names = (tools.result?.tools ?? []).map((tool) => tool.name);
  check("MCP lists its tools", names.includes("fixmap_plan") && names.includes("fixmap_verify"), `${names.length} tools`);
  const plan = await session.request("tools/call", { name: "fixmap_plan", arguments: { issue: "password reset fails", repo: "/workspace", format: "json", noCache: false } });
  const text = plan.result?.content?.[0]?.text ?? "";
  check("MCP plans against the read-only mounted workspace", !plan.result?.isError && text.includes("src/auth/reset.ts"), plan.result?.isError ? text.slice(0, 400) : undefined);
  await session.close();

  const listCache = (volume) => docker(["run", "--rm", "--network", "none", "--entrypoint", "node", "-v", `${volume}:/cache:ro`, mcpImage,
    "-e", "const fs=require('fs');const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);console.log(walk('/cache').length)"]);
  const cached = Number(listCache(cacheVolume));
  check("the scan cache persists in its volume after the container exits", cached > 0, `${cached} cache files`);
  const isolated = Number(listCache(otherVolume));
  check("a different cache volume stays empty", isolated === 0, `${isolated} files`);

  webContainer = `fixmap-smoke-web-${unique}`;
  docker(["run", "-d", "--name", webContainer, "--network", "none", "--read-only", "--tmpfs", "/tmp:rw,size=64m",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--health-interval", "2s", "--health-start-period", "5s", webImage]);
  const health = await waitForHealthy(webContainer, 90);
  check("web reports healthy with no network and a read-only root filesystem", health === "healthy", `health=${health}; logs: ${health === "healthy" ? "" : docker(["logs", "--tail", "40", webContainer])}`);
  for (const path of ["/", "/features", "/changelog"]) {
    const status = docker(["exec", webContainer, "node", "-e", `fetch('http://127.0.0.1:3000${path}').then(async r=>{const t=await r.text();console.log(r.status+' '+(t.includes('FixMap')?'branded':'unbranded'))})`]);
    check(`web serves ${path}`, status === "200 branded", status);
  }

  console.log(`\nContainer smoke passed: ${results.length} checks.`);
} finally {
  if (webContainer) { try { docker(["rm", "-f", webContainer]); } catch { /* already gone */ } }
  for (const volume of [cacheVolume, otherVolume]) { try { docker(["volume", "rm", "-f", volume]); } catch { /* not created */ } }
  rmSync(workspace, { recursive: true, force: true });
}
