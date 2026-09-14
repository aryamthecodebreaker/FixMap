// The first thing that went wrong in the original dogfooding session, and the least
// interesting: `npx @aryam/fixmap@0.7.3` ran 0.3.1. A stale global install shadows the
// version npx was asked for, so `verify` "did not exist" in a release that shipped it, and
// the time went into doubting the feature rather than the install (#103).
//
// The README documents the workaround now, but documentation only helps someone who
// already suspects the install. This command is for the person who does not.

import { exec as execWithShell, execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const shellExec = promisify(execWithShell);

export type DoctorFinding = {
  label: string;
  value: string;
  ok: boolean;
  advice?: string;
};

export type DoctorReport = {
  findings: DoctorFinding[];
  healthy: boolean;
};

export type DoctorDependencies = {
  readVersion?: () => string;
  resolveBinary?: (name: string) => Promise<string | undefined>;
  resolveBinaries?: (name: string) => Promise<string[]>;
  globalVersion?: () => Promise<string | undefined>;
  projectVersion?: () => Promise<{ version: string; path: string } | undefined>;
  nodeVersion?: () => string;
  modulePath?: () => string;
  requestedPackage?: () => string | undefined;
};

export async function runDoctorChecks(dependencies: DoctorDependencies = {}): Promise<DoctorReport> {
  const readVersion = dependencies.readVersion ?? defaultReadVersion;
  const modulePath = dependencies.modulePath ?? (() => fileURLToPath(import.meta.url));
  const nodeVersion = dependencies.nodeVersion ?? (() => process.versions.node);

  const findings: DoctorFinding[] = [];
  const runningVersion = readVersion();

  findings.push({ label: "Running version", value: runningVersion, ok: true });
  findings.push({ label: "Resolved from", value: modulePath(), ok: true });

  const requestedPackage = (dependencies.requestedPackage ?? (() => process.env.npm_config_package))();
  const requestedVersion = exactRequestedVersion(requestedPackage);
  if (requestedVersion && requestedVersion !== runningVersion) {
    findings.push({
      label: "Requested package",
      value: `${requestedVersion} (this process is ${runningVersion})`,
      ok: false,
      advice:
        `npm requested @aryam/fixmap@${requestedVersion} but ran ${runningVersion}, usually because a local ` +
        "or ancestor node_modules install shadowed it. Update or remove that install, or use the " +
        "isolated-prefix command in the README."
    });
  } else if (requestedVersion) {
    findings.push({ label: "Requested package", value: `${requestedVersion} (matches)`, ok: true });
  }

  const resolvedBinaries = dependencies.resolveBinaries
    ? await dependencies.resolveBinaries("fixmap")
    : dependencies.resolveBinary
      ? [await dependencies.resolveBinary("fixmap")].filter((entry): entry is string => Boolean(entry))
      : await resolveBinaries("fixmap");
  const binaries = collapseEquivalentWindowsShims(resolvedBinaries);
  const globalVersion = await (dependencies.globalVersion ?? readGlobalVersion)();

  findings.push(binaries.length === 0
    ? {
      label: "fixmap on PATH",
      value: "not on PATH",
      ok: true,
      advice: "This npx-only setup is valid. Run `npm install --global @aryam/fixmap` only if you want a persistent fixmap command."
    }
    : binaries.length === 1
      ? { label: "fixmap on PATH", value: binaries[0]!, ok: true }
      : {
        label: "fixmap on PATH",
        value: binaries.join("; "),
        ok: false,
        advice: "Multiple FixMap binaries are on PATH. Remove or reorder stale entries so one installation wins consistently."
      });

  const project = await (dependencies.projectVersion ?? (() => readProjectVersion(process.cwd())))();
  if (project && project.version !== runningVersion) {
    findings.push({
      label: "Project install",
      value: `${project.version} at ${project.path} (this process is ${runningVersion})`,
      ok: false,
      advice: "Update or remove the project-local @aryam/fixmap dependency so it cannot shadow the requested version."
    });
  } else if (project) {
    findings.push({ label: "Project install", value: `${project.version} at ${project.path} (matches)`, ok: true });
  } else {
    findings.push({ label: "Project install", value: "none", ok: true });
  }

  // The finding that matters. A global install at a different version than the one this
  // process is running means whichever the shell picks is a coin toss the user did not
  // know they were making.
  if (globalVersion && globalVersion !== runningVersion) {
    findings.push({
      label: "Global install",
      value: `${globalVersion} (this process is ${runningVersion})`,
      ok: false,
      advice:
        "A globally installed fixmap shadows the version npx was asked for. " +
        "Run `npm uninstall -g @aryam/fixmap` or update the global installation. " +
        "For a clean pinned run, use the isolated-prefix command in the README."
    });
  } else if (globalVersion) {
    findings.push({ label: "Global install", value: `${globalVersion} (matches)`, ok: true });
  } else {
    findings.push({ label: "Global install", value: "none", ok: true });
  }

  const node = nodeVersion();
  const nodeOk = satisfiesEngine(node);
  findings.push({
    label: "Node version",
    value: node,
    ok: nodeOk,
    ...(nodeOk ? {} : { advice: "FixMap requires Node 20.11 or newer." })
  });

  return { findings, healthy: findings.every((finding) => finding.ok) };
}

function exactRequestedVersion(packageSpec: string | undefined): string | undefined {
  const match = packageSpec?.match(
    /^@aryam\/fixmap@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/
  );
  return match?.[1];
}

export function renderDoctorReport(report: DoctorReport): string {
  const lines = ["# FixMap Doctor", ""];

  for (const finding of report.findings) {
    lines.push(`- ${finding.ok ? "ok" : "PROBLEM"}  ${finding.label}: ${finding.value}`);
    if (finding.advice) {
      lines.push(`    ${finding.advice}`);
    }
  }

  lines.push(
    "",
    report.healthy
      ? "No install problems detected."
      : "Fix the problems above; FixMap may otherwise run a different version than you asked for."
  );

  return `${lines.join("\n")}\n`;
}

function satisfiesEngine(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major > 20 || (major === 20 && minor >= 11);
}

async function resolveBinaries(name: string): Promise<string[]> {
  const command = process.platform === "win32" ? "where" : "which";
  const args = process.platform === "win32" ? [name] : ["-a", name];
  try {
    const { stdout } = await exec(command, args);
    return [...new Set(stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

export function collapseEquivalentWindowsShims(paths: string[]): string[] {
  const installations = new Map<string, string>();
  for (const path of paths) {
    const normalized = path.trim().replace(/\\/g, "/");
    if (!normalized) continue;
    const key = normalized.replace(/\.(?:cmd|ps1)$/i, "").toLowerCase();
    if (!installations.has(key)) installations.set(key, path.trim());
  }
  return [...installations.values()];
}

async function readProjectVersion(start: string): Promise<{ version: string; path: string } | undefined> {
  let current = resolve(start);
  const root = parse(current).root;
  while (true) {
    const path = join(current, "node_modules", "@aryam", "fixmap", "package.json");
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as { version?: unknown };
      if (typeof parsed.version === "string" && parsed.version.trim()) return { version: parsed.version, path };
    } catch { /* Walk to the parent. */ }
    if (current === root) return undefined;
    current = dirname(current);
  }
}

async function readGlobalVersion(): Promise<string | undefined> {
  try {
    // npm is a .cmd shim on Windows, which Node 24 refuses to run through execFile without
    // a shell. A fixed command string through `exec` is the form that works on both
    // platforms without the argument-concatenation deprecation; nothing here is
    // user-supplied, so there is nothing to escape.
    const { stdout } = await shellExec("npm ls -g --depth=0 --json @aryam/fixmap");
    const parsed = JSON.parse(stdout) as { dependencies?: Record<string, { version?: string }> };
    return parsed.dependencies?.["@aryam/fixmap"]?.version;
  } catch {
    // npm missing, or the package is simply not installed globally. Both mean "no shadow".
    return undefined;
  }
}

function defaultReadVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")
  ) as { version: string };
  return packageJson.version;
}
