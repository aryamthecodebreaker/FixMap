import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { buildSandboxInvocation, runSandbox, type SandboxProcessAdapter, type SandboxRequest } from "../src/sandbox.js";

const image = `registry.example/fixmap-test@sha256:${"a".repeat(64)}`;

function request(overrides: Partial<SandboxRequest> = {}): SandboxRequest {
  return {
    executionId: "auth-tests-1",
    repoRoot: resolve("workspace", "repo"),
    image,
    command: "npm test -- auth",
    declaredCommands: ["npm test -- auth", "npm run typecheck"],
    consent: "execute-declared-command",
    ...overrides
  };
}

describe("sandbox execution", () => {
  it("builds a pinned, local, network-off, read-only, limited Docker invocation", () => {
    const invocation = buildSandboxInvocation(request());
    expect(invocation.executable).toBe("docker");
    expect(invocation.args.slice(0, 3)).toEqual(["--context", "default", "run"]);
    expect(invocation.args).toEqual(expect.arrayContaining([
      "--pull", "never", "--network", "none", "--read-only", "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges:true", "--user", "65534:65534",
      "--pids-limit", "256", "--cpus", "1", "--memory", "1024m",
      "--entrypoint", "/bin/sh", image, "-lc", "npm test -- auth"
    ]));
    expect(invocation.args.find((entry) => entry.startsWith("type=bind"))).toContain("target=/workspace,readonly");
    expect(invocation.args).not.toContain("--env");
    expect(invocation.policy).toEqual({
      sourceReadOnly: true,
      rootFilesystemReadOnly: true,
      network: "none",
      inheritedContainerEnvironment: false,
      capabilitiesDropped: "ALL",
      noNewPrivileges: true,
      user: "65534:65534",
      pull: "never"
    });
  });

  it("requires exact declared command consent, digest pinning, and separate network consent", () => {
    expect(() => buildSandboxInvocation(request({ command: "npm test -- other" }))).toThrow("exactly match");
    expect(() => buildSandboxInvocation(request({ image: "node:latest" }))).toThrow("pinned by sha256");
    expect(() => buildSandboxInvocation(request({ image: `--help@sha256:${"a".repeat(64)}` }))).toThrow("pinned by sha256");
    expect(() => buildSandboxInvocation(request({ consent: undefined as never }))).toThrow("explicit");
    expect(() => buildSandboxInvocation(request({ network: { enabled: true } }))).toThrow("separate");
    expect(buildSandboxInvocation(request({
      network: { enabled: true, consent: "allow-sandbox-network" }
    })).policy.network).toBe("bridge");
  });

  it("maps isolated adapter results without treating failures or unavailability as passes", async () => {
    const passing: SandboxProcessAdapter = async () => ({ reason: "exit", exitCode: 0, stdout: "ok", stderr: "" });
    const failing: SandboxProcessAdapter = async () => ({ reason: "exit", exitCode: 2, stdout: "", stderr: "failed" });
    const unavailable: SandboxProcessAdapter = async () => ({ reason: "exit", exitCode: 125, stdout: "", stderr: "image missing" });
    expect((await runSandbox(request(), passing)).status).toBe("passed");
    expect((await runSandbox(request(), failing)).status).toBe("failed");
    expect((await runSandbox(request(), unavailable)).status).toBe("unavailable");
  });

  it("preserves timeout/output-limit states and bounds captured output", async () => {
    const timedOut: SandboxProcessAdapter = async () => ({ reason: "timeout", exitCode: null, stdout: "partial", stderr: "" });
    const excessive: SandboxProcessAdapter = async () => ({
      reason: "output-limit", exitCode: null, stdout: "x".repeat(4_000), stderr: "y".repeat(4_000)
    });
    const timeout = await runSandbox(request(), timedOut);
    const output = await runSandbox(request({ limits: { outputBytes: 1_024 } }), excessive);
    expect(timeout.status).toBe("timeout");
    expect(output.status).toBe("crashed");
    expect(output.outputTruncated).toBe(true);
    expect(Buffer.byteLength(output.stdout) + Buffer.byteLength(output.stderr)).toBeLessThanOrEqual(1_024);

    const unicode: SandboxProcessAdapter = async () => ({ reason: "output-limit", exitCode: null, stdout: "🙂".repeat(400), stderr: "" });
    const unicodeOutput = await runSandbox(request({ limits: { outputBytes: 1_025 } }), unicode);
    expect(Buffer.byteLength(unicodeOutput.stdout)).toBeLessThanOrEqual(1_025);
    expect(unicodeOutput.stdout).not.toContain("�");
  });

  it("contains adapter errors as unavailable evidence", async () => {
    const broken: SandboxProcessAdapter = async () => { throw new Error("Docker is unavailable"); };
    const result = await runSandbox(request(), broken);
    expect(result).toMatchObject({ status: "unavailable", exitCode: null });
    expect(result.stderr).toContain("Docker is unavailable");
  });
});
