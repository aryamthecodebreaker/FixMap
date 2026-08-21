import { execFile, spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";

export type SandboxLimits = {
  timeoutMs: number;
  outputBytes: number;
  cpus: number;
  memoryMb: number;
  pids: number;
  tmpfsMb: number;
};

export type SandboxRequest = {
  executionId: string;
  repoRoot: string;
  image: string;
  command: string;
  declaredCommands: string[];
  consent: "execute-declared-command";
  network?: { enabled: boolean; consent?: "allow-sandbox-network" };
  limits?: Partial<SandboxLimits>;
};

export type SandboxInvocation = {
  executable: "docker";
  args: string[];
  containerName: string;
  policy: {
    sourceReadOnly: true;
    rootFilesystemReadOnly: true;
    network: "none" | "bridge";
    inheritedContainerEnvironment: false;
    capabilitiesDropped: "ALL";
    noNewPrivileges: true;
    user: "65534:65534";
    pull: "never";
  };
  limits: SandboxLimits;
};

export type SandboxRawResult = {
  reason: "exit" | "timeout" | "output-limit" | "unavailable";
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type SandboxResult = {
  sandboxResultVersion: 1;
  executionId: string;
  image: string;
  command: string;
  status: "passed" | "failed" | "timeout" | "crashed" | "unavailable";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
  policy: SandboxInvocation["policy"];
  limits: SandboxLimits;
};

export type SandboxProcessAdapter = (invocation: SandboxInvocation) => Promise<SandboxRawResult>;

const exec = promisify(execFile);
const EXECUTION_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const PINNED_IMAGE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,399}@sha256:[a-f0-9]{64}$/i;
const DEFAULT_LIMITS: SandboxLimits = {
  timeoutMs: 5 * 60_000,
  outputBytes: 1_000_000,
  cpus: 1,
  memoryMb: 1_024,
  pids: 256,
  tmpfsMb: 256
};

export function buildSandboxInvocation(request: SandboxRequest): SandboxInvocation {
  if (!request || !EXECUTION_ID.test(request.executionId) || request.consent !== "execute-declared-command") {
    throw new Error("Sandbox execution requires a valid ID and explicit execute-declared-command consent.");
  }
  if (!isAbsolute(request.repoRoot) || /[\0\r\n,]/.test(request.repoRoot)) {
    throw new Error("Sandbox repository root must be an absolute path without control characters or commas.");
  }
  if (!PINNED_IMAGE.test(request.image)) throw new Error("Sandbox image must be pinned by sha256 digest.");
  if (!validCommand(request.command) || !Array.isArray(request.declaredCommands) || request.declaredCommands.length > 100 ||
    !request.declaredCommands.every(validCommand) || !request.declaredCommands.includes(request.command)) {
    throw new Error("Sandbox command must exactly match a bounded declared command.");
  }
  const networkEnabled = request.network?.enabled === true;
  if (networkEnabled && request.network?.consent !== "allow-sandbox-network") {
    throw new Error("Sandbox network access requires separate allow-sandbox-network consent.");
  }
  const limits = validateLimits(request.limits);
  const repoRoot = resolve(request.repoRoot);
  const containerName = `fixmap-${request.executionId}-${stableHash(`${repoRoot}\0${request.command}`).slice(0, 10)}`;
  const network = networkEnabled ? "bridge" : "none";
  const args = [
    "--context", "default",
    "run", "--rm", "--name", containerName,
    "--pull", "never",
    "--network", network,
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--user", "65534:65534",
    "--pids-limit", String(limits.pids),
    "--cpus", String(limits.cpus),
    "--memory", `${limits.memoryMb}m`,
    "--ipc", "none",
    "--ulimit", "nofile=1024:1024",
    "--tmpfs", `/tmp:rw,noexec,nosuid,nodev,size=${limits.tmpfsMb}m`,
    "--mount", `type=bind,source=${repoRoot},target=/workspace,readonly`,
    "--workdir", "/workspace",
    "--entrypoint", "/bin/sh",
    request.image,
    "-lc", request.command
  ];
  return {
    executable: "docker",
    args,
    containerName,
    policy: {
      sourceReadOnly: true,
      rootFilesystemReadOnly: true,
      network,
      inheritedContainerEnvironment: false,
      capabilitiesDropped: "ALL",
      noNewPrivileges: true,
      user: "65534:65534",
      pull: "never"
    },
    limits
  };
}

export async function runSandbox(
  request: SandboxRequest,
  adapter: SandboxProcessAdapter = runDockerProcess
): Promise<SandboxResult> {
  const invocation = buildSandboxInvocation(request);
  let raw: SandboxRawResult;
  try {
    raw = await adapter(invocation);
  } catch (error) {
    raw = { reason: "unavailable", exitCode: null, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
  }
  const stdout = truncateUtf8(raw.stdout, invocation.limits.outputBytes);
  const stderrBudget = Math.max(0, invocation.limits.outputBytes - Buffer.byteLength(stdout.value));
  const stderr = truncateUtf8(raw.stderr, stderrBudget);
  const status = raw.reason === "timeout" ? "timeout"
    : raw.reason === "unavailable" ? "unavailable"
      : raw.reason === "output-limit" ? "crashed"
        : raw.exitCode === 125 ? "unavailable"
          : raw.exitCode === 0 ? "passed" : raw.exitCode === null ? "crashed" : "failed";
  return {
    sandboxResultVersion: 1,
    executionId: request.executionId,
    image: request.image,
    command: request.command,
    status,
    exitCode: raw.exitCode,
    stdout: stdout.value,
    stderr: stderr.value,
    outputTruncated: raw.reason === "output-limit" || stdout.truncated || stderr.truncated,
    policy: invocation.policy,
    limits: invocation.limits
  };
}

async function runDockerProcess(invocation: SandboxInvocation): Promise<SandboxRawResult> {
  return new Promise((resolveResult) => {
    const child = spawn(invocation.executable, invocation.args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: minimalDockerEnvironment()
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let reason: SandboxRawResult["reason"] = "exit";
    let settled = false;
    const finish = async (exitCode: number | null): Promise<void> => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (reason !== "exit") await cleanupContainer(invocation.containerName);
      resolveResult({ reason, exitCode, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    };
    const capture = (target: Buffer[]) => (chunk: Buffer): void => {
      const remaining = invocation.limits.outputBytes - bytes;
      if (remaining > 0) target.push(chunk.subarray(0, remaining));
      bytes += chunk.length;
      if (bytes > invocation.limits.outputBytes && reason === "exit") {
        reason = "output-limit";
        child.kill();
        void finish(null);
      }
    };
    child.stdout.on("data", capture(stdout));
    child.stderr.on("data", capture(stderr));
    child.once("error", (error) => {
      reason = "unavailable";
      stderr.push(Buffer.from(error.message));
      void finish(null);
    });
    child.once("close", (code) => { void finish(code); });
    const timer = setTimeout(() => {
      reason = "timeout";
      child.kill();
      void finish(null);
    }, invocation.limits.timeoutMs);
  });
}

async function cleanupContainer(name: string): Promise<void> {
  try {
    await exec("docker", ["--context", "default", "rm", "--force", name], { windowsHide: true, timeout: 15_000, env: minimalDockerEnvironment() });
  } catch {
    // Best effort: the attached `docker run --rm` normally removes the container itself.
  }
}

function minimalDockerEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "Path", "PATHEXT", "SYSTEMROOT", "SystemRoot", "TEMP", "TMP", "DOCKER_CONFIG"]) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  return environment;
}

function validateLimits(input: Partial<SandboxLimits> | undefined): SandboxLimits {
  const limits = { ...DEFAULT_LIMITS, ...(input ?? {}) };
  if (!integerBetween(limits.timeoutMs, 1_000, 10 * 60_000) || !integerBetween(limits.outputBytes, 1_024, 10_000_000) ||
    typeof limits.cpus !== "number" || !Number.isFinite(limits.cpus) || limits.cpus < 0.1 || limits.cpus > 8 ||
    !integerBetween(limits.memoryMb, 64, 16_384) || !integerBetween(limits.pids, 16, 1_024) || !integerBetween(limits.tmpfsMb, 16, 4_096)) {
    throw new Error("Sandbox resource limits are outside supported bounds.");
  }
  return limits;
}
function validCommand(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 2_000 && !/[\0\r\n]/.test(value); }
function integerBetween(value: number, minimum: number, maximum: number): boolean { return Number.isSafeInteger(value) && value >= minimum && value <= maximum; }
function truncateUtf8(value: string, maximum: number): { value: string; truncated: boolean } {
  const bytes = Buffer.from(value);
  if (bytes.length <= maximum) return { value, truncated: false };
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let end = maximum; end >= Math.max(0, maximum - 4); end -= 1) {
    try {
      return { value: decoder.decode(bytes.subarray(0, end)), truncated: true };
    } catch {
      // Try the previous UTF-8 boundary.
    }
  }
  return { value: "", truncated: true };
}
function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) { hash ^= BigInt(byte); hash = BigInt.asUintN(64, hash * 0x100000001b3n); }
  return hash.toString(16).padStart(16, "0");
}
