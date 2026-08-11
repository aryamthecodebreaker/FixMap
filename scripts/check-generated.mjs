import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const modes = {
  action: {
    paths: ["packages/action/dist/index.mjs"],
    commands: [["npm", "run", "build:action"]]
  },
  rendered: {
    paths: [
      "docs/assets/fixmap-cli-demo.svg",
      "docs/assets/fixmap-benchmark.svg",
      "examples/reports/declines-fabricated-identifier.md",
      "examples/reports/declines-vague-task.md",
      "examples/reports/declines-unmatched-terms.md"
    ],
    commands: [
      ["npm", "run", "render:examples"],
      ["npm", "run", "build:cli"],
      [process.execPath, "scripts/render-demo.mjs"],
      ["npm", "run", "render:benchmark-card"]
    ]
  }
};

const modeName = process.argv[2];
const mode = modes[modeName];
if (!mode) {
  console.error(`Usage: node scripts/check-generated.mjs ${Object.keys(modes).join("|")}`);
  process.exit(1);
}

const originals = new Map();
for (const path of mode.paths) originals.set(path, await readFile(path));

let commandFailure = 0;
let changed = [];
try {
  for (const [command, ...args] of mode.commands) {
    // Windows cannot execute npm.cmd directly through spawnSync on every supported
    // Node release. When npm launched this gate, reuse its JavaScript entrypoint
    // through the current Node executable instead of starting a command shell.
    const npmEntrypoint = command === "npm" ? process.env.npm_execpath : undefined;
    const executable = npmEntrypoint ? process.execPath : command;
    const commandArgs = npmEntrypoint ? [npmEntrypoint, ...args] : args;
    const result = spawnSync(executable, commandArgs, {
      stdio: "inherit",
      shell: !npmEntrypoint && process.platform === "win32" && command === "npm"
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      commandFailure = result.status ?? 1;
      break;
    }
  }

  if (commandFailure === 0) {
    for (const path of mode.paths) {
      const generated = await readFile(path);
      if (!generated.equals(originals.get(path))) changed.push(path);
    }
  }
} finally {
  for (const [path, contents] of originals) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }
}

if (commandFailure !== 0) process.exit(commandFailure);
if (changed.length > 0) {
  console.error(`Generated artifacts are stale:\n${changed.map((path) => `- ${path}`).join("\n")}`);
  process.exit(1);
}
console.log(`Generated ${modeName} artifacts match the checked-in files; the worktree was restored.`);
