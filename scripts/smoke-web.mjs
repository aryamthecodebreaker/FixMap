import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const output = [];
const child = spawn(process.execPath, [nextBin, "start", "apps/web", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: repoRoot,
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"]
});
child.stdout.on("data", (chunk) => output.push(chunk.toString()));
child.stderr.on("data", (chunk) => output.push(chunk.toString()));

try {
  await waitForServer(`${origin}/`);
  await assertPage("/", "FixMap tells AI coding tools which files to check first.");
  await assertPage("/demo", "See FixMap choose");
  console.log(`Web production smoke passed: / and /demo returned expected content from next start on ${origin}.`);
} catch (error) {
  console.error(`${error instanceof Error ? error.message : String(error)}\n${output.join("").slice(-4_000)}`);
  process.exitCode = 1;
} finally {
  child.kill();
  await Promise.race([
    new Promise((resolveClose) => child.once("close", resolveClose)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 3_000))
  ]);
}

async function assertPage(path, expectedText) {
  const response = await fetch(`${origin}${path}`);
  const body = await response.text();
  if (response.status !== 200 || !body.includes(expectedText)) {
    throw new Error(
      `Web production smoke failed for ${path}: expected HTTP 200 and ${JSON.stringify(expectedText)}, ` +
      `received HTTP ${response.status}.`
    );
  }
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start exited before becoming ready (code ${child.exitCode}).`);
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch { /* The server is still starting. */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("next start did not become ready within 30 seconds.");
}

function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const selected = typeof address === "object" && address ? address.port : undefined;
      server.close((error) => error ? reject(error) : resolvePort(selected));
    });
  });
}
