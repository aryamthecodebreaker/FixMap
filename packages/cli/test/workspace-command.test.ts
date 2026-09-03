import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli-runner.js";
import { runWorkspaceCommand } from "../src/workspace-command.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50
  })));
});

function output() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (text: string) => stdout.push(text), stderr: (text: string) => stderr.push(text) } };
}

async function fixture(): Promise<{ root: string; config: string }> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-workspace-command-"));
  roots.push(root);
  await mkdir(join(root, "auth", "src"), { recursive: true });
  await mkdir(join(root, "payments", "src"), { recursive: true });
  await writeFile(join(root, "auth", "package.json"), JSON.stringify({
    name: "@acme/auth",
    version: "2.4.0"
  }));
  await writeFile(join(root, "auth", "src", "index.ts"), "export function authenticate() { return true; }\n");
  await writeFile(join(root, "payments", "package.json"), JSON.stringify({
    name: "@acme/payments",
    version: "5.0.0",
    dependencies: { "@acme/auth": "^2.4.0" }
  }));
  await writeFile(join(root, "payments", "src", "checkout.ts"), "import { authenticate } from '@acme/auth';\nexport const checkout = authenticate;\n");
  const config = join(root, "workspace.json");
  await writeFile(config, JSON.stringify({
    workspaceConfigVersion: 1,
    workspace: "acme",
    repositories: [
      { id: "auth", path: "auth" },
      { id: "payments", path: "payments" }
    ]
  }));
  return { root, config };
}

describe("fixmap workspace", () => {
  it("maps package versions and downstream impact across local repositories", async () => {
    const { config } = await fixture();
    const capture = output();
    expect(await runWorkspaceCommand([
      "--config", config, "--seed", "auth", "--format", "json", "--no-cache"
    ], capture.io)).toBe(0);

    const report = JSON.parse(capture.stdout.join(""));
    expect(report).toMatchObject({ workspaceVersion: 1, workspace: "acme" });
    expect(report.packages).toContainEqual(expect.objectContaining({
      repository: "auth", ecosystem: "node", name: "@acme/auth", version: "2.4.0"
    }));
    expect(report.dependencies).toContainEqual(expect.objectContaining({
      consumerRepository: "payments",
      providerRepository: "auth",
      package: "@acme/auth",
      requestedVersion: "^2.4.0"
    }));
    expect(report.impact).toMatchObject({
      seeds: ["auth"],
      repositories: [expect.objectContaining({ repository: "payments", distance: 1 })]
    });
    expect(capture.stderr).toEqual([]);
  });

  it("produces deterministic output when concurrent scan completion order changes", async () => {
    const { config } = await fixture();
    const first = output();
    const second = output();
    expect(await runWorkspaceCommand(["--config", config, "--seed=auth", "--format=json", "--no-cache"], first.io)).toBe(0);
    expect(await runWorkspaceCommand(["--config", config, "--seed=auth", "--format=json", "--no-cache"], second.io)).toBe(0);
    expect(second.stdout.join("")).toBe(first.stdout.join(""));
  });

  it("dispatches through the public CLI and renders evidence in Markdown", async () => {
    const { config } = await fixture();
    const capture = output();
    expect(await runCli(["workspace", "--config", config, "--seed", "auth", "--no-cache"], capture.io)).toBe(0);
    expect(capture.stdout.join("")).toContain("# FixMap workspace impact");
    expect(capture.stdout.join("")).toContain("`payments` depends on `@acme/auth` from `auth`");
    expect(capture.stdout.join("")).toContain("distance 1: `payments`");
  });

  it("rejects remote paths, duplicate roots, and unknown impact seeds", async () => {
    const { root, config } = await fixture();
    const remoteConfig = join(root, "remote.json");
    await writeFile(remoteConfig, JSON.stringify({
      workspaceConfigVersion: 1,
      workspace: "acme",
      repositories: [{ id: "auth", path: "https://github.com/acme/auth" }]
    }));
    const remote = output();
    expect(await runWorkspaceCommand(["--config", remoteConfig], remote.io)).toBe(1);
    expect(remote.stderr.join("")).toContain("local path, not a URL");

    const duplicateConfig = join(root, "duplicate.json");
    await writeFile(duplicateConfig, JSON.stringify({
      workspaceConfigVersion: 1,
      workspace: "acme",
      repositories: [{ id: "auth", path: "auth" }, { id: "alias", path: "auth" }]
    }));
    const duplicate = output();
    expect(await runWorkspaceCommand(["--config", duplicateConfig], duplicate.io)).toBe(1);
    expect(duplicate.stderr.join("")).toContain("resolve to the same checkout");

    const seed = output();
    expect(await runWorkspaceCommand(["--config", config, "--seed", "missing"], seed.io)).toBe(1);
    expect(seed.stderr.join("")).toContain("Unknown --seed repository ID");

    const before = await readFile(config, "utf8");
    const collision = output();
    expect(await runWorkspaceCommand(["--config", config, "--output", config], collision.io)).toBe(1);
    expect(collision.stderr.join("")).toContain("must not overwrite");
    expect(await readFile(config, "utf8")).toBe(before);
  });

  it("waits for every bounded scan worker to settle when one repository fails", async () => {
    const { config } = await fixture();
    let siblingFinished = false;
    const capture = output();
    const exitCode = await runWorkspaceCommand(["--config", config], {
      ...capture.io,
      scanRepository: async (input) => {
        if (input.repoRoot.endsWith("auth")) throw new Error("synthetic auth scan failure");
        await new Promise((resolve) => setTimeout(resolve, 25));
        siblingFinished = true;
        return {
          root: input.repoRoot,
          files: [{
            path: "index.ts",
            extension: ".ts",
            sizeBytes: 1,
            isTest: false,
            isSource: true,
            kind: "code",
            textSample: "x",
            textSampleComplete: true,
            contentFingerprint: "worktree:synthetic"
          }],
          packageScripts: [],
          changedFiles: [],
          diffText: "",
          packageManager: "npm",
          diagnostics: []
        };
      }
    });
    expect(exitCode).toBe(1);
    expect(capture.stderr.join("")).toContain("synthetic auth scan failure");
    expect(siblingFinished).toBe(true);
  });
});
