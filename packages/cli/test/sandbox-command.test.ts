import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runSandboxCommand } from "../src/sandbox-command.js";

const image = `registry.example/fixmap-test@sha256:${"a".repeat(64)}`;
function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, stdoutFn: (text: string) => stdout.push(text), stderrFn: (text: string) => stderr.push(text) };
}
async function request(root: string, network = false): Promise<string> {
  const path = join(root, "sandbox.json");
  await writeFile(path, JSON.stringify({
    sandboxRequestVersion: 1,
    executionId: "auth-tests-1",
    repoRoot: root,
    image,
    command: "npm test -- auth",
    declaredCommands: ["npm test -- auth", "npm run typecheck"],
    network: { enabled: network }
  }), "utf8");
  return path;
}

describe("sandbox command", () => {
  it("requires command-line execution consent before reading or running a request", async () => {
    const io = capture();
    const execute = vi.fn();
    expect(await runSandboxCommand(["--request", "missing.json"], { stdout: io.stdoutFn, stderr: io.stderrFn, execute })).toBe(1);
    expect(io.stderr.join("")).toContain("explicit --execute-declared-command consent");
    expect(execute).not.toHaveBeenCalled();
  });

  it("runs exactly the reviewed command with network off and returns pass status", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-sandbox-cli-"));
    const path = await request(root);
    const io = capture();
    const execute = vi.fn(async (value) => ({
      sandboxResultVersion: 1 as const,
      executionId: value.executionId,
      image: value.image,
      command: value.command,
      status: "passed" as const,
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      outputTruncated: false,
      policy: { sourceReadOnly: true as const, rootFilesystemReadOnly: true as const, network: "none" as const,
        inheritedContainerEnvironment: false as const, capabilitiesDropped: "ALL" as const, noNewPrivileges: true as const,
        user: "65534:65534" as const, pull: "never" as const },
      limits: { timeoutMs: 300000, outputBytes: 1000000, cpus: 1, memoryMb: 1024, pids: 256, tmpfsMb: 256 }
    }));

    expect(await runSandboxCommand(["--request", path, "--execute-declared-command", "--format", "json"], {
      stdout: io.stdoutFn, stderr: io.stderrFn, execute
    })).toBe(0);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      command: "npm test -- auth",
      declaredCommands: ["npm test -- auth", "npm run typecheck"],
      consent: "execute-declared-command",
      network: { enabled: false }
    }));
    expect(JSON.parse(io.stdout.join("")).status).toBe("passed");
  });

  it("requires separate network consent and rejects consent embedded in the file", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-sandbox-network-"));
    const path = await request(root, true);
    const io = capture();
    const execute = vi.fn();
    expect(await runSandboxCommand(["--request", path, "--execute-declared-command"], {
      stdout: io.stdoutFn, stderr: io.stderrFn, execute
    })).toBe(1);
    expect(io.stderr.join("")).toContain("separate --allow-sandbox-network consent");
    expect(execute).not.toHaveBeenCalled();

    const embedded = JSON.parse(await readFile(path, "utf8"));
    embedded.consent = "execute-declared-command";
    await writeFile(path, JSON.stringify(embedded), "utf8");
    const embeddedIo = capture();
    expect(await runSandboxCommand(["--request", path, "--execute-declared-command", "--allow-sandbox-network"], {
      stdout: embeddedIo.stdoutFn, stderr: embeddedIo.stderrFn, execute
    })).toBe(1);
    expect(embeddedIo.stderr.join("")).toContain("consent must be supplied only on the command line");
  });
});
