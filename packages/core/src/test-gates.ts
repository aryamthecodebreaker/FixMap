import type { RepoFile, ScanDiagnostic } from "./types.js";

const CONDITIONAL_GATE_PATTERN = /\.(?:skipIf|runIf)\s*\(/;
const UNCONDITIONAL_GATE_PATTERNS = [
  /\b(?:it|test|describe|context)\.(?:skip|todo)\s*\(/,
  /\b(?:xit|xtest|xdescribe|xcontext)\s*\(/,
  /\bthis\.skip\s*\(/,
  /@(?:pytest\.mark\.(?:skip|skipif)|unittest\.skip(?:If|Unless)?)\b/,
  /\bt\.Skip(?:f|Now)?\s*\(/,
  /#\[ignore(?:\s*=|\s*\])/
];
const ENV_NAME_PATTERNS = [/process\.env\.([A-Z][A-Z0-9_]*)/g, /process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g];

export function findGatedTestDiagnostics(files: RepoFile[], routedTestPaths: string[]): ScanDiagnostic[] {
  const routed = new Set(routedTestPaths);
  const diagnostics: ScanDiagnostic[] = [];

  for (const file of files) {
    const conditional = CONDITIONAL_GATE_PATTERN.test(file.textSample);
    const unconditional = UNCONDITIONAL_GATE_PATTERNS.some((pattern) => pattern.test(file.textSample));
    if (!file.isTest || !routed.has(file.path) || (!conditional && !unconditional)) {
      continue;
    }

    diagnostics.push({
      code: "gated-test-skipped",
      severity: "warning",
      message: unconditional
        ? `${file.path} contains skipped or ignored tests; the suggested test command will not exercise them until the skip is removed.`
        : gateMessage(file.path, extractEnvNames(file.textSample))
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
