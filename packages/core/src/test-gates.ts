import type { RepoFile, ScanDiagnostic } from "./types.js";

const GATE_PATTERN = /\.(skipIf|runIf)\s*\(/;
const ENV_NAME_PATTERNS = [/process\.env\.([A-Z][A-Z0-9_]*)/g, /process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g];

export function findGatedTestDiagnostics(files: RepoFile[], routedTestPaths: string[]): ScanDiagnostic[] {
  const routed = new Set(routedTestPaths);
  const diagnostics: ScanDiagnostic[] = [];

  for (const file of files) {
    if (!file.isTest || !routed.has(file.path) || !GATE_PATTERN.test(file.textSample)) {
      continue;
    }

    diagnostics.push({
      code: "gated-test-skipped",
      severity: "warning",
      message: gateMessage(file.path, extractEnvNames(file.textSample))
    });
  }

  return diagnostics;
}

function gateMessage(path: string, envNames: string[]): string {
  if (envNames.length === 0) {
    return `${path} contains conditionally skipped suites; verify the suggested test command actually exercises it.`;
  }

  const condition = envNames.length === 1 ? `${envNames[0]} is set` : `${envNames.join(", ")} are set`;
  return `${path} is skipped unless ${condition}; the suggested test command will not exercise it by default.`;
}

function extractEnvNames(textSample: string): string[] {
  const names = new Set<string>();

  for (const pattern of ENV_NAME_PATTERNS) {
    for (const match of textSample.matchAll(pattern)) {
      names.add(match[1] ?? "");
    }
  }

  names.delete("");
  return [...names].sort((a, b) => a.localeCompare(b));
}
